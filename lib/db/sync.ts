/** lib/db/sync.ts — the sync_state key/value table (last sync time, inbox count). */
import { getClient, type RawRow } from './client';

export async function getSyncValue(key: string): Promise<string | null> {
  const client = await getClient();
  const res = await client.execute({ sql: 'SELECT value FROM sync_state WHERE key = ?', args: [key] });
  const row = res.rows[0];
  if (!row) return null;
  const v = (row as RawRow).value;
  return v === null || v === undefined ? null : String(v);
}

/** Insert or overwrite a sync_state value (UPSERT on the key PK). */
export async function setSyncValue(key: string, value: string): Promise<void> {
  const client = await getClient();
  await client.execute({
    sql: `INSERT INTO sync_state (key, value) VALUES (?, ?)
          ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  });
}

/** Delete a sync_state row (no-op if the key is absent). */
export async function deleteSyncValue(key: string): Promise<void> {
  const client = await getClient();
  await client.execute({ sql: 'DELETE FROM sync_state WHERE key = ?', args: [key] });
}
