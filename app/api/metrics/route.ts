/**
 * GET  /api/metrics — all metrics (active AND inactive), active as boolean.
 * POST /api/metrics — create a custom metric; server derives id + emoji + defaults.
 */
import { NextResponse } from 'next/server';
import { createMetric, getMetricById, listMetrics } from '@/lib/db';
import { jsonError, toErrorMessage } from '@/lib/http';
import {
  MAX_UNIT_LENGTH,
  isCategory,
  isFiniteNumber,
  isGoalDirection,
  isUnit,
  maxFor,
  normalizeUnit,
  slugify,
  stepFor,
} from '@/lib/validate';
import { autoEmoji } from '@/lib/autoEmoji';
import type { Metric } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await listMetrics());
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}

/** First free id for a slug: base, base-2, base-3, ... */
async function uniqueMetricId(base: string): Promise<string> {
  if (!(await getMetricById(base))) return base;
  let n = 2;
  while (await getMetricById(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return jsonError('Request body must be a JSON object.', 400);
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return jsonError('"name" is required and must be a non-empty string.', 400);

    if (!isUnit(body.unit)) {
      return jsonError(
        `"unit" must be a non-empty label of at most ${MAX_UNIT_LENGTH} characters — a builtin (h, m, count, /10) or your own (e.g. "pages").`,
        400,
      );
    }
    const unit = normalizeUnit(body.unit);

    const goal = body.goal;
    if (!isFiniteNumber(goal)) return jsonError('"goal" must be a finite number.', 400);

    const goalDirection = body.goalDirection;
    if (!isGoalDirection(goalDirection)) return jsonError('"goalDirection" must be ">=" or "<=".', 400);

    if (body.emoji !== undefined && typeof body.emoji !== 'string') {
      return jsonError('"emoji" must be a string.', 400);
    }
    if (body.step !== undefined && (!isFiniteNumber(body.step) || body.step <= 0)) {
      return jsonError('"step" must be a positive number.', 400);
    }
    if (body.max !== undefined && (!isFiniteNumber(body.max) || body.max <= 0)) {
      return jsonError('"max" must be a positive number.', 400);
    }
    if (body.category !== undefined && !isCategory(body.category)) {
      return jsonError('"category" must be one of: FOCUS, BODY, MIND, CUSTOM.', 400);
    }
    if (body.description !== undefined && typeof body.description !== 'string') {
      return jsonError('"description" must be a string.', 400);
    }

    const emojiOverride = typeof body.emoji === 'string' ? body.emoji.trim() : '';

    const metric: Metric = {
      id: await uniqueMetricId(slugify(name)),
      name,
      emoji: emojiOverride || autoEmoji(name),
      unit,
      goal,
      goalDirection,
      step: body.step !== undefined ? (body.step as number) : stepFor(unit),
      max: body.max !== undefined ? (body.max as number) : maxFor(unit),
      active: true,
      category: body.category !== undefined ? (body.category as Metric['category']) : 'CUSTOM',
      description: body.description !== undefined ? (body.description as string) : '',
    };

    return NextResponse.json(await createMetric(metric), { status: 201 });
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
