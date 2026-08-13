import { NextRequest, NextResponse } from 'next/server';
import { fetchArbeitsagenturOffers } from '@/lib/services/arbeitsagentur';
import { runAutoSearchJob } from '@/lib/services/queue';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const rateLimit = await checkRateLimit(`search:${user.id}`, 60, 15 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Zu viele Suchanfragen. Bitte versuchen Sie es später erneut.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  const { searchParams } = new URL(req.url);
  const was = searchParams.get('was') || '';
  const wo = searchParams.get('wo') || '';
  const bundesland = searchParams.get('bundesland') || '';
  const category = searchParams.get('category') || '';
  const contractType = searchParams.get('contractType') || '';
  const remote = searchParams.get('remote') === 'true';
  const requestedRadius = Number(searchParams.get('umkreis'));
  const umkreis = [10, 20, 50, 100, 200].includes(requestedRadius)
    ? requestedRadius
    : undefined;
  const page = Math.min(40, Math.max(1, Number(searchParams.get('page')) || 1));

  try {
    const { jobs, total, source } = await fetchArbeitsagenturOffers({
      was,
      wo,
      bundesland,
      category,
      contractType,
      remote,
      umkreis,
      page,
      limit: 25,
    });
    if (source !== 'live_api') {
      return NextResponse.json(
        {
          error: 'La source officielle Arbeitsagentur est temporairement indisponible.',
          jobs: [],
          total: 0,
          source,
        },
        { status: 503 }
      );
    }

    // Check user favorites & applications
    const [favorites, apps] = await Promise.all([
      db.favoriteJob.findMany({
        where: { userId: user.id },
        include: { jobOffer: { select: { externalId: true } } },
      }),
      db.jobApplication.findMany({
        where: { userId: user.id },
        include: { jobOffer: { select: { externalId: true } } },
      }),
    ]);
    const favoriteIds = new Set(favorites.map((favorite) => favorite.jobOffer.externalId));
    const applicationJobIds = new Set(apps.map((application) => application.jobOffer.externalId));

    const enrichedJobs = jobs.map(j => ({
      ...j,
      isFavorite: favoriteIds.has(j.externalId),
      hasApplied: applicationJobIds.has(j.externalId),
    }));

    return NextResponse.json({
      jobs: enrichedJobs,
      total: Math.min(total, 40 * 25),
      source,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Suchanfrage fehlgeschlagen.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const rateLimit = await checkRateLimit(`manual-search:${user.id}`, 2, 15 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Une recherche approfondie est déjà récente. Réessayez plus tard.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      }
    );
  }
  const result = await runAutoSearchJob(user.id);
  return NextResponse.json(result, {
    status: result.success ? 200 : result.skipped ? 409 : 503,
  });
}
