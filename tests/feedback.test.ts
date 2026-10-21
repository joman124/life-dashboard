import { describe, expect, it } from 'vitest';
import { assessGoals, dashboardAlerts, goalScore } from '@/lib/feedback';
import { summarize, weekReview } from '@/lib/insights';
import { weeklyScore } from '@/app/components/data';
import { addDays } from '@/lib/dates';
import type { Entry, Metric } from '@/lib/types';
const today = '2026-10-21'; // Wednesday
const metric = (over: Partial<Metric> = {}): Metric => ({
  id: 'focus',
  name: 'Focus',
  emoji: '🎯',
  unit: 'h',
  goal: 4,
  goalDirection: '>=',
  step: 0.5,
  max: 24,
  active: true,
  category: 'FOCUS',
  description: '',
  weeklyTarget: null,
  ...over,
});
const run = (values: number[], end = today, id = 'focus'): Entry[] =>
  values.map((value, i) => ({ metricId: id, date: addDays(end, i - values.length + 1), value }));
describe('evidence and cadence', () => {
  it('does not score one exceptional day as an entire successful week', () => {
    expect(goalScore(assessGoals([metric()], run([9]), today))).toBeNull();
    expect(weekReview([metric()], run([9]), today).hasData).toBe(false);
  });
  it('excludes sparse metrics without counting them as failed', () => {
    const metrics = [metric(), metric({ id: 'sleep' })];
    const entries = [...run([5, 5, 5, 5]), ...run([0], today, 'sleep')];
    expect(goalScore(assessGoals(metrics, entries, today))).toBe(100);
    expect(weeklyScore(metrics, entries, today)).toBe(100);
    expect(weekReview(metrics, entries, today).score).toBe(100);
  });
  it('distinguishes zero from missing, respects upper bound goals, and deduplicates dates', () => {
    const m = metric({ goal: 0, goalDirection: '<=' });
    const entries = [...run([0, 0, 0, 0]), ...run([0])];
    const [assessment] = assessGoals([m], entries, today);
    expect(assessment).toMatchObject({ logged: 4, average: 0, status: 'met' });
  });
  it('weekly habits use target days instead of an irrelevant daily average', () => {
    const m = metric({ weeklyTarget: 1 });
    expect(assessGoals([m], run([4, 0, 0]), today)[0].status).toBe('met');
    expect(weekReview([m], run([4, 0, 0]), today).score).toBe(100);
  });
  it('does not fail a weekly habit before the week is over', () => {
    const m = metric({ weeklyTarget: 3 });
    expect(assessGoals([m], [], today)[0].status).toBe('in-progress');
    expect(assessGoals([m], [], '2026-10-25')[0].status).toBe('collecting');
    expect(assessGoals([m], run([0, 0, 0, 0, 0, 0, 0], '2026-10-25'), '2026-10-25')[0].status).toBe(
      'off-track',
    );
  });
  it('does not count last week or future days toward a weekly target', () => {
    const m = metric({ weeklyTarget: 1 });
    const entries = [...run([4], '2026-10-18'), ...run([4], '2026-10-22')];
    expect(assessGoals([m], entries, today)[0].hits).toBe(0);
  });
  it('does not manufacture a largest mover from one day in either comparison window', () => {
    const entries = [...run([20]), ...run([1, 1, 1, 1], addDays(today, -7))];
    expect(summarize([metric()], entries, today).some((i) => i.kind === 'mover')).toBe(false);
  });
  it('does not call a weekly streak a daily streak', () => {
    const m = metric({ weeklyTarget: 1 });
    const entries = ['2026-10-05', '2026-10-12', '2026-10-19'].map((date) => ({
      metricId: m.id,
      date,
      value: 5,
    }));
    entries.push(...run([0, 0]));
    const streak = summarize([m], entries, today).find((i) => i.kind === 'streak');
    expect(streak?.text).toContain('3 weeks');
  });
});
describe('useful, conservative alerts', () => {
  it('reminds only when due and an active metric has no entry, allowing an explicit zero', () => {
    expect(dashboardAlerts([metric()], [], today, false).some((a) => a.kind === 'reminder')).toBe(
      false,
    );
    expect(dashboardAlerts([metric()], [], today, true).some((a) => a.kind === 'reminder')).toBe(
      true,
    );
    expect(
      dashboardAlerts([metric()], run([0]), today, true).some((a) => a.kind === 'reminder'),
    ).toBe(false);
  });
  it('does not remind a completed weekly habit to log again', () => {
    const m = metric({ weeklyTarget: 1 });
    expect(dashboardAlerts([m], run([4], addDays(today, -1)), today, true)).toEqual([]);
  });
  it('requires three completed days, never an unfinished today, for a goal alert', () => {
    expect(
      dashboardAlerts([metric()], run([0, 0, 0]), today, false).some((a) => a.kind === 'goal'),
    ).toBe(false);
    expect(
      dashboardAlerts([metric()], run([0, 0, 0], addDays(today, -1)), today, false).some(
        (a) => a.kind === 'goal',
      ),
    ).toBe(true);
  });
  it('does not fill a gap with zero or alert on an inactive metric', () => {
    expect(
      dashboardAlerts([metric()], run([0, 0], addDays(today, -1)), today, false).some(
        (a) => a.kind === 'goal',
      ),
    ).toBe(false);
    expect(dashboardAlerts([metric({ active: false })], [], today, true)).toEqual([]);
  });
  it('honors upper bounds and does not judge weekly habits as daily failures', () => {
    const entries = run([9, 9, 9], addDays(today, -1));
    expect(
      dashboardAlerts([metric({ goalDirection: '<=' })], entries, today, false).some(
        (a) => a.kind === 'goal',
      ),
    ).toBe(true);
    expect(
      dashboardAlerts([metric({ weeklyTarget: 1 })], entries, today, false).some(
        (a) => a.kind === 'goal' || a.kind === 'coverage',
      ),
    ).toBe(false);
  });
});
