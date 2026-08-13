/**
 * lib/health/match.ts — PURE health-payload matcher (no DB, no I/O).
 *
 * Apple Health has no cloud API; an iOS Shortcut POSTs a flat JSON object of
 * metric-name → value pairs to /api/health-import each morning. This module is
 * the deterministic core that decides, for a given payload and the current set
 * of metrics, which keys map to which metric and which are ignored (and why).
 *
 * Kept dependency-free apart from the equally-pure State of Mind converter, so
 * it is trivially unit-testable in isolation. The route handler supplies the
 * metric list (from the DB) and a default date.
 */
import { isStateOfMindKey, parseValenceValue, MOOD_METRIC_KEY } from './stateOfMind';
import { isTimeUnit, looksLikeDuration, parseDuration } from './duration';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Canonicalize a key for case/space/separator-insensitive comparison:
 * lowercase, then strip every non-alphanumeric character. So "Deep Work",
 * "deep_work", "deep-work", and "deepWork" all collapse to "deepwork".
 */
export function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface HealthImported {
  metricId: string;
  key: string;
  value: number;
  /**
   * Set only when the stored value isn't the number that was posted — today
   * that means a State of Mind valence converted to the 1–10 Mood scale. It is
   * echoed in the webhook response so a surprising number is self-explaining
   * rather than something to reverse-engineer.
   */
  note?: string;
}

export interface HealthMatch {
  /** Resolved local calendar date (YYYY-MM-DD) the entries are written under. */
  date: string;
  /** Keys that matched a metric and carried a finite numeric value. */
  imported: HealthImported[];
  /** Keys that were skipped, each with a human-readable reason. */
  ignored: { key: string; reason: string }[];
}

/**
 * Coerce an unknown payload value to a finite number, or null if it can't be.
 * Accepts a real number, or a numeric string like "9336" / "7.6". Booleans,
 * arrays, objects, null, empty/whitespace strings, and "abc" → null.
 *
 * Note: Number('') === 0, so empty/whitespace strings are rejected explicitly
 * before the numeric coercion to avoid silently importing a bogus 0.
 */
function coerceNumber(value: unknown, unit?: string): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;

    // A written duration ("3h 24m", "3:24") — but only for a metric measured in
    // time, and only when the string actually carries a unit letter or colon.
    // Bare numbers stay on the plain path below so this can never reinterpret a
    // payload that already worked.
    if (isTimeUnit(unit) && looksLikeDuration(trimmed)) {
      return parseDuration(trimmed, unit);
    }

    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Short, quoted echo of a rejected value so the reason names what was sent. */
function echoValue(value: unknown): string {
  if (typeof value !== 'string') return String(value);
  const s = value.trim();
  return `"${s.length > 30 ? `${s.slice(0, 30)}…` : s}"`;
}

/**
 * Why a matched metric's value couldn't be read. Generic 'non-numeric value' is
 * kept for the ordinary case, but the two duration mix-ups get named outright —
 * they are the ones a user can actually fix, and "non-numeric value" against a
 * string that plainly reads as a time is more confusing than no message at all.
 */
function unreadableReason(value: unknown, metricName: string, unit?: string): string {
  // An empty string almost always means a Shortcut sent a variable that never
  // got filled in — a distinct problem from typing something unreadable, and
  // one you fix in the Shortcut rather than in what you typed.
  if (typeof value === 'string' && value.trim() === '') {
    return 'empty value — the Shortcut sent this key with nothing in it';
  }
  if (typeof value === 'string' && looksLikeDuration(value.trim())) {
    if (isTimeUnit(unit)) {
      return `could not read ${echoValue(value)} as a duration — use a form like 3h 24m, 3:24, 204m, or 3.4`;
    }
    return `${echoValue(value)} looks like a duration, but ${metricName} is measured in ${unit ?? 'a non-time unit'} — send a plain number`;
  }
  return 'non-numeric value';
}

