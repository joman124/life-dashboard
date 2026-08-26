/**
 * GET /api/connectors/brief — the Morning brief connector panel's data.
 *
 * Returns the read token to paste into the Cowork task, the endpoint path, and
 * when the brief was last fetched (or null if it never has been). That last
 * field is the one that matters in practice: it is the only way to tell a
 * scheduled task that is quietly failing from one that has not fired yet.
 *
 * Behind the password gate, unlike /api/brief itself — this is the panel that
 * reveals the secret, so only a signed-in browser may call it.
 */
import { NextResponse } from 'next/server';
import { getSyncValue } from '@/lib/db';
import { getOrCreateBriefToken } from '@/lib/briefToken';
import { jsonError, toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({
      token: await getOrCreateBriefToken(),
      endpoint: '/api/brief',
      lastFetch: await getSyncValue('last_brief_fetch'),
    });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
