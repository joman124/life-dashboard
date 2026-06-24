// lib/dates.ts — local-time date helpers.
//
// Every date string in this project is a LOCAL calendar date in YYYY-MM-DD
// form. Date#toISOString is never used here: it converts to UTC and can shift
// the calendar day depending on the machine's timezone.

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const DAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Parse a YYYY-MM-DD string into a Date at LOCAL midnight (never UTC). */
function parseLocal(iso: string): Date {
  const parts = iso.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/** Format a Date's local calendar fields as YYYY-MM-DD. */
function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Today's local calendar date as YYYY-MM-DD. */
export function todayISO(): string {
  return toLocalISO(new Date());
}

/** Add n calendar days (n may be negative) to a YYYY-MM-DD date. */
export function addDays(iso: string, n: number): string {
  const d = parseLocal(iso);
  d.setDate(d.getDate() + n);
  return toLocalISO(d);
}

/** The n dates ending at endISO inclusive, ordered oldest → newest. */
export function lastNDates(endISO: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endISO, -i));
  return out;
}

/** Short weekday label: Mon / Tue / Wed … */
export function dayLabel(iso: string): string {
  return DAY_SHORT[parseLocal(iso).getDay()] ?? '';
}

/** Long label for headers, e.g. "Friday, June 12". */
export function formatDateLong(iso: string): string {
  const d = parseLocal(iso);
  return `${DAY_LONG[d.getDay()] ?? ''}, ${MONTH_LONG[d.getMonth()] ?? ''} ${d.getDate()}`;
}
