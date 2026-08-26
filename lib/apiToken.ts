/**
 * lib/apiToken.ts — shared bearer tokens for the endpoints that authenticate
 * themselves rather than sitting behind the app's password gate.
 *
 * Two callers need this, for the same reason: a client that cannot log in.
 * The iOS Shortcut pushing Apple Health data cannot hold a session cookie, and
 * neither can the Cowork morning brief fetching /api/brief. Both present a
 * long random token instead, and both are exempt in middleware.ts because of it.
 *
 * Each token is stored under its own key in the existing sync_state table, so
 * rotating one never disturbs the other — losing the health import because you
 * re-issued a read token would be a nasty surprise. Comparison is constant
 * time. Token values are NEVER logged.
 *
 * Server-only: this uses node:crypto and touches the database. Guarded with a
 * typeof-window check (the same approach as lib/google/client.ts) because the
 * `server-only` package is not a dependency here.
 */
import crypto from 'node:crypto';
import { getSyncValue, setSyncValue } from '@/lib/db';

if (typeof window !== 'undefined') {
  throw new Error('lib/apiToken.ts is server-only and must not be imported in the browser.');
}

/** Generate a fresh URL-safe token (~32 chars from 24 random bytes). */
function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Return the token stored under `key`, generating and persisting one on first
 * use. Idempotent: once created, later calls return the same value, because
 * these tokens live in a Shortcut and a scheduled task that would silently
 * break if reading the token re-issued it.
 */
export async function getOrCreateToken(key: string): Promise<string> {
  const existing = await getSyncValue(key);
  if (existing) return existing;
  const token = generateToken();
  await setSyncValue(key, token);
  return token;
}

/** Issue a new token under `key`, replacing and immediately invalidating the old one. */
export async function rotateToken(key: string): Promise<string> {
  const token = generateToken();
  await setSyncValue(key, token);
  return token;
}

/**
 * Constant-time comparison of a presented token against the one stored under
 * `key`. Returns false when nothing is stored (fail closed) or the lengths
 * differ — timingSafeEqual throws on unequal-length buffers, so the length
 * check has to come first, and it leaks only the length, never the content.
 */
export async function verifyToken(key: string, presented: string): Promise<boolean> {
  const stored = await getSyncValue(key);
  if (!stored) return false;

  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * The token a request is presenting, or null.
 *
 * `Authorization: Bearer <token>` is preferred and tried first. `?token=` is
 * the fallback for callers that cannot set headers — the iOS Shortcuts "Get
 * Contents of URL" action in some configurations, and web-fetch tools generally.
 * Both are supported because refusing the query form would mean refusing the
 * only shape those clients can send.
 */
export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  const qp = new URL(req.url).searchParams.get('token');
  return qp && qp.length > 0 ? qp : null;
}
