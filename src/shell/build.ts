// Builds the 3D shell of a unit from its plan data: walls with openings and reveals, floors,
// ceilings, slabs, skirting, thresholds, window and door joinery, balustrade, louvres and the
// common corridor outside the front door. Plan logic runs in millimetres; 3D output is metres.
//
// Walls are the boundary of the union of all solid wall footprints, so every visible wall face
// exists exactly once (no overlapping faces at junctions). Each face is split by the space it
// faces, which decides its finish and lighting zone.

import polygonClipping from 'polygon-clipping';
import type { Opening, RoomId, UnitPlan, Vec2 } from '../plan/types';
import { Batch, v3, type V3 } from './batch';
import { clipIntervals, pointInPolygon, polygonBounds, polygonCentroid, scanIntervals, subtractIntervals, type Interval } from './geom2d';
import type { Aperture, Downlight, Rect, Role, ShellData, SlidingPanel, Space, SpaceId, SwingDoor, WallSwitch, Zone, ZoneId } from './types';

export const CEIL = 2.75;
const SLAB = 0.2;
const MM = 0.001;
const WALL_BOTTOM = -0.06;
const SKIRT_H = 0.09;
const SKIRT_D = 0.012;
const UP: V3 = [0, 1, 0];

const ZONE_OF: Record<SpaceId, ZoneId> = {
  living: 'lounge',
  dining: 'lounge',
  kitchen: 'lounge',
  corridor: 'lounge',
  foyer: 'foyer',
  bedroom1: 'bedroom1',
  bedroom2: 'bedroom2',
  study: 'study',
  toilet1: 'toilet1',
  toilet2: 'toilet2',
  yard: 'yard',
  balcony: 'balcony',
  ac1: 'ac1',
  ac2: 'ac2',
  common: 'common',
};

const FLOOR_ROLE: Record<SpaceId, Role> = {
  living: 'floorMain',
  dining: 'floorMain',
  kitchen: 'floorMain',
  corridor: 'floorMain',
  foyer: 'floorMain',
  bedroom1: 'floorBedroom',
  bedroom2: 'floorBedroom',
  study: 'floorBedroom',
  toilet1: 'floorWet',
  toilet2: 'floorWet',
  yard: 'floorWet',
  balcony: 'floorWet',
  ac1: 'floorService',
  ac2: 'floorService',
  common: 'floorCommon',
};

function wallRoleFor(space: Space | null): Role {
  if (!space) return 'facade';
  switch (space.kind) {
    case 'dry':
      return 'wallPaint';
    case 'wet':
      return 'wallWet';
    case 'common':
      return 'wallCommon';
    default:
      return 'wallOutdoor';
  }
}

interface PlanWall {
  id: string;
  kind: string;
  t: number; // mm
  axis: 'x' | 'z'; // direction the wall runs: x = east-west (plan y constant), z = north-south
  c: number; // across coordinate (plan y for x-walls, plan x for z-walls), mm
  lo: number; // along range, mm
  hi: number;
  dirSign: 1 | -1; // +1 if wall.b is further along than wall.a
  leftNormalSign: 1 | -1; // sign along the across axis of the plan left normal (-dy, dx)
  openings: PlanOpening[];
}

interface PlanOpening {
  spec: Opening;
  wall: PlanWall;
  s0: number; // along, mm
  s1: number;
  y0: number; // metres; -Infinity = from the floor
  y1: number;
}

/** 3D point from (along, across, height): along/across in mm on a wall of the given axis. */
function P(axis: 'x' | 'z', along: number, across: number, y: number): V3 {
  return axis === 'x' ? [along * MM, y, across * MM] : [across * MM, y, along * MM];
}
const alongVec = (axis: 'x' | 'z'): V3 => (axis === 'x' ? [1, 0, 0] : [0, 0, 1]);
const acrossVec = (axis: 'x' | 'z'): V3 => (axis === 'x' ? [0, 0, 1] : [1, 0, 0]);

export interface BuildOptions {
  /** Extra space outside the front door (the building's common corridor). */
  corridor?: boolean;
}

