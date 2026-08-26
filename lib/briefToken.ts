/**
 * lib/briefToken.ts — the bearer token for the read-only brief endpoint
 * (/api/brief), which the Cowork morning brief fetches each weekday morning.
 *
 * Separate from the Apple Health token on purpose. That one is a WRITE
 * credential held by a phone; this one is a READ credential held by a scheduled
 * Claude task. They have different blast radii and different reasons to be
 * re-issued, so they are stored under different keys and rotate independently.
 *
 * Storage, generation and constant-time comparison are shared — see
 * lib/apiToken.ts.
 */
import { getOrCreateToken, rotateToken, verifyToken } from '@/lib/apiToken';

const TOKEN_KEY = 'brief_read_token';

/** The stored brief token, generated and persisted on first use. */
export function getOrCreateBriefToken(): Promise<string> {
  return getOrCreateToken(TOKEN_KEY);
}

/** Issue a new token, invalidating the previous one immediately. */
export function rotateBriefToken(): Promise<string> {
  return rotateToken(TOKEN_KEY);
}

/** Constant-time check of a token presented to /api/brief. */
export function verifyBriefToken(presented: string): Promise<boolean> {
  return verifyToken(TOKEN_KEY, presented);
}
