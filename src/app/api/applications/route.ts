import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { BAJobItem } from '@/lib/services/arbeitsagentur';
import { deliverApplication } from '@/lib/services/application-mailer';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const APPLICATION_STATUSES = new Set([
  'SAVED',
  'APPLIED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
]);

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const applications = await db.jobApplication.findMany({
    where: { userId: user.id },
    include: {
      jobOffer: true,
      notes: { orderBy: { createdAt: 'desc' } },
      messages: {
        where: { direction: 'INBOUND' },
        orderBy: { sentAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({
    applications: applications.map(({ messages, ...application }) => ({
      ...application,
      latestReply: messages[0] || null,
    })),
  });
}

function toJobItem(jobData: any, fallback: any, requestedId: string): BAJobItem {
  const externalId = String(
    jobData?.externalId || jobData?.id || fallback?.externalId || requestedId
  );
  return {
    id: externalId,
    externalId,
    title: jobData?.title || fallback?.title || 'Ausbildungsstelle',
    beruf: jobData?.beruf || jobData?.title || fallback?.title,
    company: jobData?.company || fallback?.company || 'Unternehmen',
    contactEmail: jobData?.contactEmail || fallback?.contactEmail || null,
    contactEmailVerified: Boolean(jobData?.contactEmail || fallback?.contactEmail),
    location: jobData?.location || fallback?.location || 'Deutschland',
    postalCode: jobData?.postalCode || fallback?.postalCode || '',
    federalState: jobData?.federalState || fallback?.federalState || '',
    category: jobData?.category || fallback?.category || 'Berufsausbildung',
    contractType: jobData?.contractType || fallback?.contractType || 'Berufsausbildung',
    workTime: jobData?.workTime || fallback?.workTime || 'Vollzeit',
    remote: Boolean(jobData?.remote ?? fallback?.remote),
    salary: jobData?.salary || fallback?.salary || '',
    description: jobData?.description || fallback?.description || 'Stellenbeschreibung',
    requirements: jobData?.requirements || fallback?.requirements || '',
    url: jobData?.url || fallback?.url || '',
    publishedAt: jobData?.publishedAt || fallback?.publishedAt?.toISOString?.() || new Date().toISOString(),
    searchKeyword: jobData?.searchKeyword || fallback?.searchKeyword || '',
  };
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  try {
    const { jobOfferId, jobData, action } = await req.json();
    if (!jobOfferId) {
      return NextResponse.json({ error: 'L’identifiant de l’offre est obligatoire.' }, { status: 400 });
    }

    const storedOffer = await db.jobOffer.findFirst({
      where: {
        OR: [{ id: String(jobOfferId) }, { externalId: String(jobOfferId) }],
      },
    });
    if (!jobData && !storedOffer) {
      return NextResponse.json({ error: 'Stellenangebot konnte nicht gefunden werden.' }, { status: 404 });
    }
    const job = toJobItem(jobData, storedOffer, String(jobOfferId));
    if (!/^BA-[A-Za-z0-9-]{3,100}$/.test(job.externalId)) {
      return NextResponse.json(
        { error: 'Seules les offres officielles Arbeitsagentur peuvent être enregistrées ou utilisées.' },
        { status: 400 }
      );
    }

    if (action !== 'apply') {
      const offer = await db.jobOffer.upsert({
        where: { externalId: job.externalId },
        update: { contactEmail: job.contactEmail },
        create: {
          externalId: job.externalId,
          title: job.title,
          company: job.company,
          location: job.location,
          postalCode: job.postalCode,
          federalState: job.federalState,
          category: job.category,
          contractType: job.contractType,
          workTime: job.workTime,
          remote: job.remote,
          salary: job.salary,
          description: job.description,
          requirements: job.requirements,
          url: job.url,
          contactEmail: job.contactEmail,
        },
      });
      const application = await db.jobApplication.upsert({
        where: {
          userId_jobOfferId: { userId: user.id, jobOfferId: offer.id },
        },
        update: {},
        create: {
          userId: user.id,
          jobOfferId: offer.id,
          status: 'SAVED',
          notesText: 'Offre enregistrée.',
        },
      });
      return NextResponse.json({ success: true, application });
    }

    const rateLimit = await checkRateLimit(`application-send:${user.id}`, 10, 60 * 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Limite d’envoi atteinte. Réessayez plus tard.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        }
      );
    }
    const result = await deliverApplication(
      user.id,
      job
    );
    if (!result.success) {
      return NextResponse.json(
        { ...result, error: result.error || 'La candidature n’a pas pu être envoyée.' },
        { status: result.upgradeRequired ? 402 : result.skipped ? 422 : 502 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bewerbung konnte nicht angelegt werden.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  try {
    const { id, status, notesText, interviewDate, coverLetter } = await req.json();
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'ID de candidature invalide.' }, { status: 400 });
    }
    if (status !== undefined && !APPLICATION_STATUSES.has(String(status))) {
      return NextResponse.json({ error: 'Statut de candidature invalide.' }, { status: 400 });
    }
    if (notesText !== undefined && String(notesText).length > 10_000) {
      return NextResponse.json({ error: 'Les notes sont trop longues.' }, { status: 400 });
    }
    if (coverLetter !== undefined && String(coverLetter).length > 20_000) {
      return NextResponse.json({ error: 'Le texte de candidature est trop long.' }, { status: 400 });
    }
    let parsedInterviewDate: Date | null | undefined;
    if (interviewDate !== undefined) {
      parsedInterviewDate = interviewDate ? new Date(interviewDate) : null;
      if (parsedInterviewDate && Number.isNaN(parsedInterviewDate.getTime())) {
        return NextResponse.json({ error: 'Date d’entretien invalide.' }, { status: 400 });
      }
    }
    const owned = await db.jobApplication.findFirst({ where: { id, userId: user.id } });
    if (!owned) return NextResponse.json({ error: 'Candidature introuvable.' }, { status: 404 });

    const data: any = {};
    if (status) data.status = String(status);
    if (notesText !== undefined) data.notesText = String(notesText).trim() || null;
    if (parsedInterviewDate !== undefined) data.interviewDate = parsedInterviewDate;
    if (coverLetter !== undefined) data.coverLetter = String(coverLetter).trim() || null;
    if (status === 'APPLIED' && !owned.appliedAt) data.appliedAt = new Date();

    const application = await db.jobApplication.update({
      where: { id: owned.id },
      data,
      include: { jobOffer: true },
    });
    return NextResponse.json({ success: true, application });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Aktualisierung fehlgeschlagen.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID fehlt.' }, { status: 400 });
  const deleted = await db.jobApplication.deleteMany({ where: { id, userId: user.id } });
  if (!deleted.count) return NextResponse.json({ error: 'Candidature introuvable.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
