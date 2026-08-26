/**
 * GET /api/brief — the week-so-far read, for the Cowork morning brief.
 *
 * The dashboard is a thing you open. The morning brief is a thing that arrives.
 * This endpoint is how the second one reads the first: a scheduled Claude task
 * fetches it, and folds the week's shape and today's focus into the page it
 * renders before anyone has opened a tab.
 *
 * Auth: a read-only bearer token of its own (lib/briefToken.ts), presented
 * either as
 *   Authorization: Bearer <token>
 * or ?token=<token> for callers that cannot set headers — which most web-fetch
 * tools cannot, so the query form is the one the setup instructions hand out.
 * Because it authenticates itself, this path is exempt from the password gate
 * in middleware.ts, exactly as /api/health-import is.
 *
 * Read-only by construction: it opens no write path, and the token it accepts
 * is not the one that can push health data.
 *
 * Formats:
 *   ?format=json  (default) — the full structured payload, for a caller that
 *                             wants to phrase the numbers in its own words.
 *   ?format=text            — the same brief as Markdown, for a caller that
 *                             flattens everything to text anyway, and for
 *                             checking by eye that this works before wiring
 *                             anything to it.
 */
import { NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/apiToken';
import { verifyBriefToken } from '@/lib/briefToken';
import { buildBrief, renderBriefText } from '@/lib/brief';
import { todayISO } from '@/lib/dates';
import { listAllEntries, listMetrics, setSyncValue } from '@/lib/db';
import { jsonError, toErrorMessage } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const presented = extractBearerToken(req);
    if (!presented || !(await verifyBriefToken(presented))) {
      return jsonError(
        'Invalid or missing brief token. Copy the current one from the dashboard: Track tab → Connectors → Morning brief.',
        401,
      );
    }

    const url = new URL(req.url);
    const format = (url.searchParams.get('format') ?? 'json').toLowerCase();
    if (format !== 'json' && format !== 'text') {
      return jsonError(`Unknown format "${format}". Use format=json or format=text.`, 400);
    }

    const brief = buildBrief(await listMetrics(), await listAllEntries(), todayISO(), {
      dashboardUrl: url.origin,
    });

    // A write on a GET, deliberately: without it there is no way to tell a
    // scheduled task that is quietly 401ing from one that simply has not fired
    // yet. The Connectors panel shows this timestamp for exactly that reason.
    await setSyncValue('last_brief_fetch', new Date().toISOString());

    if (format === 'text') {
      return new NextResponse(renderBriefText(brief), {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          // The brief is a snapshot of a day in progress. A cached copy served
          // to tomorrow's run would be worse than no brief at all.
          'cache-control': 'no-store',
        },
      });
    }

    return NextResponse.json(brief, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
