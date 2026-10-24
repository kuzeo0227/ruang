// Shared context for the furniture generators: the item, its size, finish and style, the geometry
// collector, and each material slot's material.

import type * as THREE from 'three';
import type { MaterialId } from '../../catalogue/materials';
import type { StyleId } from '../../catalogue/styles';
import type { CatalogueItem } from '../../catalogue/types';
import { Parts } from '../geom';

/** Materials that are not catalogue finishes. */
export type Special =
  | 'x-screen' // TV screen: black, glossy
  | 'x-mirror'
  | 'x-glass' // clear glass
  | 'x-glass-dark' // smoked glass (washer door, hob)
  | 'x-black' // matte black plastic or rubber
  | 'x-white' // white plastic
  | 'x-chrome'
  | 'x-steel' // brushed stainless (sinks)
  | 'x-art' // printed artwork
  | 'x-shadow' // near-black recess (plinths, gaps)
  | 'x-led'; // a lit LED line or disc

export interface SlotDef {
  mat: MaterialId | Special;
  /** Glows warm when the room lights are on (lampshades, LED lines). */
  glow?: number;
  /** Seen from both sides (curtains, thin shells). */
  doubleSide?: boolean;
}

export interface GenCtx {
  item: CatalogueItem;
  /** The item's style, or the active style for shared items (it picks handles, legs and frames). */
  style: StyleId;
  w: number;
  d: number;
  h: number;
  finish: MaterialId;
  /** Distance from the item's base up to the ceiling (pendants, hoods, fans). */
  toCeiling: number;
  P: Parts;
  slots: Record<string, SlotDef>;
  /** Height things placed on this item stand at; defaults to its height. */
  top?: number;
}

export interface GenResult {
  geometry: Map<string, THREE.BufferGeometry>;
  slots: Record<string, SlotDef>;
  top: number;
}

export type Generator = (g: GenCtx) => void;

export const WOOD: Record<StyleId, MaterialId> = { muji: 'oakLight', japanese: 'hinoki', brutalist: 'blackOak', minimal: 'oakLight', quietLuxury: 'walnut' };
export const DARK_WOOD: Record<StyleId, MaterialId> = { muji: 'oakLight', japanese: 'smokedOak', brutalist: 'blackOak', minimal: 'smokedOak', quietLuxury: 'walnut' };
export const METAL: Record<StyleId, MaterialId> = { muji: 'steelBlack', japanese: 'steelBlack', brutalist: 'steelBlack', minimal: 'steelBlack', quietLuxury: 'brassBrushed' };
export const HANDLE: Record<StyleId, MaterialId> = { muji: 'oakLight', japanese: 'steelBlack', brutalist: 'steelBlack', minimal: 'aluminiumWhite', quietLuxury: 'brassBrushed' };
/** Taps, flush plates and shower fittings. */
export const FIXTURE: Record<StyleId, MaterialId | Special> = { muji: 'x-chrome', japanese: 'steelBlack', brutalist: 'steelBlack', minimal: 'x-chrome', quietLuxury: 'brassBrushed' };
/** Bedding and secondary textiles. */
export const LINEN: Record<StyleId, MaterialId> = { muji: 'cottonWhite', japanese: 'linenStone', brutalist: 'linenCharcoal', minimal: 'cottonWhite', quietLuxury: 'linenOat' };

export const isWood = (m: string) => ['oakLight', 'ashWhite', 'hinoki', 'bamboo', 'greyOak', 'smokedOak', 'walnut', 'blackOak', 'oakHerringbone'].includes(m);
export const isFabric = (m: string) =>
  ['linenOat', 'linenStone', 'linenCharcoal', 'cottonWhite', 'boucleIvory', 'boucleSand', 'velvetMoss', 'woolGrey', 'leatherBlack', 'leatherCognac'].includes(m);
