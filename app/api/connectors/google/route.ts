/**
 * GET /api/connectors/google — connector status for the Track tab.
 *
 * Fast and side-effect free: it reads env + the stored token row only. It does
 * NOT call any Google API (that's what /api/sync/google is for), so the UI can
 * poll it cheaply.
 *
 * status:
 *   not_configured — one of the GOOGLE_* envs is missing
 *   disconnected   — configured, but no token stored
 *   connected      — a token is stored (email read from the stored row)
 *   token_expired  — a token is stored but cannot be refreshed, so the user has
 *                    to re-consent. Two ways to know this without a network
 *                    call: the last sync recorded an `invalid_grant` (see
 *                    GOOGLE_AUTH_ERROR_KEY), or the stored credentials have no
 *                    refresh_token at all, which means the connection cannot
 *                    outlive the current access token no matter what.
 *   error          — reading/decrypting the stored token threw (e.g. the
 *                    TOKEN_ENCRYPTION_KEY changed); the message is surfaced
 */
import { NextResponse } from 'next/server';
import { getOAuthToken, getSyncValue } from '@/lib/db';
import { decryptTokenJson, isConfigured } from '@/lib/google/client';
import { GOOGLE_AUTH_ERROR_KEY } from '@/lib/google/sync';
import { jsonError, toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ConnectorStatus {
  configured: boolean;
  status: 'not_configured' | 'disconnected' | 'connected' | 'token_expired' | 'error';
  email: string | null;
  lastSync: string | null;
  todayInboxCount: number | null;
  error: string | null;
}

export async function GET() {
  try {
    const configured = isConfigured();

    const lastSync = await getSyncValue('last_google_sync');
    const inboxRaw = await getSyncValue('today_inbox_count');
    const parsed = inboxRaw === null ? NaN : Number(inboxRaw);
    const todayInboxCount = Number.isFinite(parsed) ? parsed : null;

    const base = { lastSync, todayInboxCount };

    if (!configured) {
      const body: ConnectorStatus = {
        configured: false,
        status: 'not_configured',
        email: null,
        error: null,
        ...base,
      };
      return NextResponse.json(body);
    }

    const stored = await getOAuthToken('google');
    if (!stored) {
      const body: ConnectorStatus = {
        configured: true,
        status: 'disconnected',
        email: null,
        error: null,
        ...base,
      };
      return NextResponse.json(body);
    }

    // Verify the stored token is readable (decrypts/parses) without calling out.
    let credentials;
    try {
      credentials = decryptTokenJson(stored.data);
    } catch (e) {
      const body: ConnectorStatus = {
        configured: true,
        status: 'error',
        email: stored.email ?? null,
        error: toErrorMessage(e),
        ...base,
      };
      return NextResponse.json(body);
    }

    // Expired/revoked grant recorded by the last sync attempt.
    const authError = await getSyncValue(GOOGLE_AUTH_ERROR_KEY);
    if (authError) {
      const body: ConnectorStatus = {
        configured: true,
        status: 'token_expired',
        email: stored.email ?? null,
        error: authError,
        ...base,
      };
      return NextResponse.json(body);
    }

    // No refresh_token means the access token cannot be renewed when it lapses
    // (~1h), so this connection is already dead even if it hasn't failed yet.
    // Say so now rather than letting tomorrow's sync be the first sign of it.
    if (!credentials.refresh_token) {
      const body: ConnectorStatus = {
        configured: true,
        status: 'token_expired',
        email: stored.email ?? null,
        error:
          'Connected without offline access — Google issued no refresh token, so this ' +
          'connection stops working within the hour. Reconnect to grant it.',
        ...base,
      };
      return NextResponse.json(body);
    }

    const body: ConnectorStatus = {
      configured: true,
      status: 'connected',
      email: stored.email ?? null,
      error: null,
      ...base,
    };
    return NextResponse.json(body);
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
