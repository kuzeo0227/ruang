// Builds the 3D shell for every unit type and checks it: valid geometry, probes inside their
// zones, a clear spawn point, and a walkable path through every doorway.
// Optional: `npm run check:shell -- out.svg` writes a top-down debug drawing.

import { writeFileSync } from 'node:fs';
import { buildShell } from '../src/shell/build';
import { pointInPolygon } from '../src/shell/geom2d';
import type { Rect, ShellData } from '../src/shell/types';
import { UNITS } from '../src/plan/units';

const RADIUS = 0.25;
let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`   FAIL  ${msg}`);
};

const circleHitsRect = (x: number, z: number, r: number, b: Rect) => {
  const cx = Math.max(b.x0, Math.min(x, b.x1));
  const cz = Math.max(b.z0, Math.min(z, b.z1));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
};

function svg(shell: ShellData): string {
  const s = 60;
  const { min, max } = shell.bounds;
  const W = (max[0] - min[0] + 2) * s;
  const H = (max[2] - min[2] + 2) * s;
  const X = (x: number) => (x - min[0] + 1) * s;
  const Z = (z: number) => (z - min[2] + 1) * s;
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="#fff"/>`];
  for (const sp of shell.spaces) {
    parts.push(`<polygon points="${sp.polygon.map((p) => `${X(p.x / 1000)},${Z(p.y / 1000)}`).join(' ')}" fill="#eef4ff" stroke="#9bb" stroke-width="1"/>`);
  }
  for (const r of shell.collision) parts.push(`<rect x="${X(r.x0)}" y="${Z(r.z0)}" width="${(r.x1 - r.x0) * s}" height="${(r.z1 - r.z0) * s}" fill="#333" fill-opacity=".75"/>`);
  for (const d of shell.doors) {
    parts.push(`<rect x="${X(d.closedRect.x0)}" y="${Z(d.closedRect.z0)}" width="${(d.closedRect.x1 - d.closedRect.x0) * s}" height="${(d.closedRect.z1 - d.closedRect.z0) * s}" fill="#e55" fill-opacity=".35"/>`);
    parts.push(`<circle cx="${X(d.hinge[0])}" cy="${Z(d.hinge[2])}" r="4" fill="#e55"/>`);
    const ex = d.hinge[0] + Math.cos(d.rotationY + d.openSign * d.defaultOpen * d.maxAngle) * 0.7;
    const ez = d.hinge[2] - Math.sin(d.rotationY + d.openSign * d.defaultOpen * d.maxAngle) * 0.7;
    parts.push(`<line x1="${X(d.hinge[0])}" y1="${Z(d.hinge[2])}" x2="${X(ex)}" y2="${Z(ez)}" stroke="#e55" stroke-width="3"/>`);
  }
  for (const z of shell.zones) parts.push(`<circle cx="${X(z.probe[0])}" cy="${Z(z.probe[2])}" r="6" fill="#8b5cf6"/><text x="${X(z.probe[0]) + 8}" y="${Z(z.probe[2]) + 4}" font-size="12">${z.id}</text>`);
  parts.push(`<circle cx="${X(shell.spawn.position[0])}" cy="${Z(shell.spawn.position[2])}" r="7" fill="#22c55e"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;
}

