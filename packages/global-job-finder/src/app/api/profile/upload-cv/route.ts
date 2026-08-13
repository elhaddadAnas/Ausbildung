import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseCVWithAI } from '@/lib/services/openai';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { privateUploadsRoot, removeStoredCV } from '@/lib/private-files';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function cleanStr(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\u0000/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim();
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse v2 relies on browser geometry globals. Load the native polyfills
  // lazily so importing the API route during `next build` remains safe.
  const canvas = await import('@napi-rs/canvas');
  const globals = globalThis as any;
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

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier sélectionné.' }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Le CV est trop volumineux (max. 20 Mo).' }, { status: 400 });
    }

    const fileName = cleanStr(file.name);
    const extension = path.extname(fileName).toLowerCase();
    if (!['.pdf', '.doc', '.docx'].includes(extension)) {
      return NextResponse.json(
        { error: 'Format de CV non accepté. Utilisez un fichier PDF, DOC ou DOCX.' },
        { status: 400 }
      );
    }
    const fileBytes = await file.arrayBuffer();
    const buffer = Buffer.from(fileBytes);

    // The mailer requires a real, persisted file. Do not save a database URL
    // when the upload itself could not be written.
    let fileUrl = '';
    try {
      const uploadsDir = privateUploadsRoot();
      await fs.mkdir(uploadsDir, { recursive: true });
      const safeName = `${user.id}-${crypto.randomUUID()}${extension}`;
      await fs.writeFile(path.join(uploadsDir, safeName), buffer);
      fileUrl = `private:${safeName}`;
    } catch (e) {
      console.error('Could not persist uploaded CV:', e);
      throw new Error('Le CV n’a pas pu être enregistré. Vérifiez le stockage du serveur.');
    }

    // PDF content is parsed directly. DOC/DOCX files remain available as the
    // original attachment and use the fallback text parser.
    let parsedText = '';
    if (extension === '.pdf') {
      try {
        parsedText = await extractPdfText(buffer);
      } catch (e: any) {
        console.warn('PDF parsing with pdf-parse failed, falling back to string conversion:', e);
        parsedText = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\tÀ-ÿ]/g, ' ');
      }
    } else {
      parsedText = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\tÀ-ÿ]/g, ' ');
    }

    parsedText = cleanStr(parsedText);
    if (!parsedText || parsedText.length < 5) {
      parsedText = `CV de ${cleanStr(user.name)}. Fichier: ${fileName}.`;
    }

    // Call OpenAI or regex parser to extract structured information
    const parsedInfo = await parseCVWithAI(parsedText);

    const safePhone = cleanStr(parsedInfo.phone);
    const safeAddress = cleanStr(parsedInfo.address);
    const safeCity = cleanStr(parsedInfo.city);
    const safePostalCode = cleanStr(parsedInfo.postalCode);
    const safeFederalState = cleanStr(parsedInfo.country);
    const safeDateOfBirth = cleanStr(parsedInfo.dateOfBirth);
    const safePlaceOfBirth = cleanStr(parsedInfo.placeOfBirth);
    const safeBio = cleanStr(parsedInfo.bio);
    const safeDrivingLicense = cleanStr(parsedInfo.drivingLicense) || 'Klasse B (PKW)';
    const safeSalaryExpectation = cleanStr(parsedInfo.salaryExpectation);
    const safeLanguages = parsedInfo.languages ? JSON.stringify(parsedInfo.languages.map(l => cleanStr(l))) : '[]';

    // Upsert UserProfile with parsed details
    const updatedProfile = await db.userProfile.upsert({
      where: { userId: user.id },
      update: {
        cvFileName: fileName,
        cvFileUrl: fileUrl,
        cvParsedText: parsedText,
        phone: safePhone || undefined,
        address: safeAddress || undefined,
        city: safeCity || undefined,
        postalCode: safePostalCode || undefined,
        country: safeFederalState || undefined,
        dateOfBirth: safeDateOfBirth || undefined,
        placeOfBirth: safePlaceOfBirth || undefined,
        languages: safeLanguages,
        bio: safeBio || undefined,
        drivingLicense: safeDrivingLicense || undefined,
        salaryExpectation: safeSalaryExpectation || undefined,
      },
      create: {
        userId: user.id,
        cvFileName: fileName,
        cvFileUrl: fileUrl,
        cvParsedText: parsedText,
        phone: safePhone,
        address: safeAddress,
        city: safeCity,
        postalCode: safePostalCode,
        country: safeFederalState,
        dateOfBirth: safeDateOfBirth,
        placeOfBirth: safePlaceOfBirth,
        languages: safeLanguages,
        bio: safeBio,
        drivingLicense: safeDrivingLicense,
        salaryExpectation: safeSalaryExpectation,
      },
    });
    if (user.profile?.cvFileUrl && user.profile.cvFileUrl !== fileUrl) {
      await removeStoredCV(user.profile.cvFileUrl);
    }

    // Update User name if found in CV
    const safeName = cleanStr(parsedInfo.name);
    if (safeName && safeName.length > 2) {
      await db.user.update({
        where: { id: user.id },
        data: { name: safeName },
      });
    }

    // Replace education, experience, and skills
    await db.education.deleteMany({ where: { profileId: updatedProfile.id } });
    await db.experience.deleteMany({ where: { profileId: updatedProfile.id } });
    await db.skill.deleteMany({ where: { profileId: updatedProfile.id } });

    // Insert new Educations
    if (parsedInfo.educations && Array.isArray(parsedInfo.educations) && parsedInfo.educations.length > 0) {
      const validEdus = parsedInfo.educations
        .filter(edu => edu && typeof edu === 'object')
        .map(edu => ({
          profileId: updatedProfile.id,
          degree: cleanStr(edu.degree) || 'Formation / Diplôme',
          fieldOfStudy: cleanStr(edu.fieldOfStudy) || null,
          institution: cleanStr(edu.institution) || 'Établissement non précisé',
          location: cleanStr(edu.location) || null,
          startDate: cleanStr(edu.startDate) || '2021',
          endDate: cleanStr(edu.endDate) || null,
          current: Boolean(edu.current),
          description: cleanStr(edu.description) || null,
        }));

      if (validEdus.length > 0) {
        await db.education.createMany({ data: validEdus });
      }
    }

    // Insert new Experiences
    if (parsedInfo.experiences && Array.isArray(parsedInfo.experiences) && parsedInfo.experiences.length > 0) {
      const validExps = parsedInfo.experiences
        .filter(exp => exp && typeof exp === 'object')
        .map(exp => ({
          profileId: updatedProfile.id,
          jobTitle: cleanStr(exp.jobTitle) || 'Poste occupé',
          company: cleanStr(exp.company) || 'Entreprise / Organisation',
          location: cleanStr(exp.location) || null,
          startDate: cleanStr(exp.startDate) || '2021',
          endDate: cleanStr(exp.endDate) || null,
          current: Boolean(exp.current),
          description: cleanStr(exp.description) || null,
        }));

      if (validExps.length > 0) {
        await db.experience.createMany({ data: validExps });
      }
    }

    // Insert new Skills
    if (parsedInfo.skills && Array.isArray(parsedInfo.skills) && parsedInfo.skills.length > 0) {
      const validSkills = parsedInfo.skills
        .filter(sk => sk && sk.name)
        .map(sk => ({
          profileId: updatedProfile.id,
          name: cleanStr(sk.name) || 'Compétence',
          category: cleanStr(sk.category) || 'Général',
          level: cleanStr(sk.level) || 'Intermediate',
        }));

      if (validSkills.length > 0) {
        await db.skill.createMany({ data: validSkills });
      }
    }

    // Fetch full updated profile to return
    const finalProfile = await db.userProfile.findUnique({
      where: { id: updatedProfile.id },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
        educations: true,
        experiences: true,
        skills: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `CV ${fileName} importé et analysé par l'IA avec succès !`,
      fileName,
      parsedInfo,
      profile: finalProfile,
    });
  } catch (err: any) {
    console.error('Error in CV upload route:', err);
    return NextResponse.json({ error: err?.message || String(err) || "Erreur lors de l'importation du CV." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }
  const profile = await db.userProfile.findUnique({ where: { userId: user.id } });
  if (profile?.cvFileUrl) await removeStoredCV(profile.cvFileUrl);
  await db.userProfile.updateMany({
    where: { userId: user.id },
    data: { cvFileName: null, cvFileUrl: null, cvParsedText: null },
  });
  return NextResponse.json({ success: true });
}
