/**
 * POST /api/sync/google — pull today's Calendar + Gmail into the local DB.
 *
 * Guard order surfaces the most specific actionable error first:
 *   400 if Google isn't configured (missing creds)
 *   400 if configured but not connected (no token)
 *   200 with the SyncResult otherwise — note: a 200 may still carry per-source
 *       messages in `errors` (Calendar and Gmail fail independently).
 *   500 only on an unexpected throw outside the per-source try/catch.
 */
import { NextResponse } from 'next/server';
import { getAuthedClient, isConfigured } from '@/lib/google/client';
import { syncGoogle } from '@/lib/google/sync';
import { jsonError, toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    if (!isConfigured()) {
      return jsonError('Google is not configured — add credentials to .env.local', 400);
    }

    let client;
    try {
      client = getAuthedClient();
    } catch (e) {
      // Stored token unreadable (e.g. TOKEN_ENCRYPTION_KEY changed).
      return jsonError(`Could not load Google credentials: ${toErrorMessage(e)}`, 400);
    }

    if (!client) {
      return jsonError('Google not connected — connect it in the Track tab', 400);
    }

    const result = await syncGoogle(client);
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
