// Builds a UnitPlan from a handful of dimensions read off the CAD sheets.
//
// Types A, B and B1 share one layout: the same rooms in the same arrangement,
// only the bay widths, yard width and AC ledge differ, and B1 adds a bay window.
// Every room area in the CAD schedule equals its grid-line rectangle
// (e.g. corridor 2800 x 1200 = 3.36 m2), so grid lines are wall centrelines.

import type { Opening, Room, RoomId, RoomKind, UnitPlan, UnitTypeId, Vec2, Wall, WallKind } from './types';

export interface UnitParams {
  id: UnitTypeId;
  name: string;
  /** Grid bay widths 1-2, 2-3, 3-4. */
  bays: [number, number, number];
  /** Grid row spacings A-B, B-C, C-D, D-E, E-F. */
  rows: [number, number, number, number, number];
  balconyDepth: number;
  toilet1Width: number;
  toilet2Width: number;
  /** Kitchen extends this far west of grid 3. */
  kitchenWestOfGrid3: number;
  yardWidth: number;
  ac1Width: number;
  ac2Width: number;
  foyerWidth: number;
  foyerDepth: number;
  /** y of the living / dining label boundary in the CAD (they are one open space). */
  livingDiningSplit: number;
  bayWindow?: { width: number; depth: number; sill: number; head: number };
  schedule: UnitPlan['schedule'];
}

export const CEILING = 2750;
const EXT = 150;
const INT = 125;
const GLASS = 50;
const DOOR_H = 2100;
const WET_DROP = 30;

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

