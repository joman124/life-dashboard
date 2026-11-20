/**
 * lib/focusCheckStore.ts — server-side read/write of the end-of-week focus checks.
 *
 * All weeks live in one sync_state row as JSON, the same key/value pattern as
 * the weekly focus. Kept apart from lib/focusCheck.ts so client code can import
 * that file without pulling the database layer into the browser bundle.
 */
import { getSyncValue, setSyncValue } from '@/lib/db';
import {
  checkWeek,
  parseChecks,
  withCheck,
  type FocusChecks,
  type FocusRating,
} from '@/lib/focusCheck';
import { getWeeklyFocus } from '@/lib/weeklyFocusStore';

const KEY = 'focus_checks';

export async function getFocusChecks(): Promise<FocusChecks> {
  return parseChecks(await getSyncValue(KEY));
}

/** Rate the week containing `today`, replacing any earlier rating of it. Returns all checks. */
export async function saveFocusCheck(
  today: string,
  check: { rating: FocusRating; note: string },
): Promise<FocusChecks> {
  const [checks, focus] = await Promise.all([getFocusChecks(), getWeeklyFocus()]);
  const next = withCheck(checks, checkWeek(today), { ...check, focus });
  await setSyncValue(KEY, JSON.stringify(next));
  return next;
}
