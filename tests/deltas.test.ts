import { describe, expect, test } from 'vitest';
import { deltaVsBaseline } from '@/lib/deltas';

describe('deltaVsBaseline — percentage', () => {
  test('reports a positive percentage when above the baseline mean', () => {
    // mean = 4, current = 5 → +25%
    expect(deltaVsBaseline(5, [4, 4, 4, 4], '>=')).toMatchObject({ pct: 25 });
  });

  test('reports a negative percentage when below the baseline mean', () => {
    // mean = 4, current = 3 → -25%
    expect(deltaVsBaseline(3, [4, 4, 4, 4], '>=')).toMatchObject({ pct: -25 });
  });

  test('reports 0 when current equals the baseline mean', () => {
    expect(deltaVsBaseline(4, [4, 4, 4, 4], '>=')).toMatchObject({ pct: 0 });
  });

  test('averages a varied baseline', () => {
    // mean of [2,4,6] = 4, current = 6 → +50%
    expect(deltaVsBaseline(6, [2, 4, 6], '>=')).toMatchObject({ pct: 50 });
  });

  test('rounds to the nearest whole percent', () => {
    // mean = 3, current = 4 → 33.33% → 33
    expect(deltaVsBaseline(4, [3], '>=').pct).toBe(33);
    // mean = 3, current = 5 → 66.67% → 67
    expect(deltaVsBaseline(5, [3], '>=').pct).toBe(67);
  });

  test('handles a baseline mean larger than current by more than 100%', () => {
    // mean = 10, current = 0 → -100%
    expect(deltaVsBaseline(0, [10], '>=').pct).toBe(-100);
  });

  test('handles growth beyond 100%', () => {
    // mean = 2, current = 6 → +200%
    expect(deltaVsBaseline(6, [2], '>=').pct).toBe(200);
  });
});

describe('deltaVsBaseline — direction-aware "good"', () => {
  test('for a ">=" metric, up is good', () => {
    // Deep Work: more hours is better.
    expect(deltaVsBaseline(5, [4], '>=')).toMatchObject({ pct: 25, good: true });
  });

  test('for a ">=" metric, down is bad', () => {
    expect(deltaVsBaseline(3, [4], '>=')).toMatchObject({ pct: -25, good: false });
  });

  test('for a "<=" metric, down is good', () => {
    // Phone Pickups: fewer is better, so a NEGATIVE delta must read green.
    // This is the rule the spec calls out explicitly.
    expect(deltaVsBaseline(30, [50], '<=')).toMatchObject({ pct: -40, good: true });
  });

  test('for a "<=" metric, up is bad', () => {
    expect(deltaVsBaseline(70, [50], '<=')).toMatchObject({ pct: 40, good: false });
  });

  test('treats no change as good in both directions', () => {
    // pct === 0 satisfies both `pct >= 0` and `pct <= 0`.
    expect(deltaVsBaseline(4, [4], '>=').good).toBe(true);
    expect(deltaVsBaseline(4, [4], '<=').good).toBe(true);
  });
});

describe('deltaVsBaseline — nothing to compare', () => {
  test('returns null when current is null', () => {
    // Metric not logged today yet — there is no delta to draw.
    expect(deltaVsBaseline(null, [4, 4, 4], '>=')).toBeNull();
  });

  test('returns null when the baseline is empty', () => {
    // A brand-new metric has no history to compare against.
    expect(deltaVsBaseline(5, [], '>=')).toBeNull();
  });

  test('returns null when the baseline mean is zero', () => {
    // Guards the division: a 0 mean would otherwise yield Infinity or NaN.
    expect(deltaVsBaseline(5, [0, 0, 0], '>=')).toBeNull();
  });

  test('returns null when a mixed baseline averages to zero', () => {
    expect(deltaVsBaseline(5, [-5, 5], '>=')).toBeNull();
  });

  test('never returns a non-finite percentage', () => {
    const cases: [number, number[]][] = [
      [5, [0]],
      [0, [0]],
      [1, [-1, 1]],
    ];
    for (const [current, baseline] of cases) {
      const result = deltaVsBaseline(current, baseline, '>=');
      if (result !== null) expect(Number.isFinite(result.pct)).toBe(true);
    }
  });

  test('handles a current value of zero against a non-zero baseline', () => {
    // Distinct from "not logged": zero IS a value and yields a real -100%.
    expect(deltaVsBaseline(0, [8], '>=')).toMatchObject({ pct: -100, good: false });
  });
});
