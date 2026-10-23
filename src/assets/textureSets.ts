// Which CC0 texture sets the app needs, shared by scripts/fetch-assets.ts (download)
// and the renderer (loading). Derived from the style packs so a new style needs no edits here.

import { MATERIALS, type MaterialId } from '../catalogue/materials';
import { STYLES, STYLE_ORDER } from '../catalogue/styles';

export type TextureRes = '1k' | '2k';

export interface TextureSetSpec {
  /** Source asset id (Poly Haven slug or ambientCG id). */
  id: string;
  source: 'polyhaven' | 'ambientcg';
  res: TextureRes;
}

/** Fine plaster/paint relief used on every painted wall and ceiling so paint never looks like flat CG. */
export const PAINT_DETAIL: TextureSetSpec = { id: 'PaintedPlaster017', source: 'ambientcg', res: '1k' };

/** Poly Haven models the app loads (glTF, 1k textures). */
export const MODELS = ['exterior_aircon_unit'] as const;

/** Materials that some style uses as a floor get 2K maps; everything else 1K. */
export function shellTextureSets(): TextureSetSpec[] {
  const floors = new Set<MaterialId>();
  const used = new Set<MaterialId>();
  for (const id of STYLE_ORDER) {
    const s = STYLES[id].shell;
    floors.add(s.floor).add(s.bedroomFloor).add(s.wetFloor);
    for (const m of [s.floor, s.bedroomFloor, s.wetFloor, s.doors, s.windowFrames, s.kitchenFronts, s.worktop, s.featureWall]) {
      if (m) used.add(m);
    }
  }
  const sets = new Map<string, TextureSetSpec>();
  for (const m of used) {
    const tex = MATERIALS[m].texture;
    if (!tex) continue;
    const res: TextureRes = floors.has(m) || sets.get(tex.id)?.res === '2k' ? '2k' : '1k';
    sets.set(tex.id, { id: tex.id, source: tex.source, res });
  }
  sets.set(PAINT_DETAIL.id, PAINT_DETAIL);
  return [...sets.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Written by the fetch script to public/assets/tex/manifest.json. */
export interface TextureManifestEntry {
  res: TextureRes;
  /** Real-world size covered by one tile of the texture, in metres. */
  widthM: number;
  heightM: number;
  color: string;
  normal: string;
  /** Roughness in the green channel (a Poly Haven ARM map or a grey roughness map). */
  rough: string;
  /** Ambient occlusion in the red channel, if the set has one. */
  ao: string | null;
}

export type TextureManifest = Record<string, TextureManifestEntry>;
