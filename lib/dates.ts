// lib/dates.ts — date helpers pinned to a single fixed timezone.
//
// Every date string in this project is a calendar date in YYYY-MM-DD form,
// resolved in the DASHBOARD TIMEZONE (UTC-7, fixed, no DST) — never in the
// machine's timezone and never in UTC.
//
// Why fixed rather than the host's local time: this app renders on a Vercel
// function whose clock is UTC and in a browser whose clock is the viewer's.
// Letting "today" mean "the host's today" produced two real bugs — an evening
// entry filed under tomorrow's date, and a server-rendered greeting that said
// "evening" at 5pm because the function was already past midnight UTC. One
// declared timezone makes server and client agree by construction.
//
// The offset is deliberately DST-free: UTC-7 all year. That is what was asked
// for, and it means a date never appears twice or goes missing.

/** Dashboard timezone as an offset from UTC, in minutes. UTC-7. */
export const TZ_OFFSET_MINUTES = -7 * 60;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

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

/**
 * Shift a real instant so that reading its UTC fields yields the dashboard
 * timezone's wall-clock fields. The returned Date is NOT a valid instant — it
 * is only a carrier for those fields. Never hand it to anything that will
 * re-interpret it as a moment in time.
 */
function toWallClock(instant: Date): Date {
  return new Date(instant.getTime() + TZ_OFFSET_MINUTES * MS_PER_MINUTE);
}

/**
 * Parse YYYY-MM-DD into a Date at UTC midnight. Used only for calendar
 * arithmetic and weekday/month naming, both of which are offset-independent
 * once every date in play is parsed the same way.
 */
function parseUTC(iso: string): Date {
  const parts = iso.split('-');
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
}

/** Format a Date's UTC calendar fields as YYYY-MM-DD. */
function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Today's calendar date in the dashboard timezone, as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  return toISO(toWallClock(now));
}

/** Hour of day (0–23) in the dashboard timezone — drives the greeting. */
export function hourOfDay(now: Date = new Date()): number {
  return toWallClock(now).getUTCHours();
}

/** Wall-clock HH:MM in the dashboard timezone for a real instant. */
export function formatClock(instant: Date | string): string {
  const w = toWallClock(typeof instant === 'string' ? new Date(instant) : instant);
  return `${pad2(w.getUTCHours())}:${pad2(w.getUTCMinutes())}`;
}

/**
 * The real UTC instant at which the given dashboard-timezone calendar day
 * begins. This IS a true instant (unlike toWallClock's output) and is what an
 * external API query window must be built from.
 */
export function startOfDay(iso: string): Date {
  return new Date(parseUTC(iso).getTime() - TZ_OFFSET_MINUTES * MS_PER_MINUTE);
}

/** The real UTC instant at which the given calendar day ends (exclusive). */
export function endOfDay(iso: string): Date {
  return new Date(startOfDay(iso).getTime() + MS_PER_DAY);
}

/** Add n calendar days (n may be negative) to a YYYY-MM-DD date. */
export function addDays(iso: string, n: number): string {
  return toISO(new Date(parseUTC(iso).getTime() + n * MS_PER_DAY));
}

/** Whole calendar days from `from` to `to`; negative when `to` precedes `from`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseUTC(to).getTime() - parseUTC(from).getTime()) / MS_PER_DAY);
}

/** The n dates ending at endISO inclusive, ordered oldest → newest. */
export function lastNDates(endISO: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endISO, -i));
  return out;
}

/** Short weekday label: Mon / Tue / Wed … */
export function dayLabel(iso: string): string {
  return DAY_SHORT[parseUTC(iso).getUTCDay()] ?? '';
}

/** Long label for headers, e.g. "Friday, June 12". */
export function formatDateLong(iso: string): string {
  const d = parseUTC(iso);
  return `${DAY_LONG[d.getUTCDay()] ?? ''}, ${MONTH_LONG[d.getUTCMonth()] ?? ''} ${d.getUTCDate()}`;
}

/** Compact label for dense axes, e.g. "Jun 12". */
export function formatDateShort(iso: string): string {
  const d = parseUTC(iso);
  return `${(MONTH_LONG[d.getUTCMonth()] ?? '').slice(0, 3)} ${d.getUTCDate()}`;
}

/**
 * ISO-8601 week number (1–53).
 *
 * ISO weeks run Monday–Sunday, and week 1 is the one containing the year's
 * first Thursday. The Thursday rule is why this cannot be "day-of-year / 7":
 * Jan 1 2027 is a Friday and belongs to week 53 of 2026, not week 1 of 2027.
 */
export function isoWeek(iso: string): number {
  // Move to the Thursday of this date's ISO week — that Thursday's year is the
  // ISO week-year, which is the whole trick.
  const d = parseUTC(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
  const thursday = new Date(d.getTime() + (3 - dow) * MS_PER_DAY);

  // Week 1 is the week containing Jan 4 (equivalently, the first Thursday).
  const jan4 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;
  const week1Thursday = new Date(jan4.getTime() + (3 - jan4Dow) * MS_PER_DAY);

  return 1 + Math.round((thursday.getTime() - week1Thursday.getTime()) / (7 * MS_PER_DAY));
}


/**
 * The ISO week-numbering year, which is not always the calendar year: 1 Jan
 * 2027 is a Friday and belongs to week 53 of 2026. Needed so a week is never
 * labelled against the wrong year — reading the year off the date string
 * (`iso.slice(0, 4)`) gets exactly these boundary days wrong.
 */
export function isoWeekYear(iso: string): number {
  const d = parseUTC(iso);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() + (3 - dow) * MS_PER_DAY).getUTCFullYear();
}

/**
 * Total ISO weeks in a week-numbering year: 52, or 53 in a long year.
 *
 * The count does NOT cap at 52. A year has 53 ISO weeks when 1 January is a
 * Thursday, or a Wednesday in a leap year — not a rare edge case: 2026 opens
 * on a Thursday, so this year really does run to week 53 (29 Dec 2026 –
 * 3 Jan 2027). Clamping to 52 would mislabel that week and disagree with every
 * other calendar, so the range is left honest.
 */
export function isoWeeksInYear(year: number): number {
  // 28 December is always in the last ISO week of its year.
  return isoWeek(`${year}-12-28`);
}

/**
 * The Monday that opens the ISO week containing `iso`.
 *
 * Monday rather than Sunday because every other week-shaped thing here is
 * ISO-numbered (see isoWeek), and a week whose number says Monday–Sunday but
 * whose start date says Sunday would put one day in two different weeks.
 */
export function startOfWeek(iso: string): string {
  const dow = (parseUTC(iso).getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
  return addDays(iso, -dow);
}
