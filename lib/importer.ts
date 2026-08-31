/**
 * lib/importer.ts — PURE validation of an uploaded export file (no DB, no I/O).
 *
 * GET /api/export produces { exportedAt, metrics, entries }. This module is the
 * gate that decides whether a file the user hands back is safe to write. It is
 * deliberately strict and deliberately pure: import is the one path where
 * arbitrary user-supplied JSON reaches the database, and a bad row must be
 * rejected with a message that says exactly which row and why — never partially
 * applied and never silently dropped.
 */

import type { Entry, Metric } from './types';
import {
  CATEGORIES,
  ISO_DATE_RE,
  MAX_UNIT_LENGTH,
  UNITS,
  isCategory,
  isFiniteNumber,
  isWeeklyTarget,
  isGoalDirection,
  isUnit,
  normalizeUnit,
} from './validate';

export interface ImportPayload {
  metrics: Metric[];
  entries: Entry[];
}

export type ParseResult =
  | { ok: true; data: ImportPayload }
  | { ok: false; error: string };

function fail(error: string): ParseResult {
  return { ok: false, error };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate a parsed JSON export.
 *
 * Accepts the full export shape ({ metrics, entries }); `exportedAt` and any
 * other extra keys are ignored. Both arrays are required, but either may be
 * empty. Every metric and entry is fully validated, and entries must reference
 * a metric present in the same payload — importing an entry whose metric does
 * not exist would violate the entries.metricId foreign key.
 */
export function parseImport(raw: unknown): ParseResult {
  if (!isRecord(raw)) return fail('File must contain a JSON object.');

  const { metrics, entries } = raw;
  if (!Array.isArray(metrics)) return fail('"metrics" must be an array.');
  if (!Array.isArray(entries)) return fail('"entries" must be an array.');

  const parsedMetrics: Metric[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    const at = `metrics[${i}]`;
    if (!isRecord(m)) return fail(`${at} must be an object.`);

    const id = typeof m.id === 'string' ? m.id.trim() : '';
    if (!id) return fail(`${at}.id must be a non-empty string.`);
    if (seenIds.has(id)) return fail(`${at}.id "${id}" is duplicated in the file.`);
    seenIds.add(id);

    const name = typeof m.name === 'string' ? m.name.trim() : '';
    if (!name) return fail(`${at}.name must be a non-empty string.`);

    const emoji = typeof m.emoji === 'string' ? m.emoji.trim() : '';
    if (!emoji) return fail(`${at}.emoji must be a non-empty string.`);

    if (!isUnit(m.unit)) {
      return fail(
        `${at}.unit must be a non-empty label of at most ${MAX_UNIT_LENGTH} characters — a builtin (${UNITS.join(', ')}) or a custom one.`,
      );
    }
    if (!isFiniteNumber(m.goal)) return fail(`${at}.goal must be a finite number.`);
    if (!isGoalDirection(m.goalDirection)) return fail(`${at}.goalDirection must be ">=" or "<=".`);
    if (!isFiniteNumber(m.step) || m.step <= 0) return fail(`${at}.step must be a positive number.`);
    if (!isFiniteNumber(m.max) || m.max <= 0) return fail(`${at}.max must be a positive number.`);
    if (typeof m.active !== 'boolean') return fail(`${at}.active must be a boolean.`);
    if (!isCategory(m.category)) return fail(`${at}.category must be one of: ${CATEGORIES.join(', ')}.`);
    if (m.description !== undefined && typeof m.description !== 'string') {
      return fail(`${at}.description must be a string.`);
    }
    // Absent means daily, so an export written before cadence existed still
    // imports; present means it has to be a real target.
    if (m.weeklyTarget !== undefined && !isWeeklyTarget(m.weeklyTarget)) {
      return fail(`${at}.weeklyTarget must be null or a whole number of days from 1 to 7.`);
    }

    parsedMetrics.push({
      id,
      name,
      emoji,
      unit: normalizeUnit(m.unit),
      goal: m.goal,
      goalDirection: m.goalDirection,
      step: m.step,
      max: m.max,
      active: m.active,
      category: m.category,
      description: typeof m.description === 'string' ? m.description : '',
      weeklyTarget: m.weeklyTarget === undefined ? null : m.weeklyTarget,
    });
  }

  const parsedEntries: Entry[] = [];
  const seenEntryKeys = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const at = `entries[${i}]`;
    if (!isRecord(e)) return fail(`${at} must be an object.`);

    const metricId = typeof e.metricId === 'string' ? e.metricId.trim() : '';
    if (!metricId) return fail(`${at}.metricId must be a non-empty string.`);
    if (!seenIds.has(metricId)) {
      return fail(`${at}.metricId "${metricId}" has no matching metric in the file.`);
    }

    if (typeof e.date !== 'string' || !ISO_DATE_RE.test(e.date)) {
      return fail(`${at}.date must be a YYYY-MM-DD string.`);
    }
    if (!isFiniteNumber(e.value)) return fail(`${at}.value must be a finite number.`);

    // entries has UNIQUE (metricId, date). Two rows for the same pair would make
    // the import order-dependent, so reject rather than silently keep the last.
    const key = `${metricId}|${e.date}`;
    if (seenEntryKeys.has(key)) {
      return fail(`${at} duplicates ${metricId} on ${e.date}.`);
    }
    seenEntryKeys.add(key);

    parsedEntries.push({ metricId, date: e.date, value: e.value });
  }

  return { ok: true, data: { metrics: parsedMetrics, entries: parsedEntries } };
}
