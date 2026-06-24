// Streaks tab — per active metric: 🔥 + large serif consecutive-day count,
// the goal restated per day, and a 14-day hit grid.

import type { Entry, Metric } from '@/lib/types';
import { lastNDayHits, streakDays } from '@/lib/streaks';
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
        const streak = streakDays(own, m.goal, m.goalDirection, today);
        const hits = lastNDayHits(own, m.goal, m.goalDirection, today, 14);
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
              <span className="text-[13px] text-[color:var(--muted)]">day streak</span>
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--muted)]">
              {formatGoal(m.goal, m.unit, m.goalDirection)} / day
            </div>
            <StreakGrid hits={hits} />
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
