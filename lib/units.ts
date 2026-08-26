/**
 * lib/units.ts — how a metric value reads as text, server-side.
 *
 * The browser has its own richer formatter in app/components/format.ts, which
 * splits the numeral from its suffix so the serif numeral and the muted unit
 * can be styled separately. Nothing outside a React tree can use that split, so
 * this module produces the single joined string that written sentences need:
 * "4.5h", "8,000", "7/10", "20 pages".
 *
 * The two must agree on the numbers themselves — a sentence that says 4.5h
 * beside a card that says 4.4h is a bug — so both round the same way: integers
 * with a thousands separator for `count`, at most one decimal otherwise.
 */
import type { GoalDirection, Unit } from './types';

/** The suffix that follows the numeral, including its separating space if any. */
export function unitSuffix(unit: Unit): string {
  if (unit === 'count') return '';
  if (unit === 'h' || unit === 'm' || unit === '/10') return unit;
  return ` ${unit}`; // custom label: "20 pages", not "20pages"
}

/** A value with its unit: "4.5h", "8,000", "7/10", "20 pages". */
export function formatUnitValue(value: number, unit: Unit): string {
  const rounded = unit === 'count' ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toLocaleString('en-US') + unitSuffix(unit);
}

/** The goal on its own, for mid-sentence use: "≥ 6.5h", "≤ 50". */
export function formatGoalText(goal: number, unit: Unit, dir: GoalDirection): string {
  return `${dir === '>=' ? '≥' : '≤'} ${formatUnitValue(goal, unit)}`;
}
