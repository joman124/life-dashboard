import { describe, expect, test } from 'vitest';
import { isStateOfMindKey, parseValenceValue, valenceToScore } from '@/lib/health/stateOfMind';
import { matchHealthPayload } from '@/lib/health/match';

describe('isStateOfMindKey', () => {
  test('recognizes the spellings a Shortcut is likely to produce', () => {
    for (const k of [
      'stateofmind',
      'stateofmindvalence',
      'valence',
      'moodvalence',
      'journalmood',
      'journalstateofmind',
    ]) {
      expect(isStateOfMindKey(k)).toBe(true);
    }
  });

  test('does NOT capture the plain mood key, which carries a 1-10 score', () => {
    // This is the whole contract: "mood" is a score, "stateOfMind" is a valence.
    expect(isStateOfMindKey('mood')).toBe(false);
  });

  test('ignores unrelated keys', () => {
    expect(isStateOfMindKey('steps')).toBe(false);
    expect(isStateOfMindKey('')).toBe(false);
  });
});

describe('valenceToScore', () => {
  test('maps the endpoints and midpoint of the valence range onto 1-10', () => {
    expect(valenceToScore(-1)).toBe(1);
    expect(valenceToScore(0)).toBe(5.5);
    expect(valenceToScore(1)).toBe(10);
  });

  test('is monotonic across the range', () => {
    const scores = [-1, -0.5, 0, 0.5, 1].map(valenceToScore);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  test('rounds to one decimal rather than truncating', () => {
    expect(valenceToScore(0.6)).toBe(8.2);
    expect(valenceToScore(-0.5)).toBe(3.3); // exactly 3.25 -> 3.3
  });

  test('two adjacent Journal faces stay distinguishable after rounding', () => {
    // The seven labels sit ~0.286 valence apart; if rounding collapsed them the
    // metric could not tell "Pleasant" from "Slightly Pleasant".
    expect(valenceToScore(0.286)).not.toBe(valenceToScore(0.571));
  });
});

describe('parseValenceValue', () => {
  test('accepts a number and converts it', () => {
    const r = parseValenceValue(0.6);
    expect(r).toMatchObject({ ok: true, score: 8.2, valence: 0.6, samples: 1 });
  });

  test('accepts a numeric string', () => {
    expect(parseValenceValue('-1')).toMatchObject({ ok: true, score: 1 });
  });

  test('accepts each of the seven Journal labels, in any casing or spacing', () => {
    expect(parseValenceValue('Very Pleasant')).toMatchObject({ ok: true, valence: 0.857 });
    expect(parseValenceValue('very pleasant')).toMatchObject({ ok: true, valence: 0.857 });
    expect(parseValenceValue('Slightly Unpleasant')).toMatchObject({ ok: true, valence: -0.286 });
    expect(parseValenceValue('Neutral')).toMatchObject({ ok: true, score: 5.5 });
    expect(parseValenceValue('VeryUnpleasant')).toMatchObject({ ok: true, valence: -0.857 });
  });

  test('averages a list of samples, which is what Shortcuts returns', () => {
    const r = parseValenceValue([0.2, 0.6]);
    expect(r).toMatchObject({ ok: true, valence: 0.4, samples: 2 });
    expect(r.ok && r.score).toBe(7.3);
  });

  test('averages a mixed list of labels and numbers', () => {
    expect(parseValenceValue(['Neutral', 1])).toMatchObject({ ok: true, valence: 0.5, samples: 2 });
  });

  test('refuses a value outside the valence range instead of clamping it', () => {
    // A 0-10 score posted under a valence key would otherwise silently become
    // a perfect day. Rejecting it makes the mistake visible in `ignored`.
    expect(parseValenceValue(7).ok).toBe(false);
    expect(parseValenceValue(-1.5).ok).toBe(false);
  });

  test('refuses unparseable values and empty input', () => {
    expect(parseValenceValue('happy-ish').ok).toBe(false);
    expect(parseValenceValue('').ok).toBe(false);
    expect(parseValenceValue(null).ok).toBe(false);
    expect(parseValenceValue({}).ok).toBe(false);
    expect(parseValenceValue([]).ok).toBe(false);
    expect(parseValenceValue(Number.NaN).ok).toBe(false);
  });

  test('rejects the whole list if any sample is bad, rather than averaging a subset', () => {
    expect(parseValenceValue([0.5, 'nonsense']).ok).toBe(false);
  });
});

describe('matchHealthPayload — State of Mind integration', () => {
  const METRICS = [
    { id: 'sleep', name: 'Sleep' },
    { id: 'steps', name: 'Steps' },
    { id: 'mood', name: 'Mood' },
  ];
  const DATE = '2026-08-13';

  test('routes a valence key to the mood metric, converted', () => {
    const r = matchHealthPayload({ stateOfMind: 0.6 }, METRICS, DATE);
    expect(r.imported).toHaveLength(1);
    expect(r.imported[0]).toMatchObject({ metricId: 'mood', key: 'stateOfMind', value: 8.2 });
    expect(r.imported[0].note).toContain('8.2/10');
    expect(r.ignored).toHaveLength(0);
  });

  test('matches the valence key case/separator-insensitively', () => {
    expect(matchHealthPayload({ 'state of mind': -1 }, METRICS, DATE).imported[0]).toMatchObject({
      metricId: 'mood',
      value: 1,
    });
    expect(matchHealthPayload({ state_of_mind: 1 }, METRICS, DATE).imported[0]).toMatchObject({
      metricId: 'mood',
      value: 10,
    });
  });

  test('a plain mood key stays on the 1-10 scale and is not converted', () => {
    const r = matchHealthPayload({ mood: 8 }, METRICS, DATE);
    expect(r.imported[0]).toMatchObject({ metricId: 'mood', value: 8 });
    expect(r.imported[0].note).toBeUndefined();
  });

  test('notes the sample count when a list was averaged', () => {
    const r = matchHealthPayload({ stateOfMind: [0.2, 0.6] }, METRICS, DATE);
    expect(r.imported[0].note).toContain('mean of 2 samples');
  });

  test('explains itself when there is no Mood metric to write to', () => {
    const r = matchHealthPayload({ stateOfMind: 0.6 }, [{ id: 'steps', name: 'Steps' }], DATE);
    expect(r.imported).toHaveLength(0);
    expect(r.ignored[0].reason).toContain('no Mood metric');
  });

  test('an out-of-range valence is reported, not silently imported', () => {
    const r = matchHealthPayload({ stateOfMind: 8 }, METRICS, DATE);
    expect(r.imported).toHaveLength(0);
    expect(r.ignored[0]).toMatchObject({ key: 'stateOfMind' });
    expect(r.ignored[0].reason).toContain('between -1 and 1');
  });

  test('coexists with ordinary metric keys in one payload', () => {
    const r = matchHealthPayload(
      { date: DATE, steps: 9336, sleep: '7.6', stateOfMind: 'Pleasant' },
      METRICS,
      '2026-01-01',
    );
    expect(r.date).toBe(DATE);
    expect(r.imported.map((i) => i.metricId).sort()).toEqual(['mood', 'sleep', 'steps']);
    expect(r.ignored).toHaveLength(0);
  });

  test('finds the mood metric by name even if its id was customized', () => {
    const r = matchHealthPayload({ valence: 0 }, [{ id: 'custom-7', name: 'Mood' }], DATE);
    expect(r.imported[0]).toMatchObject({ metricId: 'custom-7', value: 5.5 });
  });
});
