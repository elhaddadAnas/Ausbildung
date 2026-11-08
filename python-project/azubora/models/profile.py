"""Candidate profile, CV and its education, experience, certificates and skills."""
from django.db import models

from .base import BaseModel, Bool, Created, Int, OptText, ProfileFK, Text, Updated
from .fields import IdField


class UserProfile(BaseModel):
    id = IdField()
    user = models.OneToOneField('User', db_column='userId', on_delete=models.CASCADE, related_name='profile')
    phone = models.TextField(null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    city = models.TextField(null=True, blank=True)
    postal_code = OptText('postalCode')
    federal_state = OptText('federalState')
    date_of_birth = OptText('dateOfBirth')
    place_of_birth = OptText('placeOfBirth')
    bio = models.TextField(null=True, blank=True)
    driving_license = OptText('drivingLicense')
    languages = models.TextField(null=True, blank=True)  # JSON list
    salary_expectation = OptText('salaryExpectation')
    contract_type_preference = OptText('contractTypePreference')
    remote_preference = Bool('remotePreference')
    auto_search_enabled = Bool('autoSearchEnabled', default=True)
    auto_search_interval_mins = Int('autoSearchIntervalMins', default=30)
    cv_file_url = OptText('cvFileUrl')
    cv_file_name = OptText('cvFileName')
    cv_file_data = models.BinaryField(db_column='cvFileData', null=True, blank=True)
    cv_mime_type = OptText('cvMimeType')
    cv_parsed_text = OptText('cvParsedText')
    created_at = Created()
    updated_at = Updated()

    class Meta:
        db_table = 'UserProfile'


class Education(BaseModel):
    id = IdField()
    profile = ProfileFK('educations')
    degree = models.TextField()
    field_of_study = OptText('fieldOfStudy')
    institution = models.TextField()
    location = models.TextField(null=True, blank=True)
    start_date = Text('startDate')
    end_date = OptText('endDate')
    current = models.BooleanField(default=False)
    description = models.TextField(null=True, blank=True)
    created_at = Created()

    class Meta:
        db_table = 'Education'


class Experience(BaseModel):
    id = IdField()
    profile = ProfileFK('experiences')
    job_title = Text('jobTitle')
    company = models.TextField()
    location = models.TextField(null=True, blank=True)
    start_date = Text('startDate')
    end_date = OptText('endDate')
    current = models.BooleanField(default=False)
    description = models.TextField(null=True, blank=True)
    created_at = Created()

    class Meta:
        db_table = 'Experience'


class Certificate(BaseModel):
    id = IdField()
    profile = ProfileFK('certificates')
    title = models.TextField()
    issuer = models.TextField()
    issue_date = OptText('issueDate')
    url = models.TextField(null=True, blank=True)
    created_at = Created()

    class Meta:
        db_table = 'Certificate'


class Skill(BaseModel):
    id = IdField()
    profile = ProfileFK('skills')
    name = models.TextField()
    category = models.TextField(null=True, blank=True)
    level = models.TextField(null=True, blank=True)
    created_at = Created()

    class Meta:
        db_table = 'Skill'
