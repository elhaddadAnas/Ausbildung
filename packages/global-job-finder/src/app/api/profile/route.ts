import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';

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

    const optionalAutomationFields = {
      ...(data.autoSearchEnabled !== undefined
        ? { autoSearchEnabled: Boolean(data.autoSearchEnabled) }
        : {}),
      ...(data.autoSearchIntervalMins !== undefined
        ? { autoSearchIntervalMins: Number(data.autoSearchIntervalMins) || 30 }
        : {}),
    };

    const updatedProfile = await db.userProfile.upsert({
      where: { userId: user.id },
      update: {
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        ...(data.address !== undefined ? { address: data.address || null } : {}),
        ...(data.city !== undefined ? { city: data.city || null } : {}),
        ...(data.postalCode !== undefined ? { postalCode: data.postalCode || null } : {}),
        ...(data.country !== undefined ? { country: data.country || null } : {}),
        ...(data.dateOfBirth !== undefined ? { dateOfBirth: data.dateOfBirth || null } : {}),
        ...(data.placeOfBirth !== undefined ? { placeOfBirth: data.placeOfBirth || null } : {}),
        ...(data.bio !== undefined ? { bio: data.bio || null } : {}),
        ...(data.drivingLicense !== undefined ? { drivingLicense: data.drivingLicense || null } : {}),
        ...(data.languages !== undefined
          ? {
              languages: typeof data.languages === 'string'
                ? data.languages
                : JSON.stringify(data.languages || []),
            }
          : {}),
        ...(data.salaryExpectation !== undefined
          ? { salaryExpectation: data.salaryExpectation || null }
          : {}),
        ...(data.contractTypePreference !== undefined
          ? { contractTypePreference: data.contractTypePreference || null }
          : {}),
        ...(data.remotePreference !== undefined
          ? { remotePreference: Boolean(data.remotePreference) }
          : {}),
        ...optionalAutomationFields,
      },
      create: {
        userId: user.id,
        phone: data.phone,
        address: data.address,
        city: data.city,
        postalCode: data.postalCode,
        country: data.country,
        dateOfBirth: data.dateOfBirth,
        placeOfBirth: data.placeOfBirth,
        bio: data.bio,
        drivingLicense: data.drivingLicense,
        languages: typeof data.languages === 'string' ? data.languages : JSON.stringify(data.languages || []),
        salaryExpectation: data.salaryExpectation,
        contractTypePreference: data.contractTypePreference,
        remotePreference: Boolean(data.remotePreference),
        autoSearchEnabled: true,
        autoSearchIntervalMins: 30,
      },
    });

    if (data.name || data.avatarUrl !== undefined) {
      await db.user.update({
        where: { id: user.id },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        },
      });
    }

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Profil konnte nicht aktualisiert werden.' }, { status: 500 });
  }
}
