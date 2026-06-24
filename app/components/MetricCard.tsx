// MetricCard — Today-tab focus card for one active metric:
// eyebrow `EMOJI NAME`, delta pill vs prior-7-day baseline (excluding today),
// big serif value, 7-day sparkline, goal text, thin gold progress bar.

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
  today,
}: {
  metric: Metric;
  entries: Entry[];
  today: string;
}) {
  const map = valueMap(entries, metric.id);
  const todayValue = map.get(today) ?? null;
  const sparkValues = seriesFor(map, lastNDates(today, 7));
  const baseline = loggedValues(map, lastNDates(addDays(today, -1), 7));
  const delta = deltaVsBaseline(todayValue, baseline, metric.goalDirection);
  const progress = progressPct(todayValue, metric.goal, metric.goalDirection);
  const suffix = unitSuffix(metric.unit);

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
          {todayValue === null ? (
            <span className="font-display text-[34px] leading-none text-[color:var(--faint)]">—</span>
          ) : (
            <>
              <span className="font-display text-[34px] leading-none">
                {formatValue(todayValue, metric.unit)}
              </span>
              {suffix && <span className="text-[14px] text-[color:var(--muted)]">{suffix}</span>}
            </>
          )}
        </div>
        <Sparkline values={sparkValues} />
      </div>

      <div className="mt-3 text-[12px] text-[color:var(--muted)]">
        {formatGoal(metric.goal, metric.unit, metric.goalDirection)}
      </div>
      <div
        className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
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
