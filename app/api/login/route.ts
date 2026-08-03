/**
 * POST /api/login — exchange the app password for a session cookie.
 *
 * Takes a plain form post (no JS on the login page), so the response is a 303
 * redirect: a 307/308 would make the browser repeat the POST at the new URL.
 *
 * There is deliberately no logout route. The cookie is a digest of the
 * password, so changing APP_PASSWORD in the Vercel project invalidates every
 * issued cookie at once — a simpler and more complete revocation than a button
 * that only signs out the device you happen to be holding.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, passwordConfigError, safeEqual, sessionToken } from '@/lib/appAuth';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function seeOther(req: NextRequest, pathAndQuery: string): NextResponse {
  return NextResponse.redirect(new URL(pathAndQuery, req.nextUrl.origin), 303);
}

export async function POST(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (passwordConfigError(password)) return seeOther(req, '/login?error=config');

  const form = await req.formData();
  const submitted = String(form.get('password') ?? '');

  // Compare digests rather than the raw strings: both are 64 hex characters, so
  // a wrong guess reveals nothing about the real password's length.
  const expected = await sessionToken(password as string);
  if (!safeEqual(await sessionToken(submitted), expected)) {
    return seeOther(req, '/login?error=1');
  }

  const res = seeOther(req, '/');
  res.cookies.set(SESSION_COOKIE, expected, {
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    // Long-lived on purpose: this is a phone home-screen app, and being logged
    // out every fortnight is how a daily tracker stops being daily.
    maxAge: ONE_YEAR_SECONDS,
  });
  return res;
}
