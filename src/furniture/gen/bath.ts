// Bathroom: WCs (one-piece and wall-hung), vanities, the shower screen and mirrors.

import * as THREE from 'three';
import type { MaterialId } from '../../catalogue/materials';
import type { StyleId } from '../../catalogue/styles';
import { ellipsePath, extrudeFlat, roundRectPath } from '../geom';
import { FIXTURE, HANDLE, METAL, type GenCtx } from './context';

const _m = new THREE.Matrix4();

/**
 * Solid of revolution stretched to an ellipse in plan. Profile radii are relative (1 = the
 * ellipse itself) and heights absolute; list points bottom-up for an outward face, top-down to
 * face the axis (the inside of a basin).
 */
function ovalLathe(g: GenCtx, slot: string, cz: number, rx: number, rz: number, profile: [number, number][], seg = 56) {
  const geo = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)),
    seg,
  );
  geo.applyMatrix4(_m.makeScale(rx, 1, rz).setPosition(0, 0, cz));
  g.P.geometry(slot, geo);
}

/** Basin material for vessel basins, per style. */
const VESSEL: Record<StyleId, MaterialId> = { muji: 'porcelainWhite', japanese: 'stonewareMatte', brutalist: 'concreteRaw', minimal: 'porcelainWhite', quietLuxury: 'marbleWhite' };

/** A closed seat lid with the seat ring just showing beneath it. */
function lid(g: GenCtx, cz: number, rx: number, rz: number, rim: number, top: number) {
  ovalLathe(g, 'seat', cz, rx, rz, [
    [0.72, rim],
    [0.985, rim],
    [0.99, rim + 0.006],
    [0.975, rim + 0.012],
    [0.72, rim + 0.012],
  ]);
  ovalLathe(g, 'seat', cz - rz * 0.02, rx * 0.97, rz * 0.97, [
    [0, rim + 0.012],
    [0.96, rim + 0.012],
    [0.99, rim + 0.02],
    [0.975, top - 0.005],
    [0.9, top],
    [0, top],
  ]);
  for (const x of [-rx * 0.45, rx * 0.45]) g.P.cyl('metal', x, cz - rz * 0.9, rim, rim + 0.022, 0.011, 0.011, 12);
}

export function wc(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.seat = { mat: g.finish === 'porcelainWhite' ? 'x-white' : g.finish };
  g.slots.metal = { mat: FIXTURE[style] };
  const z0 = -d / 2;
  const rx = w / 2 - 0.005;
  if (g.item.mount === 'wall') {
    // Wall-hung: the bowl floats on a square back, the cistern is in the wall behind a flush plate.
    const top = h;
    const rim = top - 0.032;
    const rz = d / 2;
    P.box('main', [-rx * 0.8, 0.09, z0], [rx * 0.8, rim, z0 + 0.17], 0.045);
    ovalLathe(g, 'main', 0, rx, rz, [
      [0, 0.17],
      [0.55, 0.17],
      [0.78, 0.185],
      [0.92, 0.24],
      [0.985, 0.31],
      [1, rim - 0.012],
      [0.98, rim],
      [0, rim],
    ]);
    lid(g, 0, rx, rz, rim, top);
    P.box('metal', [-0.123, 0.98, z0], [0.123, 1.145, z0 + 0.008], 0.003);
    g.slots.shadow = { mat: 'x-shadow' };
    P.box('shadow', [-0.0015, 0.99, z0 + 0.007], [0.0015, 1.135, z0 + 0.0085]);
    return;
  }
  // One-piece, back to the wall: a tall cistern block fused to a skirted bowl.
  const top = 0.4;
  const rim = top - 0.032;
  P.box('main', [-rx + 0.005, 0, z0], [rx - 0.005, h - 0.022, z0 + 0.19], 0.04);
  P.box('main', [-rx - 0.002, h - 0.026, z0 - 0.002], [rx + 0.002, h, z0 + 0.2], 0.012);
  P.cyl('metal', 0, z0 + 0.1, h - 0.002, h + 0.004, 0.022, 0.022, 28);
  const rz = (d - 0.1) / 2;
  const cz = d / 2 - rz;
  ovalLathe(g, 'main', cz, rx, rz, [
    [0, 0],
    [0.76, 0],
    [0.79, 0.012],
    [0.85, 0.12],
    [0.94, 0.27],
    [1, rim - 0.012],
    [0.98, rim],
    [0, rim],
  ]);
  lid(g, cz, rx, rz, rim, top);
  g.top = h;
}

