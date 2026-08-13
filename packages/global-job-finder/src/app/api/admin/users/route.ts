import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';

export async function PUT(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 });
  }

  try {
    const { userId, role, name } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'ID Utilisateur requis.' }, { status: 400 });
    }
    if (role !== undefined && !['USER', 'ADMIN'].includes(role)) {
      return NextResponse.json({ error: 'Rôle invalide.' }, { status: 400 });
    }
    if (userId === user.id && role && role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas retirer votre propre rôle administrateur.' },
        { status: 400 }
      );
    }
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100)) {
      return NextResponse.json({ error: 'Nom invalide.' }, { status: 400 });
    }

    const updatedUser = await db.user.update({
      where: { id: userId },
      data: {
        ...(role ? { role } : {}),
        ...(name ? { name: name.trim() } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    await db.systemLog.create({
      data: {
        source: 'ADMIN',
        message: `Rôle ou profil modifié pour ${updatedUser.name} (${updatedUser.email}) -> Rôle: ${updatedUser.role}`,
      },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Échec de la modification.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'ID Utilisateur requis.' }, { status: 400 });
    }

    if (userId === user.id) {
      return NextResponse.json({ error: 'Vous ne pouvez pas supprimer votre propre compte admin.' }, { status: 400 });
    }

    const targetUser = await db.user.findUnique({ where: { id: userId } });
    if (targetUser) {
      await db.user.delete({ where: { id: userId } });
      await db.systemLog.create({
        data: {
          source: 'ADMIN',
          message: `Utilisateur supprimé par l'admin : ${targetUser.name} (${targetUser.email})`,
        },
      });
    }

    return NextResponse.json({ success: true, message: 'Utilisateur supprimé.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Échec de la suppression.' }, { status: 500 });
  }
}
