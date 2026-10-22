'use client';

import { useEffect, useRef, useState } from 'react';
import type { Entry, Metric } from '@/lib/types';
import { formatGoal, unitSuffix } from './format';
import { parseMetricInput } from '@/lib/metricInput';
import Icon from './Icon';

export interface PendingEntry {
  metricId: string;
  value: number;
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
  // Only edited fields are drafts. Untouched fields always reflect fresh imports.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const storageKey = `life-check-in:${date}`;
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        setDraft(
          Object.fromEntries(Object.entries(stored).filter(([, v]) => typeof v === 'string')),
        );
      }
    } catch {
      setStorageUnavailable(true);
    }
    setReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    try {
      if (Object.keys(draft).length) localStorage.setItem(storageKey, JSON.stringify(draft));
      else localStorage.removeItem(storageKey);
    } catch {
      setStorageUnavailable(true);
    }
  }, [draft, ready, storageKey]);

  const current = (id: string) => entries.find((e) => e.metricId === id && e.date === date)?.value;
  const rawFor = (id: string) =>
    draft[id] ?? (current(id) === undefined ? '' : String(current(id)));
  const dirty = metrics.filter(
    (m) =>
      draft[m.id] !== undefined &&
      draft[m.id].trim() !== '' &&
      parseMetricInput(draft[m.id], m).value !== current(m.id),
  );
  const logged = metrics.filter((m) => current(m.id) !== undefined).length;
  function change(id: string, raw: string) {
    setDraft((d) => ({ ...d, [id]: raw }));
    setMessage(null);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    const pending: PendingEntry[] = [];
    for (const m of dirty) {
      const result = parseMetricInput(draft[m.id], m);
      if (result.error || result.value === null) {
        setMessage({ error: true, text: result.error ?? `Enter a value for ${m.name}.` });
        inputs.current[metrics.indexOf(m)]?.focus();
        return;
      }
      pending.push({ metricId: m.id, value: result.value });
    }
    if (!pending.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const failure = await onSaveAll(date, pending);
      if (failure)
        setMessage({ error: true, text: `${failure} Your draft is kept; tap Save to retry.` });
      else {
        setDraft({});
        setMessage({
          error: false,
          text: `${pending.length} ${pending.length === 1 ? 'metric' : 'metrics'} saved. You're all set.`,
        });
      }
    } catch {
      setMessage({ error: true, text: 'Could not save. Your draft is kept; tap Save to retry.' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} aria-label="Daily check-in" className="check-in-form">
      <div className="check-in-heading">
        <div>
          <div className="eyebrow">Make a little space for yourself</div>
          <h2 className="font-display">Your daily check-in.</h2>
        </div>
        <span className="completion-count">
          {logged}
          <span> / {metrics.length}</span>
        </span>
      </div>
      <div
        className="completion-track"
        aria-label={`${logged} of ${metrics.length} metrics logged`}
      >
        <span style={{ width: `${metrics.length ? (logged / metrics.length) * 100 : 0}%` }} />
      </div>
      <fieldset disabled={busy || !ready}>
        {metrics.map((m, i) => {
          const value = current(m.id);
          const raw = rawFor(m.id);
          const last = entries
            .filter((e) => e.metricId === m.id && e.date < date)
            .sort((a, b) => b.date.localeCompare(a.date))[0];
          const edited = dirty.some((d) => d.id === m.id);
          return (
            <div className={`entry-row ${edited ? 'is-edited' : ''}`} key={m.id}>
              <div className="entry-label">
                <span className="metric-emoji" aria-hidden="true">
                  {m.emoji}
                </span>
                <label htmlFor={`qf-${m.id}`}>
                  <span className="entry-name">{m.name}</span>
                  <span className="entry-goal">
                    {formatGoal(m.goal, m.unit, m.goalDirection)}
                    {m.weeklyTarget !== null ? ` · ${m.weeklyTarget}d / week` : ' / day'}
                  </span>
                </label>
                <span className="entry-status">
                  {edited ? 'Unsaved' : value !== undefined ? <Icon name="check" size={16} /> : ''}
                </span>
              </div>
              <div className="entry-controls">
                <button
                  type="button"
                  className="step-button"
                  aria-label={`Decrease ${m.name}`}
                  onClick={() => {
                    const v = parseMetricInput(raw, m).value ?? 0;
                    change(m.id, String(Math.max(0, Math.round((v - m.step) * 100) / 100)));
                  }}
                >
                  −
                </button>
                <div className="entry-input-wrap">
                  <input
                    ref={(el) => {
                      inputs.current[i] = el;
                    }}
                    id={`qf-${m.id}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint={i < metrics.length - 1 ? 'next' : 'done'}
                    value={raw}
                    onChange={(e) => change(m.id, e.target.value)}
                    placeholder="—"
                    aria-label={`${m.name} for this day`}
                    aria-describedby={`hint-${m.id}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && i < metrics.length - 1) {
                        e.preventDefault();
                        inputs.current[i + 1]?.focus();
                      }
                    }}
                  />
                  <span>{unitSuffix(m.unit)}</span>
                </div>
                <button
                  type="button"
                  className="step-button"
                  aria-label={`Increase ${m.name}`}
                  onClick={() => {
                    const v = parseMetricInput(raw, m).value ?? 0;
                    change(m.id, String(Math.min(m.max, Math.round((v + m.step) * 100) / 100)));
                  }}
                >
                  +
                </button>
                {last && (
                  <button
                    type="button"
                    className="last-value"
                    title={`Use value from ${last.date}`}
                    onClick={() => change(m.id, String(last.value))}
                  >
                    Last: {last.value.toLocaleString('en-US')}
                  </button>
                )}
              </div>
              <span id={`hint-${m.id}`} className="sr-only">
                {m.unit === 'h'
                  ? 'Enter decimal hours or hours:minutes, for example 7:30.'
                  : `Enter a number in ${m.unit}.`}{' '}
                Maximum {m.max}.
              </span>
            </div>
          );
        })}
      </fieldset>
      <div className="save-dock">
        {message && (
          <p
            role={message.error ? 'alert' : 'status'}
            style={{ color: message.error ? 'var(--red)' : 'var(--green)' }}
          >
            {message.text}
          </p>
        )}
        <div className="save-dock-row">
          <span>
            {busy
              ? 'Saving your check-in…'
              : dirty.length
                ? `${dirty.length} ${dirty.length === 1 ? 'change' : 'changes'} to save`
                : 'A small habit. A clearer picture.'}
            <small>
              {storageUnavailable
                ? 'Draft storage unavailable on this browser'
                : dirty.length
                  ? 'Draft kept on this device'
                  : 'Blank fields stay untouched'}
            </small>
          </span>
          <button
            type="submit"
            disabled={busy || !ready || !dirty.length}
            className="primary-button"
          >
            {busy ? 'Saving…' : 'Save check-in'}
            <Icon name={dirty.length ? 'arrow' : 'check'} size={18} />
          </button>
        </div>
      </div>
    </form>
  );
}
