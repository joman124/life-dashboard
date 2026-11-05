// lib/streakRisk.ts — which streaks break tonight if nothing else is logged.
//
// A daily streak counts consecutive days meeting the goal. An unlogged `today`
// does NOT break it yet (streakDays skips today and counts from yesterday) — but
// if the day ends with no entry, tomorrow reads today as a miss and the streak
// is gone. That gap between "still alive" and "about to die" is the whole reason
// for an evening nudge: it turns a silent break into a deliberate skip.
//
// Weekly metrics (weeklyTarget !== null) are excluded on purpose: one missing
// day cannot put a week-judged streak at risk, so there is nothing to warn about.

import type { Entry, Metric } from './types';
import { streakDays } from './streaks';

export interface StreakRisk {
  id: string;
  name: string;
  emoji: string;
  /** Length of the streak that is on the line, counting through yesterday. */
  streak: number;
  /** Ready-to-send copy, e.g. "🧠 Deep Work streak at risk — you haven't logged today." */
  message: string;
}

function entriesByMetric(entries: Entry[]): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = map.get(e.metricId);
    if (list) list.push(e);
    else map.set(e.metricId, [e]);
  }
  return map;
}

/**
 * Active daily metrics that are on a streak but have no entry for `today`.
 * `entries` may span every metric; it is grouped internally.
 */
export function atRiskStreaks(metrics: Metric[], entries: Entry[], today: string): StreakRisk[] {
  const byMetric = entriesByMetric(entries);
  const out: StreakRisk[] = [];

  for (const m of metrics) {
    if (!m.active || m.weeklyTarget !== null) continue;

    const mine = byMetric.get(m.id) ?? [];
    // Already logged today → not at risk, whether it hit the goal or not.
    if (mine.some((e) => e.date === today)) continue;

    const streak = streakDays(mine, m.goal, m.goalDirection, today);
    if (streak <= 0) continue;

    out.push({
      id: m.id,
      name: m.name,
      emoji: m.emoji,
      streak,
      message: `${m.emoji} ${m.name} streak at risk — you haven't logged today.`,
    });
  }

  return out;
}
