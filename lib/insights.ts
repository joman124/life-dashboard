/**
 * lib/insights.ts — the written summary on the Trends tab.
 *
 * Turns the same numbers the charts draw into a handful of plain sentences,
 * because a 30-day line chart shows you a shape but not what changed. Every
 * bullet is derived arithmetic over your own entries — there is no model in the
 * loop, so the same data always produces the same words.
 *
 * A bullet is only emitted when the data actually supports it: no filler, no
 * "not enough data yet" lines dressed up as findings. An empty array is a
 * legitimate result and the caller renders its own empty state.
 */

import type { Entry, GoalDirection, Metric, Unit } from './types';
import { addDays, lastNDates } from './dates';
import { topCorrelations } from './correlations';
import { meetsGoal, streakDays } from './streaks';

export type InsightKind = 'pattern' | 'mover' | 'goals' | 'streak' | 'coverage';

export interface Insight {
  kind: InsightKind;
  /** Plain-text bullet, already formatted for display. */
  text: string;
  /** 'good' | 'bad' | null — drives the bullet marker colour only. */
  tone: 'good' | 'bad' | null;
}

/** Most bullets are only worth stating once a week of data exists. */
const MIN_DAYS_FOR_TREND = 4;
const MAX_INSIGHTS = 5;

/* ------------------------------------------------------------------ helpers */

function suffix(unit: Unit): string {
  if (unit === 'h') return 'h';
  if (unit === 'm') return 'm';
  if (unit === '/10') return '/10';
  return '';
}

function fmt(value: number, unit: Unit): string {
  const rounded = unit === 'count' ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toLocaleString('en-US') + suffix(unit);
}

