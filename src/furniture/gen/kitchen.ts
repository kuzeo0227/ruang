// Kitchen modules and appliances: base, sink, wall and tall cabinets, hob, hood, fridge, washer and
// the yard drying rack. Worktops use the style's worktop finish so the kitchen matches the shell.

import { STYLES } from '../../catalogue/styles';
import { HANDLE, type GenCtx } from './context';

const PLINTH = 0.1;
const WORKTOP = 0.03;

function handle(g: GenCtx, x: number, y: number, z: number, vertical: boolean, len = 0.14) {
  if (g.style === 'minimal') {
    g.P.box('shadow', [x - (vertical ? 0.003 : len / 2), y - (vertical ? len / 2 : 0.003), z - 0.002], [x + (vertical ? 0.003 : len / 2), y + (vertical ? len / 2 : 0.003), z + 0.001]);
    return;
  }
  if (vertical) g.P.box('pull', [x - 0.006, y - len / 2, z], [x + 0.006, y + len / 2, z + 0.022], 0.004);
  else g.P.box('pull', [x - len / 2, y - 0.006, z], [x + len / 2, y + 0.006, z + 0.022], 0.004);
}

function front(g: GenCtx, x0: number, x1: number, y0: number, y1: number, zf: number) {
  g.P.box('main', [x0 + 0.002, y0 + 0.002, zf - 0.018], [x1 - 0.002, y1 - 0.002, zf], 0.002);
}

