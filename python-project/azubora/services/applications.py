"""Sending a complete application (e-mail + CV + Motivationsschreiben PDF)."""
import datetime as dt
import html
import json
import logging
import os
import re
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from azubora.models import ApplicationMessage, JobApplication, JobOffer, User
from azubora.services.ai import CoverLetterParams, analyze_job_match, display_name, generate_application_package
from azubora.services.company_contacts import resolve_application_email
from azubora.services.documents import create_motivation_letter_pdf, safe_applicant_file_name
from azubora.services.smtp import Attachment, config_from_model, is_valid_email, send_email
from azubora.services.smtp_circuit_breaker import stop_auto_sending_for_smtp_limit
from azubora.services.subscriptions import (
    SubscriptionLimitError,
    release_application_slot,
    reserve_application_slot,
)

logger = logging.getLogger(__name__)

# Only official Bundesagentur für Arbeit offers can be stored or applied to.
OFFICIAL_OFFER_ID = re.compile(r'^BA-[A-Za-z0-9-]{3,100}$')

CV_CONTENT_TYPES = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}


def parse_list(value: str | None) -> list[str]:
    """JSON list, or legacy comma-separated text."""
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except ValueError:
        pass
    return [item.strip() for item in value.split(',') if item.strip()]


def parse_job_date(value) -> dt.datetime:
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except (TypeError, ValueError):
        return timezone.now()
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.timezone.utc)


def offer_fields(job: dict) -> dict:
    return {
        'title': job['title'],
        'company': job['company'],
        'location': job['location'],
        'postal_code': job.get('postalCode') or None,
        'federal_state': job.get('federalState') or None,
        'category': job.get('category') or None,
        'contract_type': job.get('contractType') or None,
        'work_time': job.get('workTime') or None,
        'remote': bool(job.get('remote')),
        'salary': job.get('salary') or None,
        'description': job.get('description') or '',
        'requirements': job.get('requirements') or None,
        'url': job.get('url') or None,
    }


def find_offer(identifier: str) -> JobOffer | None:
    return JobOffer.objects.filter(Q(id=identifier) | Q(external_id=identifier)).first()


def resolve_stored_cv_path(file_url: str | None) -> Path | None:
    """Legacy CVs stored on disk before they were kept in the database."""
    if not file_url:
        return None
    if file_url.startswith('private:'):
        name = file_url[len('private:'):]
        if not name or os.path.basename(name) != name:
            return None
        root = settings.UPLOADS_DIR.resolve()
        resolved = (root / name).resolve()
        return resolved if resolved.parent == root else None
    if file_url.startswith('/uploads/'):
        legacy_root = (settings.REPO_ROOT / 'public' / 'uploads').resolve()
        resolved = (settings.REPO_ROOT / 'public' / file_url.lstrip('/')).resolve()
        return resolved if legacy_root in resolved.parents else None
    return None


def remove_stored_cv(file_url: str | None) -> None:
    path = resolve_stored_cv_path(file_url)
    if path:
        try:
            path.unlink()
        except OSError:
            pass


def cv_attachment(profile, user_name: str) -> list[Attachment]:
    extension = os.path.splitext(profile.cv_file_name or '')[1].lower() or '.pdf'
    filename = f'Lebenslauf_{safe_applicant_file_name(user_name)}{extension}'
    if profile.cv_file_data:
        return [Attachment(filename, bytes(profile.cv_file_data), profile.cv_mime_type or None)]
    path = resolve_stored_cv_path(profile.cv_file_url)
    try:
        if path and path.is_file() and path.stat().st_size > 0:
            return [Attachment(filename, path.read_bytes(), CV_CONTENT_TYPES.get(extension))]
    except OSError:
        pass
    return []


def professional_email_html(body: str) -> str:
    paragraphs = ''.join(
        f'<p style="margin:0 0 16px;">{html.escape(paragraph).replace(chr(10), "<br>")}</p>'
        for paragraph in re.split(r'\n{2,}', body.replace('\r\n', '\n'))
    )
    return (
        '<!doctype html>\n<html lang="de">\n  <body style="margin:0;padding:0;background:#ffffff;color:#172033;">\n'
        '    <main style="max-width:680px;margin:0 auto;padding:32px 24px;font-family:Arial,Helvetica,'
        f'sans-serif;font-size:15px;line-height:1.65;">\n      {paragraphs}\n    </main>\n  </body>\n</html>'
    )


def profile_education(profile) -> str:
    return ', '.join(
        ' – '.join(part for part in (item.degree, item.field_of_study) if part)
        for item in profile.educations.all()
    )


def experience_lines(profile) -> list[str]:
    return [
        ': '.join(part for part in (f'{item.job_title} bei {item.company}', item.description) if part)
        for item in profile.experiences.all()
    ]


def _position_key(company: str, title: str) -> tuple[str, str]:
    from azubora.services.ai import title_keywords
    from azubora.services.company_contacts import name_key

    return name_key(company or ''), ' '.join(sorted(title_keywords(title or '')))


