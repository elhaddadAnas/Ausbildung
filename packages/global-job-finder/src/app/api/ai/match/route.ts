import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { analyzeJobMatch } from '@/lib/services/openai';
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
    const { jobOfferId, customJobDescription } = await req.json();

    let jobText = customJobDescription || '';

    if (jobOfferId) {
      const job = await db.jobOffer.findFirst({
        where: { OR: [{ id: jobOfferId }, { externalId: jobOfferId }] },
      });
      if (job) {
        jobText = `${job.title}\nUnternehmen: ${job.company}\nKategorie: ${job.category}\nBeschreibung: ${job.description}\nAnforderungen: ${job.requirements}`;
      }
    }

    const educationsText = user.profile?.educations.map(e => `${e.degree} at ${e.institution}`).join('; ') || 'Education available in CV';
    const experiencesText = user.profile?.experiences.map(e => `${e.jobTitle} at ${e.company}`).join('; ') || 'No experience provided';
    const skillsText = user.profile?.skills.map(s => `${s.name} (${s.level || 'Intermediate'})`).join(', ') || 'No skills provided';
    const parsedCV = user.profile?.cvParsedText || '';

    const userProfileText = `Candidate: ${user.name}
Education: ${educationsText}
Experience: ${experiencesText}
Skills: ${skillsText}
CV details: ${parsedCV}
Driving licence: ${user.profile?.drivingLicense || 'Not provided'}`;

    const analysis = await analyzeJobMatch(userProfileText, jobText);

    return NextResponse.json({ success: true, analysis });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AI Match Analyse fehlgeschlagen.' }, { status: 500 });
  }
}
