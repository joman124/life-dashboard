/**
 * lib/weeklyFocus.ts — the one line of intention for the week, and how the
 * week is going against it.
 *
 * Pure (no database import) so client components can use it; the sync_state
 * read/write lives in lib/weeklyFocusStore.ts.
 */
import type { Entry, Metric } from '@/lib/types';
import { lastNDates } from '@/lib/dates';
import { meetsGoal } from '@/lib/streaks';

/** Longer than any real one-line intention; a cap so storage stays bounded. */
export const MAX_FOCUS_LEN = 280;

/** What we actually persist: a trimmed, length-capped string ('' clears it). */
export function normalizeFocus(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, MAX_FOCUS_LEN);
}

/* ------------------------------------------------------- focus scorecard ---
 * How the week is going against the focus, by plain arithmetic — no model, so
 * the same entries always produce the same line.
 *
 * The focus is free text, so the metrics it is about are the active ones whose
 * name (or id, hyphens read as spaces) appears in it, case-insensitively. When
 * it names none, the whole active set stands in and the line says so.
 *
 * Window: the trailing 7 days, the same week the Week tab scorecard and the
 * brief's week-to-date read use. A daily metric is on track when its average
 * over the logged days meets the goal; a weekly one (weeklyTarget) when enough
 * days in the window cleared the goal. Nothing logged counts as behind.
 */

export interface FocusScorecard {
  status: 'on-track' | 'behind';
  /** The one-line verdict, safe to show or quote verbatim. */
  text: string;
  /** True when the focus text named at least one tracked metric. */
  matched: boolean;
  /** Metrics judged, and the ones behind (ids, in metric order). */
  metricIds: string[];
  behindIds: string[];
}

function mentions(focus: string, m: Metric): boolean {
  const text = focus.toLowerCase();
  return [m.name, m.id.replace(/-/g, ' ')].some((n) => {
    const needle = n.trim().toLowerCase();
    return needle !== '' && text.includes(needle);
  });
}

function onTrack(m: Metric, entries: Entry[], dates: string[]): boolean {
  const inWindow = new Set(dates);
  const values = entries
    .filter((e) => e.metricId === m.id && inWindow.has(e.date))
    .map((e) => e.value);
  if (values.length === 0) return false;
  if (m.weeklyTarget !== null) {
    return values.filter((v) => meetsGoal(v, m.goal, m.goalDirection)).length >= m.weeklyTarget;
  }
  const average = values.reduce((s, v) => s + v, 0) / values.length;
  return meetsGoal(average, m.goal, m.goalDirection);
}

function listNames(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** null when there is no focus set or no active metric to judge it by. */
export function focusScorecard(
  focus: string,
  metrics: Metric[],
  entries: Entry[],
  today: string,
): FocusScorecard | null {
  const active = metrics.filter((m) => m.active);
  if (focus.trim() === '' || active.length === 0) return null;

  const named = active.filter((m) => mentions(focus, m));
  const matched = named.length > 0;
  const judged = matched ? named : active;
  const dates = lastNDates(today, 7);
  const behind = judged.filter((m) => !onTrack(m, entries, dates));
  const met = judged.length - behind.length;
  const scope = matched ? '' : ' (focus names no tracked metric, so all are counted)';

  const text =
    behind.length === 0
      ? `On track — ${listNames(judged.map((m) => m.name))} at goal this week${scope}.`
      : `Behind — ${listNames(behind.map((m) => m.name))} short of goal this week; ` +
        `${met} of ${judged.length} on track${scope}.`;

  return {
    status: behind.length === 0 ? 'on-track' : 'behind',
    text,
    matched,
    metricIds: judged.map((m) => m.id),
    behindIds: behind.map((m) => m.id),
  };
}
