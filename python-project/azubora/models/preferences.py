"""Per-user settings: mailbox (SMTP/IMAP), auto-apply bot and notifications."""
from django.db import models

from .base import BaseModel, Bool, Created, Int, OptText, Text, Updated, UserFK, When
from .fields import IdField


class SmtpConfig(BaseModel):
    id = IdField()
    user = models.OneToOneField('User', db_column='userId', on_delete=models.CASCADE, related_name='smtp_config')
    provider = models.TextField(default='custom')  # gmail, outlook, custom
    host = models.TextField()
    port = models.IntegerField(default=587)
    secure = models.BooleanField(default=False)
    auth_user = Text('authUser')
    auth_pass_encrypted = Text('authPassEncrypted')
    from_email = Text('fromEmail')
    from_name = Text('fromName')
    active = models.BooleanField(default=True)
    is_tested = Bool('isTested')
    last_tested_at = When('lastTestedAt')
    imap_host = OptText('imapHost')
    imap_port = Int('imapPort', default=993)
    imap_secure = Bool('imapSecure', default=True)
    imap_active = Bool('imapActive', default=True)
    last_imap_sync_at = When('lastImapSyncAt')
    imap_syncing = Bool('imapSyncing')
    imap_sync_started_at = When('imapSyncStartedAt')
    updated_at = Updated()

    class Meta:
        db_table = 'SmtpConfig'
        indexes = [
            models.Index(
                fields=['active', 'is_tested', 'imap_active', 'imap_syncing', 'last_imap_sync_at'],
                name='SmtpConfig_inbox_due_idx',
            ),
        ]


class AutoApplyConfig(BaseModel):
    id = IdField()
    user = models.OneToOneField(
        'User', db_column='userId', on_delete=models.CASCADE, related_name='auto_apply_config'
    )
    enabled = models.BooleanField(default=False)
    interval_minutes = Int('intervalMinutes', default=3)
    keywords = models.TextField(default='Ausbildung')  # JSON list
    cities = models.TextField(default='[]')
    federal_states = Text('federalStates', default='[]')
    categories = models.TextField(default='[]')
    radius_km = Int('radiusKm', default=25)
    remote_only = Bool('remoteOnly')
    min_match_score = Int('minMatchScore', default=60)  # legacy column, no longer used as a filter
    max_applications = Int('maxApplications', default=1)
    schedule_days = Text('scheduleDays', default='[1,2,3,4,5]')  # 0=Sunday … 6=Saturday
    schedule_start_minute = Int('scheduleStartMinute', default=480)
    schedule_end_minute = Int('scheduleEndMinute', default=900)
    schedule_timezone = Text('scheduleTimezone', default='Europe/Berlin')
    last_run_at = When('lastRunAt')
    next_run_at = When('nextRunAt')
    last_result = OptText('lastResult')
    # Where the bot continues next run in "all offers" mode: {"slice": key, "page": n} (JSON).
    scan_cursor = OptText('scanCursor')
    running = models.BooleanField(default=False)
    run_started_at = When('runStartedAt')
    created_at = Created()
    updated_at = Updated()

    class Meta:
        db_table = 'AutoApplyConfig'
        indexes = [models.Index(fields=['enabled', 'running', 'next_run_at'], name='AutoApplyConfig_due_idx')]


class NotificationConfig(BaseModel):
    id = IdField()
    user = models.OneToOneField(
        'User', db_column='userId', on_delete=models.CASCADE, related_name='notification_config'
    )
    email_enabled = Bool('emailEnabled', default=True)
    telegram_enabled = Bool('telegramEnabled')
    telegram_chat_id = OptText('telegramChatId')
    whatsapp_enabled = Bool('whatsappEnabled')
    whatsapp_number = OptText('whatsappNumber')
    discord_enabled = Bool('discordEnabled')
    discord_webhook_url = OptText('discordWebhookUrl')
    alert_on_new_match = Bool('alertOnNewMatch', default=True)
    alert_on_status_change = Bool('alertOnStatusChange', default=True)
    updated_at = Updated()

    class Meta:
        db_table = 'NotificationConfig'


class AutoApplySkippedOffer(BaseModel):
    """Offers the bot ruled out recently (no e-mail address, score too low), so runs move on."""
    id = IdField()
    user = UserFK(related_name='auto_apply_skips')
    external_id = Text('externalId')
    reason = models.TextField()  # NO_EMAIL, LETTER_FAILED, DUPLICATE
    match_score = models.IntegerField(db_column='matchScore', null=True, blank=True)
    created_at = Created()

    class Meta:
        db_table = 'AutoApplySkippedOffer'
        constraints = [
            models.UniqueConstraint(fields=['user', 'external_id'], name='AutoApplySkip_user_offer_key'),
        ]
        indexes = [models.Index(fields=['user', 'created_at'], name='AutoApplySkip_user_created_idx')]
