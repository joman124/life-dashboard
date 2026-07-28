/**
 * POST /api/reset — delete all logged history (entries + timeline), keeping the
 * metric definitions.
 *
 * This is how the 30-day demo seed gets cleared so a real dashboard stops
 * reporting streaks and correlations computed from generated numbers.
 *
 * Requires { "confirm": true } in the body. The guard exists because this is
 * irreversible and unauthenticated on a LAN-exposed dev server (npm run
 * dev:lan), where a stray POST should not be able to wipe a year of data.
 *
 * 200 { cleared: true, entriesDeleted }
 */
import { NextResponse } from 'next/server';
import { clearAllHistory } from '@/lib/db';
import { jsonError, toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || body.confirm !== true) {
      return jsonError(
        'This permanently deletes all logged history. Send { "confirm": true } to proceed.',
        400,
      );
    }

    const entriesDeleted = await clearAllHistory();
    return NextResponse.json({ cleared: true, entriesDeleted });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
