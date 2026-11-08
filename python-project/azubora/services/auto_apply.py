"""The auto-apply bot: search offers and send at most one application per run."""
import datetime as dt
import json
import unicodedata
from concurrent.futures import ThreadPoolExecutor

from django.db import connection
from django.db.models import Q
from django.utils import timezone

from azubora.models import AutoApplyConfig, AutoApplySkippedOffer, JobOffer, QueueJob
from azubora.services.ai import ApplicationMessageGenerationError, openai_configured
from azubora.services.applications import deliver_application, parse_list
from azubora.services.arbeitsagentur import API_MAX_RESULTS, coverage_plan, fetch_offers
from azubora.services.company_contacts import resolve_application_email
from azubora.services.auto_apply_schedule import is_within_schedule, next_run_at
from azubora.services.subscriptions import SubscriptionLimitError, assert_auto_apply_allowed
from azubora.views.serializers import dumps, iso

INTERVAL_MINUTES = 3
STALE_LOCK_MINUTES = 15
APPLICATIONS_PER_RUN = 1
# The Arbeitsagentur API serves up to 100 pages of 100 offers (10,000) per search.
SEARCH_PAGE_SIZE = 100
MAX_SEARCH_PAGES = 100
MAX_SEARCH_COMBINATIONS_PER_RUN = 8
# Pages read per run (each up to 100 offers); remembered offers are skipped without a look-up.
MAX_PAGES_PER_RUN = 50
# Offers with an e-mail address that go through the application pipeline (costs AI credits).
MAX_CANDIDATE_ATTEMPTS_PER_RUN = 15
# Free look-ups for the application e-mail address (Arbeitsagentur details, then company website).
MAX_DETAIL_LOOKUPS_PER_RUN = 60
LOOKUP_THREADS = 8
# Stop a run after this many letters failed the quality checks (each attempt costs AI credits).
MAX_LETTER_FAILURES_PER_RUN = 3
# Ruled-out offers are not re-checked for this long, so each run reaches new offers.
SKIP_MEMORY_DAYS = {'NO_EMAIL': 14, 'LETTER_FAILED': 3, 'DUPLICATE': 365}
PROVIDER_ATTEMPTS = 2


def _normalize(value: str) -> str:
    stripped = ''.join(char for char in unicodedata.normalize('NFKD', value) if not unicodedata.combining(char))
    return stripped.strip().lower()


def category_matches(job: dict, categories: list[str]) -> bool:
    return not categories or any(category.lower() in job['category'].lower() for category in categories)


def federal_state_matches(job: dict, states: list[str]) -> bool:
    return not states or any(_normalize(job['federalState']) == _normalize(state) for state in states)


def _fetch_with_retry(**filters) -> dict | None:
    response = None
    for _ in range(PROVIDER_ATTEMPTS):
        response = fetch_offers(**filters)
        if response['source'] == 'live_api':
            return response
    return response


def _now_iso() -> str:
    return iso(timezone.now())


def _disable(config_filter: dict, result: dict) -> dict:
    AutoApplyConfig.objects.filter(**config_filter).update(
        enabled=False, running=False, run_started_at=None, next_run_at=None, last_result=dumps(result))
    return result


def run_auto_apply_for_user(user_id: str, *, force: bool = False) -> dict:
    config = AutoApplyConfig.objects.filter(user_id=user_id).first()
    if config is None:
        return {'success': False, 'error': 'Configuration auto-candidature introuvable.'}
    if not force and not config.enabled:
        return {'success': False, 'skipped': True, 'error': 'Auto-candidature désactivée.'}
    if not force and not is_within_schedule(config):
        upcoming = next_run_at(config, timezone.now(), INTERVAL_MINUTES)
        result = {
            'success': True,
            'skipped': True,
            'outsideSchedule': True,
            'error': 'En dehors de la plage horaire programmée.',
            'nextRunAt': iso(upcoming),
            'completedAt': _now_iso(),
        }
        AutoApplyConfig.objects.filter(id=config.id).update(
            running=False, run_started_at=None, next_run_at=upcoming, last_result=dumps(result))
        return result

    try:
        assert_auto_apply_allowed(user_id)
    except SubscriptionLimitError as exc:
        # Stop a downgraded account from being retried by the scheduler forever.
        return _disable({'user_id': user_id}, {
            'success': False, 'skipped': True, 'upgradeRequired': True, 'error': str(exc),
            'completedAt': _now_iso()})
    if not openai_configured():
        return _disable({'id': config.id}, {
            'success': False, 'skipped': True,
            'error': 'La clé OpenAI doit être configurée pour générer les candidatures personnalisées.',
            'completedAt': _now_iso()})

    lock = AutoApplyConfig.objects.filter(id=config.id, running=False)
    if not force:
        lock = lock.filter(enabled=True)
    if not lock.update(running=True, run_started_at=timezone.now()):
        return {'success': False, 'skipped': True, 'error': 'Une exécution est déjà en cours.'}

    queue_job = QueueJob.objects.create(job_name='AUTO_APPLY', status='PENDING', payload=dumps(
        {'userId': user_id, 'automated': not force, 'startedAt': timezone.now()}))
    result: dict = {}
    try:
        result = _run(config, user_id, force)
        succeeded = result['success']
        QueueJob.objects.filter(id=queue_job.id).update(
            status='COMPLETED' if succeeded else 'FAILED',
            result=dumps(result),
            error_message=None if succeeded else (
                result['smtpHaltReason'] or result['fatalError'] or result['noSendReason']),
            completed_at=timezone.now(),
        )
        return result
    except Exception as exc:  # noqa: BLE001 - recorded on the job and returned to the caller
        result = {'success': False, 'error': str(exc), 'completedAt': _now_iso()}
        QueueJob.objects.filter(id=queue_job.id).update(
            status='FAILED', error_message=str(exc), completed_at=timezone.now())
        return result
    finally:
        latest = AutoApplyConfig.objects.filter(id=config.id).first()
        AutoApplyConfig.objects.filter(id=config.id).update(
            running=False,
            run_started_at=None,
            last_run_at=timezone.now(),
            next_run_at=next_run_at(latest, timezone.now(), INTERVAL_MINUTES) if latest and latest.enabled else None,
            last_result=dumps(result),
        )


