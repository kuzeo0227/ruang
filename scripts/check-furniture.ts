// Builds every code-built catalogue item in every style and checks the geometry: no NaNs,
// nothing empty, and the mesh stays close to the catalogue size.

import * as THREE from 'three';
import { CATALOGUE } from '../src/catalogue/items';
import { STYLE_ORDER } from '../src/catalogue/styles';
import { sizeOf } from '../src/furniture/catalogue';
import { buildItem, hasGenerator, reachesCeiling } from '../src/furniture/gen';

/** Parts allowed past the catalogue size: taps, bedding, a mirror on its stand, a flush plate on the wall (metres). */
const ALLOW: Record<string, { w?: number; d?: number; h?: number }> = {
  mattress: { w: 0.08, d: 0.04, h: 0.2 },
  kitchenSink: { h: 0.32 },
  vanity: { d: 0.04, h: 0.48 },
  wc: { h: 0.66 },
  dresser: { h: 0.82 },
};

let failures = 0;
let built = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`✗ ${msg}`);
};

for (const item of CATALOGUE) {
  if (item.model.kind !== 'parametric') continue;
  if (!hasGenerator(item)) {
    fail(`${item.id}: no generator called "${item.model.generator}"`);
    continue;
  }
  const styles = item.styles.length === 1 ? item.styles : STYLE_ORDER;
  const variants = item.variants ? item.variants.map((_, i) => i) : [undefined];
  for (const style of styles) {
    for (const variant of variants) {
      for (let finish = 0; finish < item.finishes.length; finish++) {
        const size = sizeOf(item, variant);
        const res = buildItem(item, { style, variant, finish, toCeiling: reachesCeiling(item) ? 2.75 - (item.mount === 'ceiling' ? size.h : 0) : 0 });
        const tag = `${item.id} [${style}${variant !== undefined ? ` v${variant}` : ''} f${finish}]`;
        if (!res) {
          fail(`${tag}: no result`);
          continue;
        }
        built++;
        const box = new THREE.Box3();
        let tris = 0;
        for (const [slot, geo] of res.geometry) {
          const pos = geo.attributes.position!;
          for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i]!)) {
            fail(`${tag}: NaN in slot ${slot}`);
            break;
          }
          const nor = geo.attributes.normal!;
          for (let i = 0; i < nor.array.length; i++) if (!Number.isFinite(nor.array[i]!)) {
            fail(`${tag}: bad normal in slot ${slot}`);
            break;
          }
          if (!geo.attributes.uv) fail(`${tag}: no uv in slot ${slot}`);
          geo.computeBoundingBox();
          box.union(geo.boundingBox!);
          tris += (geo.index ? geo.index.count : pos.count) / 3;
          if (!res.slots[slot]) fail(`${tag}: slot ${slot} has geometry but no material`);
        }
        if (res.geometry.size === 0) fail(`${tag}: empty`);
        const s = box.getSize(new THREE.Vector3());
        // Footprint within 6 cm of the catalogue size (ceiling-hung parts may reach up further).
        const over = (a: number, b: number) => a > b + 0.06;
        if (finish === 0 && variant === variants[0]) {
          const note = `${(s.x * 1000).toFixed(0)}×${(s.z * 1000).toFixed(0)}×${(s.y * 1000).toFixed(0)} vs ${(size.w * 1000).toFixed(0)}×${(size.d * 1000).toFixed(0)}×${(size.h * 1000).toFixed(0)}, ${Math.round(tris)} tris`;
          const a = ALLOW[item.category] ?? {};
          const bad = over(s.x, size.w + (a.w ?? 0)) || over(s.z, size.d + (a.d ?? 0) + (item.category === 'showerScreen' ? 0.1 : 0)) || (!reachesCeiling(item) && over(s.y, size.h + (a.h ?? 0)));
          if (bad) fail(`${tag}: bounds ${note}`);
          else if (process.argv.includes('-v')) console.log(`  ${tag}: ${note}`);
          if (tris > 60000) fail(`${tag}: ${Math.round(tris)} triangles`);
        }
      }
    }
  }
}

console.log(`${built} builds, ${failures} problems`);
process.exit(failures ? 1 : 0);
