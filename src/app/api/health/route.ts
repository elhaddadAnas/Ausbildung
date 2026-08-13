import { NextResponse } from 'next/server';
import { db, initializeDatabase } from '@/lib/db';
import { OPENAI_CONFIGURED } from '@/lib/services/openai';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await initializeDatabase();
    await db.$queryRawUnsafe('SELECT 1');
    return NextResponse.json(
      {
        status: 'ok',
        database: 'ok',
        openaiConfigured: OPENAI_CONFIGURED,
        redisConfigured: Boolean(process.env.REDIS_URL?.trim()),
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      {
        status: 'unavailable',
        database: 'error',
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
