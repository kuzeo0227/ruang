// Sky, sun, daylight through the openings, room probes, downlights and exposure.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { STYLES } from '../catalogue/styles';
import { CEIL } from '../shell/build';
import type { ZoneId } from '../shell/types';
import { useStore } from '../state/store';
import { BLOCKER_LAYER, captureApertures, createBlockers, downlightColor, renderApertureShadows, zoneDiffuseUniforms } from './daylight';
import { QUALITY } from './quality';
import { hideFurnitureNear, invalidateLighting, registry } from './registry';
import { applyBackdrop, skyMaterial, type BackdropMeta } from './skyMaterial';
import { getShell } from './shellCache';
import { sunLight, sunPosition } from './sun';

const SUN_STRENGTH = 3.4;
/** Brightness of the photographed landscape relative to the simulated sky. */
const LAND_SCALE = 0.55;
/**
 * Downlight intensity (irradiance at 1 m straight below, in scene units). In these units the sun
 * is about 3.4, so a lamp-lit room ends up roughly ten times darker than a daylit one, as in
 * life; exposure opens up at night to compensate.
 */
const DOWNLIGHT = 0.05;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export { skyMaterial };

export function kelvinColor(k: number): THREE.Color {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number) => Math.max(0, Math.min(255, v)) / 255;
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

/** Whether the room lights are on: by the switch, or in Auto once the sun is low. */
export function lightsOnAt(mode: 'auto' | 'on' | 'off', month: number, time: number): boolean {
  return mode === 'on' || (mode === 'auto' && sunPosition(month, time).elevation < 4);
}

export function useLightsOn(): boolean {
  const mode = useStore((s) => s.lights);
  const time = useStore((s) => s.time);
  const month = useStore((s) => s.month);
  return lightsOnAt(mode, month, time);
}

