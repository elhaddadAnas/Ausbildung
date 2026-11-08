"""Model fields that match the column types of the existing PostgreSQL schema.

The schema was originally created by Prisma: primary keys are UUID strings in
``TEXT`` columns and timestamps are ``TIMESTAMP(3) WITHOUT TIME ZONE`` holding
UTC values. These fields let Django read and write that schema unchanged.
"""
import datetime as dt
import uuid

from django.db import models
from django.utils import timezone


def new_id() -> str:
    return str(uuid.uuid4())


class IdField(models.TextField):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault('primary_key', True)
        kwargs.setdefault('default', new_id)
        kwargs.setdefault('editable', False)
        super().__init__(*args, **kwargs)


class UTCDateTimeField(models.DateTimeField):
    """Timezone-aware in Python, naive UTC ``timestamp(3)`` in PostgreSQL.

    Values are converted to naive UTC before they reach the database so writes
    and comparisons never depend on the session time zone (important behind
    connection poolers such as Neon's PgBouncer).
    """

    def db_type(self, connection):
        if connection.vendor == 'postgresql':
            return 'timestamp(3) without time zone'
        return super().db_type(connection)

    def from_db_value(self, value, expression, connection):
        if isinstance(value, dt.datetime) and timezone.is_naive(value):
            return value.replace(tzinfo=dt.timezone.utc)
        return value

    def get_db_prep_value(self, value, connection, prepared=False):
        if not prepared:
            value = self.get_prep_value(value)
        if isinstance(value, dt.datetime) and timezone.is_aware(value):
            value = value.astimezone(dt.timezone.utc).replace(tzinfo=None)
        return connection.ops.adapt_datetimefield_value(value)