for (const unit of Object.values(UNITS)) {
  const t0 = performance.now();
  const shell = buildShell(unit);
  const ms = performance.now() - t0;
  console.log(`\n=== ${unit.name}: ${shell.batches.length} batches, ${Math.round(shell.stats.triangles)} triangles, built in ${ms.toFixed(0)} ms`);
  console.log(`   ${shell.doors.length} doors, ${shell.sliders.length} sliding door(s), ${shell.collision.length} collision boxes, ${shell.zones.length} zones`);

  for (const b of shell.batches) {
    const pos = b.geometry.attributes.position!.array as Float32Array;
    if (pos.some((v) => !Number.isFinite(v))) fail(`${b.zone}/${b.role} has non-finite positions`);
  }
  for (const z of shell.zones) {
    const inside = z.spaces.some((id) => {
      const sp = shell.spaces.find((s) => s.id === id)!;
      return pointInPolygon({ x: z.probe[0] * 1000, y: z.probe[2] * 1000 }, sp.polygon);
    });
    if (!inside) fail(`probe for ${z.id} is outside its rooms`);
    if (shell.collision.some((r) => circleHitsRect(z.probe[0], z.probe[2], 0.05, r))) fail(`probe for ${z.id} is inside a wall`);
  }
  const [sx, , sz] = shell.spawn.position;
  if (shell.collision.some((r) => circleHitsRect(sx, sz, RADIUS, r))) fail('spawn point overlaps a wall');

  // Every swing door must leave room for the walking capsule when open.
  for (const d of shell.doors) {
    const c = d.closedRect;
    const [cx, , cz] = d.centre;
    const blocked = shell.collision.some((r) => circleHitsRect(cx, cz, RADIUS, r));
    if (blocked) fail(`door ${d.id} is blocked for a ${RADIUS} m body`);
    const clear = Math.max(c.x1 - c.x0, c.z1 - c.z0);
    console.log(`   door ${d.id.padEnd(14)} opening ${(clear * 1000).toFixed(0)} mm, ${d.defaultOpen ? 'open' : 'closed'} by default`);
  }
  for (const s of shell.sliders) {
    const free = s.slideSpan[1] - s.slideSpan[0] - 0.05;
    const gap = Math.min(s.travel, free);
    console.log(`   slider ${s.id}: opens ${(gap * 1000).toFixed(0)} mm`);
    if (gap < 2 * RADIUS + 0.05) fail(`slider ${s.id} opening too narrow`);
  }
  // Daylight openings: each must face into an indoor zone, with its corners ordered outwards.
  for (const a of shell.apertures) {
    const c = [a.u[1] * a.v[2] - a.u[2] * a.v[1], a.u[2] * a.v[0] - a.u[0] * a.v[2], a.u[0] * a.v[1] - a.u[1] * a.v[0]];
    if (c[0]! * a.normal[0] + c[1]! * a.normal[1] + c[2]! * a.normal[2] >= 0) fail(`aperture ${a.id} corners are ordered the wrong way`);
    const zone = shell.zones.find((z) => z.id === a.zone);
    if (!zone) fail(`aperture ${a.id} lights an unknown zone ${a.zone}`);
    const centre = [0, 1, 2].map((i) => a.origin[i]! + a.u[i]! / 2 + a.v[i]! / 2 + a.normal[i]! * 0.3);
    const space = shell.spaces.find((sp) => pointInPolygon({ x: centre[0]! * 1000, y: centre[2]! * 1000 }, sp.polygon));
    if (space?.zone !== a.zone) fail(`aperture ${a.id} does not face into ${a.zone}`);
  }
  const perZone = new Map<string, number>();
  for (const d of shell.downlights) perZone.set(d.zone, (perZone.get(d.zone) ?? 0) + 1);
  console.log(`   daylight openings ${shell.apertures.length}; downlights ${[...perZone].map(([z, n]) => `${z} ${n}`).join(', ')}`);
  if ([...perZone.values()].some((n) => n > 8)) fail('a zone has more than 8 downlights (the shader limit)');

  // A light switch by every room's door and inside the front door, on a wall face, in its zone.
  console.log(`   switches ${shell.switches.map((w) => `${w.id.replace('-switch', '')}→${w.rooms.join('+')}`).join(', ')}`);
  for (const d of shell.doors) {
    if (d.role !== 'service' && !shell.switches.some((w) => w.id === `${d.id}-switch`)) fail(`door ${d.id} has no light switch`);
  }
  for (const w of shell.switches) {
    const at = [w.position[0] + w.normal[0] * 0.05, w.position[2] + w.normal[2] * 0.05];
    const space = shell.spaces.find((s) => pointInPolygon({ x: at[0]! * 1000, y: at[1]! * 1000 }, s.polygon));
    if (space?.zone !== w.zone) fail(`switch ${w.id} is not in front of a wall of ${w.zone}`);
    if (shell.collision.some((r) => circleHitsRect(at[0]!, at[1]!, 0.01, r))) fail(`switch ${w.id} sits inside a wall`);
  }

  const roles = new Map<string, number>();
  for (const b of shell.batches) roles.set(b.role, (roles.get(b.role) ?? 0) + b.geometry.attributes.position!.count / 3);
  console.log(`   triangles by role: ${[...roles].map(([r, n]) => `${r} ${n}`).join(', ')}`);

  const out = process.argv[2];
  if (out && unit.id === 'A') writeFileSync(out, svg(shell));
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll shell checks passed.');
process.exit(failures ? 1 : 0);