export function buildShell(plan: UnitPlan, opts: BuildOptions = {}): ShellData {
  const batches = new Map<string, { zone: ZoneId; role: Role; batch: Batch }>();
  const B = (zone: ZoneId, role: Role) => {
    const key = `${zone}|${role}`;
    let entry = batches.get(key);
    if (!entry) {
      entry = { zone, role, batch: new Batch() };
      batches.set(key, entry);
    }
    return entry.batch;
  };

  // ---------- Spaces ----------
  const room = (id: RoomId) => plan.rooms.find((r) => r.id === id)!;
  const W = plan.width;
  const yF = plan.depth;
  const foyer = room('foyer');
  const foyerLeft = Math.min(...foyer.polygon.map((p) => p.x));

  const spaces: Space[] = plan.rooms.map((r) => ({
    id: r.id,
    zone: ZONE_OF[r.id],
    polygon: r.polygon,
    floorY: -r.floorDrop * MM,
    kind: r.kind,
  }));
  const corridorDepth = 1800;
  if (opts.corridor !== false) {
    spaces.push({
      id: 'common',
      zone: 'common',
      polygon: [
        { x: foyerLeft - 1500, y: yF },
        { x: W + 1500, y: yF },
        { x: W + 1500, y: yF + corridorDepth },
        { x: foyerLeft - 1500, y: yF + corridorDepth },
      ],
      floorY: 0,
      kind: 'common',
    });
  }
  const spaceAt = (x: number, y: number): Space | null => spaces.find((s) => pointInPolygon({ x, y }, s.polygon)) ?? null;

  // ---------- Walls ----------
  const planWalls = [...plan.walls];
  if (opts.corridor !== false) {
    const cw = (id: string, a: Vec2, b: Vec2) => planWalls.push({ id, a, b, thickness: 150, height: CEIL * 1000, kind: 'exterior', openings: [] });
    cw('common-south', { x: foyerLeft - 1500, y: yF + corridorDepth }, { x: W + 1500, y: yF + corridorDepth });
    cw('common-west', { x: foyerLeft - 1500, y: yF }, { x: foyerLeft - 1500, y: yF + corridorDepth });
    cw('common-east', { x: W + 1500, y: yF }, { x: W + 1500, y: yF + corridorDepth });
    cw('common-north-east', { x: W, y: yF }, { x: W + 1500, y: yF });
  }

  const walls: PlanWall[] = planWalls.map((w) => {
    const axis = w.a.y === w.b.y ? 'x' : 'z';
    const aAlong = axis === 'x' ? w.a.x : w.a.y;
    const bAlong = axis === 'x' ? w.b.x : w.b.y;
    const dirSign: 1 | -1 = bAlong >= aAlong ? 1 : -1;
    const dx = w.b.x - w.a.x;
    const dy = w.b.y - w.a.y;
    // Plan left normal n = (-dy, dx); its component along the across axis.
    const nAcross = axis === 'x' ? dx : -dy;
    const pw: PlanWall = {
      id: w.id,
      kind: w.kind,
      t: w.thickness,
      axis,
      c: axis === 'x' ? w.a.y : w.a.x,
      lo: Math.min(aAlong, bAlong),
      hi: Math.max(aAlong, bAlong),
      dirSign,
      leftNormalSign: nAcross >= 0 ? 1 : -1,
      openings: [],
    };
    pw.openings = w.openings.map((o) => {
      const s0 = dirSign > 0 ? aAlong + o.offset : aAlong - o.offset - o.width;
      let y0 = -Infinity;
      let y1 = CEIL;
      if (o.kind === 'door') y1 = o.height * MM;
      if (o.kind === 'slidingDoor') y1 = o.height * MM;
      if (o.kind === 'window' || o.kind === 'bayWindow') {
        y0 = o.sill * MM;
        y1 = o.head * MM;
      }
      return { spec: o, wall: pw, s0, s1: s0 + o.width, y0, y1 };
    });
    return pw;
  });
  const solid = walls.filter((w) => w.kind === 'exterior' || w.kind === 'interior');

  // ---------- Union of solid wall footprints ----------
  const rectRing = (w: PlanWall): [number, number][] => {
    const h = w.t / 2;
    const [a0, a1, c0, c1] = [w.lo - h, w.hi + h, w.c - h, w.c + h];
    return w.axis === 'x'
      ? [[a0, c0], [a1, c0], [a1, c1], [a0, c1], [a0, c0]]
      : [[c0, a0], [c1, a0], [c1, a1], [c0, a1], [c0, a0]];
  };
  const footprint = polygonClipping.union([rectRing(solid[0]!)], ...solid.slice(1).map((w) => [rectRing(w)]));
  const inFootprint = (x: number, y: number) =>
    footprint.some((poly) => {
      const ring = (r: [number, number][]) => r.map(([px, py]) => ({ x: px, y: py }));
      if (!pointInPolygon({ x, y }, ring(poly[0]!))) return false;
      return !poly.slice(1).some((hole) => pointInPolygon({ x, y }, ring(hole)));
    });

  interface Edge {
    axis: 'x' | 'z';
    c: number; // across coordinate of the face plane, mm
    lo: number;
    hi: number;
    n: 1 | -1; // outward normal sign along the across axis
  }
  const edgesOf = (multi: [number, number][][][]): Edge[] => {
    const out: Edge[] = [];
    for (const poly of multi) {
      for (const ring of poly) {
        // Drop the closing duplicate and collinear points.
        const pts = ring.slice(0, -1);
        const clean: [number, number][] = [];
        for (let i = 0; i < pts.length; i++) {
          const prev = pts[(i - 1 + pts.length) % pts.length]!;
          const cur = pts[i]!;
          const next = pts[(i + 1) % pts.length]!;
          const collinear = (prev[0] === cur[0] && cur[0] === next[0]) || (prev[1] === cur[1] && cur[1] === next[1]);
          if (!collinear) clean.push(cur);
        }
        for (let i = 0; i < clean.length; i++) {
          const p = clean[i]!;
          const q = clean[(i + 1) % clean.length]!;
          if (p[1] === q[1]) out.push({ axis: 'x', c: p[1], lo: Math.min(p[0], q[0]), hi: Math.max(p[0], q[0]), n: 1 });
          else if (p[0] === q[0]) out.push({ axis: 'z', c: p[0], lo: Math.min(p[1], q[1]), hi: Math.max(p[1], q[1]), n: 1 });
        }
      }
    }
    return out;
  };
  const wallEdges = edgesOf(footprint as [number, number][][][]);
  for (const e of wallEdges) {
    const mid = (e.lo + e.hi) / 2;
    const probe = (sign: number) => (e.axis === 'x' ? inFootprint(mid, e.c + sign * 2) : inFootprint(e.c + sign * 2, mid));
    e.n = probe(1) ? -1 : 1;
  }

  // ---------- Face intervals ----------
  interface FaceInterval {
    edge: Edge;
    s0: number;
    s1: number;
    space: Space | null;
    role: Role;
  }
  const intervals: FaceInterval[] = [];
  for (const e of wallEdges) {
    const at = e.c + e.n * 3;
    const covered: { iv: Interval; space: Space }[] = [];
    for (const s of spaces) {
      for (const iv of clipIntervals(scanIntervals(s.polygon, e.axis === 'x' ? 'y' : 'x', at), e.lo, e.hi)) covered.push({ iv, space: s });
    }
    for (const { iv, space } of covered) intervals.push({ edge: e, s0: iv[0], s1: iv[1], space, role: wallRoleFor(space) });
    for (const iv of subtractIntervals([[e.lo, e.hi]], covered.map((c) => c.iv))) intervals.push({ edge: e, s0: iv[0], s1: iv[1], space: null, role: 'facade' });
  }

  // The living room's longest wall gets the style's feature finish.
  const featureCandidates = intervals.filter((f) => f.space?.id === 'living' && f.role === 'wallPaint');
  const feature = featureCandidates.sort((a, b) => b.s1 - b.s0 - (a.s1 - a.s0))[0];
  if (feature && feature.s1 - feature.s0 > 2500) feature.role = 'wallFeature';

  // Openings lying on a face: same axis, plane at the wall's centre ± t/2 on the outward side.
  const openingsOnEdge = (e: Edge): PlanOpening[] => {
    const out: PlanOpening[] = [];
    for (const w of walls) {
      if (w.axis !== e.axis || !w.openings.length) continue;
      if (Math.abs(w.c + (e.n * w.t) / 2 - e.c) > 0.5) continue;
      for (const o of w.openings) if (o.s1 > e.lo && o.s0 < e.hi) out.push(o);
    }
    return out;
  };

  // ---------- Wall faces, skirting ----------
  for (const f of intervals) {
    const e = f.edge;
    const zone: ZoneId = f.space ? f.space.zone : 'exterior';
    const batch = B(zone, f.role);
    const nVec = v3.scale(acrossVec(e.axis), e.n);
    const base = P(e.axis, 0, e.c, 0);
    const along = alongVec(e.axis);
    const yb = f.space ? WALL_BOTTOM : -0.03;
    const yt = CEIL;
    const holes = openingsOnEdge(e).map((o) => ({ o, iv: [Math.max(o.s0, f.s0), Math.min(o.s1, f.s1)] as Interval })).filter((h) => h.iv[1] > h.iv[0]);
    const cuts = new Set<number>([f.s0, f.s1]);
    for (const h of holes) cuts.add(h.iv[0]).add(h.iv[1]);
    const xs = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i++) {
      const a = xs[i]!;
      const b = xs[i + 1]!;
      const m = (a + b) / 2;
      const active = holes.filter((h) => h.iv[0] <= m && m <= h.iv[1]);
      let free: Interval[] = [[yb, yt]];
      for (const h of active) free = subtractIntervals(free, [[h.o.y0 === -Infinity ? yb - 1 : h.o.y0, h.o.y1]]);
      for (const [y0, y1] of free) batch.wallRect(base, along, nVec, a * MM, b * MM, y0, y1);
    }
    // Skirting along dry, painted walls, interrupted by openings that reach the floor.
    if (f.space && (f.role === 'wallPaint' || f.role === 'wallFeature' || f.role === 'wallCommon')) {
      const floorCuts = holes.filter((h) => h.o.y0 === -Infinity).map((h) => h.iv);
      const sk = B(zone, 'skirting');
      for (const [a, b] of subtractIntervals([[f.s0, f.s1]], floorCuts)) {
        const c0 = e.c * MM;
        const c1 = c0 + e.n * SKIRT_D;
        const y0 = f.space.floorY;
        const min = P(e.axis, a, 0, y0);
        const max = P(e.axis, b, 0, y0 + SKIRT_H);
        if (e.axis === 'x') sk.aabb([min[0], y0, Math.min(c0, c1)], [max[0], y0 + SKIRT_H, Math.max(c0, c1)]);
        else sk.aabb([Math.min(c0, c1), y0, min[2]], [Math.max(c0, c1), y0 + SKIRT_H, max[2]]);
      }
    }
  }

  // ---------- Daylight apertures ----------
  const apertures: Aperture[] = [];
  const indoor = (sp: Space | null) => !!sp && (sp.kind === 'dry' || sp.kind === 'wet' || sp.kind === 'common');
  const addAperture = (id: string, zone: ZoneId, axis: 'x' | 'z', s0: number, s1: number, face: number, y0: number, y1: number, inSign: number, depth: number, transmit: number) => {
    const normal = v3.scale(acrossVec(axis), inSign);
    let origin = P(axis, s0, face, y0);
    let u = v3.scale(alongVec(axis), (s1 - s0) * MM);
    const v: V3 = [0, y1 - y0, 0];
    const c = v3.cross(u, v);
    if (c[0] * normal[0] + c[1] * normal[1] + c[2] * normal[2] > 0) {
      origin = v3.add(origin, u);
      u = v3.scale(u, -1);
    }
    apertures.push({ id, zone, origin, u, v, normal, depth: depth * MM, transmit });
  };

  // ---------- Light switches ----------
  // Plates 1.3 m up beside the doors, clear of the architrave. A plate goes where the wall is solid
  // for its whole width and it sits inside the space it faces.
  const switches: WallSwitch[] = [];
  const lounge = (['living', 'dining', 'kitchen', 'corridor'] as RoomId[]).filter((id) => plan.rooms.some((r) => r.id === id));
  const plateHalf = (gangs: number) => (gangs > 3 ? 73 : 43);
  const addSwitch = (id: string, w: PlanWall, along: number, side: 1 | -1, at: Space, rooms: RoomId[]): boolean => {
    const half = plateHalf(rooms.length);
    const reach = half + 30 + 75;
    if (along - reach < w.lo || along + reach > w.hi) return false;
    // Doors have 65 mm architraves; other openings only their frames.
    const clear = (o: PlanOpening) => (o.spec.kind === 'door' ? 75 : 25);
    if (w.openings.some((o) => along + half > o.s0 - clear(o) && along - half < o.s1 + clear(o))) return false;
    const face = w.c + side * (w.t / 2);
    const inside = (a: number) => {
      const q = w.axis === 'x' ? { x: a, y: face + side * 30 } : { x: face + side * 30, y: a };
      return pointInPolygon(q, at.polygon);
    };
    if (!inside(along - reach) || !inside(along + reach)) return false;
    switches.push({ id, rooms, zone: at.zone, position: P(w.axis, along, face, at.floorY + 1.3), normal: v3.scale(acrossVec(w.axis), side), gangs: rooms.length });
    return true;
  };

  // ---------- Openings: reveals, joinery, doors ----------
  const doors: SwingDoor[] = [];
  const sliders: SlidingPanel[] = [];
  const style = { frame: 0.05, frameDepth: 0.07 };

  for (const w of solid) {
    for (const o of w.openings) {
      const t = w.t;
      const mid = (o.s0 + o.s1) / 2;
      const sideSpace = (sign: number) => {
        const across = w.c + sign * (t / 2 + 5);
        return w.axis === 'x' ? spaceAt(mid, across) : spaceAt(across, mid);
      };
      const plus = sideSpace(1);
      const minus = sideSpace(-1);
      const rank = (s: Space | null) => (!s ? 0 : s.kind === 'dry' || s.kind === 'wet' ? 3 : s.kind === 'common' ? 2 : 1);
      const inSign: 1 | -1 = rank(plus) >= rank(minus) ? 1 : -1;
      const inside = inSign > 0 ? plus : minus;
      const zone: ZoneId = inside ? inside.zone : 'exterior';
      const across0 = w.c - t / 2;
      const across1 = w.c + t / 2;
      const floorY = Math.max(plus?.floorY ?? 0, minus?.floorY ?? 0);
      const lowY = Math.min(plus?.floorY ?? 0, minus?.floorY ?? 0);
      const y0 = o.y0 === -Infinity ? floorY : o.y0;
      const y1 = o.y1;
      const A = alongVec(w.axis);
      const N = acrossVec(w.axis);
      const kind = o.spec.kind;

      // Reveals (doors are lined with timber instead).
      if (kind !== 'door') {
        const rv = B(zone, wallRoleFor(inside));
        const jambBase = (s: number) => P(w.axis, s, 0, 0);
        rv.wallRect(jambBase(o.s0), N, A, across0 * MM, across1 * MM, y0, y1);
        rv.wallRect(jambBase(o.s1), N, v3.scale(A, -1), across0 * MM, across1 * MM, y0, y1);
        // Head soffit, facing down.
        const h0 = P(w.axis, o.s0, across0, y1);
        const h1 = P(w.axis, o.s1, across0, y1);
        const h2 = P(w.axis, o.s1, across1, y1);
        const h3 = P(w.axis, o.s0, across1, y1);
        rv.quad(h0, h3, h2, h1);
        if (o.y0 !== -Infinity) {
          const s0p = P(w.axis, o.s0, across0, y0);
          const s1p = P(w.axis, o.s1, across0, y0);
          const s2p = P(w.axis, o.s1, across1, y0);
          const s3p = P(w.axis, o.s0, across1, y0);
          rv.quad(s0p, s1p, s2p, s3p);
        }
      }

      // Threshold kerb where the two sides' floors differ (toilets, balcony, yard).
      if ((kind === 'door' || kind === 'slidingDoor') && floorY - lowY > 0.004) {
        const k = B(zone, 'stone');
        const min = P(w.axis, o.s0, across0, lowY - 0.01);
        const max = P(w.axis, o.s1, across1, floorY + 0.006);
        k.aabb([Math.min(min[0], max[0]), lowY - 0.01, Math.min(min[2], max[2])], [Math.max(min[0], max[0]), floorY + 0.006, Math.max(min[2], max[2])]);
      }

      const box = (b: Batch, s0: number, s1: number, a0: number, a1: number, yy0: number, yy1: number) => {
        const p0 = P(w.axis, s0, a0, yy0);
        const p1 = P(w.axis, s1, a1, yy1);
        b.aabb([Math.min(p0[0], p1[0]), Math.min(yy0, yy1), Math.min(p0[2], p1[2])], [Math.max(p0[0], p1[0]), Math.max(yy0, yy1), Math.max(p0[2], p1[2])]);
      };
      const outSign = -inSign;
      const outside = inSign > 0 ? minus : plus;
      if ((kind === 'window' || kind === 'bayWindow' || kind === 'slidingDoor') && indoor(inside) && !indoor(outside)) {
        addAperture(o.spec.id, zone, w.axis, o.s0, o.s1, w.c + inSign * (t / 2), y0, y1, inSign, t, kind === 'slidingDoor' ? 0.8 : 0.72);
      }

      if (kind === 'window' || kind === 'bayWindow') {
        // Aluminium frame set towards the outside face, mullions about every 650 mm, glass, inner sill.
        const fr = B(zone, 'frame');
        const gl = B(zone, 'glass');
        const fw = style.frame * 1000;
        const fd = style.frameDepth * 1000;
        const fc = w.c + outSign * (t / 2 - fd / 2 - 15);
        const a0 = fc - fd / 2;
        const a1 = fc + fd / 2;
        box(fr, o.s0, o.s0 + fw, a0, a1, y0, y1);
        box(fr, o.s1 - fw, o.s1, a0, a1, y0, y1);
        box(fr, o.s0, o.s1, a0, a1, y0, y0 + fw * MM);
        box(fr, o.s0, o.s1, a0, a1, y1 - fw * MM, y1);
        const width = o.s1 - o.s0 - 2 * fw;
        const panes = Math.max(1, Math.round(width / 650));
        const mw = 40;
        const pane = (width - (panes - 1) * mw) / panes;
        let s = o.s0 + fw;
        for (let i = 0; i < panes; i++) {
          const e0 = s;
          const e1 = s + pane;
          gl.rect(P(w.axis, e0, fc, y0 + fw * MM), A, UP, (e1 - e0) * MM, y1 - y0 - 2 * fw * MM);
          if (i < panes - 1) box(fr, e1, e1 + mw, a0 + 10, a1 - 10, y0 + fw * MM, y1 - fw * MM);
          s = e1 + mw;
        }
        // Tall windows get a transom at 1.2 m.
        if (y1 - y0 > 1.5) box(fr, o.s0 + fw, o.s1 - fw, a0 + 10, a1 - 10, y0 + 1.2 - 0.02, y0 + 1.2 + 0.02);
        // Inner sill board in the style's worktop material.
        const sillIn = w.c + inSign * (t / 2 + 20);
        box(B(zone, 'stone'), o.s0 - 30, o.s1 + 30, Math.min(sillIn, fc), Math.max(sillIn, fc), y0 - 0.02, y0);
      }

      if (kind === 'slidingDoor') {
        // Outer frame, a fixed panel on the outside track and a sliding panel on the inside track.
        const fr = B(zone, 'frame');
        const gl = B(zone, 'glass');
        const fd = 100;
        const fc = w.c + outSign * (t / 2 - fd / 2 - 10);
        const a0 = fc - fd / 2;
        const a1 = fc + fd / 2;
        const top = y1;
        box(fr, o.s0, o.s0 + 50, a0, a1, floorY, top);
        box(fr, o.s1 - 50, o.s1, a0, a1, floorY, top);
        box(fr, o.s0, o.s1, a0, a1, top - 0.05, top);
        box(fr, o.s0, o.s1, a0, a1, floorY, floorY + 0.03);
        const clear0 = o.s0 + 50;
        const clear1 = o.s1 - 50;
        const panelW = (clear1 - clear0) / 2 + 25;
        const ph0 = floorY + 0.03 + 0.005;
        const ph1 = top - 0.05 - 0.005;
        const panel = (b: Batch, g: Batch, s0: number, trackC: number) => {
          const d0 = trackC - 18;
          const d1 = trackC + 18;
          box(b, s0, s0 + 60, d0, d1, ph0, ph1);
          box(b, s0 + panelW - 60, s0 + panelW, d0, d1, ph0, ph1);
          box(b, s0 + 60, s0 + panelW - 60, d0, d1, ph0, ph0 + 0.09);
          box(b, s0 + 60, s0 + panelW - 60, d0, d1, ph1 - 0.06, ph1);
          g.rect(P(w.axis, s0 + 60, trackC, ph0 + 0.09), A, UP, (panelW - 120) * MM, ph1 - 0.06 - ph0 - 0.09);
        };
        const outerTrack = fc + outSign * 25;
        const innerTrack = fc - outSign * 25;
        // Fixed panel at the far end, sliding panel at the near end; it slides behind the fixed one.
        panel(fr, gl, clear1 - panelW, outerTrack);
        const pb = new Batch();
        const pg = new Batch();
        panel(pb, pg, clear0, innerTrack);
        // Pull handle on the sliding panel's leading stile.
        box(pb, clear0 + 15, clear0 + 30, innerTrack - inSign * 40, innerTrack - inSign * 28, 0.95, 1.25);
        box(pb, clear0 + 15, clear0 + 30, innerTrack + inSign * 28, innerTrack + inSign * 40, 0.95, 1.25);
        const travel = (panelW - 70) * MM;
        sliders.push({
          id: o.spec.id,
          zone,
          slideDir: A,
          travel,
          defaultOpen: 1,
          pieces: [
            { role: 'frame', geometry: pb.toGeometry() },
            { role: 'glass', geometry: pg.toGeometry() },
          ],
          axis: w.axis,
          across: [across0 * MM, across1 * MM],
          fixedSpan: [(clear1 - panelW) * MM, o.s1 * MM],
          slideSpan: [o.s0 * MM, (clear0 + panelW) * MM],
          centre: P(w.axis, mid, w.c, 1.2),
        });
        // The balcony light's switch, inside by the sliding panel's handle (or the other end).
        if (inside && outside && indoor(inside) && !indoor(outside)) {
          const rooms = [outside.id as RoomId];
          const half = plateHalf(1);
          if (!addSwitch(`${o.spec.id}-switch`, w, o.s0 - 30 - half, inSign, inside, rooms)) addSwitch(`${o.spec.id}-switch`, w, o.s1 + 30 + half, inSign, inside, rooms);
        }
      }

      if (kind === 'door') {
        const spec = o.spec as Extract<Opening, { kind: 'door' }>;
        // Swing side in world: swingSide × plan left normal.
        const swingAcross = spec.swingSide * w.leftNormalSign;
        // A door is lit as the room it swings into, where its leaf spends its open life; the main
        // door's other side is the foyer recess outside the unit.
        const into = swingAcross > 0 ? plus : minus;
        const doorZone: ZoneId = into && indoor(into) ? into.zone : zone;
        const tm = B(doorZone, 'timber');
        const lin = 20;
        const head = y1;
        // Linings across the full wall thickness, and architraves on both faces.
        box(tm, o.s0, o.s0 + lin, across0, across1, lowY, head);
        box(tm, o.s1 - lin, o.s1, across0, across1, lowY, head);
        box(tm, o.s0, o.s1, across0, across1, head - lin * MM, head);
        for (const side of [-1, 1]) {
          const f0 = side > 0 ? across1 : across0 - 12;
          const f1 = side > 0 ? across1 + 12 : across0;
          const sideFloor = (side > 0 ? plus : minus)?.floorY ?? 0;
          box(tm, o.s0 - 65, o.s0, f0, f1, sideFloor, head + 0.065);
          box(tm, o.s1, o.s1 + 65, f0, f1, sideFloor, head + 0.065);
          box(tm, o.s0 - 65, o.s1 + 65, f0, f1, head, head + 0.065);
        }
        // Leaf, in its own frame: +x from hinge to free edge, +z = x × up.
        const hingeAtS0 = (spec.hinge === 'a') === (w.dirSign > 0);
        const hingeAlong = hingeAtS0 ? o.s0 + lin + 2 : o.s1 - lin - 2;
        const Ldir: V3 = v3.scale(A, hingeAtS0 ? 1 : -1);
        const zLocal = v3.cross(Ldir, UP);
        const S: V3 = v3.scale(N, swingAcross);
        const sDotZ = S[0] * zLocal[0] + S[2] * zLocal[2];
        const thick = spec.role === 'main' ? 0.05 : 0.04;
        const hingeAcross = w.c + swingAcross * (t / 2 - 10);
        const hinge = P(w.axis, hingeAlong, hingeAcross, lowY);
        const leafW = (o.s1 - o.s0 - 2 * lin - 3) * MM;
        const leafH = head - lin * MM - 0.012 - lowY;
        // In local coordinates the leaf lies on the non-swing side of the hinge axis.
        const zSign = sDotZ > 0 ? -1 : 1;
        const lb = new Batch();
        const hb = new Batch();
        const z0 = zSign > 0 ? 0 : -thick;
        const z1 = zSign > 0 ? thick : 0;
        lb.aabb([0.002, 0.012, z0], [0.002 + leafW, 0.012 + leafH, z1]);
        // Lever handles on both faces.
        const hx = leafW - 0.065;
        const hy = 1.0 - lowY;
        for (const face of [z0, z1]) {
          const out = face === z1 ? 1 : -1;
          hb.aabb([hx - 0.026, hy - 0.026, face + (out > 0 ? 0 : -0.012)], [hx + 0.026, hy + 0.026, face + (out > 0 ? 0.012 : 0)]);
          const zz = face + out * 0.05;
          hb.aabb([hx - 0.135, hy - 0.009, Math.min(zz, zz + out * 0.018)], [hx + 0.009, hy + 0.009, Math.max(zz, zz + out * 0.018)]);
          hb.aabb([hx - 0.008, hy - 0.008, Math.min(face, zz)], [hx + 0.008, hy + 0.008, Math.max(face, zz)]);
        }
        const r0 = P(w.axis, o.s0, across0, 0);
        const r1 = P(w.axis, o.s1, across1, 0);
        doors.push({
          id: spec.id,
          zone: doorZone,
          role: spec.role,
          hinge,
          rotationY: Math.atan2(-Ldir[2], Ldir[0]),
          openSign: sDotZ > 0 ? -1 : 1,
          maxAngle: (spec.role === 'toilet' ? 95 : 100) * (Math.PI / 180),
          defaultOpen: spec.role === 'main' || spec.role === 'service' ? 0 : spec.role === 'toilet' ? 0.75 : 1,
          pieces: [
            { role: 'timber', geometry: lb.toGeometry() },
            { role: 'metal', geometry: hb.toGeometry() },
          ],
          closedRect: { x0: Math.min(r0[0], r1[0]), z0: Math.min(r0[2], r1[2]), x1: Math.max(r0[0], r1[0]), z1: Math.max(r0[2], r1[2]) },
          centre: P(w.axis, mid, w.c, 1.0),
        });

        // Its light switch: on the latch side, so the open leaf never covers it. Rooms are switched
        // from inside, toilets and the yard from outside (as is usual in Malaysia), and the
        // living areas from a plate inside the front door.
        const other = into === plus ? minus : plus;
        const intoSide: 1 | -1 = swingAcross > 0 ? 1 : -1;
        let plate: { at: Space | null; side: 1 | -1; rooms: RoomId[] } | null = null;
        if (spec.role === 'main') plate = { at: into, side: intoSide, rooms: lounge };
        else if (spec.role === 'room' && into) plate = { at: into, side: intoSide, rooms: [into.id as RoomId] };
        else {
          const room = [plus, minus].find((sp) => sp && (spec.role === 'toilet' ? sp.kind === 'wet' : sp.kind === 'outdoor'));
          const at = room === plus ? minus : plus;
          if (room) plate = { at, side: at === plus ? 1 : -1, rooms: [room.id as RoomId] };
        }
        if (plate?.at && indoor(plate.at) && plate.rooms.length) {
          const half = plateHalf(plate.rooms.length);
          const latch = hingeAtS0 ? o.s1 + 65 + 30 + half : o.s0 - 65 - 30 - half;
          const hingeSide = hingeAtS0 ? o.s0 - 65 - 30 - half : o.s1 + 65 + 30 + half;
          // Beside the hinge only if the leaf swings away from the plate.
          if (!addSwitch(`${spec.id}-switch`, w, latch, plate.side, plate.at, plate.rooms) && plate.at === other) addSwitch(`${spec.id}-switch`, w, hingeSide, plate.side, plate.at, plate.rooms);
        }
      }
    }
  }

  // ---------- Non-solid walls: balustrade, louvres, parapet, glass partition ----------
  const collision: Rect[] = [];
  const rectFor = (w: PlanWall, s0: number, s1: number, extra = 0): Rect => {
    const h = w.t / 2 + extra;
    const p0 = P(w.axis, s0, w.c - h, 0);
    const p1 = P(w.axis, s1, w.c + h, 0);
    return { x0: Math.min(p0[0], p1[0]), z0: Math.min(p0[2], p1[2]), x1: Math.max(p0[0], p1[0]), z1: Math.max(p0[2], p1[2]) };
  };
  for (const w of walls) {
    const A = alongVec(w.axis);
    const sideA = w.axis === 'x' ? spaceAt((w.lo + w.hi) / 2, w.c + 200) : spaceAt(w.c + 200, (w.lo + w.hi) / 2);
    const sideB = w.axis === 'x' ? spaceAt((w.lo + w.hi) / 2, w.c - 200) : spaceAt(w.c - 200, (w.lo + w.hi) / 2);
    const host = [sideA, sideB].find((s) => s && s.kind !== 'service') ?? sideA ?? sideB;
    const zone: ZoneId = host ? host.zone : 'exterior';
    const floorY = Math.min(sideA?.floorY ?? 0, sideB?.floorY ?? 0);
    const box = (b: Batch, s0: number, s1: number, a0: number, a1: number, y0: number, y1: number) => {
      const p0 = P(w.axis, s0, a0, y0);
      const p1 = P(w.axis, s1, a1, y1);
      b.aabb([Math.min(p0[0], p1[0]), y0, Math.min(p0[2], p1[2])], [Math.max(p0[0], p1[0]), y1, Math.max(p0[2], p1[2])]);
    };

    if (w.kind === 'balustrade') {
      const fr = B(zone, 'frame');
      box(fr, w.lo, w.hi, w.c - 30, w.c + 30, floorY, floorY + 0.07);
      box(fr, w.lo, w.hi, w.c - 28, w.c + 28, 1.06, 1.11);
      B(zone, 'glass').rect(P(w.axis, w.lo, w.c, floorY + 0.07), A, UP, (w.hi - w.lo) * MM, 1.06 - floorY - 0.07);
      collision.push(rectFor(w, w.lo, w.hi, 40));
    } else if (w.kind === 'louvre') {
      const lv = B(zone, 'louvre');
      box(lv, w.lo, w.lo + 40, w.c - 40, w.c + 40, floorY, CEIL);
      box(lv, w.hi - 40, w.hi, w.c - 40, w.c + 40, floorY, CEIL);
      // Angled blades every 110 mm.
      const N = acrossVec(w.axis);
      const tilt = (35 * Math.PI) / 180;
      const ay: V3 = v3.add(v3.scale(UP, Math.cos(tilt)), v3.scale(N, Math.sin(tilt)));
      const az = v3.norm(v3.cross(A, ay));
      for (let y = floorY + 0.12; y < CEIL - 0.05; y += 0.11) {
        const c = P(w.axis, (w.lo + w.hi) / 2, w.c, y);
        lv.obb(c, A, az, ay, ((w.hi - w.lo) / 2 - 40) * MM, 0.045, 0.006);
      }
      collision.push(rectFor(w, w.lo, w.hi));
    } else if (w.kind === 'parapet') {
      const role: Role = 'wallOutdoor';
      box(B(zone, role), w.lo, w.hi, w.c - w.t / 2, w.c + w.t / 2, floorY - 0.03, 1.0);
      box(B(zone, 'stone'), w.lo - 10, w.hi + 10, w.c - w.t / 2 - 15, w.c + w.t / 2 + 15, 1.0, 1.025);
      collision.push(rectFor(w, w.lo, w.hi));
    } else if (w.kind === 'glass') {
      // Aluminium-framed glass partition with a hinged glass door. It lights the indoor side.
      const lit = indoor(sideA) ? sideA : indoor(sideB) ? sideB : null;
      if (lit && !(indoor(sideA) && indoor(sideB))) {
        addAperture(`${w.id}-glass`, lit.zone, w.axis, w.lo, w.hi, w.c + (lit === sideA ? 1 : -1) * 25, floorY, CEIL, lit === sideA ? 1 : -1, 50, 0.75);
      }
      const fr = B(zone, 'frame');
      const gl = B(zone, 'glass');
      const door = w.openings.find((o) => o.spec.kind === 'door');
      box(fr, w.lo, w.lo + 45, w.c - 25, w.c + 25, floorY, CEIL);
      box(fr, w.hi - 45, w.hi, w.c - 25, w.c + 25, floorY, CEIL);
      box(fr, w.lo, w.hi, w.c - 25, w.c + 25, CEIL - 0.045, CEIL);
      const panes: Interval[] = door ? subtractIntervals([[w.lo + 45, w.hi - 45]], [[door.s0, door.s1]]) : [[w.lo + 45, w.hi - 45]];
      for (const [a, b] of panes) {
        box(fr, a, b, w.c - 25, w.c + 25, floorY, floorY + 0.045);
        gl.rect(P(w.axis, a, w.c, floorY + 0.045), A, UP, (b - a) * MM, CEIL - 0.045 - floorY - 0.045);
      }
      if (door) {
        const dh = door.y1;
        box(fr, door.s0 - 45, door.s0, w.c - 25, w.c + 25, floorY, CEIL);
        box(fr, door.s1, door.s1 + 45, w.c - 25, w.c + 25, floorY, CEIL);
        box(fr, door.s0, door.s1, w.c - 25, w.c + 25, dh, dh + 0.05);
        gl.rect(P(w.axis, door.s0, w.c, dh + 0.05), A, UP, (door.s1 - door.s0) * MM, CEIL - 0.045 - dh - 0.05);
        // The glass door leaf.
        const spec = door.spec as Extract<Opening, { kind: 'door' }>;
        const hingeAtS0 = (spec.hinge === 'a') === (w.dirSign > 0);
        const Ldir: V3 = v3.scale(A, hingeAtS0 ? 1 : -1);
        const zLocal = v3.cross(Ldir, UP);
        const swingAcross = spec.swingSide * w.leftNormalSign;
        const S: V3 = v3.scale(acrossVec(w.axis), swingAcross);
        const sDotZ = S[0] * zLocal[0] + S[2] * zLocal[2];
        const hinge = P(w.axis, hingeAtS0 ? door.s0 + 3 : door.s1 - 3, w.c + swingAcross * 20, floorY);
        const leafW = (door.s1 - door.s0 - 6) * MM;
        const leafH = dh - 0.006 - floorY;
        const fb = new Batch();
        const gb = new Batch();
        const zA = sDotZ > 0 ? -0.04 : 0;
        const zB = zA + 0.04;
        fb.aabb([0, 0.006, zA], [0.05, leafH, zB]);
        fb.aabb([leafW - 0.05, 0.006, zA], [leafW, leafH, zB]);
        fb.aabb([0.05, 0.006, zA], [leafW - 0.05, 0.1, zB]);
        fb.aabb([0.05, leafH - 0.05, zA], [leafW - 0.05, leafH, zB]);
        fb.aabb([leafW - 0.09, 0.95, zA - 0.035], [leafW - 0.07, 1.15, zB + 0.035]);
        gb.rect([0.05, 0.1, (zA + zB) / 2], [1, 0, 0], UP, leafW - 0.1, leafH - 0.15);
        const r0 = P(w.axis, door.s0, w.c - 30, 0);
        const r1 = P(w.axis, door.s1, w.c + 30, 0);
        doors.push({
          id: spec.id,
          zone,
          role: 'service',
          hinge,
          rotationY: Math.atan2(-Ldir[2], Ldir[0]),
          openSign: sDotZ > 0 ? -1 : 1,
          maxAngle: (95 * Math.PI) / 180,
          defaultOpen: 0,
          pieces: [
            { role: 'frame', geometry: fb.toGeometry() },
            { role: 'glass', geometry: gb.toGeometry() },
          ],
          closedRect: { x0: Math.min(r0[0], r1[0]), z0: Math.min(r0[2], r1[2]), x1: Math.max(r0[0], r1[0]), z1: Math.max(r0[2], r1[2]) },
          centre: P(w.axis, (door.s0 + door.s1) / 2, w.c, 1.0),
        });
      }
      for (const [a, b] of door ? subtractIntervals([[w.lo, w.hi]], [[door.s0 - 10, door.s1 + 10]]) : [[w.lo, w.hi] as Interval]) collision.push(rectFor(w, a, b, 10));
    }
  }

  // Solid walls block movement except at doors and sliding doors.
  for (const w of solid) {
    const passable = w.openings.filter((o) => o.spec.kind === 'door' || o.spec.kind === 'slidingDoor').map((o) => [o.s0 + 25, o.s1 - 25] as Interval);
    // (Door leaves and sliding panels add their own blocking rectangles at run time.)
    for (const [a, b] of subtractIntervals([[w.lo - w.t / 2, w.hi + w.t / 2]], passable)) collision.push(rectFor(w, a, b));
  }

  // ---------- Floors and ceilings ----------
  for (const s of spaces) {
    const pts = s.polygon.map((p) => [p.x * MM, p.y * MM] as [number, number]);
    B(s.zone, FLOOR_ROLE[s.id]).polygonXZ(pts, s.floorY, true);
    B(s.zone, 'ceiling').polygonXZ(pts, CEIL, false);
  }

  // ---------- Slabs: the floor and roof slab edges around the whole footprint ----------
  const outlineRings = spaces.map((s) => [s.polygon.map((p) => [p.x, p.y] as [number, number]).concat([[s.polygon[0]!.x, s.polygon[0]!.y]])]);
  const outlineGeoms = [...outlineRings, ...solid.map((w) => [rectRing(w)])] as [number, number][][][];
  const outline = polygonClipping.union(outlineGeoms[0]!, ...outlineGeoms.slice(1));
  const slab = B('exterior', 'slab');
  for (const e of edgesOf(outline as [number, number][][][])) {
    const mid = (e.lo + e.hi) / 2;
    const insideOutline = (sign: number) =>
      outline.some((poly) => pointInPolygon(e.axis === 'x' ? { x: mid, y: e.c + sign * 2 } : { x: e.c + sign * 2, y: mid }, poly[0]!.map(([x, y]) => ({ x, y }))));
    e.n = insideOutline(1) ? -1 : 1;
    const nVec = v3.scale(acrossVec(e.axis), e.n);
    const base = P(e.axis, 0, e.c, 0);
    slab.wallRect(base, alongVec(e.axis), nVec, e.lo * MM, e.hi * MM, -SLAB - 0.05, -0.03);
    slab.wallRect(base, alongVec(e.axis), nVec, e.lo * MM, e.hi * MM, CEIL, CEIL + SLAB);
  }
  for (const poly of outline) {
    const pts = poly[0]!.slice(0, -1).map(([x, y]) => [x * MM, y * MM] as [number, number]);
    slab.polygonXZ(pts, CEIL + SLAB, true);
    slab.polygonXZ(pts, -SLAB - 0.05, false);
  }

  // ---------- Zones and their reflection probes ----------
  const zones: Zone[] = [];
  const zoneIds = [...new Set(spaces.map((s) => s.zone))];
  for (const id of zoneIds) {
    const members = spaces.filter((s) => s.zone === id);
    const b = polygonBounds(members.map((m) => m.polygon));
    const largest = members.slice().sort((p, q) => area(q.polygon) - area(p.polygon))[0]!;
    let c = polygonCentroid(largest.polygon);
    if (members.length > 1) {
      // Area-weighted centre of the zone, if it falls inside one of its rooms.
      let ax = 0;
      let ay = 0;
      let at = 0;
      for (const m of members) {
        const mc = polygonCentroid(m.polygon);
        const ma = area(m.polygon);
        ax += mc.x * ma;
        ay += mc.y * ma;
        at += ma;
      }
      const wc = { x: ax / at, y: ay / at };
      if (members.some((m) => pointInPolygon(wc, m.polygon))) c = wc;
    }
    const minFloor = Math.min(...members.map((m) => m.floorY));
    zones.push({
      id,
      spaces: members.map((m) => m.id),
      probe: [c.x * MM, 1.45, c.y * MM],
      boxMin: [b.x0 * MM, minFloor, b.y0 * MM],
      boxMax: [b.x1 * MM, CEIL, b.y1 * MM],
    });
  }

  // ---------- AC condenser units on the ledges ----------
  const acUnits: ShellData['acUnits'] = [];
  for (const id of ['ac1', 'ac2'] as const) {
    const s = spaces.find((x) => x.id === id);
    if (!s) continue;
    const c = polygonCentroid(s.polygon);
    // Face the louvres: AC1's louvres are on its north side, AC2's on its west side.
    acUnits.push({ position: [c.x * MM, s.floorY, c.y * MM], rotationY: id === 'ac1' ? Math.PI : -Math.PI / 2 });
  }

  // ---------- Ceiling downlights, on a grid of about 2.6 m per room ----------
  const downlights: Downlight[] = [];
  for (const sp of spaces) {
    if (sp.kind === 'service') continue;
    const b = polygonBounds([sp.polygon]);
    const nx = Math.max(1, Math.round((b.x1 - b.x0) / 2600));
    const nz = Math.max(1, Math.round((b.y1 - b.y0) / 2600));
    const before = downlights.length;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = b.x0 + ((i + 0.5) / nx) * (b.x1 - b.x0);
        const y = b.y0 + ((j + 0.5) / nz) * (b.y1 - b.y0);
        if (pointInPolygon({ x, y }, sp.polygon)) downlights.push({ zone: sp.zone, space: sp.id, position: [x * MM, CEIL, y * MM] });
      }
    }
    if (downlights.length === before) {
      const c = polygonCentroid(sp.polygon);
      downlights.push({ zone: sp.zone, space: sp.id, position: [c.x * MM, CEIL, c.y * MM] });
    }
  }

  const out = [...batches.values()].filter((e) => e.batch.triangles > 0).map((e) => ({ zone: e.zone, role: e.role, geometry: e.batch.toGeometry() }));
  const triangles = out.reduce((n, e) => n + e.geometry.attributes.position!.count / 3, 0);
  const all = polygonBounds(spaces.map((s) => s.polygon));
  return {
    batches: out,
    doors,
    sliders,
    spaces,
    zones,
    collision,
    acUnits,
    apertures,
    downlights,
    switches,
    bounds: { min: [all.x0 * MM, -SLAB, all.y0 * MM], max: [all.x1 * MM, CEIL + SLAB, all.y1 * MM] },
    spawn: { position: [plan.spawn.position.x * MM, 0, plan.spawn.position.y * MM], yaw: (-plan.spawn.facingDeg * Math.PI) / 180 },
    stats: { triangles },
  };
}

function area(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Floor height at a plan point (metres), for the walking camera. */
export function floorHeightAt(spaces: Space[], x: number, z: number): number | null {
  const s = spaces.find((sp) => pointInPolygon({ x: x * 1000, y: z * 1000 }, sp.polygon));
  return s ? s.floorY : null;
}
