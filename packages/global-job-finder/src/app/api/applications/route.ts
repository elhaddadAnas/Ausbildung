import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { GlobalJobItem } from '@/lib/services/job-providers';
import { deliverApplication } from '@/lib/services/application-mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const applications = await db.jobApplication.findMany({
    where: { userId: user.id },
    include: {
      jobOffer: true,
      notes: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({ applications });
}

function toJobItem(jobData: any, fallback: any, requestedId: string): GlobalJobItem {
  const externalId = String(
    jobData?.externalId || jobData?.id || fallback?.externalId || requestedId
  );
  return {
    id: externalId,
    externalId,
    title: jobData?.title || fallback?.title || 'Open position',
    company: jobData?.company || fallback?.company || 'Company',
    contactEmail: jobData?.contactEmail || fallback?.contactEmail || null,
    contactEmailVerified: Boolean(jobData?.contactEmail || fallback?.contactEmail),
    location: jobData?.location || fallback?.location || 'Worldwide',
    postalCode: jobData?.postalCode || fallback?.postalCode || '',
    country: jobData?.country || fallback?.country || '',
    category: jobData?.category || fallback?.category || 'Other',
    contractType: jobData?.contractType || fallback?.contractType || 'Employment',
    workTime: jobData?.workTime || fallback?.workTime || 'Full-time',
    remote: Boolean(jobData?.remote ?? fallback?.remote),
    salary: jobData?.salary || fallback?.salary || '',
    description: jobData?.description || fallback?.description || 'Job description unavailable.',
    requirements: jobData?.requirements || fallback?.requirements || '',
    url: jobData?.url || fallback?.url || '',
    publishedAt: jobData?.publishedAt || fallback?.publishedAt?.toISOString?.() || new Date().toISOString(),
    acceptsInternationalApplicants: Boolean(jobData?.acceptsInternationalApplicants),
    internationalApplicantEvidence: jobData?.internationalApplicantEvidence || null,
    searchKeyword: jobData?.searchKeyword || fallback?.searchKeyword || '',
    provider: jobData?.provider || 'Custom',
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
      return NextResponse.json({ error: 'L’offre d’emploi est introuvable.' }, { status: 404 });
    }

    if (action !== 'apply') {
      const job = toJobItem(jobData, storedOffer, String(jobOfferId));
      const offer = await db.jobOffer.upsert({
        where: { externalId: job.externalId },
        update: { contactEmail: job.contactEmail },
        create: {
          externalId: job.externalId,
          title: job.title,
          company: job.company,
          location: job.location,
          postalCode: job.postalCode,
          country: job.country,
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

    const result = await deliverApplication(
      user.id,
      toJobItem(jobData, storedOffer, String(jobOfferId))
    );
    if (!result.success) {
      return NextResponse.json(
        { ...result, error: result.error || 'La candidature n’a pas pu être envoyée.' },
        { status: result.skipped ? 422 : 502 }
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
    const owned = await db.jobApplication.findFirst({ where: { id, userId: user.id } });
    if (!owned) return NextResponse.json({ error: 'Candidature introuvable.' }, { status: 404 });

    const data: any = {};
    if (status) data.status = status;
    if (notesText !== undefined) data.notesText = notesText;
    if (interviewDate !== undefined) data.interviewDate = interviewDate ? new Date(interviewDate) : null;
    if (coverLetter !== undefined) data.coverLetter = coverLetter;
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
