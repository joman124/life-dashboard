/**
 * lib/health/match.ts — PURE health-payload matcher (no DB, no I/O).
 *
 * Apple Health has no cloud API; an iOS Shortcut POSTs a flat JSON object of
 * metric-name → value pairs to /api/health-import each morning. This module is
 * the deterministic core that decides, for a given payload and the current set
 * of metrics, which keys map to which metric and which are ignored (and why).
 *
 * Kept import-free so it is trivially unit-testable in isolation. The route
 * handler supplies the metric list (from the DB) and a default date.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Canonicalize a key for case/space/separator-insensitive comparison:
 * lowercase, then strip every non-alphanumeric character. So "Deep Work",
 * "deep_work", "deep-work", and "deepWork" all collapse to "deepwork".
 */
export function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface HealthMatch {
  /** Resolved local calendar date (YYYY-MM-DD) the entries are written under. */
  date: string;
  /** Keys that matched a metric and carried a finite numeric value. */
  imported: { metricId: string; key: string; value: number }[];
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

  for (const key of Object.keys(payload)) {
    if (key === 'date') continue; // reserved; consumed above

    const value = coerceNumber(payload[key]);
    if (value === null) {
      ignored.push({ key, reason: 'non-numeric value' });
      continue;
    }

    const normKey = normalizeKey(key);
    const hit = normalized.find((m) => m.normId === normKey || m.normName === normKey);
    if (!hit) {
      ignored.push({ key, reason: 'no matching metric' });
      continue;
    }

    imported.push({ metricId: hit.metric.id, key, value });
  }

  return { date, imported, ignored };
}
