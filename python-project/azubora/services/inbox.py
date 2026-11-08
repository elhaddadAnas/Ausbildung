"""IMAP synchronisation: attach company replies to applications and analyse them."""
import datetime as dt
import email
import html as html_lib
import imaplib
import json
import logging
import re
from email import policy
from email.utils import getaddresses, parsedate_to_datetime

from django.db.models import Q
from django.utils import timezone

from azubora.models import ApplicationMessage, JobApplication, SmtpConfig
from azubora.services.ai import ReplyParams, analyze_inbound_reply, extract_http_links
from azubora.services.smtp import assert_safe_mail_host, decrypt_string, is_valid_email, tls_context

logger = logging.getLogger(__name__)

INITIAL_LOOKBACK_DAYS = 30
SYNC_OVERLAP_MINUTES = 10
SYNC_INTERVAL_MINUTES = 1
STALE_SYNC_MINUTES = 10
MAX_MESSAGES_PER_SYNC = 100
MAX_MESSAGE_BYTES = 5_000_000

_REPLY_SEPARATORS = [
    re.compile(pattern, re.IGNORECASE | re.MULTILINE) for pattern in (
        r'^\s*On .+wrote:\s*$',
        r'^\s*Am .+schrieb .+:\s*$',
        r'^\s*Le .+a écrit\s*:\s*$',
        r'^\s*From:\s.+$',
        r'^\s*Von:\s.+$',
        r'^\s*-{2,}\s*Original Message\s*-{2,}\s*$',
        r'^\s*-{2,}\s*Ursprüngliche Nachricht\s*-{2,}\s*$',
    )
]
_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']


def normalize_subject(value: str | None) -> str:
    value = re.sub(r'^\s*((re|aw|wg|fw|fwd)\s*:\s*)+', '', str(value or ''), flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', value).strip().lower()


def clean_message_body(value: str | None) -> str:
    normalized = str(value or '').replace('\r\n', '\n').replace(' ', ' ').strip()
    if not normalized:
        return '(Message sans contenu texte)'
    end = len(normalized)
    for separator in _REPLY_SEPARATORS:
        match = separator.search(normalized)
        if match:
            end = min(end, match.start())
    trimmed = re.sub(r'\n{3,}', '\n\n', normalized[:end]).strip()[:30_000]
    return trimmed or normalized[:30_000]


def html_to_text(value: str) -> str:
    value = re.sub(r'(?is)<(script|style|head).*?</\1>', ' ', value)
    value = re.sub(r'(?i)<br\s*/?>|</p>|</div>|</li>|</tr>|</h[1-6]>', '\n', value)
    value = re.sub(r'<[^>]+>', ' ', value)
    value = html_lib.unescape(value)
    value = re.sub(r'[ \t]+', ' ', value)
    return re.sub(r'\n\s*\n\s*', '\n\n', value).strip()


def inbox_settings(config: SmtpConfig) -> dict | None:
    provider = config.provider.lower()
    host, port, secure = (config.imap_host or '').strip() or None, config.imap_port or 993, config.imap_secure
    if provider == 'gmail':
        host, port, secure = 'imap.gmail.com', 993, True
    elif provider == 'outlook':
        host, port, secure = 'outlook.office365.com', 993, True
    password = decrypt_string(config.auth_pass_encrypted)
    if not host or not is_valid_email(config.auth_user) or not password:
        return None
    return {'provider': provider, 'host': host, 'port': port, 'secure': secure,
            'user': config.auth_user, 'password': password}


def friendly_inbox_error(error: BaseException, provider: str) -> str:
    message = str(error)
    lowered = message.lower()
    if any(word in lowered for word in ('auth', 'credentials', 'login')):
        if provider == 'gmail':
            return ('Connexion Gmail IMAP refusée. Vérifiez le mot de passe d’application et que l’accès IMAP '
                    'est autorisé.')
        return 'Connexion IMAP refusée. Vérifiez les identifiants et les autorisations de la boîte e-mail.'
    if isinstance(error, TimeoutError) or 'timeout' in lowered or 'timed out' in lowered:
        return 'Le serveur IMAP ne répond pas.'
    return message or 'La synchronisation de la boîte e-mail a échoué.'


def find_application(applications: list[JobApplication], from_email: str, subject: str,
                     references: list[str]) -> JobApplication | None:
    reference_set = {value.strip() for value in references if value and value.strip()}
    for application in applications:
        if any(message.message_id and message.message_id in reference_set for message in application.thread):
            return application
    sender = from_email.strip().lower()
    incoming = normalize_subject(subject)
    for application in applications:
        contact = (application.job_offer.contact_email or '').strip().lower()
        if contact == sender and any(normalize_subject(message.subject) == incoming for message in application.thread):
            return application
    for application in applications:
        title = normalize_subject(application.job_offer.title)
        company = normalize_subject(application.job_offer.company)
        if incoming and (title in incoming or (len(company) >= 4 and company in incoming)):
            return application
    return None


def _valid_date(value) -> dt.datetime | None:
    if not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)


