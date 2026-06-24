/**
 * GET /api/connectors/health — Apple Health connector panel data for the Track
 * tab. Returns the bearer token the user pastes into their iOS Shortcut, the
 * webhook path, and the timestamp of the last successful import (or null).
 *
 * Returning the token to the local UI is by design: this is a single-user,
 * unauthenticated localhost app, and the Connectors panel must display the
 * token so it can be copied into the Shortcut. The token is generated lazily on
 * first read here. Side-effect-free aside from that first-run creation, so the
 * UI can poll it cheaply.
 */
import { NextResponse } from 'next/server';
import { getSyncValue } from '@/lib/db';
import { getOrCreateHealthToken } from '@/lib/health/token';
import { jsonError, toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({
      token: getOrCreateHealthToken(),
      endpoint: '/api/health-import',
      lastImport: getSyncValue('last_health_import'),
    });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
