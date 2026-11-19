/**
 * lib/focusCheck.ts — the end-of-week "did the focus hold?" check.
 *
 * The weekly focus (lib/weeklyFocus.ts) sets an intention; this closes the week
 * on it with one tap — held / partly / missed — and an optional one-line note.
 * One check per ISO week, keyed by that week's Monday, so re-tapping replaces it.
 *
 * Pure (no database import) so client components can use it; the sync_state
 * read/write lives in lib/focusCheckStore.ts. Plain arithmetic only, no model.
 */
import { addDays, startOfWeek } from '@/lib/dates';

export const FOCUS_RATINGS = ['held', 'partly', 'missed'] as const;
export type FocusRating = (typeof FOCUS_RATINGS)[number];

/** One line, same cap as the focus itself. */
export const MAX_NOTE_LEN = 280;

/** Weeks the Week tab strip shows. */
export const STRIP_WEEKS = 8;

/** Weeks kept in storage; older checks are dropped on write so the row stays bounded. */
export const KEEP_WEEKS = 104;

export interface FocusCheck {
  rating: FocusRating;
  note: string;
  /** The focus text as it stood when the week was rated ('' if none was set). */
  focus: string;
}

/** Week Monday (YYYY-MM-DD) → its check. */
export type FocusChecks = Record<string, FocusCheck>;

export interface RatedWeek extends FocusCheck {
  week: string;
}

export interface StripWeek {
  week: string;
  rating: FocusRating | null;
}

function isRating(v: unknown): v is FocusRating {
  return typeof v === 'string' && (FOCUS_RATINGS as readonly string[]).includes(v);
}

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a check from a request body. Returns the clean check or an error message. */
export function parseCheckInput(
  input: unknown,
): { rating: FocusRating; note: string } | { error: string } {
  if (!input || typeof input !== 'object') {
    return { error: 'focusCheck must be an object like {"rating":"held","note":"..."}.' };
  }
  const { rating, note } = input as Record<string, unknown>;
  if (!isRating(rating)) {
    return { error: `rating must be one of: ${FOCUS_RATINGS.join(', ')}.` };
  }
  if (note !== undefined && note !== null && typeof note !== 'string') {
    return { error: 'note must be a string.' };
  }
  return { rating, note: (note ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_LEN) };
}

/** Read the stored JSON, skipping anything malformed rather than failing the whole read. */
export function parseChecks(raw: string | null): FocusChecks {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: FocusChecks = {};
  for (const [week, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!WEEK_RE.test(week) || !v || typeof v !== 'object') continue;
    const c = v as Record<string, unknown>;
    if (!isRating(c.rating)) continue;
    out[week] = {
      rating: c.rating,
      note: typeof c.note === 'string' ? c.note : '',
      focus: typeof c.focus === 'string' ? c.focus : '',
    };
  }
  return out;
}

/** The week a check made on `today` closes: the ISO week containing it, as its Monday. */
export function checkWeek(today: string): string {
  return startOfWeek(today);
}

/** A new map with `check` set for `week`, dropping weeks older than KEEP_WEEKS. */
export function withCheck(checks: FocusChecks, week: string, check: FocusCheck): FocusChecks {
  const cutoff = addDays(week, -7 * (KEEP_WEEKS - 1));
  const next: FocusChecks = { [week]: check };
  for (const [w, c] of Object.entries(checks)) {
    if (w !== week && w >= cutoff) next[w] = c;
  }
  return next;
}

/** The last `n` weeks ending with today's, oldest → newest; unrated weeks are null. */
export function historyStrip(checks: FocusChecks, today: string, n = STRIP_WEEKS): StripWeek[] {
  const monday = checkWeek(today);
  const out: StripWeek[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const week = addDays(monday, -7 * i);
    out.push({ week, rating: checks[week]?.rating ?? null });
  }
  return out;
}

/** The most recently rated week, or null when nothing has been rated. */
export function latestCheck(checks: FocusChecks): RatedWeek | null {
  const weeks = Object.keys(checks).sort();
  const week = weeks[weeks.length - 1];
  return week ? { week, ...checks[week] } : null;
}

/** "Held 5 of the last 8 rated weeks" style tally over a strip. */
export function stripTally(strip: StripWeek[]): { held: number; partly: number; missed: number; rated: number } {
  const t = { held: 0, partly: 0, missed: 0, rated: 0 };
  for (const s of strip) {
    if (s.rating) {
      t[s.rating] += 1;
      t.rated += 1;
    }
  }
  return t;
}
