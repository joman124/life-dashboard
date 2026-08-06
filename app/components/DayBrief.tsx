'use client';

// DayBrief — the bottom-of-Today card: what today looks like across Google
// Calendar and Gmail, in one place.
//
// It replaces the bare Timeline list. A list of events answers "what is on my
// calendar"; it does not answer "how booked am I and is any of this current".
// So the list is kept, but headed by a derived one-line summary and followed by
// the inbox count with the freshness of the sync that produced it — a stale
// number presented as current is the failure mode worth designing against.

import { useState } from 'react';
import type { InboxMessage, TimelineItem } from '@/lib/types';
import { todayISO } from '@/lib/dates';
import { errorText, humanizeSync, readError } from './connectors/shared';

/** Calendar sync writes all-day events with this detail and a 00:00 sentinel. */
const ALL_DAY = 'all day';

/** Beyond this the calendar and inbox are old enough to say so. */
const STALE_AFTER_HOURS = 6;

interface CalendarShape {
  total: number;
  allDay: number;
  first: string | null;
  last: string | null;
}

function describeCalendar(items: TimelineItem[]): { shape: CalendarShape; text: string } {
  const timed = items.filter((i) => i.detail !== ALL_DAY);
  const times = timed.map((i) => i.time).sort();
  const shape: CalendarShape = {
    total: items.length,
    allDay: items.length - timed.length,
    first: times[0] ?? null,
    last: times[times.length - 1] ?? null,
  };

  if (shape.total === 0) return { shape, text: 'Nothing on your calendar today.' };

  const parts = [`${shape.total} event${shape.total === 1 ? '' : 's'} today`];
  if (shape.first && shape.last) {
    parts.push(shape.first === shape.last ? `at ${shape.first}` : `${shape.first} to ${shape.last}`);
  }
  if (shape.allDay > 0) parts.push(`${shape.allDay} all-day`);
  return { shape, text: `${parts.join(' · ')}.` };
}

function describeInbox(count: number | null, shown: number): string {
  if (count === null) return 'Inbox count not synced yet.';
  const base = `${count.toLocaleString('en-US')} inbox thread${count === 1 ? '' : 's'} since midnight`;
  // Say plainly that the list below is a subset — a truncated list read as a
  // complete one is how you miss the seventh email.
  if (shown > 0 && count > shown) return `${base} · newest ${shown} below.`;
  return `${base}.`;
}

/** True when the last sync is old enough that the numbers above may have moved. */
function isStale(lastSync: string | null): boolean {
  if (!lastSync) return true;
  const t = new Date(lastSync).getTime();
  if (Number.isNaN(t)) return true;
  if (todayISO(new Date(t)) !== todayISO()) return true;
  return Date.now() - t > STALE_AFTER_HOURS * 3_600_000;
}

export default function DayBrief({
  items,
  lastGoogleSync,
  inboxCount,
  inboxDigest,
  refresh,
}: {
  items: TimelineItem[];
  lastGoogleSync: string | null;
  inboxCount: number | null;
  inboxDigest: InboxMessage[];
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calendar = describeCalendar(items);
  const stale = isStale(lastGoogleSync);

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/sync/google', { method: 'POST' });
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      // Calendar and Gmail fail independently server-side; a partial failure is
      // reported as one rather than hidden behind a green "synced".
      const body = (await res.json()) as { errors?: { calendar?: string; gmail?: string } };
      const failures = [
        body.errors?.calendar ? `Calendar: ${body.errors.calendar}` : null,
        body.errors?.gmail ? `Gmail: ${body.errors.gmail}` : null,
      ].filter((f): f is string => f !== null);
      if (failures.length > 0) setError(failures.join(' · '));
    } catch (err) {
      setError(errorText(err, 'Sync failed.'));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  return (
    <section className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">Calendar &amp; email</div>
          <p className="mt-1.5 text-[13px] leading-relaxed">{calendar.text}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[color:var(--muted)]">
            {describeInbox(inboxCount, inboxDigest.length)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void sync()}
          disabled={busy}
          className="tap shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] disabled:opacity-40"
          style={{ borderColor: 'var(--gold-dim)', color: 'var(--gold)' }}
        >
          {busy ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      <p className="mt-1.5 text-[11px]" style={{ color: stale ? 'var(--red)' : 'var(--faint)' }}>
        {humanizeSync(lastGoogleSync)}
        {stale ? ' — these numbers may be out of date.' : ''}
      </p>

      {error && (
        <p className="mt-2 text-[12px]" style={{ color: 'var(--red)' }} role="alert">
          {error}
        </p>
      )}

      {inboxDigest.length > 0 && (
        <ul className="mt-2 border-t pt-1" style={{ borderColor: 'var(--hairline)' }}>
          {inboxDigest.map((msg, i) => (
            <li
              key={`${msg.time}-${msg.subject}-${i}`}
              className="flex items-start gap-3 py-2.5"
              style={i > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
            >
              <span className="pt-0.5 font-mono text-[12px] text-[color:var(--faint)]">
                {msg.time || '—'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">{msg.subject}</p>
                <p className="mt-0.5 truncate text-[11.5px] text-[color:var(--muted)]">{msg.from}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <ul className="mt-2 border-t pt-1" style={{ borderColor: 'var(--hairline)' }}>
          {items.map((it, i) => (
            <li
              key={it.id}
              className="flex items-start gap-3 py-3"
              style={i > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
            >
              <span className="pt-0.5 font-mono text-[12px] text-[color:var(--faint)]">
                {it.detail === ALL_DAY ? '—' : it.time}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px]">{it.title}</span>
                  {it.source === 'calendar' && (
                    <span
                      className="rounded-full border px-1.5 py-px text-[9.5px] uppercase tracking-[0.1em]"
                      style={{ borderColor: 'var(--gold-dim)', color: 'var(--gold)' }}
                    >
                      Calendar
                    </span>
                  )}
                </div>
                {it.detail && (
                  <p className="mt-0.5 text-[12px] text-[color:var(--gold)]">{it.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <p className="mt-2 text-[12px] text-[color:var(--faint)]">
          If this looks wrong, connect Google Calendar in the ⚙ Track tab, then Sync.
        </p>
      )}
    </section>
  );
}
