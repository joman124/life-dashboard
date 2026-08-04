'use client';

// QuickLogForm — type every metric for one day and save them in one go.
//
// The steppers are good for nudging 0.5h of deep work; they are miserable for
// entering 9,336 steps or 42 minutes of screen time. This is the same data,
// entered the way a form should take it.
//
// Fields arrive PRE-FILLED with whatever that day already holds — a Shortcut
// import, a Google Calendar sync, or an earlier manual entry — so the form is a
// correction pass over what synced, not a blank slate you retype every night.
//
// Remounted per date by a key in the parent, which is what keeps the inputs in
// step with the day strip without an effect that mirrors props into state.

import { useMemo, useState } from 'react';
import type { Entry, Metric } from '@/lib/types';
import { unitSuffix } from './format';

export interface PendingEntry {
  metricId: string;
  value: number;
}

/** Text shown under a field explaining where its pre-filled number came from. */
function sourceHint(logged: boolean): string {
  return logged ? 'already logged' : 'not logged yet';
}

export default function QuickLogForm({
  metrics,
  entries,
  date,
  onSaveAll,
}: {
  metrics: Metric[];
  entries: Entry[];
  date: string;
  onSaveAll: (date: string, values: PendingEntry[]) => Promise<string | null>;
}) {
  // Pre-fill from whatever this day already has. Computed once per mount, and
  // the parent remounts on date change.
  const initial = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of metrics) {
      const entry = entries.find((e) => e.metricId === m.id && e.date === date);
      out[m.id] = entry === undefined ? '' : String(entry.value);
    }
    return out;
  }, [metrics, entries, date]);

  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);

    const pending: PendingEntry[] = [];
    for (const m of metrics) {
      const raw = (draft[m.id] ?? '').trim();
      if (raw === '') continue; // blank means "leave this day alone"

      const value = Number(raw);
      if (!Number.isFinite(value)) {
        setError(`${m.name}: "${raw}" is not a number.`);
        return;
      }
      if (value < 0) {
        setError(`${m.name} cannot be negative.`);
        return;
      }
      if (value > m.max) {
        setError(`${m.name} cannot be above ${m.max}${unitSuffix(m.unit)}.`);
        return;
      }
      // Unchanged fields are not rewritten — no pointless round trip.
      if (raw === initial[m.id]) continue;
      pending.push({ metricId: m.id, value });
    }

    if (pending.length === 0) {
      setError('Nothing changed.');
      return;
    }

    setBusy(true);
    const failure = await onSaveAll(date, pending);
    setBusy(false);
    if (failure) setError(failure);
    else setSaved(pending.length);
  }

  return (
    <form onSubmit={submit} className="mt-1">
      {metrics.map((m, i) => {
        const logged = initial[m.id] !== '';
        const suffix = unitSuffix(m.unit);
        return (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 py-2.5"
            style={i > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
          >
            <label htmlFor={`qf-${m.id}`} className="flex min-w-0 items-center gap-2.5">
              <span className="text-[18px]" aria-hidden="true">
                {m.emoji}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px]">{m.name}</span>
                <span className="block text-[10.5px]" style={{ color: 'var(--faint)' }}>
                  {sourceHint(logged)}
                </span>
              </span>
            </label>

            <div className="flex shrink-0 items-center gap-1.5">
              <input
                id={`qf-${m.id}`}
                // Not type="number": on iOS it pairs a spinner with a keypad that
                // hides the minus/decimal keys inconsistently. inputMode gives
                // the numeric keypad without the baggage.
                type="text"
                inputMode="decimal"
                enterKeyHint="done"
                value={draft[m.id] ?? ''}
                onChange={(ev) => setDraft((d) => ({ ...d, [m.id]: ev.target.value }))}
                placeholder="—"
                aria-label={`${m.name} for this day`}
                className="input !w-[86px] text-right"
              />
              {suffix && (
                <span className="w-[22px] text-[11px] text-[color:var(--muted)]">{suffix}</span>
              )}
            </div>
          </div>
        );
      })}

      <button
        type="submit"
        disabled={busy}
        className="mt-3 min-h-11 w-full rounded-xl py-2.5 text-[14px] font-semibold disabled:opacity-50"
        style={{ background: 'var(--gold)', color: '#171107' }}
      >
        {busy ? 'Saving…' : 'Save all'}
      </button>

      {error && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--red)' }} role="alert">
          {error}
        </p>
      )}
      {saved !== null && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--gold)' }} role="status">
          Saved {saved} {saved === 1 ? 'metric' : 'metrics'}.
        </p>
      )}

      <p className="mt-2 text-[11px]" style={{ color: 'var(--faint)' }}>
        Leave a field blank to leave that day untouched.
      </p>
    </form>
  );
}
