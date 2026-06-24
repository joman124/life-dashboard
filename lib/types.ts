// lib/types.ts — shared domain types for the Life Dashboard pure-logic library.
// These shapes are the contract the rest of the app is coded against.
// Do not rename fields or change types without updating every consumer.

export type Unit = 'h' | 'm' | 'count' | '/10';

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
