// Checks the default layouts: every piece inside the unit, no two pieces overlapping, door swings
// and the sliding door's opening kept clear. Prints each style's total.

import { CATALOGUE_BY_ID } from '../src/catalogue/items';
import { STYLE_ORDER } from '../src/catalogue/styles';
import { formatMYR, sizeOf, totalOf } from '../src/furniture/catalogue';
import { defaultLayout } from '../src/furniture/layouts';
import type { Placement } from '../src/furniture/types';
import type { UnitTypeId } from '../src/plan/types';
import { UNITS } from '../src/plan/units';
import { buildShell, floorHeightAt } from '../src/shell/build';

type V = { x: number; z: number };
const corners = (p: Placement, shrink = 0): V[] => {
  const item = CATALOGUE_BY_ID[p.itemId]!;
  const s = sizeOf(item, p.variant);
  const c = Math.cos(p.rot);
  const n = Math.sin(p.rot);
  const hw = s.w / 2 - shrink;
  const hd = s.d / 2 - shrink;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([x, z]) => ({ x: p.x + x! * c + z! * n, z: p.z - x! * n + z! * c }));
};
function overlap(a: V[], b: V[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % 4]!;
      const ax = -(q.z - p.z);
      const az = q.x - p.x;
      const pa = a.map((v) => v.x * ax + v.z * az);
      const pb = b.map((v) => v.x * ax + v.z * az);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}
const inside = (pt: V, poly: V[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.z > pt.z !== b.z > pt.z && pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
};

let problems = 0;
const units: UnitTypeId[] = process.argv.includes('--all') ? ['A', 'B', 'B1'] : ['A'];
for (const unit of units) {
  const plan = UNITS[unit];
  const shell = buildShell(plan);
  for (const style of STYLE_ORDER) {
    const list = defaultLayout(unit, style);
    const bad = (msg: string) => {
      problems++;
      console.error(`✗ ${unit}/${style}: ${msg}`);
    };
    const vertical = (p: Placement) => {
      const item = CATALOGUE_BY_ID[p.itemId]!;
      return [p.y, p.y + sizeOf(item, p.variant).h] as const;
    };
    const solid = list.filter((p) => {
      const cat = CATALOGUE_BY_ID[p.itemId]!.category;
      return !p.parent && cat !== 'rug' && cat !== 'curtains' && cat !== 'ceilingFan' && cat !== 'pendant';
    });
    for (const p of list) {
      const item = CATALOGUE_BY_ID[p.itemId];
      if (!item) {
        bad(`unknown item ${p.itemId}`);
        continue;
      }
      for (const c of corners(p, 0.02)) if (floorHeightAt(shell.spaces, c.x, c.z) === null) bad(`${p.uid} (${item.id}) pokes outside the unit at ${c.x.toFixed(2)}, ${c.z.toFixed(2)}`);
      // Pieces must not reach into a wall: test the footprint against the walls' collision boxes.
      if (item.category !== 'curtains') {
        // Up to a centimetre into a frame or glass partition's collision box is a scribed fit, not a clash.
        const poly = corners(p, 0.011);
        for (const r of shell.collision) {
          const box: V[] = [
            { x: r.x0, z: r.z0 },
            { x: r.x1, z: r.z0 },
            { x: r.x1, z: r.z1 },
            { x: r.x0, z: r.z1 },
          ];
          if (overlap(poly, box)) {
            bad(`${p.uid} (${item.id}) runs into a wall [${r.x0.toFixed(2)}..${r.x1.toFixed(2)}, ${r.z0.toFixed(2)}..${r.z1.toFixed(2)}]`);
            break;
          }
        }
      }
    }
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i]!;
        const b = solid[j]!;
        const [a0, a1] = vertical(a);
        const [b0, b1] = vertical(b);
        if (a1 <= b0 + 0.01 || b1 <= a0 + 0.01) continue;
        // Chairs tuck under their table.
        const cats = new Set([CATALOGUE_BY_ID[a.itemId]!.category, CATALOGUE_BY_ID[b.itemId]!.category]);
        if ((cats.has('diningChair') && cats.has('diningTable')) || (cats.has('taskChair') && cats.has('desk'))) continue;
        if (overlap(corners(a, 0.005), corners(b, 0.005))) bad(`${a.uid} (${a.itemId}) overlaps ${b.uid} (${b.itemId})`);
      }
    }
    // Door swings: a quarter disc from each hinge on the side the leaf opens to.
    for (const d of shell.doors) {
      const r = Math.max(d.closedRect.x1 - d.closedRect.x0, d.closedRect.z1 - d.closedRect.z0);
      const pts: V[] = [];
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * d.maxAngle * d.openSign;
        for (const f of [0.3, 0.6, 0.95]) {
          // The leaf runs along local +x from the hinge; rotationY then the swing turn it into place.
          const ang = d.rotationY + a;
          pts.push({ x: d.hinge[0] + Math.cos(ang) * r * f, z: d.hinge[2] - Math.sin(ang) * r * f });
        }
      }
      for (const p of solid) {
        if (vertical(p)[0] > 2.0) continue;
        const poly = corners(p, 0.01);
        const hit = pts.find((pt) => inside(pt, poly));
        if (hit) bad(`${p.uid} (${p.itemId}) is in the swing of ${d.id}`);
      }
    }
    for (const s of shell.sliders) {
      const [a0, a1] = s.across;
      // The clear opening once the panel has slid away.
      const open = [s.slideSpan[0], s.slideSpan[0] + s.travel];
      // Keep 0.55 m clear in front of the opening on both sides.
      const zone = (sign: number): V[] =>
        s.axis === 'x'
          ? [
              { x: open[0]!, z: sign > 0 ? a1 : a0 - 0.55 },
              { x: open[1]!, z: sign > 0 ? a1 : a0 - 0.55 },
              { x: open[1]!, z: sign > 0 ? a1 + 0.55 : a0 },
              { x: open[0]!, z: sign > 0 ? a1 + 0.55 : a0 },
            ]
          : [];
      for (const p of solid) for (const sgn of [-1, 1]) if (overlap(corners(p), zone(sgn))) bad(`${p.uid} (${p.itemId}) blocks the ${s.id}`);
    }
    console.log(`${unit}/${style}: ${list.length} pieces, ${formatMYR(totalOf(list))}`);
  }
}
console.log(problems ? `${problems} problems` : 'No problems');
process.exit(problems ? 1 : 0);
