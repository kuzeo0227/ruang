// Light fittings: floor and table lamps, pendants, the pillar desk lamp and the wood-blade fan.
// Shades are marked to glow when the room lights are on.

import * as THREE from 'three';
import { METAL, WOOD, type GenCtx } from './context';

/** A drum with vertical pleats, open at both ends. */
function pleatedDrum(g: GenCtx, slot: string, y0: number, y1: number, r0: number, r1: number, pleats = 36) {
  const geo = new THREE.CylinderGeometry(r1, r0, y1 - y0, pleats * 4, 1, true);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.035 * Math.abs(Math.sin(a * pleats * 0.5));
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  geo.translate(0, (y0 + y1) / 2, 0);
  g.P.geometry(slot, geo);
}

function andon(g: GenCtx, w: number, h: number, paperFrom: number) {
  const { P } = g;
  const s = w / 2;
  const t = Math.max(0.012, w * 0.06);
  for (const x of [-s, s - t]) for (const z of [-s, s - t]) P.box('frame', [x, 0, z], [x + t, h, z + t]);
  for (const y of [0.02, paperFrom, h - t]) {
    P.box('frame', [-s, y, -s], [s, y + t, -s + t]);
    P.box('frame', [-s, y, s - t], [s, y + t, s]);
    P.box('frame', [-s, y, -s], [-s + t, y + t, s]);
    P.box('frame', [s - t, y, -s], [s, y + t, s]);
  }
  P.box('shade', [-s + t * 0.5, paperFrom + t, -s + t * 0.5], [s - t * 0.5, h - t, s - t * 0.5]);
}

export function floorLamp(g: GenCtx) {
  const { w, h, style, P } = g;
  const glow = 1;
  if (style === 'japanese') {
    g.slots.frame = { mat: g.finish === 'washi' ? 'hinoki' : g.finish };
    g.slots.shade = { mat: 'washi', glow };
    andon(g, w, h, h * 0.45);
  } else if (style === 'brutalist') {
    g.slots.main = { mat: g.finish };
    g.slots.led = { mat: 'x-led', glow: 1.5 };
    P.box('main', [-w / 2, 0, -w / 2], [w / 2, h, w / 2], 0.006);
    P.box('led', [-w / 2 + 0.03, h - 0.002, -w / 2 + 0.03], [w / 2 - 0.03, h + 0.001, w / 2 - 0.03]);
  } else if (style === 'minimal') {
    g.slots.main = { mat: g.finish };
    g.slots.led = { mat: 'x-led', glow: 2 };
    P.cyl('main', 0, 0, 0, 0.012, w / 2, w / 2, 32);
    P.cyl('main', 0, 0, 0.012, h, 0.008, 0.008, 10);
    P.box('led', [-0.004, 0.3, 0.006], [0.004, h - 0.05, 0.014]);
  } else {
    // Muji paper floor lamp, Quiet Luxury pleated linen drum.
    const ql = style === 'quietLuxury';
    g.slots.stem = { mat: ql ? 'brassBrushed' : WOOD[style] };
    g.slots.shade = { mat: g.finish === 'brassBrushed' ? 'linenOat' : g.finish, glow, doubleSide: true };
    const shadeH = ql ? 0.4 : 0.45;
    const r = w / 2 - 0.01;
    P.cyl('stem', 0, 0, 0, 0.025, r * 0.75, r * 0.75, 40);
    P.cyl('stem', 0, 0, 0.025, h - shadeH * 0.5, 0.012, 0.012, 12);
    if (ql) pleatedDrum(g, 'shade', h - shadeH, h, r, r * 0.86);
    else P.lathe('shade', 0, 0, [
      [r * 0.85, h - shadeH],
      [r, h - shadeH + 0.06],
      [r, h - 0.06],
      [r * 0.85, h],
    ], 40);
  }
}

export function tableLamp(g: GenCtx) {
  const { w, h, style, P } = g;
  const r = w / 2;
  if (style === 'japanese') {
    g.slots.frame = { mat: g.finish === 'washi' ? 'hinoki' : g.finish };
    g.slots.shade = { mat: 'washi', glow: 1 };
    andon(g, w, h, 0.03);
  } else if (style === 'muji') {
    g.slots.base = { mat: 'oakLight' };
    g.slots.shade = { mat: g.finish, glow: 1 };
    P.cyl('base', 0, 0, 0, 0.02, r * 0.6, r * 0.6, 32);
    P.lathe('shade', 0, 0, [
      [0.02, 0.02],
      [r * 0.8, 0.05],
      [r, h * 0.45],
      [r * 0.8, h - 0.03],
      [0.02, h],
    ], 40);
  } else if (style === 'minimal') {
    g.slots.base = { mat: g.finish };
    g.slots.shade = { mat: 'lacquerWhite', glow: 1.2 };
    P.cyl('base', 0, 0, 0, 0.03, r * 0.45, r * 0.5, 32);
    P.sphere('shade', [0, 0.03 + r * 0.95, 0], r * 0.95, 32);
  } else {
    // Brutalist concrete base or Quiet Luxury stoneware base, both with a linen drum shade.
    g.slots.base = { mat: g.finish };
    g.slots.shade = { mat: 'linenOat', glow: 1, doubleSide: true };
    g.slots.metal = { mat: style === 'quietLuxury' ? 'brassBrushed' : 'steelBlack' };
    const baseH = h * 0.55;
    if (style === 'quietLuxury') {
      P.lathe('base', 0, 0, [
        [r * 0.3, 0],
        [r * 0.42, 0.02],
        [r * 0.5, baseH * 0.45],
        [r * 0.32, baseH * 0.9],
        [r * 0.12, baseH],
      ], 40);
    } else P.cyl('base', 0, 0, 0, baseH, r * 0.38, r * 0.38, 32);
    P.cyl('metal', 0, 0, baseH, h - 0.08, 0.008, 0.008, 10);
    pleatedDrum(g, 'shade', baseH + 0.02, h, r, r * 0.82, 30);
  }
}

