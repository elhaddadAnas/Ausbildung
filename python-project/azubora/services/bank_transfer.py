"""Manual bank-transfer payments for paid plans and credit packs."""
import datetime as dt
import os
import re
import secrets

from azubora.models import BankTransferPayment
from azubora.services.subscriptions import (
    CREDIT_PACKS,
    SUBSCRIPTION_PLANS,
    is_credit_pack,
    is_subscription_plan,
)
from azubora.views.serializers import iso, to_dict

OPEN_STATUSES = ('PENDING', 'SUBMITTED')


def is_paid_subscription_plan(value) -> bool:
    return is_subscription_plan(value) and value != 'BASIC'


def _compact(name: str) -> str:
    return re.sub(r'\s+', '', os.environ.get(name, '')).upper()


def get_bank_transfer_details() -> dict:
    return {
        'accountHolder': os.environ.get('BANK_ACCOUNT_HOLDER', '').strip(),
        'bankName': os.environ.get('BANK_NAME', '').strip(),
        'rib': _compact('BANK_RIB'),
        'iban': _compact('BANK_IBAN'),
        'bic': _compact('BANK_BIC'),
        'instructions': os.environ.get('BANK_TRANSFER_INSTRUCTIONS', '').strip(),
    }


def bank_transfer_configured() -> bool:
    details = get_bank_transfer_details()
    return bool(details['accountHolder'] and (details['rib'] or details['iban']))


def payment_amount_cents(plan: str) -> int:
    return round(SUBSCRIPTION_PLANS[plan]['monthlyPriceEur'] * 100)


def credit_pack_amount_cents(pack: str) -> int:
    return round(CREDIT_PACKS[pack]['priceEur'] * 100)


def is_credit_topup_payment(payment: BankTransferPayment) -> bool:
    return (
        payment.kind == 'CREDIT_TOPUP'
        and is_credit_pack(payment.plan)
        and payment.credit_amount == CREDIT_PACKS[payment.plan]['credits']
    )


def add_one_month(date: dt.datetime) -> dt.datetime:
    """Same day next month; overflowing days roll forward like JavaScript Dates."""
    year, month = (date.year + 1, 1) if date.month == 12 else (date.year, date.month + 1)
    first = date.replace(year=year, month=month, day=1)
    return first + dt.timedelta(days=date.day - 1)


def generate_unique_transfer_reference(product_code: str) -> str:
    for _ in range(10):
        reference = f'AF-{product_code}-{secrets.token_hex(5).upper()}'
        if not BankTransferPayment.objects.filter(reference=reference).exists():
            return reference
    raise RuntimeError('Impossible de générer une référence de paiement unique.')


def serialize_payment(payment: BankTransferPayment, **relations) -> dict:
    data = to_dict(payment, **relations)
    data['amountEur'] = payment.amount_cents / 100
    for key in ('createdAt', 'expiresAt', 'submittedAt', 'paidAt', 'reviewedAt'):
        data[key] = iso(data[key])
    return data
