// Builds design/ui-mockup/index.html: a static mockup of the Ruang interface for sign-off.
// Item names and prices come from the catalogue, the minimap from the Type A plan data,
// icons from lucide-static (the same set the app will use).

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { CATALOGUE, CATALOGUE_BY_ID } from '../src/catalogue/items';
import { MATERIALS, type MaterialId } from '../src/catalogue/materials';
import { STYLES, STYLE_ORDER } from '../src/catalogue/styles';
import { UNITS } from '../src/plan/units';
import type { Vec2 } from '../src/plan/types';

const require = createRequire(import.meta.url);
const ICON_DIR = join(dirname(require.resolve('lucide-static/package.json')), 'icons');
const OUT = new URL('../design/ui-mockup/index.html', import.meta.url);

function icon(name: string, size = 20, stroke = 2): string {
  return readFileSync(join(ICON_DIR, `${name}.svg`), 'utf8')
    .replace(/<!--.*?-->/gs, '')
    .replace(/width="24"/, `width="${size}"`)
    .replace(/height="24"/, `height="${size}"`)
    .replace(/stroke-width="2"/, `stroke-width="${stroke}"`)
    .replace(/class="[^"]*"/, 'class="ic"')
    .trim();
}

const money = (n: number) => `RM${n.toLocaleString('en-MY')}`;
const swatch = (id: MaterialId) => {
  const m = MATERIALS[id];
  return m.texture ? `background-image:url('../moodboards/swatches/${id}.jpg');background-size:cover` : `background:${m.swatch}`;
};

// ---------- Minimap from the Type A plan ----------
function minimap(): string {
  const u = UNITS.A;
  const k = 0.0175;
  const p = (v: Vec2) => `${(v.x * k).toFixed(1)},${(v.y * k).toFixed(1)}`;
  const rooms = u.rooms
    .filter((r) => r.kind !== 'service')
    .map((r) => `<polygon points="${r.polygon.map(p).join(' ')}" fill="${r.id === 'living' ? 'rgba(56,189,248,.22)' : 'rgba(255,255,255,.05)'}"/>`)
    .join('');
  const walls = u.walls
    .filter((w) => w.kind !== 'balustrade' && w.kind !== 'louvre')
    .map((w) => `<line x1="${(w.a.x * k).toFixed(1)}" y1="${(w.a.y * k).toFixed(1)}" x2="${(w.b.x * k).toFixed(1)}" y2="${(w.b.y * k).toFixed(1)}" stroke="rgba(255,255,255,.85)" stroke-width="${w.kind === 'exterior' ? 2.4 : 1.4}" stroke-linecap="square"/>`)
    .join('');
  const me = { x: 7450 * k, y: 3000 * k };
  return `<svg viewBox="-6 -6 ${u.width * k + 12} ${u.depth * k + 12}" width="${Math.round(u.width * k + 12)}" height="${Math.round(u.depth * k + 12)}">
    ${rooms}${walls}
    <path d="M ${me.x} ${me.y} L ${me.x - 26} ${me.y - 44} A 51 51 0 0 1 ${me.x + 26} ${me.y - 44} Z" fill="rgba(255,255,255,.22)"/>
    <circle cx="${me.x}" cy="${me.y}" r="5.5" fill="#fff" stroke="#38BDF8" stroke-width="2.5"/>
  </svg>`;
}

// ---------- Data pulled from the catalogue ----------
const curtain = CATALOGUE_BY_ID['curtain-custom']!;
const curtainVariant = curtain.variants!.find((v) => v.label === 'Balcony door')!;
const sofas = STYLE_ORDER.map((s) => CATALOGUE.find((i) => i.category === 'sofa' && i.styles[0] === s)!);

const finishDots = (item: typeof curtain, selected = 0) =>
  item.finishes
    .map((f, i) => `<span class="fdot${i === selected ? ' on' : ''}" style="${swatch(f.material)}" title="${MATERIALS[f.material].name}"></span>`)
    .join('');

const keycap = (k: string, label: string) => `<span class="key"><kbd>${k}</kbd>${label}</span>`;

const dock = (active: string) =>
  [
    ['style', 'palette', 'Style'],
    ['furniture', 'sofa', 'Furniture'],
    ['lighting', 'sun', 'Lighting'],
    ['views', 'mountain', 'Views'],
    ['share', 'share-2', 'Share'],
  ]
    .map(([tool, ic, label]) => `<button class="tool t-${tool}${tool === active ? ' active' : ''}"><span class="tool-ic">${icon(ic!, 22)}</span><span class="tool-label">${label}</span></button>`)
    .join('');

