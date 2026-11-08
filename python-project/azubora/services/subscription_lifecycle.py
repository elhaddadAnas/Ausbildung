"""Expiry reminders and automatic downgrade of expired paid plans."""
import datetime as dt

from django.utils import timezone

from azubora.models import User
from azubora.services.subscriptions import SUBSCRIPTION_PLANS
from azubora.services.transactional_email import send_subscription_expired, send_subscription_expiring


def process_subscription_lifecycle() -> None:
    now = timezone.now()
    paid = User.objects.exclude(role='ADMIN').filter(subscription_plan__in=['PLUS', 'PRO'])

    expiring = paid.filter(
        subscription_status='ACTIVE',
        subscription_current_period_end__gt=now,
        subscription_current_period_end__lte=now + dt.timedelta(days=3),
        subscription_expiry_reminder_sent_at__isnull=True,
    )
    for user in list(expiring):
        claimed = User.objects.filter(id=user.id, subscription_expiry_reminder_sent_at__isnull=True).update(
            subscription_expiry_reminder_sent_at=now)
        if not claimed or not user.subscription_current_period_end:
            continue
        plan = SUBSCRIPTION_PLANS.get(user.subscription_plan, {}).get('name', user.subscription_plan)
        send_subscription_expiring(user.email, user.name, plan, user.subscription_current_period_end)

    for user in list(paid.filter(subscription_current_period_end__lte=now)):
        updated = User.objects.exclude(role='ADMIN').filter(
            id=user.id, subscription_plan__in=['PLUS', 'PRO'], subscription_current_period_end__lte=now,
        ).update(
            subscription_plan='BASIC',
            subscription_status='ACTIVE',
            subscription_requested_plan=None,
            subscription_current_period_end=None,
            subscription_period_start=now,
            ai_credits_used=0,
            applications_used=0,
            subscription_expired_email_sent_at=now,
        )
        if updated:
            send_subscription_expired(user.email, user.name)
