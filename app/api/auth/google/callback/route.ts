/**
 * GET /api/auth/google/callback — OAuth redirect target.
 * Exchanges ?code for tokens, persists them, resolves the account email, then
 * redirects home with a status. Every failure path redirects with a readable,
 * url-encoded error (never a blank page, never a silent failure).
 */
import { NextResponse } from 'next/server';
import { deleteSyncValue } from '@/lib/db';
import { fetchAccountEmail, isConfigured, makeOAuthClient, persistTokens } from '@/lib/google/client';
import { GOOGLE_AUTH_ERROR_KEY } from '@/lib/google/sync';
import { toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const home = (qs: string) => NextResponse.redirect(`${origin}/?connector=google&${qs}`, 302);

  // Google reports user-denied consent (or other auth errors) via ?error.
  const googleError = url.searchParams.get('error');
  if (googleError) {
    return home(`error=${encodeURIComponent(googleError)}`);
  }

  if (!isConfigured()) {
    return home('error=not_configured');
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return home(`error=${encodeURIComponent('Missing authorization code from Google.')}`);
  }

  try {
    const client = makeOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Resolve the connected account's email for display in the connector card.
    const email = await fetchAccountEmail(client);

    // Persist last (after email lookup) so the stored row carries the email.
    await persistTokens(tokens, email);

    // Fresh consent supersedes any recorded expiry — clear it, or the connector
    // would still show "Reconnect needed" against a working connection.
    await deleteSyncValue(GOOGLE_AUTH_ERROR_KEY);

    return home('status=connected');
  } catch (e) {
    return home(`error=${encodeURIComponent(toErrorMessage(e))}`);
  }
}
