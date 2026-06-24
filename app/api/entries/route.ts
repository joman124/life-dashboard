/**
 * GET  /api/entries?days=N — entries in the trailing N-day window ending today
 *                            (inclusive). Default N = 30.
 * POST /api/entries        — upsert { metricId, value, date? } on (metricId, date).
 */
import { NextResponse } from 'next/server';
import { getMetricById, listEntriesBetween, upsertEntry } from '@/lib/db';
import { jsonError, toErrorMessage } from '@/lib/http';
import { ISO_DATE_RE, isFiniteNumber } from '@/lib/validate';
import { addDays, todayISO } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('days');
    let days = 30;
    if (raw !== null) {
      days = Number(raw);
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        return jsonError('"days" must be an integer between 1 and 3650.', 400);
      }
    }
    const end = todayISO();
    const start = addDays(end, -(days - 1));
    return NextResponse.json(listEntriesBetween(start, end));
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return jsonError('Request body must be a JSON object.', 400);
    }

    const metricId = typeof body.metricId === 'string' ? body.metricId.trim() : '';
    if (!metricId) return jsonError('"metricId" is required and must be a non-empty string.', 400);

    const value = body.value;
    if (!isFiniteNumber(value)) return jsonError('"value" must be a finite number.', 400);

    let date = todayISO();
    if (body.date !== undefined) {
      if (typeof body.date !== 'string' || !ISO_DATE_RE.test(body.date)) {
        return jsonError('"date" must be a YYYY-MM-DD string.', 400);
      }
      date = body.date;
    }

    if (!getMetricById(metricId)) {
      return jsonError(`Unknown metric id "${metricId}".`, 404);
    }

    return NextResponse.json(upsertEntry(metricId, date, value));
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
