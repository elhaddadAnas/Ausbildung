"""Background worker: auto-apply bot, inbox sync and subscription lifecycle.

Run exactly one instance next to the web server::

    python manage.py run_scheduler
"""
import logging
import signal
import threading

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from azubora.services.auto_apply import run_due_auto_apply_jobs
from azubora.services.inbox import sync_due_mailboxes
from azubora.services.subscription_lifecycle import process_subscription_lifecycle

logger = logging.getLogger('azubora.scheduler')

def release_stale_locks() -> int:
    """Only one worker runs: anything still marked as running was interrupted."""
    from django.utils import timezone

    from azubora.models import AutoApplyConfig, QueueJob, SmtpConfig

    released = AutoApplyConfig.objects.filter(running=True).update(running=False, run_started_at=None)
    released += SmtpConfig.objects.filter(imap_syncing=True).update(imap_syncing=False, imap_sync_started_at=None)
    QueueJob.objects.filter(job_name='AUTO_APPLY', status='PENDING').update(
        status='FAILED', error_message='Exécution interrompue (redémarrage du worker).', completed_at=timezone.now())
    return released


TASKS = (
    # (name, function, initial delay seconds, interval seconds)
    ('auto-apply', run_due_auto_apply_jobs, 5, 30),
    ('email-inbox', sync_due_mailboxes, 10, 60),
    ('subscription-lifecycle', process_subscription_lifecycle, 0, 6 * 60 * 60),
)


def _loop(name, task, delay, interval, stop: threading.Event):
    if stop.wait(delay):
        return
    while not stop.is_set():
        close_old_connections()
        try:
            task()
        except Exception:  # noqa: BLE001 - keep the worker alive
            logger.exception('%s scheduler error', name)
        finally:
            close_old_connections()
        stop.wait(interval)


class Command(BaseCommand):
    help = 'Run the periodic background jobs (auto-apply, IMAP sync, subscription expiry).'

    def add_arguments(self, parser):
        parser.add_argument('--only', choices=[name for name, *_ in TASKS], action='append',
                            help='Run only the named task (repeatable).')

    def handle(self, *args, only=None, **options):
        released = release_stale_locks()
        if released:
            self.stdout.write(f'Released {released} lock(s) left by a previous worker.')
        stop = threading.Event()
        signal.signal(signal.SIGTERM, lambda *_: stop.set())
        signal.signal(signal.SIGINT, lambda *_: stop.set())
        threads = [
            threading.Thread(target=_loop, args=(name, task, delay, interval, stop), name=name, daemon=True)
            for name, task, delay, interval in TASKS if not only or name in only
        ]
        for thread in threads:
            thread.start()
        self.stdout.write(f"Scheduler started: {', '.join(thread.name for thread in threads)}")
        while not stop.is_set():
            stop.wait(1)
        for thread in threads:
            thread.join(timeout=30)
        self.stdout.write('Scheduler stopped.')
