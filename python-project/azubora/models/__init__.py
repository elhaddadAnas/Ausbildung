"""M — the data model.

Table and column names are those of the original Prisma schema so an existing
database can be used as-is: Python attributes are snake_case and ``db_column``
holds the camelCase name, which is also the key used in JSON responses.
"""
from .billing import AiUsage, BankTransferPayment
from .jobs import ApplicationMessage, ApplicationNote, CompanyContact, FavoriteJob, JobApplication, JobOffer
from .preferences import AutoApplyConfig, AutoApplySkippedOffer, NotificationConfig, SmtpConfig
from .profile import Certificate, Education, Experience, Skill, UserProfile
from .system import AuditLog, QueueJob, SystemLog
from .user import User

__all__ = [
    'AiUsage',
    'ApplicationMessage',
    'ApplicationNote',
    'AuditLog',
    'AutoApplyConfig',
    'AutoApplySkippedOffer',
    'BankTransferPayment',
    'Certificate',
    'CompanyContact',
    'Education',
    'Experience',
    'FavoriteJob',
    'JobApplication',
    'JobOffer',
    'NotificationConfig',
    'QueueJob',
    'Skill',
    'SmtpConfig',
    'SystemLog',
    'User',
    'UserProfile',
]
