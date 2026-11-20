// Writes through the real libSQL client to a throwaway local file DB.
// TURSO_DATABASE_URL is emptied so lib/db/client.ts never reaches a remote
// database, and process.cwd() points at a temp dir so data/life-dashboard.db
// is created there, not in the project.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'focus-check-'));
process.env.TURSO_DATABASE_URL = '';
vi.spyOn(process, 'cwd').mockReturnValue(tmp);

const { getFocusChecks, saveFocusCheck } = await import('@/lib/focusCheckStore');
const { setWeeklyFocus } = await import('@/lib/weeklyFocusStore');
const { getSyncValue } = await import('@/lib/db');

beforeAll(() => {
  expect(fs.existsSync(path.join(process.cwd(), 'data'))).toBe(false);
});

afterAll(() => {
  vi.restoreAllMocks();
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    // the libSQL handle can keep the file locked on Windows; the OS temp dir cleans up.
  }
});

describe('focus check store (local DB)', () => {
  it('starts empty', async () => {
    expect(await getFocusChecks()).toEqual({});
  });

  it('saves a rating with the focus it closes, and replaces it on re-rate', async () => {
    await setWeeklyFocus('finish chapter 3');
    await saveFocusCheck('2026-11-18', { rating: 'partly', note: 'lost Thursday' });
    expect(await getFocusChecks()).toEqual({
      '2026-11-16': { rating: 'partly', note: 'lost Thursday', focus: 'finish chapter 3' },
    });

    await saveFocusCheck('2026-11-22', { rating: 'held', note: '' });
    const after = await getFocusChecks();
    expect(Object.keys(after)).toEqual(['2026-11-16']);
    expect(after['2026-11-16'].rating).toBe('held');
  });

  it('keeps earlier weeks and stores one JSON row', async () => {
    await saveFocusCheck('2026-11-25', { rating: 'missed', note: 'sick' });
    const checks = await getFocusChecks();
    expect(Object.keys(checks).sort()).toEqual(['2026-11-16', '2026-11-23']);
    expect(JSON.parse((await getSyncValue('focus_checks'))!)).toEqual(checks);
    expect(fs.existsSync(path.join(tmp, 'data', 'life-dashboard.db'))).toBe(true);
  });
});
