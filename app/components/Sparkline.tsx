// Sparkline — 7 small gold bars; the last (today) full gold, prior bars at
// 35% opacity. Unlogged days render no bar.

export default function Sparkline({ values }: { values: (number | null)[] }) {
  const W = 70;
  const H = 26;
  const n = Math.max(values.length, 1);
  const logged = values.filter((v): v is number => v !== null);
  const max = logged.length > 0 ? Math.max(...logged) : 0;
  const slot = W / n;
  const bw = Math.min(6, slot * 0.6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0" aria-hidden="true">
      {values.map((v, i) => {
        if (v === null) return null;
        const h = max > 0 ? Math.max((v / max) * (H - 2), v > 0 ? 2 : 1) : 1;
        const x = i * slot + (slot - bw) / 2;
        return (
          <rect
            key={i}
            x={x}
            y={H - h}
            width={bw}
            height={h}
            rx={1.5}
            fill="var(--gold)"
            opacity={i === values.length - 1 ? 1 : 0.35}
          />
        );
      })}
    </svg>
  );
}
