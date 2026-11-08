"""Detect SMTP rate-limit/quota errors that must stop automatic sending."""
import re
import smtplib
from dataclasses import dataclass

_LIMIT_WARNING = re.compile(
    r'daily (?:user |smtp relay )?sending limit exceeded|you have reached (?:a |the )?limit for sending mail'
    r'|sending (?:quota|limit) (?:has been )?(?:exceeded|reached)|quota exceeded'
    r'|unusual rate of (?:unsolicited )?email|(?:temporarily )?rate[- ]limit(?:ed|ing)?'
    r'|too many (?:messages|emails)|temporarily deferred due to .*rate',
    re.IGNORECASE,
)


@dataclass
class SMTPErrorClassification:
    halt_auto_sending: bool
    response_code: int | None
    enhanced_code: str | None
    reason: str | None


def _smtp_code_and_text(error: BaseException) -> tuple[int | None, str]:
    if isinstance(error, smtplib.SMTPRecipientsRefused):
        for code, message in error.recipients.values():
            text = message.decode('utf-8', 'replace') if isinstance(message, bytes) else str(message)
            return code, text
    if isinstance(error, smtplib.SMTPResponseException):
        message = error.smtp_error
        text = message.decode('utf-8', 'replace') if isinstance(message, bytes) else str(message)
        return error.smtp_code, text
    return None, ''


def classify_smtp_error(error: BaseException | str | None) -> SMTPErrorClassification:
    explicit_code, smtp_text = (None, '')
    if isinstance(error, BaseException):
        explicit_code, smtp_text = _smtp_code_and_text(error)
    raw = ' '.join(part for part in (str(error or ''), smtp_text) if part)

    code_match = re.search(r'\b(421|450)\b', raw)
    if explicit_code and explicit_code >= 100:
        response_code = explicit_code
    else:
        response_code = int(code_match.group(1)) if code_match else None
    enhanced_match = re.search(r'\b([245]\.\d{1,3}\.\d{1,3})\b', raw)
    enhanced_code = enhanced_match.group(1) if enhanced_match else None

    if response_code in (421, 450):
        return SMTPErrorClassification(True, response_code, enhanced_code,
                                       f'SMTP {response_code} temporaire détecté')
    if enhanced_code == '4.7.28':
        return SMTPErrorClassification(True, response_code, enhanced_code,
                                       'Limite de débit Gmail 4.7.28 détectée')
    if _LIMIT_WARNING.search(raw):
        return SMTPErrorClassification(True, response_code, enhanced_code,
                                       'Limite quotidienne ou limitation de débit SMTP détectée')
    return SMTPErrorClassification(False, response_code, enhanced_code, None)


def format_smtp_halt_message(classification: SMTPErrorClassification) -> str:
    codes = ' / '.join(
        part for part in (
            str(classification.response_code) if classification.response_code else '',
            classification.enhanced_code or '',
        ) if part
    )
    suffix = f' ({codes})' if codes else ''
    reason = classification.reason or 'Limite SMTP détectée'
    return (
        f'{reason}{suffix}. L’auto-candidature a été arrêtée et ne reprendra qu’après '
        'une réactivation manuelle.'
    )
