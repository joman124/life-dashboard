import { describe, expect, test } from 'vitest';
import { isTimeUnit, looksLikeDuration, parseDuration } from '@/lib/health/duration';
import { matchHealthPayload } from '@/lib/health/match';

describe('isTimeUnit', () => {
  test('accepts only the two time units', () => {
    expect(isTimeUnit('h')).toBe(true);
    expect(isTimeUnit('m')).toBe(true);
    expect(isTimeUnit('count')).toBe(false);
    expect(isTimeUnit('/10')).toBe(false);
    expect(isTimeUnit(undefined)).toBe(false);
  });
});

describe('looksLikeDuration', () => {
  test('true only when a unit letter or colon is present', () => {
    expect(looksLikeDuration('3h 24m')).toBe(true);
    expect(looksLikeDuration('3:24')).toBe(true);
    expect(looksLikeDuration('45min')).toBe(true);
    // A bare number must stay on the plain numeric path.
    expect(looksLikeDuration('3.4')).toBe(false);
    expect(looksLikeDuration('9336')).toBe(false);
  });
});

describe('parseDuration to hours', () => {
  test('parses what Screen Time actually displays', () => {
    expect(parseDuration('3h 24m', 'h')).toBe(3.4);
    expect(parseDuration('3h24m', 'h')).toBe(3.4);
    expect(parseDuration('3 h 24 m', 'h')).toBe(3.4);
  });

  test('accepts the long and short unit spellings, any casing', () => {
    expect(parseDuration('3hr 24min', 'h')).toBe(3.4);
    expect(parseDuration('3 hours 24 minutes', 'h')).toBe(3.4);
    expect(parseDuration('3HRS 24MINS', 'h')).toBe(3.4);
  });

  test('accepts the comma separator iOS uses in some locales', () => {
    expect(parseDuration('3 hr, 24 min', 'h')).toBe(3.4);
    expect(parseDuration('3h, 24m', 'h')).toBe(3.4);
  });

  test('accepts hours only and minutes only', () => {
    expect(parseDuration('3h', 'h')).toBe(3);
    expect(parseDuration('45m', 'h')).toBe(0.75);
    expect(parseDuration('204m', 'h')).toBe(3.4);
  });

  test('accepts the colon form', () => {
    expect(parseDuration('3:24', 'h')).toBe(3.4);
    expect(parseDuration('0:45', 'h')).toBe(0.75);
    expect(parseDuration('12:00', 'h')).toBe(12);
  });

  test('accepts a fractional hour', () => {
    expect(parseDuration('3.5h', 'h')).toBe(3.5);
  });

  test('rounds to two decimals rather than emitting float noise', () => {
    expect(parseDuration('3h 25m', 'h')).toBe(3.42);
    expect(parseDuration('1h 1m', 'h')).toBe(1.02);
  });
});

describe('parseDuration to minutes', () => {
  test('converts the other direction for minute-based metrics', () => {
    expect(parseDuration('3h 24m', 'm')).toBe(204);
    expect(parseDuration('45m', 'm')).toBe(45);
    expect(parseDuration('1:30', 'm')).toBe(90);
  });
});

describe('parseDuration rejects non-durations', () => {
  test('returns null for text, empty input, and malformed colons', () => {
    expect(parseDuration('', 'h')).toBeNull();
    expect(parseDuration('   ', 'h')).toBeNull();
    expect(parseDuration('a while', 'h')).toBeNull();
    expect(parseDuration('3:99', 'h')).toBeNull(); // 99 is not a minute count
    expect(parseDuration('3h 24m extra', 'h')).toBeNull();
    expect(parseDuration('h', 'h')).toBeNull(); // unit letter with no number
  });
});

