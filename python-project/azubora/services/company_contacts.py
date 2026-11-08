"""Find an application e-mail on the company's own website.

Most Arbeitsagentur offers do not publish an e-mail address. German company
websites must have an Impressum with contact details, and careers pages often
list a recruiting address. For a company name we:

1. guess its website from the name (``www.<name>.de`` / ``.com``);
2. accept the site only if its Impressum names the company (so a similarly
   named firm is never contacted);
3. pick a recruiting address (bewerbung@, ausbildung@, karriere@ …), falling
   back to a general one (info@, kontakt@ …) on the site's own domain.

Results are cached per company in ``CompanyContact`` and shared by all users.
``robots.txt`` is respected.
"""
import datetime as dt
import json
import logging
import re
import time
import unicodedata
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

import requests
from django.db import IntegrityError, OperationalError
from django.utils import timezone

from azubora.models import CompanyContact

logger = logging.getLogger(__name__)

USER_AGENT = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 '
              'AzuboraBot/1.0')
TIMEOUT = 10
# Upper bound for checking one company's website, so a slow network cannot stall a run.
COMPANY_LOOKUP_BUDGET_SECONDS = 60
MAX_SUBPAGES = 5
FOUND_TTL_DAYS = 60
NOT_FOUND_TTL_DAYS = 14

_EMAIL = re.compile(r'[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}', re.IGNORECASE)
_LEGAL_FORMS = re.compile(
    r'\b(ggmbh|gmbh|mbh|ag|se|kgaa|kg|ohg|ug|gbr|e\s?v|co|partg|ltd|inc|haftungsbeschraenkt|aoer|aor|'
    r'anstalt|des|der|die|oeffentlichen|rechts|und)\b')
# Words that do not identify a company on their own.
_GENERIC = {'gruppe', 'group', 'holding', 'deutschland', 'germany', 'standort', 'niederlassung', 'filiale',
            'unternehmensgruppe', 'service', 'services', 'verwaltung', 'zentrale', 'bereich', 'betrieb'}
_RECRUITING = ('bewerbung', 'bewerbungen', 'ausbildung', 'azubi', 'karriere', 'career', 'careers', 'jobs', 'job',
               'personal', 'personalabteilung', 'hr', 'recruiting', 'recruitment', 'stellen', 'talent')
_GENERAL = ('info', 'kontakt', 'contact', 'office', 'mail', 'post', 'zentrale', 'empfang', 'verwaltung')
_LINKS = re.compile(r'impressum|imprint|kontakt|contact|karriere|career|ausbildung|azubi|bewerb|jobs', re.IGNORECASE)


def _ascii(value: str) -> str:
    value = value.lower().replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    return ''.join(char for char in unicodedata.normalize('NFKD', value) if not unicodedata.combining(char))


def name_words(company: str) -> list[str]:
    text = _ascii(re.sub(r'\(.*?\)', ' ', company))
    text = re.sub(r'[.&+]', ' ', text)
    text = _LEGAL_FORMS.sub(' ', text)
    return [word for word in re.split(r'[^a-z0-9]+', text) if len(word) > 1]


def name_key(company: str) -> str:
    return ' '.join(name_words(company))[:200]


def distinctive_words(company: str) -> list[str]:
    words = [word for word in name_words(company) if word not in _GENERIC]
    return words[:2]


def candidate_sites(company: str) -> list[str]:
    words = distinctive_words(company)
    if not words:
        return []
    bases = [words[0]] if len(words) == 1 else [''.join(words), '-'.join(words), words[0]]
    sites = []
    for base in dict.fromkeys(bases):
        if 3 <= len(base) <= 40:
            sites += [f'https://www.{base}.de', f'https://www.{base}.com']
    return sites


def _names_company(text: str, company: str) -> bool:
    """The page names the company: its distinctive words appear together."""
    words = distinctive_words(company)
    if not words or (len(words) == 1 and len(words[0]) < 4):
        return False
    normalized = re.sub(r'[^a-z0-9]+', ' ', _ascii(text))
    phrase = r'\s?-?'.join(re.escape(word) for word in words)
    return re.search(rf'\b{phrase}\b', normalized) is not None


class LookupUnavailable(Exception):
    """No website could be reached at all (network problem): try again later."""


