"""Plans, monthly quotas and AI credit accounting.

Quota changes are single conditional ``UPDATE`` statements so concurrent
requests cannot overspend a quota.
"""
import datetime as dt
import logging
from typing import Literal

from django.db.models import F

from azubora.models import AiUsage, User

logger = logging.getLogger(__name__)

SUBSCRIPTION_PLANS = {
    'BASIC': {
        'code': 'BASIC',
        'name': 'Découverte',
        'monthlyPriceEur': 0,
        'applicationsPerMonth': 5,
        'aiCreditsPerMonth': 50,
        'autoApply': False,
        'recommended': False,
        'features': [
            '5 candidatures par mois',
            'Matching IA et lettres personnalisées',
            'Recherche et suivi des candidatures',
            'Envoi manuel par votre SMTP',
        ],
    },
    'PLUS': {
        'code': 'PLUS',
        'name': 'Plus',
        'monthlyPriceEur': 9.99,
        'applicationsPerMonth': 60,
        'aiCreditsPerMonth': 1_000,
        'autoApply': True,
        'recommended': True,
        'features': [
            '60 candidatures par mois',
            '1 000 crédits IA par mois',
            'Auto-candidature et recherche approfondie',
            'Analyse automatique des réponses',
        ],
    },
    'PRO': {
        'code': 'PRO',
        'name': 'Pro',
        'monthlyPriceEur': 19.99,
        'applicationsPerMonth': 250,
        'aiCreditsPerMonth': 5_000,
        'autoApply': True,
        'recommended': False,
        'features': [
            '250 candidatures par mois',
            '5 000 crédits IA par mois',
            'Auto-candidature intensive',
            'Volume adapté aux recherches multi-villes',
        ],
    },
}

CREDIT_PACKS = {
    'CREDITS_100': {'code': 'CREDITS_100', 'name': 'Pack Essentiel', 'credits': 100, 'priceEur': 2.99},
    'CREDITS_500': {'code': 'CREDITS_500', 'name': 'Pack Boost', 'credits': 500, 'priceEur': 8.99},
    'CREDITS_1000': {'code': 'CREDITS_1000', 'name': 'Pack Intensif', 'credits': 1_000, 'priceEur': 14.99},
}

AiOperation = Literal['MATCH', 'COVER_LETTER', 'CV_PARSE', 'REPLY_ANALYSIS']
# 'PLAN' = taken from the monthly quota, 'PURCHASED' = from the bought balance.
Reservation = Literal['PLAN', 'PURCHASED'] | None

AI_CREDIT_COST: dict[str, int] = {
    'MATCH': 1,
    'COVER_LETTER': 2,
    'CV_PARSE': 6,
    'REPLY_ANALYSIS': 1,
}

APPLICATION_AI_COST_ESTIMATE = {
    'model': 'gpt-4o-mini',
    'typicalInputTokens': 3_500,
    'typicalOutputTokens': 500,
    'typicalCostUsd': 0.000825,
    'conservativeCostUsd': 0.006,
    'pricingPerMillionTokensUsd': {'input': 0.15, 'output': 0.60},
}


class SubscriptionLimitError(Exception):
    code = 'SUBSCRIPTION_LIMIT'


def is_subscription_plan(value) -> bool:
    return isinstance(value, str) and value in SUBSCRIPTION_PLANS


def is_credit_pack(value) -> bool:
    return isinstance(value, str) and value in CREDIT_PACKS


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def month_start(now: dt.datetime | None = None) -> dt.datetime:
    now = now or utcnow()
    return dt.datetime(now.year, now.month, 1, tzinfo=dt.timezone.utc)


def next_month_start(now: dt.datetime | None = None) -> dt.datetime:
    now = now or utcnow()
    year, month = (now.year + 1, 1) if now.month == 12 else (now.year, now.month + 1)
    return dt.datetime(year, month, 1, tzinfo=dt.timezone.utc)


def _reset_expired_usage(user_id: str) -> None:
    User.objects.filter(
        id=user_id,
        subscription_plan__in=['PLUS', 'PRO'],
        subscription_current_period_end__lte=utcnow(),
    ).exclude(role='ADMIN').update(
        subscription_plan='BASIC',
        subscription_status='ACTIVE',
        subscription_requested_plan=None,
        subscription_current_period_end=None,
        subscription_period_start=month_start(),
        ai_credits_used=0,
        applications_used=0,
    )
    current_period = month_start()
    User.objects.filter(id=user_id, subscription_period_start__lt=current_period).update(
        subscription_period_start=current_period,
        ai_credits_used=0,
        applications_used=0,
    )


