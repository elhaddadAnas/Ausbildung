import { NextRequest, NextResponse } from 'next/server';
import { fetchGlobalJobs } from '@/lib/services/job-providers';
import { runAutoSearchJob } from '@/lib/services/queue';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const rateLimit = checkRateLimit(`search:${user.id}`, 60, 15 * 60_000);
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
  const query = searchParams.get('query') || searchParams.get('was') || '';
  const location = searchParams.get('location') || searchParams.get('wo') || '';
  const country = searchParams.get('country') || '';
  const category = searchParams.get('category') || '';
  const contractType = searchParams.get('contractType') || '';
  const remote = searchParams.get('remote') === 'true';
  const internationalApplicants = searchParams.get('internationalApplicants') === 'true';
  const applicantCountry = searchParams.get('applicantCountry') || 'Morocco';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  try {
    const { jobs, total, source, providers } = await fetchGlobalJobs({
      query,
      location,
      country,
      category,
      contractType,
      remote,
      internationalApplicants,
      applicantCountry,
      page,
    });

    // Check user favorites & applications
    let favoriteIds: string[] = [];
    let applicationJobIds: string[] = [];

    const favorites = await db.favoriteJob.findMany({
      where: { userId: user.id },
      include: { jobOffer: { select: { externalId: true } } },
    });
    favoriteIds = favorites.map(f => f.jobOffer.externalId);

    const apps = await db.jobApplication.findMany({
      where: { userId: user.id },
      include: { jobOffer: { select: { externalId: true } } },
    });
    applicationJobIds = apps.map(a => a.jobOffer.externalId);

    const enrichedJobs = jobs.map(j => ({
      ...j,
      isFavorite: favoriteIds.includes(j.id),
      hasApplied: applicationJobIds.includes(j.id),
    }));

    return NextResponse.json({
      jobs: enrichedJobs,
      total,
      source,
      providers,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'La recherche mondiale a échoué.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const result = await runAutoSearchJob(user.id);
  return NextResponse.json(result);
}
