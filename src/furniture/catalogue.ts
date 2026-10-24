// Catalogue lookups for placed furniture: sizes, finishes, prices and labels.

import { CATALOGUE, CATALOGUE_BY_ID } from '../catalogue/items';
import { MATERIALS, type MaterialId } from '../catalogue/materials';
import type { CategoryId } from '../catalogue/pricing';
import type { StyleId } from '../catalogue/styles';
import type { CatalogueItem } from '../catalogue/types';
import { CEIL } from '../shell/build';
import type { Placement, Size3 } from './types';

export const itemOf = (p: Placement): CatalogueItem | undefined => CATALOGUE_BY_ID[p.itemId];

export function sizeOf(item: CatalogueItem, variant?: number): Size3 {
  const v = variant !== undefined ? item.variants?.[variant] : undefined;
  return { w: (v?.w ?? item.size.w) / 1000, d: (v?.d ?? item.size.d) / 1000, h: item.size.h / 1000 };
}

export function finishOf(item: CatalogueItem, finish: number): MaterialId {
  return (item.finishes[finish] ?? item.finishes[0]!).material;
}

export function finishName(item: CatalogueItem, finish: number): string {
  return MATERIALS[finishOf(item, finish)].name;
}

/** Price in MYR as placed: the size variant's price plus the finish's difference, scaled to that size. */
export function priceOf(p: Placement): number {
  const item = itemOf(p);
  if (!item) return 0;
  const variant = p.variant !== undefined ? item.variants?.[p.variant] : undefined;
  const base = variant?.priceMYR ?? item.priceMYR;
  const delta = (item.finishes[p.finish] ?? item.finishes[0]!).deltaMYR;
  return base + Math.round((delta * base) / item.priceMYR / 10) * 10;
}

export function totalOf(placements: Placement[]): number {
  return placements.reduce((sum, p) => sum + (p.hidden ? 0 : priceOf(p)), 0);
}

export const formatMYR = (n: number) => `RM${Math.round(n).toLocaleString('en-MY')}`;

/** The item a style uses for a category: its own piece, or a shared piece offered for that style. */
export function itemFor(style: StyleId, category: CategoryId, preferId?: string): CatalogueItem | undefined {
  if (preferId && CATALOGUE_BY_ID[preferId]) return CATALOGUE_BY_ID[preferId];
  return (
    CATALOGUE.find((i) => i.category === category && i.styles.length === 1 && i.styles[0] === style) ??
    CATALOGUE.find((i) => i.category === category && i.styles.includes(style))
  );
}

export const CATEGORY_LABEL: Record<CategoryId, string> = {
  sofa: 'Sofa',
  loungeChair: 'Lounge chair',
  coffeeTable: 'Coffee table',
  sideTable: 'Side table',
  tvConsole: 'Media unit',
  rug: 'Rug',
  floorLamp: 'Floor lamp',
  diningTable: 'Dining table',
  diningChair: 'Dining chair',
  pendant: 'Pendant light',
  sideboard: 'Sideboard',
  bedQueen: 'Queen bed',
  bedSingle: 'Single bed',
  bedside: 'Bedside table',
  wardrobe: 'Wardrobe',
  dresser: 'Dresser',
  tableLamp: 'Table lamp',
  desk: 'Desk',
  bookshelf: 'Shelving',
  shoeCabinet: 'Shoe cabinet',
  tv: 'TV',
  ceilingFan: 'Ceiling fan',
  airCon: 'Air-conditioner',
  plant: 'Plant',
  decor: 'Decor',
  curtains: 'Curtains',
  mattress: 'Mattress',
  taskChair: 'Desk chair',
  deskLamp: 'Desk lamp',
  bench: 'Bench',
  kitchenBase: 'Base cabinet',
  kitchenWall: 'Wall cabinet',
  kitchenSink: 'Sink cabinet',
  kitchenTall: 'Tall cabinet',
  hob: 'Hob',
  hood: 'Cooker hood',
  fridge: 'Fridge',
  washer: 'Washing machine',
  dryingRack: 'Drying rack',
  wc: 'Toilet',
  vanity: 'Vanity',
  showerScreen: 'Shower screen',
  mirror: 'Mirror',
  outdoorSeat: 'Outdoor seat',
  planter: 'Planter',
  downlight: 'Downlight',
};

/** Catalogue drawer groups, in the order they appear. */
export const CATEGORY_GROUPS: { id: string; label: string; categories: CategoryId[] }[] = [
  { id: 'living', label: 'Living', categories: ['sofa', 'loungeChair', 'coffeeTable', 'sideTable', 'tvConsole', 'tv', 'rug', 'floorLamp', 'plant', 'decor'] },
  { id: 'dining', label: 'Dining', categories: ['diningTable', 'diningChair', 'pendant', 'sideboard', 'bench'] },
  { id: 'bedroom', label: 'Bedroom', categories: ['bedQueen', 'bedSingle', 'mattress', 'bedside', 'wardrobe', 'dresser', 'tableLamp', 'curtains'] },
  { id: 'study', label: 'Study', categories: ['desk', 'taskChair', 'deskLamp', 'bookshelf'] },
  { id: 'kitchen', label: 'Kitchen', categories: ['kitchenBase', 'kitchenSink', 'kitchenWall', 'kitchenTall', 'hob', 'hood', 'fridge'] },
  { id: 'bath', label: 'Bath', categories: ['wc', 'vanity', 'showerScreen', 'mirror'] },
  { id: 'utility', label: 'Utility', categories: ['washer', 'dryingRack', 'airCon', 'ceilingFan', 'shoeCabinet', 'outdoorSeat', 'planter'] },
];

/**
 * Where an item goes up the wall when placed on its own: the height of its underside above the
 * floor. Floor items stand at 0; ceiling items hang from the ceiling.
 */
export function defaultElevation(item: CatalogueItem, variant?: number): number {
  const { h } = sizeOf(item, variant);
  const wall = item.mount === 'wall';
  switch (item.category) {
    case 'tv':
      return 1.1 - h / 2;
    case 'airCon':
      return CEIL - h - 0.12;
    case 'mirror':
      return 1.5 - h / 2;
    case 'decor':
      return wall ? 1.55 - h / 2 : 0;
    case 'kitchenWall':
      return 1.45;
    case 'hood':
      return 1.55;
    case 'dryingRack':
      return 1.62;
    case 'tvConsole':
      return wall ? 0.25 : 0;
    case 'bedside':
      return wall ? 0.4 : 0;
    case 'dresser':
      return wall ? 0.55 : 0;
    case 'bookshelf':
      return wall ? 0.3 : 0;
    case 'shoeCabinet':
      return wall ? 0.15 : 0;
    case 'vanity':
      return wall ? 0.38 : 0;
    case 'pendant':
      // About 90 cm over a dining table, the top of the usual range, so it clears the eye line.
      return item.model.kind === 'polyhaven' ? CEIL - h : 1.65;
    case 'downlight':
      return CEIL;
    default:
      return item.mount === 'ceiling' ? CEIL - h : 0;
  }
}

/** Items that can be put on top of others (lamps, plants, decor, mattresses, hobs). */
export const isSurfaceItem = (item: CatalogueItem) => item.mount === 'surface';

/** Items you walk around (not rugs or anything mounted high up). */
export function blocksWalking(item: CatalogueItem, y: number): boolean {
  if (item.category === 'rug' || item.category === 'curtains' || item.category === 'downlight' || item.category === 'showerScreen') return false;
  if (item.mount === 'ceiling') return false;
  return y < 1.2;
}
