import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { syncMailboxForUser } from '@/lib/services/email-inbox';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const rateLimit = await checkRateLimit(`mailbox-sync:${user.id}`, 10, 15 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Trop de synchronisations. Réessayez plus tard.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      }
    );
  }
  const result = await syncMailboxForUser(user.id);
  return NextResponse.json(result, { status: result.success ? 200 : result.skipped ? 422 : 502 });
}
