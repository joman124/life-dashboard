/**
 * lib/brief.ts — the week-so-far read that leaves the app.
 *
 * Everything else in this project draws its numbers for a screen. This module
 * writes them down for a reader who cannot see the screen: the morning brief in
 * Cowork, which fetches /api/brief and folds the result into the page it draws
 * over coffee. That reader gets one shot, with no charts and no tabs to click,
 * so the payload has to answer both halves of the question on its own — how the
 * week has gone so far, and what today should go on.
 *
 * Two rules follow from that:
 *
 *   - The window is the CALENDAR week to date (Monday → today), not a trailing
 *     seven days. "How has my week gone" means the week you are standing in; a
 *     rolling window that quietly includes last Thursday answers a different
 *     question.
 *   - Every sentence is derived arithmetic over the user's own entries. There
 *     is no model in the loop here, so the same data always produces the same
 *     words, and a brief can never invent a number the dashboard disagrees with.
 *
 * Pure: no database, no clock of its own, no network. `today` is always passed
 * in, which is what makes the whole thing testable.
 */

import type { Entry, GoalDirection, Metric, Unit } from './types';
import {
  addDays,
  dayLabel,
  daysBetween,
  formatDateLong,
  isoWeek,
  isoWeekYear,
  lastNDates,
  startOfWeek,
} from './dates';
import { topCorrelations } from './correlations';
import { meetsGoal, streakDays } from './streaks';
import { formatGoalText, formatUnitValue } from './units';

/** Focus items past this point are noise in a 30-second read. */
const MAX_FOCUS = 3;

/** Correlations shown as patterns. Same floor of 8 shared days as the app. */
const MAX_PATTERNS = 3;

/** Days of unbroken goal-hitting before a run is worth protecting out loud. */
const STREAK_WORTH_PROTECTING = 3;

/* --------------------------------------------------------------- the shapes */

export interface BriefDay {
  /** YYYY-MM-DD. */
  date: string;
  /** Mon / Tue / … */
  day: string;
  /** null when the day was never logged — distinct from a logged zero. */
  value: number | null;
  atGoal: boolean;
}

export interface BriefMetric {
  id: string;
  name: string;
  emoji: string;
  unit: Unit;
  goal: number;
  goalDirection: GoalDirection;
  /** "≥ 4h" — the goal as it reads in a sentence. */
  goalText: string;
  /** Mean over the logged days of this week, or null when none are logged. */
  average: number | null;
  /** The same mean with its unit ("2.6h"), or null. */
  averageText: string | null;
  daysLogged: number;
  daysAtGoal: number;
  /** Does the week-to-date average meet the goal? null when nothing is logged. */
  onTrack: boolean | null;
  /** Percent change vs the same weekdays of last week, or null. */
  changePct: number | null;
  /** Whether that change went the way this metric wants. */
  changeIsGood: boolean | null;
  /** Consecutive days at goal, ending today (an unlogged today does not break it). */
  streak: number;
  /** Today's logged value, or null. */
  today: number | null;
  loggedToday: boolean;
  /** Whether today's value meets the goal; null when today is unlogged. */
  atGoalToday: boolean | null;
  /** Monday → today, one entry per day. */
  days: BriefDay[];
  /** One plain sentence about this metric's week. */
  summary: string;
}

export type FocusReason = 'gap' | 'streak' | 'lever' | 'coverage' | 'raise';

export interface BriefFocus {
  /** Why this item is here, for a consumer that wants to group or filter. */
  reason: FocusReason;
  /** The recommendation itself, already a finished sentence or two. */
  text: string;
  metricId: string | null;
  metricName: string | null;
  emoji: string | null;
}

export interface BriefPattern {
  aId: string;
  bId: string;
  /** One sentence naming both metrics and the strength. */
  text: string;
  /**
   * Pearson r, signed and rounded to two places. `text` states the direction in
   * words and quotes |r|, so a negative pair reads as "tend to show lower …"
   * beside an unsigned number — the sign lives here.
   */
  r: number;
  /** Shared days behind it — never fewer than 8. */
  n: number;
}

