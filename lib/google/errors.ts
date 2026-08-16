/**
 * lib/google/errors.ts — PURE classification of Google OAuth/API errors.
 *
 * Kept free of googleapis, DB, and process.env imports so it is trivially
 * unit-testable and safe to import from anywhere on the server.
 *
 * Why this exists: when a stored refresh token stops working, googleapis throws
 * on the *API call*, not at load time — so Calendar and Gmail each surface the
 * same underlying auth failure independently. Before this module the Track tab
 * rendered the raw OAuth code twice ("Calendar: invalid_grant · Gmail:
 * invalid_grant"), which is accurate and completely useless: it names the
 * protocol error, not the thing the user has to do about it.
 *
 * `invalid_grant` from Google's token endpoint means the refresh token is no
 * longer usable. In practice, for this app, the causes are:
 *
 *   1. The OAuth consent screen is still in "Testing" publishing status, where
 *      Google expires every refresh token after 7 days. This is by far the most
 *      common cause of a connection that worked and then quietly stopped.
 *   2. Access was revoked (myaccount.google.com → Security → Third-party apps),
 *      or the Google account password was changed.
 *   3. GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET changed after the token was
 *      issued, so the token no longer belongs to this client.
 *   4. The refresh token went unused for six months.
 *
 * None of these are recoverable in code — every one of them requires the user
 * to re-consent — which is exactly why this maps to the `token_expired`
 * connector status and a Reconnect button rather than an `error` state.
 */

/** Reasons Google's token endpoint refuses a refresh, all requiring re-consent. */
const AUTH_ERROR_CODES = new Set([
  'invalid_grant',
  'invalid_token',
  'unauthorized_client',
  'invalid_client',
]);

/** Narrow an unknown thrown value to a record without tripping over null. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/**
 * Pull the OAuth error code out of a thrown value.
 *
 * googleapis surfaces refresh failures as a GaxiosError whose
 * `response.data` is the raw token-endpoint body:
 *   { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }
 * Regular Google *API* failures instead nest an object:
 *   { error: { code: 401, message: '...', status: 'UNAUTHENTICATED' } }
 * so `error` has to be read as either a string or an object. Some versions also
 * hoist the code onto the error itself, and older ones only leave it in the
 * message — all three are checked, cheapest first.
 */
export function oauthErrorCode(e: unknown): string | null {
  const err = asRecord(e);
  if (!err) return null;

  // 1. Token-endpoint body: { error: 'invalid_grant', ... }
  const data = asRecord(asRecord(err.response)?.data);
  const dataError = data?.error;
  if (typeof dataError === 'string' && dataError) return dataError;

  // 2. Hoisted onto the error object itself (googleapis >= 118 does this).
  if (typeof err.error === 'string' && err.error) return err.error;

  // 3. Last resort: the message. googleapis frequently sets message to the bare
  //    code ('invalid_grant'), so match on a word boundary rather than parsing.
  const message = typeof err.message === 'string' ? err.message : '';
  for (const code of AUTH_ERROR_CODES) {
    if (new RegExp(`\\b${code}\\b`).test(message)) return code;
  }

  return null;
}

/**
 * True when the failure means the stored Google token can no longer be
 * refreshed and the user must re-consent. Callers should map this to the
 * `token_expired` connector status, never to a generic error.
 */
export function isAuthExpired(e: unknown): boolean {
  const code = oauthErrorCode(e);
  return code !== null && AUTH_ERROR_CODES.has(code);
}

/**
 * Google's own `error_description` for the failure, when present — e.g.
 * "Token has been expired or revoked." It is the single most diagnostic string
 * available, so it is shown to the user verbatim alongside our own explanation.
 */
export function oauthErrorDescription(e: unknown): string | null {
  const data = asRecord(asRecord(asRecord(e)?.response)?.data);
  const desc = data?.error_description;
  return typeof desc === 'string' && desc.trim() !== '' ? desc.trim() : null;
}

/**
 * Cause-specific follow-up advice, keyed by OAuth code. These codes all mean
 * "reconnect", but they get there for different reasons, and a hint aimed at
 * the wrong one sends the user to the wrong settings page. `invalid_grant` is
 * about the *token* (age/revocation); the `*_client` codes are about the
 * *credentials* in .env.local, where reconnecting alone will not help.
 */
const CAUSE_HINT: Record<string, string> = {
  invalid_grant:
    'If your Google Cloud OAuth consent screen is still in “Testing”, Google expires the' +
    ' token every 7 days; publishing the app to “In production” stops it recurring.',
  invalid_token:
    'The stored token is no longer valid — reconnecting issues a fresh one.',
  invalid_client:
    'Google did not recognise this app’s credentials. Check that GOOGLE_CLIENT_ID and' +
    ' GOOGLE_CLIENT_SECRET in .env.local still match the OAuth client in Google Cloud' +
    ' Console, and restart the server after editing them.',
  unauthorized_client:
    'This OAuth client isn’t authorized for the requested scopes. Re-check the client’s' +
    ' configuration in Google Cloud Console, then reconnect.',
};

/**
 * The message shown in the Track tab when the connection needs re-consent.
 * Leads with the action, then Google's own words, then the cause-specific
 * hint — a user staring at this card wants to know what to click, not what
 * OAuth called the failure.
 */
export function authExpiredMessage(e?: unknown): string {
  const desc = e === undefined ? null : oauthErrorDescription(e);
  const detail = desc ? ` Google said: “${desc}”` : '';
  const code = e === undefined ? null : oauthErrorCode(e);
  const hint = (code && CAUSE_HINT[code]) || CAUSE_HINT.invalid_grant;
  return `Google sign-in expired — reconnect to keep syncing.${detail} ${hint}`;
}
