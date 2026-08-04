// Today tab — focus cards per active metric, the auto-insight card,
// Log Today steppers, and today's timeline.

import type { Entry, Metric, TimelineItem } from '@/lib/types';
import { topCorrelations } from '@/lib/correlations';
import MetricCard from '../MetricCard';
import InsightCard from '../InsightCard';
import LogEntries from '../LogEntries';
import Timeline from '../Timeline';

export default function Today({
  metrics,
  entries,
  timeline,
  today,
  onLog,
  onSaveAll,
}: {
  metrics: Metric[];
  entries: Entry[];
  timeline: TimelineItem[];
  today: string;
  onLog: (metricId: string, value: number, date: string) => void;
  onSaveAll: (date: string, values: { metricId: string; value: number }[]) => Promise<string | null>;
}) {
  const active = metrics.filter((m) => m.active);
  const insight = topCorrelations(
    entries,
    active.map((m) => m.id),
    { top: 1, today },
  )[0];

  return (
    <div className="space-y-3">
      {active.map((m) => (
        <MetricCard key={m.id} metric={m} entries={entries} today={today} />
      ))}
      {active.length === 0 && (
        <section className="card p-4">
          <p className="text-[13px] text-[color:var(--muted)]">
            No active metrics — turn some on in the ⚙ Track tab.
          </p>
        </section>
      )}
      {insight && <InsightCard pair={insight} metrics={metrics} />}
      <LogEntries
        metrics={active}
        entries={entries}
        today={today}
        onLog={onLog}
        onSaveAll={onSaveAll}
      />
      <Timeline items={timeline} />
    </div>
  );
}
