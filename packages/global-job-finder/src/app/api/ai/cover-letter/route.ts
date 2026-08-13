import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateCoverLetter } from '@/lib/services/openai';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const rateLimit = checkRateLimit(`ai:${user.id}`, 20, 60 * 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'AI-Limit erreicht. Bitte versuchen Sie es später erneut.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  try {
    const { jobOfferId, jobTitle, companyName, jobDescription, jobRequirements, tone } = await req.json();

    let finalJobTitle = jobTitle || 'emploi';
    let finalCompany = companyName || 'entreprise';
    let finalDesc = jobDescription || '';
    let finalReq = jobRequirements || '';
    let finalLocation = '';

    // If jobOfferId is passed, load exact job offer from database
    if (jobOfferId) {
      const dbOffer = await db.jobOffer.findFirst({
        where: { OR: [{ id: jobOfferId }, { externalId: jobOfferId }] },
      });
      if (dbOffer) {
        finalJobTitle = dbOffer.title;
        finalCompany = dbOffer.company;
        finalDesc = dbOffer.description;
        finalReq = dbOffer.requirements || '';
        finalLocation = dbOffer.location;
      }
    }

    const userEducation = user.profile?.educations.map(e => e.degree).join(', ') || 'Abitur / Realschulabschluss';
    const userSkills = user.profile?.skills.map(s => s.name) || ['Teamfähigkeit', 'Lernbereitschaft', 'MS Office'];

    const coverLetter = await generateCoverLetter({
      userName: user.name,
      userEmail: user.email,
      userPhone: user.profile?.phone || '',
      userAddress: user.profile?.address || '',
      userCity: `${user.profile?.postalCode || ''} ${user.profile?.city || ''}`.trim(),
      userEducation,
      userSkills,
      companyName: finalCompany,
      jobTitle: finalJobTitle,
      jobDescription: finalDesc,
      jobRequirements: finalReq,
      jobLocation: finalLocation,
      tone: tone || 'compact',
    });

    return NextResponse.json({
      success: true,
      coverLetter,
      jobTitle: finalJobTitle,
      companyName: finalCompany,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Anschreiben konnte nicht generiert werden.' }, { status: 500 });
  }
}