describe('matchHealthPayload — duration strings', () => {
  const METRICS = [
    { id: 'screen-time', name: 'Screen Time', unit: 'h' },
    { id: 'sleep', name: 'Sleep', unit: 'h' },
    { id: 'meditation', name: 'Meditation', unit: 'm' },
    { id: 'steps', name: 'Steps', unit: 'count' },
  ];
  const DATE = '2026-08-13';

  test('imports Screen Time typed exactly as iOS shows it', () => {
    const r = matchHealthPayload({ 'screen-time': '3h 24m' }, METRICS, DATE);
    expect(r.imported).toEqual([{ metricId: 'screen-time', key: 'screen-time', value: 3.4 }]);
  });

  test('matches the metric by name with a space, as a Shortcut would send it', () => {
    const r = matchHealthPayload({ 'Screen Time': '2:15' }, METRICS, DATE);
    expect(r.imported[0]).toMatchObject({ metricId: 'screen-time', value: 2.25 });
  });

  test('converts into the metric’s own unit, not always hours', () => {
    const r = matchHealthPayload({ meditation: '1h 30m' }, METRICS, DATE);
    expect(r.imported[0]).toMatchObject({ metricId: 'meditation', value: 90 });
  });

  test('a bare number still means the metric’s unit, unchanged', () => {
    expect(matchHealthPayload({ 'screen-time': 3.4 }, METRICS, DATE).imported[0]).toMatchObject({
      value: 3.4,
    });
    expect(matchHealthPayload({ 'screen-time': '3.4' }, METRICS, DATE).imported[0]).toMatchObject({
      value: 3.4,
    });
  });

  test('does not apply duration parsing to a non-time metric', () => {
    // "9h" against a count metric is nonsense, and must not become 9.
    const r = matchHealthPayload({ steps: '9h' }, METRICS, DATE);
    expect(r.imported).toHaveLength(0);
    // And the reason says why, rather than the unhelpful 'non-numeric value':
    // the string is fine, it's the pairing with a count metric that isn't.
    expect(r.ignored[0].key).toBe('steps');
    expect(r.ignored[0].reason).toContain('measured in count');
  });

  test('an unparseable duration names the formats that would work', () => {
    const r = matchHealthPayload({ 'screen-time': 'about three hours' }, METRICS, DATE);
    expect(r.imported).toHaveLength(0);
    expect(r.ignored[0].reason).toContain('3h 24m');
    expect(r.ignored[0].reason).toContain('about three hours');
  });

  test('echoes long junk in truncated form rather than dumping it', () => {
    const r = matchHealthPayload({ 'screen-time': 'h'.repeat(120) }, METRICS, DATE);
    expect(r.ignored[0].reason).toContain('…');
    expect(r.ignored[0].reason.length).toBeLessThan(140);
  });

  test('an empty value blames the Shortcut wiring, not the format', () => {
    // {"screenTime": ""} is what a Shortcut posts when the Provided Input
    // variable never got inserted into the Text action.
    const r = matchHealthPayload({ 'screen-time': '' }, METRICS, DATE);
    expect(r.imported).toHaveLength(0);
    expect(r.ignored[0].reason).toContain('empty value');
  });

  test('an unmatched key reports the missing metric, not a value problem', () => {
    const r = matchHealthPayload({ nonsense: 'abc' }, METRICS, DATE);
    expect(r.ignored).toEqual([{ key: 'nonsense', reason: 'no matching metric' }]);
  });

  test('a full morning payload mixes durations, counts, and valence', () => {
    const r = matchHealthPayload(
      { steps: 9336, sleep: '7h 36m', 'screen-time': '3h 24m' },
      METRICS,
      DATE,
    );
    expect(r.imported).toEqual([
      { metricId: 'steps', key: 'steps', value: 9336 },
      { metricId: 'sleep', key: 'sleep', value: 7.6 },
      { metricId: 'screen-time', key: 'screen-time', value: 3.4 },
    ]);
  });
});

describe('matchHealthPayload — Shortcuts wiring mistakes', () => {
  const METRICS = [{ id: 'screen-time', name: 'Screen Time', unit: 'h' }];
  const DATE = '2026-08-16';

  test('names the mistake when a variable was typed instead of inserted', () => {
    for (const literal of ['Provided Input', 'provided input', 'Ask for Input', 'Text']) {
      const r = matchHealthPayload({ 'screen-time': literal }, METRICS, DATE);
      expect(r.imported).toHaveLength(0);
      expect(r.ignored[0].reason).toContain('typed as text rather than inserted');
    }
  });

  test('does not mistake a real duration for a placeholder', () => {
    expect(matchHealthPayload({ 'screen-time': '3h 24m' }, METRICS, DATE).imported).toHaveLength(1);
  });

  test('tolerates a trailing space inside the quotes', () => {
    // {"screenTime": "<var> "} — a stray space before the closing quote is easy
    // to leave in when hand-building the JSON, and harmless.
    expect(matchHealthPayload({ 'screen-time': '3h 24m ' }, METRICS, DATE).imported[0]).toMatchObject(
      { value: 3.4 },
    );
  });
});