/** A deck mixer at (0, z) standing on the counter at y. */
function mixer(g: GenCtx, y: number, z: number, height: number, reach: number) {
  const { P } = g;
  P.cyl('metal', 0, z, y, y + 0.012, 0.026, 0.026, 24);
  P.cyl('metal', 0, z, y + 0.012, y + height, 0.016, 0.016, 20);
  P.rod('metal', [0, y + height - 0.012, z], [0, y + height - 0.012, z + reach], 0.011, 14);
  P.cyl('metal', 0, z + reach, y + height - 0.03, y + height - 0.012, 0.012, 0.011, 14);
  P.rod('metal', [0, y + height - 0.004, z - 0.005], [0, y + height + 0.012, z - 0.07], 0.006, 10);
}

export function vanity(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.pull = { mat: HANDLE[style] };
  g.slots.shadow = { mat: 'x-shadow' };
  g.slots.metal = { mat: FIXTURE[style] };
  const zf = d / 2;
  const grooved = style === 'minimal' || style === 'brutalist';
  const pull = (x0: number, x1: number, y: number) => {
    if (grooved) P.box('shadow', [x0 + 0.01, y - 0.006, zf - 0.0005], [x1 - 0.01, y, zf + 0.0005]);
    else P.box('pull', [(x0 + x1) / 2 - 0.06, y - 0.03, zf], [(x0 + x1) / 2 + 0.06, y - 0.018, zf + 0.018], 0.004);
  };

  if (g.item.mount === 'wall') {
    // Floating vanity: a wall-hung drawer box, a stone top and a vessel basin.
    const ct = 0.4; // underside of the stone top
    g.slots.top = { mat: g.finish === 'terrazzo' ? 'terrazzo' : style === 'quietLuxury' ? 'travertine' : style === 'brutalist' ? 'concreteDark' : 'quartzWhite' };
    g.slots.basin = { mat: VESSEL[style] };
    P.box('main', [-w / 2, 0, -d / 2], [w / 2, ct, zf - 0.018], 0.003);
    for (const [a, b] of [
      [-w / 2, -0.002],
      [0.002, w / 2],
    ] as const) {
      P.box('main', [a + 0.002, 0.004, zf - 0.018], [b - 0.002, ct - 0.004, zf], 0.003);
      pull(a, b, ct - 0.03);
    }
    P.box('top', [-w / 2 - 0.005, ct, -d / 2], [w / 2 + 0.005, ct + 0.02, zf + 0.01], 0.003);
    const y = ct + 0.02;
    const top = h;
    P.lathe('basin', 0, 0.03, [
      [0, y],
      [0.11, y],
      [0.165, y + 0.02],
      [0.192, y + 0.065],
      [0.2, top - 0.012],
      [0.197, top],
      [0.188, top],
      [0.184, top - 0.012],
      [0.172, y + 0.06],
      [0.14, y + 0.03],
      [0.08, y + 0.022],
      [0, y + 0.02],
    ], 56);
    P.disc('metal', [0, y + 0.0205, 0.03], 0.02, 'y', 20);
    mixer(g, y, -d / 2 + 0.065, 0.28, 0.13);
    g.top = y;
    return;
  }

  // Wash stand: a drawer cabinet on short legs, a ceramic top with an integrated oval basin.
  g.slots.basin = { mat: 'porcelainWhite' };
  g.slots.leg = { mat: style === 'muji' || style === 'japanese' ? g.finish : METAL[style] };
  const legs = 0.12;
  const deck = h - 0.03;
  const t = 0.018;
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) for (const z of [-d / 2 + 0.03, zf - 0.05]) P.cyl('leg', x, z, 0, legs + 0.01, 0.012, 0.014, 12);
  P.box('main', [-w / 2, legs, -d / 2], [w / 2, deck - 0.12, zf - t], 0.003);
  // Upper frame around the basin bowl (open at the top so the bowl can sit inside).
  P.box('main', [-w / 2, deck - 0.12, -d / 2], [-w / 2 + t, deck, zf - t]);
  P.box('main', [w / 2 - t, deck - 0.12, -d / 2], [w / 2, deck, zf - t]);
  P.box('main', [-w / 2, deck - 0.12, -d / 2], [w / 2, deck, -d / 2 + t]);
  const split = legs + (deck - legs) * 0.47;
  P.box('main', [-w / 2 + 0.002, legs + 0.004, zf - t], [w / 2 - 0.002, split - 0.002, zf], 0.003);
  P.box('main', [-w / 2 + 0.002, split + 0.002, zf - t], [w / 2 - 0.002, deck - 0.004, zf], 0.003);
  pull(-w / 2, w / 2, split - 0.02);
  pull(-w / 2, w / 2, deck - 0.03);
  // Counter with the basin opening, then the bowl hung from its edge.
  const bz = 0.03;
  const brx = Math.min(0.21, w / 2 - 0.08);
  const brz = Math.min(0.145, d / 2 - 0.08);
  const shape = roundRectPath(new THREE.Shape(), 0, -0.005, w + 0.01, d + 0.01, 0.02);
  shape.holes.push(ellipsePath(new THREE.Path(), 0, -bz, brx, brz));
  P.geometry('basin', extrudeFlat(shape, deck, h, 0.006, 48));
  ovalLathe(g, 'basin', bz, brx, brz, [
    [1.05, deck + 0.008],
    [1, deck - 0.004],
    [0.95, deck - 0.03],
    [0.82, deck - 0.06],
    [0.55, deck - 0.08],
    [0.15, deck - 0.088],
    [0, deck - 0.09],
  ]);
  P.disc('metal', [0, deck - 0.0895, bz], 0.019, 'y', 20);
  mixer(g, h, -d / 2 + 0.06, 0.16, 0.12);
  g.top = h;
}

