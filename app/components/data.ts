// app/components/data.ts — pure client-side derivations over fetched data.
// Only imports the pure lib modules (never lib/db).

import type { Entry, GoalDirection, Metric } from '@/lib/types';
import { assessGoals, goalScore } from '@/lib/feedback';
import { meetsGoal } from '@/lib/streaks';

/** Entries belonging to one metric. */
export function entriesFor(entries: Entry[], metricId: string): Entry[] {
  return entries.filter((e) => e.metricId === metricId);
}

/** date → value lookup for one metric. */
export function valueMap(entries: Entry[], metricId: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) if (e.metricId === metricId) map.set(e.date, e.value);
  return map;
}

/** Values for the given dates, skipping unlogged days. */
export function loggedValues(map: Map<string, number>, dates: string[]): number[] {
  const out: number[] = [];
  for (const d of dates) {
    const v = map.get(d);
    if (v !== undefined) out.push(v);
  }
  return out;
}

/** Per-date series for charts; null where unlogged. */
export function seriesFor(map: Map<string, number>, dates: string[]): (number | null)[] {
  return dates.map((d) => map.get(d) ?? null);
}

export function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Legacy numeric score helper. Sparse daily metrics and unfinished weekly
 * habits are excluded. New views use goalScore directly to preserve null when
 * nothing can yet be assessed.
 */
export function weeklyScore(metrics: Metric[], entries: Entry[], today: string): number {
  return goalScore(assessGoals(metrics, entries, today)) ?? 0;
}

/**
 * Progress toward goal for the thin gold bar (0–100).
 * '>=': min(100, value/goal×100).
 * '<=': 100 while value ≤ goal, else shrinks: max(0, 100 − (value−goal)/goal×100).
 * Unlogged → 0.
 */
export function progressPct(value: number | null, goal: number, dir: GoalDirection): number {
  if (value === null) return 0;
  if (goal <= 0) return meetsGoal(value, goal, dir) ? 100 : 0;
  if (dir === '>=') return Math.min(100, (value / goal) * 100);
  return value <= goal ? 100 : Math.max(0, 100 - ((value - goal) / goal) * 100);
}
