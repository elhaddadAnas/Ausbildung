import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { getSubscriptionSnapshot } from '@/lib/subscriptions';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 });
    }

    const subscription = await getSubscriptionSnapshot(user.id);
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        profile: user.profile,
        smtpConfigured: Boolean(user.smtpConfig),
        smtpActive: Boolean(user.smtpConfig?.active),
        smtpTested: Boolean(user.smtpConfig?.isTested),
        notificationConfig: user.notificationConfig,
        subscription,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Fehler beim Abrufen der Benutzerdaten.' }, { status: 500 });
  }
}
