import { describe, expect, test } from 'vitest';
import {
  hitDaysInWeek,
  lastNDayHits,
  lastNWeekHits,
  meetsGoal,
  streakDays,
  streakWeeks,
} from '@/lib/streaks';
import { addDays } from '@/lib/dates';
import type { Entry } from '@/lib/types';

const TODAY = '2026-06-30';

/** Entries for consecutive days ending at `end` (oldest first). */
function series(values: number[], end = TODAY, metricId = 'm'): Entry[] {
  const n = values.length;
  return values.map((value, i) => ({
    metricId,
    date: addDays(end, -(n - 1 - i)),
    value,
  }));
}

describe('meetsGoal', () => {
  test('">=" is satisfied at or above the goal', () => {
    expect(meetsGoal(8, 7.5, '>=')).toBe(true);
    expect(meetsGoal(7.5, 7.5, '>=')).toBe(true);
    expect(meetsGoal(7.4, 7.5, '>=')).toBe(false);
  });

  test('"<=" is satisfied at or below the goal', () => {
    // Phone pickups: fewer is better, and hitting the cap exactly still counts.
    expect(meetsGoal(40, 50, '<=')).toBe(true);
    expect(meetsGoal(50, 50, '<=')).toBe(true);
    expect(meetsGoal(51, 50, '<=')).toBe(false);
  });

  test('handles zero and negative values', () => {
    expect(meetsGoal(0, 0, '>=')).toBe(true);
    expect(meetsGoal(0, 50, '<=')).toBe(true);
    expect(meetsGoal(-1, 0, '>=')).toBe(false);
  });
});

describe('streakDays', () => {
  test('counts consecutive goal-hitting days back from today', () => {
    const entries = series([8, 8, 8], TODAY);
    expect(streakDays(entries, 7.5, '>=', TODAY)).toBe(3);
  });

  test('does NOT break the streak when today is simply unlogged', () => {
    // The core rule: it is 9am and you have not logged yet. Yesterday and the
    // day before both hit, so the streak is 2 — not 0.
    const entries = series([8, 8], addDays(TODAY, -1));
    expect(streakDays(entries, 7.5, '>=', TODAY)).toBe(2);
  });

  test('counts today when today is logged and hits', () => {
    const entries = series([8, 8, 8], TODAY);
    expect(streakDays(entries, 7.5, '>=', TODAY)).toBe(3);
  });

  test('breaks at zero when today is logged and misses', () => {
    // A logged miss today is a real miss — unlike an absent entry.
    const entries = series([8, 8, 5], TODAY);
    expect(streakDays(entries, 7.5, '>=', TODAY)).toBe(0);
  });

  test('stops at the first missed day', () => {
    const entries = series([8, 8, 5, 8, 8], TODAY);
    expect(streakDays(entries, 7.5, '>=', TODAY)).toBe(2);
  });

  test('stops at a gap in logging before today', () => {
    // Logged today and yesterday, then a missing day, then more hits. Only the
    // unbroken run of 2 counts.
    const entries: Entry[] = [
      { metricId: 'm', date: TODAY, value: 8 },
      { metricId: 'm', date: addDays(TODAY, -1), value: 8 },
      // addDays(TODAY, -2) deliberately absent
      { metricId: 'm', date: addDays(TODAY, -3), value: 8 },
      { metricId: 'm', date: addDays(TODAY, -4), value: 8 },
    ];
    expect(streakDays(entries, 7.5, '>=', TODAY)).toBe(2);
  });

  test('returns 0 when there are no entries at all', () => {
    expect(streakDays([], 7.5, '>=', TODAY)).toBe(0);
  });

  test('returns 0 when the most recent logged day missed', () => {
    const entries = series([8, 8, 5], addDays(TODAY, -1));
    expect(streakDays(entries, 7.5, '>=', TODAY)).toBe(0);
  });

  test('works for a "<=" metric', () => {
    // Phone pickups under 50 for three days running.
    const entries = series([40, 45, 30], TODAY);
    expect(streakDays(entries, 50, '<=', TODAY)).toBe(3);
  });

  test('breaks a "<=" streak when the value goes over', () => {
    const entries = series([40, 80, 30], TODAY);
    expect(streakDays(entries, 50, '<=', TODAY)).toBe(1);
  });

  test('counts a long unbroken run', () => {
    const entries = series(Array(30).fill(8), TODAY);
    expect(streakDays(entries, 7.5, '>=', TODAY)).toBe(30);
  });

  test('ignores entries dated after today', () => {
    const entries: Entry[] = [
      { metricId: 'm', date: addDays(TODAY, 1), value: 8 },
      { metricId: 'm', date: TODAY, value: 8 },
      { metricId: 'm', date: addDays(TODAY, -1), value: 8 },
    ];
    // Counting starts at today and walks backward, so the future day is never
    // visited and cannot inflate the streak.
    expect(streakDays(entries, 7.5, '>=', TODAY)).toBe(2);
  });
});

