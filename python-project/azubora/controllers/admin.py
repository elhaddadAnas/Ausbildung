"""Administration console: overview, payment review and user management."""
import datetime as dt

from django.db import transaction
from django.db.models import Count, F, Sum
from django.http import HttpRequest
from django.utils import timezone

from azubora.controllers.base import methods, read_json, text
from azubora.controllers.session import admin_required
from azubora.models import (
    AiUsage,
    BankTransferPayment,
    FavoriteJob,
    JobApplication,
    JobOffer,
    QueueJob,
    SmtpConfig,
    SystemLog,
    User,
)
from azubora.services.ai import OPENAI_MODEL, openai_configured
from azubora.services.applications import remove_stored_cv
from azubora.services.bank_transfer import (
    OPEN_STATUSES,
    add_one_month,
    is_credit_topup_payment,
    is_paid_subscription_plan,
)
from azubora.services.deep_search import queue_status
from azubora.services.subscriptions import APPLICATION_AI_COST_ESTIMATE, is_subscription_plan
from azubora.services.transactional_email import (
    send_credit_topup_approved,
    send_subscription_approved,
    send_subscription_rejected,
)
from azubora.views.responses import error, json_response
from azubora.views.serializers import to_dict


@admin_required('Nur für Administratoren zugänglich.')
def admin_overview(request: HttpRequest, admin: User):
    usage = AiUsage.objects.aggregate(
        operations=Count('id'), input=Sum('input_tokens'), output=Sum('output_tokens'), total=Sum('total_tokens'),
        cost=Sum('estimated_cost_microusd'), credits=Sum('credits'))
    user_fields = ('id', 'email', 'name', 'role', 'subscriptionPlan', 'subscriptionStatus',
                   'subscriptionRequestedPlan', 'aiCreditsUsed', 'aiCreditBalance', 'applicationsUsed', 'createdAt',
                   'isGoogleLogin', 'isMicrosoftLogin')
    smtp_fields = ('id', 'provider', 'host', 'port', 'authUser', 'isTested', 'lastTestedAt')
    payments = BankTransferPayment.objects.select_related('user').order_by('-created_at')[:50]
    return json_response({
        'stats': {
            'totalUsers': User.objects.count(),
            'totalOffers': JobOffer.objects.count(),
            'totalApplications': JobApplication.objects.count(),
            'totalFavorites': FavoriteJob.objects.count(),
        },
        'users': [to_dict(item, only=user_fields) for item in User.objects.order_by('-created_at')[:20]],
        'systemLogs': [to_dict(item) for item in SystemLog.objects.order_by('-created_at')[:20]],
        'queueJobs': [to_dict(item) for item in QueueJob.objects.order_by('-run_at')[:15]],
        'smtpConfigs': [to_dict(item, only=smtp_fields) for item in SmtpConfig.objects.all()[:10]],
        'bankPayments': [
            {**to_dict(item, user=to_dict(item.user, only=('id', 'name', 'email'))),
             'amountEur': item.amount_cents / 100}
            for item in payments
        ],
        'queueInfo': queue_status(),
        'openai': {
            'configured': openai_configured(),
            'model': OPENAI_MODEL,
            'costProfile': 'low',
            'applicationCostEstimate': APPLICATION_AI_COST_ESTIMATE,
            'usage': {
                'operations': usage['operations'] or 0,
                'inputTokens': usage['input'] or 0,
                'outputTokens': usage['output'] or 0,
                'totalTokens': usage['total'] or 0,
                'credits': usage['credits'] or 0,
                'estimatedCostUsd': (usage['cost'] or 0) / 1_000_000,
            },
        },
    })


class _AlreadyProcessed(Exception):
    pass


def _claim_payment(payment: BankTransferPayment, admin: User, note: str | None, now) -> None:
    claimed = BankTransferPayment.objects.filter(id=payment.id, status__in=OPEN_STATUSES).update(
        status='PAID', paid_at=now, reviewed_at=now, reviewed_by_id=admin.id, admin_note=note)
    if not claimed:
        raise _AlreadyProcessed()
    BankTransferPayment.objects.filter(user_id=payment.user_id, status__in=OPEN_STATUSES).exclude(
        id=payment.id).update(status='EXPIRED')


