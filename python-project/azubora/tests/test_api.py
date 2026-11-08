"""HTTP-level tests of the JSON API used by the React frontend."""
import json
import os
from unittest import mock

from django.test import TestCase, override_settings

from azubora.models import (
    ApplicationMessage,
    AutoApplyConfig,
    BankTransferPayment,
    JobApplication,
    JobOffer,
    SmtpConfig,
    User,
    UserProfile,
)
from azubora.services import smtp as smtp_service
from azubora.services.applications import deliver_application
from azubora.services.authentication import hash_password

JOB = {
    'id': 'BA-10001-XYZ-S', 'externalId': 'BA-10001-XYZ-S', 'title': 'Fachinformatiker', 'company': 'ACME GmbH',
    'location': 'Berlin', 'postalCode': '10115', 'federalState': 'Berlin', 'category': 'IT & Software',
    'contractType': 'Berufsausbildung', 'workTime': 'Vollzeit', 'remote': False, 'salary': '1.000 €',
    'description': 'Beschreibung', 'requirements': 'Abitur', 'url': 'https://example.org/job',
    'publishedAt': '2026-11-01T10:00:00.000Z', 'contactEmail': None,
}


@override_settings(JWT_SECRET='x' * 40, OPENAI_API_KEY='', REDIS_URL='')
class ApiTestCase(TestCase):
    password = 'a-long-password'

    def setUp(self):
        from azubora.services import ratelimit

        ratelimit._memory.clear()
        self.user = User.objects.create(email='lea@example.de', name='Lea Schmidt',
                                        password_hash=hash_password(self.password))
        UserProfile.objects.create(user=self.user)
        self.client.post('/api/auth/login', {'email': self.user.email, 'password': self.password},
                         content_type='application/json')

    def api(self, method, path, body=None, **extra):
        payload = json.dumps(body) if body is not None else None
        response = getattr(self.client, method)(path, payload, content_type='application/json', **extra)
        return response, (response.json() if response['Content-Type'].startswith('application/json') else None)


class AuthTests(ApiTestCase):
    def test_register_me_logout(self):
        self.client.cookies.clear()
        response, data = self.api('post', '/api/auth/register',
                                  {'name': 'Max', 'email': 'MAX@example.de', 'password': 'long-enough-1'})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(data['user']['email'], 'max@example.de')
        self.assertIn('token', response.cookies)
        self.assertTrue(response.cookies['token']['httponly'])
        _, me = self.api('get', '/api/auth/me')
        self.assertEqual(me['user']['subscription']['planCode'], 'BASIC')
        self.assertTrue(me['user']['notificationConfig']['emailEnabled'])
        self.api('post', '/api/auth/logout')
        response, _ = self.api('get', '/api/auth/me')
        self.assertEqual(response.status_code, 401)

    def test_register_rejects_duplicates_and_short_passwords(self):
        self.assertEqual(self.api('post', '/api/auth/register', {'name': 'Lea', 'email': self.user.email,
                                                                 'password': 'long-enough-1'})[0].status_code, 409)
        self.assertEqual(self.api('post', '/api/auth/register', {'name': 'Lea', 'email': 'n@x.de',
                                                                 'password': 'short'})[0].status_code, 400)

    def test_login_is_rate_limited(self):
        self.client.cookies.clear()
        for _ in range(5):
            response, _ = self.api('post', '/api/auth/login', {'email': self.user.email, 'password': 'bad'})
            self.assertEqual(response.status_code, 401)
        response, _ = self.api('post', '/api/auth/login', {'email': self.user.email, 'password': self.password})
        self.assertEqual(response.status_code, 429)
        self.assertIn('Retry-After', response)

    def test_protected_pages_redirect_to_login(self):
        self.client.cookies.clear()
        response = self.client.get('/dashboard')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], '/login?next=%2Fdashboard')
        self.client.cookies['token'] = 'garbage'
        response = self.client.get('/settings')
        self.assertEqual(response['Location'], '/login')

    def test_cross_origin_writes_are_rejected(self):
        response, _ = self.api('put', '/api/profile', {'city': 'Köln'}, HTTP_ORIGIN='https://evil.example')
        self.assertEqual(response.status_code, 403)
        response, _ = self.api('put', '/api/profile', {'city': 'Köln'}, HTTP_ORIGIN='http://testserver')
        self.assertEqual(response.status_code, 200)

    def test_unknown_method_returns_405(self):
        response, _ = self.api('delete', '/api/dashboard')
        self.assertEqual(response.status_code, 405)