function baseCarcass(g: GenCtx, withTop = true) {
  const { w, d, style, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.top = { mat: STYLES[style].shell.worktop };
  g.slots.pull = { mat: HANDLE[style] };
  g.slots.shadow = { mat: 'x-shadow' };
  P.box('shadow', [-w / 2, 0, -d / 2], [w / 2, PLINTH, d / 2 - 0.06]);
  P.box('main', [-w / 2, PLINTH, -d / 2], [w / 2, 0.9 - WORKTOP, d / 2 - 0.018]);
  if (withTop) P.box('top', [-w / 2, 0.9 - WORKTOP, -d / 2], [w / 2, 0.9, d / 2 + 0.02], 0.002);
}

export function kitchenBase(g: GenCtx) {
  const { w, d } = g;
  baseCarcass(g);
  const zf = d / 2;
  const y0 = PLINTH;
  const y1 = 0.9 - WORKTOP - 0.004;
  if (g.item.id.includes('drawer')) {
    const rows = [0.2, 0.28, 0.32];
    let y = y0;
    for (const r of rows) {
      const top = y + (y1 - y0) * r / 0.8;
      front(g, -w / 2, w / 2, y, Math.min(top, y1), zf);
      handle(g, 0, Math.min(top, y1) - 0.05, zf, false);
      y = top;
    }
  } else if (w < 0.45) {
    front(g, -w / 2, w / 2, y0, y1, zf);
    handle(g, w / 2 - 0.05, y1 - 0.1, zf, true);
  } else {
    front(g, -w / 2, 0, y0, y1, zf);
    front(g, 0, w / 2, y0, y1, zf);
    handle(g, -0.04, y1 - 0.1, zf, true);
    handle(g, 0.04, y1 - 0.1, zf, true);
  }
  g.top = 0.9;
}

export function kitchenSink(g: GenCtx) {
  const { w, d, P } = g;
  baseCarcass(g, false);
  g.slots.steel = { mat: 'x-steel' };
  g.slots.chrome = { mat: 'x-chrome' };
  const zf = d / 2;
  const y1 = 0.9 - WORKTOP - 0.004;
  front(g, -w / 2, 0, PLINTH, y1, zf);
  front(g, 0, w / 2, PLINTH, y1, zf);
  handle(g, -0.04, y1 - 0.1, zf, true);
  handle(g, 0.04, y1 - 0.1, zf, true);
  // Worktop around an undermount bowl.
  const bw = Math.min(0.6, w - 0.16);
  const bd = 0.4;
  const bz0 = -d / 2 + 0.09;
  const bz1 = bz0 + bd;
  const t0 = 0.9 - WORKTOP;
  P.box('top', [-w / 2, t0, -d / 2], [w / 2, 0.9, bz0], 0.002);
  P.box('top', [-w / 2, t0, bz1], [w / 2, 0.9, d / 2 + 0.02], 0.002);
  P.box('top', [-w / 2, t0, bz0], [-bw / 2, 0.9, bz1]);
  P.box('top', [bw / 2, t0, bz0], [w / 2, 0.9, bz1]);
  const depth = 0.19;
  P.box('steel', [-bw / 2, t0 - depth, bz0], [bw / 2, t0 - depth + 0.004, bz1]);
  P.box('steel', [-bw / 2, t0 - depth, bz0], [-bw / 2 + 0.004, t0, bz1]);
  P.box('steel', [bw / 2 - 0.004, t0 - depth, bz0], [bw / 2, t0, bz1]);
  P.box('steel', [-bw / 2, t0 - depth, bz0], [bw / 2, t0, bz0 + 0.004]);
  P.box('steel', [-bw / 2, t0 - depth, bz1 - 0.004], [bw / 2, t0, bz1]);
  // Mixer tap at the back.
  const tz = -d / 2 + 0.05;
  P.cyl('chrome', 0, tz, 0.9, 1.18, 0.014, 0.014, 16);
  P.rod('chrome', [0, 1.18, tz], [0, 1.2, tz + 0.06], 0.011);
  P.rod('chrome', [0, 1.2, tz + 0.06], [0, 1.12, tz + 0.2], 0.011);
  P.rod('chrome', [0.03, 0.98, tz], [0.07, 1.0, tz], 0.006);
  g.top = 0.9;
}

export function kitchenWall(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.pull = { mat: HANDLE[style] };
  g.slots.shadow = { mat: 'x-shadow' };
  P.box('main', [-w / 2, 0, -d / 2], [w / 2, h, d / 2 - 0.018]);
  front(g, -w / 2, 0, 0, h, d / 2);
  front(g, 0, w / 2, 0, h, d / 2);
  handle(g, -0.04, 0.08, d / 2, true, 0.1);
  handle(g, 0.04, 0.08, d / 2, true, 0.1);
}

export function kitchenTall(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.pull = { mat: HANDLE[style] };
  g.slots.shadow = { mat: 'x-shadow' };
  P.box('shadow', [-w / 2, 0, -d / 2], [w / 2, PLINTH, d / 2 - 0.06]);
  P.box('main', [-w / 2, PLINTH, -d / 2], [w / 2, h, d / 2 - 0.018]);
  const split = PLINTH + 1.3;
  front(g, -w / 2, w / 2, PLINTH, split, d / 2);
  front(g, -w / 2, w / 2, split, h, d / 2);
  handle(g, w / 2 - 0.05, split - 0.2, d / 2, true, 0.25);
  handle(g, w / 2 - 0.05, split + 0.2, d / 2, true, 0.25);
  g.top = h;
}

export function hob(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.glass = { mat: 'x-glass-dark' };
  g.slots.burner = { mat: 'x-black' };
  g.slots.chrome = { mat: 'x-chrome' };
  P.box('glass', [-w / 2, 0, -d / 2], [w / 2, Math.min(h, 0.008), d / 2], 0.003);
  const n = w > 0.85 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / n;
    const big = n === 3 && i === 1;
    P.cyl('burner', x, -0.02, 0.008, 0.02, big ? 0.075 : 0.055, big ? 0.07 : 0.05, 28);
    P.cyl('chrome', x, -0.02, 0.02, 0.026, big ? 0.04 : 0.03, big ? 0.04 : 0.03, 24);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      P.rod('burner', [x + Math.cos(a) * 0.03, 0.03, -0.02 + Math.sin(a) * 0.03], [x + Math.cos(a) * 0.1, 0.03, -0.02 + Math.sin(a) * 0.1], 0.005, 6);
    }
    P.cyl('burner', x, d / 2 - 0.05, 0.008, 0.02, 0.018, 0.016, 16);
  }
  g.top = 0.03;
}

