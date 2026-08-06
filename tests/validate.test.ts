import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MAX,
  DEFAULT_STEP,
  ISO_DATE_RE,
  MAX_UNIT_LENGTH,
  isBuiltinUnit,
  isCategory,
  isFiniteNumber,
  isGoalDirection,
  isUnit,
  maxFor,
  normalizeUnit,
  slugify,
  stepFor,
} from '@/lib/validate';

describe('ISO_DATE_RE', () => {
  test('accepts a well-formed YYYY-MM-DD date', () => {
    expect(ISO_DATE_RE.test('2026-06-30')).toBe(true);
  });

  test('rejects unpadded, reordered, or timestamped forms', () => {
    for (const bad of ['2026-6-30', '06-30-2026', '2026/06/30', '2026-06-30T00:00:00Z', '', 'x']) {
      expect(ISO_DATE_RE.test(bad), `"${bad}" should be rejected`).toBe(false);
    }
  });
});

describe('isUnit', () => {
  test('accepts every builtin unit', () => {
    for (const unit of ['h', 'm', 'count', '/10']) {
      expect(isUnit(unit), `"${unit}" should be a unit`).toBe(true);
    }
  });

  test('accepts custom labels', () => {
    for (const unit of ['pages', 'reps', 'miles', '$', 'fl oz', 'glasses']) {
      expect(isUnit(unit), `"${unit}" should be accepted`).toBe(true);
    }
  });

  test('rejects empty and whitespace-only labels', () => {
    for (const bad of ['', '   ', '\t']) {
      expect(isUnit(bad)).toBe(false);
    }
  });

  test('rejects labels longer than the display budget', () => {
    expect(isUnit('a'.repeat(MAX_UNIT_LENGTH))).toBe(true);
    expect(isUnit('a'.repeat(MAX_UNIT_LENGTH + 1))).toBe(false);
  });

  test('rejects labels containing line breaks or tabs', () => {
    // These are rendered inline next to the value; a break wrecks every card.
    for (const bad of ['pa\nges', 'pa\tges', 'pa\rges']) {
      expect(isUnit(bad)).toBe(false);
    }
  });

  test('rejects non-string values', () => {
    for (const bad of [1, null, undefined, {}, ['h'], true]) {
      expect(isUnit(bad)).toBe(false);
    }
  });
});

describe('isBuiltinUnit', () => {
  test('separates builtins from custom labels', () => {
    expect(isBuiltinUnit('h')).toBe(true);
    expect(isBuiltinUnit('/10')).toBe(true);
    expect(isBuiltinUnit('pages')).toBe(false);
    expect(isBuiltinUnit('hours')).toBe(false);
  });
});

describe('normalizeUnit', () => {
  test('trims surrounding whitespace', () => {
    expect(normalizeUnit('  pages  ')).toBe('pages');
  });

  test('leaves internal spacing alone', () => {
    expect(normalizeUnit(' fl oz ')).toBe('fl oz');
  });
});

describe('stepFor / maxFor', () => {
  test('use the builtin defaults for builtin units', () => {
    expect(stepFor('h')).toBe(DEFAULT_STEP.h);
    expect(maxFor('/10')).toBe(DEFAULT_MAX['/10']);
  });

  test('give custom units whole-number steps', () => {
    // 0.5 is a sane nudge for hours and nonsense for pages.
    expect(stepFor('pages')).toBe(1);
    expect(maxFor('pages')).toBeGreaterThan(0);
  });

  test('keep max reachable in whole steps for custom units', () => {
    expect(Number.isInteger(maxFor('pages') / stepFor('pages'))).toBe(true);
  });
});

describe('isGoalDirection', () => {
  test('accepts the two supported directions', () => {
    expect(isGoalDirection('>=')).toBe(true);
    expect(isGoalDirection('<=')).toBe(true);
  });

  test('rejects anything else', () => {
    for (const bad of ['>', '<', '==', '=>', '', null, undefined, 1]) {
      expect(isGoalDirection(bad)).toBe(false);
    }
  });
});

