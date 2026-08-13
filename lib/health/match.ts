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
function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
 * - Every other key is coerced to a number. Non-finite → ignored
 *   ('non-numeric value'). Otherwise the first metric whose normalized id OR
 *   name equals the normalized key wins → imported. No metric matches →
 *   ignored ('no matching metric').
 *
 * Metrics may be active or inactive: values are stored regardless and surface
 * when the metric is toggled on. Matching is order-stable in the metrics array.
 */
export function matchHealthPayload(
  payload: Record<string, unknown>,
  metrics: { id: string; name: string }[],
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

    const value = coerceNumber(payload[key]);
    if (value === null) {
      ignored.push({ key, reason: 'non-numeric value' });
      continue;
    }

    const hit = findMetric(normKey);
    if (!hit) {
      ignored.push({ key, reason: 'no matching metric' });
      continue;
    }

    imported.push({ metricId: hit.metric.id, key, value });
  }

  return { date, imported, ignored };
}
