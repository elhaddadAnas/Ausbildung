import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  getAutoApplyIntervalMinutes,
  runAutoApplyForUser,
} from '@/lib/services/auto-apply';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeList(value: unknown, max = 20): string[] {
  const input = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(
    input
      .map((item) => String(item).trim())
      .filter(Boolean)
      .slice(0, max)
  )];
}

function publicConfig(config: any) {
  const parse = (value: string) => {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  };
  return {
    ...config,
    keywords: parse(config.keywords),
    cities: parse(config.cities),
    countries: parse(config.countries),
    categories: parse(config.categories),
  };
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const config = await db.autoApplyConfig.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      intervalMinutes: getAutoApplyIntervalMinutes(),
      keywords: JSON.stringify(['Software Engineer']),
    },
  });
  return NextResponse.json({ config: publicConfig(config) });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  try {
    const body = await req.json();
    const enabled = Boolean(body.enabled);
    if (enabled) {
      const [smtp, profile] = await Promise.all([
        db.smtpConfig.findUnique({ where: { userId: user.id } }),
        db.userProfile.findUnique({ where: { userId: user.id } }),
      ]);
      if (!smtp?.active || !smtp.isTested) {
        return NextResponse.json(
          { error: 'Enregistrez puis testez une connexion SMTP active avant d’activer l’auto-candidature.' },
          { status: 400 }
        );
      }
      if (!profile?.cvFileUrl) {
        return NextResponse.json(
          { error: 'Ajoutez votre CV au profil avant d’activer l’auto-candidature.' },
          { status: 400 }
        );
      }
    }

    const keywords = normalizeList(body.keywords);
    const cities = normalizeList(body.cities);
    const countries = normalizeList(body.countries);
    const categories = normalizeList(body.categories);
    const radiusKm = Math.min(200, Math.max(0, Number(body.radiusKm) || 25));
    const minMatchScore = Math.min(100, Math.max(0, Number(body.minMatchScore) || 0));
    const maxApplications = 1;
    const current = await db.autoApplyConfig.findUnique({ where: { userId: user.id } });
    const justEnabled = enabled && !current?.enabled;

    const config = await db.autoApplyConfig.upsert({
      where: { userId: user.id },
      update: {
        enabled,
        intervalMinutes: getAutoApplyIntervalMinutes(),
        keywords: JSON.stringify(keywords.length ? keywords : ['Software Engineer']),
        cities: JSON.stringify(cities),
        countries: JSON.stringify(countries),
        categories: JSON.stringify(categories),
        radiusKm,
        remoteOnly: Boolean(body.remoteOnly),
        minMatchScore,
        maxApplications,
        nextRunAt: enabled
          ? (justEnabled
              ? new Date(Date.now() + getAutoApplyIntervalMinutes() * 60_000)
              : current?.nextRunAt || new Date(Date.now() + getAutoApplyIntervalMinutes() * 60_000))
          : null,
      },
      create: {
        userId: user.id,
        enabled,
        intervalMinutes: getAutoApplyIntervalMinutes(),
        keywords: JSON.stringify(keywords.length ? keywords : ['Software Engineer']),
        cities: JSON.stringify(cities),
        countries: JSON.stringify(countries),
        categories: JSON.stringify(categories),
        radiusKm,
        remoteOnly: Boolean(body.remoteOnly),
        minMatchScore,
        maxApplications,
        nextRunAt: enabled
          ? new Date(Date.now() + getAutoApplyIntervalMinutes() * 60_000)
          : null,
      },
    });
    return NextResponse.json({ success: true, config: publicConfig(config) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Impossible d’enregistrer l’auto-candidature.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });

  const [smtp, profile] = await Promise.all([
    db.smtpConfig.findUnique({ where: { userId: user.id } }),
    db.userProfile.findUnique({ where: { userId: user.id } }),
  ]);
  if (!smtp?.active || !smtp.isTested) {
    return NextResponse.json(
      { error: 'La connexion SMTP doit être active et testée.' },
      { status: 400 }
    );
  }
  if (!profile?.cvFileUrl) {
    return NextResponse.json(
      { error: 'Ajoutez votre CV au profil avant de lancer l’auto-candidature.' },
      { status: 400 }
    );
  }
  const result = await runAutoApplyForUser(user.id, { force: true });
  return NextResponse.json(result, { status: result.success ? 200 : 422 });
}
