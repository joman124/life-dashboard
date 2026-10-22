// lib/correlations.ts — Pearson correlation engine.
//
// Powers the Trends tab's "What actually moves what" card and the Today tab's
// insight card. Correlations only qualify with >= minPairs shared data points
// (default 8), per acceptance criterion 6.

import type { Entry } from './types';
import { addDays, todayISO } from './dates';

/**
 * Standard Pearson product-moment correlation coefficient over paired values.
 * Pairs are taken index-wise up to the shorter of the two arrays.
 * Returns 0 when there are fewer than 2 pairs or either series has zero
 * variance (r is undefined there; 0 keeps downstream sorting/display safe).
 */
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;

  let meanX = 0;
  let meanY = 0;
  for (let i = 0; i < n; i++) {
    meanX += xs[i] ?? 0;
    meanY += ys[i] ?? 0;
  }
  meanX /= n;
  meanY /= n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - meanX;
    const dy = (ys[i] ?? 0) - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) return 0;
  return Math.max(-1, Math.min(1, cov / Math.sqrt(varX * varY)));
}

export interface CorrelationResult {
  aId: string;
  bId: string;
  r: number;
  n: number;
  strength: 'Strong' | 'Moderate' | 'Weak';
  positive: boolean;
  /** Rough Fisher interval; assumes independent observations, exploratory only. */
  interval: [number, number];
}

export function correlationInterval(r: number, n: number): [number, number] {
  if (n <= 3) return [-1, 1];
  const bounded = Math.max(-0.999999, Math.min(0.999999, r));
  const z = Math.atanh(bounded);
  const margin = 1.96 / Math.sqrt(n - 3);
  return [Math.tanh(z - margin), Math.tanh(z + margin)];
}

/** Narrative suggestions need a moderate signal with an interval excluding zero. */
export function isUsefulPattern(pair: CorrelationResult): boolean {
  return Math.abs(pair.r) >= 0.3 && (pair.interval[0] > 0 || pair.interval[1] < 0);
}

function strengthOf(r: number): CorrelationResult['strength'] {
  const abs = Math.abs(r);
  if (abs >= 0.6) return 'Strong';
  if (abs >= 0.3) return 'Moderate';
  return 'Weak';
}

/**
 * Top metric-pair correlations by |r|.
 *
 * For each unordered pair of `metricIds`, entry values are paired by shared
 * date within the trailing `days`-day window ending at `today` (inclusive).
 * Pairs with fewer than `minPairs` shared dates are discarded. Results are
 * sorted by |r| descending and truncated to `top`.
 *
 * Defaults: days 30, minPairs 8, top 3, today = todayISO().
 */
export function topCorrelations(
  entries: Entry[],
  metricIds: string[],
  opts?: { days?: number; minPairs?: number; top?: number; today?: string },
): CorrelationResult[] {
  const { days = 30, minPairs = 8, top = 3, today = todayISO() } = opts ?? {};
  const windowStart = addDays(today, -(days - 1));

  // metricId -> (date -> value), restricted to requested metrics and window.
  const byMetric = new Map<string, Map<string, number>>();
  for (const id of metricIds) byMetric.set(id, new Map());
  for (const e of entries) {
    const dates = byMetric.get(e.metricId);
    if (!dates) continue;
    // YYYY-MM-DD strings compare correctly as plain strings.
    if (e.date < windowStart || e.date > today || !Number.isFinite(e.value)) continue;
    dates.set(e.date, e.value);
  }

  const results: CorrelationResult[] = [];
  metricIds.forEach((aId, i) => {
    metricIds.slice(i + 1).forEach((bId) => {
      const a = byMetric.get(aId);
      const b = byMetric.get(bId);
      if (!a || !b) return;

      const xs: number[] = [];
      const ys: number[] = [];
      for (const [date, value] of a) {
        const other = b.get(date);
        if (other !== undefined) {
          xs.push(value);
          ys.push(other);
        }
      }
      if (xs.length < minPairs) return;

      // A constant series has undefined correlation; never present it as evidence.
      if (new Set(xs).size < 2 || new Set(ys).size < 2) return;
      const r = pearson(xs, ys);
      results.push({
        aId,
        bId,
        r,
        n: xs.length,
        strength: strengthOf(r),
        positive: r > 0,
        interval: correlationInterval(r, xs.length),
      });
    });
  });

  // Stable sort: equal |r| keeps pair-generation order, so output is
  // deterministic for identical inputs.
  results.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
  return results.slice(0, top);
}