@admin_required()
def review_payment(request: HttpRequest, admin: User):
    body = read_json(request)
    action = body.get('action')
    note = text(body['note'], 500) if isinstance(body.get('note'), str) else None
    if not isinstance(body.get('paymentId'), str) or action not in ('approve', 'reject'):
        return error('Action invalide.', 400)
    payment = BankTransferPayment.objects.select_related('user').filter(id=body['paymentId']).first()
    if payment is None:
        return error('Paiement introuvable.', 404)
    if payment.status not in OPEN_STATUSES:
        return error('Ce paiement a déjà été traité.', 409)
    is_topup = is_credit_topup_payment(payment)
    is_subscription = payment.kind == 'SUBSCRIPTION' and is_paid_subscription_plan(payment.plan)
    if not is_topup and not is_subscription:
        return error('Produit de paiement invalide.', 400)
    customer = payment.user

    if action == 'approve':
        now = timezone.now()
        try:
            with transaction.atomic():
                _claim_payment(payment, admin, note, now)
                if is_topup:
                    User.objects.filter(id=customer.id).update(
                        ai_credit_balance=F('ai_credit_balance') + payment.credit_amount)
                    message = (f'Virement {payment.reference} validé par {admin.email}; {payment.credit_amount} '
                               f'crédits IA ajoutés pour {customer.email}.')
                else:
                    current_end = customer.subscription_current_period_end
                    renewal_base = current_end if (customer.subscription_plan == payment.plan and current_end
                                                   and current_end > now) else now
                    period_end = add_one_month(renewal_base)
                    User.objects.filter(id=customer.id).update(
                        subscription_plan=payment.plan, subscription_status='ACTIVE',
                        subscription_requested_plan=None, subscription_period_start=now,
                        subscription_current_period_end=period_end, subscription_expiry_reminder_sent_at=None,
                        subscription_expired_email_sent_at=None, ai_credits_used=0, applications_used=0)
                    message = (f'Virement {payment.reference} validé par {admin.email}; formule {payment.plan} '
                               f'activée pour {customer.email}.')
                SystemLog.objects.create(source='PAYMENT', message=message)
        except _AlreadyProcessed:
            return error('Ce paiement a déjà été traité.', 500)
        if is_topup:
            email = send_credit_topup_approved(customer.email, customer.name, payment.credit_amount)
            text_message = f'{payment.credit_amount} crédits IA ajoutés au compte.'
        else:
            email = send_subscription_approved(customer.email, customer.name, payment.plan, period_end)
            text_message = 'Paiement validé et formule activée.'
        return json_response({'success': True, 'message': text_message,
                              'emailWarning': None if email['success'] else email.get('error')})

    with transaction.atomic():
        BankTransferPayment.objects.filter(id=payment.id).update(
            status='REJECTED', reviewed_at=timezone.now(), reviewed_by_id=admin.id, admin_note=note)
        if is_subscription:
            User.objects.filter(id=customer.id, subscription_requested_plan=payment.plan).update(
                subscription_requested_plan=None)
        SystemLog.objects.create(source='PAYMENT', message=(
            f'Virement {payment.reference} refusé par {admin.email} pour {customer.email}.'))
    email = send_subscription_rejected(customer.email, customer.name, payment.reference, note)
    return json_response({'success': True, 'message': 'Paiement refusé.',
                          'emailWarning': None if email['success'] else email.get('error')})


@admin_required()
def update_user(request: HttpRequest, admin: User):
    body = read_json(request)
    user_id = body.get('userId')
    role = body.get('role')
    name = body.get('name')
    plan = body.get('subscriptionPlan')
    if not user_id:
        return error('ID Utilisateur requis.', 400)
    if role is not None and role not in ('USER', 'ADMIN'):
        return error('Rôle invalide.', 400)
    if plan is not None and not is_subscription_plan(plan):
        return error('Formule d’abonnement invalide.', 400)
    if user_id == admin.id and role and role != 'ADMIN':
        return error('Vous ne pouvez pas retirer votre propre rôle administrateur.', 400)
    if name is not None and (not isinstance(name, str) or not 2 <= len(name.strip()) <= 100):
        return error('Nom invalide.', 400)
    target = User.objects.filter(id=user_id).first()
    if target is None:
        return error('Utilisateur introuvable.', 500)
    if role:
        target.role = role
    if name:
        target.name = name.strip()
    if plan:
        now = timezone.now()
        target.subscription_plan = plan
        target.subscription_status = 'ACTIVE'
        target.subscription_requested_plan = None
        target.subscription_period_start = now
        target.subscription_current_period_end = None if plan == 'BASIC' else now + dt.timedelta(days=30)
        target.subscription_expiry_reminder_sent_at = None
        target.subscription_expired_email_sent_at = None
        target.ai_credits_used = 0
        target.applications_used = 0
    target.save()
    SystemLog.objects.create(source='ADMIN', message=(
        f'Compte modifié pour {target.name} ({target.email}) -> Rôle: {target.role}, '
        f'formule: {target.subscription_plan}'))
    return json_response({'success': True, 'user': to_dict(target, only=(
        'id', 'name', 'email', 'role', 'subscriptionPlan', 'subscriptionStatus', 'subscriptionRequestedPlan',
        'createdAt'))})


@admin_required()
def delete_user(request: HttpRequest, admin: User):
    user_id = request.GET.get('userId')
    if not user_id:
        return error('ID Utilisateur requis.', 400)
    if user_id == admin.id:
        return error('Vous ne pouvez pas supprimer votre propre compte admin.', 400)
    target = User.objects.select_related('profile').filter(id=user_id).first()
    if target is not None:
        cv_url = getattr(getattr(target, 'profile', None), 'cv_file_url', None) if hasattr(target, 'profile') else None
        target.delete()
        remove_stored_cv(cv_url)
        SystemLog.objects.create(source='ADMIN', message=(
            f"Utilisateur supprimé par l'admin : {target.name} ({target.email})"))
    return json_response({'success': True, 'message': 'Utilisateur supprimé.'})


admin_overview_view = methods(GET=admin_overview)
admin_payments = methods(PUT=review_payment)
admin_users = methods(PUT=update_user, DELETE=delete_user)
