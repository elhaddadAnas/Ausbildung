import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { comparePassword, signJWT } from '@/lib/auth';
import { checkRateLimit, clearRateLimit, requestClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function shouldUseSecureCookie(): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  return process.env.NODE_ENV === 'production' || Boolean(appUrl?.startsWith('https://'));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const rateLimitKey = `login:${requestClientIp(req)}:${email}`;
    const rateLimit = await checkRateLimit(rateLimitKey, 5, 15 * 60_000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez plus tard.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    if (!isValidEmail(email) || !password) {
      return NextResponse.json(
        { error: 'Saisissez une adresse e-mail valide et votre mot de passe.' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await comparePassword(password, user.passwordHash))) {
      return NextResponse.json(
        { error: 'Adresse e-mail ou mot de passe incorrect.' },
        { status: 401 }
      );
    }

    const token = await signJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    await clearRateLimit(rateLimitKey);
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: shouldUseSecureCookie(),
      sameSite: 'lax',
      priority: 'high',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Le service de connexion est momentanément indisponible.' },
      { status: 500 }
    );
  }
}
