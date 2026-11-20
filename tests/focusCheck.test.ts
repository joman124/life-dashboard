import { describe, expect, it } from 'vitest';
import {
  KEEP_WEEKS,
  MAX_NOTE_LEN,
  checkWeek,
  historyStrip,
  latestCheck,
  parseCheckInput,
  parseChecks,
  stripTally,
  withCheck,
  type FocusChecks,
} from '@/lib/focusCheck';
import { addDays } from '@/lib/dates';

const held = { rating: 'held' as const, note: '', focus: 'ship it' };

describe('parseCheckInput', () => {
  it('accepts each rating and tidies the note to one capped line', () => {
    expect(parseCheckInput({ rating: 'held' })).toEqual({ rating: 'held', note: '' });
    expect(parseCheckInput({ rating: 'partly', note: '  two\n days  off ' })).toEqual({
      rating: 'partly',
      note: 'two days off',
    });
    const long = parseCheckInput({ rating: 'missed', note: 'x'.repeat(500) });
    expect('note' in long && long.note).toHaveLength(MAX_NOTE_LEN);
  });

  it('rejects bad input with a message', () => {
    expect(parseCheckInput(null)).toHaveProperty('error');
    expect(parseCheckInput({ rating: 'great' })).toHaveProperty('error');
    expect(parseCheckInput({ rating: 'held', note: 5 })).toHaveProperty('error');
  });
});

describe('parseChecks', () => {
  it('reads empty, broken and malformed storage as nothing', () => {
    expect(parseChecks(null)).toEqual({});
    expect(parseChecks('not json')).toEqual({});
    expect(parseChecks('[1]')).toEqual({});
  });

  it('keeps valid weeks and skips bad ones', () => {
    const raw = JSON.stringify({
      '2026-11-16': { rating: 'held', note: 'good', focus: 'f' },
      '2026-11-09': { rating: 'nope' },
      junk: { rating: 'held' },
      '2026-11-02': { rating: 'missed' },
    });
    expect(parseChecks(raw)).toEqual({
      '2026-11-16': { rating: 'held', note: 'good', focus: 'f' },
      '2026-11-02': { rating: 'missed', note: '', focus: '' },
    });
  });
});

describe('checkWeek', () => {
  it('is the Monday of the ISO week, Sunday included', () => {
    expect(checkWeek('2026-11-18')).toBe('2026-11-16'); // Wednesday
    expect(checkWeek('2026-11-22')).toBe('2026-11-16'); // Sunday
    expect(checkWeek('2026-11-16')).toBe('2026-11-16'); // Monday
  });
});

describe('withCheck', () => {
  it('replaces the same week without mutating the input', () => {
    const before: FocusChecks = { '2026-11-16': held };
    const after = withCheck(before, '2026-11-16', { ...held, rating: 'missed' });
    expect(after['2026-11-16'].rating).toBe('missed');
    expect(before['2026-11-16'].rating).toBe('held');
  });

  it(`drops weeks older than ${KEEP_WEEKS}`, () => {
    const week = '2026-11-16';
    const oldest = addDays(week, -7 * (KEEP_WEEKS - 1));
    const tooOld = addDays(oldest, -7);
    const out = withCheck({ [oldest]: held, [tooOld]: held }, week, held);
    expect(Object.keys(out).sort()).toEqual([oldest, week]);
  });
});

describe('historyStrip, stripTally, latestCheck', () => {
  const checks: FocusChecks = {
    '2026-11-16': held,
    '2026-11-02': { ...held, rating: 'partly' },
    '2026-09-21': { ...held, rating: 'missed' }, // 9 weeks back: outside the strip
  };

  it('lists 8 weeks oldest → newest, unrated as null', () => {
    const strip = historyStrip(checks, '2026-11-18');
    expect(strip).toHaveLength(8);
    expect(strip[0].week).toBe('2026-09-28');
    expect(strip[7]).toEqual({ week: '2026-11-16', rating: 'held' });
    expect(strip[5]).toEqual({ week: '2026-11-02', rating: 'partly' });
    expect(strip.filter((s) => s.rating === null)).toHaveLength(6);
  });

  it('tallies only the rated weeks in the strip', () => {
    expect(stripTally(historyStrip(checks, '2026-11-18'))).toEqual({
      held: 1,
      partly: 1,
      missed: 0,
      rated: 2,
    });
  });

  it('latest is the newest rated week, or null', () => {
    expect(latestCheck(checks)).toEqual({ week: '2026-11-16', ...held });
    expect(latestCheck({})).toBeNull();
  });
});
