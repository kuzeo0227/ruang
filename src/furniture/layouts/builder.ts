// Helpers for writing layouts: put a piece against a wall, at a point, or on top of another piece.

import { CATALOGUE_BY_ID } from '../../catalogue/items';
import type { MaterialId } from '../../catalogue/materials';
import type { CategoryId } from '../../catalogue/pricing';
import type { StyleId } from '../../catalogue/styles';
import type { CatalogueItem } from '../../catalogue/types';
import { CEIL } from '../../shell/build';
import { defaultElevation, itemFor, sizeOf } from '../catalogue';
import { buildItem } from '../gen';
import type { Placement, Size3 } from '../types';

/** The way a piece's front faces. */
export type Facing = 'N' | 'S' | 'E' | 'W';
export const FACING: Record<Facing, number> = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };

export interface PlaceOpts {
  /** Catalogue id to use instead of the style's piece for the category. */
  id?: string;
  variant?: number;
  /** Finish by material; ignored if the piece doesn't come in it. */
  finish?: MaterialId;
  /** Height of the underside above the floor (defaults to the piece's usual height). */
  y?: number;
  /** Gap between the piece's back and the wall. */
  gap?: number;
}

/** Height that things placed on a piece stand at, relative to its base. */
export function topOf(item: CatalogueItem, p: Placement, style: StyleId): number {
  if (item.model.kind === 'parametric') {
    const r = buildItem(item, { variant: p.variant, finish: p.finish, style, toCeiling: CEIL - p.y });
    if (r) return r.top;
  }
  return sizeOf(item, p.variant).h;
}

export class LayoutBuilder {
  readonly list: Placement[] = [];
  private n = 0;
  constructor(readonly style: StyleId) {}

  item(category: CategoryId, id?: string): CatalogueItem | undefined {
    return id ? CATALOGUE_BY_ID[id] : itemFor(this.style, category);
  }

  size(category: CategoryId, o: PlaceOpts = {}): Size3 {
    const item = this.item(category, o.id);
    return item ? sizeOf(item, o.variant) : { w: 0, d: 0, h: 0 };
  }

  private add(item: CatalogueItem, x: number, z: number, rot: number, o: PlaceOpts): Placement {
    const finish = o.finish ? Math.max(0, item.finishes.findIndex((f) => f.material === o.finish)) : 0;
    const p: Placement = { uid: `${item.category}-${++this.n}`, itemId: item.id, finish, x, z, y: o.y ?? defaultElevation(item, o.variant), rot };
    if (o.variant !== undefined) p.variant = o.variant;
    this.list.push(p);
    return p;
  }

  /** A piece centred at (x, z), facing a compass direction or turned by an angle. */
  at(category: CategoryId, x: number, z: number, facing: Facing | number, o: PlaceOpts = {}): Placement | null {
    const item = this.item(category, o.id);
    if (!item) return null;
    return this.add(item, x, z, typeof facing === 'number' ? facing : FACING[facing], o);
  }

  /**
   * A piece with its back against one wall of a room: `side` is the wall (its face at `face`),
   * `along` the centre of the piece along that wall.
   */
  wall(category: CategoryId, side: Facing, face: number, along: number, o: PlaceOpts = {}): Placement | null {
    const item = this.item(category, o.id);
    if (!item) return null;
    const s = sizeOf(item, o.variant);
    const off = s.d / 2 + (o.gap ?? 0.01);
    switch (side) {
      case 'N':
        return this.add(item, along, face + off, FACING.S, o);
      case 'S':
        return this.add(item, along, face - off, FACING.N, o);
      case 'W':
        return this.add(item, face + off, along, FACING.E, o);
      case 'E':
        return this.add(item, face - off, along, FACING.W, o);
    }
  }

  /** A piece standing on another, offset (dx, dz) in the parent's own frame; it moves with the parent. */
  on(parent: Placement | null, category: CategoryId, dx = 0, dz = 0, o: PlaceOpts & { turn?: number } = {}): Placement | null {
    if (!parent) return null;
    const item = this.item(category, o.id);
    const parentItem = CATALOGUE_BY_ID[parent.itemId];
    if (!item || !parentItem) return null;
    const c = Math.cos(parent.rot);
    const s = Math.sin(parent.rot);
    const p = this.add(item, parent.x + dx * c + dz * s, parent.z - dx * s + dz * c, parent.rot + (o.turn ?? 0), {
      ...o,
      y: parent.y + topOf(parentItem, parent, this.style),
    });
    p.parent = parent.uid;
    return p;
  }
}
