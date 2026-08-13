import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || !user.profile) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const body = await req.json();
  const name = String(body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Le nom de la compétence est obligatoire.' }, { status: 400 });
  }
  const newSkill = await db.skill.create({
    data: {
      profileId: user.profile.id,
      name: name.slice(0, 120),
      category: String(body.category || 'General').trim().slice(0, 80),
      level: String(body.level || 'Intermediate').trim().slice(0, 40),
    },
  });

  return NextResponse.json({ success: true, skill: newSkill });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID fehlt' }, { status: 400 });

  const deleted = await db.skill.deleteMany({
    where: { id, profile: { userId: user.id } },
  });
  if (!deleted.count) {
    return NextResponse.json({ error: 'Compétence introuvable.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
