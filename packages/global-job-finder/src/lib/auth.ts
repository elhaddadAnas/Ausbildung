import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { db } from './db';

const secretText = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? ''
  : 'development-only-secret-change-before-production');
const insecureProductionSecrets = new Set([
  'ausbildung_finder_ai_jwt_secret_key_2026_super_secure',
  'your_jwt_secret_key',
  'generate-a-random-secret-with-at-least-32-characters',
]);
if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  (secretText.length < 32 || insecureProductionSecrets.has(secretText))
) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
}
const JWT_SECRET = new TextEncoder().encode(secretText);
const JWT_ISSUER = 'ausbildung-finder-ai';
const JWT_AUDIENCE = 'ausbildung-finder-web';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signJWT(payload: TokenPayload): Promise<string> {
  return new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyJWT(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['HS256'],
    });
    return payload as unknown as TokenPayload;
  } catch (error) {
    return null;
  }
}

export async function getCurrentUserFromRequest(req?: NextRequest) {
  let token: string | undefined;

  if (req) {
    // Check Authorization header
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      // Check cookies
      token = req.cookies.get('token')?.value;
    }
  } else {
    // Server Component context
    const cookieStore = await cookies();
    token = cookieStore.get('token')?.value;
  }

  if (!token) return null;

  const payload = await verifyJWT(token);
  if (!payload || !payload.userId) return null;

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    include: {
      profile: {
        include: {
          educations: true,
          experiences: true,
          certificates: true,
          skills: true,
        },
      },
      smtpConfig: true,
      notificationConfig: true,
    },
  });

  return user;
}
