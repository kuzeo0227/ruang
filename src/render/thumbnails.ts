// Catalogue thumbnails: each piece rendered once in a small studio (its own little renderer, soft
// room lighting, a three-quarter view) and kept as an image URL. Made on demand, one at a time.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MATERIALS, type MaterialId } from '../catalogue/materials';
import type { StyleId } from '../catalogue/styles';
import type { CatalogueItem } from '../catalogue/types';
import { sizeOf } from '../furniture/catalogue';
import { buildItem, detailStyle } from '../furniture/gen';
import type { Special } from '../furniture/gen/context';
import { artTexture } from './art';
import { loadTextureSet } from './materials';
import { loadModel } from './models';

const W = 320;
const H = 240;

let renderer: THREE.WebGLRenderer | null = null;
let env: THREE.Texture | null = null;
const camera = new THREE.PerspectiveCamera(28, W / H, 0.01, 60);

function setup(): THREE.WebGLRenderer {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return renderer;
}

const SPECIAL: Record<Special, { color: string; roughness: number; metalness: number; opacity?: number; emissive?: string }> = {
  'x-screen': { color: '#08090a', roughness: 0.1, metalness: 0 },
  'x-mirror': { color: '#dfe3e6', roughness: 0.03, metalness: 1 },
  'x-glass': { color: '#dcecef', roughness: 0.05, metalness: 0, opacity: 0.25 },
  'x-glass-dark': { color: '#101112', roughness: 0.08, metalness: 0 },
  'x-black': { color: '#151515', roughness: 0.6, metalness: 0 },
  'x-white': { color: '#f0efea', roughness: 0.3, metalness: 0 },
  'x-chrome': { color: '#e6e7e8', roughness: 0.08, metalness: 1 },
  'x-steel': { color: '#c3c5c6', roughness: 0.32, metalness: 1 },
  'x-art': { color: '#ffffff', roughness: 0.8, metalness: 0 },
  'x-shadow': { color: '#0b0a09', roughness: 0.95, metalness: 0 },
  'x-led': { color: '#fff7e6', roughness: 0.4, metalness: 0, emissive: '#ffe2b0' },
};

async function material(mat: MaterialId | Special, style: StyleId, landscape: boolean, doubleSide: boolean): Promise<THREE.Material> {
  const side = doubleSide ? THREE.DoubleSide : THREE.FrontSide;
  if (mat.startsWith('x-')) {
    const s = SPECIAL[mat as Special];
    const m = new THREE.MeshStandardMaterial({ color: s.color, roughness: s.roughness, metalness: s.metalness, side });
    if (s.opacity !== undefined) {
      m.transparent = true;
      m.opacity = s.opacity;
    }
    if (s.emissive) m.emissive.set(s.emissive);
    if (mat === 'x-art') m.map = artTexture(style, landscape);
    return m;
  }
  const def = MATERIALS[mat as MaterialId];
  if (def.family === 'glass') return new THREE.MeshStandardMaterial({ color: def.swatch, roughness: 0.08, transparent: true, opacity: mat === 'glassFluted' ? 0.6 : 0.25, side });
  const m = new THREE.MeshStandardMaterial({ color: def.swatch, roughness: def.roughness, metalness: def.metalness, side });
  if (def.texture) {
    try {
      const t = await loadTextureSet(def.texture.id);
      const repeat = (tex: THREE.Texture) => {
        const c = tex.clone();
        c.repeat.set(1 / t.entry.widthM, 1 / t.entry.heightM);
        c.needsUpdate = true;
        return c;
      };
      // Fabric and leather textures only lend their weave; their colour comes from the swatch.
      if (t.color && def.family !== 'fabric' && def.family !== 'leather') {
        m.map = repeat(t.color);
        const target = new THREE.Color(def.swatch);
        m.color.setRGB(target.r / Math.max(t.mean.r, 1e-3), target.g / Math.max(t.mean.g, 1e-3), target.b / Math.max(t.mean.b, 1e-3));
      }
      m.normalMap = repeat(t.normal);
    } catch {
      /* keep the plain colour */
    }
  }
  return m;
}

async function buildScene(item: CatalogueItem, style: StyleId, finish: number): Promise<THREE.Group> {
  const group = new THREE.Group();
  if (item.model.kind === 'parametric') {
    const res = buildItem(item, { finish, style, toCeiling: item.mount === 'ceiling' ? sizeOf(item).h + 0.25 : 2.75 });
    if (!res) return group;
    const s = sizeOf(item);
    const landscape = s.w >= s.h;
    const ds = detailStyle(item, style);
    for (const [slot, geometry] of res.geometry) {
      const def = res.slots[slot];
      if (!def) continue;
      group.add(new THREE.Mesh(geometry, await material(def.mat, ds, landscape, !!def.doubleSide)));
    }
  } else {
    const model = await loadModel(item);
    for (const part of model.parts) group.add(new THREE.Mesh(part.geometry, part.material));
  }
  return group;
}

const cache = new Map<string, Promise<string>>();
let chain: Promise<unknown> = Promise.resolve();

/** Image URL of a piece in a finish (made once, then cached). */
export function thumbnail(item: CatalogueItem, style: StyleId, finish = 0): Promise<string> {
  const key = `${item.id}|${finish}|${item.styles.length === 1 ? '' : style}`;
  let p = cache.get(key);
  if (!p) {
    p = chain.then(async () => {
      const gl = setup();
      const scene = new THREE.Scene();
      scene.environment = env;
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(2, 4, 3);
      scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x9a8f80, 0.5));
      const group = await buildScene(item, style, finish);
      scene.add(group);
      // Frame the bounds from the front, a little to the right and above.
      const box = new THREE.Box3().setFromObject(group);
      if (box.isEmpty()) return '';
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const dir = new THREE.Vector3(0.55, 0.42, 1).normalize();
      const fov = (camera.fov * Math.PI) / 180;
      const dist = (sphere.radius / Math.sin(Math.min(fov, fov * camera.aspect) / 2)) * 1.02;
      camera.position.copy(sphere.center).addScaledVector(dir, dist);
      camera.near = dist / 50;
      camera.far = dist * 4;
      camera.updateProjectionMatrix();
      camera.lookAt(sphere.center);
      gl.setClearColor(0x000000, 0);
      gl.clear();
      gl.render(scene, camera);
      const url = gl.domElement.toDataURL('image/png');
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && item.model.kind === 'parametric') (m.material as THREE.Material).dispose();
      });
      return url;
    });
    chain = p.catch(() => undefined);
    cache.set(key, p);
  }
  return p;
}
