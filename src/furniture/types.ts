// A furniture placement: one catalogue item in the unit, with its finish, size and pose.
//
// Coordinates are world metres. (x, z) is the centre of the item's footprint; y is the height of
// its base above the floor of the room it stands in (0 for floor items; for wall, ceiling and
// surface items, the height of its underside). rot turns the item about the vertical axis; at 0
// its front faces +z (south), so its back is towards the north.

export interface Placement {
  uid: string;
  itemId: string;
  /** Index into the item's finishes; 0 is the default. */
  finish: number;
  /** Index into the item's size variants, if it has any. */
  variant?: number;
  x: number;
  z: number;
  y: number;
  rot: number;
  hidden?: boolean;
  /** The placement this one sits on (a lamp on a bedside table); it moves with its parent. */
  parent?: string;
}

/** Size in metres of an item as placed (variant applied). */
export interface Size3 {
  w: number;
  d: number;
  h: number;
}
