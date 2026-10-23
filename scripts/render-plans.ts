// Renders each reconstructed unit as an SVG plan and writes docs/plans/index.html,
// which puts the reconstruction next to the original CAD sheet with the area check.

import { mkdirSync, writeFileSync } from 'node:fs';
import { glazedArea, polygonArea } from '../src/plan/generator';
import { UNITS } from '../src/plan/units';
import type { Opening, Room, UnitPlan, Vec2, Wall } from '../src/plan/types';

const OUT = new URL('../docs/plans/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const ROOM_FILL: Record<Room['kind'], string> = {
  dry: '#F4EFE6',
  wet: '#DCEBF2',
  outdoor: '#E3EEDC',
  service: '#E9E7E3',
};
const INK = '#26232B';
const GLASS = '#3AA7E0';
const DOOR = '#E0563F';

const f = (n: number) => +n.toFixed(1);
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
const pts = (p: Vec2[]) => p.map((v) => `${f(v.x)},${f(v.y)}`).join(' ');

function frame(w: Wall) {
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const d = { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len };
  const n = { x: -d.y, y: d.x };
  const at = (s: number, t = 0) => add(add(w.a, mul(d, s)), mul(n, t));
  return { len, d, n, at };
}

function centroid(poly: Vec2[]): Vec2 {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const c = p.x * q.y - q.x * p.y;
    a += c;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

function wallSvg(w: Wall, unitCentre: Vec2): string {
  const { len, n, at } = frame(w);
  const half = w.thickness / 2;
  const out: string[] = [];

  // Solid wall pieces between openings; the end pieces overrun by half a thickness to close corners.
  const cuts = [...w.openings].sort((p, q) => p.offset - q.offset);
  let s = -half;
  const pieces: [number, number][] = [];
  for (const o of cuts) {
    pieces.push([s, o.offset]);
    s = o.offset + o.width;
  }
  pieces.push([s, len + half]);

  const style = {
    exterior: `fill="${INK}"`,
    interior: `fill="#55505C"`,
    parapet: `fill="#9C978F"`,
    louvre: `fill="url(#louvre)" stroke="${INK}" stroke-width="12"`,
    glass: `fill="#BFE3F5" stroke="${GLASS}" stroke-width="10"`,
    balustrade: `fill="#BFE3F5" stroke="${GLASS}" stroke-width="10" stroke-dasharray="60 40"`,
  }[w.kind];

  for (const [s0, s1] of pieces) {
    if (s1 - s0 <= 0) continue;
    out.push(`<polygon ${style} points="${pts([at(s0, -half), at(s1, -half), at(s1, half), at(s0, half)])}"/>`);
  }

  for (const o of cuts) out.push(openingSvg(o, w, unitCentre));
  return out.join('\n');
}

function openingSvg(o: Opening, w: Wall, unitCentre: Vec2): string {
  const { d, n, at } = frame(w);
  const half = w.thickness / 2;
  const s0 = o.offset, s1 = o.offset + o.width;
  switch (o.kind) {
    case 'window':
      return [
        `<polygon fill="#fff" stroke="${INK}" stroke-width="8" points="${pts([at(s0, -half), at(s1, -half), at(s1, half), at(s0, half)])}"/>`,
        `<line x1="${f(at(s0).x)}" y1="${f(at(s0).y)}" x2="${f(at(s1).x)}" y2="${f(at(s1).y)}" stroke="${GLASS}" stroke-width="22"/>`,
      ].join('');
    case 'slidingDoor': {
      const mid = (s0 + s1) / 2;
      return [
        `<polygon fill="#fff" stroke="${INK}" stroke-width="8" points="${pts([at(s0, -half), at(s1, -half), at(s1, half), at(s0, half)])}"/>`,
        `<line x1="${f(at(s0, -25).x)}" y1="${f(at(s0, -25).y)}" x2="${f(at(mid + 60, -25).x)}" y2="${f(at(mid + 60, -25).y)}" stroke="${GLASS}" stroke-width="22"/>`,
        `<line x1="${f(at(mid - 60, 25).x)}" y1="${f(at(mid - 60, 25).y)}" x2="${f(at(s1, 25).x)}" y2="${f(at(s1, 25).y)}" stroke="${GLASS}" stroke-width="22"/>`,
      ].join('');
    }
    case 'bayWindow': {
      // Project away from the middle of the unit.
      const mid = at((s0 + s1) / 2);
      const side = (mid.x - unitCentre.x) * n.x + (mid.y - unitCentre.y) * n.y > 0 ? 1 : -1;
      const p = [at(s0, 0), at(s0, side * o.depth), at(s1, side * o.depth), at(s1, 0)];
      return [
        `<polygon fill="#fff" stroke="none" points="${pts([at(s0, -half), at(s1, -half), at(s1, half), at(s0, half)])}"/>`,
        `<polyline fill="#BFE3F5" fill-opacity="0.5" stroke="${GLASS}" stroke-width="30" points="${pts(p)}"/>`,
        `<polyline fill="none" stroke="${INK}" stroke-width="10" points="${pts(p)}"/>`,
      ].join('');
    }
    case 'door': {
      const hingeS = o.hinge === 'a' ? s0 : s1;
      const freeS = o.hinge === 'a' ? s1 : s0;
      const hinge = at(hingeS);
      const free = at(freeS);
      const open = add(hinge, mul(n, o.swingSide * o.width));
      // Sweep direction: cross product of (free - hinge) and (open - hinge) in y-down coordinates.
      const cross = (free.x - hinge.x) * (open.y - hinge.y) - (free.y - hinge.y) * (open.x - hinge.x);
      const sweep = cross > 0 ? 1 : 0;
      const colour = o.role === 'main' ? DOOR : GLASS;
      return [
        `<polygon fill="#fff" stroke="none" points="${pts([at(s0, -half - 2), at(s1, -half - 2), at(s1, half + 2), at(s0, half + 2)])}"/>`,
        `<line x1="${f(hinge.x)}" y1="${f(hinge.y)}" x2="${f(open.x)}" y2="${f(open.y)}" stroke="${colour}" stroke-width="28"/>`,
        `<path d="M ${f(free.x)} ${f(free.y)} A ${o.width} ${o.width} 0 0 ${sweep} ${f(open.x)} ${f(open.y)}" fill="none" stroke="${colour}" stroke-width="10" stroke-dasharray="${o.role === 'main' ? 'none' : '50 30'}"/>`,
      ].join('');
    }
  }
}

function planSvg(u: UnitPlan): string {
  const pad = { l: 1400, r: 1600, t: 1500, b: 1300 };
  const vb = [-pad.l, -pad.t, u.width + pad.l + pad.r, u.depth + pad.t + pad.b];
  const centre = { x: u.width / 2, y: u.depth / 2 };
  const parts: string[] = [];

  parts.push(`<defs>
    <pattern id="louvre" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="80" height="80" fill="#E9E7E3"/><line x1="0" y1="0" x2="0" y2="80" stroke="#8D877F" stroke-width="22"/>
    </pattern>
  </defs>`);
  parts.push(`<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#FBF9F5"/>`);

  // Grid lines with bubbles.
  const gx = u.grid.x, gy = u.grid.y;
  for (const [i, x] of gx.entries()) {
    parts.push(`<line x1="${x}" y1="-1000" x2="${x}" y2="${u.depth + 500}" stroke="#B9B2A6" stroke-width="10" stroke-dasharray="160 60 30 60"/>`);
    parts.push(`<circle cx="${x}" cy="-1180" r="200" fill="#fff" stroke="#8D877F" stroke-width="14"/><text x="${x}" y="-1110" font-size="220" text-anchor="middle" fill="#5E5850">${i + 1}</text>`);
  }
  for (const [i, y] of gy.entries()) {
    parts.push(`<line x1="-1000" y1="${y}" x2="${u.width + 500}" y2="${y}" stroke="#B9B2A6" stroke-width="10" stroke-dasharray="160 60 30 60"/>`);
    parts.push(`<circle cx="-1180" cy="${y}" r="200" fill="#fff" stroke="#8D877F" stroke-width="14"/><text x="-1180" y="${y + 75}" font-size="220" text-anchor="middle" fill="#5E5850">${'ABCDEF'[i]}</text>`);
  }
  // Bay and row dimensions.
  for (let i = 1; i < gx.length; i++) {
    const x0 = gx[i - 1]!, x1 = gx[i]!;
    parts.push(`<line x1="${x0}" y1="-650" x2="${x1}" y2="-650" stroke="#5E5850" stroke-width="10"/><text x="${(x0 + x1) / 2}" y="-720" font-size="200" text-anchor="middle" fill="#5E5850">${x1 - x0}</text>`);
  }
  for (let i = 1; i < gy.length; i++) {
    const y0 = gy[i - 1]!, y1 = gy[i]!;
    parts.push(`<line x1="-650" y1="${y0}" x2="-650" y2="${y1}" stroke="#5E5850" stroke-width="10"/><text x="-720" y="${(y0 + y1) / 2}" font-size="200" text-anchor="middle" fill="#5E5850" transform="rotate(-90 -720 ${(y0 + y1) / 2})">${y1 - y0}</text>`);
  }

  for (const r of u.rooms) parts.push(`<polygon points="${pts(r.polygon)}" fill="${ROOM_FILL[r.kind]}" stroke="#D8D0C2" stroke-width="12" stroke-dasharray="${r.kind === 'service' ? '40 30' : 'none'}"/>`);
  for (const w of u.walls) parts.push(wallSvg(w, centre));

  for (const r of u.rooms) {
    const c = centroid(r.polygon);
    const big = r.kind !== 'service' && polygonArea(r.polygon) > 3e6;
    const fs = big ? 260 : 170;
    const label = r.kind === 'service' ? r.name.replace('AC ledge ', 'AC') : r.name;
    parts.push(`<text x="${f(c.x)}" y="${f(c.y)}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="#3B3640">${label}</text>`);
    if (r.kind !== 'service') parts.push(`<text x="${f(c.x)}" y="${f(c.y + fs * 1.1)}" font-size="${fs * 0.75}" text-anchor="middle" fill="#7A7268">${(polygonArea(r.polygon) / 1e6).toFixed(2)} m²</text>`);
  }

  // Spawn point and view direction.
  const sp = u.spawn.position;
  const a = ((u.spawn.facingDeg - 90) * Math.PI) / 180;
  const cone = (da: number) => ({ x: sp.x + Math.cos(a + da) * 900, y: sp.y + Math.sin(a + da) * 900 });
  parts.push(`<polygon points="${pts([sp, cone(-0.5), cone(0.5)])}" fill="#8B5CF6" fill-opacity="0.25"/><circle cx="${sp.x}" cy="${sp.y}" r="140" fill="#8B5CF6" stroke="#fff" stroke-width="30"/>`);

  // North arrow (plan up = north).
  const nx = u.width + 1000, ny = -900;
  parts.push(`<g transform="rotate(${u.planNorthDeg} ${nx} ${ny})"><polygon points="${nx},${ny - 420} ${nx + 200},${ny + 220} ${nx},${ny + 100} ${nx - 200},${ny + 220}" fill="${INK}"/></g><text x="${nx}" y="${ny + 520}" font-size="240" font-weight="700" text-anchor="middle" fill="${INK}">N</text>`);

  // 1 m scale bar.
  const sx = u.width - 1000, sy = u.depth + 900;
  parts.push(`<rect x="${sx - 1000}" y="${sy}" width="1000" height="90" fill="${INK}"/><rect x="${sx}" y="${sy}" width="1000" height="90" fill="#fff" stroke="${INK}" stroke-width="12"/><text x="${sx}" y="${sy - 70}" font-size="180" text-anchor="middle" fill="#5E5850">0 — 1 — 2 m</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" font-family="Plus Jakarta Sans, Inter, Segoe UI, sans-serif">\n${parts.join('\n')}\n</svg>\n`;
}

function checkTable(u: UnitPlan): string {
  const rows = u.rooms
    .filter((r) => r.countsInUnitArea)
    .map((r) => {
      const m = polygonArea(r.polygon) / 1e6;
      const cad = u.schedule.roomAreasM2[r.id] ?? NaN;
      const ok = Math.abs(m - cad) <= 0.006;
      return `<tr><td>${r.name}</td><td>${m.toFixed(2)}</td><td>${cad.toFixed(2)}</td><td class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'}</td></tr>`;
    });
  const total = u.rooms.filter((r) => r.countsInUnitArea).reduce((s, r) => s + polygonArea(r.polygon) / 1e6, 0);
  const glazing = u.schedule.daylightM2.map(({ group, area }) => {
    let g = 0;
    for (const w of u.walls) for (const o of w.openings) if (o.serves.some((id) => group.includes(id))) g += glazedArea(o) / 1e6;
    const ok = Math.abs(g - area) <= 0.02;
    return `<tr><td>${group.map((id) => u.rooms.find((r) => r.id === id)!.name).join(' + ')}</td><td>${g.toFixed(2)}</td><td>${area.toFixed(2)}</td><td class="${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✗'}</td></tr>`;
  });
  return `<table><thead><tr><th>Room area (m²)</th><th>Model</th><th>CAD</th><th></th></tr></thead><tbody>${rows.join('')}
    <tr class="total"><td>Total</td><td>${total.toFixed(2)}</td><td>${u.schedule.totalM2.toFixed(2)}</td><td>${(total * 10.7639).toFixed(1)} sf</td></tr></tbody></table>
    <table><thead><tr><th>Window glass (m²)</th><th>Model</th><th>CAD</th><th></th></tr></thead><tbody>${glazing.join('')}</tbody></table>`;
}

const cadImage = { A: 'type-a-cad-plan.jpg', B: 'type-b-cad-plan.jpg', B1: 'type-b1-cad-plan.jpg' } as const;
const order = ['A', 'B1', 'B'] as const;

for (const id of order) writeFileSync(new URL(`type-${id.toLowerCase()}.svg`, OUT), planSvg(UNITS[id]));

const sections = order
  .map((id) => {
    const u = UNITS[id];
    return `<section>
      <h2>${u.name} <span>${u.schedule.totalM2} m² · ${u.schedule.totalSqft} sf</span></h2>
      <div class="pair">
        <figure><img src="../reference/${cadImage[id]}" alt="${u.name} CAD sheet"><figcaption>Your CAD sheet</figcaption></figure>
        <figure><img src="type-${id.toLowerCase()}.svg" alt="${u.name} reconstruction"><figcaption>Ruang reconstruction (purple dot = where you start, looking north)</figcaption></figure>
      </div>
      <div class="tables">${checkTable(u)}</div>
    </section>`;
  })
  .join('\n');

writeFileSync(
  new URL('index.html', OUT),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ruang · Floor plan check</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  :root { --ink:#1B1A22; --muted:#6E6878; --bg:#F6F3EE; --card:#fff; --ok:#22C55E; --bad:#FF6B5B; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Plus Jakarta Sans',system-ui,sans-serif; }
  header { padding:40px 48px 8px; }
  header h1 { margin:0; font-size:34px; font-weight:800; letter-spacing:-0.02em; }
  header p { margin:8px 0 0; color:var(--muted); max-width:900px; line-height:1.5; }
  section { margin:28px 48px; background:var(--card); border-radius:20px; padding:28px; box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 30px rgba(40,30,60,.06); }
  h2 { margin:0 0 18px; font-size:24px; } h2 span { font-weight:500; color:var(--muted); font-size:16px; margin-left:10px; }
  .pair { display:grid; grid-template-columns: 1fr 1fr; gap:20px; align-items:start; }
  figure { margin:0; } figure img { width:100%; display:block; border-radius:12px; background:#fff; border:1px solid #ECE6DC; }
  figcaption { font-size:13px; color:var(--muted); margin-top:8px; }
  .tables { display:flex; gap:24px; flex-wrap:wrap; margin-top:20px; align-items:flex-start; }
  table { border-collapse:collapse; font-size:14px; min-width:320px; }
  th { text-align:left; font-weight:700; padding:6px 12px; border-bottom:2px solid #ECE6DC; }
  td { padding:5px 12px; border-bottom:1px solid #F1ECE4; font-variant-numeric:tabular-nums; }
  td.ok { color:var(--ok); font-weight:800; } td.bad { color:var(--bad); font-weight:800; }
  tr.total td { font-weight:800; border-top:2px solid #ECE6DC; }
  @media (max-width: 900px) { .pair { grid-template-columns:1fr; } section, header { margin-left:16px; margin-right:16px; padding-left:16px; padding-right:16px; } }
</style></head><body>
<header><h1>Floor plan reconstruction</h1>
<p>Each unit is rebuilt from the grid dimensions on your CAD sheets. Every room area in the CAD schedule equals its grid-line rectangle, so the walls are placed on the grid lines. Window sizes are set so the glass area matches the daylighting table. Regenerate with <code>npm run render:plans</code>; verify with <code>npm run check:plans</code>.</p></header>
${sections}
</body></html>
`,
);

console.log('Wrote docs/plans/index.html and', order.map((id) => `type-${id.toLowerCase()}.svg`).join(', '));
