import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import {
  CREDIT_PACKS,
  getSubscriptionSnapshot,
  SUBSCRIPTION_PLANS,
} from '@/lib/subscriptions';
import { bankTransferConfigured } from '@/lib/bank-transfer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

  const subscription = await getSubscriptionSnapshot(user.id);
  return NextResponse.json({
    subscription,
    plans: Object.values(SUBSCRIPTION_PLANS),
    creditPacks: Object.values(CREDIT_PACKS),
    billingMode: bankTransferConfigured() ? 'bank_transfer' : 'not_configured',
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }
  return NextResponse.json(
    {
      error:
        'Utilisez le paiement par virement pour changer de formule.',
    },
    { status: 410 }
  );
}
