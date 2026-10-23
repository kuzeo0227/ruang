// Checks the reconstructed floor plans against the CAD schedules:
//   1. every room area (grid-line polygon) vs the CAD area table
//   2. unit total vs the sales sheet (m2 and sq ft)
//   3. glazed area per room vs the CAD daylighting table
//   4. every opening fits inside its wall and openings don't overlap
// Exits non-zero if anything is off.

import { glazedArea, polygonArea } from '../src/plan/generator';
import { UNITS } from '../src/plan/units';
import type { RoomId } from '../src/plan/types';

const SQFT_PER_M2 = 10.7639;
// The CAD rounds areas to 2 decimals, so allow half a unit in the last place plus float noise.
const AREA_TOL_M2 = 0.006;
const GLAZING_TOL_M2 = 0.02;

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`   FAIL  ${msg}`);
};

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const num = (v: number, d = 2) => v.toFixed(d).padStart(7);

for (const unit of Object.values(UNITS)) {
  console.log(`\n=== ${unit.name}  (${unit.width} x ${unit.depth} mm grid) ===`);
  console.log(`   ${pad('room', 12)} ${'model'.padStart(7)} ${'CAD'.padStart(7)} ${'diff'.padStart(7)}`);

  let total = 0;
  for (const room of unit.rooms) {
    const area = polygonArea(room.polygon) / 1e6;
    if (room.countsInUnitArea) total += area;
    const cad = unit.schedule.roomAreasM2[room.id];
    if (cad === undefined) {
      console.log(`   ${pad(room.id, 12)} ${num(area)} ${'-'.padStart(7)}          (not in strata area)`);
      continue;
    }
    const diff = area - cad;
    const ok = Math.abs(diff) <= AREA_TOL_M2;
    console.log(`   ${pad(room.id, 12)} ${num(area)} ${num(cad)} ${num(diff, 3)}  ${ok ? 'ok' : ''}`);
    if (!ok) fail(`${unit.id} ${room.id}: ${area.toFixed(3)} m2 vs CAD ${cad}`);
  }

  const sqft = total * SQFT_PER_M2;
  console.log(`   ${pad('TOTAL', 12)} ${num(total)} ${num(unit.schedule.totalM2)}   = ${sqft.toFixed(1)} sf (sheet: ${unit.schedule.totalSqft} sf)`);
  if (Math.abs(total - unit.schedule.totalM2) > AREA_TOL_M2) fail(`${unit.id} total ${total.toFixed(3)} vs ${unit.schedule.totalM2}`);
  if (Math.abs(sqft - unit.schedule.totalSqft) > 1.5) fail(`${unit.id} sqft ${sqft.toFixed(1)} vs ${unit.schedule.totalSqft}`);

  console.log(`   daylighting (glazed area of openings, m2):`);
  for (const { group, area } of unit.schedule.daylightM2) {
    const inGroup = (ids: RoomId[]) => ids.some((id) => group.includes(id));
    let glazed = 0;
    for (const w of unit.walls) for (const o of w.openings) if (inGroup(o.serves)) glazed += glazedArea(o) / 1e6;
    const ok = Math.abs(glazed - area) <= GLAZING_TOL_M2;
    console.log(`   ${pad(group.join('+'), 24)} ${num(glazed)} ${num(area)}  ${ok ? 'ok' : ''}`);
    if (!ok) fail(`${unit.id} daylight ${group.join('+')}: ${glazed.toFixed(2)} vs ${area}`);
  }

  for (const w of unit.walls) {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const spans = w.openings.map((o) => [o.offset, o.offset + o.width, o.id] as const).sort((p, q) => p[0] - q[0]);
    for (const [s, e, id] of spans) {
      if (s < w.thickness / 2 || e > len - w.thickness / 2) fail(`${unit.id} ${id} runs past the end of wall ${w.id}`);
    }
    for (let i = 1; i < spans.length; i++) {
      if (spans[i]![0] < spans[i - 1]![1] + 100) fail(`${unit.id} ${spans[i - 1]![2]} and ${spans[i]![2]} overlap on ${w.id}`);
    }
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
