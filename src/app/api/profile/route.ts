import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';

function optionalText(value: unknown, maxLength: number): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  const profile = await db.userProfile.findUnique({
    where: { userId: user.id },
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
      certificates: true,
      skills: true,
    },
  });

  return NextResponse.json({ profile });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
  }

  try {
    const data = await req.json();
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (name.length < 2 || name.length > 100) {
        return NextResponse.json({ error: 'Le nom doit contenir entre 2 et 100 caractères.' }, { status: 400 });
      }
    }
    const requestedInterval = Number(data.autoSearchIntervalMins);
    const autoSearchIntervalMins = Number.isFinite(requestedInterval)
      ? Math.min(24 * 60, Math.max(15, Math.round(requestedInterval)))
      : 30;
    const languages = Array.isArray(data.languages)
      ? JSON.stringify(
          data.languages
            .map((language: unknown) => String(language).trim().slice(0, 100))
            .filter(Boolean)
            .slice(0, 20)
        )
      : optionalText(data.languages, 2_000);

    const optionalAutomationFields = {
      ...(data.autoSearchEnabled !== undefined
        ? { autoSearchEnabled: Boolean(data.autoSearchEnabled) }
        : {}),
      ...(data.autoSearchIntervalMins !== undefined
        ? { autoSearchIntervalMins }
        : {}),
    };

    const updatedProfile = await db.userProfile.upsert({
      where: { userId: user.id },
      update: {
        ...(data.phone !== undefined ? { phone: optionalText(data.phone, 50) } : {}),
        ...(data.address !== undefined ? { address: optionalText(data.address, 300) } : {}),
        ...(data.city !== undefined ? { city: optionalText(data.city, 100) } : {}),
        ...(data.postalCode !== undefined ? { postalCode: optionalText(data.postalCode, 20) } : {}),
        ...(data.federalState !== undefined ? { federalState: optionalText(data.federalState, 100) } : {}),
        ...(data.dateOfBirth !== undefined ? { dateOfBirth: optionalText(data.dateOfBirth, 30) } : {}),
        ...(data.placeOfBirth !== undefined ? { placeOfBirth: optionalText(data.placeOfBirth, 100) } : {}),
        ...(data.bio !== undefined ? { bio: optionalText(data.bio, 5_000) } : {}),
        ...(data.drivingLicense !== undefined ? { drivingLicense: optionalText(data.drivingLicense, 100) } : {}),
        ...(data.languages !== undefined
          ? { languages }
          : {}),
        ...(data.salaryExpectation !== undefined
          ? { salaryExpectation: optionalText(data.salaryExpectation, 100) }
          : {}),
        ...(data.contractTypePreference !== undefined
          ? { contractTypePreference: optionalText(data.contractTypePreference, 100) }
          : {}),
        ...(data.remotePreference !== undefined
          ? { remotePreference: Boolean(data.remotePreference) }
          : {}),
        ...optionalAutomationFields,
      },
      create: {
        userId: user.id,
        phone: optionalText(data.phone, 50),
        address: optionalText(data.address, 300),
        city: optionalText(data.city, 100),
        postalCode: optionalText(data.postalCode, 20),
        federalState: optionalText(data.federalState, 100),
        dateOfBirth: optionalText(data.dateOfBirth, 30),
        placeOfBirth: optionalText(data.placeOfBirth, 100),
        bio: optionalText(data.bio, 5_000),
        drivingLicense: optionalText(data.drivingLicense, 100),
        languages: languages || '[]',
        salaryExpectation: optionalText(data.salaryExpectation, 100),
        contractTypePreference: optionalText(data.contractTypePreference, 100),
        remotePreference: Boolean(data.remotePreference),
        autoSearchEnabled: data.autoSearchEnabled !== false,
        autoSearchIntervalMins,
      },
    });

    if (data.name !== undefined || data.avatarUrl !== undefined) {
      await db.user.update({
        where: { id: user.id },
        data: {
          ...(data.name !== undefined ? { name: String(data.name).trim() } : {}),
          ...(data.avatarUrl !== undefined
            ? { avatarUrl: optionalText(data.avatarUrl, 2_000) }
            : {}),
        },
      });
    }

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Profil konnte nicht aktualisiert werden.' }, { status: 500 });
  }
}
