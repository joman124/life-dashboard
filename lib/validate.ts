/**
 * lib/validate.ts — request-body validation guards and metric defaults shared
 * by the /api/metrics route handlers.
 */
import type { Metric } from '@/lib/types';

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const UNITS: readonly Metric['unit'][] = ['h', 'm', 'count', '/10'];
export const CATEGORIES: readonly Metric['category'][] = ['FOCUS', 'BODY', 'MIND', 'CUSTOM'];

/** Stepper increment default per unit (POST /api/metrics). */
export const DEFAULT_STEP: Record<Metric['unit'], number> = {
  h: 0.5,
  m: 5,
  count: 1,
  '/10': 1,
};

/** Stepper max default per unit (POST /api/metrics). */
export const DEFAULT_MAX: Record<Metric['unit'], number> = {
  h: 16,
  m: 480,
  count: 100000,
  '/10': 10,
};

export function isUnit(v: unknown): v is Metric['unit'] {
  return typeof v === 'string' && (UNITS as readonly string[]).includes(v);
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
