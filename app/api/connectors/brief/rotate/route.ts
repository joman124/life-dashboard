/**
 * POST /api/connectors/brief/rotate — issue a new brief read token,
 * invalidating the previous one.
 *
 * The brief token travels in a URL that gets pasted into a scheduled task, so
 * it is the likeliest of the two tokens to end up somewhere it should not be.
 * After rotating, the URL stored in the Cowork task has to be replaced or the
 * next morning's brief fetch returns 401.
 */
import { NextResponse } from 'next/server';
import { rotateBriefToken } from '@/lib/briefToken';
import { jsonError, toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return NextResponse.json({ token: await rotateBriefToken() });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