export interface Brief {
  /** ISO instant this payload was built. */
  generatedAt: string;
  /** Today in the dashboard timezone, YYYY-MM-DD. */
  date: string;
  /** "Wednesday, August 26". */
  dateLong: string;
  /** The dashboard's fixed timezone, stated so a reader elsewhere knows. */
  timezone: string;
  week: {
    /** ISO week number and its week-numbering year. */
    number: number;
    year: number;
    /** Monday of this week, YYYY-MM-DD. */
    start: string;
    /** Today — the week is only reported as far as it has actually been lived. */
    end: string;
    /** Days of the week elapsed, including today. 1 on a Monday. */
    daysElapsed: number;
    /**
     * Percent of scored metrics whose week-to-date average meets goal.
     * The denominator is `scoredMetrics`, not every active metric: a metric
     * with nothing logged this week is unknown, not failed.
     */
    score: number;
    scoredMetrics: number;
    activeMetrics: number;
    /** One-line verdict, matching the app's own wording. */
    headline: string;
    metrics: BriefMetric[];
  };
  /** What today should go on, most actionable first. Never more than three. */
  focus: BriefFocus[];
  /** The strongest relationships in the user's own last 30 days. */
  patterns: BriefPattern[];
  /** Names of active metrics with nothing logged yet today. */
  notLoggedToday: string[];
  /** Where to go to log or look closer, when the caller knows the origin. */
  dashboardUrl: string | null;
}

/* -------------------------------------------------------------- derivations */

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Did a change in this direction go the way the metric wants? */
function isGood(pct: number, dir: GoalDirection): boolean {
  return dir === '>=' ? pct >= 0 : pct <= 0;
}

function valuesOn(byDate: Map<string, number>, dates: string[]): number[] {
  const out: number[] = [];
  for (const d of dates) {
    const v = byDate.get(d);
    if (v !== undefined) out.push(v);
  }
  return out;
}

function datesByMetric(entries: Entry[], metricId: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) if (e.metricId === metricId) map.set(e.date, e.value);
  return map;
}

/**
 * How far a week-to-date average sits from goal, as a positive percent of the
 * goal. Returns null when the goal is 0 (no meaningful proportion) or the
 * average already meets it.
 */
function goalGapPct(average: number, metric: Metric): number | null {
  if (metric.goal === 0) return null;
  if (meetsGoal(average, metric.goal, metric.goalDirection)) return null;
  return metric.goalDirection === '>='
    ? ((metric.goal - average) / metric.goal) * 100
    : ((average - metric.goal) / metric.goal) * 100;
}

function buildMetric(metric: Metric, entries: Entry[], weekDates: string[], today: string): BriefMetric {
  const byDate = datesByMetric(entries, metric.id);
  const goalText = formatGoalText(metric.goal, metric.unit, metric.goalDirection);

  const days: BriefDay[] = weekDates.map((date) => {
    const value = byDate.get(date) ?? null;
    return {
      date,
      day: dayLabel(date),
      value,
      atGoal: value !== null && meetsGoal(value, metric.goal, metric.goalDirection),
    };
  });

  const logged = days.filter((d) => d.value !== null);
  const average = mean(logged.map((d) => d.value as number));
  const daysAtGoal = days.filter((d) => d.atGoal).length;

  // The comparison window is the SAME weekdays of last week, not the previous
  // seven days: on a Wednesday, three days against three days. Comparing a
  // three-day week against a full seven-day one would report every Monday as a
  // collapse.
  const priorDates = weekDates.map((d) => addDays(d, -7));
  const priorAverage = mean(valuesOn(byDate, priorDates));
  const changePct =
    average === null || priorAverage === null || priorAverage === 0
      ? null
      : Math.round(((average - priorAverage) / priorAverage) * 100);

  const todayValue = byDate.get(today) ?? null;

  let summary: string;
  if (average === null) {
    summary = `Nothing logged this week yet — goal is ${goalText}.`;
  } else {
    const change =
      changePct === null
        ? ''
        : changePct === 0
          ? ', flat on the same days last week'
          : `, ${changePct > 0 ? 'up' : 'down'} ${Math.abs(changePct)}% on the same days last week`;
    summary =
      `Averaging ${formatUnitValue(average, metric.unit)} against ${goalText}, at goal on ` +
      `${daysAtGoal} of ${logged.length} logged ${logged.length === 1 ? 'day' : 'days'}${change}.`;
  }

  return {
    id: metric.id,
    name: metric.name,
    emoji: metric.emoji,
    unit: metric.unit,
    goal: metric.goal,
    goalDirection: metric.goalDirection,
    goalText,
    average,
    averageText: average === null ? null : formatUnitValue(average, metric.unit),
    daysLogged: logged.length,
    daysAtGoal,
    onTrack: average === null ? null : meetsGoal(average, metric.goal, metric.goalDirection),
    changePct,
    changeIsGood: changePct === null ? null : isGood(changePct, metric.goalDirection),
    streak: streakDays(
      entries.filter((e) => e.metricId === metric.id),
      metric.goal,
      metric.goalDirection,
      today,
    ),
    today: todayValue,
    loggedToday: todayValue !== null,
    atGoalToday:
      todayValue === null ? null : meetsGoal(todayValue, metric.goal, metric.goalDirection),
    days,
    summary,
  };
}

