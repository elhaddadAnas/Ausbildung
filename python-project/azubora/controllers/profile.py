"""Candidate profile, its education/experience/skills and the CV upload."""
import logging
import os
import re

from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone

from azubora.controllers.base import as_bool, as_number, methods, optional_text, read_json, text
from azubora.controllers.session import login_required
from azubora.models import AutoApplyConfig, Education, Experience, Skill, User, UserProfile
from azubora.services.ai import parse_cv
from azubora.services.applications import remove_stored_cv
from azubora.services.authentication import user_profile
from azubora.services.documents import extract_docx_text, extract_pdf_text
from azubora.services.ratelimit import check_rate_limit
from azubora.services.subscriptions import SubscriptionLimitError
from azubora.views.responses import error, json_response, rate_limited
from azubora.views.serializers import dumps, iso, profile_dict, to_dict

logger = logging.getLogger(__name__)


def _profile_with_relations(user_id: str):
    return (UserProfile.objects.select_related('user').defer('cv_file_data')
            .prefetch_related('educations', 'experiences', 'certificates', 'skills')
            .filter(user_id=user_id).first())


@login_required()
def get_profile(request: HttpRequest, user: User):
    return json_response({'profile': profile_dict(_profile_with_relations(user.id), include_user=True)})


PROFILE_TEXT_FIELDS = {
    'phone': ('phone', 50),
    'address': ('address', 300),
    'city': ('city', 100),
    'postalCode': ('postal_code', 20),
    'federalState': ('federal_state', 100),
    'dateOfBirth': ('date_of_birth', 30),
    'placeOfBirth': ('place_of_birth', 100),
    'bio': ('bio', 5_000),
    'drivingLicense': ('driving_license', 100),
    'salaryExpectation': ('salary_expectation', 100),
    'contractTypePreference': ('contract_type_preference', 100),
}


@login_required()
def update_profile(request: HttpRequest, user: User):
    data = read_json(request)
    if 'name' in data:
        name = text(data['name'])
        if not 2 <= len(name) <= 100:
            return error('Le nom doit contenir entre 2 et 100 caractères.', 400)
    interval = as_number(data.get('autoSearchIntervalMins'))
    interval_mins = min(24 * 60, max(15, round(interval))) if interval is not None else 30
    if isinstance(data.get('languages'), list):
        languages = dumps([text(item, 100) for item in data['languages'] if text(item)][:20])
    else:
        languages = optional_text(data.get('languages'), 2_000)

    profile = UserProfile.objects.filter(user_id=user.id).first()
    if profile is None:
        profile = UserProfile(user_id=user.id, languages=languages or '[]',
                              remote_preference=as_bool(data.get('remotePreference')),
                              auto_search_enabled=data.get('autoSearchEnabled') is not False,
                              auto_search_interval_mins=interval_mins)
        for key, (attribute, limit) in PROFILE_TEXT_FIELDS.items():
            setattr(profile, attribute, optional_text(data.get(key), limit))
    else:
        for key, (attribute, limit) in PROFILE_TEXT_FIELDS.items():
            if key in data:
                setattr(profile, attribute, optional_text(data[key], limit))
        if 'languages' in data:
            profile.languages = languages
        if 'remotePreference' in data:
            profile.remote_preference = as_bool(data['remotePreference'])
        if 'autoSearchEnabled' in data:
            profile.auto_search_enabled = as_bool(data['autoSearchEnabled'])
        if 'autoSearchIntervalMins' in data:
            profile.auto_search_interval_mins = interval_mins
    profile.save()

    user_changes = {}
    if 'name' in data:
        user_changes['name'] = text(data['name'])
    if 'avatarUrl' in data:
        user_changes['avatar_url'] = optional_text(data['avatarUrl'], 2_000)
    if user_changes:
        User.objects.filter(id=user.id).update(**user_changes)
    return json_response({'success': True, 'profile': to_dict(profile)})


profile = methods(GET=get_profile, PUT=update_profile)


def _profile_or_401(user: User):
    return user_profile(user)


@login_required('Nicht autorisiert')
def add_education(request: HttpRequest, user: User):
    profile = _profile_or_401(user)
    if profile is None:
        return error('Nicht autorisiert', 401)
    body = read_json(request)
    if not text(body.get('degree')) or not text(body.get('institution')):
        return error('Le diplôme et l’établissement sont obligatoires.', 400)
    education = Education.objects.create(
        profile=profile,
        degree=text(body['degree'], 200),
        field_of_study=optional_text(body.get('fieldOfStudy'), 200),
        institution=text(body['institution'], 200),
        location=optional_text(body.get('location'), 200),
        start_date=text(body.get('startDate'), 30),
        end_date=optional_text(body.get('endDate'), 30),
        current=as_bool(body.get('current')),
        description=optional_text(body.get('description'), 2000),
    )
    return json_response({'success': True, 'education': to_dict(education)})


