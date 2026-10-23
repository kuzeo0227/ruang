// Shared, non-reactive scene state used across 3D components (read every frame, so kept out of React).

import * as THREE from 'three';
import type { ShellData, ZoneId } from '../shell/types';

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
  /** Current (animated) openness of doors and sliders, 0..1. */
  doorOpen: new Map<string, number>(),
  /** Current sun state, written by the sun component. */
  sun: { elevation: 30, azimuth: 270 },
  /** Whether room lights are currently on (resolved from 'auto' by the sun). */
  lightsOn: false,
  /** Auto exposure: target average (key), limits, and the user's EV offset as a multiplier. */
  exposure: { key: 0.18, min: 1, max: 6, bias: 1 },
  /** Set to make exposure jump straight to the new view (after a teleport) instead of adapting. */
  exposureReset: false,
  /** White balance: how much of the light is daylight (vs. downlights), and the downlights' correction. */
  whiteBalance: { daylight: 1, night: new THREE.Color(1, 1, 1) },
  flags: {
    shadows: true,
    probes: true,
    skyEnv: true,
  },
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

/** Lighting changed: re-render shadows, and recapture probes (and the sky env if asked). */
export function invalidateLighting(sky = false) {
  registry.flags.shadows = true;
  registry.flags.probes = true;
  if (sky) registry.flags.skyEnv = true;
  registry.lightingVersion++;
}
