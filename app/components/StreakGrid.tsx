// StreakGrid — 14 rounded squares, oldest → newest. Goal met = gold
// (most recent day at full intensity, earlier hits dimmed); missed or
// unlogged = card-inset with a hairline border.

import { formatDateLong } from '@/lib/dates';

export default function StreakGrid({
  hits,
}: {
  hits: { date: string; hit: boolean; logged: boolean }[];
}) {
  return (
    <div className="mt-3 flex gap-1.5">
      {hits.map((h, i) => {
        const isLast = i === hits.length - 1;
        const status = h.logged ? (h.hit ? 'goal met' : 'goal missed') : 'not logged';
        return (
          <div
            key={h.date}
            title={`${formatDateLong(h.date)} — ${status}`}
            className="aspect-square min-w-0 flex-1 rounded-[5px]"
            style={
              h.hit
                ? { background: 'var(--gold)', opacity: isLast ? 1 : 0.55 }
                : { background: 'var(--card-inset)', border: '1px solid var(--hairline)' }
            }
          />
        );
      })}
    </div>
  );
}
