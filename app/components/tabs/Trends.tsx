'use client';

// Trends tab — the written read first ("What actually moves what": the week's
// verdict, its evidence, what to push on next, and the correlation table), then
// one chart per active metric with a brief per-metric summary under it.
//
// The order is deliberate: the block that tells you what to DO sits above the
// charts you would otherwise have to interpret yourself.
//
// A range selector drives everything on the tab at once — charts, correlations
// and the per-metric summaries all read the same window.

import { useState } from 'react';
import type { Entry, Metric } from '@/lib/types';
import { daysBetween, lastNDates } from '@/lib/dates';
import { metricSummary } from '@/lib/insights';
import { valueMap } from '../data';
import LineChart from '../LineChart';
import WhatMovesWhat from '../WhatMovesWhat';

interface Range {
  key: string;
  label: string;
  /** null means "all time" — resolved from the earliest logged entry. */
  days: number | null;
}

const RANGES: Range[] = [
  { key: '30', label: '30d', days: 30 },
  { key: '60', label: '60d', days: 60 },
  { key: '90', label: '90d', days: 90 },
  { key: '180', label: '6mo', days: 180 },
  { key: '365', label: '12mo', days: 365 },
  { key: 'all', label: 'All', days: null },
];

/** Longest window we will ever ask for, matching the entries API ceiling. */
const MAX_DAYS = 3650;

/**
 * Days covered by "all time": from the earliest logged entry through today.
 * Falls back to 30 when nothing is logged, so an empty dashboard still renders
 * a sensible axis instead of a decade of blank.
 */
function allTimeDays(entries: Entry[], today: string): number {
  if (entries.length === 0) return 30;
  let earliest = entries[0].date;
  for (const e of entries) if (e.date < earliest) earliest = e.date;
  const span = daysBetween(earliest, today) + 1;
  return Math.min(MAX_DAYS, Math.max(30, span));
}

export default function Trends({
  metrics,
  entries,
  today,
}: {
  metrics: Metric[];
  entries: Entry[];
  today: string;
}) {
  const [rangeKey, setRangeKey] = useState('30');

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[0];
  const days = range.days ?? allTimeDays(entries, today);
  const rangeLabel = range.days === null ? `all time · ${days} days` : `last ${days} days`;

  const active = metrics.filter((m) => m.active);
  const dates = lastNDates(today, days);

  return (
    <div className="space-y-3">
      {/* Range selector — drives every card on this tab. */}
      <div
        role="group"
        aria-label="Time range"
        className="flex overflow-hidden rounded-xl border"
        style={{ borderColor: 'var(--hairline)' }}
      >
        {RANGES.map((r) => {
          const isActive = r.key === range.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => setRangeKey(r.key)}
              aria-pressed={isActive}
              className="min-h-11 flex-1 text-[12px] font-medium"
              style={{
                background: isActive ? 'var(--card-inset)' : 'transparent',
                color: isActive ? 'var(--gold)' : 'var(--muted)',
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      <WhatMovesWhat
        metrics={metrics}
        entries={entries}
        today={today}
        days={days}
        rangeLabel={rangeLabel}
      />

      {active.map((m) => {
        const map = valueMap(entries, m.id);
        const points = dates.map((d) => ({ date: d, value: map.get(d) ?? null }));
        const summary = metricSummary(m, entries, today, days);
        return (
          <section key={m.id} className="card p-4">
            <span className="eyebrow">
              {m.emoji} {m.name} · {rangeLabel}
            </span>
            <LineChart
              points={points}
              unit={m.unit}
              label={`${m.name}, ${rangeLabel}`}
              emptyLabel={`No ${m.name.toLowerCase()} logged in this range`}
            />
            {summary.text && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-[color:var(--muted)]">
                {summary.text}
              </p>
            )}
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
    </div>
  );
}
