"""Deep search: refresh stored offers and save strong matches for profiles."""
import datetime as dt
import json

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from azubora.models import JobApplication, JobOffer, QueueJob, UserProfile
from azubora.services.ai import analyze_job_match
from azubora.services.applications import offer_fields, parse_job_date
from azubora.services.arbeitsagentur import fetch_offers
from azubora.services.notifications import dispatch_notification
from azubora.services.ratelimit import redis_client
from azubora.services.smtp import config_from_model
from azubora.views.serializers import dumps

JOB_NAME = 'AUTOMATED_AUSBILDUNG_SEARCH'
KEYWORDS = ['Fachinformatiker', 'Kaufmann', 'Mechatroniker', 'Pflege', 'Elektroniker', 'Ausbildung']
MATCH_THRESHOLD = 70


def _claim_job(user_id: str | None) -> QueueJob | None:
    stale_before = timezone.now() - dt.timedelta(minutes=30)
    with transaction.atomic():
        QueueJob.objects.filter(job_name=JOB_NAME, status='PENDING', run_at__lt=stale_before).update(
            status='FAILED', error_message='Exécution interrompue ou expirée.', completed_at=timezone.now())
        if QueueJob.objects.select_for_update().filter(job_name=JOB_NAME, status='PENDING').exists():
            return None
        return QueueJob.objects.create(job_name=JOB_NAME, status='PENDING',
                                       payload=dumps({'userId': user_id, 'timestamp': timezone.now()}))


def run_deep_search(user_id: str | None = None) -> dict:
    job_log = _claim_job(user_id)
    if job_log is None:
        return {'success': False, 'skipped': True, 'error': 'Une recherche approfondie est déjà en cours.'}
    try:
        profiles_qs = UserProfile.objects.select_related(
            'user', 'user__smtp_config', 'user__notification_config'
        ).prefetch_related('skills', 'educations').defer('cv_file_data')
        profiles = list(profiles_qs.filter(user_id=user_id) if user_id else profiles_qs.filter(auto_search_enabled=True))
        if user_id and not profiles:
            raise RuntimeError('Complétez votre profil avant de lancer la recherche approfondie.')

        saved = duplicates = matches = notification_failures = live_searches = 0
        for keyword in KEYWORDS:
            response = fetch_offers(was=keyword, limit=25)
            if response['source'] != 'live_api':
                continue
            live_searches += 1
            for job in response['jobs']:
                if not job['externalId'].startswith('BA-'):
                    continue
                fields = {**offer_fields(job), 'published_at': parse_job_date(job.get('publishedAt')),
                          'active': True, 'search_keyword': keyword}
                offer, created = JobOffer.objects.update_or_create(external_id=job['externalId'], defaults=fields)
                if created:
                    saved += 1
                else:
                    duplicates += 1

                for profile in profiles:
                    if JobApplication.objects.filter(user_id=profile.user_id, job_offer=offer).exists():
                        continue
                    profile_text = (
                        f"Ausbildung: {', '.join(item.degree for item in profile.educations.all())}. "
                        f"Skills: {', '.join(item.name for item in profile.skills.all())}. "
                        f"Stadt: {profile.city or ''}"
                    )
                    job_text = f"{job['title']} - {job['company']} - {job['description']} - {job['requirements']}"
                    analysis = analyze_job_match(profile_text, job_text, profile.user_id)
                    if analysis['matchScore'] < MATCH_THRESHOLD:
                        continue
                    JobApplication.objects.create(
                        user_id=profile.user_id, job_offer=offer, status='SAVED',
                        match_score=analysis['matchScore'],
                        missing_skills=json.dumps(analysis['missingSkills'], ensure_ascii=False),
                        cv_tips=json.dumps(analysis['cvSuggestions'], ensure_ascii=False),
                        notes_text=f"Auto-gefundener Match ({analysis['matchScore']}% Übereinstimmung)")
                    matches += 1
                    notification_failures += _notify_match(profile.user, offer, analysis['matchScore'])

        if not live_searches:
            raise RuntimeError('La source officielle Arbeitsagentur est temporairement indisponible.')
        result = {'totalSaved': saved, 'totalDuplicatesRemoved': duplicates, 'totalMatches': matches,
                  'notificationFailures': notification_failures, 'liveSearches': live_searches}
        QueueJob.objects.filter(id=job_log.id).update(status='COMPLETED', result=dumps(result),
                                                      completed_at=timezone.now())
        return {'success': True, **result}
    except Exception as exc:  # noqa: BLE001
        message = str(exc) or 'Auto-search execution error'
        QueueJob.objects.filter(id=job_log.id).update(status='FAILED', error_message=message,
                                                      completed_at=timezone.now())
        return {'success': False, 'error': message}


def _notify_match(user, offer: JobOffer, score: int) -> int:
    try:
        notification = user.notification_config
    except user.__class__.notification_config.RelatedObjectDoesNotExist:
        return 0
    if not notification.alert_on_new_match:
        return 0
    try:
        smtp = user.smtp_config
    except user.__class__.smtp_config.RelatedObjectDoesNotExist:
        smtp = None
    results = dispatch_notification(
        email_enabled=notification.email_enabled,
        user_email=user.email,
        smtp=config_from_model(smtp) if smtp and smtp.active and smtp.is_tested else None,
        telegram_enabled=notification.telegram_enabled,
        telegram_chat_id=notification.telegram_chat_id,
        discord_enabled=notification.discord_enabled,
        discord_webhook_url=notification.discord_webhook_url,
        title=f'Nouveau match à {score}%',
        message='Une nouvelle offre correspondant à votre profil a été enregistrée.',
        link_url=f'{settings.APP_URL}/ai-matching?jobId={offer.id}',
        job_title=offer.title,
        company=offer.company,
    )
    return sum(1 for item in results if not item['success'])


def queue_status() -> dict:
    connected = False
    client = redis_client()
    if client is not None:
        try:
            connected = bool(client.ping())
        except Exception:
            connected = False
    return {
        'redisConnected': connected,
        'queueInitialized': client is not None,
        'executionMode': 'database-backed manual deep search',
        'queueName': 'ausbildung-search-queue',
        'autoIntervalMinutes': None,
    }
