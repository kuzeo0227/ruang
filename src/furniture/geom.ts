// Geometry toolkit for code-built furniture. Pieces are collected per material slot in the item's
// own frame (metres; origin at the centre of the footprint on the floor; front towards +z), with
// UVs in metres so wood grain and fabric weave appear at their real size, then merged per slot.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];
/** Axis the wood grain (texture v direction) should follow. */
export type Grain = 'x' | 'y' | 'z';

function longest(w: number, h: number, d: number): Grain {
  return w >= h && w >= d ? 'x' : h >= d ? 'y' : 'z';
}

/** Box-projected UVs in metres; v follows the grain axis where the face allows it. */
function projectUv(g: THREE.BufferGeometry, grain: Grain) {
  const pos = g.attributes.position!;
  const nor = g.attributes.normal!;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) [u, v] = grain === 'x' ? [z, x] : [x, z];
    else if (nx >= nz) [u, v] = grain === 'z' ? [y, z] : [z, y];
    else [u, v] = grain === 'x' ? [y, x] : [x, y];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.index) {
    const n = g.attributes.position!.count;
    g.setIndex(Array.from({ length: n }, (_, i) => i));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Superellipsoid filling a box: a soft cushion. Lower e means squarer. */
function superellipsoid(a: number, b: number, c: number, e1: number, e2: number, segU = 28, segV = 16): THREE.BufferGeometry {
  // Signed power. sin(π) and cos(π/2) come out around 1e-16, which a small exponent turns into
  // about a millimetre, so they snap to zero; otherwise the cushion has a hairline crack down its middle.
  const sp = (x: number, e: number) => (Math.abs(x) < 1e-9 ? 0 : Math.sign(x) * Math.pow(Math.abs(x), e));
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segV; i++) {
    const v = -Math.PI / 2 + (Math.PI * i) / segV;
    for (let j = 0; j < segU; j++) {
      const u = -Math.PI + (2 * Math.PI * j) / segU;
      const cv = sp(Math.cos(v), e1);
      pos.push(a * cv * sp(Math.cos(u), e2), b * sp(Math.sin(v), e1), c * cv * sp(Math.sin(u), e2));
    }
  }
  // Each ring wraps round to its first vertex, so the seam shares vertices and normals.
  const row = segU;
  for (let i = 0; i < segV; i++) {
    for (let j = 0; j < segU; j++) {
      const p = i * row + j;
      const q = i * row + ((j + 1) % segU);
      idx.push(p, p + row, q, q, p + row, q + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export class Parts {
  readonly slots = new Map<string, THREE.BufferGeometry[]>();

  add(slot: string, g: THREE.BufferGeometry, grain: Grain = 'y') {
    clean(g);
    projectUv(g, grain);
    let list = this.slots.get(slot);
    if (!list) this.slots.set(slot, (list = []));
    list.push(g);
    return g;
  }

  /** Box between two corners; r rounds its edges. */
  box(slot: string, min: V3, max: V3, r = 0, grain?: Grain) {
    const w = Math.abs(max[0] - min[0]);
    const h = Math.abs(max[1] - min[1]);
    const d = Math.abs(max[2] - min[2]);
    if (w < 1e-4 || h < 1e-4 || d < 1e-4) return;
    const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const g = rr > 0.0005 ? new RoundedBoxGeometry(w, h, d, 3, rr) : new THREE.BoxGeometry(w, h, d);
    g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    this.add(slot, g, grain ?? longest(w, h, d));
  }

  /** A soft cushion filling the box; softness 0 (crisp) to 1 (very rounded). */
  cushion(slot: string, min: V3, max: V3, softness = 0.35, grain?: Grain) {
    const w = Math.abs(max[0] - min[0]);
    const h = Math.abs(max[1] - min[1]);
    const d = Math.abs(max[2] - min[2]);
    const e1 = 0.12 + softness * 0.45;
    const e2 = 0.08 + softness * 0.3;
    const g = superellipsoid(w / 2, h / 2, d / 2, e1, e2);
    g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    this.add(slot, g, grain ?? longest(w, h, d));
  }

  /** Box of a given size centred at c, tilted about x by rx and then turned about y by ry. */
  tilted(slot: string, c: V3, size: V3, rx = 0, ry = 0, r = 0, grain?: Grain) {
    const [w, h, d] = size;
    const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const g = rr > 0.0005 ? new RoundedBoxGeometry(w, h, d, 3, rr) : new THREE.BoxGeometry(w, h, d);
    g.rotateX(rx);
    g.rotateY(ry);
    g.translate(...c);
    this.add(slot, g, grain ?? longest(w, h, d));
  }

  /** Cushion of a given size centred at c, tilted about x by rx and turned about y by ry. */
  tiltedCushion(slot: string, c: V3, size: V3, rx = 0, ry = 0, softness = 0.35) {
    const [w, h, d] = size;
    const g = superellipsoid(w / 2, h / 2, d / 2, 0.12 + softness * 0.45, 0.08 + softness * 0.3);
    g.rotateX(rx);
    g.rotateY(ry);
    g.translate(...c);
    this.add(slot, g, longest(w, h, d));
  }

  /** Vertical cylinder or cone standing on y0. */
  cyl(slot: string, x: number, z: number, y0: number, y1: number, r0: number, r1 = r0, seg = 24) {
    const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg);
    g.translate(x, (y0 + y1) / 2, z);
    this.add(slot, g, 'y');
  }

  /** Round rod from a to b. */
  rod(slot: string, a: V3, b: V3, r: number, seg = 12) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    if (len < 1e-5) return;
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    _q.setFromUnitVectors(_up, dir.normalize());
    _m.makeRotationFromQuaternion(_q).setPosition(va.add(vb).multiplyScalar(0.5));
    g.applyMatrix4(_m);
    const ax = Math.abs(dir.x);
    const ay = Math.abs(dir.y);
    const az = Math.abs(dir.z);
    this.add(slot, g, ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z');
  }

  /** Square-section bar from a to b (frames, slats). */
  bar(slot: string, a: V3, b: V3, size: number, r = 0) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    if (len < 1e-5) return;
    const g = r > 0 ? new RoundedBoxGeometry(size, len, size, 2, Math.min(r, size / 2 - 1e-4)) : new THREE.BoxGeometry(size, len, size);
    _q.setFromUnitVectors(_up, dir.clone().normalize());
    _m.makeRotationFromQuaternion(_q).setPosition(va.add(vb).multiplyScalar(0.5));
    g.applyMatrix4(_m);
    const ax = Math.abs(dir.x);
    const ay = Math.abs(dir.y);
    const az = Math.abs(dir.z);
    this.add(slot, g, ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z');
  }

  /** Surface of revolution about a vertical axis at (x, z). Profile: [radius, y] from bottom to top. */
  lathe(slot: string, x: number, z: number, profile: [number, number][], seg = 32) {
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)),
      seg,
    );
    g.translate(x, 0, z);
    this.add(slot, g, 'y');
  }

  sphere(slot: string, c: V3, r: number, seg = 24, scale: V3 = [1, 1, 1]) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.6)));
    g.scale(...scale);
    g.translate(...c);
    this.add(slot, g, 'y');
  }

  /** Ring lying flat (axis vertical), e.g. a burner or a mirror frame when rotated. */
  torus(slot: string, c: V3, R: number, r: number, axis: 'y' | 'z' = 'y', seg = 32) {
    const g = new THREE.TorusGeometry(R, r, 8, seg);
    if (axis === 'y') g.rotateX(Math.PI / 2);
    g.translate(...c);
    this.add(slot, g, 'x');
  }

  /** Flat disc facing +z (axis 'z') or up (axis 'y'). */
  disc(slot: string, c: V3, r: number, axis: 'y' | 'z' | '-y' = 'z', seg = 32) {
    const g = new THREE.CircleGeometry(r, seg);
    if (axis === 'y') g.rotateX(-Math.PI / 2);
    if (axis === '-y') g.rotateX(Math.PI / 2);
    g.translate(...c);
    this.add(slot, g, 'y');
  }

  /** Any geometry, moved by a matrix. */
  geometry(slot: string, g: THREE.BufferGeometry, m?: THREE.Matrix4, grain: Grain = 'y') {
    if (m) g.applyMatrix4(m);
    this.add(slot, g, grain);
  }

  /** Merge every slot into one geometry. */
  build(): Map<string, THREE.BufferGeometry> {
    const out = new Map<string, THREE.BufferGeometry>();
    for (const [slot, list] of this.slots) {
      const merged = list.length === 1 ? list[0]! : mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      out.set(slot, merged);
    }
    return out;
  }
}

