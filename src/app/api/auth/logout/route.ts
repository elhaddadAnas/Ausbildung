import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Erfolgreich abgemeldet.' });
  response.cookies.delete('token');
  return response;
}
