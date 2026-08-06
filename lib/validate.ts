/**
 * lib/validate.ts — request-body validation guards and metric defaults shared
 * by the /api/metrics route handlers.
 */
import { BUILTIN_UNITS, type BuiltinUnit, type Metric, type Unit } from '@/lib/types';

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const UNITS: readonly BuiltinUnit[] = BUILTIN_UNITS;
export const CATEGORIES: readonly Metric['category'][] = ['FOCUS', 'BODY', 'MIND', 'CUSTOM'];

/**
 * Longest accepted custom unit label. A unit is rendered inline next to a 34px
 * serif numeral on a 390px-wide screen; past a dozen characters it wraps and
 * shoves the value off the card. This is a display constraint, not a data one.
 */
export const MAX_UNIT_LENGTH = 12;

/** Stepper increment default per builtin unit (POST /api/metrics). */
export const DEFAULT_STEP: Record<BuiltinUnit, number> = {
  h: 0.5,
  m: 5,
  count: 1,
  '/10': 1,
};

/** Stepper max default per builtin unit (POST /api/metrics). */
export const DEFAULT_MAX: Record<BuiltinUnit, number> = {
  h: 16,
  m: 480,
  count: 100000,
  '/10': 10,
};

/** Custom units carry no semantics, so they get whole-number steps. */
export const CUSTOM_UNIT_STEP = 1;
export const CUSTOM_UNIT_MAX = 100000;

export function isBuiltinUnit(v: unknown): v is BuiltinUnit {
  return typeof v === 'string' && (BUILTIN_UNITS as readonly string[]).includes(v);
}

/**
 * A unit is either a builtin or any short custom label ("pages", "reps", "$").
 * Newlines and tabs are rejected because the label is rendered inline and a
 * line break would silently wreck every card the metric appears on.
 */
export function isUnit(v: unknown): v is Unit {
  if (typeof v !== 'string') return false;
  const trimmed = v.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_UNIT_LENGTH && !/[\n\r\t]/.test(trimmed);
}

/** Canonical stored form of a unit label. */
export function normalizeUnit(v: string): Unit {
  return v.trim();
}

/** Stepper increment for any unit, builtin or custom. */
export function stepFor(unit: Unit): number {
  return isBuiltinUnit(unit) ? DEFAULT_STEP[unit] : CUSTOM_UNIT_STEP;
}

/** Stepper ceiling for any unit, builtin or custom. */
export function maxFor(unit: Unit): number {
  return isBuiltinUnit(unit) ? DEFAULT_MAX[unit] : CUSTOM_UNIT_MAX;
}

export function isGoalDirection(v: unknown): v is Metric['goalDirection'] {
  return v === '>=' || v === '<=';
}

export function isCategory(v: unknown): v is Metric['category'] {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** kebab-case slug for server-derived metric ids; never returns an empty string. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'metric';
}
