// Builds design/moodboards/index.html from the style packs, material library and catalogue,
// so the mood boards show exactly what the 3D scenes will use.

import { writeFileSync } from 'node:fs';
import { CATALOGUE } from '../src/catalogue/items';
import { MATERIALS, type MaterialId } from '../src/catalogue/materials';
import { STYLES, STYLE_ORDER, type StylePack } from '../src/catalogue/styles';
import type { CatalogueItem } from '../src/catalogue/types';

const OUT = new URL('../design/moodboards/index.html', import.meta.url);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n: number) => `RM${n.toLocaleString('en-MY')}`;

/** Approximate sRGB colour of a blackbody light (Tanner Helland's fit). */
function kelvinToHex(k: number): string {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function swatchStyle(id: MaterialId): string {
  const m = MATERIALS[id];
  if (m.texture) return `background-image:url('swatches/${id}.jpg');background-size:cover`;
  if (m.family === 'metal') return `background:linear-gradient(135deg, ${m.swatch} 0%, color-mix(in srgb, ${m.swatch} 70%, white) 42%, ${m.swatch} 68%, color-mix(in srgb, ${m.swatch} 88%, black) 100%)`;
  if (m.family === 'glass') return `background:linear-gradient(135deg, ${m.swatch}, #ffffff 60%, ${m.swatch})`;
  return `background:${m.swatch}`;
}

const tile = (id: MaterialId, label = MATERIALS[id].name) =>
  `<figure class="tile"><div class="tex" style="${swatchStyle(id)}"></div><figcaption>${esc(label)}</figcaption></figure>`;
const chip = (id: MaterialId) => `<span class="chip" title="${esc(MATERIALS[id].name)}" style="${swatchStyle(id)}"></span>`;

const KEY_CATEGORIES: CatalogueItem['category'][] = ['sofa', 'loungeChair', 'coffeeTable', 'diningTable', 'diningChair', 'pendant', 'bedQueen', 'wardrobe'];

function styleSection(s: StylePack): string {
  const own = CATALOGUE.filter((i) => i.styles.length === 1 && i.styles[0] === s.id);
  const total = own.reduce((t, i) => t + i.priceMYR, 0);
  const keys = KEY_CATEGORIES.map((c) => own.find((i) => i.category === c)!).filter(Boolean);
  const accent = s.palette.find((p) => p.role === 'accent')!.hex;
  const bg = s.palette[0]!.hex;

  const shellRows: [string, MaterialId | string][] = [
    ['Living / dining floor', s.shell.floor],
    ['Bedroom floor', s.shell.bedroomFloor],
    ['Toilets & yard', s.shell.wetFloor],
    ['Walls', s.shell.wallPaint],
    ...(s.shell.featureWall ? ([['Feature wall', s.shell.featureWall]] as [string, MaterialId][]) : []),
    ['Ceiling', s.shell.ceiling],
    ['Doors', s.shell.doors],
    ['Window frames', s.shell.windowFrames],
    ['Kitchen fronts', s.shell.kitchenFronts],
    ['Worktop', s.shell.worktop],
  ];

  return `<section class="board" id="${s.id}" style="--bg:${bg};--accent:${accent}">
  <header class="board-head">
    <div>
      <p class="eyebrow">${esc(s.brand)} · price tier ${s.tier.toFixed(2)} of 2</p>
      <h2>${esc(s.name)}</h2>
      <p class="tagline">${esc(s.tagline)}</p>
    </div>
    <div class="stats">
      <div><span>Sofa</span><b>${money(keys.find((k) => k.category === 'sofa')!.priceMYR)}</b></div>
      <div><span>Queen bed</span><b>${money(keys.find((k) => k.category === 'bedQueen')!.priceMYR)}</b></div>
      <div><span>${own.length} key pieces</span><b>${money(total)}</b></div>
    </div>
  </header>

  <div class="palette">${s.palette
    .map((p) => `<div class="sw" style="background:${p.hex};color:${luma(p.hex) > 150 ? '#1B1A22' : '#fff'}"><b>${esc(p.name)}</b><span>${p.hex} · ${p.role}</span></div>`)
    .join('')}</div>

  <div class="grid">
    <div class="card">
      <h3>Materials</h3>
      <div class="tiles">${s.keyMaterials.map((id) => tile(id)).join('')}</div>
    </div>
    <div class="card">
      <h3>The shell</h3>
      <table class="shell">${shellRows
        .map(([label, v]) => {
          const isMat = v in MATERIALS;
          const sw = isMat ? chip(v as MaterialId) : `<span class="chip" style="background:${v}"></span>`;
          return `<tr><td>${label}</td><td>${sw}${esc(isMat ? MATERIALS[v as MaterialId].name : `Paint ${v}`)}</td></tr>`;
        })
        .join('')}
        <tr><td>Room lights</td><td><span class="chip glow" style="background:${kelvinToHex(s.lightKelvin)}"></span>${s.lightKelvin} K</td></tr>
      </table>
    </div>
    <div class="card wide">
      <h3>Key pieces</h3>
      <ul class="pieces">${keys
        .map(
          (i) => `<li><div><b>${esc(i.name)}</b><span>${i.size.w} × ${i.size.d} × ${i.size.h} mm · ${i.model.kind === 'polyhaven' ? 'Poly Haven scan' : 'parametric model'}</span></div><div class="fin">${i.finishes
            .map((f) => chip(f.material))
            .join('')}</div><div class="price">${money(i.priceMYR)}</div></li>`,
        )
        .join('')}</ul>
    </div>
    <div class="card wide principles">
      <h3>Principles</h3>
      <ul>${s.principles.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <p class="src">Sources: ${s.sources.map((x) => `<a href="${x.url}">${esc(x.title)}</a>`).join(' · ')}</p>
    </div>
  </div>
</section>`;
}

function luma(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r! + 0.587 * g! + 0.114 * b!;
}

const VIEWS = [
  {
    name: 'Rainforest',
    level: 'Level 5 · about 15 m up, among the trees\' middle layer',
    plan: 'Rendered by us in Blender (tropical trees are missing from the CC0 libraries). Rendered at several times of day; close trees as 3D cards so they shift as you walk.',
    refs: ['mossy_forest', 'forest_slope'],
    refNote: 'Lighting reference only (temperate forest)',
  },
  {
    name: 'Mountain',
    level: 'Level 12 on a hillside, looking across a valley',
    plan: 'Poly Haven HDRI with the sky cut out, under our computed sky; mist layers for depth.',
    refs: ['drakensberg_solitary_mountain', 'table_mountain_1', 'fouriesburg_mountain_lookout'],
    refNote: 'Candidates (CC0)',
  },
  {
    name: 'Beach',
    level: 'Level 10 · about 30 m up',
    plan: 'Poly Haven HDRI shot from a balcony, plus an animated sea surface and palms in front.',
    refs: ['illovo_beach_balcony', 'secluded_beach'],
    refNote: 'Candidates (CC0)',
  },
  {
    name: 'KL skyline',
    level: 'Level 38 · about 115 m up',
    plan: 'Rendered by us in Blender: towers with lit windows at night, haze by day. References show the light we are matching.',
    refs: ['rooftop_day', 'rooftop_night', 'modern_buildings_night'],
    refNote: 'Lighting references (CC0)',
  },
];

const viewsSection = `<section class="board views" id="views" style="--bg:#F3F6F8;--accent:#38BDF8">
  <header class="board-head"><div><p class="eyebrow">Outside the windows</p><h2>Four views</h2>
  <p class="tagline">The balcony faces north. KL sits at 3°N, so the sun passes north of overhead from about April to August and south of it the rest of the year.</p></div></header>
  <div class="grid">${VIEWS.map(
    (v) => `<div class="card wide view"><h3>${v.name}</h3><p class="lvl">${v.level}</p><p>${v.plan}</p>
    <div class="refs">${v.refs.map((r) => `<figure><img src="views/${r}.jpg" alt="${r}"><figcaption>${r}</figcaption></figure>`).join('')}</div><p class="src">${v.refNote}</p></div>`,
  ).join('')}</div>
</section>`;

const nav = STYLE_ORDER.map((id) => `<a href="#${id}" style="--c:${STYLES[id].palette.find((p) => p.role === 'accent')!.hex}">${esc(STYLES[id].name.split(' (')[0]!)}</a>`).join('') + `<a href="#views" style="--c:#38BDF8">Views</a>`;

writeFileSync(
  OUT,
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ruang · Style mood boards</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root { --ink:#1B1A22; --muted:#6E6878; --page:#FAF8F5; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--page); color:var(--ink); font-family:'Plus Jakarta Sans',system-ui,sans-serif; }
  .top { padding:44px 48px 16px; }
  .top h1 { margin:0; font-size:40px; font-weight:800; letter-spacing:-0.03em; }
  .top h1 em { font-style:normal; background:linear-gradient(90deg,#FF6B5B,#EC4899,#8B5CF6); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .top p { color:var(--muted); max-width:820px; line-height:1.55; margin:10px 0 0; }
  nav { position:sticky; top:0; z-index:5; display:flex; gap:8px; flex-wrap:wrap; padding:14px 48px; background:color-mix(in srgb, var(--page) 85%, transparent); backdrop-filter:blur(12px); }
  nav a { text-decoration:none; color:var(--ink); font-weight:700; font-size:14px; padding:8px 14px; border-radius:999px; background:#fff; box-shadow:inset 0 0 0 2px var(--c); }
  nav a:hover { background:var(--c); color:#fff; }
  .board { margin:24px 48px 40px; padding:32px; border-radius:28px; background:var(--bg); box-shadow:0 1px 2px rgba(0,0,0,.05), 0 12px 40px rgba(40,30,60,.08); }
  .board-head { display:flex; justify-content:space-between; gap:24px; align-items:flex-end; flex-wrap:wrap; }
  .eyebrow { margin:0; font-size:12px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--accent); }
  h2 { margin:6px 0 4px; font-size:34px; letter-spacing:-0.02em; }
  .tagline { margin:0; color:var(--muted); max-width:640px; line-height:1.5; }
  .stats { display:flex; gap:10px; flex-wrap:wrap; }
  .stats div { background:#ffffffc0; border-radius:16px; padding:10px 16px; min-width:120px; }
  .stats span { display:block; font-size:12px; color:var(--muted); } .stats b { font-size:20px; }
  .palette { display:grid; grid-template-columns:repeat(6,1fr); gap:0; margin:24px 0; border-radius:18px; overflow:hidden; box-shadow:0 0 0 1px #0000001a, 0 6px 20px #0000000f; }
  .sw { height:110px; padding:12px; display:flex; flex-direction:column; justify-content:flex-end; }
  .sw b { font-size:14px; } .sw span { font-size:11px; opacity:.75; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .card { background:#ffffffd9; border-radius:20px; padding:20px; }
  .card.wide { grid-column:span 2; }
  h3 { margin:0 0 14px; font-size:15px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
  .tiles { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  .tile { margin:0; } .tex { aspect-ratio:1; border-radius:14px; box-shadow:inset 0 0 0 1px #0001; }
  .tile figcaption { font-size:12px; margin-top:6px; font-weight:600; }
  table.shell { width:100%; border-collapse:collapse; font-size:14px; }
  .shell td { padding:6px 0; border-bottom:1px solid #0000000d; } .shell td:first-child { color:var(--muted); width:42%; }
  .chip { display:inline-block; width:22px; height:22px; border-radius:7px; vertical-align:middle; margin-right:8px; box-shadow:inset 0 0 0 1px #0002; background-size:cover; }
  .chip.glow { box-shadow:0 0 14px 4px currentColor; border-radius:50%; }
  .pieces { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:4px 28px; }
  .pieces li { display:grid; grid-template-columns:1fr auto auto; gap:12px; align-items:center; padding:10px 0; border-bottom:1px solid #0000000d; }
  .pieces b { display:block; font-size:15px; } .pieces span { font-size:12px; color:var(--muted); }
  .fin .chip { width:18px; height:18px; margin-right:4px; border-radius:50%; }
  .price { font-weight:800; font-variant-numeric:tabular-nums; color:var(--ink); background:color-mix(in srgb, #22C55E 16%, white); padding:4px 10px; border-radius:999px; font-size:14px; }
  .principles ul { margin:0; padding-left:18px; line-height:1.7; }
  .src { font-size:12px; color:var(--muted); margin:12px 0 0; } .src a { color:inherit; }
  .view p { margin:6px 0; line-height:1.5; } .lvl { font-weight:700; color:#0E7490; }
  .refs { display:flex; gap:10px; margin-top:10px; flex-wrap:wrap; } .refs figure { margin:0; } .refs img { width:220px; border-radius:12px; display:block; }
  .refs figcaption { font-size:11px; color:var(--muted); margin-top:4px; }
  @media (max-width:900px) {
    .top, nav { padding-left:16px; padding-right:16px; }
    .board { margin:16px; padding:18px; }
    .grid, .pieces { grid-template-columns:1fr; } .card.wide { grid-column:auto; }
    .palette { grid-template-columns:repeat(3,1fr); } .tiles { grid-template-columns:repeat(2,1fr); }
  }
</style></head><body>
<div class="top"><h1>Ruang <em>style mood boards</em></h1>
<p>Five style packs for the 3D walkthrough. Every swatch is the actual CC0 texture the renderer will use, tinted the way the renderer tints it. Prices are dummy values placed in real Malaysian retail bands (see docs/pricing.md). Generated by <code>npm run build:moodboards</code>.</p></div>
<nav>${nav}</nav>
${STYLE_ORDER.map((id) => styleSection(STYLES[id])).join('\n')}
${viewsSection}
</body></html>
`,
);
console.log('Wrote design/moodboards/index.html');
