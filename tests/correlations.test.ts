import { describe, expect, test } from 'vitest';
import { pearson, topCorrelations } from '@/lib/correlations';
import { addDays } from '@/lib/dates';
import type { Entry } from '@/lib/types';

/** Build entries for one metric over consecutive days ending at `end`. */
function series(metricId: string, values: number[], end: string): Entry[] {
  const n = values.length;
  return values.map((value, i) => ({
    metricId,
    date: addDays(end, -(n - 1 - i)),
    value,
  }));
}

describe('pearson', () => {
  test('returns 1 for a perfect positive linear relationship', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
  });

  test('returns -1 for a perfect negative linear relationship', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
  });

  test('is invariant to positive scaling and offset', () => {
    const xs = [3, 1, 4, 1, 5, 9, 2, 6];
    const ys = [2, 7, 1, 8, 2, 8, 1, 8];
    const scaled = ys.map((y) => y * 3.5 + 10);
    expect(pearson(xs, scaled)).toBeCloseTo(pearson(xs, ys), 10);
  });

  test('is symmetric in its arguments', () => {
    const xs = [3, 1, 4, 1, 5, 9];
    const ys = [2, 7, 1, 8, 2, 8];
    expect(pearson(xs, ys)).toBeCloseTo(pearson(ys, xs), 10);
  });

  test('matches a hand-computed value for a known series', () => {
    // Worked by hand: means are both 3, so dx = [-2,-1,0,1,2] and
    // dy = [-2,0,-1,2,1]. cov = 8, varX = varY = 10, r = 8/sqrt(100) = 0.8.
    expect(pearson([1, 2, 3, 4, 5], [1, 3, 2, 5, 4])).toBeCloseTo(0.8, 10);
  });

  test('returns 0 when a series has zero variance', () => {
    // r is mathematically undefined (0/0) when one side is constant;
    // 0 is the safe substitute so downstream sorting never sees NaN.
    expect(pearson([5, 5, 5, 5], [1, 2, 3, 4])).toBe(0);
    expect(pearson([1, 2, 3, 4], [7, 7, 7, 7])).toBe(0);
  });

  test('returns 0 for fewer than two pairs', () => {
    expect(pearson([], [])).toBe(0);
    expect(pearson([1], [2])).toBe(0);
  });

  test('pairs index-wise up to the shorter array', () => {
    // The trailing 99 has no counterpart and must be ignored, leaving a
    // perfect positive relationship over the first three pairs.
    expect(pearson([1, 2, 3, 99], [2, 4, 6])).toBeCloseTo(1, 10);
  });

  test('never returns NaN for degenerate input', () => {
    expect(Number.isNaN(pearson([0, 0], [0, 0]))).toBe(false);
  });

  test('stays within the range [-1, 1] for noisy input', () => {
    const xs = [12, 4, 7, 19, 3, 8, 15, 2, 11, 6];
    const ys = [3, 9, 1, 14, 8, 2, 12, 7, 5, 10];
    const r = pearson(xs, ys);
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
  });
});

describe('topCorrelations — minimum paired data points', () => {
  const today = '2026-06-30';

  test('returns nothing when pairs fall below the default minimum of 8', () => {
    // Acceptance criterion 6: correlations must never render with fewer than
    // 8 paired data points. Seven perfectly-correlated days must still yield
    // no result — a strong r over too little data is exactly the false
    // confidence this rule exists to prevent.
    const entries = [
      ...series('sleep', [7, 8, 6, 9, 7, 8, 6], today),
      ...series('deep-work', [3, 4, 2, 5, 3, 4, 2], today),
    ];

    expect(topCorrelations(entries, ['sleep', 'deep-work'], { today })).toEqual([]);
  });

  test('returns a result at exactly 8 paired points (inclusive boundary)', () => {
    const entries = [
      ...series('sleep', [7, 8, 6, 9, 7, 8, 6, 9], today),
      ...series('deep-work', [3, 4, 2, 5, 3, 4, 2, 5], today),
    ];

    const [result] = topCorrelations(entries, ['sleep', 'deep-work'], { today });
    expect(result).toBeDefined();
    expect(result.n).toBe(8);
  });

  test('counts only dates present in BOTH series', () => {
    // 10 sleep days but only 5 overlapping deep-work days → below the minimum,
    // even though each series individually looks like plenty of data.
    const entries = [
      ...series('sleep', [7, 8, 6, 9, 7, 8, 6, 9, 7, 8], today),
      ...series('deep-work', [3, 4, 2, 5, 3], today),
    ];

    expect(topCorrelations(entries, ['sleep', 'deep-work'], { today })).toEqual([]);
  });

  test('honours a custom minPairs', () => {
    const entries = [
      ...series('sleep', [7, 8, 6, 9, 7], today),
      ...series('deep-work', [3, 4, 2, 5, 3], today),
    ];

    expect(topCorrelations(entries, ['sleep', 'deep-work'], { today, minPairs: 5 })).toHaveLength(1);
    expect(topCorrelations(entries, ['sleep', 'deep-work'], { today, minPairs: 6 })).toEqual([]);
  });
});

