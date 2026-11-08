"""Client for the Bundesagentur für Arbeit job search API (training offers).

Job items are plain dicts with the camelCase keys the UI expects.
"""
import base64
import hashlib
import datetime as dt
import logging
import random
import re
import string
from urllib.parse import quote, urlencode

import requests
from django.core.cache import cache

from azubora.views.serializers import iso

logger = logging.getLogger(__name__)

SEARCH_URL = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs'
DETAILS_URL = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/'
SEARCH_TIMEOUT = 15
DETAIL_TIMEOUT = 10
DETAIL_ATTEMPTS = 2
SEARCH_CACHE_SECONDS = 180

FEDERAL_STATE_NAMES = {
    'BADEN_WUERTTEMBERG': 'Baden-Württemberg',
    'BAYERN': 'Bayern',
    'BERLIN': 'Berlin',
    'BRANDENBURG': 'Brandenburg',
    'BREMEN': 'Bremen',
    'HAMBURG': 'Hamburg',
    'HESSEN': 'Hessen',
    'MECKLENBURG_VORPOMMERN': 'Mecklenburg-Vorpommern',
    'NIEDERSACHSEN': 'Niedersachsen',
    'NORDRHEIN_WESTFALEN': 'Nordrhein-Westfalen',
    'RHEINLAND_PFALZ': 'Rheinland-Pfalz',
    'SAARLAND': 'Saarland',
    'SACHSEN': 'Sachsen',
    'SACHSEN_ANHALT': 'Sachsen-Anhalt',
    'SCHLESWIG_HOLSTEIN': 'Schleswig-Holstein',
    'THUERINGEN': 'Thüringen',
}

_EMAIL_IN_TEXT = re.compile(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}', re.IGNORECASE)


def federal_state_name(value) -> str:
    raw = str(value or '').strip()
    return FEDERAL_STATE_NAMES.get(raw.upper()) or raw or 'Deutschland'


def format_de_number(value: float) -> str:
    """``toLocaleString('de-DE', {maximumFractionDigits: 2})``."""
    rounded = round(value, 2)
    whole, _, fraction = f'{rounded:,.2f}'.partition('.')
    whole = whole.replace(',', '.')
    fraction = fraction.rstrip('0')
    return f'{whole},{fraction}' if fraction else whole


def training_salary(item: dict) -> str:
    try:
        first_year = float(item.get('ausbildungsverguetungJahr1'))
    except (TypeError, ValueError):
        first_year = 0
    if first_year > 0:
        return f'{format_de_number(first_year)} € / Monat (1. Jahr)'
    return item.get('verguetung') or 'Keine Angabe'


def detect_category(title: str, beruf: str | None = None) -> str:
    combined = f'{title} {beruf or ""}'.lower()
    if any(word in combined for word in ('informatik', 'software', 'developer', 'it', 'system')):
        return 'IT & Software'
    if any(word in combined for word in ('kaufmann', 'büro', 'handels', 'bank', 'vertrieb')):
        return 'Kaufmännisch'
    if any(word in combined for word in ('mechatroniker', 'elektroniker', 'mechaniker', 'handwerk', 'anlagen')):
        return 'Handwerk & Industrie'
    if any(word in combined for word in ('pflege', 'medizin', 'gesundheit', 'arzt', 'apotheke')):
        return 'Gesundheit & Pflege'
    if any(word in combined for word in ('gestaltung', 'medien', 'design', 'marketing')):
        return 'Design & Medien'
    return 'Berufsausbildung'


def _now_iso() -> str:
    return iso(dt.datetime.now(dt.timezone.utc))


