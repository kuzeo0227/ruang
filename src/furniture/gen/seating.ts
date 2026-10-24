// Seating: sofas, armchairs, the Japanese floor chair, dining chairs, desk chairs, benches and
// outdoor chairs. Each style has its own proportions, legs and cushion softness.

import type { StyleId } from '../../catalogue/styles';
import type { V3 } from '../geom';
import { DARK_WOOD, LINEN, METAL, WOOD, isWood, type GenCtx } from './context';

interface SofaStyle {
  seatH: number;
  cushT: number;
  armW: number;
  armTop: number;
  backT: number;
  legH: number;
  legs: 'wood' | 'metal' | 'plinth' | 'none';
  soft: number;
  arms: 'box' | 'round' | 'wood';
  /** The back frame runs the full width, with the arms against it. */
  fullBack: boolean;
}

const SOFA: Record<StyleId, SofaStyle> = {
  muji: { seatH: 0.42, cushT: 0.16, armW: 0.05, armTop: 0.58, backT: 0.14, legH: 0.12, legs: 'wood', soft: 0.42, arms: 'wood', fullBack: false },
  japanese: { seatH: 0.3, cushT: 0.12, armW: 0.1, armTop: 0.44, backT: 0.16, legH: 0, legs: 'none', soft: 0.3, arms: 'box', fullBack: true },
  brutalist: { seatH: 0.4, cushT: 0.16, armW: 0.26, armTop: 0.55, backT: 0.24, legH: 0.06, legs: 'plinth', soft: 0.14, arms: 'box', fullBack: true },
  minimal: { seatH: 0.43, cushT: 0.14, armW: 0.14, armTop: 0.6, backT: 0.18, legH: 0.14, legs: 'metal', soft: 0.14, arms: 'box', fullBack: true },
  quietLuxury: { seatH: 0.4, cushT: 0.2, armW: 0.24, armTop: 0.56, backT: 0.24, legH: 0.04, legs: 'plinth', soft: 0.55, arms: 'round', fullBack: true },
};

function legsAt(g: GenCtx, slot: string, x0: number, x1: number, z0: number, z1: number, h: number, kind: 'wood' | 'metal', inset = 0.05) {
  for (const x of [x0 + inset, x1 - inset]) {
    for (const z of [z0 + inset, z1 - inset]) {
      if (kind === 'wood') g.P.cyl(slot, x, z, 0, h, 0.017, 0.024, 16);
      else g.P.box(slot, [x - 0.01, 0, z - 0.01], [x + 0.01, h, z + 0.01]);
    }
  }
}

export function sofa(g: GenCtx, seats?: number) {
  const { w, d, h, style, P } = g;
  const S = SOFA[style];
  g.slots.main = { mat: g.finish };
  g.slots.leg = { mat: S.legs === 'metal' ? METAL[style] : S.legs === 'plinth' ? 'x-shadow' : WOOD[style] };
  const n = seats ?? (w > 2.05 ? 3 : 2);
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  const base = S.legH;
  const deckTop = S.seatH - S.cushT;
  const arm = S.armW;

  // Deck and back frame.
  P.box('main', [x0 + arm, base, z0 + S.backT * 0.4], [x1 - arm, deckTop, z1 - 0.005], 0.02);
  const backTop = S.arms === 'wood' ? h - 0.1 : Math.min(h, S.seatH + 0.28);
  P.box('main', [S.fullBack ? x0 : x0 + arm, base, z0], [S.fullBack ? x1 : x1 - arm, backTop, z0 + S.backT * 0.55], 0.03);

  // Arms.
  for (const side of [-1, 1]) {
    const ax0 = side < 0 ? x0 : x1 - arm;
    const ax1 = side < 0 ? x0 + arm : x1;
    if (S.arms === 'wood') {
      P.box('leg', [ax0, base, z0 + 0.03], [ax1, S.armTop, z1 - 0.03], 0.008);
    } else if (S.arms === 'round') P.cushion('main', [ax0, base, z0 + 0.01], [ax1, S.armTop, z1], 0.55);
    else P.box('main', [ax0, base, z0], [ax1, S.armTop, z1], 0.025);
  }

  // Seat and back cushions.
  const cw = (w - 2 * arm) / n;
  for (let i = 0; i < n; i++) {
    const cx0 = x0 + arm + i * cw + 0.004;
    const cx1 = cx0 + cw - 0.008;
    P.cushion('main', [cx0, deckTop - 0.02, z0 + S.backT * 0.9], [cx1, S.seatH, z1 - 0.01], S.soft);
    const backH = h - S.seatH + 0.02;
    const cz = z0 + S.backT * 0.55 + 0.1;
    P.tiltedCushion('main', [(cx0 + cx1) / 2, S.seatH + backH / 2 - 0.03, cz], [cx1 - cx0, backH, 0.2], -0.13, 0, S.soft);
  }

  // Legs or plinth.
  if (S.legs === 'wood' || S.legs === 'metal') legsAt(g, 'leg', x0, x1, z0, z1, base, S.legs, 0.06);
  else if (S.legs === 'plinth') P.box('leg', [x0 + 0.06, 0, z0 + 0.06], [x1 - 0.06, base + 0.01, z1 - 0.06]);
  g.top = S.seatH;
}

