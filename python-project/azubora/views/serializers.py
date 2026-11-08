"""Model → JSON conversion matching the original API's (Prisma) response shape.

Keys are the camelCase column names, datetimes are ISO-8601 strings in UTC
with millisecond precision (``2026-01-31T09:00:00.000Z``), like
``JSON.stringify(new Date())``.
"""
import datetime as dt
import json
from typing import Any, Iterable

from django.db import models

# Columns that must never be sent to the browser.
NEVER_SERIALIZED = {'cvFileData', 'passwordHash', 'authPassEncrypted'}


def iso(value: dt.datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    return value.astimezone(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def json_key(field: models.Field) -> str:
    return field.db_column or field.attname


def to_dict(instance: models.Model | None, exclude: Iterable[str] = (), only: Iterable[str] | None = None,
            **relations: Any) -> dict | None:
    """Serialize scalar columns, then add pre-serialized ``relations``."""
    if instance is None:
        return None
    excluded = NEVER_SERIALIZED | set(exclude)
    wanted = set(only) if only is not None else None
    data: dict[str, Any] = {}
    for field in instance._meta.concrete_fields:
        key = json_key(field)
        if key in excluded or (wanted is not None and key not in wanted):
            continue
        data[key] = getattr(instance, field.attname)
    data.update(relations)
    return data


class ApiJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, dt.datetime):
            return iso(o)
        if isinstance(o, dt.date):
            return o.isoformat()
        if isinstance(o, (bytes, memoryview)):
            return None
        if isinstance(o, set):
            return list(o)
        return super().default(o)


def dumps(value: Any) -> str:
    return json.dumps(value, cls=ApiJSONEncoder, ensure_ascii=False)


# Common shapes ------------------------------------------------------------------

def profile_dict(profile, include_user: bool = False, include_certificates: bool = True) -> dict | None:
    if profile is None:
        return None
    relations: dict[str, Any] = {
        'educations': [to_dict(item) for item in profile.educations.all()],
        'experiences': [to_dict(item) for item in profile.experiences.all()],
        'skills': [to_dict(item) for item in profile.skills.all()],
    }
    if include_certificates:
        relations['certificates'] = [to_dict(item) for item in profile.certificates.all()]
    if include_user:
        relations['user'] = to_dict(profile.user, only=('name', 'email', 'avatarUrl'))
    return to_dict(profile, **relations)


def application_dict(application, *, notes=False, latest_reply=None, include_latest_reply=False, messages=None):
    relations: dict[str, Any] = {'jobOffer': to_dict(application.job_offer)}
    if notes:
        relations['notes'] = [to_dict(note) for note in application.notes.all().order_by('-created_at')]
    if include_latest_reply:
        relations['latestReply'] = to_dict(latest_reply)
    if messages is not None:
        relations['messages'] = [to_dict(message) for message in messages]
    return to_dict(application, **relations)
