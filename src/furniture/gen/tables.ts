// Tables: coffee, side, dining, desks and dressers.

import { HANDLE, METAL, type GenCtx } from './context';

function fourLegs(g: GenCtx, slot: string, w: number, d: number, inset: number, y1: number, size: number, round = false) {
  for (const x of [-w / 2 + inset, w / 2 - inset]) {
    for (const z of [-d / 2 + inset, d / 2 - inset]) {
      if (round) g.P.cyl(slot, x, z, 0, y1, size / 2 * 0.8, size / 2, 14);
      else g.P.box(slot, [x - size / 2, 0, z - size / 2], [x + size / 2, y1, z + size / 2], 0.003);
    }
  }
}

export function coffeeTable(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  const round = Math.abs(w - d) < 0.05;
  if (style === 'quietLuxury') {
    g.slots.plinth = { mat: 'x-shadow' };
    P.box('plinth', [-w / 2 + 0.1, 0, -d / 2 + 0.1], [w / 2 - 0.1, 0.035, d / 2 - 0.1]);
    P.box('main', [-w / 2, 0.035, -d / 2], [w / 2, h, d / 2], 0.025);
  } else if (style === 'japanese' && round) {
    P.cyl('main', 0, 0, h - 0.03, h, w / 2, w / 2, 56);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const r = w * 0.3;
      P.box('main', [Math.sin(a) * r - 0.02, 0, Math.cos(a) * r - 0.02], [Math.sin(a) * r + 0.02, h - 0.03, Math.cos(a) * r + 0.02]);
    }
  } else if (style === 'minimal') {
    g.slots.frame = { mat: 'steelBlack' };
    const table = (cx: number, cz: number, tw: number, td: number, th: number) => {
      P.box('main', [cx - tw / 2, th - 0.018, cz - td / 2], [cx + tw / 2, th, cz + td / 2], 0.003);
      for (const x of [cx - tw / 2 + 0.02, cx + tw / 2 - 0.02]) {
        for (const z of [cz - td / 2 + 0.02, cz + td / 2 - 0.02]) P.box('frame', [x - 0.008, 0, z - 0.008], [x + 0.008, th - 0.018, z + 0.008]);
      }
    };
    table(-w * 0.12, -d * 0.05, w * 0.76, d * 0.9, h);
    table(w * 0.24, d * 0.12, w * 0.5, d * 0.7, h * 0.82);
  } else {
    // Oak top, square legs and a lower shelf.
    P.box('main', [-w / 2, h - 0.03, -d / 2], [w / 2, h, d / 2], 0.004);
    fourLegs(g, 'main', w, d, 0.04, h - 0.03, 0.045);
    P.box('main', [-w / 2 + 0.06, 0.09, -d / 2 + 0.06], [w / 2 - 0.06, 0.11, d / 2 - 0.06], 0.002);
  }
}

export function sideTable(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  if (style === 'brutalist') {
    P.box('main', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], 0.012);
  } else if (style === 'minimal') {
    P.cyl('main', 0, 0, h - 0.02, h, w / 2, w / 2, 48);
    P.cyl('main', 0, 0, 0.015, h - 0.02, 0.022, 0.022, 16);
    P.cyl('main', 0, 0, 0, 0.015, w * 0.36, w * 0.36, 40);
  } else if (style === 'quietLuxury') {
    g.slots.metal = { mat: 'brassBrushed' };
    P.cyl('main', 0, 0, h - 0.025, h, w / 2, w / 2, 56);
    P.lathe('metal', 0, 0, [
      [w * 0.3, 0],
      [w * 0.3, 0.012],
      [w * 0.09, 0.05],
      [w * 0.06, h * 0.5],
      [w * 0.1, h - 0.06],
      [w * 0.24, h - 0.025],
    ]);
  } else {
    P.box('main', [-w / 2, h - 0.025, -d / 2], [w / 2, h, d / 2], 0.004);
    P.box('main', [-w / 2 + 0.03, 0.2, -d / 2 + 0.03], [w / 2 - 0.03, 0.22, d / 2 - 0.03]);
    fourLegs(g, 'main', w, d, 0.025, h - 0.025, 0.035);
  }
}

