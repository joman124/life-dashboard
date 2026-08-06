'use client';

// MetricCard — the single box for one metric on the Today tab.
//
// This used to be read-only, with a separate "Log today" card carrying the
// steppers for every metric. Splitting reading a number from changing it meant
// scrolling past all the cards to find the row you wanted. Now one card both
// reports the metric and edits it: eyebrow, delta pill, big value, sparkline,
// goal, progress bar, and the − / + controls that write the value.
//
// Everything is relative to `date` rather than to today, so the same card edits
// a backdated day when the day strip selects one.

import type { Entry, Metric } from '@/lib/types';
import { addDays, lastNDates } from '@/lib/dates';
import { deltaVsBaseline } from '@/lib/deltas';
import { loggedValues, progressPct, seriesFor, valueMap } from './data';
import { formatGoal, formatValue, unitSuffix } from './format';
import DeltaPill from './DeltaPill';
import Sparkline from './Sparkline';

export default function MetricCard({
  metric,
  entries,
  date,
  onLog,
}: {
  metric: Metric;
  entries: Entry[];
  /** The day this card reports on and edits. */
  date: string;
  /** Omitted in form mode — the card then renders read-only. */
  onLog?: (metricId: string, value: number, date: string) => void;
}) {
  const map = valueMap(entries, metric.id);
  const entry = map.get(date);
  const logged = entry !== undefined;
  const value = entry ?? null;

  const sparkValues = seriesFor(map, lastNDates(date, 7));
  const baseline = loggedValues(map, lastNDates(addDays(date, -1), 7));
  const delta = deltaVsBaseline(value, baseline, metric.goalDirection);
  const progress = progressPct(value, metric.goal, metric.goalDirection);
  const suffix = unitSuffix(metric.unit);

  function bump(sign: 1 | -1) {
    if (!onLog) return;
    const current = value ?? 0;
    const next = Math.round(Math.min(metric.max, Math.max(0, current + sign * metric.step)) * 100) / 100;
    // At a bound with a value already stored there is nothing to write; and on
    // an unlogged metric a − tap must not phantom-log a 0.
    if (next === current) return;
    onLog(metric.id, next, date);
  }

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow truncate">
          {metric.emoji} {metric.name}
        </span>
        <DeltaPill delta={delta} />
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-1">
          {value === null ? (
            <span className="font-display text-[34px] leading-none text-[color:var(--faint)]">—</span>
          ) : (
            <>
              <span className="font-display text-[34px] leading-none">
                {formatValue(value, metric.unit)}
              </span>
              {suffix && <span className="text-[14px] text-[color:var(--muted)]">{suffix}</span>}
            </>
          )}
        </div>
        <Sparkline values={sparkValues} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[12px] text-[color:var(--muted)]">
          {formatGoal(metric.goal, metric.unit, metric.goalDirection)}
          {!logged && <span className="ml-1.5 text-[color:var(--faint)]">· not logged</span>}
        </span>

        {onLog && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => bump(-1)}
              aria-label={`Decrease ${metric.name}`}
              className="grid h-11 w-11 place-items-center rounded-full border text-[18px] leading-none active:scale-95"
              style={{
                borderColor: 'var(--hairline)',
                background: 'var(--card-inset)',
                color: 'var(--muted)',
              }}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => bump(1)}
              aria-label={`Increase ${metric.name}`}
              className="grid h-11 w-11 place-items-center rounded-full border text-[18px] leading-none active:scale-95"
              style={{
                borderColor: 'var(--hairline)',
                background: 'var(--card-inset)',
                color: 'var(--gold)',
              }}
            >
              +
            </button>
          </div>
        )}
      </div>

      <div
        className="mt-2.5 h-1 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--gold-dim)' }}
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${metric.name} progress toward goal`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${progress}%`, background: 'var(--gold)' }}
        />
      </div>
    </section>
  );
}
