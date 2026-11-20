'use client';

// FocusCheck — closes the week on its focus: one tap (held / partly / missed),
// an optional one-line note, and a strip of the last 8 weeks' ratings.
//
// Rating this week again replaces the earlier tap. The note saves with the next
// tap, or on Enter/blur once the week is rated. Seeded from props and remounted
// by a key in the parent, so a refresh replaces the draft.

import { useState } from 'react';
import { formatDateShort } from '@/lib/dates';
import {
  FOCUS_RATINGS,
  MAX_NOTE_LEN,
  checkWeek,
  historyStrip,
  stripTally,
  type FocusChecks,
  type FocusRating,
} from '@/lib/focusCheck';

const LABEL: Record<FocusRating, string> = { held: 'Held', partly: 'Partly', missed: 'Missed' };

const SQUARE: Record<FocusRating, React.CSSProperties> = {
  held: { background: 'var(--gold)' },
  partly: { background: 'var(--gold-dim)' },
  missed: { background: 'var(--red)', opacity: 0.7 },
};

export default function FocusCheck({
  checks,
  today,
  hasFocus,
  onSave,
}: {
  checks: FocusChecks;
  today: string;
  hasFocus: boolean;
  onSave: (rating: FocusRating, note: string) => Promise<string | null>;
}) {
  const current = checks[checkWeek(today)] ?? null;
  const [note, setNote] = useState(current?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strip = historyStrip(checks, today);
  const tally = stripTally(strip);

  async function save(rating: FocusRating) {
    setSaving(true);
    const failure = await onSave(rating, note.trim());
    setSaving(false);
    setError(failure);
  }

  return (
    <section className="card p-4">
      <div className="eyebrow">Did the focus hold?</div>
      {!hasFocus && !current && (
        <p className="mt-1 text-[12px] text-[color:var(--muted)]">
          No focus set this week — set one at the top of Today, or rate the week anyway.
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Rate this week's focus">
        {FOCUS_RATINGS.map((r) => {
          const selected = current?.rating === r;
          return (
            <button
              key={r}
              type="button"
              disabled={saving}
              aria-pressed={selected}
              onClick={() => void save(r)}
              className="tap rounded-xl py-2.5 text-[14px]"
              style={{
                background: selected ? 'var(--gold)' : 'var(--card-inset)',
                color: selected ? 'var(--bg)' : 'var(--text)',
                border: `1px solid ${selected ? 'var(--gold)' : 'var(--hairline)'}`,
              }}
            >
              {LABEL[r]}
            </button>
          );
        })}
      </div>

      <input
        type="text"
        maxLength={MAX_NOTE_LEN}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={() => {
          if (current && note.trim() !== current.note) void save(current.rating);
        }}
        placeholder="One line on why (optional)"
        aria-label="Note on this week's focus"
        className="input mt-2 w-full text-[13px]"
      />

      {error && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--red)' }} role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-1.5">
        {strip.map((s, i) => (
          <div
            key={s.week}
            title={`Week of ${formatDateShort(s.week)} — ${s.rating ? LABEL[s.rating].toLowerCase() : 'not rated'}`}
            className="aspect-square min-w-0 flex-1 rounded-[5px]"
            style={
              s.rating
                ? { ...SQUARE[s.rating], outline: i === strip.length - 1 ? '1px solid var(--gold)' : undefined, outlineOffset: 2 }
                : { background: 'var(--card-inset)', border: '1px solid var(--hairline)' }
            }
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[color:var(--muted)]">
        Last {strip.length} weeks ·{' '}
        {tally.rated === 0
          ? 'none rated yet'
          : `held ${tally.held}, partly ${tally.partly}, missed ${tally.missed}`}
      </p>
    </section>
  );
}