/* ------------------------------------------------------------------- focus */

function focusItem(
  reason: FocusReason,
  text: string,
  metric: Metric | BriefMetric | null,
): BriefFocus {
  return {
    reason,
    text,
    metricId: metric?.id ?? null,
    metricName: metric?.name ?? null,
    emoji: metric?.emoji ?? null,
  };
}

/**
 * What today should go on, in priority order:
 *
 *   1. The widest goal gap — the substantive answer, stated as the daily move
 *      it would actually take rather than as "do better at X".
 *   2. A streak that today decides — cheap, time-sensitive, and gone by
 *      midnight if it is not named.
 *   3. The lever the user's own correlations point at for that widest gap.
 *   4. A metric logged too rarely to analyse at all.
 *
 * When every goal is on track, the honest recommendation is to raise a goal,
 * not to manufacture a worry. Each metric appears at most once.
 */
function buildFocus(
  active: Metric[],
  briefMetrics: BriefMetric[],
  entries: Entry[],
  today: string,
): BriefFocus[] {
  const out: BriefFocus[] = [];
  const claimed = new Set<string>();
  const byId = new Map(active.map((m) => [m.id, m]));
  const summaryById = new Map(briefMetrics.map((b) => [b.id, b]));

  // 1 — the widest gap.
  const gaps = briefMetrics
    .map((b) => {
      const metric = byId.get(b.id);
      if (!metric || b.average === null) return null;
      const gapPct = goalGapPct(b.average, metric);
      if (gapPct === null) return null;
      return { metric, brief: b, gapPct, average: b.average };
    })
    .filter((g): g is { metric: Metric; brief: BriefMetric; gapPct: number; average: number } => g !== null)
    .sort((a, b) => b.gapPct - a.gapPct);

  const worst = gaps[0];
  if (worst) {
    const move = Math.abs(worst.metric.goal - worst.average);
    const verb = worst.metric.goalDirection === '>=' ? 'finding' : 'cutting';
    out.push(
      focusItem(
        'gap',
        `${worst.brief.name} is the widest gap this week — averaging ` +
          `${formatUnitValue(worst.average, worst.metric.unit)} against ${worst.brief.goalText}, ` +
          `at goal on ${worst.brief.daysAtGoal} of ${worst.brief.daysLogged} logged ` +
          `${worst.brief.daysLogged === 1 ? 'day' : 'days'}. Meeting it today means ${verb} about ` +
          `${formatUnitValue(move, worst.metric.unit)} on an average day.`,
        worst.metric,
      ),
    );
    claimed.add(worst.metric.id);
  }

  // 2 — a run that today decides. Only live streaks with today still open:
  // once today is logged at goal the run is already safe, and saying otherwise
  // would be a nudge to do something already done.
  const atRisk = briefMetrics
    .filter((b) => !claimed.has(b.id) && b.streak >= STREAK_WORTH_PROTECTING && !b.loggedToday)
    .sort((a, b) => b.streak - a.streak)[0];
  if (atRisk) {
    out.push(
      focusItem(
        'streak',
        `${atRisk.name} is on a ${atRisk.streak}-day run at ${atRisk.goalText} with nothing ` +
          `logged today — the run rides on today.`,
        atRisk,
      ),
    );
    claimed.add(atRisk.id);
  }

  // 3 — the lever the data points at for the widest gap.
  if (worst) {
    const pair = topCorrelations(
      entries,
      active.map((m) => m.id),
      { today, top: MAX_PATTERNS },
    ).find(
      (p) =>
        (p.aId === worst.metric.id && !claimed.has(p.bId)) ||
        (p.bId === worst.metric.id && !claimed.has(p.aId)),
    );
    if (pair) {
      const otherId = pair.aId === worst.metric.id ? pair.bId : pair.aId;
      const other = summaryById.get(otherId);
      if (other) {
        out.push(
          focusItem(
            'lever',
            `Try moving ${other.name} first: across ${pair.n} shared days it tracks ` +
              `${pair.positive ? 'with' : 'against'} ${worst.brief.name} at r = ` +
              `${Math.abs(pair.r).toFixed(2)}. Correlation, not proof — treat it as today's experiment.`,
            other,
          ),
        );
        claimed.add(other.id);
      }
    }
  }

  // 4 — a metric too sparsely logged to say anything about.
  const fortnight = lastNDates(today, 14);
  const sparse = active
    .filter((m) => !claimed.has(m.id))
    .map((m) => ({ metric: m, logged: valuesOn(datesByMetric(entries, m.id), fortnight).length }))
    .filter((s) => s.logged < 8)
    .sort((a, b) => a.logged - b.logged)[0];
  if (sparse) {
    out.push(
      focusItem(
        'coverage',
        `${sparse.metric.name} is logged ${sparse.logged} of the last 14 days. Log it today — ` +
          `below 8 shared days it cannot appear in any correlation.`,
        sparse.metric,
      ),
    );
    claimed.add(sparse.metric.id);
  }

  // Everything on track: raise the bar on whatever is clearing it widest.
  if (out.length === 0) {
    let best: { brief: BriefMetric; metric: Metric; marginPct: number } | null = null;
    for (const b of briefMetrics) {
      const metric = byId.get(b.id);
      if (!metric || b.average === null || metric.goal === 0) continue;
      const marginPct =
        metric.goalDirection === '>='
          ? ((b.average - metric.goal) / metric.goal) * 100
          : ((metric.goal - b.average) / metric.goal) * 100;
      if (!best || marginPct > best.marginPct) best = { brief: b, metric, marginPct };
    }
    if (best) {
      out.push(
        focusItem(
          'raise',
          `Every goal with data is on track this week. ${best.brief.name} is clearing ` +
            `${best.brief.goalText} by ${Math.round(best.marginPct)}% — raise that goal before the ` +
            `number stops meaning anything.`,
          best.metric,
        ),
      );
    }
  }

  return out.slice(0, MAX_FOCUS);
}

