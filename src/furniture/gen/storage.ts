// Storage: media units, sideboards and shoe cabinets, bedside tables, wardrobes and shelving.

import { HANDLE, METAL, WOOD, type GenCtx } from './context';

const GAP = 0.004;

/** Door fronts across a span, each a slab slightly proud of the carcass front. */
function doors(g: GenCtx, slot: string, x0: number, x1: number, y0: number, y1: number, zf: number, n: number, opts: { pull?: 'bar' | 'knob' | 'tall' | 'groove' | 'none'; flutes?: boolean } = {}) {
  const dw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * dw + GAP / 2;
    const b = a + dw - GAP;
    if (opts.flutes) {
      // Fluted front: a row of rounded staves.
      const nf = Math.max(3, Math.round((b - a) / 0.03));
      const fw = (b - a) / nf;
      g.P.box(slot, [a, y0, zf - 0.016], [b, y1, zf - 0.008]);
      for (let k = 0; k < nf; k++) g.P.box(slot, [a + k * fw + 0.0015, y0 + 0.002, zf - 0.012], [a + (k + 1) * fw - 0.0015, y1 - 0.002, zf], 0.006);
    } else g.P.box(slot, [a, y0, zf - 0.018], [b, y1, zf], 0.003);
    const handleX = i % 2 === 0 && n > 1 ? b - 0.035 : a + 0.035;
    const ym = (y0 + y1) / 2;
    if (opts.pull === 'bar') g.P.box('pull', [handleX - 0.006, ym - 0.06, zf], [handleX + 0.006, ym + 0.06, zf + 0.02], 0.004);
    else if (opts.pull === 'tall') g.P.box('pull', [handleX - 0.006, ym - 0.25, zf], [handleX + 0.006, ym + 0.25, zf + 0.022], 0.004);
    else if (opts.pull === 'knob') g.P.cyl('pull', handleX, zf + 0.009, ym - 0.015, ym + 0.015, 0.012, 0.012, 12);
    else if (opts.pull === 'groove') g.P.box('shadow', [handleX - 0.004, ym - 0.12, zf - 0.001], [handleX + 0.004, ym + 0.12, zf + 0.001]);
  }
}

function drawers(g: GenCtx, slot: string, x0: number, x1: number, y0: number, y1: number, zf: number, rows: number, cols: number, pull: boolean) {
  const dw = (x1 - x0) / cols;
  const dh = (y1 - y0) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = x0 + c * dw + GAP / 2;
      const b = a + dw - GAP;
      const lo = y0 + r * dh + GAP / 2;
      const hi = lo + dh - GAP;
      g.P.box(slot, [a, lo, zf - 0.018], [b, hi, zf], 0.003);
      if (pull) g.P.box('pull', [(a + b) / 2 - 0.035, (lo + hi) / 2 - 0.006, zf], [(a + b) / 2 + 0.035, (lo + hi) / 2 + 0.006, zf + 0.016], 0.004);
    }
  }
}

export function cabinetLow(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.pull = { mat: HANDLE[style] };
  g.slots.shadow = { mat: 'x-shadow' };
  const wall = g.item.mount === 'wall';
  const plinth = wall ? 0 : style === 'japanese' ? 0.06 : style === 'brutalist' ? 0.07 : 0.05;
  const zf = d / 2;
  // Carcass.
  P.box('main', [-w / 2, plinth, -d / 2], [w / 2, h, zf - 0.018], 0.004);
  if (!wall) {
    if (style === 'japanese' || style === 'muji') {
      for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) for (const z of [-d / 2 + 0.04, d / 2 - 0.06]) P.box('main', [x - 0.02, 0, z - 0.02], [x + 0.02, plinth, z + 0.02]);
    } else P.box('shadow', [-w / 2 + 0.05, 0, -d / 2 + 0.04], [w / 2 - 0.05, plinth, d / 2 - 0.06]);
  }
  const y0 = plinth + 0.004;
  const y1 = h - 0.004;
  const n = Math.max(2, Math.round(w / 0.45));
  if (style === 'japanese') {
    g.slots.pull = { mat: 'steelBlack' };
    drawers(g, 'main', -w / 2, w / 2, y0, y1, zf, h > 0.7 ? 3 : 2, Math.max(2, Math.round(w / 0.6)), true);
  } else if (style === 'quietLuxury') {
    doors(g, 'main', -w / 2, w / 2, y0, y1, zf, n, { pull: 'bar', flutes: true });
  } else if (style === 'brutalist') {
    doors(g, 'main', -w / 2, w / 2, y0, y1, zf, n, { pull: 'groove' });
  } else if (style === 'minimal') {
    doors(g, 'main', -w / 2, w / 2, y0, y1, zf, n, { pull: 'none' });
  } else {
    doors(g, 'main', -w / 2, w / 2, y0, y1, zf, n, { pull: 'knob' });
  }
  g.top = h;
}

