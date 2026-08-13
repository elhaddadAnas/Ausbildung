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

  const { jobOfferId, jobData } = await req.json();
  if (!jobOfferId) return NextResponse.json({ error: 'Job Offer ID erforderlich.' }, { status: 400 });
  const requestedId = String(jobData?.externalId || jobData?.id || jobOfferId);
  if (!/^BA-[A-Za-z0-9-]{3,100}$/.test(requestedId)) {
    return NextResponse.json(
      { error: 'Seules les offres officielles Arbeitsagentur peuvent être ajoutées.' },
      { status: 400 }
    );
  }

  let offer = await db.jobOffer.findFirst({
    where: { OR: [{ id: String(jobOfferId) }, { externalId: requestedId }] },
  });
  if (!offer) {
    if (!jobData) {
      return NextResponse.json({ error: 'Détails de l’offre manquants.' }, { status: 400 });
    }
    offer = await db.jobOffer.create({
      data: {
        externalId: requestedId,
        title: String(jobData.title || 'Ausbildungsstelle').trim().slice(0, 300),
        company: String(jobData.company || 'Unternehmen').trim().slice(0, 300),
        location: String(jobData.location || 'Deutschland').trim().slice(0, 200),
        postalCode: String(jobData.postalCode || '').trim().slice(0, 20) || null,
        federalState: String(jobData.federalState || '').trim().slice(0, 100) || null,
        category: String(jobData.category || '').trim().slice(0, 100) || null,
        contractType: String(jobData.contractType || '').trim().slice(0, 100) || null,
        workTime: String(jobData.workTime || '').trim().slice(0, 100) || null,
        remote: Boolean(jobData.remote),
        salary: String(jobData.salary || '').trim().slice(0, 100) || null,
        description: String(jobData.description || 'Ausbildungsangebot aus der Arbeitsagentur Suche.')
          .trim()
          .slice(0, 20_000),
        requirements: String(jobData.requirements || '').trim().slice(0, 10_000) || null,
        url: String(jobData.url || '').trim().slice(0, 2_000) || null,
      },
    });
  }

  const existing = await db.favoriteJob.findUnique({
    where: { userId_jobOfferId: { userId: user.id, jobOfferId: offer.id } },
  });

  if (existing) {
    await db.favoriteJob.delete({ where: { id: existing.id } });
    return NextResponse.json({ isFavorite: false });
  }
  await db.favoriteJob.create({
    data: { userId: user.id, jobOfferId: offer.id },
  });
  return NextResponse.json({ isFavorite: true });
}
