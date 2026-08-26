import { describe, expect, test } from 'vitest';
import type { Entry, GoalDirection, Metric, Unit } from '@/lib/types';
import { buildBrief, renderBriefText } from '@/lib/brief';
import { addDays } from '@/lib/dates';

/** A Wednesday, so "week to date" is Mon–Wed and has a same-weekday prior week. */
const WEDNESDAY = '2026-08-26';
const MONDAY = '2026-08-24';

function metric(id: string, over: Partial<Metric> = {}): Metric {
  return {
    id,
    name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    emoji: '🎯',
    unit: 'h' as Unit,
    goal: 4,
    goalDirection: '>=' as GoalDirection,
    step: 0.5,
    max: 24,
    active: true,
    category: 'CUSTOM',
    description: '',
    ...over,
  };
}

/** Values ending on `end`, one per day going back. */
function run(metricId: string, values: number[], end = WEDNESDAY): Entry[] {
  return values.map((value, i) => ({
    metricId,
    date: addDays(end, -(values.length - 1 - i)),
    value,
  }));
}

function on(metricId: string, date: string, value: number): Entry {
  return { metricId, date, value };
}

describe('the week window', () => {
  test('runs Monday to today, not a trailing seven days', () => {
    const brief = buildBrief([metric('deep-work')], [], WEDNESDAY);

    expect(brief.week.start).toBe(MONDAY);
    expect(brief.week.end).toBe(WEDNESDAY);
    expect(brief.week.daysElapsed).toBe(3);
    expect(brief.week.metrics[0]?.days.map((d) => d.day)).toEqual(['Mon', 'Tue', 'Wed']);
  });

  test('a Monday is a one-day week, not an empty or a full one', () => {
    const brief = buildBrief([metric('deep-work')], [], MONDAY);

    expect(brief.week.daysElapsed).toBe(1);
    expect(brief.week.metrics[0]?.days).toHaveLength(1);
  });

  test('a Sunday closes the week at seven days', () => {
    const brief = buildBrief([metric('deep-work')], [], '2026-08-30');

    expect(brief.week.start).toBe(MONDAY);
    expect(brief.week.daysElapsed).toBe(7);
  });

  test('last week is excluded even when it is the only data there is', () => {
    // The trap a trailing-7 window falls into: last Thursday is not this week.
    const entries = [on('deep-work', '2026-08-20', 8)];
    const brief = buildBrief([metric('deep-work')], entries, WEDNESDAY);

    expect(brief.week.metrics[0]?.daysLogged).toBe(0);
    expect(brief.week.metrics[0]?.average).toBeNull();
  });

  test('reports the ISO week number and its week-numbering year', () => {
    expect(buildBrief([], [], WEDNESDAY).week.number).toBe(35);
    // 1 Jan 2027 is a Friday and belongs to week 53 of 2026.
    expect(buildBrief([], [], '2027-01-01').week.year).toBe(2026);
  });
});

