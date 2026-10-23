// Plan view of the unit with the walker's position and view cone. North is up (the balcony side).

import { Map as MapIcon } from 'lucide-react';
import { useMemo } from 'react';
import { UNITS } from '../plan/units';
import type { Wall } from '../plan/types';
import { useStore } from '../state/store';
import { ROOM_NAMES } from './common';

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'solid' | 'glass' | 'rail' | 'low';
  w: number;
}

function wallSegments(w: Wall): Seg[] {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const at = (s: number) => ({ x: w.a.x + ux * s, y: w.a.y + uy * s });
  const seg = (s0: number, s1: number, kind: Seg['kind'], width: number): Seg => {
    const p = at(s0);
    const q = at(s1);
    return { x1: p.x, y1: p.y, x2: q.x, y2: q.y, kind, w: width };
  };
  if (w.kind === 'glass') return [seg(0, len, 'glass', 40)];
  if (w.kind === 'balustrade') return [seg(0, len, 'rail', 40)];
  if (w.kind === 'louvre' || w.kind === 'parapet') return [seg(0, len, 'low', 60)];
  const out: Seg[] = [];
  let s = 0;
  for (const o of [...w.openings].sort((a, b) => a.offset - b.offset)) {
    if (o.offset > s) out.push(seg(s, o.offset, 'solid', w.thickness));
    if (o.kind === 'window' || o.kind === 'bayWindow' || o.kind === 'slidingDoor') out.push(seg(o.offset, o.offset + o.width, 'glass', 40));
    s = o.offset + o.width;
  }
  if (s < len) out.push(seg(s, len, 'solid', w.thickness));
  return out;
}

const ROOM_FILL: Record<string, string> = {
  dry: 'rgba(255,255,255,0.06)',
  wet: 'rgba(255,255,255,0.06)',
  outdoor: 'rgba(255,255,255,0.035)',
  service: 'rgba(255,255,255,0.02)',
};

export function Minimap() {
  const unit = useStore((s) => s.unit);
  const player = useStore((s) => s.player);
  const plan = UNITS[unit];

  const geo = useMemo(() => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const r of plan.rooms)
      for (const p of r.polygon) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
    const pad = 500;
    return {
      viewBox: `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`,
      aspect: (x1 - x0 + 2 * pad) / (y1 - y0 + 2 * pad),
      rooms: plan.rooms.map((r) => ({ id: r.id, kind: r.kind, d: `M${r.polygon.map((p) => `${p.x},${p.y}`).join('L')}Z` })),
      segs: plan.walls.flatMap(wallSegments),
    };
  }, [plan]);

  const px = player.x * 1000;
  const py = player.z * 1000;
  const angle = (-player.yaw * 180) / Math.PI;
  const height = 150;

  return (
    <div className="minimap glass">
      <div className="mm-head">
        <span>{ROOM_NAMES[player.room] ?? 'Outside'}</span>
        <span className="mm-n">
          <MapIcon className="ic" size={13} />N
        </span>
      </div>
      <svg viewBox={geo.viewBox} width={Math.round(height * geo.aspect)} height={height} aria-label="Floor plan">
        {geo.rooms.map((r) => (
          <path key={r.id} d={r.d} fill={r.id === player.room ? 'rgba(56,189,248,0.24)' : ROOM_FILL[r.kind]} />
        ))}
        {geo.segs.map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            strokeWidth={s.w}
            stroke={s.kind === 'solid' ? 'rgba(255,255,255,0.92)' : s.kind === 'low' ? 'rgba(255,255,255,0.45)' : '#7dd3fc'}
            strokeDasharray={s.kind === 'rail' || s.kind === 'low' ? '160 110' : undefined}
            strokeLinecap="butt"
          />
        ))}
        <g transform={`translate(${px} ${py}) rotate(${angle})`}>
          <path d="M0,0 L-1550,-2200 A2700,2700 0 0 1 1550,-2200 Z" fill="url(#mm-cone)" />
          <circle r={280} fill="#fff" stroke="#38bdf8" strokeWidth={120} />
        </g>
        <defs>
          <radialGradient id="mm-cone" cx="0" cy="0" r="2700" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.04" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}
