// WhatMovesWhat — the block that heads the Trends tab.
//
// It sits ABOVE the per-metric charts on purpose: the charts show you shapes,
// this says what the shapes mean. Three layers, narrowest claim to widest:
//   1. the week's verdict + score,
//   2. the evidence behind it, and what to do next week,
//   3. the correlation table the card is named for.
//
// Every sentence is derived arithmetic over the user's own entries (lib/insights
// and lib/correlations) — same data in, same words out, no model in the loop.

import type { Entry, Metric } from '@/lib/types';
import { topCorrelations } from '@/lib/correlations';
import { weekReview } from '@/lib/insights';

const TONE_COLOR = {
  good: 'var(--green)',
  bad: 'var(--red)',
} as const;

export default function WhatMovesWhat({
  metrics,
  entries,
  today,
  days,
  rangeLabel,
}: {
  metrics: Metric[];
  entries: Entry[];
  today: string;
  days: number;
  rangeLabel: string;
}) {
  const active = metrics.filter((m) => m.active);
  const review = weekReview(metrics, entries, today);
  const pairs = topCorrelations(
    entries,
    active.map((m) => m.id),
    { today, days },
  );
  const byId = new Map(metrics.map((m) => [m.id, m]));

  return (
    <section className="card card-gold p-4">
      <h2 className="font-display text-[20px]">What actually moves what</h2>

      {/* ---------------------------------------------- this week's verdict */}
      <div className="mt-3 flex items-center gap-3">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border"
          style={{ borderColor: 'var(--gold-dim)' }}
          title="Percent of active metrics whose 7-day average meets goal"
        >
          <span className="font-display text-[17px]" style={{ color: 'var(--gold)' }}>
            {review.hasData ? review.score : '–'}
          </span>
        </div>
        <div className="min-w-0">
          <div className="eyebrow">Your week</div>
          <p className="mt-0.5 text-[14px]">{review.headline}</p>
        </div>
      </div>

      {/* ------------------------------------------------------- the support */}
      {review.support.length > 0 && (
        <ul className="mt-3.5 space-y-2.5">
          {review.support.map((insight) => (
            <li key={insight.kind} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: insight.tone ? TONE_COLOR[insight.tone] : 'var(--gold)' }}
              />
              <span className="text-[13px] leading-relaxed">{insight.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* --------------------------------------------------- what to do next */}
      {review.recommendations.length > 0 && (
        <div
          className="mt-4 rounded-xl p-3"
          style={{ background: 'var(--card-inset)', border: '1px solid var(--hairline)' }}
        >
          <div className="eyebrow">Where to push next</div>
          <ol className="mt-2 space-y-2.5">
            {review.recommendations.map((rec, i) => {
              const m = rec.metricId ? byId.get(rec.metricId) : undefined;
              return (
                <li key={`${rec.metricId ?? 'general'}-${i}`} className="flex gap-2.5">
                  <span
                    className="mt-px shrink-0 text-[14px] leading-snug"
                    aria-hidden="true"
                    style={{ color: 'var(--gold)' }}
                  >
                    {m ? m.emoji : `${i + 1}.`}
                  </span>
                  <span className="text-[13px] leading-relaxed">{rec.text}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {!review.hasData && review.recommendations.length === 0 && (
        <p className="mt-3 text-[13px] text-[color:var(--muted)]">
          Log a few days and the weekly read, the evidence behind it, and what to push on next all
          appear here.
        </p>
      )}

      {/* ------------------------------------------------------ correlations */}
      <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
        <div className="eyebrow">Strongest pairs · {rangeLabel}</div>
        {pairs.length === 0 ? (
          <p className="mt-2 text-[13px] text-[color:var(--muted)]">
            Not enough overlapping data yet — two metrics need 8 shared logged days before a
            correlation means anything.
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
                    {p.strength} {p.positive ? 'positive' : 'negative'} · r = {absR.toFixed(2)} ·{' '}
                    {p.n} shared days
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
      </div>
    </section>
  );
}
