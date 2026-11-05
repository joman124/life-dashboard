import { describe, expect, test } from 'vitest';
import { atRiskStreaks } from '@/lib/streakRisk';
import { addDays } from '@/lib/dates';
import type { Entry, Metric } from '@/lib/types';

const TODAY = '2026-06-30';

function metric(over: Partial<Metric> = {}): Metric {
  return {
    id: 'deep-work',
    name: 'Deep Work',
    emoji: '🧠',
    unit: 'h',
    goal: 4,
    goalDirection: '>=',
    step: 0.5,
    max: 16,
    active: true,
    category: 'FOCUS',
    description: '',
    weeklyTarget: null,
    ...over,
  };
}

/** Entries meeting the goal for consecutive days ending at `end` (oldest first). */
function hitSeries(n: number, end: string, metricId = 'deep-work'): Entry[] {
  return Array.from({ length: n }, (_, i) => ({
    metricId,
    date: addDays(end, -(n - 1 - i)),
    value: 5, // clears the goal of 4
  }));
}

describe('atRiskStreaks', () => {
  test('streak active, today empty → at risk', () => {
    // Goal met every day through yesterday; nothing logged today.
    const entries = hitSeries(5, addDays(TODAY, -1));
    const risks = atRiskStreaks([metric()], entries, TODAY);

    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({ id: 'deep-work', streak: 5 });
    expect(risks[0].message).toBe("🧠 Deep Work streak at risk — you haven't logged today.");
  });

  test('today already logged → not at risk', () => {
    const entries = hitSeries(5, TODAY);
    expect(atRiskStreaks([metric()], entries, TODAY)).toHaveLength(0);
  });

  test('no streak to lose → not at risk', () => {
    // Yesterday missed the goal, so there is no live streak.
    const entries: Entry[] = [{ metricId: 'deep-work', date: addDays(TODAY, -1), value: 1 }];
    expect(atRiskStreaks([metric()], entries, TODAY)).toHaveLength(0);
  });

  test('inactive and weekly metrics are ignored', () => {
    const entries = hitSeries(5, addDays(TODAY, -1));
    const inactive = metric({ id: 'a', active: false });
    const weekly = metric({ id: 'b', weeklyTarget: 3 });
    expect(atRiskStreaks([inactive, weekly], entries.map((e) => ({ ...e, metricId: 'a' })), TODAY))
      .toHaveLength(0);
  });
});
