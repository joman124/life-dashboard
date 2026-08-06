// lib/types.ts — shared domain types for the Life Dashboard pure-logic library.
// These shapes are the contract the rest of the app is coded against.
// Do not rename fields or change types without updating every consumer.

/**
 * The four units that get bespoke formatting: 'h'/'m' render one decimal with a
 * letter suffix, 'count' renders a thousands-separated integer with no suffix,
 * '/10' renders as "7/10".
 */
export const BUILTIN_UNITS = ['h', 'm', 'count', '/10'] as const;

export type BuiltinUnit = (typeof BUILTIN_UNITS)[number];

/**
 * A metric's unit. Either a builtin, or any short custom label the user types
 * ("pages", "reps", "glasses", "miles", "$"), which is rendered verbatim as the
 * suffix. The `string & {}` arm keeps editor autocomplete on the builtins while
 * still admitting arbitrary labels.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type Unit = BuiltinUnit | (string & {});

export type GoalDirection = '>=' | '<=';

export type Category = 'FOCUS' | 'BODY' | 'MIND' | 'CUSTOM';

export interface Metric {
  id: string;
  name: string;
  emoji: string;
  unit: Unit;
  goal: number;
  goalDirection: GoalDirection;
  step: number;
  max: number;
  active: boolean;
  category: Category;
  description: string;
}

export interface Entry {
  metricId: string;
  /** Local-time calendar date, YYYY-MM-DD. */
  date: string;
  value: number;
}

export interface TimelineItem {
  id: number;
  /** Local-time calendar date, YYYY-MM-DD. */
  date: string;
  /** 24h clock, HH:MM. */
  time: string;
  title: string;
  detail: string;
  source: 'calendar' | 'manual' | null;
}