/**
 * A plan shape extruded upwards from y0 to y1, with rounded edges of radius `bevel`. Shape
 * coordinates are (x, -z), so a point drawn at (x, y) lands at world (x, -y). Curved walls get
 * smooth normals; corners sharper than 35° stay crisp.
 */
export function extrudeFlat(shape: THREE.Shape, y0: number, y1: number, bevel = 0, curveSegments = 24): THREE.BufferGeometry {
  const b = Math.min(bevel, (y1 - y0) / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: y1 - y0 - 2 * Math.max(b, 0),
    curveSegments,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 3,
  });
  g.translate(0, 0, Math.max(b, 0));
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  g.deleteAttribute('uv');
  return toCreasedNormals(g, (35 * Math.PI) / 180);
}

/**
 * A side profile extruded across x from x0 to x1, with rounded edges. Shape coordinates are
 * (z, y): x of the drawing becomes world z.
 */
export function extrudeSide(shape: THREE.Shape, x0: number, x1: number, bevel = 0, curveSegments = 24): THREE.BufferGeometry {
  const b = Math.min(bevel, (x1 - x0) / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: x1 - x0 - 2 * Math.max(b, 0),
    curveSegments,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 3,
  });
  g.translate(0, 0, Math.max(b, 0));
  g.rotateY(-Math.PI / 2);
  g.translate(x1, 0, 0);
  g.deleteAttribute('uv');
  return toCreasedNormals(g, (35 * Math.PI) / 180);
}

