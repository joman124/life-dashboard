import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stand in for the sync_state row so the round trip is real without a database.
let stored: string | null = null;

vi.mock('@/lib/db', () => ({
  getSyncValue: vi.fn(async () => stored),
  setSyncValue: vi.fn(async (_key: string, value: string) => {
    stored = value;
  }),
}));

import { normalizeFocus, MAX_FOCUS_LEN } from '@/lib/weeklyFocus';
import { getWeeklyFocus, setWeeklyFocus } from '@/lib/weeklyFocusStore';

beforeEach(() => {
  stored = null;
});

describe('normalizeFocus', () => {
  it('trims and keeps a plain string', () => {
    expect(normalizeFocus('  finish chapter 3  ')).toBe('finish chapter 3');
  });

  it('coerces non-strings to empty', () => {
    expect(normalizeFocus(undefined)).toBe('');
    expect(normalizeFocus(42)).toBe('');
    expect(normalizeFocus(null)).toBe('');
  });

  it('caps length', () => {
    expect(normalizeFocus('x'.repeat(500))).toHaveLength(MAX_FOCUS_LEN);
  });
});

describe('weekly focus read/write path', () => {
  it('reads empty before anything is set', async () => {
    expect(await getWeeklyFocus()).toBe('');
  });

  it('persists what was set and reads it back', async () => {
    const saved = await setWeeklyFocus('  ship the brief integration  ');
    expect(saved).toBe('ship the brief integration'); // normalized on write
    expect(await getWeeklyFocus()).toBe('ship the brief integration'); // survives the round trip
  });

  it('clears the focus when set to empty', async () => {
    await setWeeklyFocus('something');
    await setWeeklyFocus('');
    expect(await getWeeklyFocus()).toBe('');
  });
});
