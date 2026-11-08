"""Application tracking, sending and the dashboard."""
import datetime as dt

from django.db.models import Exists, OuterRef, Prefetch
from django.http import HttpRequest
from django.utils import timezone

from azubora.controllers.base import methods, read_json, text
from azubora.controllers.session import login_required
from azubora.models import ApplicationMessage, FavoriteJob, JobApplication, JobOffer, User
from azubora.services.applications import OFFICIAL_OFFER_ID, deliver_application, find_offer, offer_fields
from azubora.services.ratelimit import check_rate_limit
from azubora.views.responses import error, json_response, rate_limited
from azubora.views.serializers import application_dict, to_dict


def _latest_reply_prefetch():
    return Prefetch(
        'messages',
        queryset=ApplicationMessage.objects.filter(direction='INBOUND').order_by('-sent_at'),
        to_attr='inbound_messages',
    )


def _with_latest_reply(application: JobApplication, notes: bool = False) -> dict:
    replies = getattr(application, 'inbound_messages', [])
    return application_dict(application, notes=notes, include_latest_reply=True,
                            latest_reply=replies[0] if replies else None)


@login_required()
def list_applications(request: HttpRequest, user: User):
    applications = (JobApplication.objects.filter(user=user).select_related('job_offer')
                    .prefetch_related('notes', _latest_reply_prefetch()).order_by('-updated_at'))
    return json_response({'applications': [_with_latest_reply(item, notes=True) for item in applications]})


def to_job_item(job_data: dict | None, fallback: JobOffer | None, requested_id: str) -> dict:
    data = job_data or {}

    def pick(key: str, attribute: str, default):
        value = data.get(key)
        if value:
            return value
        stored = getattr(fallback, attribute, None) if fallback else None
        return stored or default

    external_id = str(data.get('externalId') or data.get('id') or (fallback.external_id if fallback else '')
                      or requested_id)
    contact = data.get('contactEmail') or (fallback.contact_email if fallback else None) or None
    remote = data.get('remote')
    if remote is None and fallback is not None:
        remote = fallback.remote
    published = data.get('publishedAt') or (fallback.published_at.isoformat() if fallback else None) \
        or timezone.now().isoformat()
    return {
        'id': external_id,
        'externalId': external_id,
        'title': pick('title', 'title', 'Ausbildungsstelle'),
        'beruf': data.get('beruf') or data.get('title') or (fallback.title if fallback else None),
        'company': pick('company', 'company', 'Unternehmen'),
        'contactEmail': contact,
        'contactEmailVerified': bool(contact),
        'location': pick('location', 'location', 'Deutschland'),
        'postalCode': pick('postalCode', 'postal_code', ''),
        'federalState': pick('federalState', 'federal_state', ''),
        'category': pick('category', 'category', 'Berufsausbildung'),
        'contractType': pick('contractType', 'contract_type', 'Berufsausbildung'),
        'workTime': pick('workTime', 'work_time', 'Vollzeit'),
        'remote': bool(remote),
        'salary': pick('salary', 'salary', ''),
        'description': pick('description', 'description', 'Stellenbeschreibung'),
        'requirements': pick('requirements', 'requirements', ''),
        'url': pick('url', 'url', ''),
        'publishedAt': published,
        'searchKeyword': pick('searchKeyword', 'search_keyword', ''),
    }


@login_required()
def create_application(request: HttpRequest, user: User):
    body = read_json(request)
    job_offer_id = body.get('jobOfferId')
    if not job_offer_id:
        return error('L’identifiant de l’offre est obligatoire.', 400)
    job_data = body.get('jobData') if isinstance(body.get('jobData'), dict) else None
    stored = find_offer(str(job_offer_id))
    if job_data is None and stored is None:
        return error('Stellenangebot konnte nicht gefunden werden.', 404)
    job = to_job_item(job_data, stored, str(job_offer_id))
    if not OFFICIAL_OFFER_ID.match(job['externalId']):
        return error('Seules les offres officielles Arbeitsagentur peuvent être enregistrées ou utilisées.', 400)

    if body.get('action') != 'apply':
        offer, created = JobOffer.objects.get_or_create(
            external_id=job['externalId'], defaults={**offer_fields(job), 'contact_email': job['contactEmail']})
        if not created:
            JobOffer.objects.filter(id=offer.id).update(contact_email=job['contactEmail'])
        application, _ = JobApplication.objects.get_or_create(
            user=user, job_offer=offer, defaults={'status': 'SAVED', 'notes_text': 'Offre enregistrée.'})
        return json_response({'success': True, 'application': to_dict(application)})

    allowed, retry = check_rate_limit(f'application-send:{user.id}', 10, 60 * 60_000)
    if not allowed:
        return rate_limited('Limite d’envoi atteinte. Réessayez plus tard.', retry)
    try:
        result = deliver_application(user.id, job)
    except Exception as exc:  # noqa: BLE001 - e.g. the AI package could not be generated
        return error(str(exc) or 'Bewerbung konnte nicht angelegt werden.', 500)
    if not result['success']:
        status = 402 if result.get('upgradeRequired') else 422 if result.get('skipped') else 502
        return json_response({**result, 'error': result.get('error') or 'La candidature n’a pas pu être envoyée.'},
                             status=status)
    return json_response(result)


