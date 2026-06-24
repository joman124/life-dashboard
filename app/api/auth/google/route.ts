/**
 * GET /api/auth/google — start the OAuth flow.
 * If Google isn't configured, redirect home with an error so the UI can explain
 * why; otherwise redirect to Google's consent screen.
 */
import { NextResponse } from 'next/server';
import { getAuthUrl, isConfigured } from '@/lib/google/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!isConfigured()) {
    return NextResponse.redirect(`${origin}/?connector=google&error=not_configured`, 302);
  }
  return NextResponse.redirect(getAuthUrl(), 302);
}
