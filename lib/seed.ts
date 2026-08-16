/**
 * lib/seed.ts — first-run seed: 5 default metrics + 30 days of engineered demo entries.
 *
 * Deterministic: a fixed-seed mulberry32 PRNG drives every value, so wiping the
 * DB and reseeding on the same calendar day reproduces identical data.
 *
 * Engineered relationships (per spec "Seed data"):
 *   - sleep <-> deep-work strongly positive: Pearson r >= 0.65 is VERIFIED after
 *     generation; if the draw falls short, the coupling factor is bumped and the
 *     whole set is regenerated (same PRNG seed, so still deterministic).
 *   - phone-pickups negatively coupled to deep-work
 *   - energy loosely tracks sleep (seeded even though the metric starts inactive,
 *     so toggling it on demos instantly)
 *   - steps loosely track energy, with a mild weekend bump
 *   - mood tracks sleep, and deep work more weakly
 *   - screen time rises with phone pickups and falls as deep work rises
 *
 * Dates seeded: today-30 .. today-1. TODAY is intentionally left unlogged so
 * "Log Today" starts fresh and the today-optional streak logic is exercised.
 */
import type { InStatement } from '@libsql/client';
import type { DB } from '@/lib/db';
import { addDays, todayISO } from '@/lib/dates';

/* ------------------------------------------------------------ default metrics */

export interface SeedMetric {
  id: string;
  name: string;
  emoji: string;
  unit: string;
  goal: number;
  goalDirection: string;
  step: number;
  max: number;
  active: 0 | 1;
  category: string;
  description: string;
}

export const DEFAULT_METRICS: SeedMetric[] = [
  {
    id: 'deep-work',
    name: 'Deep Work',
    emoji: '🧠',
    unit: 'h',
    goal: 4,
    goalDirection: '>=',
    step: 0.5,
    max: 16,
    active: 1,
    category: 'FOCUS',
    description: 'Uninterrupted focus time',
  },
  {
    id: 'phone-pickups',
    name: 'Phone Pickups',
    emoji: '📵',
    unit: 'count',
    goal: 50,
    goalDirection: '<=',
    step: 5,
    max: 200,
    active: 1,
    category: 'FOCUS',
    description: 'Screen unlocks per day',
  },
  {
    id: 'sleep',
    name: 'Sleep',
    emoji: '😴',
    unit: 'h',
    goal: 6.5,
    goalDirection: '>=',
    step: 0.25,
    max: 12,
    active: 1,
    category: 'BODY',
    description: 'Hours asleep last night',
  },
  {
    id: 'steps',
    name: 'Steps',
    emoji: '👟',
    unit: 'count',
    goal: 8000,
    goalDirection: '>=',
    step: 500,
    max: 30000,
    active: 1,
    category: 'BODY',
    description: 'Daily step count',
  },
  {
    id: 'energy',
    name: 'Energy',
    emoji: '⚡',
    unit: '/10',
    goal: 7,
    goalDirection: '>=',
    step: 1,
    max: 10,
    active: 0,
    category: 'MIND',
    description: 'Subjective energy, 1–10',
  },
  {
    // Fed automatically by Apple Journal / Health "State of Mind" via the health
    // webhook, which converts HealthKit's -1..+1 valence onto this 1–10 scale
    // (lib/health/stateOfMind.ts). Also loggable by hand like any other metric.
    id: 'mood',
    name: 'Mood',
    emoji: '🙂',
    unit: '/10',
    goal: 7,
    goalDirection: '>=',
    step: 1,
    max: 10,
    active: 1,
    category: 'MIND',
    description: 'Journal State of Mind, 1–10',
  },
  {
    // Screen Time has no API of any kind (see README), so this metric is fed by
    // a Shortcut that ASKS for the number rather than reading it. Unit is hours
    // to match what Settings displays; the webhook accepts "3h 24m" verbatim.
    id: 'screen-time',
    name: 'Screen Time',
    emoji: '📱',
    unit: 'h',
    goal: 3,
    goalDirection: '<=',
    step: 0.25,
    max: 24,
    active: 1,
    category: 'FOCUS',
    description: 'Daily phone screen time',
  },
];

/**
 * Metrics added after the original five. Each is applied to already-seeded
 * databases by its own guarded migration in lib/db/client.ts, so the marker for
 * one never suppresses the other.
 */
export const ADDED_METRIC_IDS = ['mood', 'screen-time'] as const;

/* ------------------------------------------------------------------- helpers */

/** mulberry32 — tiny deterministic PRNG; returns floats in [0, 1). */
function mulberry32(seedValue: number): () => number {
  let a = seedValue >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Pearson correlation coefficient. Local copy so seeding never depends on lib/correlations.ts internals. */
function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
}

/* ---------------------------------------------------------------- generation */

interface SeedEntry {
  metricId: string;
  date: string;
  value: number;
}

const PRNG_SEED = 20260611; // fixed -> reproducible reseeds
const MIN_SLEEP_DEEPWORK_R = 0.65;

