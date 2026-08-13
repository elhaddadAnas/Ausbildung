import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose/jwt/verify';

const ISSUER = 'ausbildung-finder-ai';
const AUDIENCE = 'ausbildung-finder-web';

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  if (!token || !process.env.JWT_SECRET) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL('/login', req.url));
    response.cookies.delete('token');
    return response;
  }
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/search/:path*',
    '/ai-matching/:path*',
    '/applications/:path*',
    '/messages/:path*',
    '/profile/:path*',
    '/calendar/:path*',
    '/settings/:path*',
    '/subscription/:path*',
    '/admin/:path*',
  ],
};