export function Lighting() {
  const view = useStore((s) => s.view);
  const time = useStore((s) => s.time);
  const month = useStore((s) => s.month);
  const lightsMode = useStore((s) => s.lights);
  const quality = useStore((s) => s.quality);
  const unit = useStore((s) => s.unit);
  const { gl, scene } = useThree();
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const q = QUALITY[quality];
  const shell = useMemo(() => getShell(unit), [unit]);

  // Backdrop texture for the current view.
  useEffect(() => {
    let alive = true;
    const base = `/backdrops/${view}/`;
    const file = quality === 'low' ? 'band_3k.webp' : 'band_6k.webp';
    Promise.all([fetch(base + 'meta.json').then((r) => r.json() as Promise<BackdropMeta>), new THREE.TextureLoader().loadAsync(base + file)])
      .then(([meta, tex]) => {
        if (!alive) return;
        tex.colorSpace = THREE.NoColorSpace; // decoded to linear in the shader
        tex.wrapS = THREE.RepeatWrapping;
        tex.anisotropy = 4;
        applyBackdrop(skyMaterial, tex, meta);
        invalidateLighting(true);
      })
      .catch(() => applyBackdrop(skyMaterial, null, null));
    return () => {
      alive = false;
    };
  }, [view, quality]);

  // Sun, sky and the landscape's relighting follow the time of day.
  useEffect(() => {
    const sun = sunPosition(month, time);
    registry.sun = { elevation: sun.elevation, azimuth: sun.azimuth };
    const u = skyMaterial.uniforms;
    (u.sunDirection!.value as THREE.Vector3).set(...sun.direction);
    const el = sun.elevation;
    u.night!.value = 1 - smooth(-12, -1, el);
    // Afterglow radiance (scene units): strongest at sunset, gone by nautical dusk.
    // About 400 lux outdoors at 1.5° below the horizon, a few lux by civil dusk (sun 3.4 ≈ 100,000 lux).
    u.twilight!.value = el > 6 ? 0 : 0.035 * Math.exp(Math.min(el, 0) / 1.4) * (1 - smooth(0, 6, el));
    // Landscape light: full daylight, warm and dim at dusk, moonlit blue at night.
    const lightC = sunLight(el);
    const warmth = smooth(4, 25, el);
    const level = (0.12 + 0.88 * smooth(-3, 20, el)) * LAND_SCALE;
    const day = new THREE.Vector3(
      THREE.MathUtils.lerp(lightC.color[0], 1, warmth) * level,
      THREE.MathUtils.lerp(lightC.color[1], 1, warmth) * level,
      THREE.MathUtils.lerp(lightC.color[2], 1, warmth) * level,
    );
    const nightC = new THREE.Vector3(0.0002, 0.00028, 0.0005);
    (u.landLight!.value as THREE.Vector3).copy(nightC.lerp(day, smooth(-8, 2, el)));
    u.hazeAmount!.value = 0.1 + 0.25 * (1 - smooth(0, 20, el));

    const light = sunRef.current;
    registry.sunLight = light;
    if (light) {
      // The light stays in the scene at night (intensity 0) so shaders never recompile at dusk.
      light.intensity = SUN_STRENGTH * lightC.intensity;
      light.color.setRGB(...lightC.color);
    }
    registry.lightsOn = lightsOnAt(lightsMode, month, time);
    invalidateLighting(true);
  }, [time, month, lightsMode]);

  // Shadow camera sized to the unit; shadows render only when something changed.
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    const light = sunRef.current;
    if (!light) return;
    light.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    light.shadow.map?.dispose();
    light.shadow.map = null;
    registry.flags.shadows = true;
  }, [gl, q.shadowMap]);

  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    const c = [(shell.bounds.min[0] + shell.bounds.max[0]) / 2, 1.2, (shell.bounds.min[2] + shell.bounds.max[2]) / 2] as const;
    target.position.set(...c);
    target.updateMatrixWorld();
    const light = sunRef.current;
    if (light) {
      const half = Math.max(shell.bounds.max[0] - shell.bounds.min[0], shell.bounds.max[2] - shell.bounds.min[2]) / 2 + 1.5;
      const cam = light.shadow.camera;
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.near = 1;
      cam.far = 90;
      cam.updateProjectionMatrix();
    }
  }, [shell, target]);

  useFrame(() => {
    const light = sunRef.current;
    if (light) {
      // Keep the light offset relative to the unit centre.
      const d = (skyMaterial.uniforms.sunDirection!.value as THREE.Vector3).clone().normalize();
      light.position.copy(target.position).addScaledVector(d, 40);
    }
    if (registry.planMode) {
      // With the ceilings off for the plan view, redrawn shadows would let the sun in through the
      // roof, so all shadows and probes wait until walking again.
    } else if (registry.flags.shadows) {
      gl.shadowMap.needsUpdate = true;
      registry.flags.shadows = false;
      registry.flags.sunShadow = false;
      renderApertureShadows(gl, scene, shell.apertures, registry.furnitureRoot);
    } else if (registry.flags.sunShadow) {
      gl.shadowMap.needsUpdate = true;
      registry.flags.sunShadow = false;
    }
    skyMaterial.uniforms.time!.value = performance.now() / 1000;
  });

  const blockers = useMemo(() => createBlockers(shell.apertures), [shell]);

  return (
    <>
      <mesh renderOrder={-10} frustumCulled={false} material={skyMaterial}>
        <sphereGeometry args={[1500, 64, 32]} />
      </mesh>
      <primitive object={target} />
      <primitive object={blockers} />
      <directionalLight
        ref={sunRef}
        target={target}
        castShadow
        shadow-bias={-0.00025}
        shadow-normalBias={0.025}
        shadow-radius={2.5}
        shadow-mapSize={[q.shadowMap, q.shadowMap]}
      />
      <SkyEnvironment />
      <Probes size={q.probe} />
      <Downlights />
      <ExposureControl />
    </>
  );
}

