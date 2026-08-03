'use client';

// MetricSettingsRow — one row of the Track tab's metric list, with three
// modes: view (toggle + Edit), edit (inline form), and a delete confirmation.
//
// The distinction the UI has to make obvious: toggling a metric OFF stops
// tracking it but keeps its history, while Delete destroys the metric and
// every entry ever recorded against it. Delete therefore names the metric and
// states exactly how many entries go with it before it will proceed.

import { useState } from 'react';
import type { Entry, Metric } from '@/lib/types';
import type { MetricPatchInput } from './useDashboard';
import { autoEmoji } from '@/lib/autoEmoji';
import { formatGoal } from './format';

type Mode = 'view' | 'edit' | 'confirm-delete';

export default function MetricSettingsRow({
  metric,
  onToggle,
  onEdit,
  onDelete,
}: {
  metric: Metric;
  onToggle: (id: string, active: boolean) => void;
  onEdit: (id: string, patch: MetricPatchInput) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<Mode>('view');
  const [name, setName] = useState(metric.name);
  const [emoji, setEmoji] = useState(metric.emoji);
  const [goal, setGoal] = useState(String(metric.goal));
  const [dir, setDir] = useState<Metric['goalDirection']>(metric.goalDirection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goalNum = Number(goal);
  const canSave = name.trim() !== '' && goal.trim() !== '' && Number.isFinite(goalNum) && !busy;

  /** Reset the form back to the metric's stored values and return to view. */
  function cancel() {
    setName(metric.name);
    setEmoji(metric.emoji);
    setGoal(String(metric.goal));
    setDir(metric.goalDirection);
    setError(null);
    setMode('view');
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    // Send only what actually changed, so an untouched field can never be
    // rewritten with a stale value.
    const patch: MetricPatchInput = {};
    if (name.trim() !== metric.name) patch.name = name.trim();
    if (emoji.trim() && emoji.trim() !== metric.emoji) patch.emoji = emoji.trim();
    if (goalNum !== metric.goal) patch.goal = goalNum;
    if (dir !== metric.goalDirection) patch.goalDirection = dir;

    if (Object.keys(patch).length === 0) {
      setBusy(false);
      setMode('view');
      return;
    }

    const err = await onEdit(metric.id, patch);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setMode('view');
  }

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    const err = await onDelete(metric.id);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    // On success this row unmounts with the refreshed metric list.
  }

  if (mode === 'confirm-delete') {
    return (
      <div className="py-3" role="alertdialog" aria-label={`Delete ${metric.name}`}>
        <p className="text-[13px]">
          Delete <span className="font-medium">{metric.name}</span> and{' '}
          <span style={{ color: 'var(--red)' }}>all of its logged history</span>?
        </p>
        <p className="mt-1 text-[11.5px]" style={{ color: 'var(--faint)' }}>
          This cannot be undone. To keep the history and just stop tracking it, turn the switch off
          instead.
        </p>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => void confirmDelete()}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
            style={{ background: 'var(--red)', color: '#fff' }}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="rounded-lg border px-3 py-1.5 text-[12px] disabled:opacity-40"
            style={{ borderColor: 'var(--hairline)', color: 'var(--text)' }}
          >
            Cancel
          </button>
        </div>
        {error && (
          <p className="mt-2 text-[12px]" style={{ color: 'var(--red)' }} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (mode === 'edit') {
    return (
      <form
        className="space-y-2.5 py-3"
        aria-label={`Edit ${metric.name}`}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center gap-2">
          <input
            className="input !w-[52px] shrink-0 text-center"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            aria-label="Emoji"
            maxLength={4}
            placeholder={autoEmoji(name || metric.name)}
          />
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Metric name"
            placeholder="Metric name"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="eyebrow block !text-[9.5px]">Direction</span>
            <select
              className="input mt-1"
              value={dir}
              onChange={(e) => setDir(e.target.value as Metric['goalDirection'])}
              aria-label="Goal direction"
            >
              <option value=">=">at least</option>
              <option value="<=">at most</option>
            </select>
          </label>
          <label className="block">
            <span className="eyebrow block !text-[9.5px]">Goal</span>
            <input
              className="input mt-1"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              aria-label="Goal"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
            style={{ background: 'var(--gold)', color: '#171107' }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="rounded-lg border px-3 py-1.5 text-[12px] disabled:opacity-40"
            style={{ borderColor: 'var(--hairline)', color: 'var(--text)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMode('confirm-delete');
            }}
            disabled={busy}
            className="ml-auto rounded-lg border px-3 py-1.5 text-[12px] disabled:opacity-40"
            style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
          >
            Delete
          </button>
        </div>

        {error && (
          <p className="text-[12px]" style={{ color: 'var(--red)' }} role="alert">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="w-7 shrink-0 text-center text-[20px]" aria-hidden="true">
        {metric.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[14px] font-medium">{metric.name}</span>
          <span className="eyebrow shrink-0 !text-[9.5px] text-[color:var(--faint)]">
            {metric.category}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-[color:var(--muted)]">
          {formatGoal(metric.goal, metric.unit, metric.goalDirection)}
          {metric.description ? ` · ${metric.description}` : ''}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setMode('edit')}
        aria-label={`Edit ${metric.name}`}
        className="tap shrink-0 rounded-lg border px-2 py-1 text-[11px]"
        style={{ borderColor: 'var(--hairline)', color: 'var(--muted)' }}
      >
        Edit
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={metric.active}
        aria-label={`Track ${metric.name}`}
        onClick={() => onToggle(metric.id, !metric.active)}
        className="tap h-[26px] w-[46px] shrink-0 rounded-full transition-colors duration-150"
        style={{
          background: metric.active ? 'var(--gold)' : 'var(--card-inset)',
          border: `1px solid ${metric.active ? 'var(--gold)' : 'var(--hairline)'}`,
        }}
      >
        <span
          className="absolute left-[2px] top-1/2 h-[20px] w-[20px] rounded-full transition-transform duration-150"
          style={{
            transform: metric.active ? 'translate(20px, -50%)' : 'translate(0, -50%)',
            background: metric.active ? '#171107' : 'var(--muted)',
          }}
        />
      </button>
    </div>
  );
}
