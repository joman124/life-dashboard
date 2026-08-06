import { describe, expect, test } from 'vitest';
import { parseImport } from '@/lib/importer';

/** A minimal valid metric; override fields per test. */
function metric(over: Record<string, unknown> = {}) {
  return {
    id: 'sleep',
    name: 'Sleep',
    emoji: '😴',
    unit: 'h',
    goal: 7.5,
    goalDirection: '>=',
    step: 0.25,
    max: 12,
    active: true,
    category: 'BODY',
    description: 'Hours asleep',
    ...over,
  };
}

function payload(over: Record<string, unknown> = {}) {
  return { exportedAt: '2026-06-30T12:00:00.000Z', metrics: [metric()], entries: [], ...over };
}

/** Assert the parse failed, and return the message. */
function errorOf(raw: unknown): string {
  const result = parseImport(raw);
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.error;
}

describe('parseImport — happy path', () => {
  test('accepts a well-formed export', () => {
    const result = parseImport(payload());
    expect(result.ok).toBe(true);
  });

  test('returns the parsed metrics and entries', () => {
    const result = parseImport(
      payload({ entries: [{ metricId: 'sleep', date: '2026-06-30', value: 7.6 }] }),
    );

    expect(result.ok && result.data.metrics).toHaveLength(1);
    expect(result.ok && result.data.entries).toEqual([
      { metricId: 'sleep', date: '2026-06-30', value: 7.6 },
    ]);
  });

  test('accepts empty metrics and entries arrays', () => {
    expect(parseImport({ metrics: [], entries: [] }).ok).toBe(true);
  });

  test('ignores exportedAt and any other extra keys', () => {
    // The route reads `mode` off the same body, so unknown keys must not be a
    // validation failure.
    expect(parseImport(payload({ mode: 'replace', somethingElse: 1 })).ok).toBe(true);
  });

  test('trims whitespace from ids and names', () => {
    const result = parseImport(
      payload({
        metrics: [metric({ id: '  sleep  ', name: '  Sleep  ' })],
        entries: [{ metricId: '  sleep  ', date: '2026-06-30', value: 7 }],
      }),
    );

    expect(result.ok && result.data.metrics[0].id).toBe('sleep');
    expect(result.ok && result.data.metrics[0].name).toBe('Sleep');
    expect(result.ok && result.data.entries[0].metricId).toBe('sleep');
  });

  test('defaults a missing description to an empty string', () => {
    const m = metric();
    delete (m as Record<string, unknown>).description;
    const result = parseImport(payload({ metrics: [m] }));

    expect(result.ok && result.data.metrics[0].description).toBe('');
  });

  test('accepts an inactive metric', () => {
    const result = parseImport(payload({ metrics: [metric({ active: false })] }));
    expect(result.ok && result.data.metrics[0].active).toBe(false);
  });

  test('round-trips a realistic multi-metric export', () => {
    const result = parseImport({
      exportedAt: '2026-06-30T12:00:00.000Z',
      metrics: [
        metric(),
        metric({ id: 'steps', name: 'Steps', emoji: '👟', unit: 'count', goal: 8000, step: 500, max: 100000, category: 'BODY' }),
      ],
      entries: [
        { metricId: 'sleep', date: '2026-06-29', value: 7.2 },
        { metricId: 'sleep', date: '2026-06-30', value: 8.1 },
        { metricId: 'steps', date: '2026-06-30', value: 9336 },
      ],
    });

    expect(result.ok && result.data.metrics).toHaveLength(2);
    expect(result.ok && result.data.entries).toHaveLength(3);
  });
});

