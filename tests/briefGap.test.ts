import { describe, expect, it } from 'vitest';
import type { GoalDirection, Metric, Unit } from '@/lib/types';
import { goalGapPercent } from '@/lib/insights';

function metric(over: Partial<Metric> = {}): Metric {
  return {
    id: 'm',
    name: 'M',
    emoji: '🎯',
    unit: 'h' as Unit,
    goal: 8,
    goalDirection: '>=' as GoalDirection,
    step: 0.5,
    max: 24,
    active: true,
    category: 'CUSTOM',
    description: '',
    weeklyTarget: null,
    ...over,
  };
}

describe('goalGapPercent', () => {
  it('is positive when short of a "higher is better" goal', () => {
    // 6h against an 8h goal → 25% short.
    expect(goalGapPercent(metric({ goal: 8 }), 6)).toBe(25);
  });

  it('is negative when past a "higher is better" goal', () => {
    expect(goalGapPercent(metric({ goal: 8 }), 10)).toBe(-25);
  });

  it('is positive when over a "lower is better" goal', () => {
    // 120 against a "≤ 100" goal → 20% over.
    expect(goalGapPercent(metric({ goal: 100, goalDirection: '<=' as GoalDirection }), 120)).toBe(20);
  });

  it('returns null when the goal is 0 (no proportional gap)', () => {
    expect(goalGapPercent(metric({ goal: 0 }), 5)).toBeNull();
  });

  it('ranks worst gap first when used as a sort key', () => {
    const rows = [
      { name: 'a', v: 7 }, // 12.5% short
      { name: 'b', v: 4 }, // 50% short  (worst)
      { name: 'c', v: 9 }, // -12.5%     (past goal)
    ];
    const order = rows
      .map((r) => ({ name: r.name, g: goalGapPercent(metric({ goal: 8 }), r.v) as number }))
      .sort((x, y) => y.g - x.g)
      .map((r) => r.name);
    expect(order).toEqual(['b', 'a', 'c']);
  });
});
