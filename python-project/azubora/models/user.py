"""Accounts, roles and subscription counters."""
from django.db import models
from django.utils import timezone

from .base import BaseModel, Bool, Created, Int, OptText, Text, Updated, When
from .fields import IdField, UTCDateTimeField


class User(BaseModel):
    id = IdField()
    email = models.TextField(unique=True)
    password_hash = OptText('passwordHash')
    name = models.TextField()
    role = models.TextField(default='USER')  # USER, ADMIN
    is_google_login = Bool('isGoogleLogin')
    is_microsoft_login = Bool('isMicrosoftLogin')
    avatar_url = OptText('avatarUrl')
    unlimited_access = Bool('unlimitedAccess')
    subscription_plan = Text('subscriptionPlan', default='BASIC')  # BASIC, PLUS, PRO
    subscription_status = Text('subscriptionStatus', default='ACTIVE')  # ACTIVE, PENDING, SUSPENDED
    subscription_requested_plan = OptText('subscriptionRequestedPlan')
    subscription_period_start = UTCDateTimeField(db_column='subscriptionPeriodStart', default=timezone.now)
    subscription_current_period_end = When('subscriptionCurrentPeriodEnd')
    subscription_expiry_reminder_sent_at = When('subscriptionExpiryReminderSentAt')
    subscription_expired_email_sent_at = When('subscriptionExpiredEmailSentAt')
    ai_credits_used = Int('aiCreditsUsed')
    ai_credit_balance = Int('aiCreditBalance')
    applications_used = Int('applicationsUsed')
    created_at = Created()
    updated_at = Updated()

    class Meta:
        db_table = 'User'