def _resolve_one(job: dict) -> dict:
    try:
        return resolve_application_email(job)
    except Exception:  # noqa: BLE001 - a failed look-up is retried in a later run
        return {**job, 'lookupFailed': True}
    finally:
        connection.close()


def _resolve_addresses(jobs: list[dict]) -> list[dict]:
    if not jobs:
        return []
    with ThreadPoolExecutor(max_workers=min(LOOKUP_THREADS, len(jobs))) as pool:
        return list(pool.map(_resolve_one, jobs))


def is_all_offers_mode(keywords: list[str], cities: list[str]) -> bool:
    """No specific trade and no city: apply to every training offer in Germany."""
    return all(keyword.strip().lower() in ('', 'ausbildung') for keyword in keywords) and not any(cities)


def _plan_searches(config: AutoApplyConfig, keywords: list[str], cities: list[str], all_offers: bool) -> list[dict]:
    if all_offers:
        try:
            plan = coverage_plan()
            return [{'key': item['key'], 'query': {'filters': item['filters']}, 'count': item['count']}
                    for item in plan['slices']]
        except Exception:  # noqa: BLE001 - fall back to a single generic search
            pass
    combinations = [(keyword, city) for keyword in keywords for city in cities]
    rotation = 0
    if config.last_run_at:
        rotation = int(config.last_run_at.timestamp() * 1000 // (INTERVAL_MINUTES * 60_000)) % len(combinations)
    combinations = (combinations[rotation:] + combinations[:rotation])[:MAX_SEARCH_COMBINATIONS_PER_RUN]
    return [{'key': f'{keyword}|{city}', 'query': {'was': keyword, 'wo': city},
             'umkreis': config.radius_km if city else None} for keyword, city in combinations]


def _cursor_start(config: AutoApplyConfig, searches: list[dict]) -> tuple[int, int]:
    try:
        cursor = json.loads(config.scan_cursor or '{}')
    except ValueError:
        cursor = {}
    keys = [search['key'] for search in searches]
    if cursor.get('slice') in keys:
        return keys.index(cursor['slice']), max(1, int(cursor.get('page') or 1))
    return 0, 1


def _save_cursor(config: AutoApplyConfig, searches: list[dict], resume_at: tuple[int, int] | None) -> None:
    index, page = resume_at or (0, 1)
    if index >= len(searches):
        index, page = 0, 1  # whole of Germany done: start again to catch new offers
    cursor = json.dumps({'slice': searches[index]['key'], 'page': page}) if searches else None
    AutoApplyConfig.objects.filter(id=config.id).update(scan_cursor=cursor)


def _progress(searches: list[dict], resume_at: tuple[int, int] | None) -> dict:
    index, page = resume_at or (0, 1)
    total = sum(search.get('count', 0) for search in searches)
    done = sum(search.get('count', 0) for search in searches[:index])
    if index < len(searches):
        done += min(searches[index].get('count', 0), (page - 1) * SEARCH_PAGE_SIZE)
    return {'offersTotal': total, 'offersScanned': min(done, total), 'slice': index + 1, 'slices': len(searches)}


def _recently_skipped(user_id: str) -> set[str]:
    now = timezone.now()
    skips = AutoApplySkippedOffer.objects.filter(user_id=user_id)
    for reason, days in SKIP_MEMORY_DAYS.items():
        skips.filter(reason=reason, created_at__lt=now - dt.timedelta(days=days)).delete()
    skips.exclude(reason__in=list(SKIP_MEMORY_DAYS)).delete()
    return set(skips.values_list('external_id', flat=True))


def _remember_skip(user_id: str, external_id: str, reason: str) -> None:
    AutoApplySkippedOffer.objects.update_or_create(
        user_id=user_id, external_id=external_id, defaults={'reason': reason, 'created_at': timezone.now()})


def _run(config: AutoApplyConfig, user_id: str, force: bool) -> dict:
    keywords = parse_list(config.keywords) or ['Ausbildung']
    cities = parse_list(config.cities) or ['']
    states = parse_list(config.federal_states)
    categories = parse_list(config.categories)
    seen: set[str] = set()
    sent = skipped = pages_scanned = already_applied = attempts = lookups = 0
    without_email = previously_ruled_out = from_website = letter_failures = duplicates = lookup_errors = 0
    provider_available = smtp_halted = False
    smtp_halt_reason = fatal_error = ''
    errors: list[str] = []
    deliveries: list[dict] = []
    applied_ids = set(
        JobOffer.objects.filter(applications__user_id=user_id, applications__status='APPLIED')
        .values_list('external_id', flat=True)
    )
    # Offers ruled out in earlier runs are not checked again, so each run reaches new offers.
    ruled_out = _recently_skipped(user_id)

    all_offers = is_all_offers_mode(keywords, cities)
    searches = _plan_searches(config, keywords, cities, all_offers)
    start_index, start_page = _cursor_start(config, searches) if all_offers else (0, 1)
    resume_at: tuple[int, int] | None = None

    def note(message: str | None) -> None:
        if message and len(errors) < 5:
            errors.append(message)

    stop = False
    for index in range(start_index, len(searches)):
        if stop:
            break
        search = searches[index]
        last_page = min(MAX_SEARCH_PAGES, -(-search.get('count', API_MAX_RESULTS) // SEARCH_PAGE_SIZE) or 1)
        for page in range(start_page if index == start_index else 1, last_page + 1):
            if pages_scanned >= MAX_PAGES_PER_RUN:
                resume_at, stop = (index, page), True
                break
            response = _fetch_with_retry(**search['query'], umkreis=search.get('umkreis'),
                                         remote=config.remote_only, page=page, limit=SEARCH_PAGE_SIZE)
            resume_at = (index, page)  # resume here if the run stops while on this page
            if not response or response['source'] == 'fallback_db':
                note('La source Arbeitsagentur est temporairement indisponible ; une nouvelle tentative aura '
                     'lieu automatiquement.')
                break
            provider_available = True
            pages_scanned += 1

            eligible = []
            for job in response['jobs']:
                if job['externalId'] in seen:
                    continue
                seen.add(job['externalId'])
                if not category_matches(job, categories) or not federal_state_matches(job, states):
                    continue
                if config.remote_only and not job['remote']:
                    continue
                if job['externalId'] in applied_ids:
                    already_applied += 1  # already done, not "ignored"
                    continue
                if job['externalId'] in ruled_out:
                    previously_ruled_out += 1
                    continue
                eligible.append(job)

            # Address look-ups (Arbeitsagentur details, then the company website) are free
            # and run in parallel; only offers with an address cost AI credits.
            batch = eligible[:max(0, MAX_DETAIL_LOOKUPS_PER_RUN - lookups)]
            lookups += len(batch)
            if len(batch) < len(eligible):
                stop = True
            for job in _resolve_addresses(batch):
                if sent >= APPLICATIONS_PER_RUN or attempts >= MAX_CANDIDATE_ATTEMPTS_PER_RUN:
                    stop = True
                    break
                if job.get('lookupFailed'):
                    lookup_errors += 1  # not remembered: checked again next run
                    continue
                if not job.get('contactEmail'):
                    without_email += 1
                    skipped += 1
                    _remember_skip(user_id, job['externalId'], 'NO_EMAIL')
                    continue
                if job.get('contactEmailSource') == 'company_website':
                    from_website += 1
                if not force and not AutoApplyConfig.objects.filter(id=config.id, enabled=True).exists():
                    stop = True
                    break

                attempts += 1
                try:
                    delivery = deliver_application(user_id, job, automated=True, enriched=True)
                except ApplicationMessageGenerationError as exc:
                    if exc.transient:
                        # OpenAI unreachable: stop now, nothing is ruled out, the next run retries.
                        attempts -= 1
                        note(str(exc))
                        stop = True
                        break
                    # This offer's letter failed the quality checks: try the next offer.
                    letter_failures += 1
                    skipped += 1
                    _remember_skip(user_id, job['externalId'], 'LETTER_FAILED')
                    note(str(exc))
                    if letter_failures >= MAX_LETTER_FAILURES_PER_RUN:
                        stop = True
                        break
                    continue
                except Exception as exc:  # noqa: BLE001
                    fatal_error = str(exc)
                    note(fatal_error)
                    skipped += 1
                    stop = True
                    break
                if delivery['success']:
                    sent += 1
                    applied_ids.add(job['externalId'])
                    deliveries.append({'title': job['title'], 'company': job['company'],
                                       'recipientEmail': delivery.get('recipientEmail'),
                                       'matchScore': delivery.get('matchScore')})
                    continue
                skipped += 1
                if delivery.get('reason') == 'DUPLICATE':
                    # Not a real attempt: no AI credits were used.
                    duplicates += 1
                    attempts -= 1
                    _remember_skip(user_id, job['externalId'], 'DUPLICATE')
                    continue
                note(delivery.get('error'))
                if delivery.get('haltAutoSending'):
                    smtp_halted = True
                    smtp_halt_reason = delivery.get('error') or \
                        'Limite SMTP détectée. L’auto-candidature a été arrêtée.'
                    stop = True
                    break
                if delivery.get('upgradeRequired'):
                    stop = True
                    break
            if stop:
                break
            resume_at = (index, page + 1)
            if len(response['jobs']) < SEARCH_PAGE_SIZE or page * SEARCH_PAGE_SIZE >= response['total']:
                resume_at = (index + 1, 1)
                break
        else:
            resume_at = (index + 1, 1)

    if all_offers:
        _save_cursor(config, searches, resume_at)

    if without_email:
        note(f'{without_email} offre(s) sans adresse e-mail, ni dans l’annonce ni sur le site de l’entreprise.')
    if sent:
        no_send_reason = None
    elif not provider_available:
        no_send_reason = 'La source d’offres est temporairement indisponible.'
    elif not seen:
        no_send_reason = 'Aucune offre ne correspond actuellement aux filtres enregistrés.'
    elif attempts:
        first_error = next((error for error in errors if 'adresse e-mail' not in error), None)
        no_send_reason = (f'{attempts} offre(s) avec une adresse e-mail trouvée(s), mais l’envoi n’a pas abouti'
                          + (f' : {first_error}' if first_error else '.'))
    else:
        no_send_reason = ('Aucune nouvelle offre avec une adresse e-mail n’a été trouvée, ni dans l’annonce ni sur le '
                          'site de l’entreprise. La prochaine exécution poursuivra avec d’autres offres.')
    return {
        'success': not smtp_halted and provider_available and not fatal_error,
        'sent': sent,
        'skipped': skipped,
        'checked': len(seen),
        'pagesScanned': pages_scanned,
        'mode': 'all_offers' if all_offers else 'keywords',
        'progress': _progress(searches, resume_at) if all_offers else None,
        'alreadyApplied': already_applied,
        'candidateAttempts': attempts,
        'withoutEmail': without_email,
        'emailsFromCompanyWebsites': from_website,
        'letterFailures': letter_failures,
        'duplicatesAvoided': duplicates,
        'lookupErrors': lookup_errors,
        'previouslyRuledOut': previously_ruled_out,
        'deliveries': deliveries,
        'errors': list(dict.fromkeys(errors)),
        'noSendReason': no_send_reason,
        'smtpHalted': smtp_halted,
        'smtpHaltReason': smtp_halt_reason if smtp_halted else None,
        'fatalError': fatal_error or None,
        'completedAt': _now_iso(),
    }


def run_due_auto_apply_jobs() -> dict:
    stale_before = timezone.now() - dt.timedelta(minutes=STALE_LOCK_MINUTES)
    AutoApplyConfig.objects.filter(running=True).filter(
        Q(run_started_at__isnull=True) | Q(run_started_at__lt=stale_before)
    ).update(running=False, run_started_at=None)
    due = list(
        AutoApplyConfig.objects.filter(enabled=True, running=False)
        .filter(Q(next_run_at__isnull=True) | Q(next_run_at__lte=timezone.now()))
        .values_list('user_id', flat=True)
    )
    results = [{'userId': user_id, 'result': run_auto_apply_for_user(user_id)} for user_id in due]
    return {'processed': len(due), 'results': results}


def public_auto_apply_config(config: AutoApplyConfig) -> dict:
    from azubora.services.auto_apply_schedule import parse_schedule_days
    from azubora.views.serializers import to_dict

    def parse(value: str) -> list:
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except ValueError:
            return [item.strip() for item in value.split(',') if item.strip()]

    data = to_dict(config)
    data.update({
        'keywords': parse(config.keywords),
        'cities': parse(config.cities),
        'federalStates': parse(config.federal_states),
        'categories': parse(config.categories),
        'scheduleDays': parse_schedule_days(config.schedule_days),
    })
    return data
