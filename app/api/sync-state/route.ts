/**
 * GET  /api/sync-state — shell state for the dashboard: connector sync metadata
 *                        plus the week's focus line.
 * POST /api/sync-state — set the week's focus ({ weeklyFocus: string }).
 *
 * Reads sync_state keys `last_google_sync`, `today_inbox_count`,
 * `today_inbox_digest` and `weekly_focus`. The first three are null/empty until
 * a Google sync has run; the focus is '' until the user sets it.
 *
 * The digest is stored stamped with the date it describes and is returned only
 * when that date is still today — see lib/inbox.ts for why.
 */
import { NextResponse } from 'next/server';
import { getSyncValue } from '@/lib/db';
import { getWeeklyFocus, setWeeklyFocus } from '@/lib/weeklyFocusStore';
import { jsonError, toErrorMessage } from '@/lib/http';
import { todayISO } from '@/lib/dates';
import { parseInboxDigest } from '@/lib/inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const lastGoogleSync = await getSyncValue('last_google_sync');

    const inboxRaw = await getSyncValue('today_inbox_count');
    const parsed = inboxRaw === null ? NaN : Number(inboxRaw);
    const todayInboxCount = Number.isFinite(parsed) ? parsed : null;

    const inboxDigest = parseInboxDigest(await getSyncValue('today_inbox_digest'), todayISO());
    const weeklyFocus = await getWeeklyFocus();

    return NextResponse.json({ lastGoogleSync, todayInboxCount, inboxDigest, weeklyFocus });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || !('weeklyFocus' in body)) {
      return jsonError('Request body must be a JSON object with a "weeklyFocus" field.', 400);
    }
    const weeklyFocus = await setWeeklyFocus(body.weeklyFocus);
    return NextResponse.json({ weeklyFocus });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
