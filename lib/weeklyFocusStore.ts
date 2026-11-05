/**
 * lib/weeklyFocusStore.ts — server-side read/write of the weekly focus.
 *
 * Stored as a single sync_state row rather than its own column/table: it is one
 * singleton string, and sync_state is already the app's key/value store (last
 * sync time, inbox count). Kept apart from lib/weeklyFocus.ts so client code
 * can import that file without pulling the SQLite layer into the browser bundle.
 */
import { getSyncValue, setSyncValue } from '@/lib/db';
import { normalizeFocus } from '@/lib/weeklyFocus';

const KEY = 'weekly_focus';

/** The current focus, or '' when none has been set. */
export async function getWeeklyFocus(): Promise<string> {
  return (await getSyncValue(KEY)) ?? '';
}

/** Persist the focus after normalizing; returns the stored value. */
export async function setWeeklyFocus(input: unknown): Promise<string> {
  const value = normalizeFocus(input);
  await setSyncValue(KEY, value);
  return value;
}
