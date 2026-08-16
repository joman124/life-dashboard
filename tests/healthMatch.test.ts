import { describe, expect, test } from 'vitest';
import { matchHealthPayload, normalizeKey } from '@/lib/health/match';

const METRICS = [
  { id: 'deep-work', name: 'Deep Work' },
  { id: 'phone-pickups', name: 'Phone Pickups' },
  { id: 'sleep', name: 'Sleep' },
  { id: 'steps', name: 'Steps' },
];

const DEFAULT_DATE = '2026-06-30';

describe('normalizeKey', () => {
  test('lowercases and strips every non-alphanumeric character', () => {
    expect(normalizeKey('Deep Work')).toBe('deepwork');
    expect(normalizeKey('deep_work')).toBe('deepwork');
    expect(normalizeKey('deep-work')).toBe('deepwork');
    expect(normalizeKey('deepWork')).toBe('deepwork');
    expect(normalizeKey('  Deep   Work  ')).toBe('deepwork');
  });

  test('keeps digits', () => {
    expect(normalizeKey('VO2 Max')).toBe('vo2max');
  });

  test('returns an empty string for punctuation-only input', () => {
    expect(normalizeKey('---')).toBe('');
  });
});

describe('matchHealthPayload — matching', () => {
  test('matches a key against the metric id', () => {
    const result = matchHealthPayload({ 'deep-work': 4 }, METRICS, DEFAULT_DATE);
    expect(result.imported).toEqual([{ metricId: 'deep-work', key: 'deep-work', value: 4 }]);
    expect(result.ignored).toEqual([]);
  });

  test('matches a key against the metric name', () => {
    const result = matchHealthPayload({ 'Deep Work': 4 }, METRICS, DEFAULT_DATE);
    expect(result.imported[0].metricId).toBe('deep-work');
  });

  test('matches across separator and casing variations', () => {
    // The iOS Shortcut UI makes it very easy to produce any of these spellings,
    // so all of them must land on the same metric.
    for (const key of ['deepwork', 'DEEP WORK', 'deep_work', 'Deep-Work', 'deepWork']) {
      const result = matchHealthPayload({ [key]: 4 }, METRICS, DEFAULT_DATE);
      expect(result.imported[0]?.metricId, `key "${key}" should match`).toBe('deep-work');
    }
  });

  test('imports several keys in one payload', () => {
    const result = matchHealthPayload(
      { sleep: 7.6, steps: 9336, 'deep-work': 4 },
      METRICS,
      DEFAULT_DATE,
    );
    expect(result.imported.map((i) => i.metricId).sort()).toEqual(['deep-work', 'sleep', 'steps']);
  });

  test('imports to an inactive metric too', () => {
    // The matcher is deliberately blind to active state: values are stored and
    // surface later when the metric is toggled on.
    const metrics = [{ id: 'energy', name: 'Energy' }];
    const result = matchHealthPayload({ energy: 8 }, metrics, DEFAULT_DATE);
    expect(result.imported).toHaveLength(1);
  });

  test('resolves the first metric in array order on a tie', () => {
    const metrics = [
      { id: 'first', name: 'Shared' },
      { id: 'second', name: 'Shared' },
    ];
    const result = matchHealthPayload({ Shared: 1 }, metrics, DEFAULT_DATE);
    expect(result.imported[0].metricId).toBe('first');
  });

  test('preserves the original key alongside the resolved metric id', () => {
    const result = matchHealthPayload({ 'DEEP WORK': 4 }, METRICS, DEFAULT_DATE);
    expect(result.imported[0]).toEqual({ metricId: 'deep-work', key: 'DEEP WORK', value: 4 });
  });
});

