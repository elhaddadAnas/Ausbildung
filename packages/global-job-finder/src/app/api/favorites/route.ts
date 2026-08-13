import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const favorites = await db.favoriteJob.findMany({
    where: { userId: user.id },
    include: { jobOffer: true },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ favorites });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const { jobOfferId } = await req.json();
  if (!jobOfferId) return NextResponse.json({ error: 'Job Offer ID erforderlich.' }, { status: 400 });

  let offer = await db.jobOffer.findFirst({
    where: { OR: [{ id: String(jobOfferId) }, { externalId: String(jobOfferId) }] },
  });
  if (!offer) {
    offer = await db.jobOffer.create({
      data: {
        externalId: String(jobOfferId),
        title: 'poste',
        company: 'Employer',
        location: 'Worldwide',
        description: 'emploisangebot aus der global job sources Suche.',
      },
    });
  }

  const existing = await db.favoriteJob.findUnique({
    where: { userId_jobOfferId: { userId: user.id, jobOfferId: offer.id } },
  });

  if (existing) {
    await db.favoriteJob.delete({ where: { id: existing.id } });
    return NextResponse.json({ isFavorite: false });
  } else {
    await db.favoriteJob.create({
      data: { userId: user.id, jobOfferId: offer.id },
    });
    return NextResponse.json({ isFavorite: true });
  }
}
