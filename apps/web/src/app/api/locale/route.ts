import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isLanguagePreference, languageCookie } from '@/lib/locale';

export const dynamic = 'force-dynamic';

export async function GET() {
  const saved = (await cookies()).get(languageCookie)?.value;
  return NextResponse.json(
    { languagePreference: isLanguagePreference(saved) ? saved : 'system' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  // Use the configured public origin; Next may expose an internal server URL.
  const publicOrigin = new URL(process.env.WEB_ORIGIN ?? request.url).origin;
  if (request.headers.get('origin') !== publicOrigin)
    return NextResponse.json({ code: 'INVALID_ORIGIN' }, { status: 403, headers });
  const body: unknown = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !('languagePreference' in body) ||
    Object.keys(body).length !== 1 ||
    !isLanguagePreference(body.languagePreference)
  ) {
    return NextResponse.json({ code: 'INVALID_LANGUAGE' }, { status: 400, headers });
  }
  const response = NextResponse.json({ languagePreference: body.languagePreference }, { headers });
  response.cookies.set(languageCookie, body.languagePreference, {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(publicOrigin).protocol === 'https:',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
  return response;
}