/** Zaisu: a legless floor chair with a padded seat and an angled wooden backrest. */
function zaisu(g: GenCtx) {
  const { w, d, P, style } = g;
  g.slots.main = { mat: g.finish };
  g.slots.frame = { mat: DARK_WOOD[style] };
  const z0 = -d / 2;
  P.box('frame', [-w / 2, 0, z0], [w / 2, 0.04, d / 2], 0.01);
  P.cushion('main', [-w / 2 + 0.02, 0.035, z0 + 0.06], [w / 2 - 0.02, 0.11, d / 2 - 0.02], 0.35);
  const back = 0.42;
  P.tilted('frame', [0, 0.06 + back / 2 * Math.cos(0.3), z0 + 0.05 + (back / 2) * Math.sin(0.3)], [w - 0.04, back, 0.03], -0.3, 0, 0.008);
  P.tiltedCushion('main', [0, 0.1 + back / 2 * Math.cos(0.3), z0 + 0.1 + (back / 2) * Math.sin(0.3)], [w - 0.1, back - 0.06, 0.07], -0.3, 0, 0.35);
  g.top = 0.11;
}

export function armchair(g: GenCtx) {
  if (g.style === 'japanese') zaisu(g);
  else sofa(g, 1);
}

/** Arc of bars in plan, from angle a0 to a1 on a circle of radius R centred at (cx, cz), at height y. */
function arcBar(g: GenCtx, slot: string, cx: number, cz: number, R: number, a0: number, a1: number, y0: number, y1: number, t: number, segs = 6) {
  for (let i = 0; i < segs; i++) {
    const aa = a0 + ((a1 - a0) * i) / segs;
    const ab = a0 + ((a1 - a0) * (i + 1)) / segs;
    const am = (aa + ab) / 2;
    const len = 2 * R * Math.sin(Math.abs(ab - aa) / 2) + 0.004;
    g.P.tilted(slot, [cx + R * Math.sin(am), (y0 + y1) / 2, cz - R * Math.cos(am)], [len, y1 - y0, t], 0, -am, 0.004);
  }
}

