// lib/streaks.ts — goal-hit and streak math for the Streaks tab.

import type { Entry, GoalDirection } from './types';
import { addDays, lastNDates, lastNWeeks, startOfWeek } from './dates';

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

/* ------------------------------------------------------------ weekly ----
 * A metric with a weeklyTarget is judged by the week, not the day. The goal
 * stays the per-day bar; the target is how many days in the week have to
 * clear it. Everything below counts in ISO weeks (Monday–Sunday), each named
 * by its Monday, which is the same week the Week tab and isoWeek() use.
 */

/** How many days of the week beginning `monday` cleared the goal. */
export function hitDaysInWeek(
  entries: Entry[],
  goal: number,
  dir: GoalDirection,
  monday: string,
): number {
  const byDate = valuesByDate(entries);
  let days = 0;
  for (let i = 0; i < 7; i++) {
    const value = byDate.get(addDays(monday, i));
    if (value !== undefined && meetsGoal(value, goal, dir)) days++;
  }
  return days;
}

/**
 * Consecutive weeks meeting the target, walking backward from the week that
 * contains `today`.
 *
 * The current week is treated the way streakDays treats today: it is still
 * running, so falling short of the target so far does NOT break the streak —
 * counting simply starts from last week instead. A week already at target
 * counts immediately. Without that, every weekly streak would read zero from
 * Monday until the moment the target was met, which is the exact discourage-
 * ment this cadence exists to remove.
 */
export function streakWeeks(
  entries: Entry[],
  goal: number,
  dir: GoalDirection,
  weeklyTarget: number,
  today: string,
): number {
  const met = (monday: string) => hitDaysInWeek(entries, goal, dir, monday) >= weeklyTarget;
  const current = startOfWeek(today);
  let week = met(current) ? current : addDays(current, -7);
  let streak = 0;
  while (met(week)) {
    streak++;
    week = addDays(week, -7);
  }
  return streak;
}

/**
 * Per-week hit status for the last n weeks ending with the current one,
 * ordered oldest → newest. The weekly counterpart of lastNDayHits, and the
 * same shape, so one grid renders both. `days` is carried for the tooltip:
 * "2 of 3 days" says more about a missed week than a blank square does.
 */
export function lastNWeekHits(
  entries: Entry[],
  goal: number,
  dir: GoalDirection,
  weeklyTarget: number,
  today: string,
  n = 14,
): { date: string; hit: boolean; logged: boolean; days: number }[] {
  return lastNWeeks(today, n).map((monday) => {
    const days = hitDaysInWeek(entries, goal, dir, monday);
    return { date: monday, hit: days >= weeklyTarget, logged: days > 0, days };
  });
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
