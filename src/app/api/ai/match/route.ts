import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { analyzeJobMatch } from '@/lib/services/openai';
import { checkRateLimit } from '@/lib/rate-limit';
import { SubscriptionLimitError } from '@/lib/subscriptions';

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const rateLimit = await checkRateLimit(`ai:${user.id}`, 20, 60 * 60_000);
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

    let jobText = typeof customJobDescription === 'string'
      ? customJobDescription.trim().slice(0, 20_000)
      : '';

    if (jobOfferId) {
      const job = await db.jobOffer.findFirst({
        where: { OR: [{ id: jobOfferId }, { externalId: jobOfferId }] },
      });
      if (job) {
        jobText = `${job.title}\nUnternehmen: ${job.company}\nKategorie: ${job.category}\nBeschreibung: ${job.description}\nAnforderungen: ${job.requirements}`;
      } else {
        return NextResponse.json({ error: 'Offre introuvable.' }, { status: 404 });
      }
    }
    if (jobText.length < 20) {
      return NextResponse.json(
        { error: 'Ajoutez une description d’offre suffisamment détaillée.' },
        { status: 400 }
      );
    }

    const educationsText = user.profile?.educations.map(e => `${e.degree} an ${e.institution}`).join('; ') || 'Schulabschluss';
    const experiencesText = user.profile?.experiences.map(e => `${e.jobTitle} bei ${e.company}`).join('; ') || 'Praktika';
    const skillsText = user.profile?.skills.map(s => `${s.name} (${s.level || 'Intermediate'})`).join(', ') || 'Grundkenntnisse';
    const parsedCV = user.profile?.cvParsedText || '';

    const userProfileText = `Bewerber Name: ${user.name}
Qualifikation/Schulbildung: ${educationsText}
Berufserfahrung/Praktika: ${experiencesText}
Fähigkeiten: ${skillsText}
Lebenslauf-Details: ${parsedCV}
Führerschein: ${user.profile?.drivingLicense || 'Keiner'}`;

    const analysis = await analyzeJobMatch(userProfileText, jobText, user.id);

    return NextResponse.json({ success: true, analysis });
  } catch (err: any) {
    if (err instanceof SubscriptionLimitError) {
      return NextResponse.json(
        { error: err.message, upgradeRequired: true },
        { status: 402 }
      );
    }
    return NextResponse.json({ error: err.message || 'AI Match Analyse fehlgeschlagen.' }, { status: 500 });
  }
}
