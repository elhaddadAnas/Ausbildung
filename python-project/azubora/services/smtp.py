"""User SMTP accounts: credential encryption, validation and sending.

Encrypted values use the original ``v2:<iv>:<tag>:<ciphertext>`` AES-256-GCM
format with the same scrypt key derivation, so credentials saved by the
previous Node.js backend can still be decrypted.
"""
import hashlib
import ipaddress
import os
import re
import secrets
import smtplib
import socket
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from functools import lru_cache

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings

from azubora.services.smtp_limits import classify_smtp_error, format_smtp_halt_message

MASKED_PASSWORD = '••••••••'
_EMAIL = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


# Encryption -----------------------------------------------------------------

def _scrypt(secret: str, salt: str) -> bytes:
    # Node's crypto.scryptSync defaults: N=16384, r=8, p=1.
    return hashlib.scrypt(secret.encode('utf-8'), salt=salt.encode('utf-8'), n=16384, r=8, p=1,
                          dklen=32, maxmem=64 * 1024 * 1024)


@lru_cache(maxsize=1)
def _keys() -> tuple[bytes, bytes | None, bytes]:
    configured = os.environ.get('SMTP_ENCRYPTION_KEY', '')
    jwt_secret = os.environ.get('JWT_SECRET', '')
    material = configured or jwt_secret or 'development-only-smtp-encryption-key'
    primary = _scrypt(material, 'smtp-config-v2')
    # Development installs encrypted with JWT_SECRET before SMTP_ENCRYPTION_KEY
    # existed; keep it as a read-only fallback.
    fallback = _scrypt(jwt_secret, 'smtp-config-v2') if configured and jwt_secret else None
    legacy = _scrypt(jwt_secret or 'ausbildung_finder_ai_jwt_secret_key_2026_super_secure', 'salt')
    return primary, fallback, legacy


def encrypt_string(value: str) -> str:
    iv = secrets.token_bytes(12)
    sealed = AESGCM(_keys()[0]).encrypt(iv, value.encode('utf-8'), None)
    ciphertext, tag = sealed[:-16], sealed[-16:]
    return f'v2:{iv.hex()}:{tag.hex()}:{ciphertext.hex()}'


def decrypt_string(encrypted: str | None) -> str:
    if not encrypted:
        return ''
    primary, fallback, legacy = _keys()
    try:
        if encrypted.startswith('v2:'):
            parts = encrypted.split(':')
            if len(parts) != 4 or not all(parts[1:]):
                return ''
            iv, tag, payload = (bytes.fromhex(part) for part in parts[1:])
            for key in (primary, fallback):
                if key is None:
                    continue
                try:
                    return AESGCM(key).decrypt(iv, payload + tag, None).decode('utf-8')
                except Exception:
                    continue
            return ''
        # Backwards compatibility with the original AES-CBC storage format.
        iv_hex, _, payload_hex = encrypted.partition(':')
        if not iv_hex or not payload_hex:
            return encrypted
        decryptor = Cipher(algorithms.AES(legacy), modes.CBC(bytes.fromhex(iv_hex))).decryptor()
        padded = decryptor.update(bytes.fromhex(payload_hex)) + decryptor.finalize()
        unpadder = padding.PKCS7(128).unpadder()
        return (unpadder.update(padded) + unpadder.finalize()).decode('utf-8')
    except Exception:
        return ''


# Configuration -----------------------------------------------------------------

def is_valid_email(value: str | None) -> bool:
    return bool(value) and bool(_EMAIL.match(value.strip()))


@dataclass
class SMTPConfig:
    provider: str
    host: str
    port: int
    secure: bool
    auth_user: str
    auth_pass: str
    from_email: str
    from_name: str