describe('per-metric week to date', () => {
  test('averages only the logged days and counts the ones at goal', () => {
    const entries = [
      on('deep-work', MONDAY, 5), // at goal
      on('deep-work', '2026-08-25', 1), // short
      // Wednesday unlogged
    ];
    const m = buildBrief([metric('deep-work')], entries, WEDNESDAY).week.metrics[0];

    expect(m?.average).toBe(3);
    expect(m?.daysLogged).toBe(2);
    expect(m?.daysAtGoal).toBe(1);
    expect(m?.onTrack).toBe(false);
    expect(m?.days[2]).toMatchObject({ day: 'Wed', value: null, atGoal: false });
  });

  test('an unlogged day stays null rather than becoming a zero', () => {
    // A zero is a real, terrible day; a null is a day you did not log. Averaging
    // them together would quietly invent bad news.
    const m = buildBrief([metric('deep-work')], [on('deep-work', MONDAY, 6)], WEDNESDAY)
      .week.metrics[0];

    expect(m?.average).toBe(6);
    expect(m?.days.map((d) => d.value)).toEqual([6, null, null]);
  });

  test('compares against the same weekdays of last week, not the last seven days', () => {
    // Mon–Wed this week average 6; Mon–Wed last week average 3. A trailing-7
    // comparison would drag in last Thu–Sun and report something else.
    const entries = [
      on('deep-work', MONDAY, 6),
      on('deep-work', '2026-08-25', 6),
      on('deep-work', WEDNESDAY, 6),
      on('deep-work', '2026-08-17', 3),
      on('deep-work', '2026-08-18', 3),
      on('deep-work', '2026-08-19', 3),
      on('deep-work', '2026-08-20', 12), // last Thursday — outside the comparison
      on('deep-work', '2026-08-23', 12), // last Sunday — outside it too
    ];
    const m = buildBrief([metric('deep-work')], entries, WEDNESDAY).week.metrics[0];

    expect(m?.changePct).toBe(100);
    expect(m?.changeIsGood).toBe(true);
  });

  test('a fall is good news for a "at most" metric', () => {
    const pickups = metric('phone-pickups', { goal: 50, goalDirection: '<=', unit: 'count' });
    const entries = [
      on('phone-pickups', MONDAY, 40),
      on('phone-pickups', '2026-08-17', 80),
    ];
    const m = buildBrief([pickups], entries, WEDNESDAY).week.metrics[0];

    expect(m?.changePct).toBe(-50);
    expect(m?.changeIsGood).toBe(true);
    expect(m?.onTrack).toBe(true);
  });

  test('carries today separately from the week', () => {
    const entries = [on('deep-work', MONDAY, 5), on('deep-work', WEDNESDAY, 2)];
    const m = buildBrief([metric('deep-work')], entries, WEDNESDAY).week.metrics[0];

    expect(m?.today).toBe(2);
    expect(m?.loggedToday).toBe(true);
    expect(m?.atGoalToday).toBe(false);
  });

  test('names what is still unlogged today', () => {
    const metrics = [metric('deep-work'), metric('sleep'), metric('steps')];
    const brief = buildBrief(metrics, [on('deep-work', WEDNESDAY, 4)], WEDNESDAY);

    expect(brief.notLoggedToday).toEqual(['Sleep', 'Steps']);
  });

  test('says so plainly when a metric has nothing this week', () => {
    const m = buildBrief([metric('deep-work')], [], WEDNESDAY).week.metrics[0];

    expect(m?.summary).toBe('Nothing logged this week yet — goal is ≥ 4h.');
  });

  test('inactive metrics are left out entirely', () => {
    const metrics = [metric('deep-work'), metric('energy', { active: false })];
    const brief = buildBrief(metrics, run('energy', [9, 9, 9]), WEDNESDAY);

    expect(brief.week.metrics.map((m) => m.id)).toEqual(['deep-work']);
    expect(brief.week.activeMetrics).toBe(1);
  });
});

describe('the score', () => {
  test('counts metrics at goal out of the metrics with data', () => {
    const metrics = [metric('deep-work'), metric('sleep', { goal: 6.5 })];
    const entries = [on('deep-work', MONDAY, 5), on('sleep', MONDAY, 5)];
    const brief = buildBrief(metrics, entries, WEDNESDAY);

    expect(brief.week.score).toBe(50);
    expect(brief.week.scoredMetrics).toBe(2);
  });

  test('a metric with nothing logged is unknown, not failed', () => {
    // Scoring an unlogged metric as a miss would punish the user for a quiet
    // Monday and make the number meaningless on any partial week.
    const metrics = [metric('deep-work'), metric('sleep', { goal: 6.5 })];
    const brief = buildBrief(metrics, [on('deep-work', MONDAY, 5)], WEDNESDAY);

    expect(brief.week.score).toBe(100);
    expect(brief.week.scoredMetrics).toBe(1);
    expect(brief.week.activeMetrics).toBe(2);
  });

  test('an empty week scores zero and says why', () => {
    const brief = buildBrief([metric('deep-work')], [], WEDNESDAY);

    expect(brief.week.score).toBe(0);
    expect(brief.week.scoredMetrics).toBe(0);
    expect(brief.week.headline).toBe('Nothing logged this week yet.');
  });

  test('the headline follows the score', () => {
    const three = [metric('a'), metric('b'), metric('c')];
    const allGood = three.flatMap((m) => [on(m.id, MONDAY, 8)]);
    expect(buildBrief(three, allGood, WEDNESDAY).week.headline).toBe('Strong week so far.');

    const oneGood = [on('a', MONDAY, 8), on('b', MONDAY, 1), on('c', MONDAY, 1)];
    expect(buildBrief(three, oneGood, WEDNESDAY).week.headline).toBe(
      'Rebuild week — pick one metric to win.',
    );
  });
});