describe('topCorrelations — windowing', () => {
  const today = '2026-06-30';

  test('ignores entries outside the trailing window', () => {
    // 10 paired days, but all of them sit 60+ days in the past, so the default
    // 30-day window excludes every one.
    const old = addDays(today, -60);
    const entries = [
      ...series('sleep', [7, 8, 6, 9, 7, 8, 6, 9, 7, 8], old),
      ...series('deep-work', [3, 4, 2, 5, 3, 4, 2, 5, 3, 4], old),
    ];

    expect(topCorrelations(entries, ['sleep', 'deep-work'], { today })).toEqual([]);
  });

  test('ignores entries dated after today', () => {
    const future = addDays(today, 10);
    const entries = [
      ...series('sleep', [7, 8, 6, 9, 7, 8, 6, 9, 7, 8], future),
      ...series('deep-work', [3, 4, 2, 5, 3, 4, 2, 5, 3, 4], future),
    ];

    // Only the days that land on or before `today` can pair up, which is fewer
    // than the 8-pair minimum here.
    expect(topCorrelations(entries, ['sleep', 'deep-work'], { today })).toEqual([]);
  });

  test('includes the boundary day exactly `days` back', () => {
    const entries: Entry[] = [];
    // 10 paired days ending exactly at the oldest edge of a 30-day window.
    const windowStart = addDays(today, -29);
    const end = addDays(windowStart, 9);
    entries.push(...series('sleep', [7, 8, 6, 9, 7, 8, 6, 9, 7, 8], end));
    entries.push(...series('deep-work', [3, 4, 2, 5, 3, 4, 2, 5, 3, 4], end));

    const [result] = topCorrelations(entries, ['sleep', 'deep-work'], { today });
    expect(result?.n).toBe(10);
  });
});

