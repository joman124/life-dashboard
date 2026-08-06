/**
 * GET /api/sync-state — connector sync metadata for the dashboard shell.
 *
 * Reads sync_state keys `last_google_sync`, `today_inbox_count` and
 * `today_inbox_digest`. All are null/empty until a Google sync has run.
 *
 * The digest is stored stamped with the date it describes and is returned only
 * when that date is still today — see lib/inbox.ts for why.
 */
import { NextResponse } from 'next/server';
import { getSyncValue } from '@/lib/db';
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

    return NextResponse.json({ lastGoogleSync, todayInboxCount, inboxDigest });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
