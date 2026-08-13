import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { hashPassword, signJWT } from '@/lib/auth';
import { checkRateLimit, requestClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function useSecureCookie(): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  return process.env.NODE_ENV === 'production' || Boolean(appUrl?.startsWith('https://'));
}

export async function POST(req: Request) {
  try {
    const rateLimit = checkRateLimit(`register:${requestClientIp(req)}`, 5, 60 * 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Trop de créations de compte. Réessayez plus tard.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        }
      );
    }
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json(
        { error: 'Le nom doit contenir entre 2 et 100 caractères.' },
        { status: 400 }
      );
    }
    if (!isValidEmail(email) || email.length > 254) {
      return NextResponse.json({ error: 'Adresse e-mail invalide.' }, { status: 400 });
    }
    if (password.length < 10 || password.length > 128) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir entre 10 et 128 caractères.' },
        { status: 400 }
      );
    }

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'Cette adresse e-mail est déjà enregistrée.' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await db.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: 'USER',
        profile: {
          create: {
            autoSearchEnabled: true,
            autoSearchIntervalMins: 30,
          },
        },
        notificationConfig: {
          create: {
            emailEnabled: true,
            alertOnNewMatch: true,
          },
        },
      },
    });

    const token = await signJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 }
    );
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: useSecureCookie(),
      sameSite: 'lax',
      priority: 'high',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    return response;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Cette adresse e-mail est déjà enregistrée.' },
        { status: 409 }
      );
    }
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Le compte n’a pas pu être créé. Réessayez dans un instant.' },
      { status: 500 }
    );
  }
}