def normalize_smtp_config(*, provider, host, port, secure, auth_user, auth_pass, from_email,
                          from_name) -> SMTPConfig:
    provider = str(provider or 'custom').lower()
    host = str(host or '').strip()
    try:
        port_number = int(float(port))
    except (TypeError, ValueError):
        port_number = 0
    secure = bool(secure)
    if provider == 'gmail':
        host, port_number, secure = 'smtp.gmail.com', 587, False
    elif provider == 'outlook':
        host, port_number, secure = 'smtp.office365.com', 587, False
    else:
        port_number = port_number or 587
        # Port 465 uses implicit TLS. Ports 587/25 use STARTTLS.
        secure = True if port_number == 465 else secure
    auth_user = str(auth_user or '').strip()
    requested_from = str(from_email or auth_user).strip()
    return SMTPConfig(
        provider=provider,
        host=host,
        port=port_number,
        secure=secure,
        auth_user=auth_user,
        auth_pass=re.sub(r'\s+', '', str(auth_pass or '')),
        from_email=auth_user if provider in ('gmail', 'outlook') else requested_from,
        from_name=str(from_name or 'Azubora').strip(),
    )


def config_from_model(smtp, fallback_name: str = '') -> SMTPConfig:
    return normalize_smtp_config(
        provider=smtp.provider,
        host=smtp.host,
        port=smtp.port,
        secure=smtp.secure,
        auth_user=smtp.auth_user,
        auth_pass=decrypt_string(smtp.auth_pass_encrypted),
        from_email=smtp.from_email or smtp.auth_user,
        from_name=smtp.from_name or fallback_name,
    )


def validate_smtp_config(config: SMTPConfig) -> str | None:
    if not config.host or re.search(r'\s', config.host):
        return 'L’hôte SMTP est invalide.'
    if not 1 <= config.port <= 65535:
        return 'Le port SMTP doit être compris entre 1 et 65535.'
    if not is_valid_email(config.auth_user):
        return 'Le nom d’utilisateur SMTP doit être une adresse e-mail valide.'
    if not config.auth_pass:
        return 'Le mot de passe SMTP est obligatoire.'
    if not is_valid_email(config.from_email):
        return 'L’adresse d’expéditeur est invalide.'
    return None


# Network safety -------------------------------------------------------------------

def _is_private_address(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return True
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    if isinstance(ip, ipaddress.IPv4Address):
        first, second = ip.packed[0], ip.packed[1]
        if (first in (0, 10, 127) or first >= 224 or (first == 100 and 64 <= second <= 127)
                or (first == 169 and second == 254) or (first == 172 and 16 <= second <= 31)
                or (first == 192 and second == 168) or (first == 198 and second in (18, 19))):
            return True
    return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified \
        or ip.is_reserved


def assert_safe_mail_host(host: str) -> None:
    """Refuse mail hosts that resolve to private networks (SSRF protection)."""
    if settings.ALLOW_PRIVATE_MAIL_HOSTS:
        return
    normalized = host.strip().lower().rstrip('.')
    if (not normalized or normalized == 'localhost'
            or normalized.endswith(('.localhost', '.local', '.internal'))):
        raise ValueError('Les serveurs de messagerie privés ou locaux ne sont pas autorisés.')
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(normalized, None)}
    except OSError:
        raise ValueError('L’hôte de messagerie est introuvable.') from None
    if not addresses or any(_is_private_address(address) for address in addresses):
        raise ValueError('L’hôte de messagerie pointe vers une adresse réseau privée non autorisée.')


def tls_context() -> ssl.SSLContext:
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    return context


# Sending ---------------------------------------------------------------------------

def _connect(config: SMTPConfig) -> smtplib.SMTP:
    context = tls_context()
    if config.secure:
        server: smtplib.SMTP = smtplib.SMTP_SSL(config.host, config.port, timeout=30, context=context)
    else:
        server = smtplib.SMTP(config.host, config.port, timeout=30)
        server.ehlo()
        if server.has_extn('starttls'):
            server.starttls(context=context)
            server.ehlo()
        elif config.port == 587:
            server.close()
            raise smtplib.SMTPNotSupportedError('STARTTLS is required by this server configuration.')
    server.login(config.auth_user, config.auth_pass)
    return server


