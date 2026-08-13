import { NextRequest, NextResponse } from 'next/server';
import { runDueAutoApplyJobs } from '@/lib/services/auto-apply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runDueAutoApplyJobs();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Auto-apply cron error:', error);
    return NextResponse.json(
      { success: false, error: 'Auto-apply scheduler failed.' },
      { status: 500 }
    );
  }
}
