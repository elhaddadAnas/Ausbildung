"""Live offer search, deep search and favourites."""

from django.http import HttpRequest

from azubora.controllers.base import as_number, methods, read_json, text
from azubora.controllers.session import login_required
from azubora.models import FavoriteJob, JobApplication, JobOffer, User
from azubora.services.applications import OFFICIAL_OFFER_ID
from azubora.services.arbeitsagentur import fetch_offers
from azubora.services.deep_search import run_deep_search
from azubora.services.ratelimit import check_rate_limit
from azubora.views.responses import error, json_response, rate_limited
from azubora.views.serializers import to_dict


@login_required()
def search_offers(request: HttpRequest, user: User):
    allowed, retry = check_rate_limit(f'search:{user.id}', 60, 15 * 60_000)
    if not allowed:
        return rate_limited('Zu viele Suchanfragen. Bitte versuchen Sie es später erneut.', retry)
    params = request.GET
    radius = as_number(params.get('umkreis'))
    page = as_number(params.get('page')) or 1
    result = fetch_offers(
        was=params.get('was', ''),
        wo=params.get('wo', ''),
        bundesland=params.get('bundesland', ''),
        category=params.get('category', ''),
        contract_type=params.get('contractType', ''),
        remote=params.get('remote') == 'true',
        umkreis=int(radius) if radius in (10, 20, 50, 100, 200) else None,
        page=int(min(40, max(1, page))),
        limit=25,
    )
    if result['source'] != 'live_api':
        return json_response({
            'error': 'La source officielle Arbeitsagentur est temporairement indisponible.',
            'jobs': [], 'total': 0, 'source': result['source'],
        }, status=503)
    favorite_ids = set(FavoriteJob.objects.filter(user=user).values_list('job_offer__external_id', flat=True))
    applied_ids = set(JobApplication.objects.filter(user=user).values_list('job_offer__external_id', flat=True))
    jobs = [{**job, 'isFavorite': job['externalId'] in favorite_ids, 'hasApplied': job['externalId'] in applied_ids}
            for job in result['jobs']]
    return json_response({'jobs': jobs, 'total': min(result['total'], 40 * 25), 'source': result['source']})


@login_required()
def start_deep_search(request: HttpRequest, user: User):
    allowed, retry = check_rate_limit(f'manual-search:{user.id}', 2, 15 * 60_000)
    if not allowed:
        return rate_limited('Une recherche approfondie est déjà récente. Réessayez plus tard.', retry)
    result = run_deep_search(user.id)
    status = 200 if result['success'] else 409 if result.get('skipped') else 503
    return json_response(result, status=status)


search = methods(GET=search_offers, POST=start_deep_search)


@login_required()
def list_favorites(request: HttpRequest, user: User):
    favorites = FavoriteJob.objects.filter(user=user).select_related('job_offer').order_by('-created_at')
    return json_response({'favorites': [to_dict(item, jobOffer=to_dict(item.job_offer)) for item in favorites]})


@login_required()
def toggle_favorite(request: HttpRequest, user: User):
    body = read_json(request)
    job_offer_id = body.get('jobOfferId')
    job_data = body.get('jobData') if isinstance(body.get('jobData'), dict) else None
    if not job_offer_id:
        return error('Job Offer ID erforderlich.', 400)
    requested_id = str((job_data or {}).get('externalId') or (job_data or {}).get('id') or job_offer_id)
    if not OFFICIAL_OFFER_ID.match(requested_id):
        return error('Seules les offres officielles Arbeitsagentur peuvent être ajoutées.', 400)

    offer = JobOffer.objects.filter(id=str(job_offer_id)).first() or \
        JobOffer.objects.filter(external_id=requested_id).first()
    if offer is None:
        if not job_data:
            return error('Détails de l’offre manquants.', 400)

        def field(name, limit, default=''):
            return text(job_data.get(name) or default, limit)

        offer = JobOffer.objects.create(
            external_id=requested_id,
            title=field('title', 300, 'Ausbildungsstelle'),
            company=field('company', 300, 'Unternehmen'),
            location=field('location', 200, 'Deutschland'),
            postal_code=field('postalCode', 20) or None,
            federal_state=field('federalState', 100) or None,
            category=field('category', 100) or None,
            contract_type=field('contractType', 100) or None,
            work_time=field('workTime', 100) or None,
            remote=bool(job_data.get('remote')),
            salary=field('salary', 100) or None,
            description=field('description', 20_000, 'Ausbildungsangebot aus der Arbeitsagentur Suche.'),
            requirements=field('requirements', 10_000) or None,
            url=field('url', 2_000) or None,
        )
    existing = FavoriteJob.objects.filter(user=user, job_offer=offer).first()
    if existing:
        existing.delete()
        return json_response({'isFavorite': False})
    FavoriteJob.objects.create(user=user, job_offer=offer)
    return json_response({'isFavorite': True})


favorites = methods(GET=list_favorites, POST=toggle_favorite)
