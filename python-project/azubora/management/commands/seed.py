"""Create the admin account, a demo user and sample offers.

Requires ADMIN_EMAIL, ADMIN_PASSWORD and DEMO_PASSWORD (12+ characters).
"""
import datetime as dt
import os

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from azubora.models import (
    Education,
    JobApplication,
    JobOffer,
    NotificationConfig,
    Skill,
    SystemLog,
    User,
    UserProfile,
)
from azubora.services.authentication import hash_password
from azubora.views.serializers import dumps

DEMO_EMAIL = 'demo@ausbildung-finder.de'

JOBS = [
    {
        'external_id': 'BA-10000-11892341',
        'title': 'Ausbildung 2026: Fachinformatiker (m/w/d) Anwendungsentwicklung',
        'company': 'SAP SE', 'location': 'Berlin', 'postal_code': '10117', 'federal_state': 'Berlin',
        'category': 'IT & Software', 'remote': True, 'salary': '1.250 € / Monat',
        'description': ('Entwicklung moderner Cloud-Softwarelösungen mit JavaScript, TypeScript, Python und Java. '
                        'Arbeiten in agilen SCRUM Teams.'),
        'requirements': ('Abitur oder sehr guter Realschulabschluss, gute Mathe- und Englischkenntnisse, erste '
                         'Programmiererfahrung.'),
        'search_keyword': 'Fachinformatiker',
    },
    {
        'external_id': 'BA-10000-11892342',
        'title': 'Ausbildung zum Kaufmann für Büromanagement (m/w/d)',
        'company': 'Siemens AG', 'location': 'München', 'postal_code': '80333', 'federal_state': 'Bayern',
        'category': 'Kaufmännisch', 'remote': False, 'salary': '1.180 € / Monat',
        'description': ('Erlernen organisatorischer und kaufmännischer Aufgaben in Kundenkommunikation, '
                        'Rechnungswesen und Projektmanagement.'),
        'requirements': 'Mittlere Reife, MS-Office Kenntnisse, Kommunikationsstärke.',
        'search_keyword': 'Kaufmann',
    },
    {
        'external_id': 'BA-10000-11892343',
        'title': 'Ausbildung Mechatroniker (m/w/d) 2026',
        'company': 'BMW Group', 'location': 'München', 'postal_code': '80809', 'federal_state': 'Bayern',
        'category': 'Handwerk & Industrie', 'remote': False, 'salary': '1.220 € / Monat',
        'description': ('Kombination aus Mechanik, Elektronik und Informatik. Montage und Instandhaltung '
                        'automatisierter Roboteranlagen.'),
        'requirements': 'Realschulabschluss mit Physik & Mathe, technisches Verständnis.',
        'search_keyword': 'Mechatroniker',
    },
    {
        'external_id': 'BA-10000-11892344',
        'title': 'Ausbildung Pflegefachfrau / Pflegefachmann (m/w/d)',
        'company': 'Charité Universitätsmedizin Berlin', 'location': 'Berlin', 'postal_code': '10117',
        'federal_state': 'Berlin', 'category': 'Gesundheit & Pflege', 'remote': False, 'salary': '1.340 € / Monat',
        'description': 'Generalistische Pflegeausbildung mit Praxiseinsätzen in Chirurgie, Pädiatrie und Intensivpflege.',
        'requirements': 'Mittlerer Schulabschluss, B2 Deutschkenntnisse, Einfühlungsvermögen.',
        'search_keyword': 'Pflege',
    },
    {
        'external_id': 'BA-10000-11892345',
        'title': 'Ausbildung Fachinformatiker Systemintegration (m/w/d)',
        'company': 'Deutsche Telekom AG', 'location': 'Köln', 'postal_code': '50667',
        'federal_state': 'Nordrhein-Westfalen', 'category': 'IT & Software', 'remote': True,
        'salary': '1.190 € / Monat',
        'description': 'Planung, Konfiguration und Betreuung von IT-Netzwerken, Servern und Cyber-Security Systemen.',
        'requirements': 'Realschulabschluss oder Abitur, IT-Interesse.',
        'search_keyword': 'Systemintegration',
    },
]


class Command(BaseCommand):
    help = 'Seed an admin account, a demo user and sample training offers.'

    @transaction.atomic
    def handle(self, *args, **options):
        admin_email = os.environ.get('ADMIN_EMAIL', '').strip().lower()
        admin_password = os.environ.get('ADMIN_PASSWORD', '')
        demo_password = os.environ.get('DEMO_PASSWORD', '')
        if not admin_email or len(admin_password) < 12 or len(demo_password) < 12:
            raise CommandError('ADMIN_EMAIL, ADMIN_PASSWORD and DEMO_PASSWORD (12+ characters) are required.')

        User.objects.get_or_create(email=admin_email, defaults={
            'name': 'System Admin', 'password_hash': hash_password(admin_password), 'role': 'ADMIN'})
        demo, _ = User.objects.get_or_create(email=DEMO_EMAIL, defaults={
            'name': 'Lukas Weber', 'password_hash': hash_password(demo_password), 'role': 'USER'})
        profile, _ = UserProfile.objects.get_or_create(user=demo, defaults={
            'phone': '+49 176 12345678', 'address': 'Friedrichstraße 42', 'city': 'Berlin', 'postal_code': '10117',
            'federal_state': 'Berlin',
            'bio': ('Motivierter Fachinformatiker-Anwärter mit Leidenschaft für moderne Webtechnologien und '
                    'Software-Architektur.'),
            'driving_license': 'Klasse B (PKW)',
            'languages': dumps(['Deutsch (Muttersprache)', 'Englisch (C1 - Verhandlungssicher)']),
            'salary_expectation': '1.200 € / Monat', 'contract_type_preference': 'Vollzeit',
            'remote_preference': True,
            'cv_parsed_text': ('Lukas Weber. Abitur 2025. Erfahrung mit HTML, CSS, JavaScript, React, Python, Git. '
                               'Praktikum in IT-Abteilung.'),
        })
        if not profile.educations.exists():
            Education.objects.create(
                profile=profile, degree='Abitur (Allgemeine Hochschulreife)',
                field_of_study='Schwerpunkt Mathematik & Informatik', institution='Heinrich-Hertz-Gymnasium Berlin',
                location='Berlin', start_date='2017-09', end_date='2025-06',
                description='Abschlussnote: 1,8. Leistungskurse Mathematik und Englisch.')
        if not profile.skills.exists():
            Skill.objects.bulk_create([
                Skill(profile=profile, name=name, category=category, level=level) for name, category, level in (
                    ('JavaScript / TypeScript', 'IT', 'Advanced'),
                    ('React & Next.js', 'IT', 'Intermediate'),
                    ('Python', 'IT', 'Intermediate'),
                    ('Git & GitHub', 'IT', 'Advanced'),
                    ('MS Office & Excel', 'Kaufmännisch', 'Expert'),
                    ('Englisch C1', 'Sprachen', 'Advanced'),
                )
            ])
        for job in JOBS:
            JobOffer.objects.get_or_create(external_id=job['external_id'], defaults={
                **job, 'contract_type': 'Berufsausbildung', 'work_time': 'Vollzeit',
                'url': f"https://web.arbeitsagentur.de/ausbildungssuche/berufsausbildung-suche?id={job['external_id']}",
            })
        now = timezone.now()
        applications = (
            ('BA-10000-11892341', {
                'status': 'INTERVIEW', 'match_score': 92,
                'missing_skills': dumps(['Docker', 'REST-APIs']),
                'cv_tips': dumps(['Heben Sie Ihr Schulprojekt in React im Anschreiben hervor.']),
                'notes_text': 'Vorstellungsgespräch am 15. August um 10:00 Uhr via Microsoft Teams.',
                'interview_date': now + dt.timedelta(days=5), 'applied_at': now - dt.timedelta(days=3)}),
            ('BA-10000-11892345', {
                'status': 'APPLIED', 'match_score': 85, 'missing_skills': dumps(['Cisco Networking']),
                'cv_tips': dumps(['Zertifikate hinzufügen']), 'notes_text': 'Bewerbung per E-Mail gesendet.',
                'applied_at': now - dt.timedelta(days=1)}),
            ('BA-10000-11892343', {
                'status': 'SAVED', 'match_score': 78, 'missing_skills': dumps(['CAD Grundlagen']),
                'notes_text': 'Interessantes Angebot für August.'}),
        )
        for external_id, defaults in applications:
            JobApplication.objects.get_or_create(
                user=demo, job_offer=JobOffer.objects.get(external_id=external_id), defaults=defaults)
        NotificationConfig.objects.get_or_create(user=demo)
        if not SystemLog.objects.exists():
            SystemLog.objects.create(source='SEED', level='INFO', message='Données de démonstration initialisées.')
        self.stdout.write(self.style.SUCCESS(f'Seed complete: admin {admin_email}, demo {DEMO_EMAIL}.'))
