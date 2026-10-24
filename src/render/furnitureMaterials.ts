// Materials for furniture: catalogue finishes and the special surfaces (chrome, mirror, screens,
// LEDs, artwork), made per lighting zone with the same shader patch as the shell, so a sofa gets
// its room's daylight, downlights, lamps, bounce light and reflections and nothing from next door.

import * as THREE from 'three';
import { MATERIALS, type MaterialId } from '../catalogue/materials';
import type { StyleId } from '../catalogue/styles';
import type { SlotDef, Special } from '../furniture/gen/context';
import type { ShellData, ZoneId } from '../shell/types';
import { artTexture } from './art';
import { createGlassMaterial, createSurfaceMaterial, patchModelMaterial, type SurfaceSpec } from './materials';
import { addZoneMaterial, registry } from './registry';
import { zoneById, zoneLighting } from './shellCache';

const SPECIAL: Record<Exclude<Special, 'x-glass' | 'x-art'>, { color: string; roughness: number; metalness: number; env?: number }> = {
  'x-screen': { color: '#060708', roughness: 0.08, metalness: 0, env: 1.2 },
  'x-mirror': { color: '#eef0f0', roughness: 0.015, metalness: 1 },
  'x-glass-dark': { color: '#0c0d0e', roughness: 0.06, metalness: 0, env: 1.2 },
  'x-black': { color: '#151515', roughness: 0.6, metalness: 0 },
  'x-white': { color: '#f0efea', roughness: 0.3, metalness: 0 },
  'x-chrome': { color: '#e6e7e8', roughness: 0.07, metalness: 1 },
  'x-steel': { color: '#c3c5c6', roughness: 0.32, metalness: 1 },
  'x-shadow': { color: '#0b0a09', roughness: 0.95, metalness: 0 },
  'x-led': { color: '#efece4', roughness: 0.4, metalness: 0 },
};

