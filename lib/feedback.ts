import type { Entry, Metric } from './types';
import { addDays, lastNDates, startOfWeek } from './dates';
import { meetsGoal } from './streaks';

export interface GoalAssessment {
  metric: Metric;
  average: number | null;
  logged: number;
  hits: number;
  status: 'met' | 'off-track' | 'collecting' | 'in-progress';
}

/** Daily averages need four observed days. Weekly habits use their actual cadence. */
export function assessGoals(metrics: Metric[], entries: Entry[], today: string): GoalAssessment[] {
  return metrics
    .filter((m) => m.active)
    .map((metric) => {
      const start = metric.weeklyTarget === null ? addDays(today, -6) : startOfWeek(today);
      const byDate = new Map(
        entries
          .filter(
            (e) =>
              e.metricId === metric.id &&
              e.date >= start &&
              e.date <= today &&
              Number.isFinite(e.value),
          )
          .map((e) => [e.date, e.value]),
      );
      const values = [...byDate.values()];
      const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      const hits = values.filter((v) => meetsGoal(v, metric.goal, metric.goalDirection)).length;
      const status =
        metric.weeklyTarget !== null
          ? hits >= metric.weeklyTarget
            ? 'met'
            : today === addDays(startOfWeek(today), 6)
              ? hits + (7 - values.length) < metric.weeklyTarget
                ? 'off-track'
                : 'collecting'
              : 'in-progress'
          : values.length < 4
            ? 'collecting'
            : meetsGoal(average!, metric.goal, metric.goalDirection)
              ? 'met'
              : 'off-track';
      return { metric, average, logged: values.length, hits, status };
    });
}

export function goalScore(assessments: GoalAssessment[]): number | null {
  const judged = assessments.filter((a) => a.status === 'met' || a.status === 'off-track');
  return judged.length
    ? Math.round((judged.filter((a) => a.status === 'met').length / judged.length) * 100)
    : null;
}

export interface DashboardAlert {
  id: string;
  kind: 'reminder' | 'goal' | 'coverage';
  title: string;
  detail: string;
  metricId?: string;
}

/** Alerts never treat missing entries as zero or today's unfinished goal as a failure. */
export function dashboardAlerts(
  metrics: Metric[],
  entries: Entry[],
  today: string,
  reminderDue: boolean,
): DashboardAlert[] {
  const active = metrics.filter((m) => m.active);
  const alerts: DashboardAlert[] = [];
  const weeklyMet = new Set(
    assessGoals(active, entries, today)
      .filter((a) => a.metric.weeklyTarget !== null && a.status === 'met')
      .map((a) => a.metric.id),
  );
  const missing = active.filter(
    (m) => !weeklyMet.has(m.id) && !entries.some((e) => e.metricId === m.id && e.date === today),
  );
  if (reminderDue && missing.length)
    alerts.push({
      id: `reminder:${today}`,
      kind: 'reminder',
      title: 'A little check-in goes a long way.',
      detail: `${missing.length} ${missing.length === 1 ? 'metric is' : 'metrics are'} waiting for today: ${missing.map((m) => m.name).join(', ')}.`,
    });
  // Goal alerts use completed days only: a morning total is not a finished day.
  const yesterday = addDays(today, -1);
  for (const m of active.filter((m) => m.weeklyTarget === null)) {
    const recent = lastNDates(yesterday, 3).map(
      (d) => entries.find((e) => e.metricId === m.id && e.date === d)?.value,
    );
    if (recent.every((v) => v !== undefined && !meetsGoal(v, m.goal, m.goalDirection)))
      alerts.push({
        id: `goal:${m.id}:${today}`,
        kind: 'goal',
        metricId: m.id,
        title: `${m.name} could use some attention.`,
        detail: 'Outside your target on 3 completed days in a row. Try one small adjustment today.',
      });
  }
  const dates = new Set(lastNDates(yesterday, 7));
  const sparse = active
    .filter((m) => m.weeklyTarget === null)
    .filter(
      (m) =>
        new Set(entries.filter((e) => e.metricId === m.id && dates.has(e.date)).map((e) => e.date))
          .size < 4,
    );
  if (sparse.length)
    alerts.push({
      id: `coverage:${today}`,
      kind: 'coverage',
      title: 'More check-ins, clearer feedback.',
      detail: `${sparse.map((m) => m.name).join(', ')}: fewer than 4 logged days in the last 7 completed days. Weekly habits are judged by their own cadence.`,
    });
  return alerts;
}
