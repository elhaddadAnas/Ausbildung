"""Audit trail, system log and background job records."""
from django.db import models
from django.utils import timezone

from .base import BaseModel, Created, OptText, Text, UserFK, When
from .fields import IdField, UTCDateTimeField


class AuditLog(BaseModel):
    id = IdField()
    user = UserFK(related_name='audit_logs', null=True, blank=True, on_delete=models.SET_NULL)
    action = models.TextField()
    entity = models.TextField(null=True, blank=True)
    details = models.TextField(null=True, blank=True)
    ip_address = OptText('ipAddress')
    user_agent = OptText('userAgent')
    created_at = Created()

    class Meta:
        db_table = 'AuditLog'


class SystemLog(BaseModel):
    id = IdField()
    level = models.TextField(default='INFO')  # INFO, WARN, ERROR
    source = models.TextField()
    message = models.TextField()
    stack_trace = OptText('stackTrace')
    metadata = models.TextField(null=True, blank=True)
    created_at = Created()

    class Meta:
        db_table = 'SystemLog'


class QueueJob(BaseModel):
    id = IdField()
    job_name = Text('jobName')
    status = models.TextField(default='PENDING')  # PENDING, COMPLETED, FAILED
    payload = models.TextField(null=True, blank=True)
    result = models.TextField(null=True, blank=True)
    error_message = OptText('errorMessage')
    run_at = UTCDateTimeField(db_column='runAt', default=timezone.now)
    completed_at = When('completedAt')

    class Meta:
        db_table = 'QueueJob'
        indexes = [models.Index(fields=['job_name', 'status', 'run_at'], name='QueueJob_name_status_runAt_idx')]