class _Fetcher:
    def __init__(self, budget_seconds: float = COMPANY_LOOKUP_BUDGET_SECONDS):
        self.deadline = time.monotonic() + budget_seconds
        self.responses = 0
        self.network_errors = 0
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': USER_AGENT, 'Accept-Language': 'de-DE,de;q=0.9'})
        self.robots: dict[str, RobotFileParser | None] = {}

    def allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        origin = f'{parts.scheme}://{parts.netloc}'
        if origin not in self.robots:
            parser = None
            try:
                response = self.session.get(f'{origin}/robots.txt', timeout=TIMEOUT)
                if response.ok:
                    parser = RobotFileParser()
                    parser.parse(response.text.splitlines())
            except requests.RequestException:
                pass
            self.robots[origin] = parser
        parser = self.robots[origin]
        return parser is None or parser.can_fetch('AzuboraBot', url)

    def get(self, url: str) -> requests.Response | None:
        if time.monotonic() > self.deadline or not self.allowed(url):
            return None
        response = None
        for _ in range(2):  # one retry for slow or flaky sites
            try:
                response = self.session.get(url, timeout=TIMEOUT, allow_redirects=True)
                self.responses += 1
                break
            except requests.RequestException:
                self.network_errors += 1
                continue
        if response is None:
            return None
        if not response.ok or 'html' not in response.headers.get('content-type', ''):
            return None
        return response


def _registrable_domain(host: str) -> str:
    parts = host.lower().removeprefix('www.').split('.')
    return '.'.join(parts[-2:])


_NEVER_USE = re.compile(
    r'^(datenschutz|privacy|dsb|dpo|presse|press|media|newsletter|no-?reply|donotreply|webmaster|admin|support|'
    r'abuse|security|invoice|rechnung|buchhaltung|accounting|einkauf|purchasing|sales|vertrieb|verkauf|shop|'
    r'order|bestellung|compliance|hinweisgeber|whistleblow|marketing|events?|spenden|fundraising|it|edv)\b',
    re.IGNORECASE)
_CAREER_PAGE = re.compile(r'bewerb|ausbildung|azubi|karriere|career|jobs|stellen', re.IGNORECASE)


def _brand(domain: str) -> str:
    return domain.split('.')[0]


def choose_email(emails, domain: str) -> str | None:
    """Pick the application address on the company's own (or sister) domain.

    Order: recruiting addresses (bewerbung@, ausbildung@ …), general ones (info@, kontakt@ …),
    then any other address except unsuitable ones (privacy, press, invoices …). Personal
    addresses are only used when they appear on a careers page.
    ``emails`` is a set of addresses or a dict ``{address: page_url}``.
    """
    pages = emails if isinstance(emails, dict) else {email: '' for email in emails}
    own: dict[str, str] = {}
    for raw, page in pages.items():
        email = raw.strip().strip('.').lower().removeprefix('%20')
        local, _, host = email.partition('@')
        same_site = host == domain or host.endswith('.' + domain) or _brand(_registrable_domain(host)) == _brand(domain)
        if not same_site or re.fullmatch(r'[0-9a-f]{16,}', local) or _NEVER_USE.match(local):
            continue
        own.setdefault(email, page)

    def first_label(email: str) -> str:
        return re.split(r'[._-]', email.split('@')[0])[0]

    def best(candidates):
        return sorted(candidates, key=lambda email: (not _CAREER_PAGE.search(own[email]), len(email), email))[0]

    for preferred in (_RECRUITING, _GENERAL):
        matches = [email for email in own if first_label(email) in preferred]
        if matches:
            return best(matches)
    role = [email for email in own if '.' not in email.split('@')[0] or not re.fullmatch(r'[a-z]+\.[a-z-]+', email.split('@')[0])]
    if role:
        return best(role)
    personal_on_career_page = [email for email in own if _CAREER_PAGE.search(own[email])]
    return best(personal_on_career_page) if personal_on_career_page else None


def _page_priority(url: str) -> int:
    path = urlsplit(url).path.lower()
    if re.search(r'impressum|imprint', path):
        return 0
    if re.search(r'bewerb|ausbildung|azubi|karriere|career|jobs', path):
        return 1
    return 2


def suggested_sites(company: str, location: str = '') -> list[str]:
    """Ask the AI for the official website when the name does not reveal it.

    Suggestions are only hints: a site is used only if its Impressum names the company.
    """
    from azubora.services import ai

    if not ai.openai_configured():
        return []
    try:
        response = ai.client().chat.completions.create(
            model=ai.OPENAI_MODEL,
            messages=[
                {'role': 'system', 'content': (
                    'You know German companies and their official websites. Answer only with JSON '
                    '{"domains": [...]}: up to 3 likely official domains (e.g. "uk-koeln.de"), most likely '
                    'first, or an empty list if you do not know. No job boards or directories.')},
                {'role': 'user', 'content': f'Company: {company}\nLocation: {location or "Germany"}'},
            ],
            response_format={'type': 'json_object'},
            temperature=0,
            max_tokens=80,
        )
        domains = json.loads(response.choices[0].message.content or '{}').get('domains') or []
    except Exception:  # noqa: BLE001 - suggestions are optional
        return []
    sites = []
    for domain in domains[:3]:
        domain = re.sub(r'^https?://', '', str(domain).strip().lower()).split('/')[0].removeprefix('www.')
        if re.fullmatch(r'[a-z0-9-]+(\.[a-z0-9-]+)+', domain):
            sites.append(f'https://www.{domain}')
    return sites


