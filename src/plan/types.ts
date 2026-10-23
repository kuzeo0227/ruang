// Floor-plan data model.
//
// All lengths are millimetres. Plan coordinates follow the CAD sheets:
// x runs west -> east (grid 1 -> 4), y runs north -> south (grid A -> F).
// The balcony side (top of the sheets) faces north.

export interface Vec2 {
  x: number;
  y: number;
}

export type RoomId =
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'yard'
  | 'bedroom1'
  | 'bedroom2'
  | 'study'
  | 'toilet1'
  | 'toilet2'
  | 'foyer'
  | 'balcony'
  | 'corridor'
  | 'ac1'
  | 'ac2';

/** dry = habitable, wet = toilets, outdoor = open to air, service = AC ledges (not strata area). */
export type RoomKind = 'dry' | 'wet' | 'outdoor' | 'service';

export interface Room {
  id: RoomId;
  name: string;
  kind: RoomKind;
  /** Outline on wall centrelines / grid lines, which is how the CAD schedule measures area. */
  polygon: Vec2[];
  /** Counted in the strata unit area on the sales sheet. AC ledges are not. */
  countsInUnitArea: boolean;
  /** Clear floor-to-ceiling height. */
  ceiling: number;
  /** Step down from the main floor level (wet and outdoor areas). */
  floorDrop: number;
}

export type WallKind =
  | 'exterior'
  | 'interior'
  /** Aluminium-framed glass partition (kitchen / yard). */
  | 'glass'
  /** Low wall, e.g. between yard and AC ledge. */
  | 'parapet'
  /** Glass balustrade on the balcony edge. */
  | 'balustrade'
  /** Aluminium louvre screen around AC ledges. */
  | 'louvre';

export interface Wall {
  id: string;
  /** Centreline start and end. */
  a: Vec2;
  b: Vec2;
  thickness: number;
  /** Top of wall above finished floor. Full-height walls use the room ceiling. */
  height: number;
  kind: WallKind;
  openings: Opening[];
}

interface OpeningBase {
  id: string;
  /** Distance along the wall from `a` to the first jamb. */
  offset: number;
  width: number;
  /** Rooms whose daylighting this opening counts towards (matches the CAD daylighting table). */
  serves: RoomId[];
}

export interface DoorOpening extends OpeningBase {
  kind: 'door';
  height: number;
  /** Which jamb the hinge sits on: 'a' = the jamb nearer wall.a. */
  hinge: 'a' | 'b';
  /**
   * Side the leaf swings into. +1 = the side of the wall's left-hand normal
   * n = (-dy, dx) for direction d = b - a (in plan coords with y pointing south).
   */
  swingSide: 1 | -1;
  role: 'main' | 'room' | 'toilet' | 'service';
}

export interface SlidingDoorOpening extends OpeningBase {
  kind: 'slidingDoor';
  height: number;
  panels: number;
}

export interface WindowOpening extends OpeningBase {
  kind: 'window';
  sill: number;
  head: number;
  style: 'casement' | 'sliding' | 'topHung';
}

export interface BayWindowOpening extends OpeningBase {
  kind: 'bayWindow';
  /** Outward projection beyond the wall centreline. */
  depth: number;
  sill: number;
  head: number;
}

export type Opening = DoorOpening | SlidingDoorOpening | WindowOpening | BayWindowOpening;

export interface UnitPlan {
  id: UnitTypeId;
  name: string;
  /** Overall grid extents (grid 1-4 by A-F). */
  width: number;
  depth: number;
  /** Grid line positions: x for grids 1-4, y for grids A-F. */
  grid: { x: number[]; y: number[] };
  rooms: Room[];
  walls: Wall[];
  /** Where the first-person camera starts: just inside the main door, looking in. */
  spawn: { position: Vec2; facingDeg: number };
  /** Compass bearing of plan "up" (balcony side). 0 = north. */
  planNorthDeg: number;
  /** CAD schedule figures, used by scripts/check-plans.ts. */
  schedule: {
    roomAreasM2: Partial<Record<RoomId, number>>;
    totalM2: number;
    totalSqft: number;
    /** Daylighting table, area of opening per room group (m2). */
    daylightM2: { group: RoomId[]; area: number }[];
  };
}

export type UnitTypeId = 'A' | 'B' | 'B1';