describe('topCorrelations — results', () => {
  const today = '2026-06-30';

  test('reports a strong positive correlation with the right shape', () => {
    const entries = [
      ...series('sleep', [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5], today),
      ...series('deep-work', [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5], today),
    ];

    const [result] = topCorrelations(entries, ['sleep', 'deep-work'], { today });
    expect(result).toMatchObject({
      aId: 'sleep',
      bId: 'deep-work',
      n: 10,
      strength: 'Strong',
      positive: true,
    });
    expect(result.r).toBeCloseTo(1, 10);
  });

  test('flags an inverse relationship as not positive', () => {
    const entries = [
      ...series('deep-work', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], today),
      ...series('phone-pickups', [100, 90, 80, 70, 60, 50, 40, 30, 20, 10], today),
    ];

    const [result] = topCorrelations(entries, ['deep-work', 'phone-pickups'], { today });
    expect(result.positive).toBe(false);
    expect(result.r).toBeCloseTo(-1, 10);
    expect(result.strength).toBe('Strong');
  });

  test('classifies strength by |r| at the documented thresholds', () => {
    // Strength buckets: Strong >= 0.6, Moderate >= 0.3, else Weak. Verified
    // through the public API by constructing series with known r values.
    const strong = [
      ...series('a', [1, 2, 3, 4, 5, 6, 7, 8], today),
      ...series('b', [1, 2, 3, 4, 5, 6, 7, 8], today),
    ];
    expect(topCorrelations(strong, ['a', 'b'], { today })[0].strength).toBe('Strong');

    // Zero-variance on one side gives r = 0 → Weak.
    const weak = [
      ...series('a', [1, 2, 3, 4, 5, 6, 7, 8], today),
      ...series('b', [5, 5, 5, 5, 5, 5, 5, 5], today),
    ];
    expect(topCorrelations(weak, ['a', 'b'], { today })[0].strength).toBe('Weak');
  });

  test('sorts by |r| descending so the strongest link leads', () => {
    const entries = [
      // a↔b is perfectly correlated; a↔c is deliberately noisy.
      ...series('a', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], today),
      ...series('b', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], today),
      ...series('c', [5, 1, 8, 2, 9, 3, 7, 4, 6, 2], today),
    ];

    const results = topCorrelations(entries, ['a', 'b', 'c'], { today, top: 3 });
    const magnitudes = results.map((r) => Math.abs(r.r));
    expect(magnitudes).toEqual([...magnitudes].sort((x, y) => y - x));
    expect(results[0]).toMatchObject({ aId: 'a', bId: 'b' });
  });

  test('truncates to the requested top count', () => {
    const entries = [
      ...series('a', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], today),
      ...series('b', [2, 4, 6, 8, 10, 12, 14, 16, 18, 20], today),
      ...series('c', [5, 1, 8, 2, 9, 3, 7, 4, 6, 2], today),
      ...series('d', [9, 8, 7, 6, 5, 4, 3, 2, 1, 0], today),
    ];

    // 4 metrics → 6 unordered pairs; ask for 2.
    expect(topCorrelations(entries, ['a', 'b', 'c', 'd'], { today, top: 2 })).toHaveLength(2);
  });

  test('never pairs a metric with itself', () => {
    const entries = [
      ...series('a', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], today),
      ...series('b', [2, 4, 6, 8, 10, 12, 14, 16, 18, 20], today),
    ];

    for (const result of topCorrelations(entries, ['a', 'b'], { today, top: 10 })) {
      expect(result.aId).not.toBe(result.bId);
    }
  });

  test('returns each unordered pair only once', () => {
    const entries = [
      ...series('a', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], today),
      ...series('b', [2, 4, 6, 8, 10, 12, 14, 16, 18, 20], today),
      ...series('c', [5, 1, 8, 2, 9, 3, 7, 4, 6, 2], today),
    ];

    const results = topCorrelations(entries, ['a', 'b', 'c'], { today, top: 10 });
    const keys = results.map((r) => [r.aId, r.bId].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('ignores metric ids that have no entries', () => {
    const entries = [
      ...series('a', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], today),
      ...series('b', [2, 4, 6, 8, 10, 12, 14, 16, 18, 20], today),
    ];

    const results = topCorrelations(entries, ['a', 'b', 'ghost'], { today, top: 10 });
    expect(results).toHaveLength(1);
    expect(results.every((r) => r.aId !== 'ghost' && r.bId !== 'ghost')).toBe(true);
  });

  test('ignores entries for metrics not in the requested list', () => {
    const entries = [
      ...series('a', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], today),
      ...series('b', [2, 4, 6, 8, 10, 12, 14, 16, 18, 20], today),
      ...series('unrequested', [9, 9, 9, 9, 9, 9, 9, 9, 9, 9], today),
    ];

    const results = topCorrelations(entries, ['a', 'b'], { today, top: 10 });
    expect(results).toHaveLength(1);
  });

  test('returns an empty array for empty input', () => {
    expect(topCorrelations([], ['a', 'b'], { today })).toEqual([]);
    expect(topCorrelations([], [], { today })).toEqual([]);
  });

  test('is deterministic across repeated calls', () => {
    const entries = [
      ...series('a', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], today),
      ...series('b', [2, 4, 6, 8, 10, 12, 14, 16, 18, 20], today),
      ...series('c', [5, 1, 8, 2, 9, 3, 7, 4, 6, 2], today),
    ];

    const first = topCorrelations(entries, ['a', 'b', 'c'], { today });
    const second = topCorrelations(entries, ['a', 'b', 'c'], { today });
    expect(first).toEqual(second);
  });
});
