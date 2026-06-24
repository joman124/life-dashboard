// BarChart — weekly 7-bar chart. Today's bar full gold, prior bars 35%
// opacity, dashed gold goal line overlaid at goal height. Bar height scale
// is max(values, goal). Day label + compact value under each bar.

import type { Unit } from '@/lib/types';
import { compactValue } from './format';

export interface BarDatum {
  date: string;
  label: string;
  value: number | null;
}

const W = 322;
const H = 148;
const PAD_X = 6;
const TOP = 12;
const BASE = 102;
const DAY_Y = 122;
const VAL_Y = 138;

export default function BarChart({
  data,
  goal,
  unit,
  label,
}: {
  data: BarDatum[];
  goal: number;
  unit: Unit;
  label: string;
}) {
  const logged = data.filter((d) => d.value !== null).map((d) => d.value as number);
  const scaleMax = Math.max(goal, ...(logged.length > 0 ? logged : [0]), 1e-6);
  const slot = (W - PAD_X * 2) / Math.max(data.length, 1);
  const bw = Math.min(24, slot * 0.5);
  const yOf = (v: number) => BASE - (v / scaleMax) * (BASE - TOP);
  const goalY = yOf(goal);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block w-full" role="img" aria-label={label}>
      <line x1={PAD_X} x2={W - PAD_X} y1={BASE} y2={BASE} stroke="var(--hairline)" strokeWidth={1} />
      {data.map((d, i) => {
        const cx = PAD_X + i * slot + slot / 2;
        const isLast = i === data.length - 1;
        const h = d.value !== null && d.value > 0 ? Math.max(1.5, BASE - yOf(d.value)) : 0;
        return (
          <g key={d.date}>
            {h > 0 && (
              <rect
                x={cx - bw / 2}
                y={BASE - h}
                width={bw}
                height={h}
                rx={3}
                fill="var(--gold)"
                opacity={isLast ? 1 : 0.35}
              />
            )}
            <text x={cx} y={DAY_Y} textAnchor="middle" fontSize={10} fill="var(--muted)">
              {d.label}
            </text>
            <text
              x={cx}
              y={VAL_Y}
              textAnchor="middle"
              fontSize={10}
              fill={d.value === null ? 'var(--faint)' : 'var(--text)'}
            >
              {d.value === null ? '–' : compactValue(d.value, unit)}
            </text>
          </g>
        );
      })}
      <line
        x1={PAD_X}
        x2={W - PAD_X}
        y1={goalY}
        y2={goalY}
        stroke="var(--gold)"
        strokeWidth={1.2}
        strokeDasharray="5 4"
        opacity={0.75}
      />
    </svg>
  );
}
