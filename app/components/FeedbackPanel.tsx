import type { Entry, Metric } from '@/lib/types';
import { assessGoals, goalScore } from '@/lib/feedback';
import { topCorrelations, isUsefulPattern } from '@/lib/correlations';
import { weekReview } from '@/lib/insights';
import InsightCard from './InsightCard';
import Icon from './Icon';

export default function FeedbackPanel({
  metrics,
  entries,
  today,
}: {
  metrics: Metric[];
  entries: Entry[];
  today: string;
}) {
  const assessments = assessGoals(metrics, entries, today);
  const score = goalScore(assessments);
  const judged = assessments.filter((a) => a.status === 'met' || a.status === 'off-track');
  const review = weekReview(metrics, entries, today);
  const pattern = topCorrelations(
    entries,
    assessments.map((a) => a.metric.id),
    { today, top: 100 },
  ).find(isUsefulPattern);
  return (
    <div className="feedback-stack">
      <section className="card feedback-card">
        <div className="eyebrow">The bigger picture</div>
        <div className="feedback-score">
          <span className="font-display">
            {score === null ? '—' : score}
            <small>{score === null ? '' : '%'}</small>
          </span>
          <Icon name="trends" size={30} />
        </div>
        <h2 className="font-display">
          {score === null
            ? 'Your picture is taking shape.'
            : score >= 75
              ? 'Build on what’s working.'
              : 'Small steps add up.'}
        </h2>
        <p>
          {score === null
            ? 'A few more check-ins will give your feedback a stronger foundation.'
            : `${judged.filter((a) => a.status === 'met').length} of ${judged.length} assessed goals are on target.`}
        </p>
        <div className="assessment-list">
          {assessments.map((a) => (
            <div key={a.metric.id}>
              <span>
                {a.metric.emoji} {a.metric.name}
              </span>
              <span className={`assessment-${a.status}`}>
                {a.metric.weeklyTarget !== null
                  ? `${a.hits}/${a.metric.weeklyTarget} days this week`
                  : a.status === 'collecting'
                    ? `${a.logged}/4 days to assess`
                    : a.status === 'met'
                      ? 'On target'
                      : 'Room to grow'}
              </span>
            </div>
          ))}
        </div>
        <p className="fine-print">
          Daily goals: average of logged values over 7 days, minimum 4 days. Weekly habits: goal-hit
          days since Monday. Incomplete weekly targets and sparse daily metrics are excluded from
          the score. Missing entries stay unknown.
        </p>
      </section>
      <section className="card next-step-card">
        <div className="eyebrow">One intentional next step</div>
        <h2 className="font-display">A little direction.</h2>
        {review.recommendations.length ? (
          <p>{review.recommendations[0].text}</p>
        ) : (
          <p>
            Start with a check-in. Record what happened today, including zero when you mean zero.
            Consistency makes patterns easier to trust.
          </p>
        )}
      </section>
      {pattern && <InsightCard pair={pattern} metrics={metrics} />}
      <div className="feedback-footnote">
        <span className="status-dot" />
        Calculated from saved entries. Patterns are exploratory.
      </div>
    </div>
  );
}