@login_required()
def update_application(request: HttpRequest, user: User):
    body = read_json(request)
    application_id = body.get('id')
    if not isinstance(application_id, str) or not application_id:
        return error('ID de candidature invalide.', 400)
    status = body.get('status')
    if status is not None and str(status) not in APPLICATION_STATUSES:
        return error('Statut de candidature invalide.', 400)
    if 'notesText' in body and len(str(body['notesText'] or '')) > 10_000:
        return error('Les notes sont trop longues.', 400)
    if 'coverLetter' in body and len(str(body['coverLetter'] or '')) > 20_000:
        return error('Le texte de candidature est trop long.', 400)
    interview_date = ...
    if 'interviewDate' in body:
        raw = body['interviewDate']
        interview_date = None
        if raw:
            try:
                interview_date = dt.datetime.fromisoformat(str(raw).replace('Z', '+00:00'))
            except ValueError:
                return error('Date d’entretien invalide.', 400)
            if interview_date.tzinfo is None:
                interview_date = timezone.make_aware(interview_date, dt.timezone.utc)
    owned = JobApplication.objects.filter(id=application_id, user=user).first()
    if owned is None:
        return error('Candidature introuvable.', 404)

    if status:
        owned.status = str(status)
    if 'notesText' in body:
        owned.notes_text = text(body['notesText']) or None
    if interview_date is not ...:
        owned.interview_date = interview_date
    if 'coverLetter' in body:
        owned.cover_letter = text(body['coverLetter']) or None
    if status == 'APPLIED' and not owned.applied_at:
        owned.applied_at = timezone.now()
    owned.save()
    return json_response({'success': True, 'application': application_dict(owned)})


@login_required()
def delete_application(request: HttpRequest, user: User):
    application_id = request.GET.get('id')
    if not application_id:
        return error('ID fehlt.', 400)
    deleted, _ = JobApplication.objects.filter(id=application_id, user=user).delete()
    if not deleted:
        return error('Candidature introuvable.', 404)
    return json_response({'success': True})


applications = methods(GET=list_applications, POST=create_application, PUT=update_application,
                       DELETE=delete_application)

APPLICATION_STATUSES = {'SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED'}
FR_WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']


@login_required()
def dashboard(request: HttpRequest, user: User):
    now = timezone.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    chart_start = today - dt.timedelta(days=6)
    applications = list(
        JobApplication.objects.filter(user=user).select_related('job_offer')
        .prefetch_related(_latest_reply_prefetch()).order_by('-updated_at')
    )
    responses = JobApplication.objects.filter(user=user).filter(
        Exists(ApplicationMessage.objects.filter(application=OuterRef('pk'), direction='INBOUND'))
    ).count()
    next_interview = (JobApplication.objects.filter(user=user, interview_date__gte=now)
                      .order_by('interview_date').values_list('interview_date', flat=True).first())

    chart = []
    for index in range(7):
        day = chart_start + dt.timedelta(days=index)
        following = day + dt.timedelta(days=1)
        chart.append({
            'name': FR_WEEKDAYS[day.weekday()],
            'date': day.date().isoformat(),
            'matches': sum(1 for item in applications if day <= item.created_at < following),
            'bewerbungen': sum(1 for item in applications if item.applied_at and day <= item.applied_at < following),
        })
    return json_response({
        'stats': {
            'totalOffers': JobOffer.objects.filter(active=True).count(),
            'offersToday': JobOffer.objects.filter(active=True, created_at__gte=today).count(),
            'appliedJobs': sum(1 for item in applications if item.applied_at),
            'interviews': sum(1 for item in applications if item.status == 'INTERVIEW'),
            'rejections': sum(1 for item in applications if item.status == 'REJECTED'),
            'responses': responses,
            'savedJobs': FavoriteJob.objects.filter(user=user).count(),
            'nextInterviewAt': next_interview,
        },
        'chartData': chart,
        'applications': [_with_latest_reply(item) for item in applications[:10]],
    })


dashboard_view = methods(GET=dashboard)