def _job_from_api(item: dict, *, wo: str, bundesland: str, category: str, was: str) -> dict:
    refnr = item.get('referenznummer') or item.get('refnr') or ''.join(
        random.choices(string.ascii_lowercase + string.digits, k=6))
    title = (item.get('stellenangebotsTitel') or item.get('titel') or item.get('hauptberuf')
             or item.get('beruf') or 'Ausbildungsstelle')
    company = item.get('firma') or item.get('arbeitgeber') or 'Deutsches Unternehmen'
    locations = item.get('stellenlokationen') or []
    address = (locations[0].get('adresse') if locations and isinstance(locations[0], dict) else None) \
        or item.get('arbeitsort') or {}
    location = address.get('ort') or wo or 'Deutschland'
    home_office = item.get('homeofficemoeglich')
    if home_office is None:
        home_office = item.get('homeoffice')
    lowered_title = title.lower()
    remote = bool(home_office) or 'remote' in lowered_title or 'homeoffice' in lowered_title
    # Only expose an address provided by the source. Never guess a company address.
    contact = item.get('kontakt') if isinstance(item.get('kontakt'), dict) else {}
    contact_email = contact.get('email') or item.get('arbeitgeberMail') or item.get('email') or None
    occupation = item.get('hauptberuf') or item.get('beruf') or title
    entry = item.get('eintrittszeitraum') if isinstance(item.get('eintrittszeitraum'), dict) else {}
    start = entry.get('von') or item.get('eintrittsdatum') or ''
    publication = item.get('veroeffentlichungszeitraum') if isinstance(
        item.get('veroeffentlichungszeitraum'), dict) else {}
    part_time = item.get('arbeitszeitVollzeit') is False or item.get('arbeitszeit') == 'tz'
    return {
        'id': f'BA-{refnr}',
        'externalId': f'BA-{refnr}',
        'title': title,
        'beruf': occupation,
        'company': company,
        'contactEmail': contact_email,
        'contactEmailVerified': bool(contact_email),
        'location': location,
        'postalCode': str(address.get('plz') or ''),
        'federalState': federal_state_name(address.get('region') or address.get('land') or bundesland),
        'category': category or detect_category(title, item.get('beruf')),
        'contractType': 'Berufsausbildung',
        'workTime': 'Teilzeit' if part_time else 'Vollzeit',
        'remote': remote,
        'salary': training_salary(item),
        'description': (
            f'Ausbildungsstelle als {occupation} bei {company} in {location}. '
            f'Beginn: {start or "nicht angegeben"}. Offizielles Angebot der Bundesagentur für Arbeit.'
        ),
        'requirements': ('Schulabschluss (Hauptschule, Realschule oder Abitur), Motivation, '
                         'Lernbereitschaft und Teamfähigkeit.'),
        'url': f'https://web.arbeitsagentur.de/ausbildungssuche/berufsausbildung-suche/detail/{refnr}',
        'publishedAt': (item.get('datumErsteVeroeffentlichung') or publication.get('von')
                        or item.get('aktuelleVeroeffentlichungsdatum') or _now_iso()),
        'startDate': start,
        'searchKeyword': was,
    }


def fetch_offers(*, was: str = '', wo: str = '', umkreis: int | None = None, bundesland: str = '',
                 contract_type: str = '', remote: bool = False, category: str = '', page: int = 1,
                 limit: int = 25, filters: dict | None = None) -> dict:
    """Search training offers. Returns ``{'jobs', 'total', 'source'}``.

    ``filters`` are extra API facet filters (``eintrittsdatum``, ``berufsfeld``…) used to
    split the full set into slices the API can page through.
    """
    params = {
        'angebotsart': '4',  # 4 = Berufsausbildung
        'page': str(page),
        'size': str(limit),
    }
    if was.strip() or not filters:
        params['was'] = was.strip() or 'Ausbildung'
    params.update(filters or {})
    if wo.strip():
        params['wo'] = wo.strip()
    if umkreis:
        params['umkreis'] = str(umkreis)
    if contract_type == 'Vollzeit':
        params['arbeitszeit'] = 'vz'
    elif contract_type == 'Teilzeit':
        params['arbeitszeit'] = 'tz'
    url = f'{SEARCH_URL}?{urlencode(params)}'

    cache_key = 'arbeitsagentur:search:' + hashlib.sha256(url.encode()).hexdigest()
    try:
        data = cache.get(cache_key)
        if data is None:
            response = requests.get(url, headers={
                'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                               '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
                'X-API-Key': 'jobboerse-jobsuche',
                'Accept': 'application/json',
            }, timeout=SEARCH_TIMEOUT)
            if response.ok:
                data = response.json()
                cache.set(cache_key, data, SEARCH_CACHE_SECONDS)
        if data is not None:
            raw_jobs = data.get('ergebnisliste') or data.get('stellenangebote') or []
            total_count = data.get('maxErgebnisse') or len(raw_jobs)
            live_jobs = [
                _job_from_api(item, wo=wo, bundesland=bundesland, category=category, was=was)
                for item in raw_jobs if isinstance(item, dict)
            ]

            def keep(job: dict) -> bool:
                if bundesland and job['federalState'] != bundesland:
                    return False
                if remote and not job['remote']:
                    return False
                if category and category != 'Alle' and category.lower() not in job['category'].lower():
                    return False
                return True

            jobs = [job for job in live_jobs if keep(job)]
            return {
                'jobs': jobs,
                'total': total_count if len(jobs) == len(live_jobs) else len(jobs),
                'source': 'live_api',
            }
    except (requests.RequestException, ValueError) as exc:
        logger.warning('Official Arbeitsagentur REST API error, falling back: %s', exc)

    fallback = sample_fallback_jobs(was)
    return {'jobs': fallback, 'total': len(fallback), 'source': 'fallback_db'}