describe('matchHealthPayload — value coercion', () => {
  test('accepts a numeric string', () => {
    // Shortcuts frequently send numbers as text.
    const result = matchHealthPayload({ steps: '9336' }, METRICS, DEFAULT_DATE);
    expect(result.imported[0].value).toBe(9336);
  });

  test('accepts a decimal string', () => {
    const result = matchHealthPayload({ sleep: '7.6' }, METRICS, DEFAULT_DATE);
    expect(result.imported[0].value).toBe(7.6);
  });

  test('accepts zero and negative numbers', () => {
    const result = matchHealthPayload({ steps: 0, sleep: -1 }, METRICS, DEFAULT_DATE);
    expect(result.imported.map((i) => i.value).sort((a, b) => a - b)).toEqual([-1, 0]);
  });

  test('rejects an empty or whitespace-only string', () => {
    // Number('') is 0, so this must be rejected explicitly or a blank Shortcut
    // field would silently import a real, wrong zero.
    for (const value of ['', '   ']) {
      const result = matchHealthPayload({ steps: value }, METRICS, DEFAULT_DATE);
      expect(result.imported).toEqual([]);
      expect(result.ignored).toHaveLength(1);
      expect(result.ignored[0].key).toBe('steps');
      // Named specifically: an empty value is a Shortcut wiring problem, not a
      // typo, and saying so points at the action that needs fixing.
      expect(result.ignored[0].reason).toContain('empty value');
    }
  });

  test('rejects non-numeric text', () => {
    const result = matchHealthPayload({ steps: 'abc' }, METRICS, DEFAULT_DATE);
    expect(result.ignored).toEqual([{ key: 'steps', reason: 'non-numeric value' }]);
  });

  test('rejects booleans, null, arrays, and objects', () => {
    const payload = { a: true, b: null, c: [1], d: { v: 1 } };
    const metrics = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
      { id: 'd', name: 'D' },
    ];
    const result = matchHealthPayload(payload, metrics, DEFAULT_DATE);
    expect(result.imported).toEqual([]);
    expect(result.ignored).toHaveLength(4);
    expect(result.ignored.every((i) => i.reason === 'non-numeric value')).toBe(true);
  });

  test('rejects NaN and Infinity', () => {
    const result = matchHealthPayload(
      { sleep: Number.NaN, steps: Number.POSITIVE_INFINITY },
      METRICS,
      DEFAULT_DATE,
    );
    expect(result.imported).toEqual([]);
    expect(result.ignored).toHaveLength(2);
  });

  test('looks for the metric before judging the value', () => {
    // Reversed deliberately: readability is unit-dependent now (a duration is
    // valid for an hours metric, meaningless for a count), so a value cannot be
    // judged before its metric is known. An unmatched key reports the missing
    // metric — the problem that actually has to be fixed first.
    const result = matchHealthPayload({ nonsense: 'abc' }, METRICS, DEFAULT_DATE);
    expect(result.ignored).toEqual([{ key: 'nonsense', reason: 'no matching metric' }]);
  });
});

describe('matchHealthPayload — unmatched keys', () => {
  test('ignores a numeric key with no matching metric', () => {
    const result = matchHealthPayload({ heartRate: 62 }, METRICS, DEFAULT_DATE);
    expect(result.imported).toEqual([]);
    expect(result.ignored).toEqual([{ key: 'heartRate', reason: 'no matching metric' }]);
  });

  test('imports the good keys and reports the bad ones in one pass', () => {
    // The real-world Shortcut case: some fields land, some do not, and the
    // response has to say which so the failure is never silent.
    const result = matchHealthPayload(
      { sleep: 7.6, heartRate: 62, steps: 'abc' },
      METRICS,
      DEFAULT_DATE,
    );
    expect(result.imported).toEqual([{ metricId: 'sleep', key: 'sleep', value: 7.6 }]);
    expect(result.ignored).toEqual([
      { key: 'heartRate', reason: 'no matching metric' },
      { key: 'steps', reason: 'non-numeric value' },
    ]);
  });

  test('a duration sent to a metric that does not exist blames the metric, not the value', () => {
    // The regression this test exists for: posting {"screenTime": "3h 24m"} to
    // a database without a Screen Time metric reported 'non-numeric value',
    // which sent the user looking for a formatting mistake in a string that was
    // formatted perfectly. The metric was simply missing.
    const result = matchHealthPayload({ screenTime: '3h 24m' }, METRICS, DEFAULT_DATE);
    expect(result.imported).toEqual([]);
    expect(result.ignored).toEqual([{ key: 'screenTime', reason: 'no matching metric' }]);
  });

  test('handles an empty metric list', () => {
    const result = matchHealthPayload({ sleep: 7.6 }, [], DEFAULT_DATE);
    expect(result.imported).toEqual([]);
    expect(result.ignored).toEqual([{ key: 'sleep', reason: 'no matching metric' }]);
  });
});

