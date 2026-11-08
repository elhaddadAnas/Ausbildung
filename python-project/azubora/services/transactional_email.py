"""Platform e-mails (welcome, payments, subscription lifecycle) via the system SMTP."""
import datetime as dt
import html
import logging
import os

from django.conf import settings

from azubora.services.smtp import SMTPConfig, send_email
from azubora.services.subscriptions import SUBSCRIPTION_PLANS

logger = logging.getLogger(__name__)


def _e(value) -> str:
    return html.escape(str(value if value is not None else ''))


def _fr_date(value: dt.datetime) -> str:
    return value.strftime('%d/%m/%Y')


def _fr_number(value: int) -> str:
    return f'{value:,}'.replace(',', ' ')


def system_smtp() -> SMTPConfig | None:
    host = os.environ.get('SYSTEM_SMTP_HOST', '').strip()
    user = os.environ.get('SYSTEM_SMTP_USER', '').strip()
    password = os.environ.get('SYSTEM_SMTP_PASSWORD', '')
    from_email = os.environ.get('SYSTEM_SMTP_FROM_EMAIL', '').strip() or user
    if not (host and user and password and from_email):
        return None
    return SMTPConfig(
        provider='custom',
        host=host,
        port=int(os.environ.get('SYSTEM_SMTP_PORT') or 587),
        secure=os.environ.get('SYSTEM_SMTP_SECURE') == 'true',
        auth_user=user,
        auth_pass=password,
        from_email=from_email,
        from_name=os.environ.get('SYSTEM_SMTP_FROM_NAME', '').strip() or 'Azubora',
    )


def _layout(title: str, content: str) -> str:
    return (
        '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">'
        '<div style="max-width:620px;margin:0 auto;padding:32px 16px">'
        '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:28px">'
        '<div style="font-size:12px;font-weight:700;color:#2563eb;text-transform:uppercase">Azubora</div>'
        f'<h1 style="font-size:24px;margin:10px 0 20px">{_e(title)}</h1>{content}</div>'
        '<p style="font-size:11px;color:#64748b;text-align:center">Message transactionnel lié à votre compte.</p>'
        '</div></body></html>'
    )


def _send(to: str, subject: str, body_html: str, text: str) -> dict:
    smtp = system_smtp()
    if smtp is None:
        return {'success': False, 'error': 'Le SMTP système n’est pas configuré.'}
    result = send_email(smtp, to, subject, body_html, text=text)
    if not result['success']:
        logger.warning('Transactional email failed (%s): %s', subject, result.get('error'))
    return {'success': result['success'], 'error': result.get('error')}


def send_welcome_email(to: str, name: str) -> dict:
    url = settings.APP_URL
    return _send(to, 'Bienvenue sur Azubora', _layout('Bienvenue', (
        f'<p>Bonjour {_e(name)},</p><p>Votre compte est prêt. Complétez votre profil pour commencer à '
        f'rechercher et gérer vos candidatures.</p><p><a href="{url}/dashboard">Ouvrir mon tableau de bord</a></p>'
    )), f'Bonjour {name}, votre compte Azubora est prêt. {url}/dashboard')


def send_bank_transfer_instructions(*, to: str, name: str, product_label: str, amount_eur: float, reference: str,
                                    accountHolder: str, bankName: str, rib: str, iban: str, bic: str,
                                    instructions: str = '') -> dict:
    rows = [('Montant', f'{amount_eur:.2f} EUR'), ('Bénéficiaire', accountHolder), ('Banque', bankName or '—')]
    rows += [(label, value) for label, value in (('RIB', rib), ('IBAN', iban), ('BIC', bic)) if value]
    rows.append(('Référence obligatoire', reference))
    table = ''.join(f'<tr><td style="padding:7px;font-weight:700">{_e(label)}</td>'
                    f'<td style="padding:7px">{_e(value)}</td></tr>' for label, value in rows)
    extra = f'<p>{_e(instructions)}</p>' if instructions else ''
    return _send(to, f'Instructions de virement — {product_label}', _layout('Effectuer votre virement', (
        f'<p>Bonjour {_e(name)},</p><p>Votre achat : <strong>{_e(product_label)}</strong>. Utilisez les '
        'coordonnées ci-dessous. Il sera activé au plus tard dans les 24 heures suivant la réception et la '
        f'validation du virement.</p><table style="width:100%;background:#f8fafc;border-radius:12px">{table}</table>'
        f'{extra}<p><a href="{settings.APP_URL}/subscription">Suivre mon paiement</a></p>'
    )), (f'{product_label}. Montant: {amount_eur:.2f} EUR. Bénéficiaire: {accountHolder}. Banque: {bankName}. '
         f'RIB: {rib}. IBAN: {iban}. BIC: {bic}. Référence obligatoire: {reference}. Activation au plus tard '
         'dans les 24 heures suivant la réception du virement.'))


