import type { CorrelationResult } from '@/lib/correlations';
import type { Metric } from '@/lib/types';
export default function InsightCard({
  pair,
  metrics,
}: {
  pair: CorrelationResult;
  metrics: Metric[];
}) {
  const a = metrics.find((m) => m.id === pair.aId);
  const b = metrics.find((m) => m.id === pair.bId);
  if (!a || !b) return null;
  return (
    <section className="card p-6">
      <div className="eyebrow">A pattern to explore</div>
      <h2 className="font-display mt-3 text-[23px]">
        {a.emoji} {a.name} <span className="text-[color:var(--gold-dim)]">↔</span> {b.emoji}{' '}
        {b.name}
      </h2>
      <p className="mt-3 text-[13px] leading-relaxed text-[color:var(--muted)]">
        Days with higher {a.name.toLowerCase()} tend to show {pair.positive ? 'higher' : 'lower'}{' '}
        {b.name.toLowerCase()}. This is an association, not evidence that one causes the other.
      </p>
      <p className="mt-4 text-[11px] text-[color:var(--gold)]">
        r = {pair.r.toFixed(2)} · {pair.n} shared days · last 30 days
      </p>
      <p className="fine-print mt-2">
        Rough 95% range: {pair.interval[0].toFixed(2)} to {pair.interval[1].toFixed(2)}.
        Exploratory; repeated daily habits and testing many pairs can exaggerate patterns.
      </p>
    </section>
  );
}
