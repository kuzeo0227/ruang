// 2D helpers for axis-aligned plan geometry (millimetres, x east, y south).

import type { Vec2 } from '../plan/types';

export type Interval = [number, number];

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Where the line `axis = at` crosses a rectilinear polygon, as intervals along the other axis.
 * axis 'y' means the horizontal line y = at; the result is x intervals.
 */
export function scanIntervals(poly: Vec2[], axis: 'x' | 'y', at: number): Interval[] {
  const hits: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const [a0, b0, a1, b1] = axis === 'y' ? [a.y, b.y, a.x, b.x] : [a.x, b.x, a.y, b.y];
    if ((a0 <= at && at < b0) || (b0 <= at && at < a0)) hits.push(a1 + ((at - a0) / (b0 - a0)) * (b1 - a1));
  }
  hits.sort((p, q) => p - q);
  const out: Interval[] = [];
  for (let i = 0; i + 1 < hits.length; i += 2) if (hits[i + 1]! - hits[i]! > 1e-6) out.push([hits[i]!, hits[i + 1]!]);
  return out;
}

export function clipIntervals(list: Interval[], lo: number, hi: number): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of list) {
    const s = Math.max(a, lo);
    const e = Math.min(b, hi);
    if (e - s > 1e-6) out.push([s, e]);
  }
  return out;
}

/** `from` minus every interval in `cuts`. */
export function subtractIntervals(from: Interval[], cuts: Interval[]): Interval[] {
  let cur = from.map((i) => [...i] as Interval);
  for (const [c0, c1] of cuts) {
    const next: Interval[] = [];
    for (const [a, b] of cur) {
      if (c1 <= a || c0 >= b) next.push([a, b]);
      else {
        if (c0 > a) next.push([a, c0]);
        if (c1 < b) next.push([c1, b]);
      }
    }
    cur = next;
  }
  return cur.filter(([a, b]) => b - a > 1e-6);
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const c = p.x * q.y - q.x * p.y;
    a += c;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function polygonBounds(polys: Vec2[][]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  return { x0, y0, x1, y1 };
}