def send_transfer_submitted(to: str, name: str, reference: str) -> dict:
    return _send(to, f'Virement déclaré — {reference}', _layout('Déclaration reçue', (
        f'<p>Bonjour {_e(name)},</p><p>Nous avons reçu votre déclaration de virement <strong>{_e(reference)}'
        '</strong>. Un administrateur vérifiera sa réception avant de valider votre achat.</p>'
    )), f'Bonjour {name}, votre déclaration de virement {reference} a été reçue et sera vérifiée.')


def send_admin_transfer_alert(*, user_name: str, user_email: str, product_label: str, amount_eur: float,
                              reference: str, submitted: bool) -> dict:
    to = os.environ.get('BILLING_ADMIN_EMAIL', '').strip() or settings.ADMIN_EMAIL
    if not to:
        return {'success': False, 'error': 'BILLING_ADMIN_EMAIL absent.'}
    action = 'Virement déclaré par le client' if submitted else 'Nouvelle demande de virement'
    url = settings.APP_URL
    return _send(to, f'{action} — {reference}', _layout(action, (
        f'<p>Client : {_e(user_name)} ({_e(user_email)})</p><p>Achat : {_e(product_label)} · {amount_eur:.2f} EUR'
        f'</p><p>Référence : <strong>{_e(reference)}</strong></p><p><a href="{url}/admin">Vérifier dans '
        'l’administration</a></p>'
    )), f'{action}. {user_name} ({user_email}), {product_label}, {amount_eur:.2f} EUR, référence {reference}. '
        f'{url}/admin')


def send_subscription_approved(to: str, name: str, plan: str, end: dt.datetime) -> dict:
    plan_name = SUBSCRIPTION_PLANS[plan]['name']
    return _send(to, f'Formule {plan_name} activée', _layout('Paiement validé', (
        f'<p>Bonjour {_e(name)},</p><p>Votre paiement a été validé et votre formule <strong>{_e(plan_name)}'
        f'</strong> est active jusqu’au {_fr_date(end)}.</p><p><a href="{settings.APP_URL}/dashboard">Accéder au '
        'service</a></p>'
    )), f'Bonjour {name}, votre formule {plan_name} est active jusqu’au {_fr_date(end)}.')


def send_credit_topup_approved(to: str, name: str, credits: int) -> dict:
    amount = _fr_number(credits)
    return _send(to, f'{amount} crédits IA ajoutés', _layout('Crédits ajoutés', (
        f'<p>Bonjour {_e(name)},</p><p>Votre paiement a été validé. <strong>{amount} crédits IA</strong> ont été '
        'ajoutés à votre solde et restent disponibles jusqu’à leur utilisation.</p>'
        f'<p><a href="{settings.APP_URL}/dashboard">Accéder au service</a></p>'
    )), f'Bonjour {name}, votre paiement a été validé et {amount} crédits IA ont été ajoutés à votre solde.')


def send_subscription_rejected(to: str, name: str, reference: str, note: str | None = None) -> dict:
    reason = f'<p>Motif : {_e(note)}</p>' if note else ''
    return _send(to, f'Virement non validé — {reference}', _layout('Paiement non validé', (
        f'<p>Bonjour {_e(name)},</p><p>Le virement portant la référence <strong>{_e(reference)}</strong> n’a pas '
        f'pu être validé.</p>{reason}<p>Vous pouvez créer une nouvelle demande depuis votre abonnement.</p>'
    )), f'Bonjour {name}, le virement {reference} n’a pas pu être validé.' + (f' Motif: {note}' if note else ''))


def send_subscription_expiring(to: str, name: str, plan: str, end: dt.datetime) -> dict:
    url = settings.APP_URL
    return _send(to, f'Votre formule {plan} expire bientôt', _layout('Expiration prochaine', (
        f'<p>Bonjour {_e(name)},</p><p>Votre formule {_e(plan)} expire le {_fr_date(end)}. Effectuez un nouveau '
        f'virement depuis votre espace pour la renouveler.</p><p><a href="{url}/subscription">Renouveler</a></p>'
    )), f'Bonjour {name}, votre formule {plan} expire le {_fr_date(end)}. {url}/subscription')


def send_subscription_expired(to: str, name: str) -> dict:
    return _send(to, 'Votre formule payante a expiré', _layout('Formule expirée', (
        f'<p>Bonjour {_e(name)},</p><p>Votre formule payante a expiré. Votre compte reste accessible avec la '
        f'formule Découverte.</p><p><a href="{settings.APP_URL}/subscription">Voir les formules</a></p>'
    )), f'Bonjour {name}, votre formule payante a expiré. Votre compte reste accessible avec la formule Découverte.')