/**
 * Match a flat health payload against the known metrics.
 *
 * - `date`: if the payload has a `date` key whose value is a valid YYYY-MM-DD
 *   string, that date is used; otherwise `defaultDate`. The `date` key is never
 *   treated as a metric (it is consumed here and skipped below).
 * - State of Mind keys ('stateOfMind', 'valence', …) are handled first and
 *   separately: their value is an Apple valence in [-1, 1] (or one of the seven
 *   Journal labels, or a list of either), converted to the Mood metric's 1–10
 *   scale. See lib/health/stateOfMind.ts for why this can't share the generic
 *   numeric path.
 * - Every other key is matched to a metric (first whose normalized id OR name
 *   equals the normalized key), and only then is its value read. No metric →
 *   ignored ('no matching metric'). Unreadable value → ignored, with a reason
 *   naming the actual problem.
 *
 *   The metric must be resolved first because readability is unit-dependent:
 *   "3h 24m" is a valid duration for a metric measured in hours and nonsense
 *   for one measured in steps. (Earlier this ran the other way round, which
 *   made a missing metric report 'non-numeric value' and sent users hunting a
 *   formatting bug that wasn't there.)
 *
 * Metrics may be active or inactive: values are stored regardless and surface
 * when the metric is toggled on. Matching is order-stable in the metrics array.
 */
export function matchHealthPayload(
  payload: Record<string, unknown>,
  metrics: { id: string; name: string; unit?: string }[],
  defaultDate: string
): HealthMatch {
  // Resolve the date first, and remember whether it came from the payload so we
  // never also treat that same `date` key as a metric below.
  let date = defaultDate;
  const rawDate = payload['date'];
  if (typeof rawDate === 'string' && ISO_DATE_RE.test(rawDate)) {
    date = rawDate;
  }

  // Precompute normalized lookup keys once per metric (id and name both map to
  // the same metric). First match in array order wins.
  const normalized = metrics.map((m) => ({
    metric: m,
    normId: normalizeKey(m.id),
    normName: normalizeKey(m.name),
  }));

  const imported: HealthMatch['imported'] = [];
  const ignored: HealthMatch['ignored'] = [];

  /** Resolve a metric by normalized id or name; null when there is no such metric. */
  const findMetric = (normKey: string) =>
    normalized.find((m) => m.normId === normKey || m.normName === normKey) ?? null;

  for (const key of Object.keys(payload)) {
    if (key === 'date') continue; // reserved; consumed above

    const normKey = normalizeKey(key);

    // --- State of Mind: valence in [-1, 1], not a value on the metric's scale ---
    if (isStateOfMindKey(normKey)) {
      const mood = findMetric(MOOD_METRIC_KEY);
      if (!mood) {
        ignored.push({
          key,
          reason: 'no Mood metric — add one in Track to receive State of Mind',
        });
        continue;
      }
      const parsed = parseValenceValue(payload[key]);
      if (!parsed.ok) {
        ignored.push({ key, reason: parsed.reason });
        continue;
      }
      imported.push({
        metricId: mood.metric.id,
        key,
        value: parsed.score,
        note:
          `valence ${parsed.valence} → ${parsed.score}/10` +
          (parsed.samples > 1 ? ` (mean of ${parsed.samples} samples)` : ''),
      });
      continue;
    }

    // The metric is resolved FIRST because whether a value is readable now
    // depends on the metric's unit — "3h 24m" is valid for a metric measured in
    // hours and meaningless for one measured in steps. Judging the value first
    // meant an unmatched key reported 'non-numeric value', blaming a perfectly
    // good duration for a metric that simply wasn't there.
    const hit = findMetric(normKey);
    if (!hit) {
      ignored.push({ key, reason: 'no matching metric' });
      continue;
    }

    const unit = hit.metric.unit;
    const value = coerceNumber(payload[key], unit);
    if (value === null) {
      ignored.push({ key, reason: unreadableReason(payload[key], hit.metric.name, unit) });
      continue;
    }

    imported.push({ metricId: hit.metric.id, key, value });
  }

  return { date, imported, ignored };
}
