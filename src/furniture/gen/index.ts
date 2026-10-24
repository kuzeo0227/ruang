// Runs the code-built generator for a catalogue item and caches the merged geometry per
// item, size, finish, style and (for things hung from the ceiling) the drop to the ceiling.

import type * as THREE from 'three';
import type { StyleId } from '../../catalogue/styles';
import type { CatalogueItem } from '../../catalogue/types';
import { finishOf, sizeOf } from '../catalogue';
import { Parts } from '../geom';
import { mirror, showerScreen, vanity, wc } from './bath';
import { bed, mattress } from './beds';
import type { GenCtx, GenResult, Generator } from './context';
import { dryingRack, fridge, hob, hood, kitchenBase, kitchenSink, kitchenTall, kitchenWall, washer } from './kitchen';
import { ceilingFan, deskLamp, downlight, floorLamp, pendant, tableLamp } from './lighting';
import { airCon, print, tv } from './misc';
import { armchair, bench, diningChair, outdoorSeat, sofa, taskChair } from './seating';
import { curtains, rug } from './soft';
import { bedside, cabinetLow, shelf, wardrobe } from './storage';
import { coffeeTable, desk, diningTable, sideTable } from './tables';

const GENERATORS: Record<string, Generator> = {
  // Style furniture (catalogue names from PARAMETRIC in catalogue/items.ts).
  sofa: (g) => sofa(g),
  armchair,
  'table-low': coffeeTable,
  'table-side': sideTable,
  'cabinet-low': cabinetLow,
  rug,
  'lamp-floor': floorLamp,
  'table-dining': diningTable,
  'chair-dining': diningChair,
  'lamp-pendant': pendant,
  bed,
  'cabinet-small': bedside,
  wardrobe,
  'table-desk': desk,
  'lamp-table': tableLamp,
  shelf,
  // Shared pieces, named after their category.
  tv,
  ceilingFan,
  airCon,
  decor: print,
  curtains,
  mattress,
  taskChair,
  deskLamp,
  bench,
  kitchenBase,
  kitchenSink,
  kitchenWall,
  kitchenTall,
  hob,
  hood,
  fridge,
  washer,
  dryingRack,
  outdoorSeat,
  downlight,
  wc,
  vanity,
  showerScreen,
  mirror,
};

export const hasGenerator = (item: CatalogueItem) => item.model.kind === 'parametric' && item.model.generator in GENERATORS;

/** Items whose shape depends on the height of the ceiling above them. */
export const reachesCeiling = (item: CatalogueItem) => item.mount === 'ceiling' || item.mount === 'window' || item.category === 'hood';

/** The style that picks an item's details: its own for style pieces, the active one for shared pieces. */
export const detailStyle = (item: CatalogueItem, active: StyleId): StyleId => (item.styles.length === 1 ? item.styles[0]! : active);

/** Artwork faces get 0–1 UVs across their front so the print fills them exactly. */
function fitUv(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const pos = geo.attributes.position!;
  const uv = geo.attributes.uv!;
  const sx = Math.max(1e-6, b.max.x - b.min.x);
  const sy = Math.max(1e-6, b.max.y - b.min.y);
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - b.min.x) / sx, (pos.getY(i) - b.min.y) / sy);
  uv.needsUpdate = true;
}

const cache = new Map<string, GenResult>();

export interface BuildOpts {
  variant?: number;
  finish: number;
  style: StyleId;
  /** Distance from the item's base to the ceiling above it. */
  toCeiling: number;
}

export function buildItem(item: CatalogueItem, o: BuildOpts): GenResult | null {
  if (item.model.kind !== 'parametric') return null;
  const fn = GENERATORS[item.model.generator];
  if (!fn) return null;
  const size = sizeOf(item, o.variant);
  const finish = finishOf(item, o.finish);
  const style = detailStyle(item, o.style);
  const toCeiling = reachesCeiling(item) ? Math.round(o.toCeiling * 100) / 100 : 0;
  const key = `${item.id}|${o.variant ?? ''}|${finish}|${style}|${toCeiling}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g: GenCtx = { item, style, ...size, finish, toCeiling, P: new Parts(), slots: {} };
  fn(g);
  const geometry = g.P.build();
  for (const [slot, def] of Object.entries(g.slots)) {
    const geo = geometry.get(slot);
    if (geo && def.mat === 'x-art') fitUv(geo);
  }
  for (const slot of Object.keys(g.slots)) if (!geometry.has(slot)) delete g.slots[slot];
  const result: GenResult = { geometry, slots: g.slots, top: g.top ?? size.h };
  cache.set(key, result);
  return result;
}
