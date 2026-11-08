"""Disable auto-apply when the SMTP provider reports a sending limit."""
import json

from django.utils import timezone

from azubora.models import AutoApplyConfig
from azubora.views.serializers import iso


def stop_auto_sending_for_smtp_limit(user_id: str, signal: dict) -> bool:
    if not signal.get('haltAutoSending'):
        return False
    halt_result = json.dumps({
        'success': False,
        'smtpHalted': True,
        'smtpHaltReason': signal.get('error') or 'Limite SMTP détectée. L’auto-candidature a été arrêtée.',
        'smtpResponseCode': signal.get('smtpResponseCode') or None,
        'smtpEnhancedCode': signal.get('smtpEnhancedCode') or None,
        'haltedAt': iso(timezone.now()),
    }, ensure_ascii=False)
    AutoApplyConfig.objects.filter(user_id=user_id).update(
        enabled=False, running=False, run_started_at=None, next_run_at=None, last_result=halt_result,
    )
    return True
