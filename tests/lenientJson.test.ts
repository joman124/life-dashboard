import { describe, expect, test } from 'vitest';
import { parseLenientJson } from '@/lib/health/lenientJson';

/** Build a string with the invisible characters spelled out, so the test is readable. */
const CURLY_OPEN = '“';
const CURLY_CLOSE = '”';
const CURLY_APOS_OPEN = '‘';
const CURLY_APOS_CLOSE = '’';
const NBSP = ' ';
const NARROW_NBSP = ' ';

describe('parseLenientJson — valid input is never touched', () => {
  test('parses ordinary JSON with no repairs', () => {
    const r = parseLenientJson('{"steps": 9336, "sleep": 7.6}');
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toEqual({ steps: 9336, sleep: 7.6 });
    expect(r.ok && r.repairs).toEqual([]);
  });

  test('a legitimate curly quote INSIDE a valid string survives untouched', () => {
    // The strict-parse-first rule is what protects this: the input is already
    // valid, so no repair ever runs and the apostrophe is preserved.
    const r = parseLenientJson(`{"note": "it${CURLY_APOS_CLOSE}s fine"}`);
    expect(r.ok && r.value).toEqual({ note: `it${CURLY_APOS_CLOSE}s fine` });
    expect(r.ok && r.repairs).toEqual([]);
  });

  test('tolerates surrounding whitespace', () => {
    expect(parseLenientJson('  \n {"steps": 1} \n ').ok).toBe(true);
  });
});

describe('parseLenientJson — phone and paste damage', () => {
  test('repairs curly double quotes, the iOS Smart Punctuation case', () => {
    const r = parseLenientJson(
      `{${CURLY_OPEN}screenTime${CURLY_CLOSE}: ${CURLY_OPEN}3h 24m${CURLY_CLOSE}}`,
    );
    expect(r.ok && r.value).toEqual({ screenTime: '3h 24m' });
    expect(r.ok && r.repairs.join()).toContain('curly double quotes');
  });

  test('repairs curly single quotes used as delimiters', () => {
    const r = parseLenientJson(
      `{${CURLY_APOS_OPEN}screenTime${CURLY_APOS_CLOSE}: ${CURLY_APOS_OPEN}3h 24m${CURLY_APOS_CLOSE}}`,
    );
    expect(r.ok && r.value).toEqual({ screenTime: '3h 24m' });
  });

  test('repairs a non-breaking space, which is invisible on screen', () => {
    const r = parseLenientJson(`{"screenTime":${NBSP}"3h 24m"}`);
    expect(r.ok && r.value).toEqual({ screenTime: '3h 24m' });
    expect(r.ok && r.repairs.join()).toContain('non-breaking');
  });

  test('repairs a narrow no-break space', () => {
    expect(parseLenientJson(`{"steps":${NARROW_NBSP}9336}`).ok).toBe(true);
  });

  test('strips a markdown code fence picked up when copying', () => {
    const r = parseLenientJson('```json\n{"steps": 9336}\n```');
    expect(r.ok && r.value).toEqual({ steps: 9336 });
    expect(r.ok && r.repairs.join()).toContain('code fence');
  });

  test('strips a bare fence with no language tag', () => {
    expect(parseLenientJson('```\n{"steps": 9336}\n```').ok).toBe(true);
  });

  test('removes a trailing comma', () => {
    const r = parseLenientJson('{"steps": 9336,}');
    expect(r.ok && r.value).toEqual({ steps: 9336 });
    expect(r.ok && r.repairs.join()).toContain('trailing comma');
  });

  test('converts single-quoted JSON when no double quote is present', () => {
    const r = parseLenientJson("{'steps': 9336}");
    expect(r.ok && r.value).toEqual({ steps: 9336 });
  });

  test('does NOT guess when both quote styles are present', () => {
    // "it's" contains an apostrophe; blindly swapping quotes would corrupt it.
    // Better to fail loudly than to import mangled data.
    const r = parseLenientJson(`{"note": "it's fine",,}`);
    expect(r.ok).toBe(false);
  });

  test('handles several corruptions at once', () => {
    const r = parseLenientJson(
      '```json\n' + `{${CURLY_OPEN}steps${CURLY_CLOSE}:${NBSP}9336,}` + '\n```',
    );
    expect(r.ok && r.value).toEqual({ steps: 9336 });
    expect(r.ok && r.repairs.length).toBeGreaterThanOrEqual(3);
  });
});

describe('parseLenientJson — failures name the problem', () => {
  test('an empty box says so plainly', () => {
    const r = parseLenientJson('   ');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('empty');
  });

  test('unrecoverable input still asks for straight quotes', () => {
    const r = parseLenientJson('steps are 9336');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('straight quotes');
  });

  test('points at the offending text', () => {
    const r = parseLenientJson('{"steps": 9336 "sleep": 7.6}');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('The problem is around');
  });

  test('non-object JSON parses here and is rejected by the caller', () => {
    // Shape enforcement belongs to the route, which returns its own message;
    // this parser's only job is to turn text into a value.
    expect(parseLenientJson('[1,2,3]').ok).toBe(true);
    expect(parseLenientJson('42').ok).toBe(true);
  });
});

/**
 * Form-encoded bodies are handled in the route (via URLSearchParams) rather
 * than here, but the shape they produce has to survive the matcher — every
 * value arrives as a string, including numbers.
 */
describe('form-encoded payload shape', () => {
  test('URLSearchParams produces the flat string map the matcher expects', () => {
    const parsed = Object.fromEntries(new URLSearchParams('screenTime=3h+24m&steps=9336'));
    expect(parsed).toEqual({ screenTime: '3h 24m', steps: '9336' });
  });

  test('an empty form field yields an empty string, not a missing key', () => {
    // This is what makes the "empty value" diagnosis reachable for Form bodies
    // as well as JSON ones.
    expect(Object.fromEntries(new URLSearchParams('screenTime='))).toEqual({ screenTime: '' });
  });
});
