// Timeline — today's events sorted by time: monospace HH:MM, title, gold
// detail text, and a source badge chip for calendar items.

import type { TimelineItem } from '@/lib/types';

export default function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <section className="card p-4">
      <div className="eyebrow">Timeline</div>
      {items.length === 0 ? (
        <p className="mt-2 text-[13px] text-[color:var(--muted)]">
          No events yet — connect Google Calendar in the ⚙ Track tab, then Sync.
        </p>
      ) : (
        <ul className="mt-1">
          {items.map((it, i) => (
            <li
              key={it.id}
              className="flex items-start gap-3 py-3"
              style={i > 0 ? { borderTop: '1px solid var(--hairline)' } : undefined}
            >
              <span className="pt-0.5 font-mono text-[12px] text-[color:var(--faint)]">
                {it.time}
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
    </section>
  );
}