/** An ellipse as a closed path, for shapes and holes. */
export function ellipsePath<T extends THREE.Path>(p: T, cx: number, cy: number, rx: number, ry: number, clockwise = false): T {
  p.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, clockwise, 0);
  return p;
}

/** Rounded rectangle path centred at (cx, cy). */
export function roundRectPath<T extends THREE.Path>(p: T, cx: number, cy: number, w: number, h: number, r: number): T {
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  p.moveTo(x0 + rr, y0);
  p.lineTo(x0 + w - rr, y0);
  p.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rr);
  p.lineTo(x0 + w, y0 + h - rr);
  p.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rr, y0 + h);
  p.lineTo(x0 + rr, y0 + h);
  p.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rr);
  p.lineTo(x0, y0 + rr);
  p.quadraticCurveTo(x0, y0, x0 + rr, y0);
  return p;
}

/** Wavy curtain panel: pleats along x, hanging from y1 down to y0, centred on z. */
export function pleatedPanel(width: number, y0: number, y1: number, depth: number, pleats: number): THREE.BufferGeometry {
  const seg = Math.max(8, pleats * 6);
  const g = new THREE.PlaneGeometry(width, y1 - y0, seg, 1);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const t = (x / width + 0.5) * pleats * Math.PI * 2;
    pos.setZ(i, (Math.sin(t) * depth) / 2);
  }
  g.translate(0, (y0 + y1) / 2, 0);
  g.computeVertexNormals();
  return g;
}
