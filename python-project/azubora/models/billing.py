"""Bank-transfer payments and AI usage accounting."""
from django.db import models

from .base import BaseModel, Created, Int, OptText, Updated, UserFK, When
from .fields import IdField, UTCDateTimeField


class AiUsage(BaseModel):
    id = IdField()
    user = UserFK(related_name='ai_usage')
    operation = models.TextField()  # MATCH, COVER_LETTER, CV_PARSE, REPLY_ANALYSIS
    model = models.TextField()
    input_tokens = Int('inputTokens')
    output_tokens = Int('outputTokens')
    total_tokens = Int('totalTokens')
    estimated_cost_microusd = Int('estimatedCostMicrousd')
    credits = models.IntegerField()
    created_at = Created()

    class Meta:
        db_table = 'AiUsage'
        indexes = [
            models.Index(fields=['user', 'created_at'], name='AiUsage_userId_createdAt_idx'),
            models.Index(fields=['operation', 'created_at'], name='AiUsage_operation_idx'),
        ]


class BankTransferPayment(BaseModel):
    id = IdField()
    user = UserFK(related_name='bank_transfer_payments')
    plan = models.TextField()
    kind = models.TextField(default='SUBSCRIPTION')  # SUBSCRIPTION, CREDIT_TOPUP
    credit_amount = models.IntegerField(db_column='creditAmount', null=True, blank=True)
    amount_cents = models.IntegerField(db_column='amountCents')
    currency = models.TextField(default='EUR')
    reference = models.TextField(unique=True)
    status = models.TextField(default='PENDING')  # PENDING, SUBMITTED, PAID, REJECTED, EXPIRED
    expires_at = UTCDateTimeField(db_column='expiresAt')
    submitted_at = When('submittedAt')
    paid_at = When('paidAt')
    reviewed_at = When('reviewedAt')
    reviewed_by_id = OptText('reviewedById')
    admin_note = OptText('adminNote')
    created_at = Created()
    updated_at = Updated()

    class Meta:
        db_table = 'BankTransferPayment'
        indexes = [
            models.Index(fields=['user', 'created_at'], name='BankTransferPayment_userId_idx'),
            models.Index(fields=['status', 'created_at'], name='BankTransferPayment_status_idx'),
        ]
