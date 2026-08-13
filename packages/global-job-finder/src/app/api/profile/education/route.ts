import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !user.profile) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const body = await req.json();
  if (!String(body.degree || '').trim() || !String(body.institution || '').trim()) {
    return NextResponse.json({ error: 'Le diplôme et l’établissement sont obligatoires.' }, { status: 400 });
  }
  const newEducation = await db.education.create({
    data: {
      profileId: user.profile.id,
      degree: String(body.degree).trim().slice(0, 200),
      fieldOfStudy: String(body.fieldOfStudy || '').trim().slice(0, 200) || null,
      institution: String(body.institution).trim().slice(0, 200),
      location: String(body.location || '').trim().slice(0, 200) || null,
      startDate: String(body.startDate || '').trim().slice(0, 30),
      endDate: String(body.endDate || '').trim().slice(0, 30) || null,
      current: Boolean(body.current),
      description: String(body.description || '').trim().slice(0, 2000) || null,
    },
  });

  return NextResponse.json({ success: true, education: newEducation });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID fehlt' }, { status: 400 });

  const deleted = await db.education.deleteMany({
    where: { id, profile: { userId: user.id } },
  });
  if (!deleted.count) {
    return NextResponse.json({ error: 'Formation introuvable.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
