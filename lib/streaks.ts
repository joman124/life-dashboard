// lib/streaks.ts — goal-hit and streak math for the Streaks tab.

import type { Entry, GoalDirection } from './types';
import { addDays, lastNDates } from './dates';

/** Does a logged value satisfy the goal for the given direction? */
export function meetsGoal(value: number, goal: number, dir: GoalDirection): boolean {
  return dir === '>=' ? value >= goal : value <= goal;
}

function valuesByDate(entries: Entry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.date, e.value);
  return map;
}

/**
 * Consecutive days meeting the goal, walking backward from `today`.
 * `entries` must all belong to a single metric.
 *
 * Today is optional: if today has no entry yet it is skipped — an unlogged
 * today does NOT break the streak — and counting starts from yesterday.
 * If today IS logged and meets the goal, it counts. Any earlier day that is
 * unlogged, or logged but missing the goal, breaks the streak.
 */
export function streakDays(
  entries: Entry[],
  goal: number,
  dir: GoalDirection,
  today: string,
): number {
  const byDate = valuesByDate(entries);
  let day = byDate.has(today) ? today : addDays(today, -1);
  let streak = 0;
  for (;;) {
    const value = byDate.get(day);
    if (value === undefined || !meetsGoal(value, goal, dir)) break;
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

/**
 * Per-day hit/logged status for the last n days ending at `today`,
 * ordered oldest → newest. Drives the 14-day streak grid.
 */
export function lastNDayHits(
  entries: Entry[],
  goal: number,
  dir: GoalDirection,
  today: string,
  n = 14,
): { date: string; hit: boolean; logged: boolean }[] {
  const byDate = valuesByDate(entries);
  return lastNDates(today, n).map((date) => {
    const value = byDate.get(date);
    if (value === undefined) return { date, hit: false, logged: false };
    return { date, hit: meetsGoal(value, goal, dir), logged: true };
  });
}
