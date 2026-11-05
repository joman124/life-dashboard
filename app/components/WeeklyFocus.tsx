'use client';

// WeeklyFocus — one line at the top of Today holding what the week is for.
//
// The dashboard tracks every number the day produces; this is the one thing the
// numbers are in service of. Set once, it rides every Today view until changed.
//
// One field, editable in place: it shows the current focus and, on Edit, becomes
// an input that saves on Enter or blur. Seeded from the prop and remounted by a
// key in the parent, so a refresh that brings a new value replaces the draft.

import { useState } from 'react';
import { MAX_FOCUS_LEN } from '@/lib/weeklyFocus';

export default function WeeklyFocus({
  value,
  onSave,
}: {
  value: string;
  onSave: (text: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(value === '');
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next === value) return; // nothing changed — no round trip
    const failure = await onSave(next);
    if (failure) {
      setError(failure);
      setEditing(true);
    } else {
      setError(null);
    }
  }

  return (
    <section className="card card-gold p-4">
      <div className="eyebrow">This week&apos;s focus</div>

      {editing ? (
        <input
          autoFocus
          type="text"
          maxLength={MAX_FOCUS_LEN}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(value);
              setEditing(false);
            }
          }}
          placeholder="What are you working toward this week?"
          aria-label="This week's focus"
          className="input mt-1 w-full font-display text-[18px]"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="mt-1 block w-full text-left font-display text-[18px]"
          aria-label="Edit this week's focus"
        >
          {value || (
            <span style={{ color: 'var(--faint)' }}>What are you working toward this week?</span>
          )}
        </button>
      )}

      {error && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--red)' }} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