class ProfileTests(ApiTestCase):
    def test_profile_update_and_children(self):
        response, data = self.api('put', '/api/profile', {
            'name': 'Lea S.', 'city': ' Berlin ', 'languages': ['Deutsch (C1)', ' ', 'Englisch'],
            'remotePreference': True, 'autoSearchIntervalMins': 5,
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['profile']['city'], 'Berlin')
        self.assertEqual(json.loads(data['profile']['languages']), ['Deutsch (C1)', 'Englisch'])
        self.assertEqual(data['profile']['autoSearchIntervalMins'], 15)

        _, edu = self.api('post', '/api/profile/education', {'degree': 'Abitur', 'institution': 'Gymnasium'})
        _, skill = self.api('post', '/api/profile/skills', {'name': 'Python', 'level': 'Advanced'})
        _, profile = self.api('get', '/api/profile')
        self.assertEqual(profile['profile']['user']['name'], 'Lea S.')
        self.assertEqual([item['name'] for item in profile['profile']['skills']], ['Python'])
        self.assertEqual(self.api('delete', f"/api/profile/education?id={edu['education']['id']}")[0].status_code, 200)
        self.assertEqual(self.api('delete', f"/api/profile/education?id={edu['education']['id']}")[0].status_code, 404)
        self.assertEqual(self.api('delete', f"/api/profile/skills?id={skill['skill']['id']}")[0].status_code, 200)

    def test_cv_upload_validates_content(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        fake = SimpleUploadedFile('cv.pdf', b'not a pdf', content_type='application/pdf')
        response = self.client.post('/api/profile/upload-cv', {'file': fake})
        self.assertEqual(response.status_code, 400)

    def test_cv_upload_parses_and_stores_pdf(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        from azubora.services.documents import create_motivation_letter_pdf

        pdf = create_motivation_letter_pdf(
            applicant={'name': 'Lea Schmidt', 'email': 'lea@example.de'}, company={'name': 'Schule'},
            job_title='CV', motivation_letter='Kenntnisse: Python, Excel und Communication. 10115 Berlin.')
        response = self.client.post('/api/profile/upload-cv',
                                    {'file': SimpleUploadedFile('lebenslauf.pdf', pdf, 'application/pdf')})
        data = response.json()
        self.assertEqual(response.status_code, 200, data)
        self.assertIn('Python', [item['name'] for item in data['profile']['skills']])
        self.assertNotIn('cvFileData', data['profile'])
        stored = UserProfile.objects.get(user=self.user)
        self.assertEqual(bytes(stored.cv_file_data), pdf)
        self.assertEqual(stored.cv_file_url, f'database:{self.user.id}')
        self.assertEqual(self.api('delete', '/api/profile/upload-cv')[0].status_code, 200)
        stored.refresh_from_db()
        self.assertIsNone(stored.cv_file_data)


class OfferTests(ApiTestCase):
    def test_favorite_toggle_and_save_application(self):
        _, data = self.api('post', '/api/favorites', {'jobOfferId': JOB['id'], 'jobData': JOB})
        self.assertTrue(data['isFavorite'])
        _, data = self.api('post', '/api/favorites', {'jobOfferId': JOB['id'], 'jobData': JOB})
        self.assertFalse(data['isFavorite'])
        self.assertEqual(self.api('post', '/api/favorites', {'jobOfferId': 'evil'})[0].status_code, 400)

        response, data = self.api('post', '/api/applications', {'jobOfferId': JOB['id'], 'jobData': JOB})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['application']['status'], 'SAVED')
        _, listing = self.api('get', '/api/applications')
        application = listing['applications'][0]
        self.assertEqual(application['jobOffer']['externalId'], JOB['externalId'])
        self.assertIsNone(application['latestReply'])

        response, data = self.api('put', '/api/applications', {'id': application['id'], 'status': 'APPLIED'})
        self.assertIsNotNone(data['application']['appliedAt'])
        self.assertEqual(self.api('put', '/api/applications', {'id': application['id'],
                                                               'status': 'BOGUS'})[0].status_code, 400)
        _, dashboard = self.api('get', '/api/dashboard')
        self.assertEqual(dashboard['stats']['appliedJobs'], 1)
        self.assertEqual(len(dashboard['chartData']), 7)

    def test_ai_match_uses_fallback_without_openai(self):
        response, data = self.api('post', '/api/ai/match',
                                  {'customJobDescription': 'Wir suchen Teamfähigkeit und Python Kenntnisse.'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('matchScore', data['analysis'])

    def test_cover_letter_requires_openai(self):
        response, data = self.api('post', '/api/ai/cover-letter', {'jobTitle': 'Koch', 'companyName': 'Hotel'})
        self.assertEqual(response.status_code, 500)
        self.assertIn('OpenAI', data['error'])


class AutoApplySettingsTests(ApiTestCase):
    body = {'enabled': False, 'keywords': 'Fachinformatiker, Pflege, Fachinformatiker', 'cities': ['Berlin'],
            'scheduleDays': [1, 2, 3], 'scheduleStartMinute': 480, 'scheduleEndMinute': 900,
            'scheduleTimezone': 'Europe/Berlin', 'radiusKm': 500, 'minMatchScore': 70}

    def test_save_and_validate_schedule(self):
        _, data = self.api('get', '/api/settings/auto-apply')
        self.assertEqual(data['config']['keywords'], ['Ausbildung'])
        response, data = self.api('put', '/api/settings/auto-apply', self.body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data['config']['keywords'], ['Fachinformatiker', 'Pflege'])
        self.assertEqual(data['config']['radiusKm'], 200)
        self.assertEqual(data['config']['scheduleDays'], [1, 2, 3])
        self.assertEqual(self.api('put', '/api/settings/auto-apply',
                                  {**self.body, 'scheduleEndMinute': 100})[0].status_code, 400)
        self.assertEqual(self.api('put', '/api/settings/auto-apply',
                                  {**self.body, 'scheduleTimezone': 'Nope/Nope'})[0].status_code, 400)

    def test_enabling_requires_paid_plan_and_openai(self):
        response, _ = self.api('put', '/api/settings/auto-apply', {**self.body, 'enabled': True})
        self.assertEqual(response.status_code, 503)
        with override_settings(OPENAI_API_KEY='sk-test'):
            response, data = self.api('put', '/api/settings/auto-apply', {**self.body, 'enabled': True})
        self.assertEqual(response.status_code, 402)
        self.assertTrue(data['upgradeRequired'])


class SmtpSettingsTests(ApiTestCase):
    body = {'provider': 'custom', 'host': 'mail.example.org', 'port': 587, 'authUser': 'lea@example.org',
            'authPass': 'secret-pass', 'imapHost': 'imap.example.org'}

    def setUp(self):
        super().setUp()
        patcher = mock.patch('azubora.controllers.settings.test_smtp_connection',
                             return_value={'success': False, 'message': 'Authentification SMTP refusée.'})
        self.connection_test = patcher.start()
        self.addCleanup(patcher.stop)

    def test_saving_verifies_the_connection(self):
        self.connection_test.return_value = {'success': True, 'message': 'ok'}
        response, data = self.api('put', '/api/settings/smtp', self.body)
        self.assertEqual(response.status_code, 200, data)
        self.assertEqual(data['test'], {'success': True, 'message': 'ok'})
        self.assertTrue(data['smtp']['isTested'])
        self.assertIsNotNone(SmtpConfig.objects.get(user=self.user).last_tested_at)
        # Already verified and unchanged: no new login attempt.
        _, data = self.api('put', '/api/settings/smtp', {**self.body, 'authPass': smtp_service.MASKED_PASSWORD})
        self.assertIsNone(data['test'])
        self.assertTrue(data['smtp']['isTested'])
        self.assertEqual(self.connection_test.call_count, 1)

    def test_failed_verification_is_reported_and_keeps_bot_off(self):
        AutoApplyConfig.objects.create(user=self.user, enabled=True)
        _, data = self.api('put', '/api/settings/smtp', self.body)
        self.assertEqual(data['test'], {'success': False, 'message': 'Authentification SMTP refusée.'})
        self.assertFalse(data['smtp']['isTested'])
        self.assertFalse(AutoApplyConfig.objects.get().enabled)

    def test_password_is_masked_and_kept(self):
        body = self.body
        response, data = self.api('put', '/api/settings/smtp', body)
        self.assertEqual(response.status_code, 200, data)
        self.assertEqual(data['smtp']['authPass'], smtp_service.MASKED_PASSWORD)
        stored = SmtpConfig.objects.get(user=self.user)
        self.assertEqual(smtp_service.decrypt_string(stored.auth_pass_encrypted), 'secret-pass')
        self.api('put', '/api/settings/smtp', {**body, 'authPass': smtp_service.MASKED_PASSWORD})
        stored.refresh_from_db()
        self.assertEqual(smtp_service.decrypt_string(stored.auth_pass_encrypted), 'secret-pass')
        self.assertEqual(self.api('put', '/api/settings/smtp', {**body, 'imapHost': ''})[0].status_code, 400)


class PaymentTests(ApiTestCase):
    def test_credit_pack_request_and_admin_approval(self):
        response, data = self.api('post', '/api/subscription/payment', {'creditPack': 'CREDITS_500'})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(data['payment']['amountEur'], 8.99)
        self.assertTrue(data['payment']['reference'].startswith('AF-CREDITS_500-'))
        payment_id = data['payment']['id']
        _, data = self.api('put', '/api/subscription/payment', {'paymentId': payment_id, 'action': 'submitted'})
        self.assertEqual(data['payment']['status'], 'SUBMITTED')
        self.assertEqual(self.api('put', '/api/admin/payments', {'paymentId': payment_id,
                                                                 'action': 'approve'})[0].status_code, 403)

        User.objects.create(email='boss@example.de', name='Boss', role='ADMIN', password_hash=hash_password('admin-pass-123'))
        self.client.post('/api/auth/login', {'email': 'boss@example.de', 'password': 'admin-pass-123'},
                         content_type='application/json')
        response, data = self.api('put', '/api/admin/payments', {'paymentId': payment_id, 'action': 'approve'})
        self.assertEqual(response.status_code, 200, data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.ai_credit_balance, 500)
        self.assertEqual(self.api('put', '/api/admin/payments', {'paymentId': payment_id,
                                                                 'action': 'approve'})[0].status_code, 409)
        _, overview = self.api('get', '/api/admin/overview')
        self.assertEqual(overview['stats']['totalUsers'], 2)
        self.assertEqual(overview['bankPayments'][0]['status'], 'PAID')

    def test_subscription_approval_activates_plan(self):
        _, data = self.api('post', '/api/subscription/payment', {'plan': 'PLUS'})
        admin = User.objects.create(email='boss@example.de', name='Boss', role='ADMIN')
        from azubora.services.authentication import sign_jwt

        self.client.cookies['token'] = sign_jwt(admin)
        self.api('put', '/api/admin/payments', {'paymentId': data['payment']['id'], 'action': 'approve'})
        self.user.refresh_from_db()
        self.assertEqual((self.user.subscription_plan, self.user.subscription_requested_plan), ('PLUS', None))
        self.assertIsNotNone(self.user.subscription_current_period_end)
        self.assertEqual(BankTransferPayment.objects.get().status, 'PAID')


@override_settings(OPENAI_API_KEY='sk-test')
class DeliveryTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        profile = self.user.profile
        profile.cv_file_name = 'cv.pdf'
        profile.cv_file_url = f'database:{self.user.id}'
        profile.cv_file_data = b'%PDF-1.4 cv'
        profile.save()
        with mock.patch.dict(os.environ, {'SMTP_ENCRYPTION_KEY': 'k' * 40}):
            smtp_service._keys.cache_clear()
            SmtpConfig.objects.create(user=self.user, provider='gmail', host='smtp.gmail.com', auth_user='lea@gmail.com',
                                      auth_pass_encrypted=smtp_service.encrypt_string('app-pass'),
                                      from_email='lea@gmail.com', from_name='Lea', is_tested=True)
        self.addCleanup(smtp_service._keys.cache_clear)
        package = {'subject': 'Bewerbung', 'emailBody': 'Hallo', 'motivationLetter': 'Brief', 'candidateFactKeys': []}
        patches = [
            mock.patch('azubora.services.applications.resolve_application_email', side_effect=lambda job: {**job,
                       'contactEmail': 'hr@acme.de'}),
            mock.patch('azubora.services.applications.analyze_job_match', return_value={
                'matchScore': 80, 'matchingSkills': [], 'missingSkills': [], 'cvSuggestions': [], 'summary': ''}),
            mock.patch('azubora.services.applications.generate_application_package', return_value=package),
        ]
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_low_match_score_does_not_block_automated_sending(self):
        low = {'matchScore': 5, 'matchingSkills': [], 'missingSkills': [], 'cvSuggestions': [], 'summary': ''}
        with mock.patch('azubora.services.applications.analyze_job_match', return_value=low), \
                mock.patch('azubora.services.applications.send_email',
                           return_value={'success': True, 'messageId': '<x@gmail.com>'}):
            result = deliver_application(self.user.id, JOB, automated=True)
        self.assertTrue(result['success'], result)
        self.assertEqual(JobApplication.objects.get().match_score, 5)

    def test_successful_delivery_records_message_and_quota(self):
        with mock.patch('azubora.services.applications.send_email',
                        return_value={'success': True, 'messageId': '<id@gmail.com>'}) as send:
            result = deliver_application(self.user.id, JOB)
        self.assertTrue(result['success'], result)
        attachments = send.call_args.args[4]
        self.assertEqual([item.filename for item in attachments],
                         ['Lebenslauf_Lea_Schmidt.pdf', 'Motivationsschreiben_Lea_Schmidt.pdf'])
        application = JobApplication.objects.get()
        self.assertEqual((application.status, application.delivery_status), ('APPLIED', 'SENT'))
        self.assertEqual(ApplicationMessage.objects.get().message_id, '<id@gmail.com>')
        self.user.refresh_from_db()
        self.assertEqual(self.user.applications_used, 1)
        again = deliver_application(self.user.id, JOB)
        self.assertFalse(again['success'])
        self.user.refresh_from_db()
        self.assertEqual(self.user.applications_used, 1)

    def _send(self, job, automated=False):
        with mock.patch('azubora.services.applications.send_email',
                        return_value={'success': True, 'messageId': f"<{job['externalId']}@gmail.com>"}) as send:
            return deliver_application(self.user.id, job, automated=automated), send

    def test_reposted_offer_is_not_applied_to_twice(self):
        self.assertTrue(self._send(JOB)[0]['success'])
        repost = {**JOB, 'id': 'BA-99999-NEW-S', 'externalId': 'BA-99999-NEW-S',
                  'title': 'Ausbildung Fachinformatiker (m/w/d) 2027', 'company': 'ACME GmbH'}
        result, send = self._send(repost)
        self.assertEqual(result['reason'], 'DUPLICATE')
        send.assert_not_called()
        self.user.refresh_from_db()
        self.assertEqual(self.user.applications_used, 1)

    def test_bot_never_writes_twice_to_the_same_address(self):
        self.assertTrue(self._send(JOB, automated=True)[0]['success'])
        other_position = {**JOB, 'id': 'BA-77777-X-S', 'externalId': 'BA-77777-X-S', 'title': 'Industriekaufmann'}
        result, send = self._send(other_position, automated=True)
        self.assertEqual(result['reason'], 'DUPLICATE')
        send.assert_not_called()
        # A manual click for a different position at the same company is allowed.
        self.assertTrue(self._send(other_position)[0]['success'])

    def test_smtp_limit_failure_releases_quota_and_stops_bot(self):
        AutoApplyConfig.objects.create(user=self.user, enabled=True)
        failure = {'success': False, 'error': 'limit', 'haltAutoSending': True}
        with mock.patch('azubora.services.applications.send_email', return_value=failure):
            result = deliver_application(self.user.id, JOB, automated=True)
        self.assertTrue(result['haltAutoSending'])
        self.assertFalse(AutoApplyConfig.objects.get().enabled)
        self.assertEqual(JobApplication.objects.get().delivery_status, 'FAILED')
        self.user.refresh_from_db()
        self.assertEqual(self.user.applications_used, 0)
        self.assertEqual(JobOffer.objects.get().contact_email, 'hr@acme.de')


@override_settings(OPENAI_API_KEY='sk-test')
class AutoApplyRunTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user.unlimited_access = True
        self.user.save()
        self.config = AutoApplyConfig.objects.create(user=self.user, enabled=True, keywords='["Fachinformatiker"]')
        self.jobs = [{**JOB, 'id': f'BA-1000{i}-X', 'externalId': f'BA-1000{i}-X', 'title': f'Stelle {i}'}
                     for i in range(4)]
        page = {'jobs': self.jobs, 'total': len(self.jobs), 'source': 'live_api'}
        emails = {'BA-10001-X': 'hr@one.de', 'BA-10003-X': 'hr@three.de'}
        patches = [
            mock.patch('azubora.services.auto_apply.fetch_offers', return_value=page),
            mock.patch('azubora.services.auto_apply.resolve_application_email',
                       side_effect=lambda job: {**job, 'contactEmail': emails.get(job['externalId'])}),
        ]
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_offers_without_email_are_remembered_between_runs(self):
        from azubora.models import AutoApplySkippedOffer
        from azubora.services.auto_apply import run_auto_apply_for_user

        failed = {'success': False, 'error': 'SMTP indisponible'}
        with mock.patch('azubora.services.auto_apply.deliver_application', return_value=failed) as deliver:
            first = run_auto_apply_for_user(self.user.id, force=True)
        self.assertEqual((first['withoutEmail'], first['candidateAttempts']), (2, 2))
        self.assertTrue(all(call.kwargs['enriched'] for call in deliver.call_args_list))
        self.assertEqual(set(AutoApplySkippedOffer.objects.values_list('external_id', flat=True)),
                         {'BA-10000-X', 'BA-10002-X'})

        with mock.patch('azubora.services.auto_apply.deliver_application', return_value=failed) as deliver:
            second = run_auto_apply_for_user(self.user.id, force=True)
        self.assertEqual(second['previouslyRuledOut'], 2)
        self.assertEqual(deliver.call_count, 2)  # only the offers that have an address are retried

    def test_sends_regardless_of_match_score(self):
        sent = {'success': True, 'recipientEmail': 'hr@one.de', 'matchScore': 5}
        from azubora.services.auto_apply import run_auto_apply_for_user

        with mock.patch('azubora.services.auto_apply.deliver_application', return_value=sent):
            result = run_auto_apply_for_user(self.user.id, force=True)
        self.assertEqual(result['sent'], 1)
        self.assertEqual(result['deliveries'][0]['matchScore'], 5)

    def test_failed_letter_moves_on_to_the_next_offer(self):
        from azubora.services.ai import ApplicationMessageGenerationError
        from azubora.services.auto_apply import run_auto_apply_for_user

        outcomes = [ApplicationMessageGenerationError('Nachricht nicht zuverlässig'),
                    {'success': True, 'recipientEmail': 'hr@three.de', 'matchScore': 40}]
        with mock.patch('azubora.services.auto_apply.deliver_application', side_effect=outcomes):
            result = run_auto_apply_for_user(self.user.id, force=True)
        self.assertEqual((result['sent'], result['letterFailures'], result['success']), (1, 1, True))
        from azubora.models import AutoApplySkippedOffer

        self.assertEqual(AutoApplySkippedOffer.objects.get(external_id='BA-10001-X').reason, 'LETTER_FAILED')


    def test_duplicates_are_remembered_without_using_attempts(self):
        from azubora.models import AutoApplySkippedOffer
        from azubora.services.auto_apply import run_auto_apply_for_user

        duplicate = {'success': False, 'skipped': True, 'reason': 'DUPLICATE', 'error': 'déjà envoyé'}
        with mock.patch('azubora.services.auto_apply.deliver_application', return_value=duplicate):
            result = run_auto_apply_for_user(self.user.id, force=True)
        self.assertEqual((result['duplicatesAvoided'], result['candidateAttempts']), (2, 0))
        self.assertEqual(AutoApplySkippedOffer.objects.filter(reason='DUPLICATE').count(), 2)

    def test_openai_outage_stops_the_run_without_ruling_out_offers(self):
        from azubora.models import AutoApplySkippedOffer
        from azubora.services.ai import ApplicationMessageGenerationError
        from azubora.services.auto_apply import run_auto_apply_for_user

        outage = ApplicationMessageGenerationError('OpenAI injoignable', transient=True)
        with mock.patch('azubora.services.auto_apply.deliver_application', side_effect=outage) as deliver:
            result = run_auto_apply_for_user(self.user.id, force=True)
        self.assertEqual(deliver.call_count, 1)
        self.assertEqual((result['letterFailures'], result['candidateAttempts']), (0, 0))
        self.assertFalse(AutoApplySkippedOffer.objects.exclude(reason='NO_EMAIL').exists())

    def test_failed_lookups_are_retried_not_ruled_out(self):
        from azubora.models import AutoApplySkippedOffer
        from azubora.services.auto_apply import run_auto_apply_for_user

        with mock.patch('azubora.services.auto_apply.resolve_application_email',
                        side_effect=lambda job: {**job, 'lookupFailed': True}):
            result = run_auto_apply_for_user(self.user.id, force=True)
        self.assertEqual((result['lookupErrors'], result['withoutEmail']), (4, 0))
        self.assertFalse(AutoApplySkippedOffer.objects.exists())

@override_settings(OPENAI_API_KEY='sk-test')
class AllOffersModeTests(ApiTestCase):
    """Keyword "Ausbildung" and no city: walk the whole coverage plan, resuming where the last run stopped."""

    def setUp(self):
        super().setUp()
        self.user.unlimited_access = True
        self.user.save()
        self.config = AutoApplyConfig.objects.create(user=self.user, enabled=True, keywords='["Ausbildung"]')
        plan = {'total': 300, 'covered': 300, 'slices': [
            {'key': 'eintrittsdatum=A', 'filters': {'eintrittsdatum': 'A'}, 'count': 200},
            {'key': 'eintrittsdatum=B', 'filters': {'eintrittsdatum': 'B'}, 'count': 100},
        ]}

        def fake_fetch(*, filters=None, page=1, limit=100, **_):
            prefix = filters['eintrittsdatum']
            jobs = [{**JOB, 'id': f'BA-{prefix}{page}-{i:03d}', 'externalId': f'BA-{prefix}{page}-{i:03d}'}
                    for i in range(limit)]
            return {'jobs': jobs, 'total': 200 if prefix == 'A' else 100, 'source': 'live_api'}

        patches = [
            mock.patch('azubora.services.auto_apply.coverage_plan', return_value=plan),
            mock.patch('azubora.services.auto_apply.fetch_offers', side_effect=fake_fetch),
            # No offer has an address: every run reads as far as its look-up budget allows.
            mock.patch('azubora.services.auto_apply.resolve_application_email', side_effect=lambda job: job),
        ]
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_cursor_walks_all_slices_and_wraps(self):
        import json

        from azubora.services.auto_apply import is_all_offers_mode, run_auto_apply_for_user

        self.assertTrue(is_all_offers_mode(['Ausbildung'], ['']))
        self.assertFalse(is_all_offers_mode(['Fachinformatiker'], ['']))
        self.assertFalse(is_all_offers_mode(['Ausbildung'], ['Berlin']))

        cursors = []
        for _ in range(6):
            result = run_auto_apply_for_user(self.user.id, force=True)
            self.config.refresh_from_db()
            cursors.append(json.loads(self.config.scan_cursor))
        self.assertEqual(result['mode'], 'all_offers')
        # 60 look-ups per run over 100-offer pages; after the last slice the bot starts again at the top.
        self.assertEqual([(c['slice'][-1], c['page']) for c in cursors],
                         [('A', 1), ('A', 2), ('A', 2), ('B', 1), ('A', 1), ('A', 1)])
        self.assertEqual(result['progress']['slices'], 2)
        from azubora.models import AutoApplySkippedOffer

        self.assertEqual(AutoApplySkippedOffer.objects.count(), 300)