describe('focus for today', () => {
  test('leads with the widest goal gap, stated as the move it takes', () => {
    const metrics = [metric('deep-work', { goal: 4 }), metric('sleep', { goal: 8 })];
    const entries = [
      on('deep-work', MONDAY, 1), // 75% short
      on('sleep', MONDAY, 7), // 12.5% short
    ];
    const focus = buildBrief(metrics, entries, WEDNESDAY).focus;

    expect(focus[0]?.reason).toBe('gap');
    expect(focus[0]?.metricId).toBe('deep-work');
    expect(focus[0]?.text).toContain('widest gap');
    expect(focus[0]?.text).toContain('about 3h');
  });

  test('says "cutting" rather than "finding" for an at-most metric', () => {
    const pickups = metric('phone-pickups', { goal: 50, goalDirection: '<=', unit: 'count' });
    const focus = buildBrief([pickups], [on('phone-pickups', MONDAY, 90)], WEDNESDAY).focus;

    expect(focus[0]?.text).toContain('cutting about 40');
  });

  test('flags a live streak that today decides', () => {
    const metrics = [metric('deep-work', { goal: 4 }), metric('sleep', { goal: 6 })];
    const entries = [
      on('deep-work', MONDAY, 1), // the gap, so it claims the first slot
      // Sleep has hit goal for four straight days and is unlogged today.
      ...run('sleep', [7, 7, 7, 7], addDays(WEDNESDAY, -1)),
    ];
    const streak = buildBrief(metrics, entries, WEDNESDAY).focus.find((f) => f.reason === 'streak');

    expect(streak?.metricId).toBe('sleep');
    expect(streak?.text).toContain('4-day run');
  });

  test('stays quiet about a streak already secured today', () => {
    // Nudging someone to protect a run they have already logged is noise.
    const metrics = [metric('deep-work', { goal: 4 }), metric('sleep', { goal: 6 })];
    const entries = [
      on('deep-work', MONDAY, 1),
      ...run('sleep', [7, 7, 7, 7, 7], WEDNESDAY),
    ];
    const focus = buildBrief(metrics, entries, WEDNESDAY).focus;

    expect(focus.find((f) => f.reason === 'streak')).toBeUndefined();
  });

  test('points at the lever the user’s own correlations support', () => {
    // Sleep and deep work move together across the whole month; deep work is
    // the one off goal, so sleep is the lever.
    const metrics = [metric('deep-work', { goal: 8 }), metric('sleep', { goal: 5 })];
    const entries: Entry[] = [];
    for (let i = 0; i < 20; i++) {
      const date = addDays(WEDNESDAY, -i);
      const v = 4 + (i % 5);
      entries.push(on('deep-work', date, v), on('sleep', date, v + 2));
    }
    const lever = buildBrief(metrics, entries, WEDNESDAY).focus.find((f) => f.reason === 'lever');

    expect(lever?.metricId).toBe('sleep');
    expect(lever?.text).toContain('Correlation, not proof');
  });

  test('names a metric too sparsely logged to analyse', () => {
    const metrics = [metric('deep-work'), metric('energy', { goal: 7, unit: '/10' })];
    const entries = [on('deep-work', MONDAY, 1), on('energy', MONDAY, 9)];
    const coverage = buildBrief(metrics, entries, WEDNESDAY).focus.find(
      (f) => f.reason === 'coverage',
    );

    expect(coverage?.metricId).toBe('energy');
    expect(coverage?.text).toContain('1 of the last 14 days');
  });

  test('never names the same metric twice', () => {
    const metrics = [metric('deep-work'), metric('sleep', { goal: 6 }), metric('steps')];
    const entries = [
      on('deep-work', MONDAY, 1),
      on('sleep', MONDAY, 2),
      on('steps', MONDAY, 1),
    ];
    const ids = buildBrief(metrics, entries, WEDNESDAY).focus.map((f) => f.metricId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test('caps at three items', () => {
    const metrics = ['a', 'b', 'c', 'd', 'e'].map((id) => metric(id));
    const entries = metrics.map((m) => on(m.id, MONDAY, 1));

    expect(buildBrief(metrics, entries, WEDNESDAY).focus.length).toBeLessThanOrEqual(3);
  });

  test('recommends raising a goal rather than inventing a worry', () => {
    const metrics = [metric('deep-work', { goal: 4 })];
    const entries = run('deep-work', Array(14).fill(8), WEDNESDAY);
    const focus = buildBrief(metrics, entries, WEDNESDAY).focus;

    expect(focus).toHaveLength(1);
    expect(focus[0]?.reason).toBe('raise');
    expect(focus[0]?.text).toContain('raise that goal');
  });

  test('asks for a first entry when nothing has been logged at all', () => {
    // The one recommendation an empty dashboard can honestly make.
    const focus = buildBrief([metric('deep-work')], [], WEDNESDAY).focus;

    expect(focus).toHaveLength(1);
    expect(focus[0]?.reason).toBe('coverage');
    expect(focus[0]?.text).toContain('0 of the last 14 days');
  });

  test('recommends nothing when there is no active metric to recommend about', () => {
    expect(buildBrief([metric('deep-work', { active: false })], [], WEDNESDAY).focus).toEqual([]);
  });
});

describe('patterns', () => {
  test('needs eight shared days before a pair qualifies', () => {
    const metrics = [metric('deep-work'), metric('sleep')];
    const entries: Entry[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(WEDNESDAY, -i);
      entries.push(on('deep-work', date, i), on('sleep', date, i));
    }

    expect(buildBrief(metrics, entries, WEDNESDAY).patterns).toEqual([]);
  });

  test('reports the pair, its r and the days behind it', () => {
    const metrics = [metric('deep-work'), metric('sleep')];
    const entries: Entry[] = [];
    for (let i = 0; i < 12; i++) {
      const date = addDays(WEDNESDAY, -i);
      entries.push(on('deep-work', date, i), on('sleep', date, i));
    }
    const p = buildBrief(metrics, entries, WEDNESDAY).patterns[0];

    expect(p?.n).toBe(12);
    expect(p?.r).toBe(1);
    expect(p?.text).toContain('12 shared days');
  });
});

describe('renderBriefText', () => {
  const metrics = [metric('deep-work', { emoji: '🧠', goal: 4 })];
  const entries = [on('deep-work', MONDAY, 5), on('deep-work', WEDNESDAY, 2)];

  test('carries the week, the metric and today', () => {
    const text = renderBriefText(buildBrief(metrics, entries, WEDNESDAY));

    expect(text).toContain('# Life Dashboard — week to date');
    expect(text).toContain('Wednesday, August 26');
    expect(text).toContain('ISO week 35');
    expect(text).toContain('### 🧠 Deep Work');
    expect(text).toContain('## What to focus on today');
    expect(text).toContain('Mon 5h');
    expect(text).toContain('Today: 2h');
  });

  test('marks an unlogged day with a dash rather than a number', () => {
    const text = renderBriefText(buildBrief(metrics, [on('deep-work', MONDAY, 5)], WEDNESDAY));

    expect(text).toContain('Tue — · Wed —');
    expect(text).toContain('Today: not logged yet');
  });

  test('links back when the caller knows the origin', () => {
    const text = renderBriefText(
      buildBrief(metrics, entries, WEDNESDAY, { dashboardUrl: 'https://example.test' }),
    );

    expect(text).toContain('https://example.test');
  });

  test('an empty week renders honestly instead of pretending', () => {
    const text = renderBriefText(buildBrief(metrics, [], WEDNESDAY));

    expect(text).toContain('Nothing logged this week yet.');
    expect(text).toContain('Log it today');
    expect(text).not.toContain('## Patterns');
  });

  test('renders with no active metrics at all', () => {
    const text = renderBriefText(buildBrief([], [], WEDNESDAY));

    expect(text).toContain('No active metrics.');
    expect(text).toContain('Not enough logged yet to recommend anything honestly.');
  });
});