describe('parseImport — malformed envelope', () => {
  test('rejects non-objects', () => {
    for (const bad of [null, undefined, 42, 'text', true, []]) {
      expect(parseImport(bad).ok, `${JSON.stringify(bad)} should be rejected`).toBe(false);
    }
  });

  test('rejects a missing or non-array metrics field', () => {
    expect(errorOf({ entries: [] })).toMatch(/"metrics" must be an array/);
    expect(errorOf({ metrics: {}, entries: [] })).toMatch(/"metrics" must be an array/);
  });

  test('rejects a missing or non-array entries field', () => {
    expect(errorOf({ metrics: [] })).toMatch(/"entries" must be an array/);
    expect(errorOf({ metrics: [], entries: 'no' })).toMatch(/"entries" must be an array/);
  });
});

describe('parseImport — metric validation', () => {
  test('rejects a non-object metric', () => {
    expect(errorOf(payload({ metrics: ['nope'] }))).toMatch(/metrics\[0\] must be an object/);
  });

  test('rejects a missing or blank id', () => {
    expect(errorOf(payload({ metrics: [metric({ id: '' })] }))).toMatch(/metrics\[0\]\.id/);
    expect(errorOf(payload({ metrics: [metric({ id: '   ' })] }))).toMatch(/metrics\[0\]\.id/);
    expect(errorOf(payload({ metrics: [metric({ id: 42 })] }))).toMatch(/metrics\[0\]\.id/);
  });

  test('rejects a duplicate metric id', () => {
    // metrics.id is the primary key; two rows would make the import
    // order-dependent.
    expect(errorOf(payload({ metrics: [metric(), metric()] }))).toMatch(/duplicated in the file/);
  });

  test('rejects a blank name or emoji', () => {
    expect(errorOf(payload({ metrics: [metric({ name: '  ' })] }))).toMatch(/metrics\[0\]\.name/);
    expect(errorOf(payload({ metrics: [metric({ emoji: '' })] }))).toMatch(/metrics\[0\]\.emoji/);
  });

  test('accepts a custom unit label', () => {
    // Custom units are first-class, so "kg" is a legitimate unit to restore.
    expect(parseImport(payload({ metrics: [metric({ unit: 'kg' })] })).ok).toBe(true);
  });

  test('rejects an empty unit', () => {
    expect(errorOf(payload({ metrics: [metric({ unit: '' })] }))).toMatch(/metrics\[0\]\.unit/);
  });

  test('rejects an over-long unit label', () => {
    expect(errorOf(payload({ metrics: [metric({ unit: 'a'.repeat(40) })] }))).toMatch(
      /metrics\[0\]\.unit/,
    );
  });

  test('rejects a non-string unit', () => {
    expect(errorOf(payload({ metrics: [metric({ unit: 7 })] }))).toMatch(/metrics\[0\]\.unit/);
  });

  test('rejects an unknown category', () => {
    expect(errorOf(payload({ metrics: [metric({ category: 'OTHER' })] }))).toMatch(
      /metrics\[0\]\.category/,
    );
  });

  test('rejects an invalid goal direction', () => {
    expect(errorOf(payload({ metrics: [metric({ goalDirection: '>' })] }))).toMatch(
      /metrics\[0\]\.goalDirection/,
    );
  });

  test('rejects a non-finite goal', () => {
    for (const goal of ['7.5', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(errorOf(payload({ metrics: [metric({ goal })] }))).toMatch(/metrics\[0\]\.goal/);
    }
  });

  test('rejects a non-positive step or max', () => {
    // A step of 0 would make the stepper buttons do nothing forever.
    expect(errorOf(payload({ metrics: [metric({ step: 0 })] }))).toMatch(/metrics\[0\]\.step/);
    expect(errorOf(payload({ metrics: [metric({ step: -1 })] }))).toMatch(/metrics\[0\]\.step/);
    expect(errorOf(payload({ metrics: [metric({ max: 0 })] }))).toMatch(/metrics\[0\]\.max/);
  });

  test('rejects a non-boolean active', () => {
    for (const active of [1, 'true', null]) {
      expect(errorOf(payload({ metrics: [metric({ active })] }))).toMatch(/metrics\[0\]\.active/);
    }
  });

  test('rejects a non-string description', () => {
    expect(errorOf(payload({ metrics: [metric({ description: 42 })] }))).toMatch(
      /metrics\[0\]\.description/,
    );
  });

  test('names the offending row index', () => {
    const good = metric();
    const bad = metric({ id: 'steps', unit: '' });
    expect(errorOf(payload({ metrics: [good, bad] }))).toMatch(/metrics\[1\]\.unit/);
  });
});

describe('parseImport — entry validation', () => {
  const withEntries = (entries: unknown[]) => payload({ entries });

  test('rejects a non-object entry', () => {
    expect(errorOf(withEntries(['nope']))).toMatch(/entries\[0\] must be an object/);
  });

  test('rejects an entry whose metric is not in the file', () => {
    // entries.metricId is a foreign key into metrics(id) — importing an orphan
    // would either fail at the database or strand unreachable rows.
    expect(errorOf(withEntries([{ metricId: 'ghost', date: '2026-06-30', value: 1 }]))).toMatch(
      /no matching metric in the file/,
    );
  });

  test('rejects a malformed date', () => {
    for (const date of ['2026-6-30', '06/30/2026', '2026-06-30T00:00:00Z', '', 42, null]) {
      expect(
        errorOf(withEntries([{ metricId: 'sleep', date, value: 1 }])),
        `date ${JSON.stringify(date)} should be rejected`,
      ).toMatch(/entries\[0\]\.date/);
    }
  });

  test('rejects a non-finite value', () => {
    for (const value of ['7.5', null, Number.NaN, Number.POSITIVE_INFINITY, true]) {
      expect(errorOf(withEntries([{ metricId: 'sleep', date: '2026-06-30', value }]))).toMatch(
        /entries\[0\]\.value/,
      );
    }
  });

  test('accepts a value of zero', () => {
    // Zero is a real logged value, distinct from "not logged".
    const result = parseImport(withEntries([{ metricId: 'sleep', date: '2026-06-30', value: 0 }]));
    expect(result.ok).toBe(true);
  });

  test('rejects two entries for the same metric and date', () => {
    // entries has UNIQUE (metricId, date).
    expect(
      errorOf(
        withEntries([
          { metricId: 'sleep', date: '2026-06-30', value: 7 },
          { metricId: 'sleep', date: '2026-06-30', value: 8 },
        ]),
      ),
    ).toMatch(/duplicates sleep on 2026-06-30/);
  });

  test('allows the same date across different metrics', () => {
    const result = parseImport({
      metrics: [metric(), metric({ id: 'steps', name: 'Steps' })],
      entries: [
        { metricId: 'sleep', date: '2026-06-30', value: 7 },
        { metricId: 'steps', date: '2026-06-30', value: 9000 },
      ],
    });
    expect(result.ok).toBe(true);
  });

  test('names the offending row index', () => {
    expect(
      errorOf(
        withEntries([
          { metricId: 'sleep', date: '2026-06-30', value: 7 },
          { metricId: 'sleep', date: 'nope', value: 8 },
        ]),
      ),
    ).toMatch(/entries\[1\]\.date/);
  });
});

describe('parseImport — purity', () => {
  test('does not mutate its input', () => {
    const input = payload({ entries: [{ metricId: 'sleep', date: '2026-06-30', value: 7 }] });
    const snapshot = JSON.parse(JSON.stringify(input));

    parseImport(input);

    expect(input).toEqual(snapshot);
  });

  test('is deterministic', () => {
    const input = payload({ entries: [{ metricId: 'sleep', date: '2026-06-30', value: 7 }] });
    expect(parseImport(input)).toEqual(parseImport(input));
  });

  test('rejects rather than repairing bad data', () => {
    // Import must never guess. A malformed unit is a rejection, not a coercion
    // to some nearby default.
    const result = parseImport(payload({ metrics: [metric({ unit: '   ' })] }));
    expect(result.ok).toBe(false);
  });
});
