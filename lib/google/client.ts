/**
 * lib/google/client.ts — server-only Google OAuth2 client factory + token
 * persistence. This module touches process.env secrets and node:crypto and
 * must never be imported into a client component.
 *
 * Token lifecycle:
 *   - getAuthUrl()      builds the consent URL (offline + prompt=consent so a
 *                       refresh_token is always returned on first connect).
 *   - exchanged tokens are persisted via persistTokens() (called from the
 *     OAuth callback route).
 *   - getAuthedClient() loads the stored token, sets credentials, and registers
 *     a 'tokens' listener so googleapis' automatic refresh-on-API-call writes
 *     the refreshed access token back to the DB WITHOUT dropping the
 *     refresh_token (Google only returns the refresh_token once, on first
 *     consent — we must merge, never overwrite with a refresh-less payload).
 *
 * Encryption at rest: when TOKEN_ENCRYPTION_KEY (base64, 32 bytes) is set, the
 * token JSON is AES-256-GCM encrypted before storage. Otherwise it is stored as
 * plaintext (acceptable because data/ is gitignored) and we warn once.
 */
import crypto from 'node:crypto';
import { google } from 'googleapis';
import type { Auth } from 'googleapis';
import { getOAuthToken, setOAuthToken } from '@/lib/db';

// Server-only guard: this module reads secrets and uses node:crypto. If it is
// ever pulled into a client bundle the import will throw at module-eval time,
// failing loud instead of leaking credentials. (We don't use the `server-only`
// package because it isn't a resolvable dependency in this project.)
if (typeof window !== 'undefined') {
  throw new Error('lib/google/client.ts is server-only and must not be imported in the browser.');
}

const PROVIDER = 'google';

/**
 * OAuth scopes. NOTE on Gmail: we deliberately request gmail.READONLY, not
 * gmail.metadata. Gmail rejects the `q` search parameter (e.g.
 * `q=in:inbox after:YYYY/MM/DD`) under the metadata scope with a 403, and the
 * inbox-count sync depends on that date filter. readonly is the minimal scope
 * that allows a server-side `q` query. (calendar stays read-only.)
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'email',
];

/* ----------------------------------------------------------------- config */

export function isConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );
}

/** Builds a fresh OAuth2 client from env credentials. Throws if unconfigured. */
export function makeOAuthClient(): Auth.OAuth2Client {
  if (!isConfigured()) {
    throw new Error('Google is not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env.local');
  }
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/** Consent URL. offline + prompt=consent guarantees a refresh_token. */
export function getAuthUrl(): string {
  return makeOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    include_granted_scopes: true,
  });
}

/* ------------------------------------------------------ encryption helpers */

let warnedPlaintext = false;

function getEncryptionKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new Error('TOKEN_ENCRYPTION_KEY is not valid base64.');
  }
  if (key.length !== 32) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
  }
  return key;
}

// Stored ciphertext format: "v1:<iv b64>:<authTag b64>:<ciphertext b64>".
// The "v1:" prefix lets decrypt() distinguish ciphertext from legacy plaintext.
const CIPHER_PREFIX = 'v1:';

/** Serialize a token object to a storable string, encrypting if a key is set. */
export function encryptTokenJson(tokens: Auth.Credentials): string {
  const plaintext = JSON.stringify(tokens);
  const key = getEncryptionKey();
  if (!key) {
    if (!warnedPlaintext) {
      // eslint-disable-next-line no-console
      console.warn(
        '[google] TOKEN_ENCRYPTION_KEY not set — OAuth tokens are stored UNENCRYPTED in data/life-dashboard.db (gitignored). Set TOKEN_ENCRYPTION_KEY to encrypt at rest.'
      );
      warnedPlaintext = true;
    }
    return plaintext;
  }
  const iv = crypto.randomBytes(12); // 96-bit nonce, standard for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${CIPHER_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/** Inverse of encryptTokenJson. Throws on tamper / wrong key / bad format. */
export function decryptTokenJson(stored: string): Auth.Credentials {
  if (!stored.startsWith(CIPHER_PREFIX)) {
    // Legacy / plaintext path (no key configured when it was written).
    return JSON.parse(stored) as Auth.Credentials;
  }
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('Stored Google token is encrypted but TOKEN_ENCRYPTION_KEY is not set. Restore the key or reconnect Google.');
  }
  const parts = stored.slice(CIPHER_PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Stored Google token is malformed.');
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext) as Auth.Credentials;
}

/* ---------------------------------------------------------- token storage */

/**
 * Persist tokens for the google provider, merging with anything already stored
 * so we never drop the refresh_token. `email` is updated only when provided
 * (refresh callbacks don't carry it). NEVER logs token contents.
 */
export async function persistTokens(tokens: Auth.Credentials, email?: string | null): Promise<void> {
  let merged: Auth.Credentials = tokens;
  const existing = await getOAuthToken(PROVIDER);
  let existingEmail: string | null = existing?.email ?? null;
  if (existing) {
    try {
      const prev = decryptTokenJson(existing.data);
      // Incoming refresh payloads usually omit refresh_token — keep the old one.
      merged = { ...prev, ...tokens };
      if (!merged.refresh_token && prev.refresh_token) {
        merged.refresh_token = prev.refresh_token;
      }
    } catch {
      // If the old blob can't be read (e.g. key changed), fall back to the new
      // tokens as-is rather than failing the whole sign-in/refresh.
      merged = tokens;
    }
  }
  const finalEmail = email !== undefined && email !== null ? email : existingEmail;
  await setOAuthToken(PROVIDER, encryptTokenJson(merged), finalEmail);
}

/**
 * Load the stored token, build an authed OAuth2 client, and wire up automatic
 * persistence of refreshed tokens. Returns null if no token is stored (i.e. the
 * connector is configured but not connected). May throw if decryption fails —
 * callers should surface that as a connector 'error' state.
 */
export async function getAuthedClient(): Promise<Auth.OAuth2Client | null> {
  const stored = await getOAuthToken(PROVIDER);
  if (!stored) return null;

  const client = makeOAuthClient();
  const credentials = decryptTokenJson(stored.data);
  client.setCredentials(credentials);

  // googleapis auto-refreshes the access token on an API call when a
  // refresh_token is present; this listener writes the new access token (and
  // any rotated refresh_token) back to the DB. Merge logic in persistTokens
  // guarantees the refresh_token is never lost.
  //
  // The listener is synchronous (googleapis fires it internally and does not
  // await it), so persistTokens — now async — runs fire-and-forget; we attach a
  // .catch() so a persistence failure can never crash an in-flight API request
  // or surface as an unhandled rejection. The refreshed token still lives in
  // memory on this client instance regardless.
  client.on('tokens', (refreshed) => {
    void persistTokens(refreshed).catch(() => {
      /* swallow: see comment above */
    });
  });

  return client;
}

/** Resolve the connected account's email via the OAuth2 userinfo endpoint. */
export async function fetchAccountEmail(client: Auth.OAuth2Client): Promise<string | null> {
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const me = await oauth2.userinfo.get();
    return me.data.email ?? null;
  } catch {
    return null;
  }
}
