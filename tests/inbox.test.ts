import { describe, expect, test } from 'vitest';
import { parseInboxDigest } from '@/lib/inbox';

const TODAY = '2026-08-06';

const blob = (date: string, messages: unknown[]) => JSON.stringify({ date, messages });

const msg = (over: Record<string, unknown> = {}) => ({
  from: 'Jane Doe',
  subject: 'Q3 planning',
  time: '08:40',
  ...over,
});

describe('parseInboxDigest', () => {
  test('returns the messages when the stamp is today', () => {
    const out = parseInboxDigest(blob(TODAY, [msg()]), TODAY);
    expect(out).toEqual([{ from: 'Jane Doe', subject: 'Q3 planning', time: '08:40' }]);
  });

  test('drops a digest stamped with any other date', () => {
    // The heading and the count beside this list both say "today". Serving
    // yesterday's mail there is a lie the reader cannot detect.
    expect(parseInboxDigest(blob('2026-08-05', [msg()]), TODAY)).toEqual([]);
    expect(parseInboxDigest(blob('2026-08-07', [msg()]), TODAY)).toEqual([]);
  });

  test('returns empty for missing input', () => {
    expect(parseInboxDigest(null, TODAY)).toEqual([]);
    expect(parseInboxDigest('', TODAY)).toEqual([]);
  });

  test('returns empty rather than throwing on non-JSON', () => {
    expect(parseInboxDigest('not json {{', TODAY)).toEqual([]);
  });

  test('returns empty for JSON that is not an object', () => {
    for (const raw of ['null', '42', '"text"', '[]']) {
      expect(parseInboxDigest(raw, TODAY)).toEqual([]);
    }
  });

  test('returns empty when messages is missing or not an array', () => {
    expect(parseInboxDigest(JSON.stringify({ date: TODAY }), TODAY)).toEqual([]);
    expect(parseInboxDigest(JSON.stringify({ date: TODAY, messages: 'nope' }), TODAY)).toEqual([]);
  });

  test('skips individual rows missing a sender or subject', () => {
    const raw = blob(TODAY, [msg(), { from: 'No Subject Person' }, { subject: 'orphan' }, null, 7]);
    const out = parseInboxDigest(raw, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].subject).toBe('Q3 planning');
  });

  test('tolerates a row with no time', () => {
    const out = parseInboxDigest(blob(TODAY, [msg({ time: undefined })]), TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].time).toBe('');
  });

  test('preserves order as stored', () => {
    const raw = blob(TODAY, [msg({ subject: 'first' }), msg({ subject: 'second' })]);
    expect(parseInboxDigest(raw, TODAY).map((m) => m.subject)).toEqual(['first', 'second']);
  });
});
