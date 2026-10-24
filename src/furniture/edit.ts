// Pure edits on a list of placements. Items standing on another item move and turn with it.

import type { Placement } from './types';

let counter = 0;
export function newUid(prefix = 'p'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Children of a placement, recursively. */
export function descendants(list: Placement[], uid: string): Placement[] {
  const out: Placement[] = [];
  const walk = (id: string) => {
    for (const p of list) {
      if (p.parent === id) {
        out.push(p);
        walk(p.uid);
      }
    }
  };
  walk(uid);
  return out;
}

/** Move and/or turn a placement; anything standing on it follows. */
export function transform(list: Placement[], uid: string, next: { x?: number; z?: number; y?: number; rot?: number }): Placement[] {
  const p = list.find((q) => q.uid === uid);
  if (!p) return list;
  const x = next.x ?? p.x;
  const z = next.z ?? p.z;
  const y = next.y ?? p.y;
  const rot = next.rot ?? p.rot;
  const dRot = rot - p.rot;
  const dy = y - p.y;
  const cos = Math.cos(dRot);
  const sin = Math.sin(dRot);
  const kids = new Set(descendants(list, uid).map((c) => c.uid));
  return list.map((q) => {
    if (q.uid === uid) return { ...q, x, z, y, rot };
    if (!kids.has(q.uid)) return q;
    // Rotation about +y: (x, z) -> (x cos + z sin, -x sin + z cos).
    const lx = q.x - p.x;
    const lz = q.z - p.z;
    return { ...q, x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos, y: q.y + dy, rot: q.rot + dRot };
  });
}

export function update(list: Placement[], uid: string, patch: Partial<Placement>): Placement[] {
  return list.map((p) => (p.uid === uid ? { ...p, ...patch } : p));
}

/** Remove a placement and everything standing on it. */
export function remove(list: Placement[], uid: string): Placement[] {
  const gone = new Set([uid, ...descendants(list, uid).map((c) => c.uid)]);
  return list.filter((p) => !gone.has(p.uid));
}

/** Hide or show a placement and everything standing on it. */
export function setHidden(list: Placement[], uid: string, hidden: boolean): Placement[] {
  const affected = new Set([uid, ...descendants(list, uid).map((c) => c.uid)]);
  return list.map((p) => (affected.has(p.uid) ? { ...p, hidden } : p));
}

/** Normalise an angle to (-π, π]. */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
