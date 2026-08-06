import { describe, expect, test } from 'vitest';
import { compactValue, formatGoal, formatValue, unitSuffix } from '@/app/components/format';

describe('formatValue', () => {
  test('rounds hours and minutes to one decimal', () => {
    expect(formatValue(4, 'h')).toBe('4');
    expect(formatValue(4.46, 'h')).toBe('4.5');
    expect(formatValue(42.04, 'm')).toBe('42');
  });

  test('renders count as a separated integer', () => {
    expect(formatValue(8450, 'count')).toBe('8,450');
    expect(formatValue(9336.7, 'count')).toBe('9,337');
  });

  test('renders a /10 score to one decimal', () => {
    expect(formatValue(7, '/10')).toBe('7');
  });

  test('separates thousands for custom units and keeps one decimal', () => {
    expect(formatValue(1250, 'pages')).toBe('1,250');
    expect(formatValue(1250.46, 'pages')).toBe('1,250.5');
    expect(formatValue(3.5, 'miles')).toBe('3.5');
  });

  test('drops a trailing .0 for whole custom values', () => {
    // "12 pages" reads right; "12.0 pages" reads like a measurement error.
    expect(formatValue(12, 'pages')).toBe('12');
  });
});

describe('unitSuffix', () => {
  test('count has no suffix — the number stands alone', () => {
    expect(unitSuffix('count')).toBe('');
  });

  test('builtins are their own suffix', () => {
    expect(unitSuffix('h')).toBe('h');
    expect(unitSuffix('m')).toBe('m');
    expect(unitSuffix('/10')).toBe('/10');
  });

  test('a custom label is rendered verbatim', () => {
    expect(unitSuffix('pages')).toBe('pages');
    expect(unitSuffix('$')).toBe('$');
  });
});

describe('formatGoal', () => {
  test('uses ≥ and ≤ symbols', () => {
    expect(formatGoal(4, 'h', '>=')).toBe('Goal ≥ 4.0h');
    expect(formatGoal(5, 'h', '<=')).toBe('Goal ≤ 5.0h');
  });

  test('separates a count goal', () => {
    expect(formatGoal(8000, 'count', '>=')).toBe('Goal ≥ 8,000');
  });

  test('renders a /10 goal as a fraction', () => {
    expect(formatGoal(7, '/10', '>=')).toBe('Goal ≥ 7/10');
  });

  test('spaces a custom unit off the number', () => {
    expect(formatGoal(20, 'pages', '>=')).toBe('Goal ≥ 20 pages');
    expect(formatGoal(1500, 'steps', '>=')).toBe('Goal ≥ 1,500 steps');
  });
});

describe('compactValue', () => {
  test('abbreviates thousands for count', () => {
    expect(compactValue(8450, 'count')).toBe('8.5k');
    expect(compactValue(950, 'count')).toBe('950');
  });

  test('abbreviates thousands for custom units too', () => {
    // Chart labels are the tightest space in the app; a custom unit gets the
    // same treatment as count or a 5-digit number overruns its tick.
    expect(compactValue(8450, 'pages')).toBe('8.5k');
    expect(compactValue(12, 'pages')).toBe('12');
  });

  test('leaves hour and minute values unabbreviated', () => {
    expect(compactValue(4.5, 'h')).toBe('4.5');
  });
});
