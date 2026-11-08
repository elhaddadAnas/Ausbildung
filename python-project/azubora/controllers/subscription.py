"""Plans, credits and bank-transfer payments."""
import datetime as dt

from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone

from azubora.controllers.base import methods, read_json
from azubora.controllers.session import login_required
from azubora.models import BankTransferPayment, User
from azubora.services.bank_transfer import (
    OPEN_STATUSES,
    bank_transfer_configured,
    credit_pack_amount_cents,
    generate_unique_transfer_reference,
    get_bank_transfer_details,
    is_credit_topup_payment,
    is_paid_subscription_plan,
    payment_amount_cents,
    serialize_payment,
)
from azubora.services.ratelimit import check_rate_limit
from azubora.services.subscriptions import (
    CREDIT_PACKS,
    SUBSCRIPTION_PLANS,
    get_subscription_snapshot,
    is_credit_pack,
)
from azubora.services.transactional_email import (
    send_admin_transfer_alert,
    send_bank_transfer_instructions,
    send_transfer_submitted,
)
from azubora.views.responses import error, json_response, rate_limited


def _fr_number(value: int) -> str:
    return f'{value:,}'.replace(',', ' ')


def _product_label(payment: BankTransferPayment) -> str | None:
    if is_credit_topup_payment(payment):
        return f'{_fr_number(payment.credit_amount)} crédits IA'
    if is_paid_subscription_plan(payment.plan):
        return f"formule {SUBSCRIPTION_PLANS[payment.plan]['name']}"
    return None


@login_required('Non autorisé.')
def subscription_overview(request: HttpRequest, user: User):
    return json_response({
        'subscription': get_subscription_snapshot(user.id),
        'plans': list(SUBSCRIPTION_PLANS.values()),
        'creditPacks': list(CREDIT_PACKS.values()),
        'billingMode': 'bank_transfer' if bank_transfer_configured() else 'not_configured',
    })


@login_required('Non autorisé.')
def subscription_change(request: HttpRequest, user: User):
    return error('Utilisez le paiement par virement pour changer de formule.', 410)


subscription = methods(GET=subscription_overview, POST=subscription_change)


def _expire_stale(user: User) -> None:
    BankTransferPayment.objects.filter(user=user, status__in=OPEN_STATUSES,
                                       expires_at__lte=timezone.now()).update(status='EXPIRED')


@login_required('Non autorisé.')
def current_payment(request: HttpRequest, user: User):
    _expire_stale(user)
    payment = BankTransferPayment.objects.filter(user=user, status__in=OPEN_STATUSES).order_by('-created_at').first()
    return json_response({
        'payment': serialize_payment(payment) if payment else None,
        'bankDetails': get_bank_transfer_details() if payment and bank_transfer_configured() else None,
    })


@login_required('Non autorisé.')
def request_payment(request: HttpRequest, user: User):
    if user.role == 'ADMIN' or user.unlimited_access:
        return error('Ce compte dispose déjà d’un accès illimité.', 400)
    allowed, retry = check_rate_limit(f'bank-transfer:{user.id}', 10, 60 * 60_000)
    if not allowed:
        return rate_limited('Trop de demandes. Réessayez plus tard.', retry)
    body = read_json(request)
    plan = body.get('plan') if is_paid_subscription_plan(body.get('plan')) else None
    pack = body.get('creditPack') if is_credit_pack(body.get('creditPack')) else None
    if bool(plan) == bool(pack):
        return error('Choisissez une formule ou un pack de crédits valide.', 400)

    product = plan or pack
    kind = 'CREDIT_TOPUP' if pack else 'SUBSCRIPTION'
    label = f"{_fr_number(CREDIT_PACKS[pack]['credits'])} crédits IA" if pack \
        else f"formule {SUBSCRIPTION_PLANS[plan]['name']}"
    _expire_stale(user)
    payment = BankTransferPayment.objects.filter(user=user, plan=product, kind=kind,
                                                 status__in=OPEN_STATUSES).order_by('-created_at').first()
    created = payment is None
    if created:
        reference = generate_unique_transfer_reference(product)
        with transaction.atomic():
            BankTransferPayment.objects.filter(user=user, status__in=OPEN_STATUSES).update(status='EXPIRED')
            User.objects.filter(id=user.id).update(subscription_requested_plan=plan)
            payment = BankTransferPayment.objects.create(
                user=user, plan=product, kind=kind,
                credit_amount=CREDIT_PACKS[pack]['credits'] if pack else None,
                amount_cents=credit_pack_amount_cents(pack) if pack else payment_amount_cents(plan),
                reference=reference, expires_at=timezone.now() + dt.timedelta(days=7))

    details = get_bank_transfer_details() if bank_transfer_configured() else None
    if details:
        email = send_bank_transfer_instructions(to=user.email, name=user.name, product_label=label,
                                                amount_eur=payment.amount_cents / 100, reference=payment.reference,
                                                **details)
    else:
        email = {'success': False,
                 'error': 'Les coordonnées bancaires doivent encore être configurées par un administrateur.'}
    if created:
        send_admin_transfer_alert(user_name=user.name, user_email=user.email, product_label=label,
                                  amount_eur=payment.amount_cents / 100, reference=payment.reference, submitted=False)
    return json_response({
        'success': True,
        'payment': serialize_payment(payment),
        'bankDetails': details,
        'emailWarning': None if email['success'] else email.get('error'),
    }, status=201 if created else 200)


@login_required('Non autorisé.')
def declare_payment(request: HttpRequest, user: User):
    body = read_json(request)
    if not isinstance(body.get('paymentId'), str) or body.get('action') != 'submitted':
        return error('Action de paiement invalide.', 400)
    payment = BankTransferPayment.objects.filter(id=body['paymentId'], user=user).first()
    if payment is None:
        return error('Paiement introuvable.', 404)
    if payment.expires_at <= timezone.now():
        BankTransferPayment.objects.filter(id=payment.id).update(status='EXPIRED')
        return error('Cette demande a expiré. Créez-en une nouvelle.', 409)
    if payment.status not in OPEN_STATUSES:
        return error('Ce paiement ne peut plus être modifié.', 409)
    was_submitted = payment.status == 'SUBMITTED'
    if not was_submitted:
        payment.status = 'SUBMITTED'
        payment.submitted_at = timezone.now()
        payment.save()
    label = _product_label(payment)
    if not was_submitted and label:
        send_transfer_submitted(user.email, user.name, payment.reference)
        send_admin_transfer_alert(user_name=user.name, user_email=user.email, product_label=label,
                                  amount_eur=payment.amount_cents / 100, reference=payment.reference, submitted=True)
    return json_response({'success': True, 'payment': serialize_payment(payment)})


payment = methods(GET=current_payment, POST=request_payment, PUT=declare_payment)
