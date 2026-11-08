"""AI studio: match analysis and application letters."""

from django.http import HttpRequest

from azubora.controllers.base import methods, read_json, text
from azubora.controllers.session import login_required
from azubora.models import User
from azubora.services.ai import CoverLetterParams, analyze_job_match, generate_application_package
from azubora.services.applications import find_offer, parse_list
from azubora.services.authentication import user_profile
from azubora.services.ratelimit import check_rate_limit
from azubora.services.subscriptions import SubscriptionLimitError
from azubora.views.responses import error, json_response, rate_limited


def _ai_rate_limit(user: User):
    allowed, retry = check_rate_limit(f'ai:{user.id}', 20, 60 * 60_000)
    return None if allowed else rate_limited('AI-Limit erreicht. Bitte versuchen Sie es später erneut.', retry)


@login_required()
def ai_match(request: HttpRequest, user: User):
    limited = _ai_rate_limit(user)
    if limited:
        return limited
    body = read_json(request)
    custom = body.get('customJobDescription')
    job_text = custom.strip()[:20_000] if isinstance(custom, str) else ''
    if body.get('jobOfferId'):
        job = find_offer(str(body['jobOfferId']))
        if job is None:
            return error('Offre introuvable.', 404)
        job_text = (f'{job.title}\nUnternehmen: {job.company}\nKategorie: {job.category}\n'
                    f'Beschreibung: {job.description}\nAnforderungen: {job.requirements}')
    if len(job_text) < 20:
        return error('Ajoutez une description d’offre suffisamment détaillée.', 400)

    profile = user_profile(user)
    educations = '; '.join(f'{item.degree} an {item.institution}' for item in profile.educations.all()) \
        if profile else ''
    experiences = '; '.join(f'{item.job_title} bei {item.company}' for item in profile.experiences.all()) \
        if profile else ''
    skills = ', '.join(f'{item.name} ({item.level or "Intermediate"})' for item in profile.skills.all()) \
        if profile else ''
    profile_text = (
        f'Bewerber Name: {user.name}\n'
        f'Qualifikation/Schulbildung: {educations or "Schulabschluss"}\n'
        f'Berufserfahrung/Praktika: {experiences or "Praktika"}\n'
        f'Fähigkeiten: {skills or "Grundkenntnisse"}\n'
        f'Lebenslauf-Details: {(profile.cv_parsed_text if profile else "") or ""}\n'
        f'Führerschein: {(profile.driving_license if profile else None) or "Keiner"}'
    )
    try:
        analysis = analyze_job_match(profile_text, job_text, user.id)
    except SubscriptionLimitError as exc:
        return error(str(exc), 402, upgradeRequired=True)
    return json_response({'success': True, 'analysis': analysis})


@login_required()
def ai_cover_letter(request: HttpRequest, user: User):
    limited = _ai_rate_limit(user)
    if limited:
        return limited
    body = read_json(request)
    tone = body.get('tone')
    if tone is not None and str(tone) not in ('compact', 'professional', 'enthusiastic', 'creative'):
        return error('Ton de candidature invalide.', 400)
    title = text(body.get('jobTitle'), 300)
    company = text(body.get('companyName'), 300)
    description = text(body.get('jobDescription'), 20_000)
    requirements = text(body.get('jobRequirements'), 10_000)
    location = ''
    if body.get('jobOfferId'):
        offer = find_offer(str(body['jobOfferId']))
        if offer is None:
            return error('Offre introuvable.', 404)
        title, company, description = offer.title, offer.company, offer.description
        requirements, location = offer.requirements or '', offer.location
    if not title or not company:
        return error('Le métier et l’entreprise sont obligatoires.', 400)

    profile = user_profile(user)
    try:
        package = generate_application_package(CoverLetterParams(
            user_name=user.name,
            user_email=user.email,
            user_phone=(profile.phone if profile else '') or '',
            user_address=(profile.address if profile else '') or '',
            user_city=f'{(profile.postal_code if profile else "") or ""} {(profile.city if profile else "") or ""}'.strip(),
            user_education=', '.join(item.degree for item in profile.educations.all()) if profile else '',
            user_skills=[item.name for item in profile.skills.all()] if profile else [],
            user_bio=(profile.bio if profile else '') or '',
            user_experiences=[': '.join(part for part in (f'{item.job_title} bei {item.company}', item.description)
                                        if part) for item in profile.experiences.all()] if profile else [],
            user_languages=parse_list(profile.languages) if profile else [],
            company_name=company,
            job_title=title,
            job_description=description,
            job_requirements=requirements,
            job_location=location,
            tone=str(tone or 'compact'),
        ), require_openai=True, user_id=user.id)
    except SubscriptionLimitError as exc:
        return error(str(exc), 402, upgradeRequired=True)
    except Exception as exc:  # noqa: BLE001
        return error(str(exc) or 'Anschreiben konnte nicht generiert werden.', 500)
    return json_response({
        'success': True,
        'subject': package['subject'],
        'emailBody': package['emailBody'],
        'coverLetter': package['motivationLetter'],
        'jobTitle': title,
        'companyName': company,
    })


match = methods(POST=ai_match)
cover_letter = methods(POST=ai_cover_letter)
