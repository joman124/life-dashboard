'use client';

// LogDayBar — chooses WHICH day the Today tab is editing, and HOW.
//
// The steppers themselves now live on each MetricCard, so this is what is left
// of the old "Log today" card: the day strip and the entry-style switch.
//
// The day strip exists because the common failure mode of a daily tracker is
// forgetting to open it: without backdating, yesterday is lost for good and
// every streak and correlation is computed from a hole in the data.

import type { Entry } from '@/lib/types';
import { addDays, dayLabel, formatDateLong } from '@/lib/dates';

/** Steppers suit small nudges; the form suits typing 9,336. Both write the same rows. */
export type LogMode = 'steppers' | 'form';

export default function LogDayBar({
  days,
  selected,
  today,
  entries,
  mode,
  onSelect,
  onMode,
}: {
  /** The selectable dates, oldest first. */
  days: string[];
  selected: string;
  today: string;
  entries: Entry[];
  mode: LogMode;
  onSelect: (date: string) => void;
  onMode: (mode: LogMode) => void;
}) {
  const isToday = selected === today;

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="eyebrow">{isToday ? 'Log today' : 'Log'}</div>
        <div className="flex items-center gap-2.5">
          {!isToday && (
            <button
              type="button"
              onClick={() => onSelect(today)}
              className="text-[11px] underline underline-offset-2"
              style={{ color: 'var(--gold)' }}
            >
              Back to today
            </button>
          )}
          <div
            role="group"
            aria-label="Entry style"
            className="flex overflow-hidden rounded-lg border"
            style={{ borderColor: 'var(--hairline)' }}
          >
            {(['steppers', 'form'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onMode(m)}
                aria-pressed={mode === m}
                className="px-2.5 py-1.5 text-[11px]"
                style={{
                  background: mode === m ? 'var(--card-inset)' : 'transparent',
                  color: mode === m ? 'var(--gold)' : 'var(--muted)',
                }}
              >
                {m === 'steppers' ? 'Steppers' : 'Form'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Day strip — oldest on the left, today on the right. */}
      <div
        role="group"
        aria-label="Choose the day to log"
        className="mt-2.5 flex items-stretch gap-0.5"
      >
        {days.map((d) => {
          const active = d === selected;
          const anyLogged = entries.some((e) => e.date === d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              aria-pressed={active}
              aria-label={formatDateLong(d)}
              className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border py-1.5 active:scale-95"
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
    </section>
  );
}