export function showerScreen(g: GenCtx) {
  const { w, h, style, P } = g;
  g.slots.glass = { mat: g.finish };
  g.slots.metal = { mat: FIXTURE[style] };
  const t = 0.01;
  const split = -w / 2 + w * 0.45;
  // Wall channel, fixed panel, then the door hung from two glass-to-glass hinges.
  P.box('metal', [-w / 2, 0, -0.012], [-w / 2 + 0.022, h, 0.012], 0.002);
  P.box('glass', [-w / 2 + 0.012, 0.008, -t / 2], [split - 0.002, h, t / 2]);
  P.box('glass', [split + 0.002, 0.012, -t / 2], [w / 2 - 0.004, h - 0.004, t / 2]);
  for (const y of [0.3, h - 0.3]) P.box('metal', [split - 0.035, y - 0.045, -0.014], [split + 0.035, y + 0.045, 0.014], 0.004);
  // A bar pull on both faces.
  const px = w / 2 - 0.07;
  for (const s of [-1, 1]) {
    P.rod('metal', [px, 0.95, s * 0.045], [px, 1.25, s * 0.045], 0.01, 14);
    for (const y of [0.98, 1.22]) P.rod('metal', [px, y, s * 0.005], [px, y, s * 0.045], 0.006, 10);
  }
}

export function mirror(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.mirror = { mat: 'x-mirror' };
  const zb = -d / 2;
  const zf = d / 2;
  if (g.item.id.includes('cabinet')) {
    // Mirror cabinet: two mirrored doors over a shallow box, lit from underneath.
    g.slots.led = { mat: 'x-led', glow: 0.8 };
    P.box('main', [-w / 2, 0, zb], [w / 2, h, zf - 0.012], 0.003);
    for (const [a, b] of [
      [-w / 2 + 0.002, -0.0015],
      [0.0015, w / 2 - 0.002],
    ] as const) P.box('mirror', [a, 0.003, zf - 0.012], [b, h - 0.003, zf]);
    P.box('led', [-w / 2 + 0.03, -0.0015, zf - 0.07], [w / 2 - 0.03, 0.0005, zf - 0.035]);
    return;
  }
  // Round mirror in a slim metal ring.
  g.slots.back = { mat: 'x-black' };
  const r = Math.min(w, h) / 2;
  const back = new THREE.CylinderGeometry(r - 0.004, r - 0.004, d - 0.012, 64);
  back.rotateX(Math.PI / 2);
  back.translate(0, h / 2, zb + (d - 0.012) / 2);
  P.geometry('back', back, undefined, 'x');
  P.disc('mirror', [0, h / 2, zf - 0.0115], r - 0.006, 'z', 72);
  P.torus('main', [0, h / 2, zf - 0.008], r - 0.006, 0.0075, 'z', 72);
}
