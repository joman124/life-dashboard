'use client';

// LogEntries — one stepper row per active metric, for a chosen day.
//
// A compact day strip above the steppers selects which date is being logged,
// defaulting to today. This exists because the common failure mode of a daily
// tracker is forgetting to open it: without backdating, yesterday is lost for
// good and every streak and correlation is computed from a hole in the data.
//
// − / + adjust by metric.step, clamped to 0..max, and upsert immediately
// (optimistic, then refresh). Unlogged metrics display 0; a no-op − tap on an
// unlogged metric does not log a phantom 0.

import { useState } from 'react';
import type { Entry, Metric } from '@/lib/types';
import { addDays, dayLabel, formatDateLong, lastNDates } from '@/lib/dates';
import { formatValue, unitSuffix } from './format';

/** How many days back the strip lets you reach, including today. */
const DAY_WINDOW = 7;

export default function LogEntries({
  metrics,
  entries,
  today,
  onLog,
}: {
  metrics: Metric[];
  entries: Entry[];
  today: string;
  onLog: (metricId: string, value: number, date: string) => void;
}) {
  const [date, setDate] = useState(today);

  // Guard against the day rolling over while the tab is open: if `today` moves
  // past the selected date's window, fall back to today rather than stranding
  // the user on a date the strip no longer shows.
  const days = lastNDates(today, DAY_WINDOW);
  const selected = days.includes(date) ? date : today;
  const isToday = selected === today;

  function bump(m: Metric, cur: number, logged: boolean, sign: 1 | -1) {
    const next = Math.round(Math.min(m.max, Math.max(0, cur + sign * m.step)) * 100) / 100;
    if (next === cur && logged) return; // already at a bound — nothing to save
    if (next === cur && !logged) return; // don't phantom-log a 0 on −
    onLog(m.id, next, selected);
  }

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="eyebrow">{isToday ? 'Log today' : 'Log'}</div>
        {!isToday && (
          <button
            type="button"
            onClick={() => setDate(today)}
            className="text-[11px] underline underline-offset-2"
            style={{ color: 'var(--gold)' }}
          >
            Back to today
          </button>
        )}
      </div>

      {/* Day strip — oldest on the left, today on the right. */}
      <div
        role="group"
        aria-label="Choose the day to log"
        className="mt-2.5 flex items-stretch gap-1"
      >
        {days.map((d) => {
          const active = d === selected;
          const anyLogged = entries.some((e) => e.date === d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              aria-pressed={active}
              aria-label={formatDateLong(d)}
              className="flex flex-1 flex-col items-center gap-0.5 rounded-lg border py-1.5 active:scale-95"
              style={{
                borderColor: active ? 'var(--gold-dim)' : 'var(--hairline)',
                background: active ? 'var(--card-inset)' : 'transparent',
                color: active ? 'var(--gold)' : 'var(--muted)',
              }}
            >
              <span className="text-[9.5px] uppercase tracking-[0.08em]">
                {dayLabel(d).slice(0, 2)}
              </span>
              <span className="font-display text-[13px] leading-none">{Number(d.slice(8, 10))}</span>
              {/* A dot marks days that already have at least one entry, so gaps
                  in the last week are visible at a glance. */}
              <span
                aria-hidden="true"
                className="h-[3px] w-[3px] rounded-full"
                style={{ background: anyLogged ? 'var(--gold)' : 'transparent' }}
              />
            </button>
          );
        })}
      </div>

      {!isToday && (
        <p className="mt-2 text-[11.5px]" style={{ color: 'var(--faint)' }}>
          Editing {formatDateLong(selected)}
          {selected === addDays(today, -1) ? ' (yesterday)' : ''}.
        </p>
      )}

      <div className="mt-1">
        {metrics.map((m, i) => {
          const entry = entries.find((e) => e.metricId === m.id && e.date === selected);
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
