/**
 * POST /api/auth/google/disconnect — forget the Google connection.
 * Deletes the stored token and clears the sync_state values derived from it so
 * the UI doesn't show a stale inbox count / last-sync after disconnecting.
 */
import { NextResponse } from 'next/server';
import { deleteOAuthToken, deleteSyncValue } from '@/lib/db';
import { jsonError, toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    deleteOAuthToken('google');
    deleteSyncValue('today_inbox_count');
    deleteSyncValue('last_google_sync');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
