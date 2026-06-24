// InsightCard — gold-tinted-border card on Today. Auto-generated from the
// strongest |r| pair over the last 30 days (≥ 8 paired days). Hidden by the
// caller when no pair qualifies.

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
    <section className="card card-gold p-4">
      <div className="eyebrow">Insight</div>
      <p className="mt-2 text-[14px] leading-relaxed">
        On days when your {a.emoji} {a.name} is higher, your {b.emoji} {b.name} tends to be{' '}
        {pair.positive ? 'higher' : 'lower'} too — a pattern to test with intention, not a causal
        claim.
      </p>
    </section>
  );
}