def previous_application(user_id: str, job: dict, recipient: str, automated: bool) -> str | None:
    """Why this would be a duplicate application, or ``None``.

    * the same position at the same company was already applied to (also catches offers
      re-posted under a new reference number);
    * for the bot: an application was already sent to this e-mail address (one company
      with several offers, or an address found on the company website).
    """
    sent = JobApplication.objects.filter(user_id=user_id).filter(
        Q(applied_at__isnull=False) | Q(delivery_status__in=['SENT', 'PENDING'])
    ).exclude(job_offer__external_id=job['externalId']).select_related('job_offer')
    position = _position_key(job.get('company', ''), job.get('title', ''))
    for application in sent:
        offer = application.job_offer
        if position[0] and _position_key(offer.company, offer.title) == position:
            return (f'Déjà postulé à ce poste chez {offer.company} (annonce {offer.external_id}) : '
                    'candidature en double évitée.')
    if automated:
        address = recipient.strip().lower()
        already_written = ApplicationMessage.objects.filter(
            user_id=user_id, direction='OUTBOUND', to_email__iexact=address).exists() or sent.filter(
            job_offer__contact_email__iexact=address).exists()
        if already_written:
            return f'Une candidature a déjà été envoyée à {address} : l’entreprise n’est pas contactée deux fois.'
    return None


def _address_origin(job: dict) -> str:
    if job.get('contactEmailSource') == 'company_website':
        return f" Adresse trouvée sur le site de l’entreprise : {job.get('contactEmailSourceUrl') or ''}".rstrip(' :') + '.'
    return ''


def _result(success: bool, **extra) -> dict:
    return {'success': success, **{key: value for key, value in extra.items() if value is not None}}


