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

import type { Entry, GoalDirection, Metric } from './types';
import { addDays, lastNDates } from './dates';
import { topCorrelations } from './correlations';
import { meetsGoal, streakDays } from './streaks';
import { formatGoalText, formatUnitValue } from './units';

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

/** Value plus unit, shared with every other written summary. */
const fmt = formatUnitValue;

/** "≥ 6.5h" / "≤ 50" — the goal on its own, for mid-sentence use. */
function goalText(metric: Metric): string {
  return formatGoalText(metric.goal, metric.unit, metric.goalDirection);
}

/** Percent change from `before` to `now`, or null when it isn't computable. */
function pctChange(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
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
  days: number,
): Insight | null {
  const pair = topCorrelations(
    entries,
    active.map((m) => m.id),
    { top: 1, today, days },
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
export function summarize(
  metrics: Metric[],
  entries: Entry[],
  today: string,
  days = 30,
): Insight[] {
  const active = metrics.filter((m) => m.active);
  if (active.length === 0) return [];

  // Nothing here is meaningful from two days of data.
  const window = new Set(lastNDates(today, days));
  const recent = new Set(entries.filter((e) => window.has(e.date)).map((e) => e.date));
  if (recent.size < MIN_DAYS_FOR_TREND) return [];

  const byId = new Map(metrics.map((m) => [m.id, m]));

  const candidates = [
    patternInsight(active, entries, today, byId, days),
    moverInsight(active, entries, today),
    goalsInsight(active, entries, today),
    streakInsight(active, entries, today),
    coverageInsight(active, entries, today),
  ];

  return candidates.filter((i): i is Insight => i !== null).slice(0, MAX_INSIGHTS);
}

/* ------------------------------------------------- per-metric one-line read */

export interface MetricSummary {
  /** One or two plain sentences about this metric alone. */
  text: string;
  /** Mean over the window, or null when nothing is logged in it. */
  average: number | null;
  /** Days logged in the window. */
  logged: number;
  /** Percent change vs the equally-long window before it, or null. */
  changePct: number | null;
  tone: 'good' | 'bad' | null;
}

/**
 * The brief read that sits under a single metric's chart. Scoped to one metric
 * and one window: no correlations, no cross-metric comparison — those belong to
 * the week review above the charts.
 *
 * Returns text === '' when the window holds no data, so the caller can render
 * the chart's own empty state rather than a sentence about nothing.
 */
export function metricSummary(
  metric: Metric,
  entries: Entry[],
  today: string,
  days: number,
): MetricSummary {
  const window = lastNDates(today, days);
  const values = valuesOn(entries, metric.id, window);
  const average = mean(values);

  if (average === null) {
    return { text: '', average: null, logged: 0, changePct: null, tone: null };
  }

  const priorWindow = lastNDates(addDays(today, -days), days);
  const priorAverage = mean(valuesOn(entries, metric.id, priorWindow));
  const changePct = pctChange(average, priorAverage);

  const atGoal = values.filter((v) => meetsGoal(v, metric.goal, metric.goalDirection)).length;
  const good = changePct === null ? null : isGood(changePct, metric.goalDirection);

  const parts: string[] = [
    `Averaging ${fmt(average, metric.unit)} across ${values.length} logged ` +
      `${values.length === 1 ? 'day' : 'days'}`,
  ];

  if (changePct !== null && changePct !== 0) {
    parts.push(
      `${changePct > 0 ? 'up' : 'down'} ${Math.abs(changePct)}% on the previous ${days} days`,
    );
  } else if (changePct === 0) {
    parts.push('flat on the previous window');
  }

  const goalPart =
    `hitting ${goalText(metric)} on ${atGoal} of ${values.length}` +
    `${values.length === 1 ? ' day' : ' days'}`;

  return {
    text: `${parts.join(', ')} — ${goalPart}.`,
    average,
    logged: values.length,
    changePct,
    tone: good === null ? null : good ? 'good' : 'bad',
  };
}

/* ------------------------------------------------------------- week review */

export interface Recommendation {
  /** Imperative, specific, and derived from the numbers — never generic advice. */
  text: string;
  /** The metric the recommendation is about, for emoji/labelling. */
  metricId: string | null;
}

export interface WeekReview {
  /** Percent of active metrics whose 7-day average meets goal (0–100). */
  score: number;
  /** One-line verdict on the week. */
  headline: string;
  /** Evidence for the verdict. */
  support: Insight[];
  /** What to do about it next week. */
  recommendations: Recommendation[];
  /** False when there is too little logged data to say anything honest. */
  hasData: boolean;
}

const MAX_RECOMMENDATIONS = 3;

/** How far off goal each metric's 7-day average sits, worst first. */
function goalGaps(
  active: Metric[],
  entries: Entry[],
  today: string,
): { metric: Metric; average: number; gapPct: number }[] {
  const week = lastNDates(today, 7);
  const gaps: { metric: Metric; average: number; gapPct: number }[] = [];
  for (const m of active) {
    const average = mean(valuesOn(entries, m.id, week));
    if (average === null) continue;
    if (meetsGoal(average, m.goal, m.goalDirection)) continue;
    if (m.goal === 0) continue; // no meaningful proportional gap
    // Always positive: how far short (>=) or how far over (<=), as a percent.
    const gapPct =
      m.goalDirection === '>='
        ? ((m.goal - average) / m.goal) * 100
        : ((average - m.goal) / m.goal) * 100;
    gaps.push({ metric: m, average, gapPct });
  }
  return gaps.sort((a, b) => b.gapPct - a.gapPct);
}

/**
 * Recommendations for the coming week, in priority order:
 *   1. Close the widest goal gap — stated as the actual daily delta required.
 *   2. Fix the metric too sparsely logged to analyse at all.
 *   3. Pull the lever the user's own correlations point at.
 * When every goal is met, the recommendation is to raise a goal rather than to
 * invent a problem.
 */
function buildRecommendations(
  active: Metric[],
  entries: Entry[],
  today: string,
  byId: Map<string, Metric>,
): Recommendation[] {
  const out: Recommendation[] = [];
  const gaps = goalGaps(active, entries, today);
  const worst = gaps[0];

  if (worst) {
    const delta = Math.abs(worst.metric.goal - worst.average);
    const verb = worst.metric.goalDirection === '>=' ? 'Add' : 'Cut';
    out.push({
      metricId: worst.metric.id,
      text:
        `${verb} about ${fmt(delta, worst.metric.unit)} a day to ${worst.metric.name}. ` +
        `Your 7-day average is ${fmt(worst.average, worst.metric.unit)} against a goal of ` +
        `${goalText(worst.metric)} — the widest gap you have right now.`,
    });
  }

  // A metric logged fewer than 8 of the last 14 days can't enter a correlation,
  // so the fix is logging discipline before anything else about its level.
  const fortnight = lastNDates(today, 14);
  const sparse = active
    .map((m) => ({ metric: m, logged: valuesOn(entries, m.id, fortnight).length }))
    .filter((s) => s.logged < 8)
    .sort((a, b) => a.logged - b.logged)[0];
  if (sparse) {
    out.push({
      metricId: sparse.metric.id,
      text:
        `Log ${sparse.metric.name} more often — ${sparse.logged} of the last 14 days. ` +
        `It needs 8 shared days before it can appear in any correlation.`,
    });
  }

  // The strongest relationship involving the metric that is furthest off goal:
  // that pairing is the one lever the data actually supports pulling.
  if (worst) {
    const pair = topCorrelations(
      entries,
      active.map((m) => m.id),
      { today, top: 3 },
    ).find((p) => p.aId === worst.metric.id || p.bId === worst.metric.id);
    if (pair) {
      const otherId = pair.aId === worst.metric.id ? pair.bId : pair.aId;
      const other = byId.get(otherId);
      if (other) {
        out.push({
          metricId: other.id,
          text:
            `Try moving ${other.name} first: across ${pair.n} shared days it tracks ` +
            `${pair.positive ? 'with' : 'against'} ${worst.metric.name} at r = ` +
            `${Math.abs(pair.r).toFixed(2)}. Correlation, not proof — treat it as the experiment to run.`,
        });
      }
    }
  }

  if (out.length === 0) {
    // Everything is at goal. The honest recommendation is to raise the bar on
    // whatever is clearing it by the widest margin, not to manufacture a worry.
    const week = lastNDates(today, 7);
    let best: { metric: Metric; average: number; marginPct: number } | null = null;
    for (const m of active) {
      const average = mean(valuesOn(entries, m.id, week));
      if (average === null || m.goal === 0) continue;
      const marginPct =
        m.goalDirection === '>='
          ? ((average - m.goal) / m.goal) * 100
          : ((m.goal - average) / m.goal) * 100;
      if (!best || marginPct > best.marginPct) best = { metric: m, average, marginPct };
    }
    if (best) {
      out.push({
        metricId: best.metric.id,
        text:
          `Every goal is being met. ${best.metric.name} is clearing its target by ` +
          `${Math.round(best.marginPct)}% — raise that goal before the number stops meaning anything.`,
      });
    }
  }

  return out.slice(0, MAX_RECOMMENDATIONS);
}

/**
 * The written read that heads the Trends tab: a verdict on the week, the
 * evidence behind it, and what to do next. All derived arithmetic over the
 * user's own entries — deterministic, no model in the loop.
 */
export function weekReview(metrics: Metric[], entries: Entry[], today: string): WeekReview {
  const active = metrics.filter((m) => m.active);
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const week = lastNDates(today, 7);

  const scored = active
    .map((m) => ({ metric: m, average: mean(valuesOn(entries, m.id, week)) }))
    .filter((s): s is { metric: Metric; average: number } => s.average !== null);

  if (scored.length === 0) {
    return {
      score: 0,
      headline: 'Not enough logged this week to score it yet.',
      support: [],
      recommendations: [],
      hasData: false,
    };
  }

  const met = scored.filter((s) =>
    meetsGoal(s.average, s.metric.goal, s.metric.goalDirection),
  ).length;
  const score = Math.round((met / scored.length) * 100);

  const headline =
    score >= 75
      ? 'Strong week.'
      : score >= 50
        ? 'Solid week — one or two metrics lagging.'
        : 'Rebuild week — pick one metric to win.';

  return {
    score,
    headline,
    support: summarize(metrics, entries, today, 30),
    recommendations: buildRecommendations(active, entries, today, byId),
    hasData: true,
  };
}