def sample_fallback_jobs(was: str = '') -> list[dict]:
    now = _now_iso()
    return [
        {
            'id': 'BA-10001-1003343846-S',
            'externalId': 'BA-10001-1003343846-S',
            'title': 'Fachinformatiker/in Systemintegration',
            'company': 'Ingenieurbüro Axel C. Rahn GmbH',
            'contactEmail': None,
            'contactEmailVerified': False,
            'location': 'Berlin',
            'postalCode': '10785',
            'federalState': 'Berlin',
            'category': 'IT & Software',
            'contractType': 'Berufsausbildung',
            'workTime': 'Vollzeit',
            'remote': True,
            'salary': '1.250 € / Monat',
            'description': ('Ausbildung im Bereich Systemintegration, Netzwerk-Administration und '
                            'IT-Infrastruktur in Berlin Tiergarten.'),
            'requirements': 'Abitur oder Realschulabschluss, gute Computerkenntnisse.',
            'url': 'https://web.arbeitsagentur.de/ausbildungssuche/berufsausbildung-suche/detail/10001-1003343846-S',
            'publishedAt': now,
            'searchKeyword': was or 'Fachinformatiker',
        },
        {
            'id': 'BA-18024-100PJ000Reo32-S',
            'externalId': 'BA-18024-100PJ000Reo32-S',
            'title': 'Ausbildung zum Pflegefachassistenten (m/w/d)',
            'company': 'Wohnstift St. Clemens',
            'contactEmail': None,
            'contactEmailVerified': False,
            'location': 'Telgte',
            'postalCode': '48291',
            'federalState': 'Nordrhein-Westfalen',
            'category': 'Gesundheit & Pflege',
            'contractType': 'Berufsausbildung',
            'workTime': 'Vollzeit',
            'remote': False,
            'salary': '1.340 € / Monat',
            'description': 'Generalistische Pflegeausbildung mit Betreuung von Senioren und kranken Menschen.',
            'requirements': 'Mittlerer Schulabschluss, Einfühlungsvermögen, Zuverlässigkeit.',
            'url': 'https://web.arbeitsagentur.de/ausbildungssuche/berufsausbildung-suche/detail/18024-100PJ000Reo32-S',
            'publishedAt': now,
            'searchKeyword': was or 'Pflege',
        },
    ]


def find_email_in_details(value) -> str | None:
    if isinstance(value, str):
        match = _EMAIL_IN_TEXT.search(value)
        return match.group(0) if match else None
    if isinstance(value, list):
        for item in value:
            email = find_email_in_details(item)
            if email:
                return email
        return None
    if isinstance(value, dict):
        for child in value.values():
            email = find_email_in_details(child)
            if email:
                return email
    return None


