import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { syncMailboxForUser } from '@/lib/services/email-inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const result = await syncMailboxForUser(user.id);
  return NextResponse.json(result, { status: result.success ? 200 : result.skipped ? 422 : 502 });
}