/* ---------------------------------------------------------------- patterns */

function buildPatterns(active: Metric[], entries: Entry[], today: string): BriefPattern[] {
  const byId = new Map(active.map((m) => [m.id, m]));
  return topCorrelations(
    entries,
    active.map((m) => m.id),
    { today, top: MAX_PATTERNS },
  )
    .map((p) => {
      const a = byId.get(p.aId);
      const b = byId.get(p.bId);
      if (!a || !b) return null;
      return {
        aId: p.aId,
        bId: p.bId,
        r: Math.round(p.r * 100) / 100,
        n: p.n,
        text:
          `Days with higher ${a.name.toLowerCase()} tend to show ` +
          `${p.positive ? 'higher' : 'lower'} ${b.name.toLowerCase()} — ` +
          `${p.strength.toLowerCase()} at r = ${Math.abs(p.r).toFixed(2)} across ${p.n} shared days.`,
      };
    })
    .filter((p): p is BriefPattern => p !== null);
}

/* -------------------------------------------------------------- the entry */

export interface BriefOptions {
  /** Absolute origin of the running app, so the brief can link back. */
  dashboardUrl?: string | null;
  /** Overridable only for tests; the real value comes from the clock. */
  generatedAt?: string;
}

/**
 * Build the whole payload. `today` is a dashboard-timezone calendar date, and
 * everything is measured against it — nothing in here reads a clock.
 */