function valuesOn(entries: Entry[], metricId: string, dates: string[]): number[] {
  const wanted = new Set(dates);
  const out: number[] = [];
  for (const e of entries) {
    if (e.metricId === metricId && wanted.has(e.date)) out.push(e.value);
  }
  return out;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Was the change in the direction this metric wants? */
function isGood(pct: number, dir: GoalDirection): boolean {
  return dir === '>=' ? pct >= 0 : pct <= 0;
}

/* -------------------------------------------------------------- the bullets */

/** The strongest correlation in the window, phrased as a pattern to test. */
function patternInsight(
  active: Metric[],
  entries: Entry[],
  today: string,
  byId: Map<string, Metric>,
): Insight | null {
  const pair = topCorrelations(
    entries,
    active.map((m) => m.id),
    { top: 1, today },
  )[0];
  if (!pair) return null;

  const a = byId.get(pair.aId);
  const b = byId.get(pair.bId);
  if (!a || !b) return null;

  const direction = pair.positive ? 'higher' : 'lower';
  // Phrased with "Days ... tend" rather than "your X tends", because metric
  // names are user-supplied and may be plural ("Phone Pickups tends" is wrong).
  // A plural subject keeps the sentence grammatical whatever the name is.
  return {
    kind: 'pattern',
    tone: null,
    text:
      `Days with higher ${a.name.toLowerCase()} tend to show ${direction} ` +
      `${b.name.toLowerCase()} — ${pair.strength.toLowerCase()} at r = ${Math.abs(pair.r).toFixed(2)} ` +
      `across ${pair.n} shared days. A pattern to test with intention, not a causal claim.`,
  };
}

/**
 * The metric that moved most this week vs the week before. Reported with the
 * metric's own sense of "good", so Phone Pickups falling is an improvement.
 */
function moverInsight(
  active: Metric[],
  entries: Entry[],
  today: string,
): Insight | null {
  const thisWeek = lastNDates(today, 7);
  const priorWeek = lastNDates(addDays(today, -7), 7);

  let best: { metric: Metric; pct: number; now: number } | null = null;
  for (const m of active) {
    const now = mean(valuesOn(entries, m.id, thisWeek));
    const before = mean(valuesOn(entries, m.id, priorWeek));
    if (now === null || before === null || before === 0) continue;
    const pct = Math.round(((now - before) / before) * 100);
    if (pct === 0) continue;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { metric: m, pct, now };
  }
  if (!best) return null;

  const good = isGood(best.pct, best.metric.goalDirection);
  const verb = best.pct > 0 ? 'up' : 'down';
  return {
    kind: 'mover',
    tone: good ? 'good' : 'bad',
    text:
      `${best.metric.name} moved most this week — ${verb} ${Math.abs(best.pct)}% ` +
      `vs the week before, averaging ${fmt(best.now, best.metric.unit)} a day. ` +
      `That is the ${good ? 'right' : 'wrong'} direction for this one.`,
  };
}

/** How many goals the 7-day average is currently meeting. */
function goalsInsight(active: Metric[], entries: Entry[], today: string): Insight | null {
  const week = lastNDates(today, 7);
  const scored: { metric: Metric; met: boolean }[] = [];
  for (const m of active) {
    const avg = mean(valuesOn(entries, m.id, week));
    if (avg === null) continue;
    scored.push({ metric: m, met: meetsGoal(avg, m.goal, m.goalDirection) });
  }
  if (scored.length === 0) return null;

  const met = scored.filter((s) => s.met);
  const missed = scored.filter((s) => !s.met);

  const plural = scored.length === 1 ? 'goal' : 'goals';

  if (missed.length === 0) {
    return {
      kind: 'goals',
      tone: 'good',
      text:
        scored.length === 1
          ? 'Your 7-day average is meeting your one active goal.'
          : `Your 7-day average is meeting all ${scored.length} active goals.`,
    };
  }
  const names = missed.map((s) => s.metric.name).join(', ');
  return {
    kind: 'goals',
    tone: met.length >= missed.length ? 'good' : 'bad',
    text:
      `Your 7-day average meets ${met.length} of ${scored.length} ${plural}. ` +
      `Still short: ${names}.`,
  };
}

/** The longest current streak, if anything is on one. */
function streakInsight(active: Metric[], entries: Entry[], today: string): Insight | null {
  let best: { metric: Metric; days: number } | null = null;
  for (const m of active) {
    const days = streakDays(
      entries.filter((e) => e.metricId === m.id),
      m.goal,
      m.goalDirection,
      today,
    );
    if (days < 2) continue;
    if (!best || days > best.days) best = { metric: m, days };
  }
  if (!best) return null;

  return {
    kind: 'streak',
    tone: 'good',
    text: `${best.metric.name} is your longest run right now — ${best.days} days in a row at goal.`,
  };
}

/**
 * A metric logged too rarely to trust. Worth saying plainly: a sparse metric
 * quietly drags down every correlation it appears in.
 */
function coverageInsight(active: Metric[], entries: Entry[], today: string): Insight | null {
  const window = lastNDates(today, 14);
  let worst: { metric: Metric; logged: number } | null = null;
  for (const m of active) {
    const logged = valuesOn(entries, m.id, window).length;
    if (logged >= 8) continue; // enough for the correlation floor
    if (!worst || logged < worst.logged) worst = { metric: m, logged };
  }
  if (!worst) return null;

  return {
    kind: 'coverage',
    tone: 'bad',
    text:
      `${worst.metric.name} is only logged ${worst.logged} of the last 14 days. ` +
      `Below 8 shared days it cannot appear in correlations at all.`,
  };
}

/* ---------------------------------------------------------------- the entry */

/**
 * Bullet-point summary of the last 30 days, most useful first. Returns at most
 * MAX_INSIGHTS, and an empty array when there is not yet enough logged data to
 * say anything true.
 */
export function summarize(metrics: Metric[], entries: Entry[], today: string): Insight[] {
  const active = metrics.filter((m) => m.active);
  if (active.length === 0) return [];

  // Nothing here is meaningful from two days of data.
  const recent = new Set(
    entries.filter((e) => lastNDates(today, 30).includes(e.date)).map((e) => e.date),
  );
  if (recent.size < MIN_DAYS_FOR_TREND) return [];

  const byId = new Map(metrics.map((m) => [m.id, m]));

  const candidates = [
    patternInsight(active, entries, today, byId),
    moverInsight(active, entries, today),
    goalsInsight(active, entries, today),
    streakInsight(active, entries, today),
    coverageInsight(active, entries, today),
  ];

  return candidates.filter((i): i is Insight => i !== null).slice(0, MAX_INSIGHTS);
}