let fluteNormal: THREE.DataTexture | null = null;
/** Normal map of vertical flutes, one per texture repeat (3 cm). */
function flutes(): THREE.DataTexture {
  if (fluteNormal) return fluteNormal;
  const w = 64;
  const data = new Uint8Array(w * 4 * 4);
  for (let x = 0; x < w; x++) {
    const t = (x + 0.5) / w;
    // Each flute is a half-cylinder: the surface slope runs from -1 to 1 across it.
    const slope = Math.sin((t - 0.5) * Math.PI) * 0.85;
    const nx = -slope / Math.sqrt(1 + slope * slope);
    const nz = 1 / Math.sqrt(1 + slope * slope);
    for (let y = 0; y < 4; y++) {
      const i = (y * w + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = 128;
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  fluteNormal = new THREE.DataTexture(data, w, 4);
  fluteNormal.wrapS = fluteNormal.wrapT = THREE.RepeatWrapping;
  fluteNormal.magFilter = THREE.LinearFilter;
  fluteNormal.minFilter = THREE.LinearMipmapLinearFilter;
  fluteNormal.generateMipmaps = true;
  fluteNormal.needsUpdate = true;
  return fluteNormal;
}

const cache = new Map<string, Promise<THREE.MeshStandardMaterial>>();

function slotKey(zone: ZoneId, slot: SlotDef, style: StyleId, landscape: boolean) {
  return `${zone}|${slot.mat}|${slot.glow ?? 0}|${slot.doubleSide ? 1 : 0}|${slot.mat === 'x-art' ? `${style}:${landscape}` : ''}`;
}

async function create(shell: ShellData, zone: ZoneId, slot: SlotDef, style: StyleId, landscape: boolean): Promise<THREE.MeshStandardMaterial> {
  const z = zoneById(shell, zone);
  const lighting = zoneLighting(shell, zone);
  const mat = slot.mat;
  let out: THREE.MeshStandardMaterial;
  if (mat === 'x-glass' || mat === 'glassClear') {
    out = createGlassMaterial();
    out.name = `furniture-glass@${zone}`;
  } else if (mat === 'glassFluted') {
    // Reeded glass: bright, translucent, the flutes catching the light.
    const spec: SurfaceSpec = { key: `fluted@${zone}`, material: null, paint: '#dfe8e8', layout: 'none', roughness: 0.18 };
    const made = await createSurfaceMaterial(spec, z, lighting);
    out = made.material;
    out.transparent = true;
    out.opacity = 0.5;
    out.depthWrite = false;
    out.normalMap = flutes();
    out.normalScale.set(1, 1);
    // The flutes repeat every 3 cm across, in metre UVs.
    made.uniforms?.rTexSize.value.set(0.03, 1);
  } else if (mat === 'x-art') {
    const spec: SurfaceSpec = { key: `art@${zone}`, material: null, paint: '#ffffff', layout: 'none', roughness: 0.82 };
    out = (await createSurfaceMaterial(spec, z, lighting)).material;
    out.map = artTexture(style, landscape);
  } else if (mat.startsWith('x-')) {
    const s = SPECIAL[mat as keyof typeof SPECIAL];
    const spec: SurfaceSpec = { key: `${mat}@${zone}`, material: null, paint: s.color, layout: 'none', roughness: s.roughness, metalness: s.metalness, envIntensity: s.env };
    out = (await createSurfaceMaterial(spec, z, lighting)).material;
  } else {
    const def = MATERIALS[mat as MaterialId];
    const soft = def.family === 'fabric' || def.family === 'leather';
    const spec: SurfaceSpec = { key: `furniture:${mat}`, material: mat as MaterialId, layout: 'none', normalScale: def.family === 'fabric' ? 0.8 : undefined, luma: soft };
    out = (await createSurfaceMaterial(spec, z, lighting)).material;
  }
  if (slot.doubleSide) out.side = THREE.DoubleSide;
  if (slot.glow || mat === 'x-led') registry.glowMaterials.set(out, slot.glow ?? 1);
  addZoneMaterial(zone, out);
  return out;
}

/** The material for one slot of a code-built piece, in a zone. */
export function furnitureMaterial(shell: ShellData, zone: ZoneId, slot: SlotDef, style: StyleId, landscape = false): Promise<THREE.MeshStandardMaterial> {
  const key = slotKey(zone, slot, style, landscape);
  let p = cache.get(key);
  if (!p) {
    p = create(shell, zone, slot, style, landscape);
    cache.set(key, p);
  }
  return p;
}

/** Already-made material, if the promise has settled (for rendering without a flash). */
const settled = new Map<string, THREE.MeshStandardMaterial>();
export function furnitureMaterialNow(zone: ZoneId, slot: SlotDef, style: StyleId, landscape = false): THREE.MeshStandardMaterial | undefined {
  return settled.get(slotKey(zone, slot, style, landscape));
}
export async function ensureFurnitureMaterial(shell: ShellData, zone: ZoneId, slot: SlotDef, style: StyleId, landscape = false) {
  const m = await furnitureMaterial(shell, zone, slot, style, landscape);
  settled.set(slotKey(zone, slot, style, landscape), m);
  return m;
}

// ---------------- Scanned models ----------------

const modelCache = new Map<string, THREE.MeshStandardMaterial>();

/** A scanned model's material, cloned and given a zone's lighting. */
export function modelMaterial(shell: ShellData, zone: ZoneId, source: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const key = `${zone}|${source.uuid}`;
  let m = modelCache.get(key);
  if (!m) {
    m = source.clone();
    m.name = `${source.name}@${zone}`;
    patchModelMaterial(m, zoneById(shell, zone), zoneLighting(shell, zone));
    if (m.emissiveMap || m.emissive.getHex() !== 0) {
      // Bulbs and LED panels in scans glow only when the lights are on.
      registry.glowMaterials.set(m, -1);
      m.userData.emissiveOn = m.emissive.clone();
      m.emissive.setRGB(0, 0, 0);
    }
    addZoneMaterial(zone, m);
    modelCache.set(key, m);
  }
  return m;
}
