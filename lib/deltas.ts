// lib/deltas.ts — delta-pill math: percent change vs a trailing baseline with
// direction-aware "good" coloring. "Good" is metric-specific: for a '<='
// metric like Phone Pickups, a NEGATIVE delta is the green/good one.

import type { GoalDirection } from './types';

/**
 * Percent change of `current` vs the mean of `baseline`
 * (e.g. today vs the trailing 7 days excluding today).
 *
 * Returns null when there is nothing meaningful to compare:
 * `current` is null, `baseline` is empty, or the baseline mean is 0.
 *
 * pct  = Math.round((current - mean) / mean * 100)
 * good = dir === '>=' ? pct >= 0 : pct <= 0
 */
export function deltaVsBaseline(
  current: number | null,
  baseline: number[],
  dir: GoalDirection,
): { pct: number; good: boolean } | null {
  if (current === null || baseline.length === 0) return null;

  let sum = 0;
  for (const v of baseline) sum += v;
  const mean = sum / baseline.length;
  if (mean === 0) return null;

  const pct = Math.round(((current - mean) / mean) * 100);
  const good = dir === '>=' ? pct >= 0 : pct <= 0;
  return { pct, good };
}