def _read_string(details: dict, keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = details.get(key) if isinstance(details, dict) else None
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def enrich_offer(job: dict) -> dict:
    """Load the offer details to find the published application e-mail address."""
    if not str(job.get('externalId', '')).startswith('BA-'):
        return {**job, 'contactEmailVerified': bool(job.get('contactEmail'))}
    reference = job['externalId'][3:]
    encoded = base64.b64encode(reference.encode('utf-8')).decode('ascii')
    for _ in range(DETAIL_ATTEMPTS):
        try:
            response = requests.get(
                DETAILS_URL + quote(encoded, safe=''),
                headers={'X-API-Key': 'jobboerse-jobsuche', 'Accept': 'application/json'},
                timeout=DETAIL_TIMEOUT,
            )
            if 400 <= response.status_code < 500:
                # The offer is gone or not public: a definite answer, not a network problem.
                return {**job, 'contactEmail': None, 'contactEmailVerified': False}
            if not response.ok:
                continue
            details = response.json()
        except (requests.RequestException, ValueError):
            continue  # Retry a transient timeout or connection failure once.
        contact_email = find_email_in_details(details)
        return {
            **job,
            'contactEmail': contact_email,
            'contactEmailVerified': bool(contact_email),
            'description': _read_string(details, ('stellenangebotsBeschreibung', 'stellenbeschreibung'))
            or job.get('description', ''),
            'requirements': _read_string(details, ('anforderungen', 'anforderungsprofil'))
            or job.get('requirements', ''),
        }
    # Every attempt failed (network or server error): unknown, not "no e-mail".
    return {**job, 'contactEmail': None, 'contactEmailVerified': False, 'lookupFailed': True}


# Full coverage -------------------------------------------------------------------------------
# The API returns at most 100 pages of 100 offers (10,000) per search. To reach every training
# offer, the full set is split with facet filters into slices of at most 10,000 offers each.
API_MAX_RESULTS = 10_000
# Order matters: dimensions that cover every offer come first; the last ones (top-200 postal
# codes, top-100 employers) only break up the few slices still above 10,000.
SPLIT_DIMENSIONS = ('eintrittsdatum', 'ausbildungsart', 'externestellenboersen', 'arbeitszeit', 'schulbildung',
                    'berufsfeld', 'branche', 'arbeitsort_plz', 'arbeitgeber')
COVERAGE_PLAN_CACHE_SECONDS = 6 * 3600


def search_facets(filters: dict) -> tuple[int, dict]:
    """Total and facet counts for a filtered search (one tiny request)."""
    params = {'angebotsart': '4', 'page': '1', 'size': '1', **filters}
    response = requests.get(SEARCH_URL, params=params, headers={
        'X-API-Key': 'jobboerse-jobsuche', 'Accept': 'application/json'}, timeout=SEARCH_TIMEOUT)
    response.raise_for_status()
    data = response.json()
    return int(data.get('maxErgebnisse') or 0), data.get('facetten') or {}


def _split(filters: dict, total: int, facets: dict, slices: list[dict]) -> None:
    if total <= API_MAX_RESULTS:
        slices.append({'filters': filters, 'count': total})
        return
    best = None
    for dimension in SPLIT_DIMENSIONS:
        if dimension in filters:
            continue
        counts = {key: value for key, value in (facets.get(dimension, {}).get('counts') or {}).items() if value > 0}
        if not counts or max(counts.values()) >= total:
            continue
        coverage = min(sum(counts.values()), total) / total
        # Prefer a dimension that covers every offer, then the one leaving the smallest slice.
        rank = (coverage >= 0.999, coverage, -max(counts.values()))
        if best is None or rank > best[0]:
            best = (rank, dimension, counts)
    if best is None:
        slices.append({'filters': filters, 'count': min(total, API_MAX_RESULTS)})
        return
    _, dimension, counts = best
    for value, count in sorted(counts.items()):
        child = {**filters, dimension: value}
        if count <= API_MAX_RESULTS:
            slices.append({'filters': child, 'count': count})
        else:
            child_total, child_facets = search_facets(child)
            _split(child, child_total, child_facets, slices)


def coverage_plan() -> dict:
    """Slices that together cover (nearly) every training offer in Germany. Cached for 6 hours."""
    cached = cache.get('arbeitsagentur:coverage-plan')
    if cached:
        return cached
    total, facets = search_facets({})
    slices: list[dict] = []
    _split({}, total, facets, slices)
    for item in slices:
        item['key'] = '&'.join(f'{key}={value}' for key, value in sorted(item['filters'].items()))
    plan = {'total': total, 'covered': sum(item['count'] for item in slices), 'slices': slices}
    cache.set('arbeitsagentur:coverage-plan', plan, COVERAGE_PLAN_CACHE_SECONDS)
    return plan
