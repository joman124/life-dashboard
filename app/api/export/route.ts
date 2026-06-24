/**
 * GET /api/export — full data export (all metrics + all entries) as a JSON
 * download attachment.
 */
import { NextResponse } from 'next/server';
import { listAllEntries, listMetrics } from '@/lib/db';
import { jsonError, toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const payload = {
      exportedAt: new Date().toISOString(),
      metrics: listMetrics(),
      entries: listAllEntries(),
    };
    return NextResponse.json(payload, {
      headers: {
        'Content-Disposition': 'attachment; filename="life-dashboard-export.json"',
      },
    });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
