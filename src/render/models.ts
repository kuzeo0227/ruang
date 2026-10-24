// Scanned furniture (Poly Haven glTF, 1K textures). Each model is loaded once, turned to face +z,
// scaled to its catalogue size and moved so its footprint is centred on the origin with its base
// at y = 0, the same frame the code-built pieces use. Ceiling pieces end up hanging from their top.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './bvh';
import { sizeOf } from '../furniture/catalogue';
import type { CatalogueItem } from '../catalogue/types';

/** Per-model corrections: a turn so the front faces +z. */
const TURN: Record<string, number> = {
  modern_coffee_table_01: Math.PI / 2,
};

export interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

export interface ModelTemplate {
  parts: ModelPart[];
  /** Size after fitting, metres. */
  size: THREE.Vector3;
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<ModelTemplate>>();
const ready = new Map<string, ModelTemplate>();

export const modelUrl = (id: string) => `/assets/models/${id}/${id}.gltf`;

async function load(item: CatalogueItem, id: string): Promise<ModelTemplate> {
  const gltf = await loader.loadAsync(modelUrl(id));
  gltf.scene.updateMatrixWorld(true);
  const turn = new THREE.Matrix4().makeRotationY(TURN[id] ?? 0);
  const parts: ModelPart[] = [];
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(turn, mesh.matrixWorld));
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const material = mats[0] as THREE.MeshStandardMaterial;
    parts.push({ geometry, material });
  });
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }
  const raw = box.getSize(new THREE.Vector3());
  const want = sizeOf(item);
  // One uniform scale that best matches the catalogue size (most scans are already true to size).
  const ratios = [want.w / raw.x, want.d / raw.z, want.h / raw.y];
  const s = Math.cbrt(ratios[0]! * ratios[1]! * ratios[2]!);
  if (ratios.some((r) => Math.abs(r / s - 1) > 0.15)) console.warn(`Model ${id} proportions differ from ${item.id}:`, raw.toArray(), want);
  const centre = box.getCenter(new THREE.Vector3());
  const fit = new THREE.Matrix4()
    .makeScale(s, s, s)
    .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));
  for (const p of parts) {
    p.geometry.applyMatrix4(fit);
    p.geometry.computeBoundingBox();
    p.geometry.computeBoundingSphere();
    p.geometry.computeBoundsTree();
  }
  const template = { parts, size: raw.multiplyScalar(s) };
  ready.set(item.id, template);
  return template;
}

export function loadModel(item: CatalogueItem): Promise<ModelTemplate> {
  if (item.model.kind !== 'polyhaven') return Promise.reject(new Error(`${item.id} is not a scanned model`));
  let p = cache.get(item.id);
  if (!p) {
    p = load(item, item.model.id);
    cache.set(item.id, p);
  }
  return p;
}

/** The fitted model if it has finished loading. */
export const modelNow = (item: CatalogueItem) => ready.get(item.id);
