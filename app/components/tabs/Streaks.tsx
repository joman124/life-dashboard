// Streaks tab — per active metric: 🔥 + large serif consecutive count, the
// goal restated, and a 14-square hit grid.
//
// A metric with a weeklyTarget counts in weeks rather than days, all the way
// through: the number, the word beside it, the goal line and the grid. Half
// a conversion would be worse than none — "3 day streak" over a grid of
// weeks is a harder thing to read than either one alone.

import type { Entry, Metric } from '@/lib/types';
import { lastNDayHits, lastNWeekHits, streakDays, streakWeeks } from '@/lib/streaks';
import { entriesFor } from '../data';
import { formatGoal } from '../format';
import StreakGrid from '../StreakGrid';

export default function Streaks({
  metrics,
  entries,
  today,
}: {
  metrics: Metric[];
  entries: Entry[];
  today: string;
}) {
  const active = metrics.filter((m) => m.active);

  return (
    <div className="space-y-3">
      {active.map((m) => {
        const own = entriesFor(entries, m.id);
        const weekly = m.weeklyTarget !== null;
        const streak = weekly
          ? streakWeeks(own, m.goal, m.goalDirection, m.weeklyTarget as number, today)
          : streakDays(own, m.goal, m.goalDirection, today);
        const hits = weekly
          ? lastNWeekHits(own, m.goal, m.goalDirection, m.weeklyTarget as number, today, 14)
          : lastNDayHits(own, m.goal, m.goalDirection, today, 14);
        return (
          <section key={m.id} className="card p-4">
            <div className="eyebrow truncate">
              {m.emoji} {m.name}
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-[20px]" aria-hidden="true">
                🔥
              </span>
              <span className="font-display text-[34px] leading-none">{streak}</span>
              <span className="text-[13px] text-[color:var(--muted)]">
                {weekly ? 'week streak' : 'day streak'}
              </span>
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--muted)]">
              {formatGoal(m.goal, m.unit, m.goalDirection)}
              {weekly
                ? ` · ${m.weeklyTarget} ${m.weeklyTarget === 1 ? 'day' : 'days'} / week`
                : ' / day'}
            </div>
            <StreakGrid hits={hits} unit={weekly ? 'week' : 'day'} />
          </section>
        );
      })}
      {active.length === 0 && (
        <section className="card p-4">
          <p className="text-[13px] text-[color:var(--muted)]">
            No active metrics — turn some on in the ⚙ Track tab.
          </p>
        </section>
      )}
    </div>
  );
}