export function buildBrief(
  metrics: Metric[],
  entries: Entry[],
  today: string,
  opts: BriefOptions = {},
): Brief {
  const active = metrics.filter((m) => m.active);
  const start = startOfWeek(today);
  const daysElapsed = daysBetween(start, today) + 1;
  const weekDates: string[] = [];
  for (let i = 0; i < daysElapsed; i++) weekDates.push(addDays(start, i));

  const briefMetrics = active.map((m) => buildMetric(m, entries, weekDates, today));

  const scored = briefMetrics.filter((b) => b.onTrack !== null);
  const score =
    scored.length === 0
      ? 0
      : Math.round((scored.filter((b) => b.onTrack).length / scored.length) * 100);

  const headline =
    scored.length === 0
      ? 'Nothing logged this week yet.'
      : score >= 75
        ? 'Strong week so far.'
        : score >= 50
          ? 'Solid week so far — one or two metrics lagging.'
          : 'Rebuild week — pick one metric to win.';

  return {
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    date: today,
    dateLong: formatDateLong(today),
    timezone: 'UTC-07:00 (fixed, no DST)',
    week: {
      number: isoWeek(today),
      year: isoWeekYear(today),
      start,
      end: today,
      daysElapsed,
      score,
      scoredMetrics: scored.length,
      activeMetrics: active.length,
      headline,
      metrics: briefMetrics,
    },
    focus: buildFocus(active, briefMetrics, entries, today),
    patterns: buildPatterns(active, entries, today),
    notLoggedToday: briefMetrics.filter((b) => !b.loggedToday).map((b) => b.name),
    dashboardUrl: opts.dashboardUrl ?? null,
  };
}

/* ------------------------------------------------------- the text rendering */

/**
 * The same brief as plain Markdown.
 *
 * A JSON body is the precise form and the default, but the consumer here is
 * often a fetch tool that flattens whatever it receives into text anyway. Doing
 * that conversion here, deliberately, beats letting a generic converter decide
 * which fields survive — and it makes the endpoint answerable by eye, which is
 * how you check it is working before wiring anything to it.
 */
export function renderBriefText(brief: Brief): string {
  const lines: string[] = [];
  const w = brief.week;

  lines.push(`# Life Dashboard — week to date`);
  lines.push('');
  lines.push(
    `${brief.dateLong} · ISO week ${w.number} of ${w.year} · day ${w.daysElapsed} of 7 ` +
      `(${w.start} → ${w.end}) · all dates in ${brief.timezone}`,
  );
  lines.push('');
  lines.push(
    `**${w.headline}** Week-to-date score ${w.score}% — ` +
      `${w.metrics.filter((m) => m.onTrack).length} of ${w.scoredMetrics} scored ` +
      `${w.scoredMetrics === 1 ? 'metric' : 'metrics'} at goal, from ${w.activeMetrics} active.`,
  );

  lines.push('');
  lines.push('## How the week has gone');
  if (w.metrics.length === 0) {
    lines.push('');
    lines.push('No active metrics.');
  } else {
    for (const m of w.metrics) {
      lines.push('');
      lines.push(`### ${m.emoji} ${m.name}`);
      lines.push(m.summary);
      const byDay = m.days
        .map((d) => `${d.day} ${d.value === null ? '—' : formatUnitValue(d.value, m.unit)}`)
        .join(' · ');
      lines.push(`Days: ${byDay}`);
      const todayText =
        m.today === null ? 'not logged yet' : `${formatUnitValue(m.today, m.unit)}`;
      lines.push(
        `Today: ${todayText} · streak ${m.streak} ${m.streak === 1 ? 'day' : 'days'} at goal`,
      );
    }
  }

  lines.push('');
  lines.push('## What to focus on today');
  if (brief.focus.length === 0) {
    lines.push('');
    lines.push('Not enough logged yet to recommend anything honestly.');
  } else {
    lines.push('');
    brief.focus.forEach((f, i) => lines.push(`${i + 1}. ${f.text}`));
  }

  if (brief.patterns.length > 0) {
    lines.push('');
    lines.push('## Patterns in the last 30 days');
    lines.push('');
    for (const p of brief.patterns) lines.push(`- ${p.text}`);
    lines.push('');
    lines.push('Correlation is not causation — these are patterns in your own data.');
  }

  if (brief.notLoggedToday.length > 0) {
    lines.push('');
    lines.push('## Not logged yet today');
    lines.push('');
    lines.push(brief.notLoggedToday.join(', '));
  }

  if (brief.dashboardUrl) {
    lines.push('');
    lines.push(`Log or look closer: ${brief.dashboardUrl}`);
  }

  return lines.join('\n') + '\n';
}