export function hood(g: GenCtx) {
  const { w, d, P, toCeiling } = g;
  g.slots.main = { mat: g.finish };
  g.slots.led = { mat: 'x-led', glow: 0.6 };
  P.box('main', [-w / 2, 0, -d / 2], [w / 2, 0.06, d / 2], 0.004);
  P.tilted('main', [0, 0.14, -d / 2 + 0.16], [w * 0.55, 0.2, 0.3], 0, 0, 0.004);
  P.box('main', [-0.15, 0.2, -d / 2], [0.15, toCeiling, -d / 2 + 0.25]);
  for (const x of [-w / 4, w / 4]) P.disc('led', [x, -0.0005, 0.05], 0.02, '-y', 16);
}

export function fridge(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.handle = { mat: g.finish === 'steelBlack' ? 'x-chrome' : 'x-steel' };
  g.slots.shadow = { mat: 'x-shadow' };
  const zf = d / 2;
  P.box('main', [-w / 2, 0.02, -d / 2], [w / 2, h, zf - 0.04], 0.02);
  P.box('shadow', [-w / 2 + 0.03, 0, -d / 2 + 0.03], [w / 2 - 0.03, 0.02, zf - 0.08]);
  if (g.item.id.includes('sbs')) {
    for (const [a, b] of [
      [-w / 2, -0.003],
      [0.003, w / 2],
    ] as const) P.box('main', [a, 0.03, zf - 0.04], [b, h - 0.01, zf], 0.012);
    P.box('handle', [-0.03, h * 0.35, zf], [-0.018, h * 0.8, zf + 0.03], 0.005);
    P.box('handle', [0.018, h * 0.35, zf], [0.03, h * 0.8, zf + 0.03], 0.005);
  } else {
    const split = 0.66;
    P.box('main', [-w / 2, 0.03, zf - 0.04], [w / 2, split - 0.004, zf], 0.012);
    P.box('main', [-w / 2, split + 0.004, zf - 0.04], [w / 2, h - 0.01, zf], 0.012);
    P.box('handle', [w / 2 - 0.05, split - 0.3, zf], [w / 2 - 0.038, split - 0.08, zf + 0.03], 0.005);
    P.box('handle', [w / 2 - 0.05, split + 0.08, zf], [w / 2 - 0.038, split + 0.5, zf + 0.03], 0.005);
  }
  g.top = h;
}

export function washer(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.chrome = { mat: 'x-chrome' };
  g.slots.glass = { mat: 'x-glass-dark' };
  g.slots.black = { mat: 'x-black' };
  const zf = d / 2;
  P.box('main', [-w / 2, 0, -d / 2], [w / 2, h, zf], 0.02);
  const cy = h * 0.46;
  P.torus('chrome', [0, cy, zf + 0.015], 0.19, 0.022, 'z', 48);
  P.disc('glass', [0, cy, zf + 0.02], 0.17, 'z', 48);
  P.box('black', [w / 2 - 0.25, h - 0.09, zf - 0.002], [w / 2 - 0.05, h - 0.03, zf + 0.003], 0.004);
  P.box('main', [-w / 2 + 0.03, h - 0.09, zf - 0.002], [-w / 2 + 0.2, h - 0.03, zf + 0.008], 0.004);
  P.cyl('chrome', -0.05, zf + 0.012, h - 0.065, h - 0.055, 0.02, 0.02, 20);
  g.top = h;
}

export function dryingRack(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.main = { mat: g.finish };
  P.box('main', [-w / 2, h - 0.08, -d / 2], [w / 2, h, -d / 2 + 0.015], 0.004);
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) P.rod('main', [x, h - 0.04, -d / 2 + 0.01], [x, h - 0.06, d / 2 - 0.02], 0.008);
  for (let i = 0; i < 6; i++) {
    const z = -d / 2 + 0.06 + ((d - 0.08) * i) / 5;
    P.rod('main', [-w / 2 + 0.02, h - 0.05, z], [w / 2 - 0.02, h - 0.05, z], 0.005, 8);
  }
}
