/**
 * lib/db/metrics.ts — the metrics table.
 *
 * This module owns the storage <-> domain serialization for metrics: SQLite has
 * no boolean, so `active` lives as INTEGER 0/1 and is converted here and only
 * here.
 */
import type { InValue } from '@libsql/client';
import type { Metric } from '@/lib/types';
import { getClient, type RawRow } from './client';

interface MetricRow {
  id: string;
  name: string;
  emoji: string;
  unit: string;
  goal: number;
  goalDirection: string;
  step: number;
  max: number;
  active: number; // 0 | 1 in SQLite (may arrive as number|bigint)
  category: string;
  description: string | null;
}

function toMetricRow(r: RawRow): MetricRow {
  return {
    id: String(r.id),
    name: String(r.name),
    emoji: String(r.emoji),
    unit: String(r.unit),
    goal: Number(r.goal),
    goalDirection: String(r.goalDirection),
    step: Number(r.step),
    max: Number(r.max),
    active: Number(r.active),
    category: String(r.category),
    description: r.description === null || r.description === undefined ? null : String(r.description),
  };
}

function rowToMetric(r: MetricRow): Metric {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    unit: r.unit as Metric['unit'],
    goal: r.goal,
    goalDirection: r.goalDirection as Metric['goalDirection'],
    step: r.step,
    max: r.max,
    active: r.active === 1,
    category: r.category as Metric['category'],
    description: r.description ?? '',
  };
}

export async function listMetrics(): Promise<Metric[]> {
  const client = await getClient();
  const res = await client.execute('SELECT * FROM metrics ORDER BY rowid');
  return res.rows.map((r) => rowToMetric(toMetricRow(r as RawRow)));
}

export async function getMetricById(id: string): Promise<Metric | null> {
  const client = await getClient();
  const res = await client.execute({ sql: 'SELECT * FROM metrics WHERE id = ?', args: [id] });
  const row = res.rows[0];
  return row ? rowToMetric(toMetricRow(row as RawRow)) : null;
}

export async function createMetric(metric: Metric): Promise<Metric> {
  const client = await getClient();
  await client.execute({
    sql: `INSERT INTO metrics (id, name, emoji, unit, goal, goalDirection, step, "max", active, category, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      metric.id,
      metric.name,
      metric.emoji,
      metric.unit,
      metric.goal,
      metric.goalDirection,
      metric.step,
      metric.max,
      metric.active ? 1 : 0,
      metric.category,
      metric.description,
    ],
  });
  return (await getMetricById(metric.id)) as Metric;
}

export type MetricPatch = Partial<Omit<Metric, 'id'>>;

const METRIC_PATCH_COLUMNS: readonly (keyof Omit<Metric, 'id'>)[] = [
  'name',
  'emoji',
  'unit',
  'goal',
  'goalDirection',
  'step',
  'max',
  'active',
  'category',
  'description',
];

/** Applies a partial update; returns the updated Metric, or null if id is unknown. */
export async function updateMetric(id: string, patch: MetricPatch): Promise<Metric | null> {
  const existing = await getMetricById(id);
  if (!existing) return null;

  const sets: string[] = [];
  const args: InValue[] = [];
  for (const col of METRIC_PATCH_COLUMNS) {
    const value = patch[col];
    if (value === undefined) continue;
    sets.push(`"${col}" = ?`);
    args.push(typeof value === 'boolean' ? (value ? 1 : 0) : (value as InValue));
  }
  if (sets.length > 0) {
    const client = await getClient();
    args.push(id); // for the WHERE clause, appended last to match the trailing ?
    await client.execute({ sql: `UPDATE metrics SET ${sets.join(', ')} WHERE id = ?`, args });
  }
  return getMetricById(id);
}

/**
 * Permanently delete a metric and every entry recorded against it.
 * Returns false if the id is unknown.
 *
 * This is a genuine hard delete, distinct from setting active = false (which
 * stops tracking a metric but keeps its history). The entries are removed
 * first, in the same write batch, because entries.metricId is a foreign key
 * into metrics(id) — dropping the metric first would either fail or strand
 * unreachable rows that still count toward exports and correlations.
 */
export async function deleteMetric(id: string): Promise<boolean> {
  const existing = await getMetricById(id);
  if (!existing) return false;

  const client = await getClient();
  await client.batch(
    [
      { sql: 'DELETE FROM entries WHERE metricId = ?', args: [id] },
      { sql: 'DELETE FROM metrics WHERE id = ?', args: [id] },
    ],
    'write'
  );
  return true;
}
