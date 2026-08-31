// StreakGrid — 14 rounded squares, oldest → newest. Goal met = gold
// (most recent square at full intensity, earlier hits dimmed); missed or
// unlogged = card-inset with a hairline border.
//
// One square is a day for a daily metric and a week for a weekly one. Only
// the labelling differs, so `unit` changes what the tooltip says rather than
// forking the component: a weekly square is named by its Monday and reports
// how many days in that week cleared the goal.

import { formatDateLong, formatDateShort } from '@/lib/dates';

export default function StreakGrid({
  hits,
  unit = 'day',
}: {
  hits: { date: string; hit: boolean; logged: boolean; days?: number }[];
  unit?: 'day' | 'week';
}) {
  return (
    <div className="mt-3 flex gap-1.5">
      {hits.map((h, i) => {
        const isLast = i === hits.length - 1;
        const status =
          unit === 'week'
            ? `${h.days ?? 0} ${h.days === 1 ? 'day' : 'days'} met`
            : h.logged
              ? h.hit
                ? 'goal met'
                : 'goal missed'
              : 'not logged';
        const when = unit === 'week' ? `Week of ${formatDateShort(h.date)}` : formatDateLong(h.date);
        return (
          <div
            key={h.date}
            title={`${when} — ${status}`}
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
