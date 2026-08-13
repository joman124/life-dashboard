/**
 * lib/health/duration.ts — PURE parsing of human-written durations (no I/O).
 *
 * Screen Time is the reason this exists. It has no API of any kind, so the
 * number always arrives by a human reading it off Settings and typing it in —
 * and what iOS shows there is "3h 24m", never "3.4". Requiring the user to do
 * that division in their head, every day, to satisfy a metric stored in hours
 * is the kind of friction that gets a habit abandoned in a week. So the webhook
 * accepts the string exactly as the phone displays it.
 *
 * It applies to any time-unit metric, not just Screen Time: Sleep takes
 * "7h 36m" just as happily, which is also how the Health app writes it.
 *
 * Only strings that actually *look* like durations are parsed here — something
 * with an h/m unit letter or a colon. A bare number is left to the ordinary
 * numeric path and means whatever the metric's unit says it means, so
 * {"screen-time": 3.4} is still 3.4 hours and {"steps": 9336} is untouched.
 */

/** Metric units this module can convert into. Anything else is not a duration. */
export type TimeUnit = 'h' | 'm';

export function isTimeUnit(unit: string | undefined): unit is TimeUnit {
  return unit === 'h' || unit === 'm';
}

/**
 * "3h 24m" and its many spellings. Both parts optional so "3h" and "45m" work,
 * but the regex is anchored and requires at least one unit letter, so a bare
 * "3.4" falls through to the plain numeric path rather than being claimed here.
 *
 * Accepted: h / hr / hrs / hour / hours, m / min / mins / minute / minutes,
 * any spacing, any casing.
 */
const HM_RE =
  /^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes))?$/i;

/** "3:24" — hours:minutes, the other way iOS renders a duration. */
const COLON_RE = /^(\d+):([0-5]?\d)$/;

/**
 * Parse a duration string into `unit`, or null when it isn't a duration.
 *
 * Returns null (rather than throwing) for anything unrecognized so the caller
 * can report it as an ordinary ignored key with a readable reason.
 */
export function parseDuration(raw: string, unit: TimeUnit): number | null {
  const s = raw.trim();
  if (s === '') return null;

  let hours: number;
  let minutes: number;

  const colon = COLON_RE.exec(s);
  if (colon) {
    hours = Number(colon[1]);
    minutes = Number(colon[2]);
  } else {
    const hm = HM_RE.exec(s);
    // A match with neither group filled means the string had no digits and no
    // unit letters (the regex is all-optional), e.g. "" or "  " — not a duration.
    if (!hm || (hm[1] === undefined && hm[2] === undefined)) return null;
    hours = hm[1] === undefined ? 0 : Number(hm[1]);
    minutes = hm[2] === undefined ? 0 : Number(hm[2]);
  }

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const totalMinutes = hours * 60 + minutes;
  if (unit === 'm') return Math.round(totalMinutes * 100) / 100;
  // Two decimals keeps the common cases exact — 3h24m is 3.4, not 3.3999998 —
  // while still distinguishing minute-level differences.
  return Math.round((totalMinutes / 60) * 100) / 100;
}

/**
 * True when a string is worth handing to parseDuration: it carries an h/m unit
 * letter or a colon. Used to keep the plain numeric path in charge of bare
 * numbers, so this module can never change the meaning of an existing payload.
 */
export function looksLikeDuration(raw: string): boolean {
  return /[hm:]/i.test(raw);
}
