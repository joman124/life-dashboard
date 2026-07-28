/**
 * PATCH /api/metrics/[id] — partial update of a metric.
 * 200 with the updated Metric, 404 for an unknown id, 400 for invalid fields.
 */
import { NextResponse } from 'next/server';
import { getMetricById, updateMetric, type MetricPatch } from '@/lib/db';
import { jsonError, toErrorMessage } from '@/lib/http';
import { isCategory, isFiniteNumber, isGoalDirection, isUnit } from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return jsonError('Request body must be a JSON object.', 400);
    }

    if (!(await getMetricById(params.id))) {
      return jsonError(`Unknown metric id "${params.id}".`, 404);
    }

    const patch: MetricPatch = {};

    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') return jsonError('"active" must be a boolean.', 400);
      patch.active = body.active;
    }
    if (body.goal !== undefined) {
      if (!isFiniteNumber(body.goal)) return jsonError('"goal" must be a finite number.', 400);
      patch.goal = body.goal;
    }
    if (body.goalDirection !== undefined) {
      if (!isGoalDirection(body.goalDirection)) return jsonError('"goalDirection" must be ">=" or "<=".', 400);
      patch.goalDirection = body.goalDirection;
    }
    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return jsonError('"name" must be a non-empty string.', 400);
      patch.name = name;
    }
    if (body.emoji !== undefined) {
      const emoji = typeof body.emoji === 'string' ? body.emoji.trim() : '';
      if (!emoji) return jsonError('"emoji" must be a non-empty string.', 400);
      patch.emoji = emoji;
    }
    if (body.unit !== undefined) {
      if (!isUnit(body.unit)) return jsonError('"unit" must be one of: h, m, count, /10.', 400);
      patch.unit = body.unit;
    }
    if (body.step !== undefined) {
      if (!isFiniteNumber(body.step) || body.step <= 0) return jsonError('"step" must be a positive number.', 400);
      patch.step = body.step;
    }
    if (body.max !== undefined) {
      if (!isFiniteNumber(body.max) || body.max <= 0) return jsonError('"max" must be a positive number.', 400);
      patch.max = body.max;
    }
    if (body.category !== undefined) {
      if (!isCategory(body.category)) return jsonError('"category" must be one of: FOCUS, BODY, MIND, CUSTOM.', 400);
      patch.category = body.category;
    }
    if (body.description !== undefined) {
      if (typeof body.description !== 'string') return jsonError('"description" must be a string.', 400);
      patch.description = body.description;
    }

    if (Object.keys(patch).length === 0) {
      return jsonError(
        'No updatable fields provided. Updatable: active, goal, goalDirection, name, emoji, unit, step, max, category, description.',
        400
      );
    }

    const updated = await updateMetric(params.id, patch);
    if (!updated) return jsonError(`Unknown metric id "${params.id}".`, 404);
    return NextResponse.json(updated);
  } catch (e) {
    return jsonError(toErrorMessage(e), 500);
  }
}
