import { describe, expect, it } from 'vitest';

import { focusScorecard } from '@/lib/weeklyFocus';
import { addDays } from '@/lib/dates';
import type { Entry, Metric } from '@/lib/types';

const TODAY = '2026-11-01';

function metric(over: Partial<Metric>): Metric {
  return {
    id: 'x', name: 'X', emoji: '🎯', unit: 'h', goal: 1, goalDirection: '>=', step: 1,
    max: 10, active: true, category: 'CUSTOM', description: '', weeklyTarget: null, ...over,
  };
}

const sleep = metric({ id: 'sleep', name: 'Sleep', goal: 7 });
const pickups = metric({ id: 'phone-pickups', name: 'Phone Pickups', unit: 'count', goal: 50, goalDirection: '<=' });
const gym = metric({ id: 'gym', name: 'Gym', unit: 'count', goal: 1, weeklyTarget: 3 });

/** One entry per value, ending today and walking back a day each. */
function days(metricId: string, values: number[]): Entry[] {
  return values.map((value, i) => ({ metricId, date: addDays(TODAY, -i), value }));
}

describe('focusScorecard', () => {
  it('is null with no focus or no active metrics', () => {
    expect(focusScorecard('  ', [sleep], [], TODAY)).toBeNull();
    expect(focusScorecard('sleep', [{ ...sleep, active: false }], [], TODAY)).toBeNull();
  });

  it('judges only the metrics the focus names, case-insensitively', () => {
    const entries = [...days('sleep', [8, 7, 7.5]), ...days('phone-pickups', [90, 80])];
    const card = focusScorecard('More SLEEP this week', [sleep, pickups], entries, TODAY)!;
    expect(card).toMatchObject({ status: 'on-track', matched: true, metricIds: ['sleep'], behindIds: [] });
    expect(card.text).toBe('On track — Sleep at goal this week.');
  });

  it('matches a metric by its id with hyphens read as spaces', () => {
    const card = focusScorecard('fewer phone pickups', [sleep, pickups], days('phone-pickups', [60]), TODAY)!;
    expect(card.metricIds).toEqual(['phone-pickups']);
    expect(card.status).toBe('behind');
  });

  it('respects a "keep it low" goal direction', () => {
    const card = focusScorecard('phone pickups', [pickups], days('phone-pickups', [40, 45]), TODAY)!;
    expect(card.status).toBe('on-track');
  });

  it('counts nothing logged in the window as behind, and ignores older entries', () => {
    const old = [{ metricId: 'sleep', date: addDays(TODAY, -7), value: 9 }];
    const card = focusScorecard('sleep', [sleep], old, TODAY)!;
    expect(card.status).toBe('behind');
    expect(card.text).toBe('Behind — Sleep short of goal this week; 0 of 1 on track.');
  });

  it('judges a weekly metric by hit days against its target', () => {
    expect(focusScorecard('gym', [gym], days('gym', [1, 0, 1]), TODAY)!.status).toBe('behind');
    expect(focusScorecard('gym', [gym], days('gym', [1, 0, 1, 1]), TODAY)!.status).toBe('on-track');
  });

  it('falls back to every active metric when the focus names none, and says so', () => {
    const entries = [...days('sleep', [5, 6]), ...days('phone-pickups', [70]), ...days('gym', [1, 1, 1])];
    const card = focusScorecard('finish chapter 3', [sleep, pickups, gym], entries, TODAY)!;
    expect(card.matched).toBe(false);
    expect(card.behindIds).toEqual(['sleep', 'phone-pickups']);
    expect(card.text).toBe(
      'Behind — Sleep and Phone Pickups short of goal this week; 1 of 3 on track ' +
        '(focus names no tracked metric, so all are counted).',
    );
  });

  it('is deterministic: same inputs, same line', () => {
    const entries = days('sleep', [6, 8]);
    expect(focusScorecard('sleep', [sleep], entries, TODAY)).toEqual(
      focusScorecard('sleep', [sleep], entries, TODAY),
    );
  });
});
