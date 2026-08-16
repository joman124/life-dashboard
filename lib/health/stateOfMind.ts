/**
 * lib/health/stateOfMind.ts — PURE conversion of Apple's State of Mind into the
 * dashboard's 1–10 Mood scale (no DB, no I/O).
 *
 * The Journal app writes a daily reflection to HealthKit as a `State of Mind`
 * sample, and the Health app's "Log your State of Mind" does the same for
 * momentary check-ins. Shortcuts can read those samples, so Journal's mood
 * rating reaches this app on exactly the same webhook as steps and sleep.
 *
 * The wrinkle is the scale. HealthKit stores State of Mind as **valence**, a
 * float from -1.0 (most unpleasant) to +1.0 (most pleasant); the seven faces
 * you actually tap in Journal are labelled bands over that range. Neither is a
 * 1–10 score, so the raw number can't be written into a `/10` metric as-is —
 * a valence of 0 is a perfectly neutral day, but stored verbatim it would read
 * as 0/10, the worst possible day. This module does that conversion in one
 * place, and the payload key you use is what selects it:
 *
 *   {"stateOfMind": 0.6}  → valence, converted here      → mood 8.2
 *   {"mood": 8}           → already a 1–10 score, as-is  → mood 8
 *
 * Nothing guesses. A key in VALENCE_KEYS is always treated as valence, and a
 * value outside [-1, 1] is refused with a readable reason rather than being
 * clamped into a plausible-looking lie.
 */

/** The metric State of Mind feeds. Matched on normalized id OR name. */
export const MOOD_METRIC_KEY = 'mood';

/** Bottom and top of the Mood metric's 1–10 scale. */
const SCORE_MIN = 1;
const SCORE_MAX = 10;

/**
 * Payload keys (normalized — lowercase, alphanumerics only) whose value is
 * interpreted as HealthKit valence. Every spelling a Shortcut is likely to
 * produce is accepted, because renaming a Shortcut variable shouldn't silently
 * drop a day of mood data.
 */
const VALENCE_KEYS = new Set([
  'stateofmind',
  'stateofmindvalence',
  'valence',
  'moodvalence',
  'journalmood',
  'journalstateofmind',
]);

/** True when this payload key carries a HealthKit valence rather than a score. */
export function isStateOfMindKey(normalizedKey: string): boolean {
  return VALENCE_KEYS.has(normalizedKey);
}

/**
 * The seven labels Journal and Health show, mapped to the midpoint of the
 * valence band each one covers. Apple's ValenceClassification splits [-1, 1]
 * into seven equal bands, so the midpoints fall at ±0.857, ±0.571, ±0.286, 0.
 *
 * Shortcuts returns the label text rather than the number in some
 * configurations (and on some iOS versions), so accepting both spellings of the
 * same rating is the difference between the automation working and the user
 * having to debug why their mood column is empty.
 */
const LABEL_VALENCE: Record<string, number> = {
  veryunpleasant: -0.857,
  unpleasant: -0.571,
  slightlyunpleasant: -0.286,
  neutral: 0,
  slightlypleasant: 0.286,
  pleasant: 0.571,
  verypleasant: 0.857,
};

/**
 * Convert HealthKit valence (-1..+1) to the Mood metric's 1–10 scale.
 * Linear, so the midpoint of the range lands mid-scale:
 *   -1 → 1.0 · 0 → 5.5 · +1 → 10.0
 * Rounded to one decimal — enough resolution to distinguish two adjacent
 * Journal faces (~0.29 valence apart, ~1.3 points) without implying precision
 * that a seven-point tap doesn't have.
 */
export function valenceToScore(valence: number): number {
  const scaled = SCORE_MIN + ((valence + 1) / 2) * (SCORE_MAX - SCORE_MIN);
  return Math.round(scaled * 10) / 10;
}

export type ValenceParse =
  | { ok: true; score: number; valence: number; samples: number }
  | { ok: false; reason: string };

/** Normalize a label for lookup: lowercase, strip everything non-alphanumeric. */
function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Interpret one State of Mind payload value as valence, then convert to score.
 *
 * Accepts, in order:
 *   - a number, or a numeric string ("0.6")     → valence
 *   - one of the seven labels ("Very Pleasant") → band midpoint
 *   - an array of any of the above              → averaged
 *
 * The array case is what makes this usable without extra Shortcut plumbing:
 * `Find State of Mind Samples` returns a *list*, and on a day with several
 * momentary check-ins the honest daily figure is their mean. Averaging happens
 * in valence space (the linear scale), not after conversion — though since the
 * mapping is linear the two agree, this ordering keeps it true if the scale
 * ever stops being linear.
 */
export function parseValenceValue(value: unknown): ValenceParse {
  const raw = Array.isArray(value) ? value : [value];
  if (raw.length === 0) {
    return { ok: false, reason: 'state of mind list was empty' };
  }

  const valences: number[] = [];
  for (const item of raw) {
    const v = coerceValence(item);
    if (v === null) {
      return {
        ok: false,
        reason:
          'state of mind must be a valence between -1 and 1, or a label like "Very Pleasant"',
      };
    }
    valences.push(v);
  }

  const mean = valences.reduce((sum, v) => sum + v, 0) / valences.length;
  return {
    ok: true,
    score: valenceToScore(mean),
    valence: Math.round(mean * 1000) / 1000,
    samples: valences.length,
  };
}

/** One value → valence in [-1, 1], or null if it isn't one. */
function coerceValence(item: unknown): number | null {
  if (typeof item === 'number') {
    return Number.isFinite(item) && item >= -1 && item <= 1 ? item : null;
  }
  if (typeof item === 'string') {
    const trimmed = item.trim();
    if (trimmed === '') return null;

    // A numeric string is valence; anything else may be one of the seven labels.
    const n = Number(trimmed);
    if (Number.isFinite(n)) {
      return n >= -1 && n <= 1 ? n : null;
    }
    const label = LABEL_VALENCE[normalizeLabel(trimmed)];
    return label === undefined ? null : label;
  }
  return null;
}
