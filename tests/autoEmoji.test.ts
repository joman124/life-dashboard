import { describe, expect, test } from 'vitest';
import { autoEmoji } from '@/lib/autoEmoji';

describe('autoEmoji — keyword matching', () => {
  test('matches a plain keyword', () => {
    expect(autoEmoji('Sleep')).toBe('😴');
    expect(autoEmoji('Water')).toBe('💧');
    expect(autoEmoji('Gym')).toBe('🏋️');
  });

  test('is case-insensitive', () => {
    expect(autoEmoji('SLEEP')).toBe('😴');
    expect(autoEmoji('sleep')).toBe('😴');
    expect(autoEmoji('SlEeP')).toBe('😴');
  });

  test('trims surrounding whitespace', () => {
    expect(autoEmoji('   sleep   ')).toBe('😴');
  });

  test('matches a keyword anywhere inside the name', () => {
    expect(autoEmoji('Hours of sleep last night')).toBe('😴');
    expect(autoEmoji('Morning gym session')).toBe('🏋️');
  });

  test('matches partial stems', () => {
    // "writ" covers write/writing/written; "meditat" covers meditate/meditation.
    expect(autoEmoji('Writing')).toBe('✍️');
    expect(autoEmoji('Write')).toBe('✍️');
    expect(autoEmoji('Meditation')).toBe('🧘');
    expect(autoEmoji('Meditate')).toBe('🧘');
  });

  test('matches any keyword in a multi-keyword rule', () => {
    expect(autoEmoji('Walk')).toBe('👟');
    expect(autoEmoji('Steps')).toBe('👟');
    expect(autoEmoji('Pray')).toBe('🙏');
    expect(autoEmoji('Gratitude')).toBe('🙏');
  });

  test('prefers the earlier rule when two could match', () => {
    // "deep work" is listed first specifically so it is not shadowed by a
    // later rule that might also match part of the phrase.
    expect(autoEmoji('Deep Work')).toBe('🧠');
    expect(autoEmoji('Focus')).toBe('🧠');
  });

  test('matches multi-word keywords', () => {
    expect(autoEmoji('deep work hours')).toBe('🧠');
  });

  test('covers the documented keyword vocabulary', () => {
    const expected: Record<string, string> = {
      'deep work': '🧠',
      meditation: '🧘',
      running: '🏃',
      walking: '👟',
      gym: '🏋️',
      reading: '📚',
      writing: '✍️',
      water: '💧',
      sleep: '😴',
      phone: '📵',
      prayer: '🙏',
      'cold plunge': '🧊',
      stretching: '🤸',
      meals: '🍽️',
      sunlight: '☀️',
      family: '❤️',
      money: '💰',
      learning: '🎓',
      music: '🎵',
      code: '⚙️',
      'sales calls': '📞',
      energy: '⚡',
      dog: '🐕',
      alpaca: '🦙',
    };

    for (const [name, emoji] of Object.entries(expected)) {
      expect(autoEmoji(name), `"${name}" should map to ${emoji}`).toBe(emoji);
    }
  });
});

describe('autoEmoji — fallback', () => {
  const FALLBACK = ['🎯', '✨', '📈', '🌱', '🧩', '🔆'];

  test('returns a fallback emoji when nothing matches', () => {
    expect(FALLBACK).toContain(autoEmoji('qqqzzz'));
  });

  test('is deterministic for the same name', () => {
    // The same custom metric name must always show the same emoji, or the
    // preview would flicker between renders.
    const name = 'Alpha Beta Gamma';
    const first = autoEmoji(name);
    for (let i = 0; i < 5; i++) expect(autoEmoji(name)).toBe(first);
  });

  test('is case- and whitespace-insensitive in the fallback path too', () => {
    expect(autoEmoji('  QqqZzz  ')).toBe(autoEmoji('qqqzzz'));
  });

  test('spreads different names across the fallback set', () => {
    const names = ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff', 'ggg', 'hhh'];
    const used = new Set(names.map(autoEmoji));
    // Not a uniformity guarantee — just proof it is not collapsing to one.
    expect(used.size).toBeGreaterThan(1);
  });

  test('always returns a non-empty string', () => {
    for (const name of ['', ' ', 'x', '123', '!!!', 'ünïcödé', '🎈']) {
      expect(autoEmoji(name).length).toBeGreaterThan(0);
    }
  });

  test('handles an empty name without throwing', () => {
    expect(() => autoEmoji('')).not.toThrow();
    expect(FALLBACK).toContain(autoEmoji(''));
  });
});
