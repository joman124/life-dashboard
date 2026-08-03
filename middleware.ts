/**
 * middleware.ts — the password gate in front of the whole app.
 *
 * Runs on the Edge runtime before every matched request. Three outcomes:
 *   - valid session cookie, or an exempt path  → through
 *   - page request without a session           → redirect to /login
 *   - API request without a session            → 401 JSON (so fetch callers see
 *                                                a real error, not login HTML)
 *
 * On localhost with no APP_PASSWORD set there is no gate at all — requiring a
 * password to run `npm run dev` would be friction with no security value. On a
 * deployment the same missing password is a serious misconfiguration, so it
 * fails closed with a 503 rather than quietly serving personal data to anyone.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, passwordConfigError, safeEqual, sessionToken } from '@/lib/appAuth';

/**
 * Paths reachable without a session.
 *
 * /api/health-import is the important one: it is called by an iOS Shortcut that
 * cannot log in, and it already authenticates itself with its own bearer token.
 * Gating it here would silently break Apple Health import — which is exactly
 * what Vercel Authentication did, and the reason this middleware exists.
 *
 * The icons and manifest are exempt so the install prompt and home-screen icon
 * still resolve on the login screen.
 */
const PUBLIC_PATHS = new Set([
  '/login',
  '/api/login',
  '/api/health-import',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const password = process.env.APP_PASSWORD;
  const configError = passwordConfigError(password);

  if (configError) {
    // Localhost without a password: no gate, by design.
    if (!process.env.VERCEL) return NextResponse.next();
    return new NextResponse(
      `Refusing to serve: ${configError} Set it in the Vercel project's environment variables and redeploy.`,
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  const presented = req.cookies.get(SESSION_COOKIE)?.value ?? '';
  if (presented && safeEqual(presented, await sessionToken(password as string))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next's own build output. The gate has to cover API routes
  // too — protecting only pages would leave /api/entries wide open.
  matcher: ['/((?!_next/static|_next/image).*)'],
};