describe('lastNDayHits', () => {
  test('returns n days, oldest first, ending at today', () => {
    const hits = lastNDayHits(series([8, 8, 8], TODAY), 7.5, '>=', TODAY, 14);
    expect(hits).toHaveLength(14);
    expect(hits[hits.length - 1].date).toBe(TODAY);
    expect(hits[0].date).toBe(addDays(TODAY, -13));
  });

  test('defaults to a 14-day window', () => {
    expect(lastNDayHits([], 7.5, '>=', TODAY)).toHaveLength(14);
  });

  test('marks unlogged days as neither logged nor hit', () => {
    const hits = lastNDayHits([], 7.5, '>=', TODAY, 3);
    expect(hits.every((h) => h.logged === false && h.hit === false)).toBe(true);
  });

  test('distinguishes a logged miss from an unlogged day', () => {
    // This is the distinction the streak grid renders differently: a logged
    // miss is a real data point, an unlogged day is absence of data.
    const entries: Entry[] = [{ metricId: 'm', date: TODAY, value: 5 }];
    const hits = lastNDayHits(entries, 7.5, '>=', TODAY, 2);

    expect(hits[0]).toMatchObject({ logged: false, hit: false });
    expect(hits[1]).toMatchObject({ date: TODAY, logged: true, hit: false });
  });

  test('marks a logged hit as both logged and hit', () => {
    const entries: Entry[] = [{ metricId: 'm', date: TODAY, value: 9 }];
    const hits = lastNDayHits(entries, 7.5, '>=', TODAY, 1);
    expect(hits[0]).toMatchObject({ date: TODAY, logged: true, hit: true });
  });

  test('applies "<=" direction correctly', () => {
    const entries: Entry[] = [
      { metricId: 'm', date: TODAY, value: 30 },
      { metricId: 'm', date: addDays(TODAY, -1), value: 80 },
    ];
    const hits = lastNDayHits(entries, 50, '<=', TODAY, 2);

    expect(hits[0]).toMatchObject({ logged: true, hit: false }); // 80 > 50
    expect(hits[1]).toMatchObject({ logged: true, hit: true }); // 30 <= 50
  });

  test('returns an empty array for n = 0', () => {
    expect(lastNDayHits([], 7.5, '>=', TODAY, 0)).toEqual([]);
  });

  test('returns dates in ascending order', () => {
    const dates = lastNDayHits([], 7.5, '>=', TODAY, 14).map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
  });
});

/* ---------------------------------------------------------------- weekly ---
 * Dates here are chosen deliberately: 2026-06-29, -06-22, -06-15 and -06-08
 * are consecutive Mondays, and WED sits mid-week in the 06-29 week. A weekly
 * metric is a per-day bar (`goal`) plus a count of days that must clear it.
 */

const MON = '2026-06-29';
const WED = '2026-07-01';
const PREV_MON = '2026-06-22';

/** One entry on a given date, worth one session. */
function on(date: string, value = 1): Entry {
  return { metricId: 'm', date, value };
}

describe('hitDaysInWeek', () => {
  test('counts only the days inside the Monday-to-Sunday week', () => {
    const entries = [
      on(addDays(MON, -1)), // the Sunday before — previous week
      on(MON),
      on(addDays(MON, 3)),
      on(addDays(MON, 7)), // the Monday after — next week
    ];
    expect(hitDaysInWeek(entries, 1, '>=', MON)).toBe(2);
  });

  test('a logged day that misses the bar does not count', () => {
    expect(hitDaysInWeek([on(MON, 0)], 1, '>=', MON)).toBe(0);
  });
});

describe('streakWeeks', () => {
  test('counts consecutive weeks that reached the target', () => {
    const entries = [
      on(PREV_MON),
      on(addDays(PREV_MON, 4)),
      on(addDays(PREV_MON, -7)),
      on(addDays(PREV_MON, -3)),
    ];
    // Nothing logged this week yet, so counting starts from the week before.
    expect(streakWeeks(entries, 1, '>=', 2, WED)).toBe(2);
  });

  test('an unfinished current week does not break the streak', () => {
    const entries = [on(PREV_MON), on(addDays(PREV_MON, 4)), on(MON)];
    // One session so far this week against a target of two: still running,
    // not yet failed. This is the whole point of the weekly cadence.
    expect(streakWeeks(entries, 1, '>=', 2, WED)).toBe(1);
  });

  test('a current week already at target counts immediately', () => {
    const entries = [on(MON), on(addDays(MON, 1))];
    expect(streakWeeks(entries, 1, '>=', 2, WED)).toBe(1);
  });

  test('a completed week that fell short breaks the streak', () => {
    const entries = [on(PREV_MON), on(addDays(PREV_MON, -7)), on(addDays(PREV_MON, -5))];
    // Last week logged once against a target of two; the week before it hit.
    expect(streakWeeks(entries, 1, '>=', 2, WED)).toBe(0);
  });

  test('is zero when nothing has ever been logged', () => {
    expect(streakWeeks([], 1, '>=', 1, WED)).toBe(0);
  });

  test('a daily practice judged weekly survives a single missed day', () => {
    // Six of seven days, target six: the week is met, unlike a day streak.
    const entries = [0, 1, 2, 3, 4, 5].map((i) => on(addDays(PREV_MON, i)));
    expect(streakWeeks(entries, 1, '>=', 6, addDays(PREV_MON, 7))).toBe(1);
    expect(streakDays(entries, 1, '>=', addDays(PREV_MON, 7))).toBe(0);
  });
});

describe('lastNWeekHits', () => {
  test('returns n weeks, oldest first, each named by its Monday', () => {
    const hits = lastNWeekHits([], 1, '>=', 1, WED, 3);
    expect(hits.map((h) => h.date)).toEqual(['2026-06-15', '2026-06-22', MON]);
  });

  test('reports the day count alongside the verdict', () => {
    const entries = [on(PREV_MON), on(addDays(PREV_MON, 2)), on(addDays(PREV_MON, 4))];
    const hits = lastNWeekHits(entries, 1, '>=', 4, WED, 2);
    expect(hits[0]).toMatchObject({ date: PREV_MON, days: 3, hit: false, logged: true });
    expect(hits[1]).toMatchObject({ date: MON, days: 0, hit: false, logged: false });
  });

  test('a week at or over target is a hit', () => {
    const entries = [on(PREV_MON), on(addDays(PREV_MON, 2))];
    expect(lastNWeekHits(entries, 1, '>=', 2, WED, 2)[0]).toMatchObject({ hit: true, days: 2 });
  });
});
