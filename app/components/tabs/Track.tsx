'use client';

// Track tab — "Choose what you track.": toggle rows for ALL metrics
// (including inactive), the "Add your own" form with a live autoEmoji
// preview, and the connectors panel + JSON export.

import { useState } from 'react';
import type { Metric } from '@/lib/types';
import { autoEmoji } from '@/lib/autoEmoji';
import type { NewMetricInput } from '../useDashboard';
import ConnectorPanel from '../ConnectorPanel';

const UNIT_OPTIONS: { value: Metric['unit']; label: string }[] = [
  { value: 'h', label: 'hours' },
  { value: 'm', label: 'minutes' },
  { value: 'count', label: 'count' },
  { value: '/10', label: 'score /10' },
];

export default function Track({
  metrics,
  onToggle,
  onAdd,
  refresh,
}: {
  metrics: Metric[];
  onToggle: (id: string, active: boolean) => void;
  onAdd: (input: NewMetricInput) => Promise<string | null>;
  refresh: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<Metric['unit']>('h');
  const [dir, setDir] = useState<Metric['goalDirection']>('>=');
  const [goal, setGoal] = useState('');
  const [emojiOverride, setEmojiOverride] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const goalNum = Number(goal);
  const canAdd =
    name.trim().length > 0 && goal.trim() !== '' && Number.isFinite(goalNum) && !submitting;
  const previewEmoji = emojiOverride.trim() || (name.trim() ? autoEmoji(name) : '');

  async function handleAdd() {
    if (!canAdd) return;
    setSubmitting(true);
    setFormError(null);
    const err = await onAdd({
      name: name.trim(),
      unit,
      goal: goalNum,
      goalDirection: dir,
      ...(emojiOverride.trim() ? { emoji: emojiOverride.trim() } : {}),
    });
    setSubmitting(false);
    if (err) {
      setFormError(err);
      return;
    }
    setName('');
    setUnit('h');
    setDir('>=');
    setGoal('');
    setEmojiOverride('');
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display px-1 text-[22px]">Choose what you track.</h2>

      <section className="card px-4 py-1">
        {metrics.map((m, i) => (
          <div
            key={m.id}
            className="flex items-center gap-3 py-3"
            style={i > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
          >
            <span className="w-7 shrink-0 text-center text-[20px]" aria-hidden="true">
              {m.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[14px] font-medium">{m.name}</span>
                <span className="eyebrow shrink-0 !text-[9.5px] text-[color:var(--faint)]">
                  {m.category}
                </span>
              </div>
              {m.description && (
                <p className="mt-0.5 truncate text-[12px] text-[color:var(--muted)]">
                  {m.description}
                </p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={m.active}
              aria-label={`Track ${m.name}`}
              onClick={() => onToggle(m.id, !m.active)}
              className="relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors duration-150"
              style={{
                background: m.active ? 'var(--gold)' : 'var(--card-inset)',
                border: `1px solid ${m.active ? 'var(--gold)' : 'var(--hairline)'}`,
              }}
            >
              <span
                className="absolute left-[2px] top-1/2 h-[20px] w-[20px] rounded-full transition-transform duration-150"
                style={{
                  transform: m.active ? 'translate(20px, -50%)' : 'translate(0, -50%)',
                  background: m.active ? '#171107' : 'var(--muted)',
                }}
              />
            </button>
          </div>
        ))}
      </section>

      <section className="card p-4">
        <div className="eyebrow">Add your own</div>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAdd();
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] border text-[18px]"
              style={{ borderColor: 'var(--hairline)', background: 'var(--card-inset)' }}
              title="Emoji preview"
              aria-hidden="true"
            >
              {previewEmoji || <span style={{ color: 'var(--faint)' }}>·</span>}
            </span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Metric name (e.g. Meditation)"
              aria-label="Metric name"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="eyebrow block !text-[9.5px]">Unit</span>
              <select
                className="input mt-1"
                value={unit}
                onChange={(e) => setUnit(e.target.value as Metric['unit'])}
              >
                {UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="eyebrow block !text-[9.5px]">Direction</span>
              <select
                className="input mt-1"
                value={dir}
                onChange={(e) => setDir(e.target.value as Metric['goalDirection'])}
              >
                <option value=">=">at least</option>
                <option value="<=">at most</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
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
                placeholder="e.g. 15"
              />
            </label>
            <label className="block">
              <span className="eyebrow block !text-[9.5px]">Emoji (optional)</span>
              <input
                className="input mt-1"
                value={emojiOverride}
                onChange={(e) => setEmojiOverride(e.target.value)}
                placeholder="auto"
                maxLength={4}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={!canAdd}
            className="w-full rounded-xl py-2.5 text-[14px] font-semibold disabled:opacity-40"
            style={{ background: 'var(--gold)', color: '#171107' }}
          >
            {submitting ? 'Adding…' : 'Add'}
          </button>
          {formError && (
            <p className="text-[12px]" style={{ color: 'var(--red)' }} role="alert">
              {formError}
            </p>
          )}
        </form>
      </section>

      <ConnectorPanel refresh={refresh} />
    </div>
  );
}
