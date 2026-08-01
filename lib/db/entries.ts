/** lib/db/entries.ts — the entries table (one logged value per metric per day). */
import type { Entry } from '@/lib/types';
import { getClient, type RawRow } from './client';

interface EntryRow {
  metricId: string;
  date: string;
  value: number;
}

function toEntryRow(r: RawRow): EntryRow {
  return {
    metricId: String(r.metricId),
    date: String(r.date),
    value: Number(r.value),
  };
}

function rowToEntry(r: EntryRow): Entry {
  return { metricId: r.metricId, date: r.date, value: r.value };
}

export async function listEntriesBetween(startDate: string, endDate: string): Promise<Entry[]> {
  const client = await getClient();
  const res = await client.execute({
    sql: 'SELECT metricId, date, value FROM entries WHERE date >= ? AND date <= ? ORDER BY date, metricId',
    args: [startDate, endDate],
  });
  return res.rows.map((r) => rowToEntry(toEntryRow(r as RawRow)));
}

export async function listAllEntries(): Promise<Entry[]> {
  const client = await getClient();
  const res = await client.execute('SELECT metricId, date, value FROM entries ORDER BY date, metricId');
  return res.rows.map((r) => rowToEntry(toEntryRow(r as RawRow)));
}

/** Insert or overwrite the value for (metricId, date) — UNIQUE upsert per spec. */
export async function upsertEntry(metricId: string, date: string, value: number): Promise<Entry> {
  const client = await getClient();
  await client.execute({
    sql: `INSERT INTO entries (metricId, date, value) VALUES (?, ?, ?)
          ON CONFLICT (metricId, date) DO UPDATE SET value = excluded.value`,
    args: [metricId, date, value],
  });
  return { metricId, date, value };
}
