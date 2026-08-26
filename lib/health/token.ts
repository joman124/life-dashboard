/**
 * lib/health/token.ts — the bearer token for the Apple Health push webhook
 * (/api/health-import).
 *
 * The token is the single shared secret an iOS Shortcut presents to prove a
 * POST is authorized. Storage, generation and constant-time comparison live in
 * lib/apiToken.ts, which the Cowork brief token shares; this module only pins
 * the sync_state key so the two tokens rotate independently.
 */
import { getOrCreateToken, rotateToken, verifyToken } from '@/lib/apiToken';

const TOKEN_KEY = 'health_import_token';

/** The stored health-import token, generated and persisted on first use. */
export function getOrCreateHealthToken(): Promise<string> {
  return getOrCreateToken(TOKEN_KEY);
}

/** Issue a new token, invalidating the previous one immediately. */
export function rotateHealthToken(): Promise<string> {
  return rotateToken(TOKEN_KEY);
}

/** Constant-time check of a token presented by a Shortcut. */
export function verifyHealthToken(presented: string): Promise<boolean> {
  return verifyToken(TOKEN_KEY, presented);
}