export function diningChair(g: GenCtx) {
  const { w, d, h, style, P } = g;
  const seatH = style === 'japanese' ? 0.42 : 0.45;
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  g.slots.main = { mat: g.finish };
  if (style === 'muji') {
    // Oak chair with round legs and a curved back rail.
    for (const x of [x0 + 0.04, x1 - 0.04]) {
      P.cyl('main', x, z1 - 0.05, 0, seatH, 0.016, 0.018, 14);
      P.rod('main', [x, 0, z0 + 0.06], [x, h - 0.07, z0 + 0.04], 0.017, 14);
    }
    P.box('main', [x0 + 0.01, seatH - 0.025, z0 + 0.03], [x1 - 0.01, seatH, z1 - 0.01], 0.008);
    arcBar(g, 'main', 0, z0 + 0.04 + 0.48, 0.48, -0.5, 0.5, h - 0.11, h - 0.04, 0.022);
    P.box('main', [x0 + 0.05, 0.16, z0 + 0.04], [x1 - 0.05, 0.19, z0 + 0.07]);
  } else if (style === 'japanese') {
    // Kumiko lattice back.
    for (const x of [x0 + 0.03, x1 - 0.03]) {
      P.box('main', [x - 0.016, 0, z1 - 0.07], [x + 0.016, seatH, z1 - 0.038]);
      P.box('main', [x - 0.016, 0, z0 + 0.03], [x + 0.016, h, z0 + 0.062]);
    }
    P.box('main', [x0, seatH - 0.028, z0 + 0.02], [x1, seatH, z1 - 0.02], 0.004);
    const by0 = seatH + 0.1;
    const by1 = h - 0.02;
    P.box('main', [x0 + 0.03, by1 - 0.03, z0 + 0.035], [x1 - 0.03, by1, z0 + 0.057]);
    for (let i = 1; i < 5; i++) {
      const x = x0 + 0.03 + ((w - 0.06) * i) / 5;
      P.box('main', [x - 0.004, by0, z0 + 0.04], [x + 0.004, by1 - 0.03, z0 + 0.052]);
    }
    for (let j = 0; j < 4; j++) {
      const y = by0 + ((by1 - 0.03 - by0) * j) / 3;
      P.box('main', [x0 + 0.045, y - 0.004, z0 + 0.04], [x1 - 0.045, y + 0.004, z0 + 0.052]);
    }
  } else if (style === 'brutalist') {
    // Tubular steel frame with leather sling seat and back.
    g.slots.frame = { mat: 'steelBlack' };
    const r = 0.011;
    for (const x of [x0 + 0.03, x1 - 0.03]) {
      const pts: V3[] = [
        [x, 0, z1 - 0.04],
        [x, seatH - 0.03, z1 - 0.04],
        [x, seatH - 0.03, z0 + 0.06],
        [x, 0, z0 + 0.06],
      ];
      for (let i = 0; i < pts.length - 1; i++) P.rod('frame', pts[i]!, pts[i + 1]!, r);
      P.rod('frame', [x, seatH - 0.03, z0 + 0.06], [x, h, z0 + 0.02], r);
    }
    P.rod('frame', [x0 + 0.03, h, z0 + 0.02], [x1 - 0.03, h, z0 + 0.02], r);
    P.rod('frame', [x0 + 0.03, 0.12, z1 - 0.04], [x1 - 0.03, 0.12, z1 - 0.04], r);
    P.box('main', [x0 + 0.04, seatH - 0.035, z0 + 0.07], [x1 - 0.04, seatH - 0.012, z1 - 0.05], 0.008);
    P.tilted('main', [0, h - 0.13, z0 + 0.035], [w - 0.08, 0.22, 0.014], -0.12, 0, 0.005);
  } else if (style === 'minimal') {
    // Moulded ply shell on slim legs.
    g.slots.frame = { mat: isWood(g.finish) ? 'steelBlack' : 'oakLight' };
    for (const [x, z] of [
      [x0 + 0.05, z1 - 0.05],
      [x1 - 0.05, z1 - 0.05],
      [x0 + 0.05, z0 + 0.06],
      [x1 - 0.05, z0 + 0.06],
    ] as const) P.rod('frame', [x * 1.06, 0, z * 1.06], [x, seatH - 0.02, z], 0.011);
    P.box('main', [x0 + 0.01, seatH - 0.02, z0 + 0.04], [x1 - 0.01, seatH, z1 - 0.02], 0.01);
    P.tilted('main', [0, (seatH + h) / 2, z0 + 0.03], [w - 0.03, h - seatH - 0.02, 0.014], -0.1, 0, 0.007);
  } else {
    // Quiet Luxury: upholstered seat and curved back on walnut legs.
    g.slots.frame = { mat: 'walnut' };
    for (const [x, z] of [
      [x0 + 0.06, z1 - 0.06],
      [x1 - 0.06, z1 - 0.06],
      [x0 + 0.06, z0 + 0.07],
      [x1 - 0.06, z0 + 0.07],
    ] as const) P.cyl('frame', x, z, 0, seatH - 0.08, 0.014, 0.02, 14);
    P.cushion('main', [x0 + 0.01, seatH - 0.1, z0 + 0.04], [x1 - 0.01, seatH, z1 - 0.01], 0.35);
    for (let i = 0; i < 5; i++) {
      const a = -0.55 + (1.1 * (i + 0.5)) / 5;
      const R = 0.42;
      g.P.tiltedCushion('main', [R * Math.sin(a), (seatH + h) / 2 + 0.01, z1 - 0.12 - R * Math.cos(a)], [w / 5 + 0.03, h - seatH, 0.07], -0.08, -a, 0.4);
    }
  }
  g.top = seatH;
}