export function diningTable(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  if (style === 'brutalist') {
    g.slots.leg = { mat: g.finish === 'walnut' ? 'concreteDark' : g.finish };
    P.box('main', [-w / 2, h - 0.05, -d / 2], [w / 2, h, d / 2], 0.006);
    for (const x of [-w / 2 + 0.25, w / 2 - 0.33]) P.box('leg', [x, 0, -d / 2 + 0.08], [x + 0.08, h - 0.05, d / 2 - 0.08], 0.004);
  } else if (style === 'quietLuxury') {
    P.box('main', [-w / 2, h - 0.04, -d / 2], [w / 2, h, d / 2], 0.01);
    for (const x of [-w / 4, w / 4]) {
      P.lathe('main', x, 0, [
        [0.2, 0],
        [0.2, 0.02],
        [0.13, 0.08],
        [0.11, h - 0.12],
        [0.15, h - 0.06],
        [0.17, h - 0.04],
      ], 40);
    }
  } else if (style === 'minimal') {
    P.box('main', [-w / 2, h - 0.02, -d / 2], [w / 2, h, d / 2], 0.003);
    fourLegs(g, 'main', w, d, 0.03, h - 0.02, 0.03);
  } else {
    const top = style === 'japanese' ? 0.035 : 0.03;
    P.box('main', [-w / 2, h - top, -d / 2], [w / 2, h, d / 2], 0.004);
    const inset = style === 'japanese' ? 0.09 : 0.06;
    fourLegs(g, 'main', w, d, inset, h - top, 0.05);
    P.box('main', [-w / 2 + inset, h - top - 0.07, -d / 2 + inset], [w / 2 - inset, h - top, -d / 2 + inset + 0.022]);
    P.box('main', [-w / 2 + inset, h - top - 0.07, d / 2 - inset - 0.022], [w / 2 - inset, h - top, d / 2 - inset]);
  }
}

function drawerFronts(g: GenCtx, slot: string, x0: number, x1: number, y0: number, y1: number, zFront: number, n: number, pull: boolean) {
  const gap = 0.004;
  const hh = (y1 - y0) / n;
  g.slots.pull ??= { mat: HANDLE[g.style] };
  for (let i = 0; i < n; i++) {
    const a = y0 + i * hh + gap / 2;
    const b = a + hh - gap;
    g.P.box(slot, [x0 + gap, a, zFront - 0.018], [x1 - gap, b, zFront], 0.003);
    if (pull) g.P.box('pull', [(x0 + x1) / 2 - 0.05, (a + b) / 2 - 0.006, zFront], [(x0 + x1) / 2 + 0.05, (a + b) / 2 + 0.006, zFront + 0.018], 0.004);
  }
}