def _deliver(user_id: str, raw_job: dict, automated: bool, enriched: bool) -> dict:
    user = User.objects.select_related('smtp_config', 'profile').filter(id=user_id).first()
    if user is None:
        return _result(False, error='Utilisateur introuvable.')
    try:
        profile = user.profile
    except User.profile.RelatedObjectDoesNotExist:
        profile = None
    if profile is None:
        return _result(False, error='Complétez votre profil avant de postuler.')
    try:
        smtp = user.smtp_config
    except User.smtp_config.RelatedObjectDoesNotExist:
        smtp = None
    if smtp is None or not smtp.active:
        return _result(False, error='Activez et configurez SMTP avant de postuler.')
    if automated and not smtp.is_tested:
        return _result(False, error='Testez la connexion SMTP avant d’activer l’auto-candidature.')
    attachments = cv_attachment(profile, display_name(user.name))
    if not attachments:
        return _result(False, skipped=True, error=(
            'Ajoutez de nouveau votre CV dans le profil : aucun fichier de CV lisible ne peut être joint.'))

    job = raw_job if enriched else resolve_application_email(raw_job)
    recipient = job.get('contactEmail')
    if not is_valid_email(recipient):
        return _result(False, skipped=True, reason='NO_EMAIL',
                       error='Aucune adresse e-mail de candidature trouvée, ni dans l’annonce ni sur le site de l’entreprise.')

    existing_offer = JobOffer.objects.filter(external_id=job['externalId']).first()
    existing = JobApplication.objects.filter(user_id=user_id, job_offer=existing_offer).first() \
        if existing_offer else None
    if existing and existing.status == 'APPLIED':
        return _result(False, skipped=True, error='Une candidature a déjà été envoyée pour cette offre.',
                       recipientEmail=recipient, applicationId=existing.id,
                       matchScore=existing.match_score or None)
    if existing and existing.delivery_status == 'PENDING':
        return _result(False, skipped=True, error=(
            'Un envoi précédent est encore en cours ou son résultat est incertain. Vérifiez vos messages '
            'avant de réessayer.'), recipientEmail=recipient, applicationId=existing.id,
            matchScore=existing.match_score or None)
    duplicate = previous_application(user_id, job, recipient, automated)
    if duplicate:
        return _result(False, skipped=True, reason='DUPLICATE', error=duplicate, recipientEmail=recipient)

    education = profile_education(profile)
    skills = [item.name for item in profile.skills.all()]
    profile_text = '. '.join([
        f'Bewerber: {user.name}',
        f'Ausbildung: {education or "Keine Angabe im Profil"}',
        f'Kenntnisse: {", ".join(skills)}',
        f'Erfahrung: {", ".join(f"{item.job_title} bei {item.company}" for item in profile.experiences.all())}',
        f'Sprachen: {profile.languages or ""}',
        f'Wohnort: {profile.postal_code or ""} {profile.city or ""}',
    ])
    job_text = f"{job['title']}. {job['company']}. {job.get('description', '')}. {job.get('requirements', '')}"
    # The score is informative only (shown on the application); it never blocks sending.
    match = analyze_job_match(profile_text, job_text, user_id)

    city = f'{profile.postal_code or ""} {profile.city or ""}'.strip()
    package = generate_application_package(CoverLetterParams(
        user_name=user.name,
        user_email=user.email,
        user_phone=profile.phone or '',
        user_address=profile.address or '',
        user_city=city,
        user_education=education,
        user_skills=skills,
        user_bio=profile.bio or '',
        user_experiences=experience_lines(profile),
        user_languages=parse_list(profile.languages),
        company_name=job['company'],
        job_title=job['title'],
        job_description=job.get('description') or '',
        job_requirements=job.get('requirements') or '',
        job_location=job.get('location') or '',
        tone='compact',
    ), require_openai=True, user_id=user_id)
    letter_pdf = create_motivation_letter_pdf(
        applicant={'name': display_name(user.name), 'email': user.email, 'phone': profile.phone or '',
                   'address': profile.address or '', 'city': city},
        company={'name': job['company'], 'location': job.get('location')},
        job_title=job['title'],
        motivation_letter=package['motivationLetter'],
    )
    attachments.append(Attachment(f'Motivationsschreiben_{safe_applicant_file_name(display_name(user.name))}.pdf',
                                  letter_pdf, 'application/pdf'))

    offer, created = JobOffer.objects.get_or_create(
        external_id=job['externalId'],
        defaults={**offer_fields(job), 'contact_email': recipient,
                  'published_at': parse_job_date(job.get('publishedAt')),
                  'search_keyword': job.get('searchKeyword') or None},
    )
    if not created:
        for name, value in {**offer_fields(job), 'contact_email': recipient, 'active': True}.items():
            setattr(offer, name, value)
        offer.save()
    analysis = {
        'match_score': match['matchScore'],
        'cover_letter': package['motivationLetter'],
        'missing_skills': json.dumps(match['missingSkills'], ensure_ascii=False),
        'cv_tips': json.dumps(match['cvSuggestions'], ensure_ascii=False),
    }
    application, created = JobApplication.objects.get_or_create(
        user_id=user_id, job_offer=offer, defaults={'status': 'SAVED', **analysis})
    if not created:
        JobApplication.objects.filter(id=application.id).update(**analysis)

    acquired = JobApplication.objects.filter(id=application.id).exclude(status='APPLIED').filter(
        Q(delivery_status__isnull=True) | Q(delivery_status='FAILED')
    ).update(delivery_status='PENDING', delivery_started_at=timezone.now(), delivery_error=None,
             notes_text=f'Envoi SMTP en cours vers {recipient}.')
    if not acquired:
        return _result(False, skipped=True, error='Cette candidature est déjà envoyée ou un envoi est en cours.',
                       recipientEmail=recipient, applicationId=application.id, matchScore=match['matchScore'])

    config = config_from_model(smtp, user.name)
    delivery = send_email(config, recipient, package['subject'], professional_email_html(package['emailBody']),
                          attachments, package['emailBody'])
    if not delivery['success']:
        stop_auto_sending_for_smtp_limit(user_id, delivery)
        failure = delivery.get('error') or 'Erreur SMTP inconnue'
        JobApplication.objects.filter(id=application.id).update(
            delivery_status='FAILED', delivery_started_at=None, delivery_error=failure,
            notes_text=f"Échec SMTP vers {recipient}: {delivery.get('error') or 'Erreur inconnue'}")
        return _result(False, error=delivery.get('error'), recipientEmail=recipient,
                       applicationId=application.id, matchScore=match['matchScore'],
                       haltAutoSending=delivery.get('haltAutoSending'),
                       smtpResponseCode=delivery.get('smtpResponseCode'),
                       smtpEnhancedCode=delivery.get('smtpEnhancedCode'))

    sent_at = timezone.now()
    kind = 'Auto-candidature' if automated else 'Candidature'
    with transaction.atomic():
        JobApplication.objects.filter(id=application.id).update(
            status='APPLIED', applied_at=sent_at, delivery_status='SENT', delivery_started_at=None,
            delivery_error=None,
            notes_text=(f'{kind} envoyée par SMTP à {recipient} avec le CV et le Motivationsschreiben '
                        f'en pièces jointes.{_address_origin(job)}'))
        ApplicationMessage.objects.create(
            application_id=application.id, user_id=user_id, direction='OUTBOUND',
            message_id=delivery.get('messageId') or None, from_email=config.from_email,
            to_email=recipient, subject=package['subject'], body_text=package['emailBody'],
            sent_at=sent_at, read_at=sent_at)
    return _result(True, recipientEmail=recipient, applicationId=application.id, matchScore=match['matchScore'],
                   haltAutoSending=delivery.get('haltAutoSending'))


def deliver_application(user_id: str, job: dict, *, automated: bool = False, enriched: bool = False) -> dict:
    """Reserve a monthly application slot, send, and release the slot on failure.

    ``enriched`` means the offer details (contact e-mail) were already loaded.
    """
    try:
        slot_reserved = reserve_application_slot(user_id)
    except SubscriptionLimitError as exc:
        return _result(False, skipped=True, upgradeRequired=True, error=str(exc))
    sent = False
    try:
        result = _deliver(user_id, job, automated, enriched)
        sent = result['success']
        return result
    except SubscriptionLimitError as exc:
        return _result(False, skipped=True, upgradeRequired=True, error=str(exc))
    finally:
        if slot_reserved and not sent:
            try:
                release_application_slot(user_id)
            except Exception:
                logger.warning('Reserved application quota could not be released.', exc_info=True)
