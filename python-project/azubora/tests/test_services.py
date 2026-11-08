"""Unit tests for business rules: quotas, schedules, SMTP limits, documents, offers."""
import datetime as dt
import smtplib
from unittest import mock

from django.test import SimpleTestCase, TestCase

from azubora.models import User
from azubora.services import arbeitsagentur
from azubora.services.auto_apply_schedule import is_within_schedule, next_run_at, parse_schedule_days
from azubora.services.bank_transfer import add_one_month
from azubora.services.documents import (
    create_motivation_letter_pdf,
    extract_pdf_text,
    safe_applicant_file_name,
)
from azubora.services.smtp import _is_private_address, normalize_smtp_config
from azubora.services.smtp_limits import classify_smtp_error
from azubora.services.subscriptions import (
    SubscriptionLimitError,
    consume_ai_credits,
    get_subscription_snapshot,
    release_ai_credits,
    reserve_application_slot,
)

UTC = dt.timezone.utc


class SubscriptionTests(TestCase):
    def test_monthly_credits_then_purchased_balance_then_limit(self):
        user = User.objects.create(email='q@b.de', name='Q', ai_credits_used=49, ai_credit_balance=6)
        self.assertEqual(consume_ai_credits(user.id, 'MATCH'), 'PLAN')       # 50/50 used
        self.assertEqual(consume_ai_credits(user.id, 'CV_PARSE'), 'PURCHASED')  # 6 from balance
        with self.assertRaises(SubscriptionLimitError):
            consume_ai_credits(user.id, 'MATCH')
        release_ai_credits(user.id, 'CV_PARSE', 'PURCHASED')
        user.refresh_from_db()
        self.assertEqual((user.ai_credits_used, user.ai_credit_balance), (50, 6))

    def test_admin_is_unlimited(self):
        admin = User.objects.create(email='admin@b.de', name='A', role='ADMIN')
        self.assertIsNone(consume_ai_credits(admin.id, 'COVER_LETTER'))
        self.assertTrue(get_subscription_snapshot(admin.id)['unlimited'])

    def test_application_slots_respect_plan_limit(self):
        user = User.objects.create(email='s@b.de', name='S', applications_used=4)
        self.assertTrue(reserve_application_slot(user.id))
        with self.assertRaises(SubscriptionLimitError):
            reserve_application_slot(user.id)

    def test_expired_paid_plan_falls_back_to_basic(self):
        user = User.objects.create(email='e@b.de', name='E', subscription_plan='PRO',
                                   subscription_current_period_end=dt.datetime(2020, 1, 1, tzinfo=UTC))
        snapshot = get_subscription_snapshot(user.id)
        self.assertEqual(snapshot['planCode'], 'BASIC')

    def test_add_one_month_rolls_over_like_javascript(self):
        self.assertEqual(add_one_month(dt.datetime(2026, 1, 31, tzinfo=UTC)), dt.datetime(2026, 3, 3, tzinfo=UTC))
        self.assertEqual(add_one_month(dt.datetime(2026, 12, 15, tzinfo=UTC)), dt.datetime(2027, 1, 15, tzinfo=UTC))


class ScheduleTests(SimpleTestCase):
    schedule = {'scheduleDays': '[1,2,3,4,5]', 'scheduleStartMinute': 480, 'scheduleEndMinute': 900,
                'scheduleTimezone': 'Europe/Berlin'}

    def test_parse_days(self):
        self.assertEqual(parse_schedule_days('[5, 1, 1, 9, "x", 0]'), [0, 1, 5])
        self.assertEqual(parse_schedule_days('oops'), [])

    def test_window_uses_local_time(self):
        # Monday 2026-11-09 07:30 UTC = 08:30 in Berlin (CET).
        self.assertTrue(is_within_schedule(self.schedule, dt.datetime(2026, 11, 9, 7, 30, tzinfo=UTC)))
        self.assertFalse(is_within_schedule(self.schedule, dt.datetime(2026, 11, 9, 6, 30, tzinfo=UTC)))
        # Saturday
        self.assertFalse(is_within_schedule(self.schedule, dt.datetime(2026, 11, 14, 9, 0, tzinfo=UTC)))

    def test_next_run_skips_to_next_window(self):
        friday_evening = dt.datetime(2026, 11, 13, 16, 0, tzinfo=UTC)
        self.assertEqual(next_run_at(self.schedule, friday_evening), dt.datetime(2026, 11, 16, 7, 0, tzinfo=UTC))
        inside = dt.datetime(2026, 11, 9, 8, 0, tzinfo=UTC)
        self.assertEqual(next_run_at(self.schedule, inside), inside + dt.timedelta(minutes=3))

    def test_next_run_handles_daylight_saving(self):
        # 2026-03-30 (Monday) Berlin is on CEST: 08:00 local = 06:00 UTC.
        sunday = dt.datetime(2026, 3, 29, 12, 0, tzinfo=UTC)
        self.assertEqual(next_run_at(self.schedule, sunday), dt.datetime(2026, 3, 30, 6, 0, tzinfo=UTC))

    def test_invalid_schedule(self):
        self.assertIsNone(next_run_at({**self.schedule, 'scheduleTimezone': 'Mars/Base'}))


