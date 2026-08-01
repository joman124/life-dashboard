/**
 * lib/db/bulk.ts — whole-database operations that span more than one table:
 * restoring an export, and clearing logged history.
 */
import type { InValue } from '@libsql/client';
import type { Entry, Metric } from '@/lib/types';
import { getClient } from './client';

export interface ImportCounts {
  metrics: number;
  entries: number;
}

/**
 * Restore an exported payload.
 *
 * `replace` wipes all entries and metrics first, so the result is exactly the
 * file. `merge` keeps anything the file does not mention and overwrites what it
 * does — metrics upsert on id, entries upsert on (metricId, date).
 *
 * Everything goes out as one libSQL write batch, which is atomic: a restore
 * either lands completely or not at all. A half-applied import is the worst
 * possible outcome here, because the user reaches for import precisely when
 * their data is already in a bad state.
 */
export async function importData(
  metrics: Metric[],
  entries: Entry[],
  mode: 'merge' | 'replace'
): Promise<ImportCounts> {
  const client = await getClient();
  const statements: { sql: string; args: InValue[] }[] = [];

  if (mode === 'replace') {
    // Entries first — entries.metricId references metrics(id).
    statements.push({ sql: 'DELETE FROM entries', args: [] });
    statements.push({ sql: 'DELETE FROM metrics', args: [] });
  }

  for (const m of metrics) {
    statements.push({
      sql: `INSERT INTO metrics (id, name, emoji, unit, goal, goalDirection, step, "max", active, category, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
              name          = excluded.name,
              emoji         = excluded.emoji,
              unit          = excluded.unit,
              goal          = excluded.goal,
              goalDirection = excluded.goalDirection,
              step          = excluded.step,
              "max"         = excluded."max",
              active        = excluded.active,
              category      = excluded.category,
              description   = excluded.description`,
      args: [
        m.id,
        m.name,
        m.emoji,
        m.unit,
        m.goal,
        m.goalDirection,
        m.step,
        m.max,
        m.active ? 1 : 0,
        m.category,
        m.description,
      ],
    });
  }

  for (const e of entries) {
    statements.push({
      sql: `INSERT INTO entries (metricId, date, value) VALUES (?, ?, ?)
            ON CONFLICT (metricId, date) DO UPDATE SET value = excluded.value`,
      args: [e.metricId, e.date, e.value],
    });
  }

  await client.batch(statements, 'write');
  return { metrics: metrics.length, entries: entries.length };
}

/**
 * Delete all logged history — every entry and every timeline row — while
 * leaving the metric definitions in place.
 *
 * This is what clears the 30-day demo seed so a real dashboard is not reporting
 * streaks and correlations derived from generated numbers. Metrics survive
 * because the user's chosen set of things to track is configuration, not data.
 * Returns how many entries were removed.
 */
export async function clearAllHistory(): Promise<number> {
  const client = await getClient();
  const count = (await client.execute('SELECT COUNT(*) AS n FROM entries')).rows[0]?.n;
  await client.batch(['DELETE FROM entries', 'DELETE FROM timeline'], 'write');
  return Number(count ?? 0);
}
