// app/components/format.ts — number/goal display formatting.
//
// The four builtin units have bespoke rules (per spec): h/m show at most one
// decimal (4, 4.5); count gets a thousands separator (8,450); /10 renders as
// "7/10" with the "/10" as a muted suffix next to the serif numeral.
//
// Any other unit is a user-supplied label ("pages", "reps", "$"). Those render
// with a thousands separator and at most one decimal — which covers both the
// integer case (12 pages) and the fractional one (3.5 miles) without asking the
// user to declare which they meant — and the label itself becomes the suffix.

import { BUILTIN_UNITS, type BuiltinUnit, type GoalDirection, type Unit } from '@/lib/types';

function isBuiltin(unit: Unit): unit is BuiltinUnit {
  return (BUILTIN_UNITS as readonly string[]).includes(unit);
}

/** Round to one decimal and drop a trailing ".0": 4 → "4", 4.46 → "4.5". */
function oneDecimal(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(r);
}

/** Thousands-separated, at most one decimal: 1250.46 → "1,250.5", 12 → "12". */
function localized(v: number): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** The numeric part of a value (unit suffix rendered separately, muted). */
export function formatValue(value: number, unit: Unit): string {
  if (unit === 'count') return Math.round(value).toLocaleString('en-US');
  if (isBuiltin(unit)) return oneDecimal(value);
  return localized(value);
}

/** Muted suffix that sits next to the serif numeral. */
export function unitSuffix(unit: Unit): string {
  if (unit === 'count') return '';
  if (isBuiltin(unit)) return unit; // 'h' | 'm' | '/10' are their own suffixes
  return unit; // custom label, rendered verbatim
}

/** Compact value for tight chart labels: 8450 → "8.5k". */
export function compactValue(value: number, unit: Unit): string {
  if (unit === 'count') {
    const n = Math.round(value);
    return n >= 1000 ? `${oneDecimal(n / 1000)}k` : String(n);
  }
  if (isBuiltin(unit)) return oneDecimal(value);
  return Math.abs(value) >= 1000 ? `${oneDecimal(value / 1000)}k` : oneDecimal(value);
}

/** Goal text: "Goal ≥ 4.0h", "Goal ≤ 50", "Goal ≥ 7/10", "Goal ≥ 20 pages". */
export function formatGoal(goal: number, unit: Unit, dir: GoalDirection): string {
  const sym = dir === '>=' ? '≥' : '≤';
  if (unit === 'count') return `Goal ${sym} ${Math.round(goal).toLocaleString('en-US')}`;
  if (unit === '/10') return `Goal ${sym} ${oneDecimal(goal)}/10`;
  if (unit === 'h' || unit === 'm') return `Goal ${sym} ${goal.toFixed(1)}${unit}`;
  return `Goal ${sym} ${localized(goal)} ${unit}`;
}
