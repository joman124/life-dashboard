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
 * `stateOfMind` (and its aliases) is special-cased: Apple Journal / Health store
 * State of Mind as a -1..+1 valence, which is rescaled onto the Mood metric's
 * 1–10 scale before it is written. See lib/health/stateOfMind.ts.
 *
 * Writes are idempotent: each imported value upserts on (metricId, date), so a
 * re-POST overwrites rather than duplicating.
 */
import { NextResponse } from 'next/server';
import { listMetrics, upsertEntry, setSyncValue, getSyncValue } from '@/lib/db';
import { parseLenientJson } from '@/lib/health/lenientJson';
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
    // Parsed leniently rather than with req.json(): the Shortcut's Text action
    // is typed on an iOS keyboard, where Smart Punctuation silently turns " into
    // curly quotes and breaks the JSON. A strict parse is still tried first, so
    // a well-formed body is never altered; repairs are reported back so a
    // Shortcut producing them can be corrected instead of relied on.
    const rawBody = await req.text().catch(() => '');

    // Form-encoded bodies are accepted as well as JSON. Not for API tidiness:
    // in the iOS Shortcuts UI, "Request Body: Form" is a flat list of key/value
    // rows where dropping a variable into the value is one tap, whereas the
    // JSON body editor nests the value behind a field-type picker and silently
    // accepts an empty box. Offering both means a user who cannot get the
    // variable to stick in one editor has a working alternative rather than a
    // dead end.
    let body: unknown;
    let repairs: string[] = [];
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      body = Object.fromEntries(new URLSearchParams(rawBody));
    } else {
      const parse = parseLenientJson(rawBody);
      if (!parse.ok) {
        return jsonError(parse.error, 400);
      }
      body = parse.value;
      repairs = parse.repairs;
    }

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
      // `note` is present only when the stored value differs from what was
      // posted (a State of Mind valence rescaled to 1–10), so the response
      // explains the number rather than leaving it to be worked out.
      imported: result.imported.map((i) => ({
        metricId: i.metricId,
        value: i.value,
        ...(i.note ? { note: i.note } : {}),
      })),
      ignored: result.ignored,
      // Present only when the body needed fixing to parse. Surfaced so a
      // Shortcut quietly emitting curly quotes is visible rather than masked.
      ...(repairs.length > 0 ? { repairs } : {}),
      importedCount: result.imported.length,
      lastImport: (await getSyncValue('last_health_import')) ?? lastImport,
    });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