const topBar = (styleName: string, viewName: string, total: number, count: number) => `
  <div class="topbar">
    <div class="group">
      <div class="logo glass">${wordmark()}</div>
      <button class="chip glass">${icon('layers-2', 16)}Type A · 900 sf${icon('chevron-down', 14)}</button>
      <button class="chip glass c-style"><i class="dot" style="background:var(--c-style)"></i>${styleName}${icon('chevron-down', 14)}</button>
      <button class="chip glass c-views">${icon('waves', 16)}${viewName}${icon('chevron-down', 14)}</button>
    </div>
    <div class="group">
      <div class="budget glass">${icon('wallet', 16)}<span>${count} items in view</span><b>${money(total)}</b></div>
      <button class="btn glass c-share">${icon('share-2', 16)}Save &amp; share</button>
      <button class="cta">${icon('camera', 16)}Photo mode</button>
    </div>
  </div>`;

function wordmark() {
  return `<span class="mark">R</span><span class="word">Ruang</span>`;
}

const ROOMS = [
  ['Living', true, 70, 2700],
  ['Dining', true, 55, 2700],
  ['Kitchen', false, 100, 4000],
  ['Bedroom 1', true, 30, 2700],
  ['Bedroom 2', false, 100, 3000],
  ['Study', false, 100, 4000],
  ['Toilets', false, 100, 4000],
  ['Balcony', true, 40, 3000],
] as const;

const lightingPanel = `
  <aside class="panel glass p-lighting">
    <header><span class="ptitle">${icon('sun', 18)}Lighting</span><button class="iconbtn">${icon('x', 16)}</button></header>
    <div class="block">
      <div class="row between"><span class="label">Time of day</span><span class="val">${icon('sunset', 16)}17:40</span></div>
      <div class="tod"><div class="tod-track"></div><div class="tod-thumb" style="left:64.8%">${icon('sun', 14)}</div></div>
      <div class="row between tiny"><span>06:00</span><span>Sunrise 7:03 · Sunset 19:07</span><span>24:00</span></div>
    </div>
    <div class="block">
      <div class="row between"><span class="label">Month</span><span class="val small">Sun passes south of overhead</span></div>
      <div class="months">${['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((m, i) => `<span class="${i === 9 ? 'on' : ''}">${m}</span>`).join('')}</div>
    </div>
    <div class="block">
      <div class="row between"><span class="label">Scenes</span></div>
      <div class="scenes"><button class="on">${icon('sunset', 14)}Evening</button><button>${icon('tv', 14)}Movie</button><button>${icon('lightbulb', 14)}All on</button><button>${icon('moon', 14)}All off</button></div>
    </div>
    <div class="block rooms">
      ${ROOMS.map(
        ([name, on, dim, k]) => `<div class="room${on ? ' on' : ''}">
          <span class="rname">${name}</span>
          <div class="dim"><div style="width:${on ? dim : 0}%"></div></div>
          <span class="kelvin" title="${k} K" style="background:${k <= 2700 ? '#FFB46B' : k <= 3000 ? '#FFC98F' : '#FFE9CF'}"></span>
          <span class="switch${on ? ' on' : ''}"><i></i></span>
        </div>`,
      ).join('')}
    </div>
  </aside>`;

const priceCard = `
  <div class="pricecard glass">
    <div class="pc-top"><span class="tag c-furniture">Curtains</span><span class="brand">${curtain.brand}</span></div>
    <h3>${curtain.name}</h3>
    <div class="pc-price"><b>${money(curtainVariant.priceMYR)}</b><span>${curtainVariant.label} · ${(curtainVariant.w / 1000).toFixed(1)} m wide</span></div>
    <div class="pc-fin"><span class="label">Finish</span><div class="fdots">${finishDots(curtain)}</div><span class="fname">${MATERIALS[curtain.finishes[0]!.material].name}</span></div>
    <div class="pc-keys">${keycap('E', 'Pick up')}${keycap('R', 'Rotate')}${keycap('F', 'Finish')}${keycap('C', 'Swap')}${keycap('H', 'Hide')}</div>
  </div>`;

const desktopA = `
<div class="frame desktop" style="background-image:url('img/backdrop-desktop.jpg')">
  ${topBar(STYLES.quietLuxury.name, 'Beach', 86340, 34)}
  <div class="hover-outline" style="left:676px;top:160px;width:224px;height:520px"></div>
  ${priceCard.replace('class="pricecard glass"', 'class="pricecard glass" style="left:356px;top:214px"')}
  <div class="crosshair"><i></i></div>
  ${lightingPanel}
  <div class="minimap glass"><div class="mm-head"><span>Living</span><span class="mm-n">${icon('map', 14)}N</span></div>${minimap()}</div>
  <div class="bottom">
    <div class="modes glass"><button class="on">${icon('footprints', 16)}Walk</button><button>${icon('map', 16)}Plan</button></div>
    <div class="dock glass">${dock('lighting')}</div>
    <div class="hints">${keycap('WASD', 'Move')}${keycap('Mouse', 'Look')}${keycap('Shift', 'Run')}${keycap('Tab', 'Plan')}</div>
  </div>
</div>`;