export function desk(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  const dresser = g.item.category === 'dresser';
  if (dresser && style === 'japanese') {
    // Kyōdai: a low chest with a folding mirror.
    P.box('main', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], 0.005);
    drawerFronts(g, 'main', -w / 2, w / 2, 0.02, h - 0.02, d / 2 + 0.018, 2, true);
    g.slots.mirror = { mat: 'x-mirror' };
    P.tilted('main', [0, h + 0.27, -d / 2 + 0.12], [0.36, 0.52, 0.02], -0.12, 0, 0.004);
    P.tilted('mirror', [0, h + 0.27, -d / 2 + 0.132], [0.32, 0.48, 0.004], -0.12);
    g.top = h;
    return;
  }
  if (dresser && style === 'minimal') {
    // Wall-hung desk-vanity with the flip mirror closed.
    P.box('main', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], 0.004);
    P.box('main', [-w / 2 + 0.01, h - 0.002, -d / 2 + 0.02], [w / 2 - 0.01, h, d / 2 - 0.02]);
    return;
  }
  if (style === 'brutalist') {
    const top = dresser ? 0.04 : 0.05;
    P.box('main', [-w / 2, h - top, -d / 2], [w / 2, h, d / 2], 0.005);
    if (dresser) {
      g.slots.block = { mat: 'blackOak' };
      P.box('block', [w / 2 - 0.42, 0, -d / 2 + 0.02], [w / 2 - 0.02, h - top, d / 2 - 0.02], 0.006);
      drawerFronts(g, 'block', w / 2 - 0.42, w / 2 - 0.02, 0.02, h - top - 0.01, d / 2, 3, false);
    } else {
      g.slots.leg = { mat: 'steelBlack' };
      for (const x of [-w / 2 + 0.22, w / 2 - 0.22]) {
        for (const s of [-1, 1]) P.rod('leg', [x + s * 0.14, 0, d * 0.32], [x, h - top, d * 0.05], 0.014);
        for (const s of [-1, 1]) P.rod('leg', [x + s * 0.14, 0, -d * 0.32], [x, h - top, -d * 0.05], 0.014);
        P.rod('leg', [x, h - top - 0.01, -d * 0.4], [x, h - top - 0.01, d * 0.4], 0.016);
      }
    }
    g.top = h;
    return;
  }
  const top = style === 'minimal' ? 0.02 : 0.028;
  P.box('main', [-w / 2, h - top, -d / 2], [w / 2, h, d / 2], 0.004);
  const legSlot = style === 'minimal' ? 'leg' : 'main';
  if (style === 'minimal') g.slots.leg = { mat: METAL[style] };
  fourLegs(g, legSlot, w, d, 0.03, h - top, style === 'minimal' ? 0.025 : 0.045, style === 'quietLuxury');
  if (style === 'quietLuxury' && !dresser) {
    g.slots.inlay = { mat: 'leatherBlack' };
    P.box('inlay', [-w / 2 + 0.12, h - 0.002, -d / 2 + 0.1], [w / 2 - 0.12, h + 0.001, d / 2 - 0.12], 0.002);
  }
  if (dresser || style === 'minimal' || style === 'quietLuxury') {
    // Drawer under the top.
    const dw = Math.min(0.6, w * 0.45);
    P.box('main', [-dw / 2, h - top - 0.1, -d / 2 + 0.05], [dw / 2, h - top, d / 2 - 0.02]);
    drawerFronts(g, 'main', -dw / 2, dw / 2, h - top - 0.1, h - top, d / 2 - 0.002, 1, style !== 'minimal');
  }
  if (!dresser && style === 'muji') {
    P.box('main', [-w / 2 + 0.1, h - top - 0.1, -d / 2 + 0.04], [w / 2 - 0.1, h - top - 0.09, -d / 2 + 0.16]);
  }
  if (dresser && style === 'quietLuxury') {
    g.slots.mirror = { mat: 'x-mirror' };
    g.slots.frame = { mat: 'brassBrushed' };
    const r = Math.min(0.36, w * 0.3);
    P.disc('mirror', [0, h + 0.08 + r, -d / 2 + 0.06], r, 'z', 48);
    P.torus('frame', [0, h + 0.08 + r, -d / 2 + 0.06], r, 0.012, 'z', 48);
    P.box('frame', [-0.01, h, -d / 2 + 0.05], [0.01, h + 0.1, -d / 2 + 0.07]);
  }
  if (dresser && style === 'muji') {
    P.box('main', [w / 2 - 0.4, 0, -d / 2 + 0.03], [w / 2 - 0.03, h - top, d / 2 - 0.03]);
    drawerFronts(g, 'main', w / 2 - 0.4, w / 2 - 0.03, 0.04, h - top - 0.005, d / 2 - 0.012, 3, true);
  }
  g.top = h;
}