export function buildUnit(p: UnitParams): UnitPlan {
  const [bay1, bay2, bay3] = p.bays;
  const g2 = bay1;
  const g3 = bay1 + bay2;
  const W = g3 + bay3;

  const [ab, bc, cd, de, ef] = p.rows;
  const yB = ab;
  const yC = yB + bc;
  const yD = yC + cd;
  const yE = yD + de;
  const yF = yE + ef;

  const yBal = p.balconyDepth;
  const t1 = p.toilet1Width;
  const studyRight = g3 - p.toilet2Width;
  const kitchenLeft = g3 - p.kitchenWestOfGrid3;
  const yardLeft = kitchenLeft - p.yardWidth;
  const ac2Left = yardLeft - p.ac2Width;
  const ac1Left = g3 - p.ac1Width;
  const foyerLeft = W - p.foyerWidth;
  const foyerTop = yF - p.foyerDepth;
  const yLD = p.livingDiningSplit;

  const room = (id: RoomId, name: string, kind: RoomKind, polygon: Vec2[], countsInUnitArea = true): Room => ({
    id,
    name,
    kind,
    polygon,
    countsInUnitArea,
    ceiling: CEILING,
    floorDrop: kind === 'wet' || kind === 'outdoor' || kind === 'service' ? WET_DROP : 0,
  });

  const diningOutline: Vec2[] = [{ x: g3, y: yLD }, { x: W, y: yLD }];
  if (p.bayWindow) {
    const by0 = yD + de / 2 - p.bayWindow.width / 2;
    const by1 = by0 + p.bayWindow.width;
    const bx = W + p.bayWindow.depth;
    diningOutline.push({ x: W, y: by0 }, { x: bx, y: by0 }, { x: bx, y: by1 }, { x: W, y: by1 });
  }
  diningOutline.push({ x: W, y: foyerTop }, { x: foyerLeft, y: foyerTop }, { x: foyerLeft, y: yE }, { x: g3, y: yE });

  const rooms: Room[] = [
    room('balcony', 'Balcony', 'outdoor', rect(g3, 0, W, yBal)),
    room('living', 'Living', 'dry', rect(g3, yBal, W, yLD)),
    room('dining', 'Dining', 'dry', diningOutline),
    room('kitchen', 'Kitchen', 'dry', rect(kitchenLeft, yE, foyerLeft, yF)),
    room('yard', 'Yard', 'outdoor', rect(yardLeft, yE, kitchenLeft, yF)),
    room('bedroom1', 'Bedroom 1', 'dry', rect(0, yB, g2, yD)),
    room('bedroom2', 'Bedroom 2', 'dry', rect(g2, yB, g3, yC)),
    room('corridor', 'Corridor', 'dry', rect(g2, yC, g3, yD)),
    room('toilet1', 'Toilet 1', 'wet', rect(0, yD, t1, yE)),
    room('study', 'Study', 'dry', rect(t1, yD, studyRight, yE)),
    room('toilet2', 'Toilet 2', 'wet', rect(studyRight, yD, g3, yE)),
    room('foyer', 'Foyer', 'dry', rect(foyerLeft, foyerTop, W, yF)),
    room('ac1', 'AC ledge 1', 'service', rect(ac1Left, 0, g3, yB), false),
    room('ac2', 'AC ledge 2', 'service', rect(ac2Left, yE, yardLeft, yF), false),
  ];

  const wall = (
    id: string,
    a: Vec2,
    b: Vec2,
    kind: WallKind,
    openings: Opening[] = [],
  ): Wall => {
    const thickness = kind === 'exterior' || kind === 'louvre' ? EXT : kind === 'glass' || kind === 'balustrade' ? GLASS : INT;
    const height = kind === 'parapet' ? 1000 : kind === 'balustrade' ? 1100 : CEILING;
    return { id, a, b, thickness, height, kind, openings };
  };

  const bed1WindowW = 2700;
  const bed2WindowW = 1800;
  const sliderW = 2630;

  const walls: Wall[] = [
    // North facade: bedroom windows. The AC1 ledge sits in front of part of bedroom 2.
    wall('north-bedrooms', { x: 0, y: yB }, { x: g3, y: yB }, 'exterior', [
      { kind: 'window', id: 'bed1-window', offset: (bay1 - bed1WindowW) / 2, width: bed1WindowW, sill: 900, head: 2100, style: 'casement', serves: ['bedroom1'] },
      { kind: 'window', id: 'bed2-window', offset: g2 + 300, width: bed2WindowW, sill: 900, head: 2100, style: 'casement', serves: ['bedroom2'] },
    ]),
    wall('ac1-front', { x: ac1Left, y: 0 }, { x: g3, y: 0 }, 'louvre'),
    wall('ac1-side', { x: ac1Left, y: 0 }, { x: ac1Left, y: yB }, 'louvre'),
    wall('grid3-north', { x: g3, y: 0 }, { x: g3, y: yC }, 'exterior'),
    wall('balcony-edge', { x: g3, y: 0 }, { x: W, y: 0 }, 'balustrade'),
    wall('balcony-east', { x: W, y: 0 }, { x: W, y: yBal }, 'exterior'),
    wall('living-north', { x: g3, y: yBal }, { x: W, y: yBal }, 'exterior', [
      { kind: 'slidingDoor', id: 'balcony-slider', offset: (bay3 - sliderW) / 2, width: sliderW, height: 2400, panels: 2, serves: ['living', 'dining', 'kitchen'] },
    ]),
    wall(
      'east',
      { x: W, y: yBal },
      { x: W, y: yF },
      'exterior',
      p.bayWindow
        ? [{ kind: 'bayWindow', id: 'bay-window', offset: yD + de / 2 - p.bayWindow.width / 2 - yBal, width: p.bayWindow.width, depth: p.bayWindow.depth, sill: p.bayWindow.sill, head: p.bayWindow.head, serves: ['living', 'dining', 'kitchen'] }]
        : [],
    ),
    // Main door sits between the dining area and the foyer recess, which opens onto the common corridor.
    wall('main-door-wall', { x: foyerLeft, y: foyerTop }, { x: W, y: foyerTop }, 'exterior', [
      { kind: 'door', id: 'main-door', offset: 550, width: 1000, height: DOOR_H, hinge: 'b', swingSide: -1, role: 'main', serves: [] },
    ]),
    wall('foyer-west', { x: foyerLeft, y: foyerTop }, { x: foyerLeft, y: yF }, 'exterior'),
    wall('south', { x: ac2Left, y: yF }, { x: foyerLeft, y: yF }, 'exterior'),
    wall('ac2-outer', { x: ac2Left, y: yE }, { x: ac2Left, y: yF }, 'louvre'),
    wall('ac2-yard', { x: yardLeft, y: yE }, { x: yardLeft, y: yF }, 'parapet'),
    wall('yard-kitchen', { x: kitchenLeft, y: yE }, { x: kitchenLeft, y: yF }, 'glass', [
      { kind: 'door', id: 'yard-door', offset: 900, width: 800, height: DOOR_H, hinge: 'b', swingSide: 1, role: 'service', serves: [] },
    ]),
    wall('row-e-west', { x: 0, y: yE }, { x: ac2Left, y: yE }, 'exterior', [
      // Tall and narrow: the wall facing the air well is only 1325 mm long in Type B.
      { kind: 'window', id: 'study-window', offset: ac2Left - 150 - 800, width: 800, sill: 300, head: 2100, style: 'casement', serves: ['study'] },
    ]),
    wall('row-e-east', { x: ac2Left, y: yE }, { x: g3, y: yE }, 'interior', [
      { kind: 'window', id: 'toilet2-window', offset: studyRight + 75 - ac2Left, width: 600, sill: 1500, head: 2100, style: 'topHung', serves: ['toilet2'] },
    ]),
    wall('west', { x: 0, y: yB }, { x: 0, y: yE }, 'exterior', [
      { kind: 'window', id: 'toilet1-window', offset: yE - 1000 - yB, width: 600, sill: 1500, head: 2100, style: 'topHung', serves: ['toilet1'] },
    ]),
    wall('grid2', { x: g2, y: yB }, { x: g2, y: yD }, 'interior', [
      { kind: 'door', id: 'bed1-door', offset: yD - 200 - 850 - yB, width: 850, height: DOOR_H, hinge: 'b', swingSide: 1, role: 'room', serves: [] },
    ]),
    wall('row-c', { x: g2, y: yC }, { x: g3, y: yC }, 'interior', [
      { kind: 'door', id: 'bed2-door', offset: bay2 - 200 - 850, width: 850, height: DOOR_H, hinge: 'b', swingSide: -1, role: 'room', serves: [] },
    ]),
    wall('row-d', { x: 0, y: yD }, { x: g3, y: yD }, 'interior', [
      { kind: 'door', id: 'toilet1-door', offset: t1 - 200 - 700, width: 700, height: DOOR_H, hinge: 'b', swingSide: 1, role: 'toilet', serves: [] },
      { kind: 'door', id: 'study-door', offset: studyRight - 238 - 800, width: 800, height: DOOR_H, hinge: 'b', swingSide: 1, role: 'room', serves: [] },
      { kind: 'door', id: 'toilet2-door', offset: studyRight + 212, width: 700, height: DOOR_H, hinge: 'a', swingSide: 1, role: 'toilet', serves: [] },
    ]),
    wall('toilet1-study', { x: t1, y: yD }, { x: t1, y: yE }, 'interior'),
    wall('study-toilet2', { x: studyRight, y: yD }, { x: studyRight, y: yE }, 'interior'),
    wall('toilet2-dining', { x: g3, y: yD }, { x: g3, y: yE }, 'interior'),
  ];

  return {
    id: p.id,
    name: p.name,
    width: W,
    depth: yF,
    grid: { x: [0, g2, g3, W], y: [0, yB, yC, yD, yE, yF] },
    rooms,
    walls,
    spawn: { position: { x: foyerLeft + 1050, y: foyerTop - 700 }, facingDeg: 0 },
    planNorthDeg: 0,
    schedule: p.schedule,
  };
}

/** Shoelace area of a polygon in mm2. */
export function polygonArea(poly: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Glazed area of an opening in mm2, as the CAD daylighting table counts it. */
export function glazedArea(o: Opening): number {
  switch (o.kind) {
    case 'window':
      return o.width * (o.head - o.sill);
    case 'slidingDoor':
      return o.width * o.height;
    case 'bayWindow':
      return (o.width + 2 * o.depth) * (o.head - o.sill);
    case 'door':
      return 0;
  }
}
