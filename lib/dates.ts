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

/* ------------------------------------------------------------- ISO weeks */

/**
 * ISO-8601 week number (1–53) for a local calendar date.
 *
 * The rule that makes this correct where naive "day-of-year ÷ 7" is not:
 * a week belongs to the year containing its **Thursday**. So the first days of
 * January can fall in week 52 or 53 of the *previous* year, and the last days
 * of December can fall in week 1 of the *next* one.
 *
 * The count does NOT cap at 52. A year has 53 ISO weeks when 1 January is a
 * Thursday, or when it is a Wednesday in a leap year — which is not a rare
 * edge case: 2026 begins on a Thursday, so this year genuinely runs to week 53
 * (29 Dec 2026 – 3 Jan 2027). Clamping to 52 would mislabel that final week,
 * and would also disagree with every calendar and every other ISO
 * implementation, so the range is left honest.
 */
export function isoWeek(iso: string): number {
  const d = parseLocal(iso);
  // Shift to the Thursday of this date's week; that Thursday's year is the
  // ISO week-numbering year, and the week index follows from it.
  const day = (d.getDay() + 6) % 7; // Monday = 0 … Sunday = 6
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 3);

  // 4 January is always in ISO week 1, so the Thursday of ITS week anchors the year.
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Thursday = new Date(jan4.getFullYear(), 0, 4 - jan4Day + 3);

  // Round rather than floor: DST transitions make some spans 23 or 25 hours,
  // which would otherwise round a whole week down.
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  return 1 + Math.round((thursday.getTime() - week1Thursday.getTime()) / MS_PER_WEEK);
}

/**
 * The ISO week-numbering year, which is not always the calendar year — 1 Jan
 * 2027 belongs to ISO week 53 of 2026. Needed so "week 53" is never shown
 * against the wrong year.
 */
export function isoWeekYear(iso: string): number {
  const d = parseLocal(iso);
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 3).getFullYear();
}

/** Total ISO weeks in a week-numbering year: 52, or 53 in a long year. */
export function isoWeeksInYear(year: number): number {
  // 28 December is always in the last ISO week of its year.
  return isoWeek(`${year}-12-28`);
}
