// Electronics, climate and wall decor: TVs, the split air-conditioner and framed prints.

import * as THREE from 'three';
import { extrudeSide } from '../geom';
import type { GenCtx } from './context';

export function tv(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.black = { mat: 'x-black' };
  const zb = -d / 2;
  const zf = d / 2;
  if (g.item.id.includes('frame')) {
    // Art-frame TV: hangs flush in a picture frame and shows a print when it is off.
    g.slots.screen = { mat: 'x-art' };
    const fw = 0.045;
    P.box('black', [-w / 2 + 0.01, 0.01, zb], [w / 2 - 0.01, h - 0.01, zf - 0.008]);
    P.box('main', [-w / 2, 0, zb + 0.004], [w / 2, fw, zf], 0.002);
    P.box('main', [-w / 2, h - fw, zb + 0.004], [w / 2, h, zf], 0.002);
    P.box('main', [-w / 2, fw, zb + 0.004], [-w / 2 + fw, h - fw, zf], 0.002);
    P.box('main', [w / 2 - fw, fw, zb + 0.004], [w / 2, h - fw, zf], 0.002);
    P.box('screen', [-w / 2 + fw, fw, zf - 0.009], [w / 2 - fw, h - fw, zf - 0.007]);
    return;
  }
  // Slim panel on a wall bracket, its electronics in a bulge behind.
  g.slots.screen = { mat: 'x-screen' };
  P.box('main', [-w / 2, 0, zf - 0.028], [w / 2, h, zf - 0.0012], 0.003);
  P.box('screen', [-w / 2 + 0.006, 0.016, zf - 0.0014], [w / 2 - 0.006, h - 0.006, zf]);
  P.box('black', [-w * 0.33, h * 0.1, zb + 0.02], [w * 0.33, h * 0.62, zf - 0.028], 0.01);
  P.box('black', [-0.2, h * 0.3, zb], [0.2, h * 0.5, zb + 0.02]);
}

export function airCon(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.shadow = { mat: 'x-shadow' };
  g.slots.black = { mat: 'x-black' };
  const zb = -d / 2;
  const zf = d / 2;
  // Body: flat back on the wall, a curved front falling to the air outlet underneath.
  const s = new THREE.Shape();
  s.moveTo(0, 0.05);
  s.lineTo(0, h - 0.02);
  s.quadraticCurveTo(0, h, 0.02, h);
  s.lineTo(d - 0.06, h);
  s.quadraticCurveTo(d, h - 0.005, d, h - 0.09);
  s.lineTo(d - 0.012, 0.11);
  s.quadraticCurveTo(d - 0.022, 0.05, d - 0.075, 0.05);
  s.lineTo(0, 0.05);
  const body = extrudeSide(s, -w / 2, w / 2, 0.012, 16);
  body.translate(0, 0, zb);
  P.geometry('main', body, undefined, 'x');
  P.box('main', [-w / 2, 0, zb], [w / 2, 0.05, zb + 0.06], 0.008);
  P.box('shadow', [-w / 2 + 0.035, 0.012, zb + 0.06], [w / 2 - 0.035, 0.05, zf - 0.07]);
  P.tilted('main', [0, 0.03, zf - 0.085], [w - 0.08, 0.004, 0.07], 0.55, 0, 0.0015);
  P.box('black', [w / 2 - 0.13, h - 0.11, zf - 0.009], [w / 2 - 0.07, h - 0.09, zf - 0.004], 0.002);
}

/** Framed print: a timber or metal frame, a white mount and the artwork. */
export function print(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.mount = { mat: 'x-white' };
  g.slots.art = { mat: 'x-art' };
  const fw = 0.025;
  const zb = -d / 2;
  const zf = d / 2;
  P.box('main', [-w / 2, 0, zb], [w / 2, fw, zf], 0.002);
  P.box('main', [-w / 2, h - fw, zb], [w / 2, h, zf], 0.002);
  P.box('main', [-w / 2, fw, zb], [-w / 2 + fw, h - fw, zf], 0.002);
  P.box('main', [w / 2 - fw, fw, zb], [w / 2, h - fw, zf], 0.002);
  P.box('mount', [-w / 2 + fw, fw, zb + 0.004], [w / 2 - fw, h - fw, zf - 0.012]);
  const m = 0.075;
  P.box('art', [-w / 2 + fw + m, fw + m, zf - 0.0125], [w / 2 - fw - m, h - fw - m, zf - 0.0115]);
}