@login_required('Nicht autorisiert')
def add_experience(request: HttpRequest, user: User):
    profile = _profile_or_401(user)
    if profile is None:
        return error('Nicht autorisiert', 401)
    body = read_json(request)
    if not text(body.get('jobTitle')) or not text(body.get('company')):
        return error('Le poste et l’entreprise sont obligatoires.', 400)
    experience = Experience.objects.create(
        profile=profile,
        job_title=text(body['jobTitle'], 200),
        company=text(body['company'], 200),
        location=optional_text(body.get('location'), 200),
        start_date=text(body.get('startDate'), 30),
        end_date=optional_text(body.get('endDate'), 30),
        current=as_bool(body.get('current')),
        description=optional_text(body.get('description'), 2000),
    )
    return json_response({'success': True, 'experience': to_dict(experience)})


@login_required('Nicht autorisiert')
def add_skill(request: HttpRequest, user: User):
    profile = _profile_or_401(user)
    if profile is None:
        return error('Nicht autorisiert', 401)
    body = read_json(request)
    name = text(body.get('name'))
    if not name:
        return error('Le nom de la compétence est obligatoire.', 400)
    skill = Skill.objects.create(
        profile=profile,
        name=name[:120],
        category=text(body.get('category') or 'General', 80),
        level=text(body.get('level') or 'Intermediate', 40),
    )
    return json_response({'success': True, 'skill': to_dict(skill)})


def _delete_owned(model, not_found: str):
    @login_required('Nicht autorisiert')
    def view(request: HttpRequest, user: User):
        item_id = request.GET.get('id')
        if not item_id:
            return error('ID fehlt', 400)
        deleted, _ = model.objects.filter(id=item_id, profile__user_id=user.id).delete()
        if not deleted:
            return error(not_found, 404)
        return json_response({'success': True})

    return view


education = methods(POST=add_education, DELETE=_delete_owned(Education, 'Formation introuvable.'))
experience = methods(POST=add_experience, DELETE=_delete_owned(Experience, 'Expérience introuvable.'))
skills = methods(POST=add_skill, DELETE=_delete_owned(Skill, 'Compétence introuvable.'))

_CONTROL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')
DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'


def clean(value, max_length: int = 20_000) -> str:
    if value is None:
        return ''
    return _CONTROL.sub('', str(value).replace('\x00', '')).strip()[:max_length]