export function bedside(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.pull = { mat: HANDLE[style] };
  if (style === 'japanese') {
    P.box('main', [-w / 2, h - 0.025, -d / 2], [w / 2, h, d / 2], 0.004);
    for (const x of [-w / 2 + 0.03, w / 2 - 0.06]) P.box('main', [x, 0, -d / 2 + 0.03], [x + 0.03, h - 0.025, d / 2 - 0.03]);
  } else if (style === 'minimal') {
    P.box('main', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], 0.004);
    g.slots.shadow = { mat: 'x-shadow' };
    P.box('shadow', [-w / 2 + 0.02, h * 0.35, d / 2 - 0.001], [w / 2 - 0.02, h * 0.42, d / 2 + 0.001]);
  } else if (style === 'brutalist') {
    P.box('main', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], 0.01);
    g.slots.shadow = { mat: 'x-shadow' };
    P.box('shadow', [-w / 2 + 0.04, h - 0.12, d / 2 - 0.001], [w / 2 - 0.04, h - 0.11, d / 2 + 0.001]);
  } else {
    const legs = style === 'quietLuxury' ? 0.08 : 0.12;
    if (style === 'quietLuxury') {
      g.slots.top = { mat: 'travertine' };
      P.box('main', [-w / 2, legs, -d / 2], [w / 2, h - 0.02, d / 2 - 0.018], 0.004);
      P.box('top', [-w / 2 - 0.005, h - 0.02, -d / 2 - 0.005], [w / 2 + 0.005, h, d / 2 + 0.005], 0.004);
    } else {
      P.box('main', [-w / 2, legs, -d / 2], [w / 2, h, d / 2 - 0.018], 0.004);
      // Open shelf below the drawer.
      g.slots.shadow = { mat: 'x-shadow' };
      P.box('shadow', [-w / 2 + 0.015, legs + 0.015, d / 2 - 0.0185], [w / 2 - 0.015, legs + (h - legs) * 0.45, d / 2 - 0.017]);
    }
    const dy0 = legs + (h - legs) * (style === 'quietLuxury' ? 0.05 : 0.5);
    P.box('main', [-w / 2 + GAP, dy0, d / 2 - 0.018], [w / 2 - GAP, (style === 'quietLuxury' ? h - 0.024 : h - GAP), d / 2], 0.003);
    P.box('pull', [-0.04, (dy0 + h) / 2 - 0.006, d / 2], [0.04, (dy0 + h) / 2 + 0.006, d / 2 + 0.016], 0.004);
    for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) for (const z of [-d / 2 + 0.03, d / 2 - 0.05]) P.cyl('main', x, z, 0, legs, 0.012, 0.016, 12);
  }
  g.top = h;
}

