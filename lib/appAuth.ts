/**
 * lib/appAuth.ts — the shared-password gate for the deployed app.
 *
 * The dashboard holds sleep, health and calendar data for one person and has no
 * user accounts, so "private" here means a single password in front of
 * everything rather than real multi-user auth.
 *
 * Everything in this file must run in BOTH the Edge middleware runtime and the
 * Node route handler, so it uses Web Crypto (`crypto.subtle`) — `node:crypto`
 * does not exist in Edge.
 *
 * The session cookie holds a SHA-256 digest of the password, never the password
 * itself: a leaked cookie grants access (as any session cookie does) but does
 * not hand over the secret you may have reused elsewhere.
 */

export const SESSION_COOKIE = 'ld_session';

/**
 * A short password behind a single unauthenticated POST endpoint on the public
 * internet is guessable. Serverless gives us nowhere reliable to keep a
 * rate-limit counter, so length is the mitigation that actually holds.
 *
 * ponytail: no login rate limiting or lockout — the ceiling is that this only
 * resists online guessing because the password is long and random. If this ever
 * grows past one user, replace the whole file with a real auth provider rather
 * than bolting attempt-counting onto it.
 */
export const MIN_PASSWORD_LENGTH = 16;

/** Domain separation, so the digest is not a bare sha256 of a reused password. */
const PREFIX = 'life-dashboard:v1:';

/** The cookie value proving knowledge of the password. */
export async function sessionToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(PREFIX + password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Length-independent comparison. The early length return is unavoidable and
 * leaks only the length, not the content.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Why the configured APP_PASSWORD cannot be used, or null if it is fine.
 *
 * Returning a reason rather than a boolean matters: a misconfigured gate must
 * fail closed with something readable in the response, not silently let
 * everyone in. Callers decide whether an unset password is acceptable — it is
 * on localhost, it is not on a deployment.
 */
export function passwordConfigError(password: string | undefined): string | null {
  if (!password) return 'APP_PASSWORD is not set, so the app has no lock on it.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `APP_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