def get_subscription_snapshot(user_id: str) -> dict:
    _reset_expired_usage(user_id)
    user = User.objects.filter(id=user_id).first()
    if user is None:
        raise ValueError('Utilisateur introuvable.')

    plan_code = user.subscription_plan if is_subscription_plan(user.subscription_plan) else 'BASIC'
    unlimited = user.role == 'ADMIN' or user.unlimited_access
    if unlimited:
        effective = 'PRO'
    else:
        effective = plan_code if user.subscription_status == 'ACTIVE' else 'BASIC'
    plan = SUBSCRIPTION_PLANS[effective]

    return {
        'planCode': plan_code,
        'effectivePlanCode': effective,
        'plan': plan,
        'status': user.subscription_status,
        'requestedPlan': user.subscription_requested_plan
        if is_subscription_plan(user.subscription_requested_plan) else None,
        'unlimited': unlimited,
        'hasPaidSubscription': plan_code != 'BASIC' and user.subscription_status == 'ACTIVE',
        'periodStart': user.subscription_period_start,
        'periodEnd': user.subscription_current_period_end or next_month_start(),
        'usage': {'aiCredits': user.ai_credits_used, 'applications': user.applications_used},
        'creditBalance': None if unlimited else user.ai_credit_balance,
        'remaining': {
            'aiCredits': None if unlimited else max(0, plan['aiCreditsPerMonth'] - user.ai_credits_used)
            + user.ai_credit_balance,
            'applications': None if unlimited else max(0, plan['applicationsPerMonth'] - user.applications_used),
        },
    }


def consume_ai_credits(user_id: str, operation: str) -> Reservation:
    """Reserve credits for one AI call; ``None`` means unlimited (nothing reserved)."""
    snapshot = get_subscription_snapshot(user_id)
    if snapshot['unlimited']:
        return None
    credits = AI_CREDIT_COST[operation]
    updated = User.objects.filter(
        id=user_id,
        subscription_period_start__gte=month_start(),
        ai_credits_used__lte=snapshot['plan']['aiCreditsPerMonth'] - credits,
    ).update(ai_credits_used=F('ai_credits_used') + credits)
    if updated:
        return 'PLAN'
    purchased = User.objects.filter(id=user_id, ai_credit_balance__gte=credits).update(
        ai_credit_balance=F('ai_credit_balance') - credits
    )
    if purchased:
        return 'PURCHASED'
    raise SubscriptionLimitError(
        'Vos crédits IA sont épuisés. Achetez un pack de crédits ou passez à une formule '
        'supérieure pour continuer.'
    )


def try_consume_ai_credits(user_id: str, operation: str) -> tuple[bool, Reservation]:
    try:
        return True, consume_ai_credits(user_id, operation)
    except SubscriptionLimitError:
        return False, None


def release_ai_credits(user_id: str, operation: str, reservation: Reservation = 'PLAN') -> None:
    credits = AI_CREDIT_COST[operation]
    if reservation == 'PURCHASED':
        User.objects.filter(id=user_id).update(ai_credit_balance=F('ai_credit_balance') + credits)
        return
    User.objects.filter(
        id=user_id,
        ai_credits_used__gte=credits,
        subscription_period_start__gte=month_start(),
    ).update(ai_credits_used=F('ai_credits_used') - credits)


def reserve_application_slot(user_id: str) -> bool:
    snapshot = get_subscription_snapshot(user_id)
    if snapshot['unlimited']:
        return False
    limit = snapshot['plan']['applicationsPerMonth']
    updated = User.objects.filter(
        id=user_id,
        subscription_period_start__gte=month_start(),
        applications_used__lt=limit,
    ).update(applications_used=F('applications_used') + 1)
    if not updated:
        raise SubscriptionLimitError(f'Votre limite de {limit} candidatures mensuelles est atteinte.')
    return True


def release_application_slot(user_id: str) -> None:
    User.objects.filter(
        id=user_id,
        applications_used__gt=0,
        subscription_period_start__gte=month_start(),
    ).update(applications_used=F('applications_used') - 1)


def assert_auto_apply_allowed(user_id: str) -> None:
    snapshot = get_subscription_snapshot(user_id)
    if snapshot['unlimited']:
        return
    if not snapshot['plan']['autoApply']:
        raise SubscriptionLimitError('L’auto-candidature est disponible avec les formules Plus et Pro.')


def record_openai_usage(user_id: str, operation: str, usage, model: str) -> None:
    def number(name: str) -> int:
        try:
            return max(0, int(getattr(usage, name, 0) or 0))
        except (TypeError, ValueError):
            return 0

    input_tokens = number('prompt_tokens')
    output_tokens = number('completion_tokens')
    total_tokens = max(input_tokens + output_tokens, number('total_tokens'))
    pricing = APPLICATION_AI_COST_ESTIMATE['pricingPerMillionTokensUsd']
    estimated = round(input_tokens * pricing['input'] + output_tokens * pricing['output'])
    try:
        AiUsage.objects.create(
            user_id=user_id,
            operation=operation,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            estimated_cost_microusd=estimated,
            credits=AI_CREDIT_COST[operation],
        )
    except Exception:
        logger.warning('AI usage accounting could not be persisted.', exc_info=True)
