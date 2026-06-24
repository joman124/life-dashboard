// Trends tab — 30-day line chart per active metric, then the correlations
// card: "What actually moves what" (top 3 pairs by |r|, ≥ 8 shared days).

import type { Entry, Metric } from '@/lib/types';
import { lastNDates } from '@/lib/dates';
import { topCorrelations } from '@/lib/correlations';
import { seriesFor, valueMap } from '../data';
import LineChart from '../LineChart';

export default function Trends({
  metrics,
  entries,
  today,
}: {
  metrics: Metric[];
  entries: Entry[];
  today: string;
}) {
  const active = metrics.filter((m) => m.active);
  const dates30 = lastNDates(today, 30);
  const pairs = topCorrelations(
    entries,
    active.map((m) => m.id),
    { today },
  );
  const byId = new Map(metrics.map((m) => [m.id, m]));

  return (
    <div className="space-y-3">
      {active.map((m) => {
        const map = valueMap(entries, m.id);
        const points = dates30.map((d) => ({ date: d, value: map.get(d) ?? null }));
        return (
          <section key={m.id} className="card p-4">
            <span className="eyebrow">
              {m.emoji} {m.name} · 30 days
            </span>
            <LineChart points={points} unit={m.unit} label={`${m.name}, last 30 days`} />
          </section>
        );
      })}
      {active.length === 0 && (
        <section className="card p-4">
          <p className="text-[13px] text-[color:var(--muted)]">
            No active metrics — turn some on in the ⚙ Track tab.
          </p>
        </section>
      )}

      <section className="card p-4">
        <h2 className="font-display text-[20px]">What actually moves what</h2>
        {pairs.length === 0 ? (
          <p className="mt-2 text-[13px] text-[color:var(--muted)]">
            Not enough overlapping data yet — log at least 8 days of two metrics.
          </p>
        ) : (
          <div className="mt-1">
            {pairs.map((p, i) => {
              const a = byId.get(p.aId);
              const b = byId.get(p.bId);
              if (!a || !b) return null;
              const absR = Math.abs(p.r);
              return (
                <div
                  key={`${p.aId}-${p.bId}`}
                  className="py-3"
                  style={i > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
                >
                  <div className="truncate text-[14px]">
                    {a.emoji} {a.name} <span className="text-[color:var(--faint)]">→</span> {b.emoji}{' '}
                    {b.name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[color:var(--muted)]">
                    {p.strength} {p.positive ? 'positive' : 'negative'} · r = {absR.toFixed(2)}
                  </div>
                  <div
                    className="relative mt-2 h-1.5 w-full rounded-full"
                    style={{ background: 'var(--hairline)' }}
                    aria-hidden="true"
                  >
                    <span
                      className="absolute top-1/2 h-[9px] w-px -translate-y-1/2"
                      style={{ left: '50%', background: 'var(--faint)' }}
                    />
                    <span
                      className="absolute top-0 h-full rounded-full"
                      style={{
                        width: `${absR * 50}%`,
                        left: p.positive ? '50%' : `${50 - absR * 50}%`,
                        background: p.positive ? 'var(--green)' : 'var(--red)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[11px] text-[color:var(--faint)]">
          Correlation ≠ causation. These are patterns in your own data.
        </p>
      </section>
    </div>
  );
}
