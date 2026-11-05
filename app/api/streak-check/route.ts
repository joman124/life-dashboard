/**
 * GET /api/streak-check — the 8pm "a broken streak should be a choice" nudge.
 *
 * Finds every active daily metric that is on a streak but has no entry for today
 * (lib/streakRisk) and pushes one notification per streak through the configured
 * webhook (lib/push). Meant to run once a day from the vercel.json cron at 20:00
 * dashboard time (03:00 UTC, UTC-7). Also callable by hand with a bearer token.
 *
 * Auth: like /api/brief and /api/health-import, this runs with no browser
 * session, so middleware exempts the path and the route authenticates itself.
 * It accepts a bearer token (Authorization: Bearer <t>, else ?token=<t>) that
 * matches STREAK_CHECK_TOKEN or CRON_SECRET — the latter is what Vercel Cron
 * injects automatically, so setting CRON_SECRET is all the scheduled run needs.
 * With neither set it fails closed (401), never open.
 *
 * The response always reports what it found and whether delivery succeeded, so
 * a run that detected streaks but could not deliver is visible, not silent.
 */
import { NextResponse } from 'next/server';
import { listMetrics, listEntriesBetween } from '@/lib/db';
import { atRiskStreaks } from '@/lib/streakRisk';
import { notify } from '@/lib/push';
import { safeEqual } from '@/lib/appAuth';
import { extractBearerToken } from '@/lib/apiToken';
import { jsonError, toErrorMessage } from '@/lib/http';
import { todayISO, addDays } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** True if the presented token matches any configured secret (constant time). */
function authorized(presented: string): boolean {
  const secrets = [process.env.STREAK_CHECK_TOKEN, process.env.CRON_SECRET].filter(
    (s): s is string => !!s,
  );
  return secrets.some((secret) => safeEqual(presented, secret));
}

export async function GET(req: Request) {
  try {
    const presented = extractBearerToken(req);
    if (!presented || !authorized(presented)) {
      return jsonError('Invalid or missing bearer token', 401);
    }

    const today = todayISO();
    const [metrics, entries] = await Promise.all([
      listMetrics(),
      // A streak only needs recent history to confirm it is alive; 60 days is
      // ample for any daily run worth warning about.
      listEntriesBetween(addDays(today, -60), today),
    ]);

    const atRisk = atRiskStreaks(metrics, entries, today);
    const delivery = await notify(atRisk.map((r) => r.message));

    return NextResponse.json({ date: today, atRisk, delivery });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
