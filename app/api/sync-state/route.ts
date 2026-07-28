/**
 * GET /api/sync-state — connector sync metadata.
 * Reads sync_state keys `last_google_sync` / `today_inbox_count`; both are
 * null in Phase 1 (populated by Google sync in Phase 2).
 */
import { NextResponse } from 'next/server';
import { getSyncValue } from '@/lib/db';
import { jsonError, toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const lastGoogleSync = await getSyncValue('last_google_sync');
    const inboxRaw = await getSyncValue('today_inbox_count');
    const parsed = inboxRaw === null ? NaN : Number(inboxRaw);
    const todayInboxCount = Number.isFinite(parsed) ? parsed : null;
    return NextResponse.json({ lastGoogleSync, todayInboxCount });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