describe('matchHealthPayload — date handling', () => {
  test('uses the default date when the payload has none', () => {
    expect(matchHealthPayload({ sleep: 7.6 }, METRICS, DEFAULT_DATE).date).toBe(DEFAULT_DATE);
  });

  test('uses a valid payload date when present', () => {
    // Lets the Shortcut backfill yesterday's sleep when it runs after midnight.
    const result = matchHealthPayload({ date: '2026-06-29', sleep: 7.6 }, METRICS, DEFAULT_DATE);
    expect(result.date).toBe('2026-06-29');
  });

  test('falls back to the default date when the payload date is malformed', () => {
    for (const bad of ['06/29/2026', '2026-6-9', 'yesterday', '', '2026-06-29T10:00:00Z']) {
      const result = matchHealthPayload({ date: bad, sleep: 7.6 }, METRICS, DEFAULT_DATE);
      expect(result.date, `"${bad}" should not be accepted`).toBe(DEFAULT_DATE);
    }
  });

  test('falls back to the default date when the payload date is not a string', () => {
    const result = matchHealthPayload({ date: 20260629, sleep: 7.6 }, METRICS, DEFAULT_DATE);
    expect(result.date).toBe(DEFAULT_DATE);
  });

  test('never treats "date" as a metric, even when it is malformed', () => {
    // The key is reserved: it must not appear in imported OR ignored, or the
    // response would report a phantom failure on every single import.
    const result = matchHealthPayload({ date: 'yesterday', sleep: 7.6 }, METRICS, DEFAULT_DATE);
    expect(result.imported.some((i) => i.key === 'date')).toBe(false);
    expect(result.ignored.some((i) => i.key === 'date')).toBe(false);
  });

  test('never treats a valid "date" as a metric either', () => {
    const result = matchHealthPayload({ date: '2026-06-29' }, METRICS, DEFAULT_DATE);
    expect(result.imported).toEqual([]);
    expect(result.ignored).toEqual([]);
  });
});

describe('matchHealthPayload — edge cases', () => {
  test('handles an empty payload', () => {
    const result = matchHealthPayload({}, METRICS, DEFAULT_DATE);
    expect(result).toEqual({ date: DEFAULT_DATE, imported: [], ignored: [] });
  });

  test('does not mutate the payload or the metric list', () => {
    const payload = { sleep: 7.6, junk: 'abc' };
    const metrics = [...METRICS];
    const payloadCopy = { ...payload };

    matchHealthPayload(payload, metrics, DEFAULT_DATE);

    expect(payload).toEqual(payloadCopy);
    expect(metrics).toEqual(METRICS);
  });

  test('is deterministic across repeated calls', () => {
    const payload = { sleep: 7.6, steps: 9336, junk: 'abc', heartRate: 62 };
    const first = matchHealthPayload(payload, METRICS, DEFAULT_DATE);
    const second = matchHealthPayload(payload, METRICS, DEFAULT_DATE);
    expect(first).toEqual(second);
  });

  test('accounts for every payload key exactly once', () => {
    // Nothing may be silently dropped: imported + ignored must cover the whole
    // payload (minus the reserved date key).
    const payload = { sleep: 7.6, steps: 9336, junk: 'abc', heartRate: 62, date: '2026-06-29' };
    const result = matchHealthPayload(payload, METRICS, DEFAULT_DATE);

    const accounted = [...result.imported.map((i) => i.key), ...result.ignored.map((i) => i.key)];
    const expected = Object.keys(payload).filter((k) => k !== 'date');

    expect(accounted.sort()).toEqual(expected.sort());
  });
});