def friendly_smtp_error(error: BaseException, provider: str | None = None) -> str:
    limit = classify_smtp_error(error)
    if limit.halt_auto_sending:
        return format_smtp_halt_message(limit)
    message = str(error)
    if isinstance(error, smtplib.SMTPResponseException):
        detail = error.smtp_error.decode('utf-8', 'replace') if isinstance(error.smtp_error, bytes) \
            else str(error.smtp_error)
        message = f'{error.smtp_code} {detail}'
    lowered = message.lower()
    if (isinstance(error, smtplib.SMTPAuthenticationError) or '535' in message
            or 'badcredentials' in lowered or 'authentication unsuccessful' in lowered
            or 'username and password not accepted' in lowered):
        if provider == 'gmail':
            return ('Authentification Gmail refusée. Activez la validation en deux étapes et utilisez un '
                    'mot de passe d’application Google de 16 caractères.')
        if provider == 'outlook':
            return ('Authentification Outlook refusée. Vérifiez que SMTP AUTH est autorisé pour ce compte '
                    'et utilisez un mot de passe d’application si nécessaire.')
        return 'Authentification SMTP refusée. Vérifiez le nom d’utilisateur et le mot de passe.'
    if isinstance(error, ssl.SSLCertVerificationError) or 'certificate' in lowered or 'self signed' in lowered:
        return 'Le certificat TLS du serveur SMTP n’est pas valide.'
    if isinstance(error, (TimeoutError, socket.timeout)) or 'timed out' in lowered or 'timeout' in lowered:
        return 'Le serveur SMTP ne répond pas. Vérifiez l’hôte, le port et le pare-feu.'
    if isinstance(error, socket.gaierror) or 'name or service not known' in lowered:
        return 'L’hôte SMTP est introuvable.'
    return message or 'La connexion SMTP a échoué.'


def _failure(error: BaseException, provider: str, key: str) -> dict:
    classification = classify_smtp_error(error)
    message = str(error) if isinstance(error, ValueError) else friendly_smtp_error(error, provider)
    return {
        'success': False,
        key: message,
        'haltAutoSending': classification.halt_auto_sending,
        'smtpResponseCode': classification.response_code,
        'smtpEnhancedCode': classification.enhanced_code,
    }


def test_smtp_connection(config: SMTPConfig) -> dict:
    validation_error = validate_smtp_config(config)
    if validation_error:
        return {'success': False, 'message': validation_error}
    server = None
    try:
        assert_safe_mail_host(config.host)
        server = _connect(config)
        return {'success': True, 'message': f'Connexion SMTP sécurisée réussie avec {config.host}:{config.port}.'}
    except Exception as error:  # noqa: BLE001 - every failure is reported to the user
        return _failure(error, config.provider, 'message')
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass


@dataclass
class Attachment:
    filename: str
    content: bytes
    content_type: str | None = None


@dataclass
class Threading:
    in_reply_to: str | None = None
    references: list[str] = field(default_factory=list)


def send_email(config: SMTPConfig, to_email: str, subject: str, html: str,
               attachments: list[Attachment] | None = None, text: str | None = None,
               threading: Threading | None = None) -> dict:
    validation_error = validate_smtp_config(config)
    if validation_error:
        return {'success': False, 'error': validation_error}
    if not is_valid_email(to_email):
        return {'success': False, 'error': 'Aucune adresse e-mail de candidature valide n’est disponible.'}

    message = EmailMessage()
    message['From'] = formataddr((config.from_name or 'Azubora', config.from_email))
    message['Reply-To'] = config.from_email
    message['To'] = to_email.strip()
    message['Subject'] = subject
    message_id = make_msgid(domain=config.from_email.rsplit('@', 1)[-1])
    message['Message-ID'] = message_id
    if threading and threading.in_reply_to:
        message['In-Reply-To'] = threading.in_reply_to
    if threading and threading.references:
        message['References'] = ' '.join(threading.references)
    message.set_content(text or '')
    message.add_alternative(html, subtype='html')
    for attachment in attachments or []:
        maintype, _, subtype = (attachment.content_type or 'application/octet-stream').partition('/')
        message.add_attachment(attachment.content, maintype=maintype, subtype=subtype or 'octet-stream',
                               filename=attachment.filename)

    server = None
    try:
        assert_safe_mail_host(config.host)
        server = _connect(config)
        server.send_message(message)
        return {'success': True, 'messageId': message_id}
    except Exception as error:  # noqa: BLE001
        return _failure(error, config.provider, 'error')
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass
