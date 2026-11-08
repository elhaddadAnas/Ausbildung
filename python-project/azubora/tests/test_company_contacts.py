"""Finding application addresses on company websites (offline, with fake pages)."""
from unittest import mock

from django.test import SimpleTestCase, TestCase

from azubora.models import CompanyContact
from azubora.services import company_contacts as cc

SITES = {
    'https://www.gessmann.de': '<a href="/jobs/">Karriere</a> <a href="/impressum/">Impressum</a>',
    'https://www.gessmann.de/impressum/': 'Impressum W. Gessmann GmbH, Eppingen. info@gessmann.de datenschutz@gessmann.de',
    'https://www.gessmann.de/jobs/': 'Bewerbungen an bewerbung@gessmann.de oder max.muster@gessmann.de',
    # A different company that happens to own the guessed domain.
    'https://www.mag.de': '<a href="/impressum">Impressum</a>',
    'https://www.mag.de/impressum': 'MAG Kabel GmbH, info@mag.de',
    # Real domain is an abbreviation: only reachable through a suggested domain.
    'https://www.uk-koeln.de': '<a href="/impressum/">Impressum</a> <a href="/karriere/">Karriere</a>',
    'https://www.uk-koeln.de/impressum/': 'Impressum: Universitätsklinikum Köln AöR, priorat@uk-koeln.de',
    'https://www.uk-koeln.de/karriere/': 'Ihre Ansprechpartnerin: anna.berg@uk-koeln.de',
}


class FakeResponse:
    ok = True
    headers = {'content-type': 'text/html'}

    def __init__(self, url):
        self.url, self.text = url, SITES[url]


def fake_get(self, url):
    url = url.rstrip('/') if url.rstrip('/') in SITES else url
    return FakeResponse(url) if url in SITES else None


class NameTests(SimpleTestCase):
    def test_words_and_candidates(self):
        self.assertEqual(cc.name_words('KG Bursped Speditions GmbH & Co. KG'), ['bursped', 'speditions'])
        self.assertEqual(cc.distinctive_words('KORIAN Holding GmbH'), ['korian'])
        self.assertIn('https://www.hofmann-foerdertechnik.com', cc.candidate_sites('Hofmann Fördertechnik GmbH'))

    def test_impressum_must_name_the_company(self):
        self.assertTrue(cc._names_company('Angaben gemäß § 5 TMG: W. Gessmann GmbH', 'W. Gessmann GmbH'))
        self.assertFalse(cc._names_company('MAG Kabel GmbH', 'MAG IAS GmbH Standort Eislingen'))

    def test_choose_email_falls_back_to_other_suitable_addresses(self):
        # A role address that is on no list is fine; unsuitable ones never are.
        self.assertEqual(cc.choose_email({'priorat@orden.de', 'datenschutz@orden.de'}, 'orden.de'), 'priorat@orden.de')
        # Sister domain of the same organisation.
        self.assertEqual(cc.choose_email({'malteser@malteser.org'}, 'malteser.de'), 'malteser@malteser.org')
        # Personal addresses only when they appear on a careers page.
        self.assertIsNone(cc.choose_email({'anna.berg@x.de': 'https://x.de/team'}, 'x.de'))
        self.assertEqual(cc.choose_email({'anna.berg@x.de': 'https://x.de/karriere'}, 'x.de'), 'anna.berg@x.de')

    def test_choose_email_prefers_recruiting_role_addresses(self):
        emails = {'info@acme.de', 'bewerbung@acme.de', 'datenschutz@acme.de', 'jobs@other.de',
                  'anna.schmidt@acme.de', 'e089d2733edd42d2bf24@acme.de'}
        self.assertEqual(cc.choose_email(emails, 'acme.de'), 'bewerbung@acme.de')
        self.assertEqual(cc.choose_email({'info@acme.de', 'presse@acme.de'}, 'acme.de'), 'info@acme.de')
        self.assertIsNone(cc.choose_email({'presse@acme.de', 'jobs@notacme.de'}, 'acme.de'))


@mock.patch.object(cc._Fetcher, 'allowed', lambda self, url: True)
@mock.patch.object(cc._Fetcher, 'get', fake_get)
@mock.patch.object(cc, 'suggested_sites', lambda company, location='': [])
class FinderTests(TestCase):
    def test_finds_recruiting_address_and_caches_it(self):
        found = cc.find_company_email('W. Gessmann GmbH')
        self.assertEqual(found['email'], 'bewerbung@gessmann.de')
        self.assertEqual(CompanyContact.objects.get().status, 'FOUND')
        with mock.patch.object(cc, '_search_site') as search:
            self.assertEqual(cc.find_company_email('W. GESSMANN GmbH')['email'], 'bewerbung@gessmann.de')
        search.assert_not_called()

    def test_rejects_a_different_company_on_the_guessed_domain(self):
        self.assertIsNone(cc.find_company_email('MAG IAS GmbH Standort Eislingen'))
        self.assertEqual(CompanyContact.objects.get().status, 'NOT_FOUND')

    def test_resolve_uses_website_only_when_the_offer_has_no_address(self):
        job = {'externalId': 'BA-1-X', 'company': 'W. Gessmann GmbH'}
        with mock.patch('azubora.services.arbeitsagentur.enrich_offer', side_effect=lambda j: {**j, 'contactEmail': None}):
            resolved = cc.resolve_application_email(job)
        self.assertEqual((resolved['contactEmail'], resolved['contactEmailSource']),
                         ('bewerbung@gessmann.de', 'company_website'))
        with mock.patch('azubora.services.arbeitsagentur.enrich_offer',
                        side_effect=lambda j: {**j, 'contactEmail': 'hr@ba.de'}):
            self.assertEqual(cc.resolve_application_email(job)['contactEmailSource'], 'arbeitsagentur')

    def test_ai_suggested_domain_is_used_only_after_impressum_check(self):
        with mock.patch.object(cc, 'suggested_sites', return_value=['https://www.uk-koeln.de']):
            found = cc.find_company_email('Universitätsklinikum Köln AöR', 'Köln')
        self.assertEqual(found['email'], 'priorat@uk-koeln.de')
        with mock.patch.object(cc, 'suggested_sites', return_value=['https://www.uk-koeln.de']):
            self.assertIsNone(cc.find_company_email('Klinikum Bonn GmbH', 'Bonn'))



class UnreachableWebsiteTests(TestCase):
    def test_no_response_at_all_is_not_cached_as_not_found(self):
        import requests

        with mock.patch.object(cc._Fetcher, 'allowed', lambda self, url: True), \
                mock.patch.object(cc, 'suggested_sites', lambda company, location='': []), \
                mock.patch('requests.Session.get', side_effect=requests.ConnectionError):
            with self.assertRaises(cc.LookupUnavailable):
                cc.find_company_email('W. Gessmann GmbH')
            with mock.patch('azubora.services.arbeitsagentur.enrich_offer',
                            side_effect=lambda job: {**job, 'contactEmail': None}):
                resolved = cc.resolve_application_email({'externalId': 'BA-1-X', 'company': 'W. Gessmann GmbH'})
        self.assertTrue(resolved['lookupFailed'])
        self.assertFalse(CompanyContact.objects.exists())
