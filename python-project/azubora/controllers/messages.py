"""Conversation endpoints (company replies and user answers)."""
import html
import re

from django.db.models import Prefetch
from django.http import HttpRequest
from django.utils import timezone

from azubora.controllers.base import methods, read_json
from azubora.controllers.session import login_required
from azubora.models import ApplicationMessage, JobApplication, SmtpConfig, User
from azubora.services.inbox import sync_mailbox_for_user
from azubora.services.ratelimit import check_rate_limit
from azubora.services.smtp import Threading, config_from_model, is_valid_email, send_email
from azubora.services.smtp_circuit_breaker import stop_auto_sending_for_smtp_limit
from azubora.views.responses import error, json_response, rate_limited
from azubora.views.serializers import application_dict, to_dict


def _ordered_messages():
    return Prefetch('messages', queryset=ApplicationMessage.objects.order_by('sent_at'), to_attr='thread')


@login_required()
def conversations(request: HttpRequest, user: User):
    applications = (JobApplication.objects.filter(user=user).exclude(status='SAVED').select_related('job_offer')
                    .prefetch_related(_ordered_messages()).order_by('-updated_at'))
    items = []
    for application in applications:
        unread = sum(1 for message in application.thread if message.direction == 'INBOUND' and not message.read_at)
        data = application_dict(application, messages=application.thread)
        data['unreadCount'] = unread
        data['lastMessage'] = to_dict(application.thread[-1]) if application.thread else None
        items.append(data)
    return json_response({'conversations': items, 'unreadCount': sum(item['unreadCount'] for item in items)})


def _owned(application_id: str, user: User) -> JobApplication | None:
    return (JobApplication.objects.filter(id=application_id, user=user).select_related('job_offer')
            .prefetch_related(_ordered_messages()).first())


@login_required()
def conversation(request: HttpRequest, user: User, application_id: str):
    application = _owned(application_id, user)
    if application is None:
        return error('Conversation introuvable.', 404)
    now = timezone.now()
    ApplicationMessage.objects.filter(application=application, user=user, direction='INBOUND',
                                      read_at__isnull=True).update(read_at=now)
    for message in application.thread:
        if message.direction == 'INBOUND' and not message.read_at:
            message.read_at = now
    return json_response({'application': application_dict(application, messages=application.thread)})


def reply_subject(subject: str) -> str:
    cleaned = re.sub(r'^\s*((re|aw|wg|fw|fwd)\s*:\s*)+', '', subject, flags=re.IGNORECASE).strip()
    return f'Re: {cleaned or "Ihre Nachricht"}'


@login_required()
def send_reply(request: HttpRequest, user: User, application_id: str):
    body = read_json(request)
    message_text = str(body.get('text') or '').strip()
    if not message_text:
        return error('Écrivez un message avant de l’envoyer.', 400)
    if len(message_text) > 10_000:
        return error('Le message ne peut pas dépasser 10 000 caractères.', 400)
    allowed, retry = check_rate_limit(f'message-send:{user.id}', 30, 60 * 60_000)
    if not allowed:
        return rate_limited('Limite d’envoi atteinte. Réessayez plus tard.', retry)

    application = _owned(application_id, user)
    if application is None:
        return error('Conversation introuvable.', 404)
    smtp = SmtpConfig.objects.filter(user=user).first()
    if smtp is None or not smtp.active or not smtp.is_tested:
        return error('Activez et testez SMTP avant de répondre.', 400)

    latest_inbound = next((message for message in reversed(application.thread)
                           if message.direction == 'INBOUND' and is_valid_email(message.from_email)), None)
    recipient = latest_inbound.from_email if latest_inbound else application.job_offer.contact_email
    if not is_valid_email(recipient):
        return error('Aucune adresse e-mail valide n’est disponible pour cette conversation.', 400)

    last = application.thread[-1] if application.thread else None
    subject = reply_subject(last.subject if last else
                            f'Bewerbung – {application.job_offer.title} – {user.name}')
    thread_ids = [message.message_id for message in application.thread
                  if message.message_id and not message.message_id.startswith('imap:')][-20:]
    in_reply_to = thread_ids[-1] if thread_ids else None

    config = config_from_model(smtp, user.name)
    delivery = send_email(
        config, recipient, subject,
        f'<!doctype html><html lang="de"><body>{html.escape(message_text).replace(chr(10), "<br>")}</body></html>',
        text=message_text, threading=Threading(in_reply_to=in_reply_to, references=thread_ids),
    )
    if not delivery['success']:
        stopped = stop_auto_sending_for_smtp_limit(user.id, delivery)
        return json_response({'error': delivery.get('error') or 'Le message n’a pas pu être envoyé.',
                              'autoApplyStopped': stopped}, status=502)

    now = timezone.now()
    message = ApplicationMessage.objects.create(
        application=application, user=user, direction='OUTBOUND', message_id=delivery.get('messageId') or None,
        in_reply_to=in_reply_to, from_email=config.from_email, to_email=recipient, subject=subject,
        body_text=message_text, sent_at=now, read_at=now)
    JobApplication.objects.filter(id=application.id).update()
    return json_response({'success': True, 'message': to_dict(message)})


@login_required()
def sync(request: HttpRequest, user: User):
    allowed, retry = check_rate_limit(f'mailbox-sync:{user.id}', 10, 15 * 60_000)
    if not allowed:
        return rate_limited('Trop de synchronisations. Réessayez plus tard.', retry)
    result = sync_mailbox_for_user(user.id)
    status = 200 if result['success'] else 422 if result.get('skipped') else 502
    return json_response(result, status=status)


messages_list = methods(GET=conversations)
messages_detail = methods(GET=conversation, POST=send_reply)
messages_sync = methods(POST=sync)
