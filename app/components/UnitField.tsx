'use client';

// UnitField — the unit picker, shared by the Track tab's "Add your own" form
// and the per-metric edit row.
//
// Four builtins get bespoke formatting elsewhere (h/m/count//10); anything else
// is a label the user types and the app renders verbatim. Choosing "custom…"
// deliberately clears the value rather than pre-filling one, so the caller's
// own validation blocks Save until something real is typed — a silent default
// of "h" on a metric the user meant to measure in pages is worse than a
// disabled button.

import { useState } from 'react';
import type { Unit } from '@/lib/types';
import { MAX_UNIT_LENGTH, isBuiltinUnit } from '@/lib/validate';

const BUILTIN_OPTIONS: { value: string; label: string }[] = [
  { value: 'h', label: 'hours' },
  { value: 'm', label: 'minutes' },
  { value: 'count', label: 'count' },
  { value: '/10', label: 'score /10' },
];

const CUSTOM = '__custom';

export default function UnitField({
  value,
  onChange,
  idPrefix,
}: {
  value: Unit;
  onChange: (unit: Unit) => void;
  idPrefix: string;
}) {
  // An existing custom unit must open in custom mode, hence the initializer.
  const [isCustom, setIsCustom] = useState(() => value !== '' && !isBuiltinUnit(value));

  return (
    <div>
      <label className="block">
        <span className="eyebrow block !text-[9.5px]">Unit</span>
        <select
          id={`${idPrefix}-unit`}
          className="input mt-1"
          value={isCustom ? CUSTOM : value}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setIsCustom(true);
              onChange('');
            } else {
              setIsCustom(false);
              onChange(e.target.value);
            }
          }}
        >
          {BUILTIN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value={CUSTOM}>custom…</option>
        </select>
      </label>

      {isCustom && (
        <input
          className="input mt-1.5"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. pages, reps, miles"
          aria-label="Custom unit label"
          maxLength={MAX_UNIT_LENGTH}
        />
      )}
    </div>
  );
}
