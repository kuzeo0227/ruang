// Accumulates flat-shaded triangles with world-space UVs (1 UV unit = 1 metre).
// UVs follow each face's orientation: walls get (along-the-wall, height), floors and ceilings (x, z),
// so textures keep their real-world scale and continue across neighbouring faces.

import * as THREE from 'three';

export type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const v3 = { sub, add, scale, cross, norm };

const UP: V3 = [0, 1, 0];

/** UV for a point on a face with the given normal: (right, up) for walls, (x, z) for floors and ceilings. */
function faceUv(p: V3, n: V3): [number, number] {
  if (Math.abs(n[1]) > 0.7) return [p[0], n[1] > 0 ? -p[2] : p[2]];
  const right = norm(cross(UP, n));
  return [p[0] * right[0] + p[2] * right[2], p[1]];
}

export class Batch {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];

  get triangles() {
    return this.pos.length / 9;
  }

  tri(a: V3, b: V3, c: V3, n?: V3) {
    const nn = n ?? norm(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nn[0], nn[1], nn[2]);
      const [u, v] = faceUv(p, nn);
      this.uv.push(u, v);
    }
  }

  /** Quad with corners in counter-clockwise order seen from the front. */
  quad(a: V3, b: V3, c: V3, d: V3) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    this.tri(a, b, c, n);
    this.tri(a, c, d, n);
  }

  /** Rectangle from `o` spanning w along unit vector u and h along unit vector v; normal is u × v. */
  rect(o: V3, u: V3, v: V3, w: number, h: number) {
    if (w <= 1e-6 || h <= 1e-6) return;
    const a = o;
    const b = add(o, scale(u, w));
    const c = add(b, scale(v, h));
    const d = add(o, scale(v, h));
    this.quad(a, b, c, d);
  }

  /** Vertical rectangle facing outward normal n (horizontal), from along-start s0 to s1 on the line through `base`. */
  wallRect(base: V3, along: V3, n: V3, s0: number, s1: number, y0: number, y1: number) {
    // u must equal up × n so that u × up = n (front face towards n).
    const u = norm(cross(UP, n));
    const flip = u[0] * along[0] + u[2] * along[2] < 0;
    const p = (s: number, y: number): V3 => [base[0] + along[0] * s, y, base[2] + along[2] * s];
    const [sa, sb] = flip ? [s1, s0] : [s0, s1];
    this.quad(p(sa, y0), p(sb, y0), p(sb, y1), p(sa, y1));
  }

  /** Oriented box: centre, three orthonormal axes and half sizes. All six faces. */
  obb(c: V3, ax: V3, ay: V3, az: V3, hx: number, hy: number, hz: number) {
    const corner = (sx: number, sy: number, sz: number): V3 =>
      add(add(add(c, scale(ax, sx * hx)), scale(ay, sy * hy)), scale(az, sz * hz));
    const faces: [number, number, number][][] = [
      [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]],
      [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]],
      [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]],
      [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]],
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
      [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
    ];
    // Corner order above is counter-clockwise for a right-handed (ax, ay, az) frame.
    const handed = Math.sign(
      cross(ax, ay)[0] * az[0] + cross(ax, ay)[1] * az[1] + cross(ax, ay)[2] * az[2],
    );
    for (const f of faces) {
      const pts = f.map(([x, y, z]) => corner(x, y, z)) as [V3, V3, V3, V3];
      if (handed >= 0) this.quad(pts[0], pts[1], pts[2], pts[3]);
      else this.quad(pts[3], pts[2], pts[1], pts[0]);
    }
  }

  /** Axis-aligned box from min to max corner. */
  aabb(min: V3, max: V3) {
    const c: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    this.obb(c, [1, 0, 0], [0, 1, 0], [0, 0, 1], (max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2);
  }

  /** Horizontal polygon (x, z points) at height y, facing up or down. */
  polygonXZ(points: [number, number][], y: number, up: boolean) {
    const contour = points.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const n: V3 = [0, up ? 1 : -1, 0];
    for (const t of tris) {
      const [i, j, k] = t as [number, number, number];
      const a: V3 = [points[i]![0], y, points[i]![1]];
      const b: V3 = [points[j]![0], y, points[j]![1]];
      const c: V3 = [points[k]![0], y, points[k]![1]];
      const facing = cross(sub(b, a), sub(c, a))[1];
      if ((facing > 0) === up) this.tri(a, b, c, n);
      else this.tri(a, c, b, n);
    }
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
