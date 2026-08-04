import { describe, expect, it } from 'vitest';
import type { Entry, GoalDirection, Metric, Unit } from '@/lib/types';
import { summarize } from '@/lib/insights';
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

/** n days of one value, ending on `end` (most recent first going back). */
function run(metricId: string, values: number[], end = TODAY): Entry[] {
  return values.map((value, i) => ({
    metricId,
    date: addDays(end, -(values.length - 1 - i)),
    value,
  }));
}

const kinds = (out: { kind: string }[]) => out.map((i) => i.kind);

describe('summarize', () => {
  it('returns nothing when no metrics are active', () => {
    const m = [metric('sleep', { active: false })];
    expect(summarize(m, run('sleep', [7, 7, 7, 7, 7, 7, 7]), TODAY)).toEqual([]);
  });

  it('returns nothing from too few logged days', () => {
    expect(summarize([metric('sleep')], run('sleep', [7, 7]), TODAY)).toEqual([]);
  });

  it('reports how many goals the 7-day average meets', () => {
    const metrics = [metric('sleep', { goal: 6.5 }), metric('deep-work', { goal: 4 })];
    const entries = [
      ...run('sleep', [7, 7, 7, 7, 7, 7, 7]), // meets 6.5
      ...run('deep-work', [1, 1, 1, 1, 1, 1, 1]), // misses 4
    ];

    const goals = summarize(metrics, entries, TODAY).find((i) => i.kind === 'goals');

    expect(goals?.text).toContain('meets 1 of 2 goals');
    expect(goals?.text).toContain('Deep Work');
  });

  it('keeps the sentence grammatical for a plural metric name', () => {
    // "Phone Pickups tends to be" would be wrong; the phrasing must not depend
    // on whether a user-supplied metric name is singular.
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const metrics = [
      metric('deep-work', { goal: 4 }),
      metric('phone-pickups', { name: 'Phone Pickups', goal: 50, goalDirection: '<=' }),
    ];
    const entries = [...run('deep-work', days), ...run('phone-pickups', days)];

    const pattern = summarize(metrics, entries, TODAY).find((i) => i.kind === 'pattern');

    expect(pattern?.text).toMatch(/^Days with higher /);
    expect(pattern?.text).not.toContain('pickups tends');
  });

  it('says "goal" not "goals" when only one is scored', () => {
    const entries = run('sleep', [1, 1, 1, 1, 1, 1, 1]);

    const goals = summarize([metric('sleep', { goal: 6.5 })], entries, TODAY).find(
      (i) => i.kind === 'goals',
    );

    expect(goals?.text).toContain('0 of 1 goal.');
  });

  it('says so when every goal is met', () => {
    const entries = run('sleep', [8, 8, 8, 8, 8, 8, 8]);

    const goals = summarize([metric('sleep', { goal: 6.5 })], entries, TODAY).find(
      (i) => i.kind === 'goals',
    );

    expect(goals?.text).toContain('your one active goal');
    expect(goals?.tone).toBe('good');
  });

  it('treats a fall in a <= metric as a good move', () => {
    // Prior week averaged 100, this week 50: down 50% on a "at most" metric.
    const entries = [
      ...run('pickups', [100, 100, 100, 100, 100, 100, 100], addDays(TODAY, -7)),
      ...run('pickups', [50, 50, 50, 50, 50, 50, 50], TODAY),
    ];
    const m = [metric('pickups', { goal: 60, goalDirection: '<=', unit: 'count', max: 500 })];

    const mover = summarize(m, entries, TODAY).find((i) => i.kind === 'mover');

    expect(mover?.tone).toBe('good');
    expect(mover?.text).toContain('down 50%');
    expect(mover?.text).toContain('right direction');
  });

  it('treats the same fall in a >= metric as a bad move', () => {
    const entries = [
      ...run('sleep', [8, 8, 8, 8, 8, 8, 8], addDays(TODAY, -7)),
      ...run('sleep', [4, 4, 4, 4, 4, 4, 4], TODAY),
    ];

    const mover = summarize([metric('sleep', { goal: 6.5 })], entries, TODAY).find(
      (i) => i.kind === 'mover',
    );

    expect(mover?.tone).toBe('bad');
    expect(mover?.text).toContain('wrong direction');
  });

  it('reports the longest current streak', () => {
    const entries = [
      ...run('sleep', [8, 8, 8, 8, 8, 8, 8]),
      ...run('deep-work', [9, 9, 0, 9, 9, 9, 9]),
    ];
    const metrics = [metric('sleep', { goal: 6.5 }), metric('deep-work', { goal: 4 })];

    const streak = summarize(metrics, entries, TODAY).find((i) => i.kind === 'streak');

    expect(streak?.text).toContain('Sleep');
    expect(streak?.text).toContain('7 days in a row');
  });

  it('flags a metric logged too rarely to correlate', () => {
    const entries = [...run('sleep', [8, 8, 8, 8, 8, 8, 8]), ...run('steps', [9000, 9000])];
    const metrics = [metric('sleep', { goal: 6.5 }), metric('steps', { unit: 'count', max: 5e4 })];

    const coverage = summarize(metrics, entries, TODAY).find((i) => i.kind === 'coverage');

    expect(coverage?.text).toContain('Steps');
    expect(coverage?.text).toContain('2 of the last 14 days');
    expect(coverage?.tone).toBe('bad');
  });

  it('does not flag coverage once a metric clears the 8-day floor', () => {
    const entries = [
      ...run('sleep', [8, 8, 8, 8, 8, 8, 8, 8, 8]),
      ...run('steps', [9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000]),
    ];
    const metrics = [metric('sleep', { goal: 6.5 }), metric('steps', { unit: 'count', max: 5e4 })];

    expect(kinds(summarize(metrics, entries, TODAY))).not.toContain('coverage');
  });

  it('surfaces a correlation once 8 shared days exist', () => {
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const entries = [
      ...run('sleep', days),
      ...run('deep-work', days), // perfectly correlated
    ];
    const metrics = [metric('sleep', { goal: 6.5 }), metric('deep-work', { goal: 4 })];

    const pattern = summarize(metrics, entries, TODAY).find((i) => i.kind === 'pattern');

    expect(pattern?.text).toContain('r = 1.00');
    expect(pattern?.text).toContain('10 shared days');
    expect(pattern?.text).toContain('not a causal claim');
  });

  it('never returns more than five bullets', () => {
    const metrics = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => metric(id, { goal: 1 }));
    const entries = metrics.flatMap((m) => run(m.id, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));

    expect(summarize(metrics, entries, TODAY).length).toBeLessThanOrEqual(5);
  });

  it('is deterministic for the same input', () => {
    const metrics = [metric('sleep', { goal: 6.5 }), metric('deep-work', { goal: 4 })];
    const entries = [...run('sleep', [7, 8, 6, 7, 8, 7, 9]), ...run('deep-work', [4, 5, 3, 4, 5, 4, 6])];

    expect(summarize(metrics, entries, TODAY)).toEqual(summarize(metrics, entries, TODAY));
  });
});
