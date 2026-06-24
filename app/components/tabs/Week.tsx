// Week tab — weekly scorecard (score, headline, 2-col per-metric grid with
// delta pills vs the previous 7 days) and a 7-bar chart per active metric
// with a dashed goal line.

import type { Entry, Metric } from '@/lib/types';
import { addDays, dayLabel, lastNDates } from '@/lib/dates';
import { deltaVsBaseline } from '@/lib/deltas';
import { avg, loggedValues, valueMap, weeklyScore } from '../data';
import { formatValue, unitSuffix } from '../format';
import DeltaPill from '../DeltaPill';
import BarChart, { type BarDatum } from '../BarChart';

export default function Week({
  metrics,
  entries,
  today,
}: {
  metrics: Metric[];
  entries: Entry[];
  today: string;
}) {
  const active = metrics.filter((m) => m.active);
  const score = weeklyScore(metrics, entries, today);
  const headline =
    score >= 75
      ? 'Strong week.'
      : score >= 50
        ? 'Solid week — one or two metrics lagging.'
        : 'Rebuild week — pick one metric to win.';

  const weekDates = lastNDates(today, 7);
  const prevDates = lastNDates(addDays(today, -7), 7);

  return (
    <div className="space-y-3">
      <section className="card p-4">
        <div className="eyebrow">Weekly scorecard</div>
        <div className="mt-2 font-display text-[44px] leading-none" style={{ color: 'var(--gold)' }}>
          {score}
          <span className="text-[22px]">%</span>
        </div>
        <h2 className="font-display mt-2 text-[19px] leading-snug">{headline}</h2>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {active.map((m) => {
            const map = valueMap(entries, m.id);
            const thisAvg = avg(loggedValues(map, weekDates));
            const prevVals = loggedValues(map, prevDates);
            const delta = deltaVsBaseline(thisAvg, prevVals, m.goalDirection);
            const suffix = unitSuffix(m.unit);
            return (
              <div
                key={m.id}
                className="rounded-xl p-3"
                style={{ background: 'var(--card-inset)', border: '1px solid var(--hairline)' }}
              >
                <div className="eyebrow truncate">
                  {m.emoji} {m.name}
                </div>
                <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <span className="min-w-0">
                    {thisAvg === null ? (
                      <span className="font-display text-[20px] text-[color:var(--faint)]">—</span>
                    ) : (
                      <>
                        <span className="font-display text-[20px]">
                          {formatValue(thisAvg, m.unit)}
                        </span>
                        {suffix && (
                          <span className="ml-0.5 text-[11px] text-[color:var(--muted)]">
                            {suffix}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  <DeltaPill delta={delta} />
                </div>
              </div>
            );
          })}
        </div>
        {active.length === 0 && (
          <p className="mt-3 text-[13px] text-[color:var(--muted)]">
            No active metrics — turn some on in the ⚙ Track tab.
          </p>
        )}
      </section>

      {active.map((m) => {
        const map = valueMap(entries, m.id);
        const data: BarDatum[] = weekDates.map((d) => ({
          date: d,
          label: dayLabel(d),
          value: map.get(d) ?? null,
        }));

        // "Best" day is goal-direction aware: highest for ≥, lowest for ≤.
        let best: { date: string; value: number } | null = null;
        for (const d of weekDates) {
          const v = map.get(d);
          if (v === undefined) continue;
          if (!best || (m.goalDirection === '>=' ? v > best.value : v < best.value)) {
            best = { date: d, value: v };
          }
        }

        return (
          <section key={m.id} className="card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="eyebrow truncate">
                {m.emoji} {m.name}
              </span>
              {best && (
                <span className="shrink-0 text-[12px] text-[color:var(--muted)]">
                  Best:{' '}
                  <span style={{ color: 'var(--gold)' }}>
                    {formatValue(best.value, m.unit)}
                    {unitSuffix(m.unit)}
                  </span>{' '}
                  on {dayLabel(best.date)}
                </span>
              )}
            </div>
            <BarChart
              data={data}
              goal={m.goal}
              unit={m.unit}
              label={`${m.name}, last 7 days vs goal`}
            />
          </section>
        );
      })}
    </div>
  );
}
