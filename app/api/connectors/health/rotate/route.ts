/**
 * POST /api/connectors/health/rotate — issue a new Apple Health import token,
 * invalidating the previous one. The user calls this from the Connectors panel
 * if the old token may have leaked; afterward they must update their iOS
 * Shortcut with the returned value (old token immediately stops working).
 */
import { NextResponse } from 'next/server';
import { rotateHealthToken } from '@/lib/health/token';
import { jsonError, toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return NextResponse.json({ token: await rotateHealthToken() });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
