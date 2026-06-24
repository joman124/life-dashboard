// LogToday — one stepper row per active metric. − / + adjust by metric.step,
// clamped to 0..max, and POST an upsert immediately (optimistic, then
// refresh). Unlogged metrics display 0; a no-op − tap on an unlogged metric
// does not log a phantom 0.

import type { Entry, Metric } from '@/lib/types';
import { formatValue, unitSuffix } from './format';

export default function LogToday({
  metrics,
  entries,
  today,
  onLog,
}: {
  metrics: Metric[];
  entries: Entry[];
  today: string;
  onLog: (metricId: string, value: number) => void;
}) {
  function bump(m: Metric, cur: number, logged: boolean, sign: 1 | -1) {
    const next = Math.round(Math.min(m.max, Math.max(0, cur + sign * m.step)) * 100) / 100;
    if (next === cur && logged) return; // already at a bound — nothing to save
    if (next === cur && !logged) return; // don't phantom-log a 0 on −
    onLog(m.id, next);
  }

  return (
    <section className="card p-4">
      <div className="eyebrow">Log today</div>
      <div className="mt-1">
        {metrics.map((m, i) => {
          const entry = entries.find((e) => e.metricId === m.id && e.date === today);
          const logged = entry !== undefined;
          const cur = entry?.value ?? 0;
          const suffix = unitSuffix(m.unit);
          return (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 py-3"
              style={i > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="text-[18px]" aria-hidden="true">
                  {m.emoji}
                </span>
                <span className="truncate text-[14px]">{m.name}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => bump(m, cur, logged, -1)}
                  aria-label={`Decrease ${m.name}`}
                  className="grid h-8 w-8 place-items-center rounded-full border text-[16px] leading-none active:scale-95"
                  style={{
                    borderColor: 'var(--hairline)',
                    background: 'var(--card-inset)',
                    color: 'var(--muted)',
                  }}
                >
                  −
                </button>
                <div className="w-[74px] text-center">
                  <span
                    className="font-display text-[18px]"
                    style={logged ? undefined : { color: 'var(--faint)' }}
                  >
                    {formatValue(cur, m.unit)}
                  </span>
                  {suffix && (
                    <span className="ml-0.5 text-[11px] text-[color:var(--muted)]">{suffix}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => bump(m, cur, logged, 1)}
                  aria-label={`Increase ${m.name}`}
                  className="grid h-8 w-8 place-items-center rounded-full border text-[16px] leading-none active:scale-95"
                  style={{
                    borderColor: 'var(--hairline)',
                    background: 'var(--card-inset)',
                    color: 'var(--gold)',
                  }}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
        {metrics.length === 0 && (
          <p className="py-3 text-[13px] text-[color:var(--muted)]">
            No active metrics — turn some on in the ⚙ Track tab.
          </p>
        )}
      </div>
    </section>
  );
}