def analysis_fields(analysis: dict) -> dict:
    appointment = analysis.get('appointment') or {}
    return {
        'ai_summary': analysis['summary'],
        'reply_type': analysis['replyType'],
        'action_items': json.dumps(analysis['actionItems'], ensure_ascii=False),
        'detected_links': json.dumps(analysis['links'], ensure_ascii=False),
        'analysis_status': analysis['analysisStatus'],
        'appointment_at': _valid_date(appointment.get('startAt')),
        'appointment_end_at': _valid_date(appointment.get('endAt')),
        'appointment_timezone': appointment.get('timezone') or None,
        'appointment_location': appointment.get('location') or None,
        'appointment_link': appointment.get('meetingUrl') or None,
        'analyzed_at': timezone.now(),
    }


def _should_mark_interview(analysis: dict, status: str) -> bool:
    return (analysis['replyType'] == 'INTERVIEW' and analysis['analysisStatus'] == 'COMPLETED'
            and status not in ('OFFER', 'REJECTED'))


def analyze_stored_inbound_messages(user_id: str) -> int:
    pending = (ApplicationMessage.objects.filter(user_id=user_id, direction='INBOUND', analyzed_at__isnull=True)
               .select_related('application__job_offer').order_by('-sent_at')[:25])
    count = 0
    for message in pending:
        analysis = analyze_inbound_reply(ReplyParams(
            company_name=message.application.job_offer.company,
            job_title=message.application.job_offer.title,
            from_email=message.from_email,
            subject=message.subject,
            body=message.body_text,
            received_at=message.sent_at,
        ), message.user_id)
        stored = analysis_fields(analysis)
        ApplicationMessage.objects.filter(id=message.id).update(**stored)
        if _should_mark_interview(analysis, message.application.status):
            update = {'status': 'INTERVIEW'}
            if stored['appointment_at']:
                update['interview_date'] = stored['appointment_at']
            JobApplication.objects.filter(id=message.application_id).update(**update)
        count += 1
    return count


def _connect(settings: dict) -> imaplib.IMAP4:
    if settings['secure']:
        client = imaplib.IMAP4_SSL(settings['host'], settings['port'], ssl_context=tls_context(), timeout=30)
    else:
        client = imaplib.IMAP4(settings['host'], settings['port'], timeout=30)
        client.starttls(ssl_context=tls_context())
    client.login(settings['user'], settings['password'])
    return client


def _imap_since(moment: dt.datetime) -> str:
    return f'{moment.day:02d}-{_MONTHS[moment.month - 1]}-{moment.year}'


def _message_text(parsed: email.message.EmailMessage) -> tuple[str, str]:
    html_body = ''
    html_part = parsed.get_body(preferencelist=('html',))
    if html_part is not None:
        try:
            html_body = html_part.get_content()
        except (LookupError, ValueError):
            html_body = ''
    text_part = parsed.get_body(preferencelist=('plain',))
    text = ''
    if text_part is not None:
        try:
            text = text_part.get_content()
        except (LookupError, ValueError):
            text = ''
    if not text and html_body:
        text = html_to_text(html_body)
    return text, html_body


def _fetch_messages(client: imaplib.IMAP4, since: dt.datetime):
    status, data = client.uid('SEARCH', None, 'SINCE', _imap_since(since))
    if status != 'OK' or not data or not data[0]:
        return
    uids = data[0].split()[-MAX_MESSAGES_PER_SYNC:]
    for uid in uids:
        status, parts = client.uid('FETCH', uid, f'(BODY.PEEK[]<0.{MAX_MESSAGE_BYTES}>)')
        if status != 'OK':
            continue
        for part in parts:
            if isinstance(part, tuple) and len(part) == 2:
                yield uid.decode(), part[1]
                break