class SmtpTests(SimpleTestCase):
    def test_rate_limits_halt_auto_sending(self):
        quota = smtplib.SMTPDataError(550, b'5.4.5 Daily user sending limit exceeded.')
        self.assertTrue(classify_smtp_error(quota).halt_auto_sending)
        gmail = smtplib.SMTPDataError(421, b'4.7.28 Our system has detected an unusual rate')
        result = classify_smtp_error(gmail)
        self.assertEqual((result.halt_auto_sending, result.response_code, result.enhanced_code),
                         (True, 421, '4.7.28'))
        self.assertFalse(classify_smtp_error(smtplib.SMTPAuthenticationError(535, b'Bad credentials'))
                         .halt_auto_sending)

    def test_provider_presets(self):
        config = normalize_smtp_config(provider='gmail', host='x', port=25, secure=True, auth_user=' me@gmail.com ',
                                       auth_pass='abcd efgh ijkl mnop', from_email='other@x.de', from_name='')
        self.assertEqual((config.host, config.port, config.secure, config.from_email, config.auth_pass),
                         ('smtp.gmail.com', 587, False, 'me@gmail.com', 'abcdefghijklmnop'))
        custom = normalize_smtp_config(provider='custom', host='mail.x.de', port='465', secure=False,
                                       auth_user='a@x.de', auth_pass='p', from_email='', from_name='A')
        self.assertTrue(custom.secure)

    def test_private_addresses_are_blocked(self):
        for address in ('127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.1.1', '100.64.0.1',
                        '::1', 'fd00::1', '::ffff:10.0.0.1'):
            self.assertTrue(_is_private_address(address), address)
        self.assertFalse(_is_private_address('142.250.185.109'))


class DocumentTests(SimpleTestCase):
    def test_motivation_letter_pdf_contains_text(self):
        pdf = create_motivation_letter_pdf(
            applicant={'name': 'Jürgen Müller', 'email': 'j@m.de', 'city': '10115 Berlin'},
            company={'name': 'ACME GmbH', 'location': 'Berlin'},
            job_title='Fachinformatiker',
            motivation_letter='Sehr geehrte Damen und Herren,\n\nich bewerbe mich „gern“.\n\nMit freundlichen Grüßen',
            today=dt.date(2026, 11, 8),
        )
        self.assertTrue(pdf.startswith(b'%PDF-'))
        content = extract_pdf_text(pdf)
        for expected in ('Jürgen Müller', 'ACME GmbH', '08. November 2026', 'Fachinformatiker', 'Grüßen'):
            self.assertIn(expected, content)

    def test_safe_file_name(self):
        self.assertEqual(safe_applicant_file_name('Zoë  Çelik-Öz'), 'Zoe_Celik_Oz')
        self.assertEqual(safe_applicant_file_name('***'), 'Bewerber')


class ArbeitsagenturTests(SimpleTestCase):
    def setUp(self):
        from django.core.cache import cache

        cache.clear()

    def _response(self, payload, ok=True):
        response = mock.Mock(ok=ok, status_code=200 if ok else 500)
        response.json.return_value = payload
        return response

    def test_maps_v6_search_results(self):
        payload = {'maxErgebnisse': 1, 'ergebnisliste': [{
            'referenznummer': '10001-ABC-S', 'stellenangebotsTitel': 'Fachinformatiker Systemintegration',
            'firma': 'ACME', 'stellenlokationen': [{'adresse': {'ort': 'Berlin', 'plz': '10115', 'region': 'BERLIN'}}],
            'ausbildungsverguetungJahr1': 1250, 'eintrittszeitraum': {'von': '2027-08-01'},
        }]}
        with mock.patch('azubora.services.arbeitsagentur.requests.get', return_value=self._response(payload)) as get:
            result = arbeitsagentur.fetch_offers(was='Fachinformatiker', wo='Berlin', umkreis=20)
        self.assertIn('angebotsart=4', get.call_args.args[0])
        job = result['jobs'][0]
        self.assertEqual(result['source'], 'live_api')
        self.assertEqual((job['externalId'], job['federalState'], job['category'], job['salary']),
                         ('BA-10001-ABC-S', 'Berlin', 'IT & Software', '1.250 € / Monat (1. Jahr)'))

    def test_falls_back_when_api_down(self):
        with mock.patch('azubora.services.arbeitsagentur.requests.get', side_effect=arbeitsagentur.requests.Timeout):
            result = arbeitsagentur.fetch_offers(was='Pflege')
        self.assertEqual(result['source'], 'fallback_db')

    def test_enrich_finds_nested_contact_email(self):
        details = {'arbeitgeberAdresse': {}, 'kontakt': [{'text': 'Bewerbung an jobs@acme.de bitte'}]}
        with mock.patch('azubora.services.arbeitsagentur.requests.get', return_value=self._response(details)) as get:
            job = arbeitsagentur.enrich_offer({'externalId': 'BA-10001-ABC-S', 'description': 'd', 'requirements': 'r'})
        self.assertEqual(job['contactEmail'], 'jobs@acme.de')
        self.assertTrue(get.call_args.args[0].endswith('MTAwMDEtQUJDLVM%3D'))


