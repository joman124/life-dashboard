'use client';

// LineChart — trend line over an arbitrary window: gold 2px line on the card,
// dashed hairline grid, and a dark tooltip (value + date) that follows
// hover/touch. The window is whatever the caller passes in `points`, so the
// same component draws 30 days and 12 months.

import { useRef, useState } from 'react';
import type { Unit } from '@/lib/types';
import { formatDateLong } from '@/lib/dates';
import { formatValue, unitSuffix } from './format';

export interface LinePoint {
  date: string;
  value: number | null;
}

const W = 322;
const H = 132;
const PAD_X = 6;
const PAD_T = 10;
const PAD_B = 10;

export default function LineChart({
  points,
  unit,
  label,
  emptyLabel = 'No data in this range',
}: {
  points: LinePoint[];
  unit: Unit;
  label: string;
  emptyLabel?: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const n = points.length;
  const loggedIdx: number[] = [];
  const loggedVals: number[] = [];
  points.forEach((p, i) => {
    if (p.value !== null) {
      loggedIdx.push(i);
      loggedVals.push(p.value);
    }
  });

  let min = 0;
  let max = 1;
  if (loggedVals.length > 0) {
    min = Math.min(...loggedVals);
    max = Math.max(...loggedVals);
    if (min === max) {
      min -= 1;
      max += 1;
    } else {
      const pad = (max - min) * 0.1;
      min -= pad;
      max += pad;
    }
  }

  const xOf = (i: number) => PAD_X + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD_X * 2));
  const yOf = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B);

  // Path segments — gaps where days are unlogged.
  let d = '';
  let prevLogged = false;
  points.forEach((p, i) => {
    if (p.value === null) {
      prevLogged = false;
      return;
    }
    d += `${prevLogged ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`;
    prevLogged = true;
  });

  function locate(clientX: number) {
    const svg = svgRef.current;
    if (!svg || loggedIdx.length === 0) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const fx = ((clientX - rect.left) / rect.width) * W;
    const fIdx = ((fx - PAD_X) / (W - PAD_X * 2)) * (n - 1);
    let best = loggedIdx[0];
    let bestDist = Infinity;
    for (const i of loggedIdx) {
      const dist = Math.abs(i - fIdx);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    setActiveIdx(best);
  }

  const activePoint = activeIdx === null ? undefined : points[activeIdx];
  const active =
    activeIdx !== null && activePoint && activePoint.value !== null
      ? { idx: activeIdx, value: activePoint.value, date: activePoint.date }
      : null;

  const gridYs = [0.25, 0.5, 0.75].map((f) => PAD_T + f * (H - PAD_T - PAD_B));

  return (
    <div className="relative mt-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label={label}
        style={{ touchAction: 'pan-y' }}
        onPointerMove={(e) => locate(e.clientX)}
        onPointerDown={(e) => locate(e.clientX)}
        onPointerLeave={() => setActiveIdx(null)}
      >
        {gridYs.map((y, i) => (
          <line
            key={i}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y}
            y2={y}
            stroke="var(--hairline)"
            strokeWidth={1}
            strokeDasharray="3 4"
          />
        ))}
        {loggedVals.length > 0 && (
          <path
            d={d}
            fill="none"
            stroke="var(--gold)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {active && (
          <g>
            <line
              x1={xOf(active.idx)}
              x2={xOf(active.idx)}
              y1={PAD_T - 2}
              y2={H - PAD_B + 2}
              stroke="var(--gold-dim)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <circle
              cx={xOf(active.idx)}
              cy={yOf(active.value)}
              r={3.5}
              fill="var(--gold)"
              stroke="var(--bg)"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>
      {loggedVals.length === 0 && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center text-[12px] text-[color:var(--faint)]">
          {emptyLabel}
        </p>
      )}
      {active && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-center"
          style={{
            left: `${Math.min(82, Math.max(18, (xOf(active.idx) / W) * 100))}%`,
            top: `${Math.min(100, Math.max(40, (yOf(active.value) / H) * 100))}%`,
            transform: 'translate(-50%, -120%)',
            background: 'rgba(8, 7, 4, 0.95)',
            borderColor: 'var(--hairline)',
          }}
        >
          <div className="font-display text-[14px] leading-tight text-[color:var(--gold)]">
            {formatValue(active.value, unit)}
            {unitSuffix(unit) && (
              <span className="ml-0.5 text-[10px] text-[color:var(--muted)]">{unitSuffix(unit)}</span>
            )}
          </div>
          <div className="text-[10px] text-[color:var(--muted)]">{formatDateLong(active.date)}</div>
        </div>
      )}
    </div>
  );
}
