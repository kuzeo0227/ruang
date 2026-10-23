import type { RoomId } from '../plan/types';
import type { MaterialId } from './materials';
import type { CategoryId } from './pricing';
import type { StyleId } from './styles';

/** How the 3D model will be produced in Phase 2. */
export type ModelSource =
  | { kind: 'polyhaven'; id: string }
  | { kind: 'parametric'; generator: string };

export interface CatalogueItem {
  id: string;
  name: string;
  brand: string;
  category: CategoryId;
  /** Style packs that place this item by default. Shared items list several. */
  styles: StyleId[];
  rooms: RoomId[];
  /** Overall size in mm: width (x), depth (z), height (y). */
  size: { w: number; d: number; h: number };
  mount: 'floor' | 'wall' | 'ceiling' | 'window' | 'surface';
  /** Price in MYR, in the default (first) finish. */
  priceMYR: number;
  /** Finish options; the first is the default. Deltas are relative to the default. */
  finishes: { material: MaterialId; deltaMYR: number }[];
  /** Optional size variants, e.g. wardrobe widths or rug sizes, each with its own price. */
  variants?: { label: string; w: number; d: number; priceMYR: number }[];
  model: ModelSource;
  /** Where the price comes from. */
  priceBasis: string;
  description: string;
}
