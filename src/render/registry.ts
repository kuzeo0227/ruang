// Shared, non-reactive scene state used across 3D components (read every frame, so kept out of React).

import * as THREE from 'three';
import type { PhotoSession } from './photo';
import type { ShellData, SpaceId, ZoneId } from '../shell/types';

/** A placed piece of furniture in the scene. */
export interface FurnitureEntry {
  uid: string;
  object: THREE.Object3D;
  /** World bounds, so probes can leave out pieces right next to them. */
  box: THREE.Box3;
}

/** A rotated box in plan the walker can't pass through. */
export interface Obstacle {
  x: number;
  z: number;
  /** Half width and half depth in the box's own frame. */
  hw: number;
  hd: number;
  cos: number;
  sin: number;
}

export const registry = {
  shell: null as ShellData | null,
  /** The renderer and the sun, for diagnostics. */
  gl: null as THREE.WebGLRenderer | null,
  sunLight: null as THREE.DirectionalLight | null,
  /** Materials that receive each zone's reflection probe. */
  zoneMaterials: new Map<ZoneId, Set<THREE.MeshStandardMaterial>>(),
  /** Environment maps per zone (PMREM textures), once captured. */
  zoneEnv: new Map<ZoneId, THREE.Texture>(),
  skyEnv: null as THREE.Texture | null,
  /** Meshes the crosshair can hit (shell surfaces, doors) for measuring. */
  hitTargets: new Set<THREE.Object3D>(),
  /** The current layout's furniture is all loaded and in the scene. */
  furnitureReady: false,
  /** Looking down at the plan: probes and window shadows wait until walking again. */
  planMode: false,
  /** The plan camera while in plan mode (diagnostics). */
  planCamera: null as THREE.Camera | null,
  /** The group holding all the furniture. */
  furnitureRoot: null as THREE.Object3D | null,
  /** Placed furniture by placement uid. */
  furniture: new Map<string, FurnitureEntry>(),
  /** Furniture footprints for collision. */
  obstacles: [] as Obstacle[],
  /** Lamp shades and LEDs that glow when their room's lights are on, with their glow factor and zone. */
  glowMaterials: new Map<THREE.MeshStandardMaterial, { glow: number; zone: ZoneId; space: SpaceId | null }>(),
  /** Current (animated) openness of doors and sliders, 0..1. */
  doorOpen: new Map<string, number>(),
  /** Current sun state, written by the sun component. */
  sun: { elevation: 30, azimuth: 270 },
  /** Whether any of the unit's lights are on (Auto resolved by the sun). */
  lightsOn: false,
  /** Dimmer level of each room whose lights are on. */
  litLevels: new Map<SpaceId, number>(),
  /** Auto exposure: target average (key), limits, and the user's EV offset as a multiplier. */
  exposure: { key: 0.18, min: 1, max: 6, bias: 1 },
  /** Set to make exposure jump straight to the new view (after a teleport) instead of adapting. */
  exposureReset: false,
  /** The eye's adapted state (1 × 1: log2 average luminance, then the colour cast). */
  adapted: null as THREE.WebGLRenderTarget | null,
  /** Photo Mode: hold the eye at this average luminance (log2) and colour instead of adapting. */
  exposureHold: null as number | null,
  /** The running Photo Mode session (diagnostics). */
  photoSession: null as PhotoSession | null,
  /** White balance: how much of the light is daylight (vs. downlights), and the downlights' correction. */
  whiteBalance: { daylight: 1, night: new THREE.Color(1, 1, 1) },
  flags: {
    shadows: true,
    /** Only the sun's shadow map (cheap): set every frame while something is being carried. */
    sunShadow: false,
    probes: true,
    skyEnv: true,
  },
  /** Set by Photo Mode's Save: called with the finished frame as a PNG data URL. */
  photoSave: null as null | ((dataUrl: string) => void),
  /** True while reflection probes are being captured. */
  probeBusy: false,
  /** Bumped whenever lighting changes; probes use it to know when to recapture. */
  lightingVersion: 0,
};

export function addZoneMaterial(zone: ZoneId, mat: THREE.MeshStandardMaterial) {
  let set = registry.zoneMaterials.get(zone);
  if (!set) registry.zoneMaterials.set(zone, (set = new Set()));
  set.add(mat);
  const env = registry.zoneEnv.get(zone) ?? registry.skyEnv;
  if (env) mat.envMap = env;
}

export function removeZoneMaterial(zone: ZoneId, mat: THREE.MeshStandardMaterial) {
  registry.zoneMaterials.get(zone)?.delete(mat);
}

/**
 * Hides furniture within `margin` of a point (a probe's position) and returns a function that shows
 * it again: a piece right next to a probe would otherwise fill half of its view.
 */
export function hideFurnitureNear(p: THREE.Vector3, margin = 0.45): () => void {
  const hidden: THREE.Object3D[] = [];
  for (const f of registry.furniture.values()) {
    if (f.object.visible && f.box.distanceToPoint(p) < margin) {
      f.object.visible = false;
      hidden.push(f.object);
    }
  }
  return () => {
    for (const o of hidden) o.visible = true;
  };
}

/** Lighting changed: re-render shadows, and recapture probes (and the sky env if asked). */
export function invalidateLighting(sky = false) {
  registry.flags.shadows = true;
  registry.flags.probes = true;
  if (sky) registry.flags.skyEnv = true;
  registry.lightingVersion++;
}