def sync_mailbox_for_user(user_id: str) -> dict:
    config = SmtpConfig.objects.filter(user_id=user_id).first()
    if config is None or not config.active or not config.imap_active or not config.is_tested:
        return {'success': False, 'skipped': True,
                'error': 'Activez et testez la messagerie avant de synchroniser les réponses.'}
    settings = inbox_settings(config)
    if settings is None:
        return {'success': False, 'skipped': True,
                'error': 'Configurez un serveur IMAP valide pour recevoir les réponses.'}
    if not SmtpConfig.objects.filter(id=config.id, imap_syncing=False, imap_active=True).update(
            imap_syncing=True, imap_sync_started_at=timezone.now()):
        return {'success': True, 'skipped': True, 'received': 0, 'message': 'Synchronisation déjà en cours.'}

    applications = list(
        JobApplication.objects.filter(user_id=user_id, applied_at__isnull=False)
        .select_related('job_offer').order_by('-applied_at')
    )
    for application in applications:
        application.thread = list(application.messages.order_by('sent_at').only('message_id', 'subject'))

    received = analyzed = 0
    client = None
    try:
        analyzed = analyze_stored_inbound_messages(user_id)
        if not applications:
            return {'success': True, 'received': 0, 'analyzed': analyzed,
                    'message': f'{analyzed} ancienne(s) réponse(s) analysée(s).' if analyzed
                    else 'Aucune candidature envoyée à synchroniser.'}

        assert_safe_mail_host(settings['host'])
        client = _connect(settings)
        client.select('INBOX', readonly=True)
        since = (config.last_imap_sync_at - dt.timedelta(minutes=SYNC_OVERLAP_MINUTES)) if config.last_imap_sync_at \
            else timezone.now() - dt.timedelta(days=INITIAL_LOOKBACK_DAYS)
        own_addresses = {config.auth_user.lower(), config.from_email.lower()}

        for uid, source in _fetch_messages(client, since):
            try:
                parsed = email.message_from_bytes(source, policy=policy.default)
                senders = getaddresses([str(parsed.get('From', ''))])
                from_email = senders[0][1].strip() if senders else ''
                if not is_valid_email(from_email) or from_email.lower() in own_addresses:
                    continue
                real_id = str(parsed.get('Message-ID', '')).strip() or None
                stored_id = real_id or f'imap:{config.id}:{uid}'
                if ApplicationMessage.objects.filter(message_id=stored_id).exists():
                    continue
                in_reply_to = str(parsed.get('In-Reply-To', '')).strip() or None
                references = [in_reply_to] if in_reply_to else []
                references += str(parsed.get('References', '')).split()
                subject = str(parsed.get('Subject', '')).strip() or '(Sans objet)'
                application = find_application(applications, from_email, subject, references)
                if application is None:
                    continue

                recipients = [address for _, address in getaddresses(parsed.get_all('To', [])) if address]
                text, html_body = _message_text(parsed)
                body = clean_message_body(text)
                try:
                    received_at = parsedate_to_datetime(str(parsed.get('Date'))) if parsed.get('Date') else None
                except (TypeError, ValueError):
                    received_at = None
                if received_at is None:
                    received_at = timezone.now()
                elif received_at.tzinfo is None:
                    received_at = received_at.replace(tzinfo=dt.timezone.utc)
                analysis = analyze_inbound_reply(ReplyParams(
                    company_name=application.job_offer.company,
                    job_title=application.job_offer.title,
                    from_email=from_email,
                    subject=subject,
                    body=body,
                    received_at=received_at,
                    additional_links=extract_http_links(html_body),
                ), user_id)
                stored = analysis_fields(analysis)
                ApplicationMessage.objects.create(
                    application_id=application.id, user_id=user_id, direction='INBOUND', message_id=stored_id,
                    in_reply_to=in_reply_to, from_email=from_email,
                    to_email=', '.join(recipients) or config.from_email, subject=subject, body_text=body,
                    sent_at=received_at, **stored)
                update: dict = {}
                if _should_mark_interview(analysis, application.status):
                    update['status'] = 'INTERVIEW'
                    application.status = 'INTERVIEW'
                    if stored['appointment_at']:
                        update['interview_date'] = stored['appointment_at']
                        application.interview_date = stored['appointment_at']
                JobApplication.objects.filter(id=application.id).update(**update)
                analyzed += 1
                received += 1
            except Exception:  # noqa: BLE001 - one unreadable message must not stop the sync
                logger.warning('Skipping unreadable inbox message.', exc_info=True)

        if received:
            message = f'{received} nouvelle(s) réponse(s) synchronisée(s) et analysée(s).'
        elif analyzed:
            message = f'{analyzed} réponse(s) analysée(s).'
        else:
            message = 'Aucune nouvelle réponse.'
        return {'success': True, 'received': received, 'analyzed': analyzed, 'message': message}
    except Exception as exc:  # noqa: BLE001
        return {'success': False, 'received': received, 'analyzed': analyzed,
                'error': str(exc) if isinstance(exc, ValueError) else friendly_inbox_error(exc, settings['provider'])}
    finally:
        if client is not None:
            try:
                client.logout()
            except Exception:
                pass
        SmtpConfig.objects.filter(id=config.id).update(
            imap_syncing=False, imap_sync_started_at=None, last_imap_sync_at=timezone.now())


def sync_due_mailboxes() -> None:
    stale_before = timezone.now() - dt.timedelta(minutes=STALE_SYNC_MINUTES)
    SmtpConfig.objects.filter(imap_syncing=True).filter(
        Q(imap_sync_started_at__isnull=True) | Q(imap_sync_started_at__lt=stale_before)
    ).update(imap_syncing=False, imap_sync_started_at=None)
    due_before = timezone.now() - dt.timedelta(minutes=SYNC_INTERVAL_MINUTES)
    user_ids = list(
        SmtpConfig.objects.filter(active=True, is_tested=True, imap_active=True, imap_syncing=False)
        .filter(Q(last_imap_sync_at__isnull=True) | Q(last_imap_sync_at__lte=due_before))
        .values_list('user_id', flat=True)
    )
    for user_id in user_ids:
        sync_mailbox_for_user(user_id)
