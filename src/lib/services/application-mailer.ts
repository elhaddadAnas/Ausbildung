import fs from 'fs/promises';
import path from 'path';
import { db } from '@/lib/db';
import {
  BAJobItem,
  enrichArbeitsagenturOffer,
} from '@/lib/services/arbeitsagentur';
import {
  analyzeJobMatch,
  generateApplicationMessage,
} from '@/lib/services/openai';
import {
  decryptString,
  isValidEmail,
  sendEmailNotification,
} from '@/lib/services/smtp';
import { stopAutoSendingForSMTPLimit } from '@/lib/services/smtp-circuit-breaker';
import { resolveStoredCVPath } from '@/lib/private-files';
import {
  releaseApplicationSlot,
  reserveApplicationSlot,
  SubscriptionLimitError,
} from '@/lib/subscriptions';

export interface ApplicationDeliveryResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  recipientEmail?: string;
  applicationId?: string;
  matchScore?: number;
  haltAutoSending?: boolean;
  smtpResponseCode?: number | null;
  smtpEnhancedCode?: string | null;
  upgradeRequired?: boolean;
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

function parseLanguages(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((language) => String(language).trim()).filter(Boolean);
    }
  } catch {
    // Support legacy comma-separated profile values.
  }
  return value.split(',').map((language) => language.trim()).filter(Boolean);
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
      .replace(/^_+|_+$/g, '') || 'Bewerber';
    const contentTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return [{
      filename: `Lebenslauf_${safeApplicantName}${extension}`,
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
<html lang="de">
  <body>
    ${textWithLineBreaks}
  </body>
</html>`;
}

async function deliverApplicationCore(
  userId: string,
  rawJob: BAJobItem,
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

  const job = await enrichArbeitsagenturOffer(rawJob);
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
  if (existingApplication?.deliveryStatus === 'PENDING') {
    return {
      success: false,
      skipped: true,
      error:
        'Un envoi précédent est encore en cours ou son résultat est incertain. Vérifiez vos messages avant de réessayer.',
      recipientEmail: job.contactEmail,
      applicationId: existingApplication.id,
      matchScore: existingApplication.matchScore || undefined,
    };
  }

  const education = user.profile.educations
    .map((item) => [item.degree, item.fieldOfStudy].filter(Boolean).join(' – '))
    .join(', ');
  const skills = user.profile.skills.map((item) => item.name);
  const profileText = [
    `Bewerber: ${user.name}`,
    `Ausbildung: ${education || 'Keine Angabe im Profil'}`,
    `Kenntnisse: ${skills.join(', ')}`,
    `Erfahrung: ${user.profile.experiences.map((item) => `${item.jobTitle} bei ${item.company}`).join(', ')}`,
    `Sprachen: ${user.profile.languages || ''}`,
    `Wohnort: ${user.profile.postalCode || ''} ${user.profile.city || ''}`,
  ].join('. ');
  const jobText = `${job.title}. ${job.company}. ${job.description}. ${job.requirements}`;
  const match = await analyzeJobMatch(profileText, jobText, userId);

  if (options.automated && match.matchScore < (options.minMatchScore || 0)) {
    return {
      success: false,
      skipped: true,
      error: `Match de ${match.matchScore} %, inférieur au minimum configuré.`,
      matchScore: match.matchScore,
    };
  }

  const coverLetter = await generateApplicationMessage({
    userName: user.name,
    userEmail: user.email,
    userPhone: user.profile.phone || '',
    userAddress: user.profile.address || '',
    userCity: `${user.profile.postalCode || ''} ${user.profile.city || ''}`.trim(),
    userEducation: education,
    userSkills: skills,
    userBio: user.profile.bio || '',
    userExperiences: user.profile.experiences.map((item) => {
      const details = [
        `${item.jobTitle} bei ${item.company}`,
        item.description,
      ].filter(Boolean);
      return details.join(': ');
    }),
    userLanguages: parseLanguages(user.profile.languages),
    companyName: job.company,
    jobTitle: job.title,
    jobDescription: job.description,
    jobRequirements: job.requirements,
    jobLocation: job.location,
    tone: 'compact',
  }, userId);

  const offer = await db.jobOffer.upsert({
    where: { externalId: job.externalId },
    update: {
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
      active: true,
    },
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
      publishedAt: asDate(job.publishedAt),
      searchKeyword: job.searchKeyword,
    },
  });
  const application = await db.jobApplication.upsert({
    where: {
      userId_jobOfferId: { userId, jobOfferId: offer.id },
    },
    update: {
      matchScore: match.matchScore,
      coverLetter,
      missingSkills: JSON.stringify(match.missingSkills),
      cvTips: JSON.stringify(match.cvSuggestions),
    },
    create: {
      userId,
      jobOfferId: offer.id,
      status: 'SAVED',
      matchScore: match.matchScore,
      coverLetter,
      missingSkills: JSON.stringify(match.missingSkills),
      cvTips: JSON.stringify(match.cvSuggestions),
    },
  });
  const acquiredDelivery = await db.jobApplication.updateMany({
    where: {
      id: application.id,
      status: { not: 'APPLIED' },
      OR: [
        { deliveryStatus: null },
        { deliveryStatus: 'FAILED' },
      ],
    },
    data: {
      deliveryStatus: 'PENDING',
      deliveryStartedAt: new Date(),
      deliveryError: null,
      notesText: `Envoi SMTP en cours vers ${job.contactEmail}.`,
    },
  });
  if (!acquiredDelivery.count) {
    return {
      success: false,
      skipped: true,
      error: 'Cette candidature est déjà envoyée ou un envoi est en cours.',
      recipientEmail: job.contactEmail,
      applicationId: application.id,
      matchScore: match.matchScore,
    };
  }

  const smtp = user.smtpConfig;
  const subject = `Bewerbung – ${job.title} – ${user.name}`;
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

  if (!delivery.success) {
    await stopAutoSendingForSMTPLimit(userId, delivery);
    await db.jobApplication.update({
      where: { id: application.id },
      data: {
        deliveryStatus: 'FAILED',
        deliveryStartedAt: null,
        deliveryError: delivery.error || 'Erreur SMTP inconnue',
        notesText: `Échec SMTP vers ${job.contactEmail}: ${delivery.error || 'Erreur inconnue'}`,
      },
    });
    return {
      success: false,
      error: delivery.error,
      recipientEmail: job.contactEmail,
      applicationId: application.id,
      matchScore: match.matchScore,
      haltAutoSending: delivery.haltAutoSending,
      smtpResponseCode: delivery.smtpResponseCode,
      smtpEnhancedCode: delivery.smtpEnhancedCode,
    };
  }

  const sentAt = new Date();
  await db.$transaction([
    db.jobApplication.update({
      where: { id: application.id },
      data: {
        status: 'APPLIED',
        appliedAt: sentAt,
        deliveryStatus: 'SENT',
        deliveryStartedAt: null,
        deliveryError: null,
        notesText: `${options.automated ? 'Auto-candidature' : 'Candidature'} envoyée par SMTP à ${job.contactEmail} avec le CV en pièce jointe.`,
      },
    }),
    db.applicationMessage.create({
      data: {
        applicationId: application.id,
        userId,
        direction: 'OUTBOUND',
        messageId: delivery.messageId || null,
        fromEmail: smtp.fromEmail || smtp.authUser,
        toEmail: job.contactEmail,
        subject,
        bodyText: coverLetter,
        sentAt,
        readAt: sentAt,
      },
    }),
  ]);

  return {
    success: true,
    recipientEmail: job.contactEmail,
    applicationId: application.id,
    matchScore: match.matchScore,
    haltAutoSending: delivery.haltAutoSending,
    smtpResponseCode: delivery.smtpResponseCode,
    smtpEnhancedCode: delivery.smtpEnhancedCode,
  };
}

export async function deliverApplication(
  userId: string,
  rawJob: BAJobItem,
  options: { automated?: boolean; minMatchScore?: number } = {}
): Promise<ApplicationDeliveryResult> {
  let quotaSlotReserved = false;
  try {
    quotaSlotReserved = await reserveApplicationSlot(userId);
  } catch (error) {
    if (error instanceof SubscriptionLimitError) {
      return {
        success: false,
        skipped: true,
        upgradeRequired: true,
        error: error.message,
      };
    }
    throw error;
  }

  let applicationSent = false;
  try {
    const result = await deliverApplicationCore(userId, rawJob, options);
    applicationSent = result.success;
    return result;
  } catch (error) {
    if (error instanceof SubscriptionLimitError) {
      return {
        success: false,
        skipped: true,
        upgradeRequired: true,
        error: error.message,
      };
    }
    throw error;
  } finally {
    if (!applicationSent && quotaSlotReserved) {
      try {
        await releaseApplicationSlot(userId);
      } catch (error) {
        console.warn('Reserved application quota could not be released:', error);
      }
    }
  }
}