export function pendant(g: GenCtx) {
  const { w, h, style, P, toCeiling } = g;
  const r = w / 2;
  g.slots.cord = { mat: 'x-black' };
  P.cyl('cord', 0, 0, h - 0.01, toCeiling, 0.003, 0.003, 6);
  P.cyl('cord', 0, 0, toCeiling - 0.02, toCeiling, 0.05, 0.05, 24);
  if (style === 'minimal') {
    g.slots.main = { mat: g.finish };
    g.slots.led = { mat: 'x-led', glow: 1.6 };
    P.cyl('main', 0, 0, 0.005, h, r, r, 48);
    P.disc('led', [0, 0.004, 0], r - 0.01, '-y', 48);
  } else if (style === 'quietLuxury') {
    g.slots.shade = { mat: 'alabaster', glow: 1 };
    g.slots.metal = { mat: 'brassBrushed' };
    P.lathe('shade', 0, 0, [
      [0.02, 0],
      [r * 0.6, 0.02],
      [r * 0.92, h * 0.35],
      [r, h * 0.6],
    ], 48);
    P.cyl('metal', 0, 0, 0, h + 0.02, 0.006, 0.006, 10);
    P.torus('metal', [0, h * 0.6, 0], r, 0.006, 'y', 48);
  } else if (style === 'japanese') {
    g.slots.shade = { mat: 'washi', glow: 1 };
    g.slots.ring = { mat: 'x-black' };
    P.sphere('shade', [0, h / 2, 0], r, 40, [1, h / w, 1]);
    for (let i = 1; i < 8; i++) {
      const y = (h * i) / 8;
      const rr = r * Math.sqrt(1 - Math.pow((y - h / 2) / (h / 2), 2));
      P.torus('ring', [0, y, 0], rr + 0.002, 0.002, 'y', 40);
    }
    P.cyl('ring', 0, 0, h - 0.02, h, 0.08, 0.08, 24);
    P.cyl('ring', 0, 0, 0, 0.02, 0.09, 0.09, 24);
  } else {
    // Muji pleated paper sphere.
    g.slots.shade = { mat: g.finish, glow: 1 };
    pleatedDrum(g, 'shade', h * 0.15, h * 0.85, r * 0.9, r * 0.9, 24);
    P.sphere('shade', [0, h / 2, 0], r, 32, [1, h / w, 1]);
  }
}

export function deskLamp(g: GenCtx) {
  const { w, h, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.led = { mat: 'x-led', glow: 1.2 };
  P.cyl('main', 0, 0, 0, 0.015, w / 2, w / 2, 32);
  P.cyl('main', 0, 0, 0.015, h, 0.03, 0.03, 24);
  P.disc('led', [0, h + 0.0005, 0], 0.026, 'y', 24);
}

export function ceilingFan(g: GenCtx) {
  const { w, toCeiling, P, style } = g;
  g.slots.blade = { mat: g.finish };
  g.slots.body = { mat: METAL[style] === 'brassBrushed' ? 'brassBrushed' : 'lacquerWhite' };
  g.slots.led = { mat: 'x-led', glow: 1 };
  const top = toCeiling;
  P.cyl('body', 0, 0, top - 0.03, top, 0.07, 0.07, 24);
  P.cyl('body', 0, 0, top - 0.3, top - 0.03, 0.012, 0.012, 10);
  P.lathe('body', 0, 0, [
    [0.06, top - 0.42],
    [0.13, top - 0.38],
    [0.13, top - 0.33],
    [0.05, top - 0.3],
  ], 32);
  P.disc('led', [0, top - 0.421, 0], 0.06, '-y', 24);
  const blades = 3;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const len = w / 2 - 0.15;
    P.tilted('blade', [Math.cos(a) * (0.15 + len / 2), top - 0.36, Math.sin(a) * (0.15 + len / 2)], [len, 0.008, 0.12], 0, -a, 0.003);
  }
}

export function downlight(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.led = { mat: 'x-led', glow: 1 };
  if (w > d * 4) {
    P.box('main', [-w / 2, 0, -d / 2], [w / 2, h, d / 2]);
    P.box('led', [-w / 2 + 0.005, -0.001, -d / 4], [w / 2 - 0.005, 0.001, d / 4]);
  } else {
    P.cyl('main', 0, 0, 0, h, w / 2, w / 2, 24);
    P.disc('led', [0, -0.001, 0], w / 2 - 0.01, '-y', 24);
  }
}
