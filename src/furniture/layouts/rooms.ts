// Room geometry for the default layouts: each room's interior faces in metres (its grid-line
// outline moved in by half the thickness of the wall on each side) and where its openings are.
// Layouts are written against these, so the same recipe fits Types A, B and B1.

import type { RoomId, UnitPlan } from '../../plan/types';

/** Interior faces of a room's bounding box, metres (x east, z south). */
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const MM = 0.001;

export function roomBoxes(plan: UnitPlan): Partial<Record<RoomId, Box>> {
  const out: Partial<Record<RoomId, Box>> = {};
  for (const room of plan.rooms) {
    const xs = room.polygon.map((p) => p.x);
    const ys = room.polygon.map((p) => p.y);
    const bx0 = Math.min(...xs);
    const bx1 = Math.max(...xs);
    const by0 = Math.min(...ys);
    const by1 = Math.max(...ys);
    // Half the thickness of the wall that covers most of a side (0 where the side is open).
    const inset = (axis: 'x' | 'y', at: number, lo: number, hi: number) => {
      let best = 0;
      let bestLen = 0;
      for (const w of plan.walls) {
        const onLine = axis === 'x' ? w.a.x === at && w.b.x === at : w.a.y === at && w.b.y === at;
        if (!onLine) continue;
        const a = axis === 'x' ? Math.min(w.a.y, w.b.y) : Math.min(w.a.x, w.b.x);
        const b = axis === 'x' ? Math.max(w.a.y, w.b.y) : Math.max(w.a.x, w.b.x);
        const len = Math.min(b, hi) - Math.max(a, lo);
        if (len > bestLen) {
          bestLen = len;
          best = w.thickness / 2;
        }
      }
      return best;
    };
    out[room.id] = {
      x0: (bx0 + inset('x', bx0, by0, by1)) * MM,
      x1: (bx1 - inset('x', bx1, by0, by1)) * MM,
      z0: (by0 + inset('y', by0, bx0, bx1)) * MM,
      z1: (by1 - inset('y', by1, bx0, bx1)) * MM,
    };
  }
  return out;
}

/** An opening's two jambs along its wall, metres. */
export interface Span {
  a: { x: number; z: number };
  b: { x: number; z: number };
  mid: { x: number; z: number };
  width: number;
}

export function openingSpan(plan: UnitPlan, id: string): Span | null {
  for (const w of plan.walls) {
    const o = w.openings.find((op) => op.id === id);
    if (!o) continue;
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const at = (d: number) => ({ x: (w.a.x + ((w.b.x - w.a.x) * d) / len) * MM, z: (w.a.y + ((w.b.y - w.a.y) * d) / len) * MM });
    const a = at(o.offset);
    const b = at(o.offset + o.width);
    return { a, b, mid: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, width: o.width * MM };
  }
  return null;
}
