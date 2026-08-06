'use client';

// Today tab — one editable box per active metric, the auto-insight card, and
// the calendar + email brief.
//
// The read-only focus cards and the separate "Log today" stepper card used to
// be two blocks saying the same thing twice; they are now one. What is left of
// the old log card is LogDayBar: which day you are editing, and whether you are
// nudging with steppers or typing into a form.

import { useState } from 'react';
import type { Entry, Metric, TimelineItem } from '@/lib/types';
import { lastNDates } from '@/lib/dates';
import { topCorrelations } from '@/lib/correlations';
import MetricCard from '../MetricCard';
import InsightCard from '../InsightCard';
import LogDayBar, { type LogMode } from '../LogDayBar';
import QuickLogForm, { type PendingEntry } from '../QuickLogForm';
import DayBrief from '../DayBrief';

/** How many days back the strip lets you reach, including today. */
const DAY_WINDOW = 7;

export default function Today({
  metrics,
  entries,
  timeline,
  today,
  lastGoogleSync,
  inboxCount,
  onLog,
  onSaveAll,
  refresh,
}: {
  metrics: Metric[];
  entries: Entry[];
  timeline: TimelineItem[];
  today: string;
  lastGoogleSync: string | null;
  inboxCount: number | null;
  onLog: (metricId: string, value: number, date: string) => void;
  onSaveAll: (date: string, values: PendingEntry[]) => Promise<string | null>;
  refresh: () => Promise<void>;
}) {
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<LogMode>('steppers');

  const active = metrics.filter((m) => m.active);

  // Guard against the day rolling over while the tab is open: if `today` moves
  // past the selected date's window, fall back to today rather than stranding
  // the user on a date the strip no longer shows.
  const days = lastNDates(today, DAY_WINDOW);
  const selected = days.includes(date) ? date : today;

  const insight = topCorrelations(
    entries,
    active.map((m) => m.id),
    { top: 1, today },
  )[0];

  return (
    <div className="space-y-3">
      <LogDayBar
        days={days}
        selected={selected}
        today={today}
        entries={entries}
        mode={mode}
        onSelect={setDate}
        onMode={setMode}
      />

      {mode === 'form' && active.length > 0 && (
        <section className="card p-4">
          <div className="eyebrow">Type the day&apos;s numbers</div>
          {/* Keyed by date so switching days remounts the form with that day's
              values, instead of stranding the previous day's numbers. */}
          <QuickLogForm
            key={selected}
            metrics={active}
            entries={entries}
            date={selected}
            onSaveAll={onSaveAll}
          />
        </section>
      )}

      {active.map((m) => (
        <MetricCard
          key={m.id}
          metric={m}
          entries={entries}
          date={selected}
          // In form mode the numbers are typed above, so the cards drop their
          // steppers rather than offering two controls for the same value.
          onLog={mode === 'steppers' ? onLog : undefined}
        />
      ))}

      {active.length === 0 && (
        <section className="card p-4">
          <p className="text-[13px] text-[color:var(--muted)]">
            No active metrics — turn some on in the ⚙ Track tab.
          </p>
        </section>
      )}

      {insight && <InsightCard pair={insight} metrics={metrics} />}

      <DayBrief
        items={timeline}
        lastGoogleSync={lastGoogleSync}
        inboxCount={inboxCount}
        refresh={refresh}
      />
    </div>
  );
}
