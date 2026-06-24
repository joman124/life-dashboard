// DeltaPill — rounded pill with a tinted green/red background.
// Arrow shows the direction of change (↗ pct ≥ 0, ↘ pct < 0); color shows
// whether that change is GOOD for this metric (pickups down = green).
// Renders nothing when delta is null.

export default function DeltaPill({
  delta,
}: {
  delta: { pct: number; good: boolean } | null;
}) {
  if (!delta) return null;
  const up = delta.pct >= 0;
  const color = delta.good ? 'var(--green)' : 'var(--red)';
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      aria-label={`${up ? 'Up' : 'Down'} ${Math.abs(delta.pct)} percent vs 7-day baseline${delta.good ? ' (good)' : ''}`}
    >
      <span aria-hidden="true">{up ? '↗' : '↘'}</span>
      {Math.abs(delta.pct)}%
    </span>
  );
}