/** Renders the sky (with landscape) into a PMREM environment for outdoor surfaces and as the probes' first pass. */
function SkyEnvironment() {
  const { gl, scene } = useThree();
  const pmrem = useMemo(() => new THREE.PMREMGenerator(gl), [gl]);
  const skyScene = useMemo(() => {
    const s = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), skyMaterial);
    mesh.frustumCulled = false;
    s.add(mesh);
    return s;
  }, []);
  const target = useRef<THREE.WebGLRenderTarget | null>(null);
  useFrame(() => {
    if (!registry.flags.skyEnv) return;
    registry.flags.skyEnv = false;
    const rt = pmrem.fromScene(skyScene, 0, 0.1, 500);
    target.current?.dispose();
    target.current = rt;
    registry.skyEnv = rt.texture;
    scene.environment = rt.texture;
    for (const [zone, mats] of registry.zoneMaterials) {
      if (registry.zoneEnv.has(zone)) continue;
      for (const m of mats) {
        if (m.envMap !== rt.texture) {
          if (!m.envMap) m.needsUpdate = true;
          m.envMap = rt.texture;
        }
      }
    }
  }, -2);
  useEffect(
    () => () => {
      target.current?.dispose();
      pmrem.dispose();
    },
    [pmrem],
  );
  return null;
}

/**
 * One reflection probe per lighting zone, spread over several frames so walking never stalls.
 * Indoor zones also capture with their openings covered, for bounce light (daylight itself comes
 * from the openings). Bounce is rebuilt from scratch on every change in two passes: the first,
 * into scratch maps, sees direct light only; the second sees the first, giving two bounces with
 * no leftover light from the previous state (say, lights that were just switched off).
 */
function Probes({ size }: { size: number }) {
  const { gl, scene } = useThree();
  const pmrem = useMemo(() => new THREE.PMREMGenerator(gl), [gl]);
  const cube = useMemo(() => {
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    return { rt, cam: new THREE.CubeCamera(0.05, 2500, rt) };
  }, [size]);
  const spec = useRef(new Map<ZoneId, THREE.WebGLRenderTarget>());
  const diff = useRef(new Map<ZoneId, THREE.WebGLRenderTarget>());
  const scratch = useRef(new Map<ZoneId, THREE.WebGLRenderTarget>());
  const queue = useRef<ZoneId[]>([]);
  const pass = useRef(0);

  useEffect(() => {
    // New probe size: recapture everything.
    registry.flags.probes = true;
    return () => cube.rt.dispose();
  }, [cube]);

  useFrame(() => {
    const shell = registry.shell;
    if (!shell || !registry.skyEnv || registry.planMode) return;
    const indoor = (id: ZoneId) => shell.apertures.some((a) => a.zone === id);
    // Start once the shadows for the new lighting have been drawn.
    if (registry.flags.probes && queue.current.length === 0 && !registry.flags.shadows) {
      registry.flags.probes = false;
      captureApertures(gl, scene, shell.apertures);
      pass.current = 0;
      queue.current = shell.zones.map((z) => z.id).filter(indoor);
    }
    registry.probeBusy = queue.current.length > 0 || registry.flags.probes;
    if (!queue.current.length) return;

    // Point every indoor zone's bounce light at what this pass should see.
    const bind = (maps: Map<ZoneId, THREE.WebGLRenderTarget> | null) => {
      for (const z of shell.zones) {
        if (!indoor(z.id)) continue;
        const u = zoneDiffuseUniforms(z.id);
        const t = maps?.get(z.id);
        u.texture.value = t?.texture ?? null;
        u.scale.value = t ? 1 : 0;
      }
    };
    bind(pass.current === 0 ? null : scratch.current);
    // The effect composer turns auto-clear off; cube faces must start clean.
    const autoClear = gl.autoClear;
    gl.autoClear = true;
    const seeBlockers = (on: boolean) => {
      for (const c of cube.cam.children) {
        if (on) c.layers.enable(BLOCKER_LAYER);
        else c.layers.disable(BLOCKER_LAYER);
      }
    };
    for (let i = 0; i < 2 && queue.current.length; i++) {
      const id = queue.current.shift()!;
      const zone = shell.zones.find((z) => z.id === id);
      if (!zone) continue;
      cube.cam.position.set(...zone.probe);
      const showFurniture = hideFurnitureNear(cube.cam.position);
      if (pass.current === 1) {
        seeBlockers(false);
        cube.cam.update(gl, scene);
        const rt = pmrem.fromCubemap(cube.rt.texture, spec.current.get(id) ?? null);
        spec.current.set(id, rt);
        registry.zoneEnv.set(id, rt.texture);
        for (const m of registry.zoneMaterials.get(id) ?? []) {
          if (m.envMap !== rt.texture) {
            if (!m.envMap) m.needsUpdate = true;
            m.envMap = rt.texture;
          }
        }
      }
      if (indoor(id)) {
        seeBlockers(true);
        cube.cam.update(gl, scene);
        seeBlockers(false);
        const maps = pass.current === 0 ? scratch.current : diff.current;
        maps.set(id, pmrem.fromCubemap(cube.rt.texture, maps.get(id) ?? null));
      }
      showFurniture();
    }
    gl.autoClear = autoClear;
    bind(diff.current);
    if (!queue.current.length && pass.current === 0) {
      pass.current = 1;
      queue.current = shell.zones.map((z) => z.id);
    }
  }, -1);

  useEffect(
    () => () => {
      for (const rt of [...spec.current.values(), ...diff.current.values(), ...scratch.current.values()]) rt.dispose();
      pmrem.dispose();
    },
    [pmrem],
  );
  return null;
}

