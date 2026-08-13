import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseCVWithAI } from '@/lib/services/openai';
import { SubscriptionLimitError } from '@/lib/subscriptions';
import { privateUploadsRoot, removeStoredCV } from '@/lib/private-files';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function cleanStr(value: unknown, maxLength = 20_000): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\u0000/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
    .slice(0, maxLength);
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const canvas = await import('@napi-rs/canvas');
  const globals = globalThis as Record<string, unknown>;
  globals.DOMMatrix ||= canvas.DOMMatrix;
  globals.ImageData ||= canvas.ImageData;
  globals.Path2D ||= canvas.Path2D;

  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

export async function POST(req: NextRequest) {
  let persistedFileUrl = '';
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const rateLimit = await checkRateLimit(`cv-upload:${user.id}`, 5, 60 * 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Trop d’importations de CV. Réessayez plus tard.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier sélectionné.' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Le CV doit faire entre 1 octet et 20 Mo.' }, { status: 400 });
    }

    const fileName = cleanStr(path.basename(file.name), 255);
    const extension = path.extname(fileName).toLowerCase();
    if (!['.pdf', '.docx'].includes(extension)) {
      return NextResponse.json(
        { error: 'Format non accepté. Utilisez PDF ou DOCX (convertissez les anciens fichiers DOC).' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const isPdf = extension === '.pdf' && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    const isDocx =
      extension === '.docx' &&
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b;
    if (!isPdf && !isDocx) {
      return NextResponse.json(
        { error: 'Le contenu du fichier ne correspond pas au format annoncé.' },
        { status: 400 }
      );
    }

    let parsedText: string;
    try {
      parsedText = isPdf
        ? await extractPdfText(buffer)
        : await extractDocxText(buffer);
    } catch (error) {
      console.warn('CV text extraction failed:', error);
      return NextResponse.json(
        { error: 'Le texte du CV ne peut pas être lu. Vérifiez le fichier ou exportez-le de nouveau.' },
        { status: 422 }
      );
    }
    parsedText = cleanStr(parsedText, 100_000);
    if (parsedText.length < 20) {
      return NextResponse.json(
        { error: 'Ce CV ne contient pas assez de texte lisible. Un PDF scanné nécessite une version avec OCR.' },
        { status: 422 }
      );
    }

    const parsedInfo = await parseCVWithAI(parsedText, user.id);
    const uploadsDir = privateUploadsRoot();
    await fs.mkdir(uploadsDir, { recursive: true });
    const safeName = `${user.id}-${crypto.randomUUID()}${extension}`;
    await fs.writeFile(path.join(uploadsDir, safeName), buffer, { flag: 'wx' });
    persistedFileUrl = `private:${safeName}`;

    const safeNameFromCV = cleanStr(parsedInfo.name, 100);
    const safeLanguages = JSON.stringify(
      Array.isArray(parsedInfo.languages)
        ? parsedInfo.languages.map((language) => cleanStr(language, 100)).filter(Boolean).slice(0, 20)
        : []
    );
    const finalProfile = await db.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId: user.id },
        update: {
          cvFileName: fileName,
          cvFileUrl: persistedFileUrl,
          cvParsedText: parsedText,
          phone: cleanStr(parsedInfo.phone, 50) || undefined,
          address: cleanStr(parsedInfo.address, 300) || undefined,
          city: cleanStr(parsedInfo.city, 100) || undefined,
          postalCode: cleanStr(parsedInfo.postalCode, 20) || undefined,
          federalState: cleanStr(parsedInfo.federalState, 100) || undefined,
          dateOfBirth: cleanStr(parsedInfo.dateOfBirth, 30) || undefined,
          placeOfBirth: cleanStr(parsedInfo.placeOfBirth, 100) || undefined,
          languages: safeLanguages,
          bio: cleanStr(parsedInfo.bio, 5_000) || undefined,
          drivingLicense: cleanStr(parsedInfo.drivingLicense, 100) || undefined,
          salaryExpectation: cleanStr(parsedInfo.salaryExpectation, 100) || undefined,
        },
        create: {
          userId: user.id,
          cvFileName: fileName,
          cvFileUrl: persistedFileUrl,
          cvParsedText: parsedText,
          phone: cleanStr(parsedInfo.phone, 50) || null,
          address: cleanStr(parsedInfo.address, 300) || null,
          city: cleanStr(parsedInfo.city, 100) || null,
          postalCode: cleanStr(parsedInfo.postalCode, 20) || null,
          federalState: cleanStr(parsedInfo.federalState, 100) || null,
          dateOfBirth: cleanStr(parsedInfo.dateOfBirth, 30) || null,
          placeOfBirth: cleanStr(parsedInfo.placeOfBirth, 100) || null,
          languages: safeLanguages,
          bio: cleanStr(parsedInfo.bio, 5_000) || null,
          drivingLicense: cleanStr(parsedInfo.drivingLicense, 100) || null,
          salaryExpectation: cleanStr(parsedInfo.salaryExpectation, 100) || null,
        },
      });

      if (safeNameFromCV.length >= 2) {
        await tx.user.update({
          where: { id: user.id },
          data: { name: safeNameFromCV },
        });
      }
      await Promise.all([
        tx.education.deleteMany({ where: { profileId: profile.id } }),
        tx.experience.deleteMany({ where: { profileId: profile.id } }),
        tx.skill.deleteMany({ where: { profileId: profile.id } }),
      ]);

      const educations = Array.isArray(parsedInfo.educations)
        ? parsedInfo.educations.slice(0, 30).map((education) => ({
            profileId: profile.id,
            degree: cleanStr(education.degree, 200) || 'Formation / Diplôme',
            fieldOfStudy: cleanStr(education.fieldOfStudy, 200) || null,
            institution: cleanStr(education.institution, 200) || 'Établissement non précisé',
            location: cleanStr(education.location, 200) || null,
            startDate: cleanStr(education.startDate, 30) || '',
            endDate: cleanStr(education.endDate, 30) || null,
            current: Boolean(education.current),
            description: cleanStr(education.description, 2_000) || null,
          }))
        : [];
      const experiences = Array.isArray(parsedInfo.experiences)
        ? parsedInfo.experiences.slice(0, 50).map((experience) => ({
            profileId: profile.id,
            jobTitle: cleanStr(experience.jobTitle, 200) || 'Poste occupé',
            company: cleanStr(experience.company, 200) || 'Entreprise / Organisation',
            location: cleanStr(experience.location, 200) || null,
            startDate: cleanStr(experience.startDate, 30) || '',
            endDate: cleanStr(experience.endDate, 30) || null,
            current: Boolean(experience.current),
            description: cleanStr(experience.description, 2_000) || null,
          }))
        : [];
      const skills = Array.isArray(parsedInfo.skills)
        ? parsedInfo.skills
            .filter((skill) => cleanStr(skill?.name, 120))
            .slice(0, 100)
            .map((skill) => ({
              profileId: profile.id,
              name: cleanStr(skill.name, 120),
              category: cleanStr(skill.category, 80) || 'Général',
              level: cleanStr(skill.level, 40) || 'Intermediate',
            }))
        : [];
      if (educations.length) await tx.education.createMany({ data: educations });
      if (experiences.length) await tx.experience.createMany({ data: experiences });
      if (skills.length) await tx.skill.createMany({ data: skills });

      return tx.userProfile.findUnique({
        where: { id: profile.id },
        include: {
          user: { select: { name: true, email: true, avatarUrl: true } },
          educations: true,
          experiences: true,
          skills: true,
        },
      });
    });

    if (user.profile?.cvFileUrl && user.profile.cvFileUrl !== persistedFileUrl) {
      await removeStoredCV(user.profile.cvFileUrl);
    }
    return NextResponse.json({
      success: true,
      message: `CV ${fileName} importé et analysé avec succès.`,
      fileName,
      parsedInfo,
      profile: finalProfile,
    });
  } catch (error) {
    if (persistedFileUrl) await removeStoredCV(persistedFileUrl);
    console.error('Error in CV upload route:', error);
    if (error instanceof SubscriptionLimitError) {
      return NextResponse.json(
        { error: error.message, upgradeRequired: true },
        { status: 402 }
      );
    }
    const message = error instanceof Error
      ? error.message
      : "Erreur lors de l'importation du CV.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

  const profile = await db.userProfile.findUnique({ where: { userId: user.id } });
  await db.userProfile.updateMany({
    where: { userId: user.id },
    data: { cvFileName: null, cvFileUrl: null, cvParsedText: null },
  });
  await db.autoApplyConfig.updateMany({
    where: { userId: user.id },
    data: {
      enabled: false,
      nextRunAt: null,
      lastResult: JSON.stringify({
        success: false,
        skipped: true,
        error: 'Le CV a été supprimé. Ajoutez un CV puis réactivez l’auto-candidature.',
        completedAt: new Date().toISOString(),
      }),
    },
  });
  if (profile?.cvFileUrl) await removeStoredCV(profile.cvFileUrl);
  return NextResponse.json({ success: true });
}
