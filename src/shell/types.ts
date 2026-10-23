import type * as THREE from 'three';
import type { RoomId } from '../plan/types';
import type { V3 } from './batch';

/** Lighting zones: open-plan rooms share one so there is no seam in reflections. */
export type ZoneId =
  | 'lounge'
  | 'bedroom1'
  | 'bedroom2'
  | 'study'
  | 'toilet1'
  | 'toilet2'
  | 'yard'
  | 'balcony'
  | 'foyer'
  | 'ac1'
  | 'ac2'
  | 'common'
  | 'exterior';

/** What a surface is made of; the renderer maps roles to the active style's materials. */
export type Role =
  | 'floorMain'
  | 'floorBedroom'
  | 'floorWet'
  | 'floorService'
  | 'floorCommon'
  | 'ceiling'
  | 'wallPaint'
  | 'wallFeature'
  | 'wallWet'
  | 'wallOutdoor'
  | 'wallCommon'
  | 'facade'
  | 'slab'
  | 'skirting'
  | 'stone'
  | 'timber'
  | 'frame'
  | 'glass'
  | 'metal'
  | 'louvre';

export type SpaceId = RoomId | 'common';

export interface Space {
  id: SpaceId;
  zone: ZoneId;
  /** Floor polygon on grid lines, metres (x, z). */
  polygon: { x: number; y: number }[];
  floorY: number;
  kind: 'dry' | 'wet' | 'outdoor' | 'service' | 'common';
}

export interface Zone {
  id: ZoneId;
  spaces: SpaceId[];
  /** Where the zone's reflection probe sits. */
  probe: V3;
  /** Box used for parallax-corrected reflections. */
  boxMin: V3;
  boxMax: V3;
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface PieceGeometry {
  role: Role;
  geometry: THREE.BufferGeometry;
}

/** A hinged door leaf, built in its own frame: +x from hinge to free edge, y up, origin at the hinge foot. */
export interface SwingDoor {
  id: string;
  zone: ZoneId;
  role: 'main' | 'room' | 'toilet' | 'service';
  /** Hinge foot position (world, metres). */
  hinge: V3;
  /** Group rotation about y that maps local +x to the hinge-to-free-edge direction. */
  rotationY: number;
  /** Multiply the opening angle by this to swing towards the correct side. */
  openSign: 1 | -1;
  maxAngle: number;
  defaultOpen: number;
  pieces: PieceGeometry[];
  /** Plan rectangle blocked while the door is closed. */
  closedRect: Rect;
  /** Centre of the opening, for interaction. */
  centre: V3;
}

/** The sliding panel of the balcony door, built in place; it moves along `slideDir` by up to `travel`. */
export interface SlidingPanel {
  id: string;
  zone: ZoneId;
  slideDir: V3;
  travel: number;
  defaultOpen: number;
  pieces: PieceGeometry[];
  /** Axis the door runs along, the wall's extent across it, and the panels' spans along it (metres). */
  axis: 'x' | 'z';
  across: [number, number];
  fixedSpan: [number, number];
  /** The sliding panel's span when closed; it moves towards +axis by travel × openness. */
  slideSpan: [number, number];
  centre: V3;
}

/** An opening that lets daylight into an indoor zone: a window, the sliding door or the glass partition. */
export interface Aperture {
  id: string;
  /** The indoor zone it lights. */
  zone: ZoneId;
  /** A corner of the opening on the wall's inner face, and its two edge vectors (metres). Ordered so cross(u, v) points out of the zone. */
  origin: V3;
  u: V3;
  v: V3;
  /** Unit normal pointing into the zone. */
  normal: V3;
  /** Wall thickness, so the daylight camera can sit just outside. */
  depth: number;
  /** Share of daylight that gets past frames, mullions and glass. */
  transmit: number;
}

/** A recessed ceiling downlight. */
export interface Downlight {
  zone: ZoneId;
  space: SpaceId;
  position: V3;
}

export interface ShellData {
  batches: { zone: ZoneId; role: Role; geometry: THREE.BufferGeometry }[];
  doors: SwingDoor[];
  sliders: SlidingPanel[];
  spaces: Space[];
  zones: Zone[];
  collision: Rect[];
  acUnits: { position: V3; rotationY: number }[];
  apertures: Aperture[];
  downlights: Downlight[];
  /** World bounds of the unit, slabs included. */
  bounds: { min: V3; max: V3 };
  spawn: { position: V3; yaw: number };
  stats: { triangles: number };
}
