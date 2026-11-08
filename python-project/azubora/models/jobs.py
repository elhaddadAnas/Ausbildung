"""Training offers, favourites, applications and their e-mail conversations."""
from django.db import models
from django.utils import timezone

from .base import BaseModel, Created, JobOfferFK, OptText, Text, Updated, UserFK, When
from .fields import IdField, UTCDateTimeField


class JobOffer(BaseModel):
    id = IdField()
    external_id = Text('externalId', unique=True)  # BA Arbeitsagentur reference number
    title = models.TextField()
    company = models.TextField()
    location = models.TextField()
    postal_code = OptText('postalCode')
    federal_state = OptText('federalState')
    category = models.TextField(null=True, blank=True)
    contract_type = OptText('contractType')
    work_time = OptText('workTime')
    remote = models.BooleanField(default=False)
    salary = models.TextField(null=True, blank=True)
    description = models.TextField()
    requirements = models.TextField(null=True, blank=True)
    url = models.TextField(null=True, blank=True)
    contact_email = OptText('contactEmail')
    published_at = UTCDateTimeField(db_column='publishedAt', default=timezone.now)
    active = models.BooleanField(default=True)
    search_keyword = OptText('searchKeyword')
    created_at = Created()
    updated_at = Updated()

    class Meta:
        db_table = 'JobOffer'
        indexes = [
            models.Index(fields=['active', 'created_at'], name='JobOffer_active_createdAt_idx'),
            models.Index(fields=['published_at'], name='JobOffer_publishedAt_idx'),
        ]


class FavoriteJob(BaseModel):
    id = IdField()
    user = UserFK(related_name='favorites')
    job_offer = JobOfferFK('favorites')
    created_at = Created()

    class Meta:
        db_table = 'FavoriteJob'
        constraints = [
            models.UniqueConstraint(fields=['user', 'job_offer'], name='FavoriteJob_userId_jobOfferId_key'),
        ]
        indexes = [models.Index(fields=['user', 'created_at'], name='FavoriteJob_userId_idx')]


class JobApplication(BaseModel):
    id = IdField()
    user = UserFK(related_name='applications')
    job_offer = JobOfferFK('applications')
    status = models.TextField(default='SAVED')  # SAVED, APPLIED, INTERVIEW, OFFER, REJECTED
    match_score = models.IntegerField(db_column='matchScore', null=True, blank=True)
    cover_letter = OptText('coverLetter')
    missing_skills = OptText('missingSkills')  # JSON list
    cv_tips = OptText('cvTips')  # JSON list
    notes_text = OptText('notesText')
    applied_at = When('appliedAt')
    interview_date = When('interviewDate')
    delivery_status = OptText('deliveryStatus')
    delivery_started_at = When('deliveryStartedAt')
    delivery_error = OptText('deliveryError')
    created_at = Created()
    updated_at = Updated()

    class Meta:
        db_table = 'JobApplication'
        constraints = [
            models.UniqueConstraint(fields=['user', 'job_offer'], name='JobApplication_userId_jobOfferId_key'),
        ]
        indexes = [
            models.Index(fields=['user', 'status'], name='JobApp_user_status_idx'),
            models.Index(fields=['user', 'applied_at'], name='JobApp_user_applied_idx'),
            models.Index(fields=['user', 'interview_date'], name='JobApp_user_interview_idx'),
        ]


class ApplicationNote(BaseModel):
    id = IdField()
    application = models.ForeignKey(
        'JobApplication', db_column='applicationId', on_delete=models.CASCADE, related_name='notes'
    )
    text = models.TextField()
    created_at = Created()

    class Meta:
        db_table = 'ApplicationNote'


class ApplicationMessage(BaseModel):
    id = IdField()
    application = models.ForeignKey(
        'JobApplication', db_column='applicationId', on_delete=models.CASCADE, related_name='messages'
    )
    user = UserFK(related_name='application_messages')
    direction = models.TextField()  # INBOUND, OUTBOUND
    message_id = OptText('messageId', unique=True)
    in_reply_to = OptText('inReplyTo')
    from_email = Text('fromEmail')
    to_email = Text('toEmail')
    subject = models.TextField()
    body_text = Text('bodyText')
    sent_at = UTCDateTimeField(db_column='sentAt')
    read_at = When('readAt')
    ai_summary = OptText('aiSummary')
    reply_type = OptText('replyType')  # INTERVIEW, OFFER, REJECTION, REQUEST, ACKNOWLEDGEMENT, OTHER
    action_items = OptText('actionItems')  # JSON list
    detected_links = OptText('detectedLinks')  # JSON list of {url, label}
    analysis_status = OptText('analysisStatus')  # COMPLETED, FALLBACK
    appointment_at = When('appointmentAt')
    appointment_end_at = When('appointmentEndAt')
    appointment_timezone = OptText('appointmentTimezone')
    appointment_location = OptText('appointmentLocation')
    appointment_link = OptText('appointmentLink')
    analyzed_at = When('analyzedAt')
    created_at = Created()

    class Meta:
        db_table = 'ApplicationMessage'
        indexes = [
            models.Index(fields=['application', 'sent_at'], name='AppMessage_app_sent_idx'),
            models.Index(fields=['user', 'direction', 'read_at'], name='AppMessage_unread_idx'),
            models.Index(fields=['user', 'appointment_at'], name='AppMessage_appointment_idx'),
        ]


class CompanyContact(BaseModel):
    """Application e-mail found on a company's own website (cached, shared by all users)."""
    id = IdField()
    name_key = Text('nameKey', unique=True)
    company_name = Text('companyName')
    website = models.TextField(null=True, blank=True)
    email = models.TextField(null=True, blank=True)
    source_url = OptText('sourceUrl')
    status = models.TextField()  # FOUND, NOT_FOUND
    checked_at = UTCDateTimeField(db_column='checkedAt', default=timezone.now)

    class Meta:
        db_table = 'CompanyContact'
