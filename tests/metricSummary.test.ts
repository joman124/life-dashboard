import { describe, expect, it } from 'vitest';
import type { Entry, GoalDirection, Metric, Unit } from '@/lib/types';
import { metricSummary, weekReview } from '@/lib/insights';
import { addDays } from '@/lib/dates';

const TODAY = '2026-03-15';

function metric(id: string, over: Partial<Metric> = {}): Metric {
  return {
    id,
    name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    emoji: '🎯',
    unit: 'h' as Unit,
    goal: 5,
    goalDirection: '>=' as GoalDirection,
    step: 0.5,
    max: 24,
    active: true,
    category: 'CUSTOM',
    description: '',
    ...over,
  };
}

/** Values ending on `end`, oldest first. */
function run(metricId: string, values: number[], end = TODAY): Entry[] {
  return values.map((value, i) => ({
    metricId,
    date: addDays(end, -(values.length - 1 - i)),
    value,
  }));
}

describe('metricSummary', () => {
  it('returns empty text when nothing is logged in the window', () => {
    const out = metricSummary(metric('sleep'), [], TODAY, 30);
    expect(out.text).toBe('');
    expect(out.average).toBeNull();
    expect(out.logged).toBe(0);
  });

  it('averages only the days inside the window', () => {
    // 10 on every day of the last 7, and 100 well outside it.
    const entries = [
      ...run('sleep', [10, 10, 10, 10, 10, 10, 10]),
      { metricId: 'sleep', date: addDays(TODAY, -60), value: 100 },
    ];
    const out = metricSummary(metric('sleep'), entries, TODAY, 7);
    expect(out.average).toBe(10);
    expect(out.logged).toBe(7);
  });

  it('counts days meeting the goal, not days logged', () => {
    const entries = run('sleep', [8, 8, 2, 2, 8]); // goal >= 5 → 3 of 5
    const out = metricSummary(metric('sleep', { goal: 5 }), entries, TODAY, 7);
    expect(out.text).toContain('3 of 5');
  });

  it('compares against the equally-long window before it', () => {
    // Prior 5 days average 5, recent 5 days average 10 → +100%.
    const entries = [...run('sleep', [5, 5, 5, 5, 5], addDays(TODAY, -5)), ...run('sleep', [10, 10, 10, 10, 10])];
    const out = metricSummary(metric('sleep'), entries, TODAY, 5);
    expect(out.changePct).toBe(100);
    expect(out.text).toContain('up 100%');
  });

  it('reads a rise as good for a >= metric and bad for a <= metric', () => {
    const entries = [
      ...run('pickups', [10, 10, 10], addDays(TODAY, -3)),
      ...run('pickups', [20, 20, 20]),
    ];
    const up = metricSummary(metric('pickups', { goalDirection: '>=' }), entries, TODAY, 3);
    const down = metricSummary(metric('pickups', { goalDirection: '<=' }), entries, TODAY, 3);
    expect(up.tone).toBe('good');
    expect(down.tone).toBe('bad');
  });

  it('has no change to report when there is no prior window', () => {
    const out = metricSummary(metric('sleep'), run('sleep', [7, 7, 7]), TODAY, 3);
    expect(out.changePct).toBeNull();
    expect(out.text).not.toContain('%');
  });

  it('renders a custom unit label in the sentence', () => {
    const m = metric('reading', { unit: 'pages', goal: 20 });
    const out = metricSummary(m, run('reading', [30, 30, 30]), TODAY, 3);
    expect(out.text).toContain('30 pages');
  });
});

