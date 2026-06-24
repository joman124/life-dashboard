// app/components/format.ts — number/goal display formatting.
//
// Rules (per spec): h/m show at most one decimal (4, 4.5); count gets a
// thousands separator (8,450); /10 renders as "7/10" with the "/10" as a
// muted suffix next to the serif numeral.

import type { GoalDirection, Unit } from '@/lib/types';

/** Round to one decimal and drop a trailing ".0": 4 → "4", 4.46 → "4.5". */
function oneDecimal(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(r);
}

/** The numeric part of a value (unit suffix rendered separately, muted). */
export function formatValue(value: number, unit: Unit): string {
  if (unit === 'count') return Math.round(value).toLocaleString('en-US');
  return oneDecimal(value);
}

/** Muted suffix that sits next to the serif numeral. */
export function unitSuffix(unit: Unit): string {
  if (unit === 'h') return 'h';
  if (unit === 'm') return 'm';
  if (unit === '/10') return '/10';
  return '';
}

/** Compact value for tight chart labels: 8450 → "8.5k". */
export function compactValue(value: number, unit: Unit): string {
  if (unit === 'count') {
    const n = Math.round(value);
    return n >= 1000 ? `${oneDecimal(n / 1000)}k` : String(n);
  }
  return oneDecimal(value);
}

/** Goal text: "Goal ≥ 4.0h", "Goal ≤ 50", "Goal ≥ 7/10". */
export function formatGoal(goal: number, unit: Unit, dir: GoalDirection): string {
  const sym = dir === '>=' ? '≥' : '≤';
  if (unit === 'count') return `Goal ${sym} ${Math.round(goal).toLocaleString('en-US')}`;
  if (unit === '/10') return `Goal ${sym} ${oneDecimal(goal)}/10`;
  return `Goal ${sym} ${goal.toFixed(1)}${unit}`;
}
