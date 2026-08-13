import fs from 'fs/promises';
import path from 'path';
import { db } from '@/lib/db';
import {
  GlobalJobItem,
  enrichGlobalJob,
} from '@/lib/services/job-providers';
import { analyzeJobMatch, generateCoverLetter } from '@/lib/services/openai';
import {
  decryptString,
  isValidEmail,
  sendEmailNotification,
} from '@/lib/services/smtp';
import { resolveStoredCVPath } from '@/lib/private-files';

export interface ApplicationDeliveryResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  recipientEmail?: string;
  applicationId?: string;
  matchScore?: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function asDate(value?: string): Date {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function getCVAttachment(profile: {
  cvFileUrl: string | null;
  cvFileName: string | null;
}, userName: string) {
  const absolutePath = resolveStoredCVPath(profile.cvFileUrl);
  if (!absolutePath) return [];

  try {
    const file = await fs.stat(absolutePath);
    if (!file.isFile() || file.size === 0) return [];
    const extension = path.extname(profile.cvFileName || absolutePath).toLowerCase() || '.pdf';
    const safeApplicantName = userName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Candidate';
    const contentTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return [{
      filename: `CV_${safeApplicantName}${extension}`,
      path: absolutePath,
      contentType: contentTypes[extension],
    }];
  } catch {
    return [];
  }
}

function buildSimpleApplicationEmail(coverLetter: string): string {
  const textWithLineBreaks = escapeHtml(coverLetter).replace(/\r?\n/g, '<br>');

  return `<!doctype html>
<html lang="en">
  <body>
    ${textWithLineBreaks}
  </body>
</html>`;
}

export async function deliverApplication(
  userId: string,
  rawJob: GlobalJobItem,
  options: { automated?: boolean; minMatchScore?: number } = {}
): Promise<ApplicationDeliveryResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      smtpConfig: true,
      profile: {
        include: {
          educations: true,
          experiences: true,
          skills: true,
        },
      },
    },
  });

  if (!user) return { success: false, error: 'Utilisateur introuvable.' };
  if (!user.profile) return { success: false, error: 'Complétez votre profil avant de postuler.' };
  if (!user.smtpConfig?.active) {
    return { success: false, error: 'Activez et configurez SMTP avant de postuler.' };
  }
  if (options.automated && !user.smtpConfig.isTested) {
    return { success: false, error: 'Testez la connexion SMTP avant d’activer l’auto-candidature.' };
  }
  const attachments = await getCVAttachment(user.profile, user.name);
  if (!attachments.length) {
    return {
      success: false,
      skipped: true,
      error: 'Ajoutez de nouveau votre CV dans le profil : aucun fichier de CV lisible ne peut être joint.',
    };
  }

  const job = await enrichGlobalJob(rawJob);
  if (!isValidEmail(job.contactEmail)) {
    return {
      success: false,
      skipped: true,
      error: 'Cette offre ne publie aucune adresse e-mail de candidature vérifiable.',
    };
  }

  const existingOffer = await db.jobOffer.findUnique({
    where: { externalId: job.externalId },
  });
  const existingApplication = existingOffer
    ? await db.jobApplication.findUnique({
        where: { userId_jobOfferId: { userId, jobOfferId: existingOffer.id } },
      })
    : null;

  if (existingApplication?.status === 'APPLIED') {
    return {
      success: false,
      skipped: true,
      error: 'Une candidature a déjà été envoyée pour cette offre.',
      recipientEmail: job.contactEmail,
      applicationId: existingApplication.id,
      matchScore: existingApplication.matchScore || undefined,
    };
  }

  const education = user.profile.educations
    .map((item) => [item.degree, item.fieldOfStudy].filter(Boolean).join(' – '))
    .join(', ') || 'Education details available in the CV';
  const skills = user.profile.skills.map((item) => item.name);
  const profileText = [
    `Candidate: ${user.name}`,
    `Education: ${education}`,
    `Skills: ${skills.join(', ')}`,
    `Experience: ${user.profile.experiences.map((item) => `${item.jobTitle} at ${item.company}`).join(', ')}`,
    `Languages: ${user.profile.languages || ''}`,
    `Location: ${user.profile.postalCode || ''} ${user.profile.city || ''}`,
  ].join('. ');
  const jobText = `${job.title}. ${job.company}. ${job.description}. ${job.requirements}`;
  const match = await analyzeJobMatch(profileText, jobText);

  if (options.automated && match.matchScore < (options.minMatchScore || 0)) {
    return {
      success: false,
      skipped: true,
      error: `Match de ${match.matchScore} %, inférieur au minimum configuré.`,
      matchScore: match.matchScore,
    };
  }

  const coverLetter = await generateCoverLetter({
    userName: user.name,
    userEmail: user.email,
    userPhone: user.profile.phone || '',
    userAddress: user.profile.address || '',
    userCity: `${user.profile.postalCode || ''} ${user.profile.city || ''}`.trim(),
    userEducation: education,
    userSkills: skills.length ? skills : ['Teamwork', 'Communication'],
    companyName: job.company,
    jobTitle: job.title,
    jobDescription: job.description,
    jobRequirements: job.requirements,
    jobLocation: job.location,
    tone: 'compact',
  });

  const offer = await db.jobOffer.upsert({
    where: { externalId: job.externalId },
    update: {
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
      active: true,
    },
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
      publishedAt: asDate(job.publishedAt),
      searchKeyword: job.searchKeyword,
    },
  });

  const smtp = user.smtpConfig;
  const subject = `Application – ${job.title} – ${user.name}`;
  const delivery = await sendEmailNotification(
    {
      provider: smtp.provider,
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      authUser: smtp.authUser,
      authPass: decryptString(smtp.authPassEncrypted),
      fromEmail: smtp.fromEmail || smtp.authUser,
      fromName: smtp.fromName || user.name,
    },
    job.contactEmail,
    subject,
    buildSimpleApplicationEmail(coverLetter),
    attachments,
    coverLetter
  );

  const notes = delivery.success
    ? `${options.automated ? 'Auto-candidature' : 'Candidature'} envoyée par SMTP à ${job.contactEmail} avec le CV en pièce jointe.`
    : `Échec SMTP vers ${job.contactEmail}: ${delivery.error || 'Erreur inconnue'}`;

  const application = existingApplication
    ? await db.jobApplication.update({
        where: { id: existingApplication.id },
        data: {
          status: delivery.success ? 'APPLIED' : 'SAVED',
          appliedAt: delivery.success ? new Date() : existingApplication.appliedAt,
          matchScore: match.matchScore,
          coverLetter,
          missingSkills: JSON.stringify(match.missingSkills),
          cvTips: JSON.stringify(match.cvSuggestions),
          notesText: notes,
        },
      })
    : await db.jobApplication.create({
        data: {
          userId,
          jobOfferId: offer.id,
          status: delivery.success ? 'APPLIED' : 'SAVED',
          appliedAt: delivery.success ? new Date() : null,
          matchScore: match.matchScore,
          coverLetter,
          missingSkills: JSON.stringify(match.missingSkills),
          cvTips: JSON.stringify(match.cvSuggestions),
          notesText: notes,
        },
      });

  if (delivery.success) {
    await db.applicationMessage.create({
      data: {
        applicationId: application.id,
        userId,
        direction: 'OUTBOUND',
        messageId: delivery.messageId || null,
        fromEmail: smtp.fromEmail || smtp.authUser,
        toEmail: job.contactEmail,
        subject,
        bodyText: coverLetter,
        sentAt: new Date(),
        readAt: new Date(),
      },
    });
  }

  return {
    success: delivery.success,
    error: delivery.error,
    recipientEmail: job.contactEmail,
    applicationId: application.id,
    matchScore: match.matchScore,
  };
}