const CATS = [
  ['sofa', 'Sofas', true],
  ['armchair', 'Chairs', false],
  ['lamp-ceiling', 'Lighting', false],
  ['bed-double', 'Beds', false],
  ['cooking-pot', 'Kitchen', false],
  ['bath', 'Bath', false],
  ['leaf', 'Plants', false],
] as const;

const catalogueDrawer = `
  <aside class="drawer glass p-furniture">
    <header><span class="ptitle">${icon('sofa', 18)}Catalogue</span><button class="iconbtn">${icon('x', 16)}</button></header>
    <div class="search">${icon('search', 16)}<span>Search 148 pieces</span></div>
    <div class="cats">${CATS.map(([ic, label, on]) => `<button class="${on ? 'on' : ''}">${icon(ic, 16)}${label}</button>`).join('')}</div>
    <div class="stylefilter">${STYLE_ORDER.map((s) => `<span class="sf${s === 'quietLuxury' || s === 'muji' ? ' on' : ''}"><i style="background:${STYLES[s].palette.find((p) => p.role === 'accent')!.hex}"></i>${STYLES[s].name.split(' (')[0]!.replace('-inspired Natural', '')}</span>`).join('')}</div>
    <div class="cards">${sofas
      .map(
        (it, i) => `<div class="card${i === 0 ? ' sel' : ''}">
        <div class="thumb" style="${swatch(it.finishes[0]!.material)}"><span class="thumb-ic">${icon('sofa', 34, 1.5)}</span>${i === 4 ? `<span class="badge">${icon('check', 12, 3)}In your living room</span>` : ''}</div>
        <div class="cbody"><b>${it.name}</b><span>${it.brand} · ${(it.size.w / 10).toFixed(0)} cm</span>
        <div class="crow"><div class="fdots">${finishDots(it)}</div><span class="cprice">${money(it.priceMYR)}</span></div></div>
      </div>`,
      )
      .join('')}</div>
    <div class="drawer-foot"><span>Swapping keeps the sofa where it is.</span><button class="cta">${icon('replace', 16)}Swap in Hinata</button></div>
  </aside>`;

const desktopB = `
<div class="frame desktop" style="background-image:url('img/backdrop-desktop.jpg')">
  ${topBar(STYLES.quietLuxury.name, 'Beach', 86340, 34)}
  ${catalogueDrawer}
  <div class="crosshair"><i></i></div>
  <div class="toast glass">${icon('sparkles', 16)}Comparing ${sofas.length} sofas · Hinata is <b>${money(sofas[4]!.priceMYR - sofas[0]!.priceMYR)}</b> less than yours</div>
  <div class="bottom right-shift">
    <div class="modes glass"><button class="on">${icon('footprints', 16)}Walk</button><button>${icon('map', 16)}Plan</button></div>
    <div class="dock glass">${dock('furniture')}</div>
  </div>
</div>`;

const phoneTabs = (active: string) => `<nav class="tabs glass">${dock(active)}</nav>`;

const phoneA = `
<div class="phone"><div class="screen" style="background-image:url('img/backdrop-phone.jpg')">
  <div class="p-top">
    <div class="logo glass small">${wordmark()}</div>
    <div class="budget glass small">${icon('wallet', 14)}<b>${money(86340)}</b></div>
  </div>
  <div class="hover-outline" style="left:240px;top:312px;width:100px;height:212px"></div>
  <div class="crosshair small"><i></i></div>
  <div class="look-hint">${icon('hand', 16)}Drag to look</div>
  <div class="joystick"><div class="knob"></div></div>
  <div class="sheet glass">
    <div class="handle"></div>
    <div class="s-row"><div><span class="tag c-furniture">Curtains</span><h3>${curtain.name}</h3><span class="muted">${curtain.brand} · ${curtainVariant.label}</span></div><b class="s-price">${money(curtainVariant.priceMYR)}</b></div>
    <div class="actions">
      ${[['move', 'Move'], ['rotate-cw', 'Rotate'], ['replace', 'Swap'], ['palette', 'Finish'], ['eye-off', 'Hide']].map(([ic, l]) => `<button>${icon(ic!, 20)}<span>${l}</span></button>`).join('')}
    </div>
  </div>
  ${phoneTabs('furniture')}
</div></div>`;