class ApplicationLetterRulesTests(SimpleTestCase):
    def test_display_name(self):
        from azubora.services.ai import display_name

        self.assertEqual(display_name('ANAS EL HADDAD'), 'Anas El Haddad')
        self.assertEqual(display_name('lea von der heide'), 'Lea von der Heide')
        self.assertEqual(display_name('Jean-Luc Picard'), 'Jean-Luc Picard')

    def test_title_matching_tolerates_gender_markers_and_forms(self):
        from azubora.services.ai import mentions_title

        self.assertTrue(mentions_title('als Fachinformatiker für Systemintegration',
                                       'Ausbildung Fachinformatiker für Systemintegration (m/w/d)'))
        self.assertTrue(mentions_title('zur Kauffrau für Büromanagement', 'Ausbildung zum Kaufmann für Büromanagement 2027'))
        self.assertFalse(mentions_title('Bewerbung als Koch', 'Fachinformatiker Systemintegration (m/w/d)'))

    def test_package_checks_are_case_insensitive_for_the_name(self):
        from azubora.services.ai import CoverLetterParams, package_problems

        params = CoverLetterParams(user_name='Anas El Haddad', user_email='a@b.de', user_skills=['Java'])
        email = ('Sehr geehrte Damen und Herren, ' + 'ich bewerbe mich bei SPITZKE. ' * 12
                 + 'Anbei Lebenslauf und Motivationsschreiben. Mit freundlichen Grüßen ANAS EL HADDAD')
        letter = ('Sehr geehrte Damen und Herren, als Fachinformatiker für Systemintegration ' + 'möchte ich lernen. ' * 60
                  + 'Mit freundlichen Grüßen Anas El Haddad')
        _, problems = package_problems({'subject': 'Bewerbung als Fachinformatiker – Anas El Haddad', 'emailBody': email,
                                        'motivationLetter': letter, 'candidateFactKeys': ['skills']},
                                       params, 'SPITZKE SE', 'Ausbildung Fachinformatiker für Systemintegration (m/w/d)')
        self.assertEqual(problems, [])  # "SPITZKE" without the legal form still names the company
        _, problems = package_problems({'subject': 'Bewerbung als Fachinformatiker – Anas El Haddad', 'emailBody': email,
                                        'motivationLetter': letter, 'candidateFactKeys': ['skills']},
                                       params, 'Bechtle AG', 'Ausbildung Fachinformatiker für Systemintegration (m/w/d)')
        self.assertEqual(problems, ['company named'])

    def test_company_matching_ignores_word_order_and_titles(self):
        from azubora.services.ai import mentions_company

        self.assertTrue(mentions_company('in der Zahnarztpraxis Dr. Daniel Thier', 'Dr. Daniel Thier - Zahnarztpraxis'))
        self.assertFalse(mentions_company('bei der Siemens AG', 'Bosch GmbH'))


class NetworkFailureTests(SimpleTestCase):
    """A network problem must never be recorded as "this offer has no e-mail"."""

    def test_details_request_failure_is_unknown_but_404_is_definite(self):
        job = {'externalId': 'BA-1-X', 'description': 'd', 'requirements': 'r'}
        with mock.patch('azubora.services.arbeitsagentur.requests.get',
                        side_effect=arbeitsagentur.requests.ConnectionError):
            self.assertTrue(arbeitsagentur.enrich_offer(job)['lookupFailed'])
        with mock.patch('azubora.services.arbeitsagentur.requests.get', return_value=mock.Mock(status_code=404, ok=False)):
            self.assertNotIn('lookupFailed', arbeitsagentur.enrich_offer(job))