describe('isCategory', () => {
  test('accepts every supported category', () => {
    for (const category of ['FOCUS', 'BODY', 'MIND', 'CUSTOM']) {
      expect(isCategory(category), `"${category}" should be a category`).toBe(true);
    }
  });

  test('is case-sensitive', () => {
    expect(isCategory('focus')).toBe(false);
  });

  test('rejects unknown or non-string values', () => {
    for (const bad of ['OTHER', '', null, undefined, 1, {}]) {
      expect(isCategory(bad)).toBe(false);
    }
  });
});

describe('isFiniteNumber', () => {
  test('accepts finite numbers including zero and negatives', () => {
    for (const n of [0, 1, -1, 7.5, 1e6]) {
      expect(isFiniteNumber(n)).toBe(true);
    }
  });

  test('rejects NaN and both infinities', () => {
    for (const n of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(isFiniteNumber(n)).toBe(false);
    }
  });

  test('rejects numeric strings and other types', () => {
    // Deliberately strict: request bodies must send real JSON numbers.
    for (const bad of ['1', '', null, undefined, true, {}, []]) {
      expect(isFiniteNumber(bad)).toBe(false);
    }
  });
});

describe('slugify', () => {
  test('lowercases and hyphenates', () => {
    expect(slugify('Deep Work')).toBe('deep-work');
  });

  test('collapses runs of separators into a single hyphen', () => {
    expect(slugify('Deep   Work')).toBe('deep-work');
    expect(slugify('Deep___Work')).toBe('deep-work');
    expect(slugify('Deep -- Work')).toBe('deep-work');
  });

  test('strips leading and trailing hyphens', () => {
    expect(slugify('  Deep Work  ')).toBe('deep-work');
    expect(slugify('---Deep Work---')).toBe('deep-work');
  });

  test('drops punctuation and symbols', () => {
    expect(slugify('Deep Work!')).toBe('deep-work');
    expect(slugify("Today's Focus")).toBe('today-s-focus');
  });

  test('keeps digits', () => {
    expect(slugify('VO2 Max')).toBe('vo2-max');
  });

  test('never returns an empty string', () => {
    // An empty id would collide across every unnamed metric and break the
    // metrics primary key, so there is a guaranteed fallback.
    for (const name of ['', '   ', '!!!', '---', '🎈']) {
      expect(slugify(name), `"${name}" should still produce an id`).toBe('metric');
    }
  });

  test('produces a value safe for use in a URL path segment', () => {
    for (const name of ['Deep Work', "Today's Focus", 'VO2 Max', '!!!']) {
      const slug = slugify(name);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(encodeURIComponent(slug)).toBe(slug);
    }
  });

  test('is idempotent', () => {
    const once = slugify('Deep Work!');
    expect(slugify(once)).toBe(once);
  });
});

describe('unit defaults', () => {
  test('every unit has a step and a max', () => {
    for (const unit of ['h', 'm', 'count', '/10'] as const) {
      expect(DEFAULT_STEP[unit]).toBeGreaterThan(0);
      expect(DEFAULT_MAX[unit]).toBeGreaterThan(0);
    }
  });

  test('each max is a whole number of steps above zero', () => {
    // The stepper walks 0 → max in `step` increments; a non-integral ratio
    // would make the top of the range unreachable.
    for (const unit of ['h', 'm', 'count', '/10'] as const) {
      const ratio = DEFAULT_MAX[unit] / DEFAULT_STEP[unit];
      expect(Number.isInteger(ratio), `${unit}: max/step = ${ratio}`).toBe(true);
    }
  });

  test('a /10 rating maxes out at 10', () => {
    expect(DEFAULT_MAX['/10']).toBe(10);
    expect(DEFAULT_STEP['/10']).toBe(1);
  });
});