const VIEWS = [
  ['Rainforest', 'mossy_forest', 'trees', false],
  ['Mountain', 'drakensberg_solitary_mountain', 'mountain', false],
  ['Beach', 'illovo_beach_balcony', 'waves', true],
  ['KL skyline', 'rooftop_night', 'building-2', false],
] as const;

const phoneB = `
<div class="phone"><div class="screen dimmed" style="background-image:url('img/backdrop-phone.jpg')">
  <div class="p-top">
    <div class="logo glass small">${wordmark()}</div>
    <div class="budget glass small">${icon('wallet', 14)}<b>${money(86340)}</b></div>
  </div>
  <div class="sheet tall glass p-views">
    <div class="handle"></div>
    <header><span class="ptitle">${icon('mountain', 18)}Outside the windows</span></header>
    <div class="views">${VIEWS.map(([name, img, ic, on]) => `<div class="view${on ? ' on' : ''}"><img src="../moodboards/views/${img}.jpg" alt=""><span>${icon(ic, 14)}${name}</span></div>`).join('')}</div>
    <div class="block">
      <div class="row between"><span class="label">Time of day</span><span class="val">${icon('sunset', 16)}17:40</span></div>
      <div class="tod"><div class="tod-track"></div><div class="tod-thumb" style="left:64.8%">${icon('sun', 14)}</div></div>
    </div>
    <div class="block">
      <div class="row between"><span class="label">Lights</span><span class="val small">4 of 8 rooms on</span></div>
      <div class="scenes"><button class="on">${icon('sunset', 14)}Evening</button><button>${icon('tv', 14)}Movie</button><button>${icon('moon', 14)}Off</button></div>
    </div>
  </div>
  ${phoneTabs('views')}
</div></div>`;

const componentSheet = `
<div class="sheetgrid">
  <div class="spec"><h4>Tool colours</h4><div class="colors">${[
    ['Style', '--c-style', 'palette'],
    ['Furniture', '--c-furniture', 'sofa'],
    ['Lighting', '--c-lighting', 'sun'],
    ['Views', '--c-views', 'mountain'],
    ['Prices', '--c-price', 'wallet'],
    ['Share', '--c-share', 'share-2'],
  ]
    .map(([n, v, ic]) => `<div class="color"><span style="background:var(${v})">${icon(ic!, 20)}</span><b>${n}</b><code>${v}</code></div>`)
    .join('')}</div></div>
  <div class="spec dark"><h4>Buttons</h4><div class="stack">
    <button class="cta">${icon('camera', 16)}Primary action</button>
    <button class="btn glass c-share">${icon('share-2', 16)}Tool action</button>
    <button class="chip glass c-style"><i class="dot" style="background:var(--c-style)"></i>Selector chip${icon('chevron-down', 14)}</button>
    <div class="row">${keycap('E', 'Key hint')}<span class="switch on"><i></i></span><span class="switch"><i></i></span></div>
  </div></div>
  <div class="spec dark"><h4>Dock states</h4><div class="dock glass">${dock('views')}</div></div>
  <div class="spec"><h4>Type</h4><div class="type"><p style="font-size:28px;font-weight:800">Plus Jakarta Sans 800</p><p style="font-size:18px;font-weight:700">Panel titles 700</p><p style="font-size:14px">Body 400 / 500, tabular figures for prices: <b style="font-variant-numeric:tabular-nums">RM13,999</b></p></div></div>
</div>`;

writeFileSync(
  OUT,
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ruang · Interface mockup</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../src/ui/tokens.css">
<style>
${readFileSync(new URL('../design/ui-mockup/mockup.css', import.meta.url), 'utf8')}
</style></head><body>
<div class="review-head">
  <h1>Ruang <em>interface mockup</em></h1>
  <p>Static mockup for sign-off. The backgrounds are a CC0 panorama (Poly Haven <i>relax_inn_seaview_suite</i>) standing in for the 3D view; item names, prices and the minimap come from the real catalogue and Type A plan. Generated by <code>npm run build:mockup</code>.</p>
</div>
<section><h2><span class="num">1</span>Desktop · walking, looking at a curtain, lighting panel open</h2>${desktopA}</section>
<section><h2><span class="num">2</span>Desktop · catalogue open, comparing sofas across styles</h2>${desktopB}</section>
<section><h2><span class="num">3</span>Phone · joystick to walk, tap to select · and the views sheet</h2><div class="phones">${phoneA}${phoneB}</div></section>
<section><h2><span class="num">4</span>Design language</h2>${componentSheet}</section>
</body></html>
`,
);
console.log('Wrote design/ui-mockup/index.html');