function generate(dates: string[], coupling: number): { rows: SeedEntry[]; r: number } {
  const rand = mulberry32(PRNG_SEED); // same seed every attempt: fully deterministic
  const rows: SeedEntry[] = [];
  const sleepSeries: number[] = [];
  const deepSeries: number[] = [];

  for (const date of dates) {
    const dow = new Date(`${date}T00:00:00`).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const noise = (amp: number) => (rand() * 2 - 1) * amp;

    // Sleep: base 7.3 +/- ~1.1, clamp 5.0-9.5, round to 0.1
    const sleep = Math.round(clamp(7.3 + noise(1.1), 5.0, 9.5) * 10) / 10;

    // Deep work: driven by sleep (coupling verified below), clamp 0-9, round to 0.5
    const deepWork = Math.round(clamp(0.6 + (sleep - 6.5) * coupling + noise(0.6), 0, 9) * 2) / 2;

    // Phone pickups: inverse of deep work, clamp 20-160, integer
    const pickups = Math.round(clamp(92 - deepWork * 8 + noise(12), 20, 160));

    // Energy: loosely tracks sleep, integer 3-9 (seeded although metric starts inactive)
    const energy = clamp(Math.round(6 + (sleep - 7.3) * 1.1 + noise(1.6)), 3, 9);

    // Steps: loose positive tie to energy + mild weekend bump, clamp 6000-13500, nearest 50
    const steps =
      Math.round(clamp(7400 + (energy - 6) * 550 + noise(2400) + (isWeekend ? 1300 : 0), 6000, 13500) / 50) * 50;

    // Mood: tracks sleep and (less so) deep work, on the same 1-10 scale a
    // converted State of Mind valence lands on. Drawn last so adding it leaves
    // the tuned sleep <-> deep-work coupling above untouched. Round to 0.5,
    // matching the granularity a real valence conversion produces.
    const mood =
      Math.round(clamp(5.8 + (sleep - 7.3) * 0.9 + (deepWork - 3) * 0.15 + noise(1.2), 1, 10) * 2) / 2;

    // Screen time: rises with phone pickups and eats into deep work, with a
    // weekend bump. Rounded to 0.25h — finer than a user typing "3h 15m" needs,
    // and the same granularity the stepper offers.
    const screenTime =
      Math.round(
        clamp(1.6 + (pickups - 92) * 0.035 - (deepWork - 3) * 0.2 + noise(0.9) + (isWeekend ? 0.8 : 0), 0.5, 11)
          * 4
      ) / 4;

    rows.push(
      { metricId: 'sleep', date, value: sleep },
      { metricId: 'deep-work', date, value: deepWork },
      { metricId: 'phone-pickups', date, value: pickups },
      { metricId: 'steps', date, value: steps },
      { metricId: 'energy', date, value: energy },
      { metricId: 'mood', date, value: mood },
      { metricId: 'screen-time', date, value: screenTime }
    );
    sleepSeries.push(sleep);
    deepSeries.push(deepWork);
  }

  return { rows, r: pearson(sleepSeries, deepSeries) };
}

/* ---------------------------------------------------------------------- seed */

/**
 * Populates an empty database. Called by lib/db.ts when the metrics table has
 * zero rows. Timeline and sync_state are intentionally left empty in Phase 1.
 *
 * The generation + Pearson-coupling verify loop below is pure and synchronous
 * (a fixed-seed PRNG, so reseeding on the same calendar day is deterministic);
 * only the database writes are async. All inserts go out as a single libSQL
 * write batch, which is atomic — the metrics and entries either all land or none
 * do, matching the original better-sqlite3 transaction semantics.
 */
export async function seed(client: DB): Promise<void> {
  const today = todayISO();
  const dates: string[] = [];
  for (let i = 30; i >= 1; i--) dates.push(addDays(today, -i)); // today-30 .. today-1

  // Generate, then VERIFY the demo correlation the spec requires; bump coupling
  // and regenerate until r(sleep, deep-work) >= 0.65. Pure/synchronous.
  let coupling = 1.55;
  let { rows, r } = generate(dates, coupling);
  let guard = 0;
  while (r < MIN_SLEEP_DEEPWORK_R && guard < 60) {
    coupling += 0.1;
    ({ rows, r } = generate(dates, coupling));
    guard++;
  }

  const statements: InStatement[] = [];
  for (const m of DEFAULT_METRICS) {
    statements.push({
      sql: `INSERT INTO metrics (id, name, emoji, unit, goal, goalDirection, step, "max", active, category, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [m.id, m.name, m.emoji, m.unit, m.goal, m.goalDirection, m.step, m.max, m.active, m.category, m.description],
    });
  }
  for (const row of rows) {
    statements.push({
      sql: `INSERT INTO entries (metricId, date, value) VALUES (?, ?, ?)
            ON CONFLICT (metricId, date) DO UPDATE SET value = excluded.value`,
      args: [row.metricId, row.date, row.value],
    });
  }

  await client.batch(statements, 'write');

  console.log(
    `[seed] inserted ${DEFAULT_METRICS.length} metrics and ${rows.length} entries ` +
      `(${dates[0]} .. ${dates[dates.length - 1]}); pearson r(sleep, deep-work) = ${r.toFixed(3)} ` +
      `at coupling ${coupling.toFixed(2)}`
  );
}