/** Ceiling downlights: the fittings, and the shared colour the surface shaders light their zone with. */
function Downlights() {
  const styleId = useStore((s) => s.style);
  const unit = useStore((s) => s.unit);
  const kelvin = STYLES[styleId].lightKelvin;
  const shell = useMemo(() => getShell(unit), [unit]);
  const on = useLightsOn();

  const color = useMemo(() => kelvinColor(kelvin), [kelvin]);
  const trim = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d8d6d2', roughness: 0.5, metalness: 0.2 }), []);
  const lens = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.35 }), []);
  // The lit lens: bright enough to bloom at night exposure, and still read as on by day.
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(4), toneMapped: false }), [color]);
  useEffect(() => {
    if (on) downlightColor.value.copy(color).multiplyScalar(DOWNLIGHT);
    else downlightColor.value.setRGB(0, 0, 0);
    invalidateLighting();
  }, [on, color]);

  const plan = useStore((s) => s.mode === 'plan');
  return (
    <group visible={!plan}>
      {shell.downlights.map((d, i) => (
        <group key={i} position={[d.position[0], CEIL - 0.002, d.position[2]]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={on ? glow : lens}>
            <circleGeometry args={[0.045, 24]} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} material={trim}>
            <ringGeometry args={[0.045, 0.06, 24]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Exposure limits and white balance. The camera meters the view (see Effects); the limits keep a
 * night-time room looking like night, and the key sets how bright an average view should look.
 */
function ExposureControl() {
  const ev = useStore((s) => s.exposureEv);
  const styleId = useStore((s) => s.style);
  const kelvin = STYLES[styleId].lightKelvin;
  useEffect(() => {
    // The most the white balance may correct under downlights: three quarters of the way (in log terms), so evenings stay warm
    // white, the way a camera's auto white balance leaves them.
    const c = kelvinColor(kelvin);
    const wb = registry.whiteBalance.night;
    wb.setRGB(Math.pow(c.g / c.r, 0.75), 1, Math.pow(c.g / Math.max(c.b, 0.02), 0.75));
  }, [kelvin]);
  useFrame(() => {
    const el = registry.sun.elevation;
    const daylight = smooth(-6, 20, el);
    const e = registry.exposure;
    if (registry.lightsOn && daylight < 1) {
      e.key = THREE.MathUtils.lerp(0.13, 0.18, daylight);
      e.max = THREE.MathUtils.lerp(60, 8, daylight);
    } else {
      // Lights off at night: the eye only partly adapts, so the room stays dark.
      e.key = THREE.MathUtils.lerp(0.03, 0.18, daylight);
      e.max = THREE.MathUtils.lerp(20, 8, daylight);
    }
    e.min = 0.5;
    e.bias = Math.pow(2, ev);
    registry.whiteBalance.daylight = registry.lightsOn ? smooth(-4, 12, el) : 1;
  });
  return null;
}

export { CEIL };