def _search_site(company: str, fetcher: _Fetcher, location: str = '') -> tuple[str, str, str] | None:
    """Return ``(website, email, source_url)`` for a verified company website.

    Sites guessed from the name are tried first (free); AI suggestions only when those fail.
    """
    guessed = candidate_sites(company)
    for site in guessed:
        found = _check_site(company, fetcher, site)
        if found:
            return found
    for site in suggested_sites(company, location):
        if site not in guessed:
            found = _check_site(company, fetcher, site)
            if found:
                return found
    return None


def _check_site(company: str, fetcher: _Fetcher, site: str) -> tuple[str, str, str] | None:
    home = fetcher.get(site)
    if home is None:
        return None
    links = re.findall(r'href=["\']([^"\'#]+)["\']', home.text, re.IGNORECASE)
    sub_urls = [urljoin(home.url, link) for link in links if _LINKS.search(link)]
    domain = _registrable_domain(urlsplit(home.url).hostname or '')
    sub_urls = [url for url in dict.fromkeys(sub_urls) if _registrable_domain(urlsplit(url).hostname or '') == domain]
    if not any(re.search(r'impressum|imprint', url, re.IGNORECASE) for url in sub_urls):
        sub_urls.append(urljoin(home.url, '/impressum'))
    # Impressum first (it is usually the last footer link), then careers pages, then contact.
    sub_urls = sorted(sub_urls, key=_page_priority)[:MAX_SUBPAGES]
    pages = [home] + [page for page in (fetcher.get(url) for url in sub_urls) if page]
    imprint = [page for page in pages if re.search(r'impressum|imprint', page.url, re.IGNORECASE)]
    # Only trust a site whose Impressum names the company.
    if not imprint or not any(_names_company(page.text, company) for page in imprint):
        return None
    emails: dict[str, str] = {}
    for page in pages:
        for email in _EMAIL.findall(page.text):
            if not re.search(r'\.(png|jpe?g|gif|svg|webp)$', email, re.IGNORECASE):
                emails.setdefault(email.lower(), page.url)
    chosen = choose_email(emails, domain)
    if not chosen:
        return None
    source = next((url for email, url in emails.items() if email.endswith(chosen)), home.url)
    return home.url, chosen, source


def find_company_email(company: str, location: str = '') -> dict | None:
    """Cached lookup; returns ``{'email', 'website', 'sourceUrl'}`` or ``None``."""
    key = name_key(company)
    if not key:
        return None
    cached = CompanyContact.objects.filter(name_key=key).first()
    if cached is not None:
        ttl = FOUND_TTL_DAYS if cached.status == 'FOUND' else NOT_FOUND_TTL_DAYS
        if cached.checked_at > timezone.now() - dt.timedelta(days=ttl):
            return {'email': cached.email, 'website': cached.website, 'sourceUrl': cached.source_url} \
                if cached.status == 'FOUND' else None
    fetcher = _Fetcher()
    try:
        found = _search_site(company, fetcher, location)
    except Exception:  # noqa: BLE001 - a broken website must never stop the bot
        logger.warning('Company website lookup failed for %s', company, exc_info=True)
        found = None
    if not found and fetcher.responses == 0 and fetcher.network_errors:
        raise LookupUnavailable(company)  # nothing reachable: do not cache "not found"
    values = {
        'company_name': company[:300],
        'status': 'FOUND' if found else 'NOT_FOUND',
        'website': found[0] if found else None,
        'email': found[1] if found else None,
        'source_url': found[2] if found else None,
        'checked_at': timezone.now(),
    }
    try:
        CompanyContact.objects.update_or_create(name_key=key, defaults=values)
    except (IntegrityError, OperationalError):
        # Caching is best effort: never lose a found address because the cache write failed.
        logger.warning('Company contact cache write failed for %s', company, exc_info=True)
    return {'email': found[1], 'website': found[0], 'sourceUrl': found[2]} if found else None


def resolve_application_email(job: dict) -> dict:
    """Offer details from the Arbeitsagentur, then the company website as fallback."""
    from azubora.services.arbeitsagentur import enrich_offer

    job = enrich_offer(job)
    if job.get('contactEmail'):
        return {**job, 'contactEmailSource': 'arbeitsagentur'}
    try:
        found = find_company_email(job.get('company') or '', job.get('location') or '')
    except LookupUnavailable:
        return {**job, 'lookupFailed': True}
    if found:
        job = {key: value for key, value in job.items() if key != 'lookupFailed'}
        return {**job, 'contactEmail': found['email'], 'contactEmailVerified': True,
                'contactEmailSource': 'company_website', 'contactEmailSourceUrl': found['sourceUrl']}
    return job