@login_required('Non autorisé.')
def upload_cv(request: HttpRequest, user: User):
    allowed, retry = check_rate_limit(f'cv-upload:{user.id}', 5, 60 * 60_000)
    if not allowed:
        return rate_limited('Trop d’importations de CV. Réessayez plus tard.', retry)
    upload = request.FILES.get('file')
    if upload is None:
        return error('Aucun fichier sélectionné.', 400)
    if upload.size <= 0 or upload.size > 4 * 1024 * 1024:
        return error('Le CV doit faire entre 1 octet et 4 Mo.', 400)
    file_name = clean(os.path.basename(upload.name or ''), 255)
    extension = os.path.splitext(file_name)[1].lower()
    if extension not in ('.pdf', '.docx'):
        return error('Format non accepté. Utilisez PDF ou DOCX (convertissez les anciens fichiers DOC).', 400)
    data = upload.read()
    is_pdf = extension == '.pdf' and data[:5] == b'%PDF-'
    is_docx = extension == '.docx' and len(data) >= 4 and data[:2] == b'PK'
    if not is_pdf and not is_docx:
        return error('Le contenu du fichier ne correspond pas au format annoncé.', 400)
    try:
        parsed_text = extract_pdf_text(data) if is_pdf else extract_docx_text(data)
    except Exception:  # noqa: BLE001
        logger.warning('CV text extraction failed.', exc_info=True)
        return error('Le texte du CV ne peut pas être lu. Vérifiez le fichier ou exportez-le de nouveau.', 422)
    parsed_text = clean(parsed_text, 100_000)
    if len(parsed_text) < 20:
        return error('Ce CV ne contient pas assez de texte lisible. Un PDF scanné nécessite une version avec OCR.', 422)

    try:
        info = parse_cv(parsed_text, user.id)
    except SubscriptionLimitError as exc:
        return error(str(exc), 402, upgradeRequired=True)

    previous = user_profile(user)
    previous_url = previous.cv_file_url if previous else None
    stored_url = f'database:{user.id}'
    languages = dumps([clean(item, 100) for item in info.get('languages') or [] if clean(item, 100)][:20]
                      if isinstance(info.get('languages'), list) else [])
    extracted = {
        'phone': clean(info.get('phone'), 50),
        'address': clean(info.get('address'), 300),
        'city': clean(info.get('city'), 100),
        'postal_code': clean(info.get('postalCode'), 20),
        'federal_state': clean(info.get('federalState'), 100),
        'date_of_birth': clean(info.get('dateOfBirth'), 30),
        'place_of_birth': clean(info.get('placeOfBirth'), 100),
        'bio': clean(info.get('bio'), 5_000),
        'driving_license': clean(info.get('drivingLicense'), 100),
        'salary_expectation': clean(info.get('salaryExpectation'), 100),
    }

    with transaction.atomic():
        profile = UserProfile.objects.filter(user_id=user.id).first() or UserProfile(user_id=user.id)
        profile.cv_file_name = file_name
        profile.cv_file_url = stored_url
        profile.cv_file_data = data
        profile.cv_mime_type = 'application/pdf' if is_pdf else DOCX_MIME
        profile.cv_parsed_text = parsed_text
        profile.languages = languages
        for attribute, value in extracted.items():
            # Keep existing values when the CV does not contain the information.
            if value or profile._state.adding:
                setattr(profile, attribute, value or None)
        profile.save()

        cv_name = clean(info.get('name'), 100)
        if len(cv_name) >= 2:
            User.objects.filter(id=user.id).update(name=cv_name)
        Education.objects.filter(profile=profile).delete()
        Experience.objects.filter(profile=profile).delete()
        Skill.objects.filter(profile=profile).delete()

        Education.objects.bulk_create([
            Education(profile=profile,
                      degree=clean(item.get('degree'), 200) or 'Formation / Diplôme',
                      field_of_study=clean(item.get('fieldOfStudy'), 200) or None,
                      institution=clean(item.get('institution'), 200) or 'Établissement non précisé',
                      location=clean(item.get('location'), 200) or None,
                      start_date=clean(item.get('startDate'), 30),
                      end_date=clean(item.get('endDate'), 30) or None,
                      current=bool(item.get('current')),
                      description=clean(item.get('description'), 2_000) or None)
            for item in (info.get('educations') or [])[:30] if isinstance(item, dict)
        ])
        Experience.objects.bulk_create([
            Experience(profile=profile,
                       job_title=clean(item.get('jobTitle'), 200) or 'Poste occupé',
                       company=clean(item.get('company'), 200) or 'Entreprise / Organisation',
                       location=clean(item.get('location'), 200) or None,
                       start_date=clean(item.get('startDate'), 30),
                       end_date=clean(item.get('endDate'), 30) or None,
                       current=bool(item.get('current')),
                       description=clean(item.get('description'), 2_000) or None)
            for item in (info.get('experiences') or [])[:50] if isinstance(item, dict)
        ])
        Skill.objects.bulk_create([
            Skill(profile=profile,
                  name=clean(item.get('name'), 120),
                  category=clean(item.get('category'), 80) or 'Général',
                  level=clean(item.get('level'), 40) or 'Intermediate')
            for item in [skill for skill in (info.get('skills') or []) if isinstance(skill, dict)
                         and clean(skill.get('name'), 120)][:100]
        ])

    if previous_url and previous_url != stored_url:
        remove_stored_cv(previous_url)
    final = _profile_with_relations(user.id)
    return json_response({
        'success': True,
        'message': f'CV {file_name} importé et analysé avec succès.',
        'fileName': file_name,
        'parsedInfo': info,
        'profile': profile_dict(final, include_user=True, include_certificates=False),
    })


@login_required('Non autorisé.')
def delete_cv(request: HttpRequest, user: User):
    profile = UserProfile.objects.defer('cv_file_data').filter(user_id=user.id).first()
    UserProfile.objects.filter(user_id=user.id).update(
        cv_file_name=None, cv_file_url=None, cv_file_data=None, cv_mime_type=None, cv_parsed_text=None)
    AutoApplyConfig.objects.filter(user_id=user.id).update(enabled=False, next_run_at=None, last_result=dumps({
        'success': False,
        'skipped': True,
        'error': 'Le CV a été supprimé. Ajoutez un CV puis réactivez l’auto-candidature.',
        'completedAt': iso(timezone.now()),
    }))
    if profile and profile.cv_file_url:
        remove_stored_cv(profile.cv_file_url)
    return json_response({'success': True})


cv = methods(POST=upload_cv, DELETE=delete_cv)