export function taskChair(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.seat = { mat: 'linenCharcoal' };
  g.slots.black = { mat: 'x-black' };
  const r = Math.min(w, d) / 2 - 0.02;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const ex = Math.sin(a) * r;
    const ez = Math.cos(a) * r;
    P.rod('main', [0, 0.08, 0], [ex, 0.06, ez], 0.016, 10);
    P.sphere('black', [ex, 0.03, ez], 0.03, 12);
  }
  P.cyl('main', 0, 0, 0.07, 0.4, 0.025, 0.025, 16);
  P.cushion('seat', [-0.25, 0.4, -0.22], [0.25, 0.48, 0.25], 0.35);
  const mesh = g.item.id.includes('ergo');
  P.tiltedCushion(mesh ? 'black' : 'seat', [0, (0.52 + h) / 2, -0.27], [0.44, h - 0.52, mesh ? 0.03 : 0.07], -0.1, 0, 0.3);
  P.rod('main', [0, 0.45, -0.2], [0, 0.6, -0.27], 0.015);
  for (const x of [-0.27, 0.27]) {
    P.rod('black', [x * 0.9, 0.44, 0.02], [x, 0.62, 0.02], 0.012);
    P.box('black', [x - 0.03, 0.62, -0.08], [x + 0.03, 0.645, 0.15], 0.008);
  }
  g.top = 0.48;
}

export function bench(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.main = { mat: g.finish };
  if (g.item.id.includes('storage')) {
    P.box('main', [-w / 2, 0, -d / 2], [w / 2, h - 0.06, d / 2], 0.008);
    g.slots.pad = { mat: 'linenStone' };
    P.cushion('pad', [-w / 2 + 0.01, h - 0.07, -d / 2 + 0.01], [w / 2 - 0.01, h, d / 2 - 0.01], 0.3);
  } else {
    P.box('main', [-w / 2, h - 0.04, -d / 2], [w / 2, h, d / 2], 0.004);
    for (const x of [-w / 2 + 0.08, w / 2 - 0.12]) P.box('main', [x, 0, -d / 2 + 0.03], [x + 0.04, h - 0.04, d / 2 - 0.03]);
  }
}

export function outdoorSeat(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.main = { mat: g.finish };
  const seatH = 0.38;
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  for (const x of [x0 + 0.03, x1 - 0.03]) {
    P.box('main', [x - 0.025, 0, z1 - 0.08], [x + 0.025, 0.6, z1 - 0.03]);
    P.box('main', [x - 0.025, 0, z0 + 0.06], [x + 0.025, 0.6, z0 + 0.11]);
    P.box('main', [x - 0.035, 0.6, z0 + 0.04], [x + 0.035, 0.63, z1 - 0.01], 0.006);
    P.box('main', [x - 0.02, seatH - 0.05, z0 + 0.08], [x + 0.02, seatH - 0.02, z1 - 0.05]);
  }
  const cushioned = g.item.id.includes('teak');
  if (cushioned) {
    g.slots.pad = { mat: LINEN.quietLuxury };
    P.box('main', [x0 + 0.06, seatH - 0.06, z0 + 0.08], [x1 - 0.06, seatH - 0.03, z1 - 0.06]);
    P.cushion('pad', [x0 + 0.06, seatH - 0.03, z0 + 0.12], [x1 - 0.06, seatH + 0.08, z1 - 0.04], 0.35);
    P.tiltedCushion('pad', [0, seatH + 0.17, z0 + 0.14], [w - 0.14, 0.3, 0.11], -0.3, 0, 0.35);
    P.tilted('main', [0, seatH + 0.18, z0 + 0.07], [w - 0.12, 0.42, 0.025], -0.3, 0, 0.004);
  } else {
    for (let i = 0; i < 6; i++) {
      const z = z0 + 0.12 + ((d - 0.2) * i) / 6;
      P.box('main', [x0 + 0.06, seatH - 0.03, z], [x1 - 0.06, seatH, z + 0.06], 0.004);
    }
    for (let i = 0; i < 5; i++) {
      const yy = seatH + 0.08 + i * 0.085;
      const zz = z0 + 0.1 - (yy - seatH) * 0.35;
      P.tilted('main', [0, yy, zz], [w - 0.12, 0.06, 0.02], -0.34, 0, 0.004);
    }
  }
  g.top = seatH;
  void h;
}
