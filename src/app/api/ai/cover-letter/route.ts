import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateProfessionalApplicationPackage } from '@/lib/services/openai';
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
    const { jobOfferId, jobTitle, companyName, jobDescription, jobRequirements, tone } = await req.json();
    const allowedTones = new Set(['compact', 'professional', 'enthusiastic', 'creative']);
    if (tone !== undefined && !allowedTones.has(String(tone))) {
      return NextResponse.json({ error: 'Ton de candidature invalide.' }, { status: 400 });
    }

    let finalJobTitle = String(jobTitle || '').trim().slice(0, 300);
    let finalCompany = String(companyName || '').trim().slice(0, 300);
    let finalDesc = String(jobDescription || '').trim().slice(0, 20_000);
    let finalReq = String(jobRequirements || '').trim().slice(0, 10_000);
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
      } else {
        return NextResponse.json({ error: 'Offre introuvable.' }, { status: 404 });
      }
    }
    if (!finalJobTitle || !finalCompany) {
      return NextResponse.json(
        { error: 'Le métier et l’entreprise sont obligatoires.' },
        { status: 400 }
      );
    }

    const userEducation = user.profile?.educations.map(e => e.degree).join(', ') || '';
    const userSkills = user.profile?.skills.map(s => s.name) || [];

    let userLanguages: string[] = [];
    if (user.profile?.languages) {
      try {
        const parsed = JSON.parse(user.profile.languages);
        if (Array.isArray(parsed)) {
          userLanguages = parsed.map((language) => String(language).trim()).filter(Boolean);
        }
      } catch {
        userLanguages = user.profile.languages
          .split(',')
          .map((language) => language.trim())
          .filter(Boolean);
      }
    }

    const applicationPackage = await generateProfessionalApplicationPackage({
      userName: user.name,
      userEmail: user.email,
      userPhone: user.profile?.phone || '',
      userAddress: user.profile?.address || '',
      userCity: `${user.profile?.postalCode || ''} ${user.profile?.city || ''}`.trim(),
      userEducation,
      userSkills,
      userBio: user.profile?.bio || '',
      userExperiences: user.profile?.experiences.map((experience) => {
        const details = [
          `${experience.jobTitle} bei ${experience.company}`,
          experience.description,
        ].filter(Boolean);
        return details.join(': ');
      }) || [],
      userLanguages,
      companyName: finalCompany,
      jobTitle: finalJobTitle,
      jobDescription: finalDesc,
      jobRequirements: finalReq,
      jobLocation: finalLocation,
      tone: tone || 'compact',
    }, { requireOpenAI: true, userId: user.id });

    return NextResponse.json({
      success: true,
      subject: applicationPackage.subject,
      emailBody: applicationPackage.emailBody,
      coverLetter: applicationPackage.motivationLetter,
      jobTitle: finalJobTitle,
      companyName: finalCompany,
    });
  } catch (err: any) {
    if (err instanceof SubscriptionLimitError) {
      return NextResponse.json(
        { error: err.message, upgradeRequired: true },
        { status: 402 }
      );
    }
    return NextResponse.json({ error: err.message || 'Anschreiben konnte nicht generiert werden.' }, { status: 500 });
  }
}
