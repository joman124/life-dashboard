// InsightSummary — the written read on the Trends tab. Bullets come from
// lib/insights.ts; this component only renders them.

import type { Entry, Metric } from '@/lib/types';
import { summarize } from '@/lib/insights';

const TONE_COLOR = {
  good: 'var(--green)',
  bad: 'var(--red)',
} as const;

export default function InsightSummary({
  metrics,
  entries,
  today,
}: {
  metrics: Metric[];
  entries: Entry[];
  today: string;
}) {
  const insights = summarize(metrics, entries, today);

  return (
    <section className="card card-gold p-4">
      <span className="eyebrow">What the last 30 days say</span>

      {insights.length === 0 ? (
        <p className="mt-2 text-[13px] text-[color:var(--muted)]">
          Not enough logged days yet. Keep logging and the read appears here.
        </p>
      ) : (
        <ul className="mt-2.5 space-y-2.5">
          {insights.map((insight) => (
            <li key={insight.kind} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background: insight.tone ? TONE_COLOR[insight.tone] : 'var(--gold)',
                }}
              />
              <span className="text-[13px] leading-relaxed">{insight.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
