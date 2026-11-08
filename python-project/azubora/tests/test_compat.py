"""Compatibility with data written by the previous Node.js/Prisma backend."""
import datetime as dt
import os
from unittest import mock

import bcrypt
from django.test import SimpleTestCase, TestCase, override_settings

from azubora.models import User
from azubora.services import smtp
from azubora.services.authentication import JWT_AUDIENCE, JWT_ISSUER, check_password, sign_jwt, verify_jwt
from azubora.views.serializers import iso, to_dict

# Produced by the original src/lib/services/smtp.ts code with Node's crypto module.
NODE_KEYS = {
    'SMTP_ENCRYPTION_KEY': 'test-smtp-key-0123456789abcdefghijklmnop',
    'JWT_SECRET': 'test-jwt-secret-0123456789abcdefghijklmnop',
}
NODE_V2 = ('v2:7a280ad9c7e74d7e611d784c:bc2094f9d845726fae276a51e735583e:'
           'e47883bce5f529dfcc8f6265f8a57998108ff2')
NODE_LEGACY_CBC = 'acb5099a6a33a0f8e965b4325928294b:927be6f0dc0718edafc917a1f55f822b'


class NodeEncryptionCompatTests(SimpleTestCase):
    def setUp(self):
        patcher = mock.patch.dict(os.environ, NODE_KEYS)
        patcher.start()
        self.addCleanup(patcher.stop)
        smtp._keys.cache_clear()
        self.addCleanup(smtp._keys.cache_clear)

    def test_decrypts_node_aes_gcm_values(self):
        self.assertEqual(smtp.decrypt_string(NODE_V2), 'app-password-ÄÖÜ')

    def test_decrypts_original_aes_cbc_values(self):
        self.assertEqual(smtp.decrypt_string(NODE_LEGACY_CBC), 'legacy-pass')

    def test_round_trip_and_tamper_detection(self):
        encrypted = smtp.encrypt_string('secret')
        self.assertTrue(encrypted.startswith('v2:'))
        self.assertEqual(smtp.decrypt_string(encrypted), 'secret')
        tampered = encrypted[:-2] + ('00' if encrypted[-2:] != '00' else '11')
        self.assertEqual(smtp.decrypt_string(tampered), '')

    def test_values_encrypted_with_jwt_secret_before_dedicated_key_still_decrypt(self):
        with mock.patch.dict(os.environ, {'SMTP_ENCRYPTION_KEY': ''}):
            smtp._keys.cache_clear()
            encrypted_with_jwt = smtp.encrypt_string('old-dev-value')
        smtp._keys.cache_clear()
        self.assertEqual(smtp.decrypt_string(encrypted_with_jwt), 'old-dev-value')


class PasswordAndTokenCompatTests(TestCase):
    def test_bcryptjs_2a_hashes_verify(self):
        legacy_hash = bcrypt.hashpw(b'correct horse battery', bcrypt.gensalt(4, prefix=b'2a')).decode()
        self.assertTrue(check_password('correct horse battery', legacy_hash))
        self.assertFalse(check_password('wrong', legacy_hash))
        self.assertFalse(check_password('x', 'not-a-hash'))

    @override_settings(JWT_SECRET='s' * 40)
    def test_token_claims_match_original_format(self):
        user = User.objects.create(email='a@b.de', name='Anna', role='USER')
        payload = verify_jwt(sign_jwt(user))
        self.assertEqual(payload['userId'], user.id)
        self.assertEqual(payload['iss'], JWT_ISSUER)
        self.assertEqual(payload['aud'], JWT_AUDIENCE)
        self.assertEqual(payload['exp'] - payload['iat'], 7 * 24 * 3600)
        with override_settings(JWT_SECRET='t' * 40):
            self.assertIsNone(verify_jwt(sign_jwt(user)[:-1] + 'x'))


class SerializerTests(TestCase):
    def test_camel_case_keys_and_js_style_dates(self):
        user = User.objects.create(email='a@b.de', name='Anna', password_hash='hash')
        data = to_dict(user)
        self.assertIn('subscriptionPlan', data)
        self.assertNotIn('passwordHash', data)
        moment = dt.datetime(2026, 1, 2, 3, 4, 5, 678901, tzinfo=dt.timezone.utc)
        self.assertEqual(iso(moment), '2026-01-02T03:04:05.678Z')
