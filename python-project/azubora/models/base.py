"""Shared model base class and column helpers (camelCase column names from the Prisma schema)."""
from django.db import models
from django.utils import timezone

from .fields import UTCDateTimeField


class TouchingQuerySet(models.QuerySet):
    """``update()`` also refreshes ``auto_now`` fields, like Prisma's @updatedAt."""

    def update(self, **kwargs):
        for field in self.model._meta.concrete_fields:
            if getattr(field, 'auto_now', False) and field.name not in kwargs:
                kwargs[field.name] = timezone.now()
        return super().update(**kwargs)


class BaseModel(models.Model):
    objects = TouchingQuerySet.as_manager()

    class Meta:
        abstract = True


def Text(column, **kwargs):
    return models.TextField(db_column=column, **kwargs)


def OptText(column, **kwargs):
    return models.TextField(db_column=column, null=True, blank=True, **kwargs)


def Bool(column, default=False):
    return models.BooleanField(db_column=column, default=default)


def Int(column, default=0, **kwargs):
    return models.IntegerField(db_column=column, default=default, **kwargs)


def Created():
    return UTCDateTimeField(db_column='createdAt', default=timezone.now)


def Updated():
    return UTCDateTimeField(db_column='updatedAt', auto_now=True)


def When(column, **kwargs):
    return UTCDateTimeField(db_column=column, null=True, blank=True, **kwargs)


def UserFK(column='userId', related_name=None, **kwargs):
    kwargs.setdefault('on_delete', models.CASCADE)
    return models.ForeignKey('User', db_column=column, related_name=related_name, **kwargs)


def ProfileFK(related_name):
    return models.ForeignKey('UserProfile', db_column='profileId', on_delete=models.CASCADE, related_name=related_name)


def JobOfferFK(related_name):
    return models.ForeignKey('JobOffer', db_column='jobOfferId', on_delete=models.CASCADE, related_name=related_name)
