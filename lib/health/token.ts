/**
 * lib/health/token.ts — server-only bearer-token management for the Apple
 * Health push webhook (/api/health-import).
 *
 * The token is the single shared secret an iOS Shortcut presents to prove a
 * POST is authorized. It is generated lazily on first read, persisted in the
 * existing sync_state table (key 'health_import_token') via the standard
 * getSyncValue/setSyncValue helpers, and compared in constant time.
 *
 * This module uses node:crypto and reads/writes the DB, so it must never be
 * imported into a client bundle. We guard with a typeof-window check (the same
 * approach as lib/google/client.ts) because the `server-only` package is not a
 * dependency in this project. Token values are NEVER logged.
 */
import crypto from 'node:crypto';
import { getSyncValue, setSyncValue } from '@/lib/db';

if (typeof window !== 'undefined') {
  throw new Error('lib/health/token.ts is server-only and must not be imported in the browser.');
}

const TOKEN_KEY = 'health_import_token';

/** Generate a fresh URL-safe token (~32 chars from 24 random bytes). */
function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Return the stored health-import token, generating and persisting one on first
 * use. Idempotent: once created, subsequent calls return the same value.
 */
export async function getOrCreateHealthToken(): Promise<string> {
  const existing = await getSyncValue(TOKEN_KEY);
  if (existing) return existing;
  const token = generateToken();
  await setSyncValue(TOKEN_KEY, token);
  return token;
}

/** Generate a brand-new token, persist it (replacing any old one), and return it. */
export async function rotateHealthToken(): Promise<string> {
  const token = generateToken();
  await setSyncValue(TOKEN_KEY, token);
  return token;
}

/**
 * Constant-time comparison of a presented token against the stored one.
 * Returns false if no token is stored or the lengths differ (timingSafeEqual
 * throws on unequal-length buffers, so we length-check first — this short-
 * circuit is unavoidable and does not leak the secret's content).
 */
export async function verifyHealthToken(presented: string): Promise<boolean> {
  const stored = await getSyncValue(TOKEN_KEY);
  if (!stored) return false;

  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
