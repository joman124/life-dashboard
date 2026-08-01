/** lib/db/timeline.ts — the timeline table (dated events, manual or synced). */
import type { InValue } from '@libsql/client';
import type { TimelineItem } from '@/lib/types';
import { getClient, type RawRow } from './client';

interface TimelineRow {
  id: number;
  date: string;
  time: string;
  title: string;
  detail: string | null;
  source: string | null;
}

function toTimelineRow(r: RawRow): TimelineRow {
  return {
    id: Number(r.id),
    date: String(r.date),
    time: String(r.time),
    title: String(r.title),
    detail: r.detail === null || r.detail === undefined ? null : String(r.detail),
    source: r.source === null || r.source === undefined ? null : String(r.source),
  };
}

function rowToTimelineItem(r: TimelineRow): TimelineItem {
  return {
    id: r.id,
    date: r.date,
    time: r.time,
    title: r.title,
    detail: r.detail ?? '',
    source: r.source === 'calendar' || r.source === 'manual' ? r.source : null,
  };
}

export async function listTimelineForDate(date: string): Promise<TimelineItem[]> {
  const client = await getClient();
  const res = await client.execute({
    sql: 'SELECT id, date, time, title, detail, source FROM timeline WHERE date = ? ORDER BY time, id',
    args: [date],
  });
  return res.rows.map((r) => rowToTimelineItem(toTimelineRow(r as RawRow)));
}

/* ------------------------------------------------ timeline writes (sync use) */

/** A timeline row to insert; id/date/time/title/detail/source minus the PK. */
export interface TimelineInsert {
  date: string;
  time: string;
  title: string;
  detail: string;
  source: string;
}

/** Delete all timeline rows for a given date + source (e.g. one day's calendar). */
export async function deleteTimelineBySource(date: string, source: string): Promise<void> {
  const client = await getClient();
  await client.execute({
    sql: 'DELETE FROM timeline WHERE date = ? AND source = ?',
    args: [date, source],
  });
}

/** Bulk-insert timeline rows in a single transaction (one write batch). */
export async function insertTimelineItems(items: TimelineInsert[]): Promise<void> {
  if (items.length === 0) return;
  const client = await getClient();
  await client.batch(
    items.map((r) => ({
      sql: 'INSERT INTO timeline (date, time, title, detail, source) VALUES (?, ?, ?, ?, ?)',
      args: [r.date, r.time, r.title, r.detail, r.source] as InValue[],
    })),
    'write'
  );
}

/**
 * Idempotently replace today's calendar timeline: delete every source='calendar'
 * row for `date`, then insert the provided items (forced to source='calendar').
 * Issued as one write batch so a re-sync never leaves a partial/duplicated day.
 */
export async function replaceCalendarTimeline(
  date: string,
  items: Omit<TimelineInsert, 'source'>[]
): Promise<void> {
  const client = await getClient();
  const statements = [
    {
      sql: 'DELETE FROM timeline WHERE date = ? AND source = ?',
      args: [date, 'calendar'] as InValue[],
    },
    ...items.map((r) => ({
      sql: 'INSERT INTO timeline (date, time, title, detail, source) VALUES (?, ?, ?, ?, ?)',
      args: [r.date, r.time, r.title, r.detail, 'calendar'] as InValue[],
    })),
  ];
  await client.batch(statements, 'write');
}