export function wardrobe(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.pull = { mat: HANDLE[style] };
  g.slots.shadow = { mat: 'x-shadow' };
  const plinth = 0.08;
  const zf = d / 2;
  const n = Math.max(2, Math.round(w / 0.5));
  if (style === 'japanese') {
    // Shoji sliding doors: a timber grid over paper.
    g.slots.frame = { mat: g.finish === 'washi' ? 'hinoki' : g.finish };
    g.slots.paper = { mat: 'washi' };
    P.box('frame', [-w / 2, 0, -d / 2], [w / 2, h, zf - 0.04], 0.004);
    const panels = Math.max(2, Math.round(w / 0.9));
    const pw = w / panels;
    for (let i = 0; i < panels; i++) {
      const a = -w / 2 + i * pw;
      const zz = zf - (i % 2 === 0 ? 0.022 : 0.002);
      P.box('paper', [a + 0.03, plinth + 0.03, zz - 0.006], [a + pw - 0.03, h - 0.05, zz - 0.004]);
      P.box('frame', [a, plinth, zz - 0.02], [a + 0.03, h - 0.02, zz]);
      P.box('frame', [a + pw - 0.03, plinth, zz - 0.02], [a + pw, h - 0.02, zz]);
      P.box('frame', [a, plinth, zz - 0.02], [a + pw, plinth + 0.03, zz]);
      P.box('frame', [a, h - 0.05, zz - 0.02], [a + pw, h - 0.02, zz]);
      for (let k = 1; k < 4; k++) P.box('frame', [a + (pw * k) / 4 - 0.005, plinth + 0.03, zz - 0.012], [a + (pw * k) / 4 + 0.005, h - 0.05, zz - 0.004]);
      for (let k = 1; k < 8; k++) {
        const y = plinth + 0.03 + ((h - 0.08 - plinth) * k) / 8;
        P.box('frame', [a + 0.03, y - 0.005, zz - 0.012], [a + pw - 0.03, y + 0.005, zz - 0.004]);
      }
    }
    g.top = h;
    return;
  }
  P.box('main', [-w / 2, plinth, -d / 2], [w / 2, h, zf - 0.02], 0.004);
  P.box('shadow', [-w / 2 + 0.02, 0, -d / 2 + 0.02], [w / 2 - 0.02, plinth, zf - 0.06]);
  if (style === 'quietLuxury') doors(g, 'main', -w / 2, w / 2, plinth + 0.004, h - 0.004, zf, n, { pull: 'tall', flutes: g.finish !== 'glassFluted' });
  else if (style === 'brutalist') doors(g, 'main', -w / 2, w / 2, plinth + 0.004, h - 0.004, zf, n, { pull: 'groove' });
  else if (style === 'minimal') doors(g, 'main', -w / 2, w / 2, plinth + 0.004, h - 0.004, zf, n, { pull: 'none' });
  else doors(g, 'main', -w / 2, w / 2, plinth + 0.004, h - 0.004, zf, n, { pull: 'knob' });
  g.top = h;
}

export function shelf(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  if (style === 'minimal') {
    // Wall shelf system: floating shelves, brackets hidden.
    const n = 4;
    for (let i = 0; i < n; i++) {
      const y = (h * i) / (n - 1);
      P.box('main', [-w / 2, y, -d / 2], [w / 2, y + 0.025, d / 2], 0.002);
    }
    g.top = h;
    return;
  }
  const shelves = Math.max(3, Math.round(h / 0.36));
  const t = 0.022;
  if (style === 'quietLuxury') {
    g.slots.metal = { mat: 'brassBrushed' };
    for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) P.cyl('metal', x, z, 0, h, 0.008, 0.008, 12);
    for (let i = 0; i < shelves; i++) {
      const y = 0.05 + ((h - 0.08) * i) / (shelves - 1);
      P.box('main', [-w / 2, y, -d / 2], [w / 2, y + t, d / 2], 0.003);
    }
  } else {
    for (const x of [-w / 2, w / 2 - t]) {
      if (style === 'japanese') {
        // Lattice side panels.
        P.box('main', [x, 0, -d / 2], [x + t, 0.03, d / 2]);
        P.box('main', [x, h - 0.03, -d / 2], [x + t, h, d / 2]);
        for (const z of [-d / 2, d / 2 - 0.03]) P.box('main', [x, 0, z], [x + t, h, z + 0.03]);
        for (let k = 1; k < 9; k++) {
          const y = (h * k) / 9;
          P.box('main', [x + 0.005, y - 0.004, -d / 2 + 0.03], [x + t - 0.005, y + 0.004, d / 2 - 0.03]);
        }
        P.box('main', [x + 0.005, 0.03, -0.004], [x + t - 0.005, h - 0.03, 0.004]);
      } else P.box('main', [x, 0, -d / 2], [x + t, h, d / 2], 0.003);
    }
    for (let i = 0; i < shelves; i++) {
      const y = i === 0 ? 0.04 : ((h - t) * i) / (shelves - 1);
      P.box('main', [-w / 2 + t, y, -d / 2 + 0.005], [w / 2 - t, y + t, d / 2], 0.002);
    }
    if (style === 'muji') P.box('main', [-w / 2 + t, 0.04, -d / 2], [w / 2 - t, h, -d / 2 + 0.006]);
  }
  g.top = h;
  void WOOD;
  void METAL;
}
