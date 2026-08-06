import { describe, expect, test } from 'vitest';
import { displayFrom } from '@/lib/google/sync';

describe('displayFrom', () => {
  test('prefers the display name over the address', () => {
    expect(displayFrom('"Jane Doe" <jane@example.com>')).toBe('Jane Doe');
  });

  test('handles an unquoted display name', () => {
    expect(displayFrom('Jane Doe <jane@example.com>')).toBe('Jane Doe');
  });

  test('falls back to the address when there is no display name', () => {
    expect(displayFrom('<jane@example.com>')).toBe('jane@example.com');
    expect(displayFrom('"" <jane@example.com>')).toBe('jane@example.com');
  });

  test('passes through a bare address', () => {
    expect(displayFrom('jane@example.com')).toBe('jane@example.com');
  });

  test('trims surrounding whitespace', () => {
    expect(displayFrom('  Jane Doe <jane@example.com>  ')).toBe('Jane Doe');
  });

  test('keeps punctuation inside a display name', () => {
    expect(displayFrom('"Doe, Jane" <jane@example.com>')).toBe('Doe, Jane');
    expect(displayFrom('"Acme Support (No Reply)" <no-reply@acme.com>')).toBe(
      'Acme Support (No Reply)',
    );
  });

  test('never returns an empty string', () => {
    // The value lands directly in a list row; a blank sender reads as a bug.
    for (const raw of ['', '   ', '<>']) {
      expect(displayFrom(raw), `"${raw}" should still produce a label`).not.toBe('');
    }
  });
});
