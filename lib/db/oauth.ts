/** lib/db/oauth.ts — the oauth_tokens table, one row per connector provider. */
import { getClient, type RawRow } from './client';

export interface OAuthTokenRow {
  /** Serialized token JSON — plaintext or AES-256-GCM ciphertext. */
  data: string;
  email: string | null;
  updated_at: string;
}

/** Returns the stored token row for a provider, or null if none. */
export async function getOAuthToken(provider: string): Promise<OAuthTokenRow | null> {
  const client = await getClient();
  const res = await client.execute({
    sql: 'SELECT data, email, updated_at FROM oauth_tokens WHERE provider = ?',
    args: [provider],
  });
  const row = res.rows[0] as RawRow | undefined;
  if (!row) return null;
  return {
    data: String(row.data),
    email: row.email === null || row.email === undefined ? null : String(row.email),
    updated_at: String(row.updated_at),
  };
}

/** Insert or overwrite a provider's token row (UPSERT on the provider PK). */
export async function setOAuthToken(provider: string, data: string, email: string | null): Promise<void> {
  const client = await getClient();
  await client.execute({
    sql: `INSERT INTO oauth_tokens (provider, data, email, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (provider) DO UPDATE SET
            data       = excluded.data,
            email      = excluded.email,
            updated_at = excluded.updated_at`,
    args: [provider, data, email ?? null, new Date().toISOString()],
  });
}

/** Delete a provider's token row (no-op if absent). */
export async function deleteOAuthToken(provider: string): Promise<void> {
  const client = await getClient();
  await client.execute({ sql: 'DELETE FROM oauth_tokens WHERE provider = ?', args: [provider] });
}