describe('weekReview', () => {
  it('reports no data rather than a zero score when nothing is logged', () => {
    const out = weekReview([metric('sleep')], [], TODAY);
    expect(out.hasData).toBe(false);
    expect(out.recommendations).toEqual([]);
  });

  it('scores the share of active metrics whose 7-day average meets goal', () => {
    const metrics = [metric('sleep', { goal: 6.5 }), metric('deep-work', { goal: 4 })];
    const entries = [
      ...run('sleep', [7, 7, 7, 7, 7, 7, 7]), // meets
      ...run('deep-work', [1, 1, 1, 1, 1, 1, 1]), // misses
    ];
    expect(weekReview(metrics, entries, TODAY).score).toBe(50);
  });

  it('gives a strong-week headline at 75 or above', () => {
    const entries = run('sleep', [8, 8, 8, 8, 8, 8, 8]);
    const out = weekReview([metric('sleep', { goal: 6.5 })], entries, TODAY);
    expect(out.score).toBe(100);
    expect(out.headline).toBe('Strong week.');
  });

  it('gives a rebuild headline below 50', () => {
    const entries = run('sleep', [1, 1, 1, 1, 1, 1, 1]);
    const out = weekReview([metric('sleep', { goal: 6.5 })], entries, TODAY);
    expect(out.headline).toBe('Rebuild week — pick one metric to win.');
  });

  it('leads with the widest goal gap and states the daily delta', () => {
    const metrics = [metric('sleep', { goal: 8 }), metric('deep-work', { goal: 4 })];
    const entries = [
      ...run('sleep', [7.5, 7.5, 7.5, 7.5, 7.5, 7.5, 7.5]), // 6% short
      ...run('deep-work', [1, 1, 1, 1, 1, 1, 1]), // 75% short — the wider gap
    ];
    const out = weekReview(metrics, entries, TODAY);
    expect(out.recommendations[0].metricId).toBe('deep-work');
    expect(out.recommendations[0].text).toContain('Add about 3h a day');
  });

  it('says cut, not add, when the goal is an upper bound', () => {
    const m = metric('pickups', { goal: 50, goalDirection: '<=', unit: 'count' });
    const out = weekReview([m], run('pickups', [90, 90, 90, 90, 90, 90, 90]), TODAY);
    expect(out.recommendations[0].text).toMatch(/^Cut about 40 a day/);
  });

  it('flags a metric logged too rarely to correlate', () => {
    const metrics = [metric('sleep', { goal: 6.5 }), metric('mood', { goal: 5 })];
    const entries = [
      ...run('sleep', [7, 7, 7, 7, 7, 7, 7]),
      ...run('mood', [6, 6]), // only 2 of the last 14 days
    ];
    const texts = weekReview(metrics, entries, TODAY).recommendations.map((r) => r.text);
    expect(texts.some((t) => t.includes('Log Mood more often'))).toBe(true);
  });

  it('recommends raising a goal when every goal is already met', () => {
    // A full fortnight logged, comfortably over a goal of 5 — nothing to fix,
    // so the only honest recommendation left is to raise the bar.
    const entries = run('sleep', Array<number>(14).fill(10));
    const out = weekReview([metric('sleep', { goal: 5 })], entries, TODAY);
    expect(out.recommendations).toHaveLength(1);
    expect(out.recommendations[0].text).toContain('raise that goal');
  });

  it('prioritises logging discipline over raising a goal', () => {
    // Same metric, same comfortable margin, but only half the fortnight logged.
    // Sparse data is the more useful thing to say, so it wins the slot.
    const entries = run('sleep', [10, 10, 10, 10, 10, 10, 10]);
    const out = weekReview([metric('sleep', { goal: 5 })], entries, TODAY);
    expect(out.recommendations[0].text).toContain('Log Sleep more often');
  });

  it('never returns more than three recommendations', () => {
    const metrics = ['a', 'b', 'c', 'd', 'e'].map((id) => metric(id, { goal: 10 }));
    const entries = metrics.flatMap((m) => run(m.id, [1, 1, 1, 1, 1, 1, 1]));
    expect(weekReview(metrics, entries, TODAY).recommendations.length).toBeLessThanOrEqual(3);
  });

  it('ignores inactive metrics when scoring', () => {
    const metrics = [metric('sleep', { goal: 6.5 }), metric('old', { goal: 99, active: false })];
    const entries = [...run('sleep', [7, 7, 7, 7, 7, 7, 7]), ...run('old', [0, 0, 0, 0, 0, 0, 0])];
    expect(weekReview(metrics, entries, TODAY).score).toBe(100);
  });
});
