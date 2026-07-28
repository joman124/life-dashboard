/**
 * POST /api/health-import — Apple Health push webhook.
 *
 * Apple Health (HealthKit) is on-device only with no cloud API, so the
 * integration is a push: an iOS Shortcut on the user's phone POSTs a flat JSON
 * object of metric → value pairs to this endpoint each morning.
 *
 * Auth: a shared bearer token (see lib/health/token.ts). Presented either as
 *   Authorization: Bearer <token>
 * or, as a fallback for Shortcut setups that can't set headers, ?token=<token>.
 * Header is tried first. A missing/incorrect token → 401 (constant-time check).
 *
 * Body: a plain JSON object like {"steps":9336,"sleep":7.6}. An optional `date`
 * (YYYY-MM-DD) overrides today. Keys are matched case/space/separator-
 * insensitively against metric id and name; non-matching or non-numeric keys
 * are reported in `ignored` rather than failing the request.
 *
 * Writes are idempotent: each imported value upserts on (metricId, date), so a
 * re-POST overwrites rather than duplicating.
 */
import { NextResponse } from 'next/server';
import { listMetrics, upsertEntry, setSyncValue, getSyncValue } from '@/lib/db';
import { matchHealthPayload } from '@/lib/health/match';
import { verifyHealthToken } from '@/lib/health/token';
import { jsonError, toErrorMessage } from '@/lib/http';
import { todayISO } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Extract the presented token: Authorization: Bearer <token>, else ?token=. */
function extractToken(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  const qp = new URL(req.url).searchParams.get('token');
  return qp && qp.length > 0 ? qp : null;
}

export async function POST(req: Request) {
  try {
    // --- auth ---
    const presented = extractToken(req);
    if (!presented || !(await verifyHealthToken(presented))) {
      return jsonError('Invalid or missing bearer token', 401);
    }

    // --- body ---
    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return jsonError('Body must be a JSON object like {"steps":9336,"sleep":7.6}', 400);
    }

    // --- match + persist ---
    const result = matchHealthPayload(body as Record<string, unknown>, await listMetrics(), todayISO());
    for (const { metricId, value } of result.imported) {
      await upsertEntry(metricId, result.date, value);
    }

    const lastImport = new Date().toISOString();
    await setSyncValue('last_health_import', lastImport);

    return NextResponse.json({
      date: result.date,
      imported: result.imported.map((i) => ({ metricId: i.metricId, value: i.value })),
      ignored: result.ignored,
      importedCount: result.imported.length,
      lastImport: (await getSyncValue('last_health_import')) ?? lastImport,
    });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
