/**
 * GET /api/timeline?date=YYYY-MM-DD — that day's timeline items ordered by time.
 * Default date = today. Empty in Phase 1 (Google sync populates it in Phase 2).
 */
import { NextResponse } from 'next/server';
import { listTimelineForDate } from '@/lib/db';
import { jsonError, toErrorMessage } from '@/lib/http';
import { ISO_DATE_RE } from '@/lib/validate';
import { todayISO } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('date');
    let date = todayISO();
    if (raw !== null) {
      if (!ISO_DATE_RE.test(raw)) return jsonError('"date" must be a YYYY-MM-DD string.', 400);
      date = raw;
    }
    return NextResponse.json(listTimelineForDate(date));
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
