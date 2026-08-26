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
import { extractBearerToken } from '@/lib/apiToken';
import { jsonError, toErrorMessage } from '@/lib/http';
import { todayISO } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Does this text read as `key=value&key=value`? Used only after a JSON parse has
 * already failed, to recognise a form body whose Content-Type didn't announce
 * itself. Deliberately strict — every segment must be a real `key=` pair — so
 * prose or broken JSON is never mistaken for form data.
 */
function looksFormEncoded(raw: string): boolean {
  const s = raw.trim();
  if (s === '' || s.startsWith('{') || s.startsWith('[')) return false;
  return s.split('&').every((pair) => /^[^=&\s]+=[^=&]*$/.test(pair));
}

export async function POST(req: Request) {
  try {
    // --- auth ---
    const presented = extractBearerToken(req);
    if (!presented || !(await verifyHealthToken(presented))) {
      return jsonError('Invalid or missing bearer token', 401);
    }

    // --- body ---
    // Three encodings are accepted, because the iOS Shortcuts "Request Body"
    // picker offers three and each one fails differently:
    //
    //   JSON      — hand-typed in a Text action, where Smart Punctuation turns
    //               " into curly quotes; parsed leniently for that reason.
    //   Form      — a flat key/value list, far easier to drop a variable into,
    //               and sent as EITHER url-encoded or multipart depending on
    //               iOS version and field types. Both are handled.
    //
    // Guessing wrong here produces "that isn't valid JSON" against a body that
    // was perfectly well-formed, just not JSON — a dead end for anyone who
    // followed the Form instructions.
    let body: unknown;
    let repairs: string[] = [];
    const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
    const isForm =
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data');

    if (isForm) {
      // formData() covers url-encoded and multipart alike. File parts are
      // skipped: a metric value is always a scalar.
      const form = await req.formData();
      const flat: Record<string, string> = {};
      for (const [k, v] of form.entries()) {
        if (typeof v === 'string') flat[k] = v;
      }
      body = flat;
    } else {
      const rawBody = await req.text().catch(() => '');
      const parse = parseLenientJson(rawBody);
      if (parse.ok) {
        body = parse.value;
        repairs = parse.repairs;
      } else if (looksFormEncoded(rawBody)) {
        // Form data sent WITHOUT a matching Content-Type — some Shortcuts
        // configurations do this. The shape is unambiguous, so honour it
        // rather than rejecting a body whose meaning is perfectly clear.
        body = Object.fromEntries(new URLSearchParams(rawBody.trim()));
        repairs = ['read the body as form data — its Content-Type did not say so'];
      } else {
        return jsonError(parse.error, 400);
      }
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
