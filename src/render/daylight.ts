// Daylight through windows. Each window, sliding door and glass partition is treated as a soft area
// light whose brightness is whatever is visible outside it: sky, landscape, a sunlit balcony floor.
// A small camera outside each opening renders that view; the GPU averages it into two texels per
// opening (looking up and out, looking down and out) that the surface shaders read. Indoor
// surfaces then integrate the opening's exact shape (form factor), so light is strongest near the
// glass and falls off across the room, the way real rooms look. A distance map rendered from each
// opening into the room supplies shadows, so walls (and later furniture) block window light.

import * as THREE from 'three';
import type { V3 } from '../shell/batch';
import type { Aperture, ZoneId } from '../shell/types';
import { skyMaterial } from './skyMaterial';

export const MAX_APERTURES = 32;
/** Layer for the black cards that cover openings while the bounce-light probes capture. */
export const BLOCKER_LAYER = 2;

/** Row i holds aperture i: x = 0 radiance seen looking up and out, x = 1 looking down and out. */
export const apertureTarget = new THREE.WebGLRenderTarget(2, MAX_APERTURES, {
  type: THREE.HalfFloatType,
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  depthBuffer: false,
  generateMipmaps: false,
});

const VIEW = 32;
const FOV = 120;
const viewTarget = new THREE.WebGLRenderTarget(VIEW, VIEW, { type: THREE.HalfFloatType, generateMipmaps: false });
const viewCam = new THREE.PerspectiveCamera(FOV, 1, 0.05, 3000);

const reduce = new THREE.ShaderMaterial({
  uniforms: {
    tView: { value: viewTarget.texture },
    transmit: { value: 1 },
    tanHalf: { value: Math.tan(((FOV / 2) * Math.PI) / 180) },
  },
  vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tView;
    uniform float transmit;
    uniform float tanHalf;
    void main() {
      // Texel 0 averages the upper half of the view, texel 1 the lower half, weighted by solid angle.
      int y0 = gl_FragCoord.x < 1.0 ? ${VIEW / 2} : 0;
      vec3 sum = vec3(0.0);
      float wsum = 0.0;
      for (int y = 0; y < ${VIEW / 2}; y++) {
        for (int x = 0; x < ${VIEW}; x++) {
          vec2 ndc = (vec2(float(x), float(y + y0)) + 0.5) / ${VIEW}.0 * 2.0 - 1.0;
          vec2 p = ndc * tanHalf;
          float w = pow(1.0 + dot(p, p), -1.5);
          sum += texelFetch(tView, ivec2(x, y + y0), 0).rgb * w;
          wsum += w;
        }
      }
      gl_FragColor = vec4(sum / wsum * transmit, 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});
const reduceScene = new THREE.Scene();
const reduceQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), reduce);
reduceQuad.frustumCulled = false;
reduceScene.add(reduceQuad);
const reduceCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/** Renders the view out of every opening and stores its average brightness for the shaders. */
export function captureApertures(gl: THREE.WebGLRenderer, scene: THREE.Scene, apertures: Aperture[]) {
  const prevTarget = gl.getRenderTarget();
  const sunDisc = skyMaterial.uniforms.sunDiscScale!.value as number;
  // The sun itself arrives as the shadowed directional light, so keep it out of the window glow,
  // and let the night sky in at a realistic level.
  skyMaterial.uniforms.sunDiscScale!.value = 0;
  skyMaterial.uniforms.nightLight!.value = 0.5;
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < apertures.length && i < MAX_APERTURES; i++) {
    const a = apertures[i]!;
    n.set(...a.normal);
    c.set(...a.origin)
      .addScaledVector(new THREE.Vector3(...a.u), 0.5)
      .addScaledVector(new THREE.Vector3(...a.v), 0.5)
      .addScaledVector(n, -(a.depth + 0.08));
    viewCam.position.copy(c);
    viewCam.up.set(0, 1, 0);
    viewCam.lookAt(c.x - n.x, c.y, c.z - n.z);
    viewCam.updateMatrixWorld();
    gl.setRenderTarget(viewTarget);
    gl.clear();
    gl.render(scene, viewCam);

    reduce.uniforms.transmit!.value = a.transmit;
    apertureTarget.viewport.set(0, i, 2, 1);
    apertureTarget.scissor.set(0, i, 2, 1);
    apertureTarget.scissorTest = true;
    gl.setRenderTarget(apertureTarget);
    gl.render(reduceScene, reduceCam);
  }
  apertureTarget.scissorTest = false;
  skyMaterial.uniforms.sunDiscScale!.value = sunDisc;
  skyMaterial.uniforms.nightLight!.value = 1;
  gl.setRenderTarget(prevTarget);
}

/** Diagnostics: what the daylight camera of opening `i` sees, as a 16 × 16 grid of linear RGB. */
export function debugApertureView(gl: THREE.WebGLRenderer, scene: THREE.Scene, a: Aperture): number[][] {
  const size = 64;
  const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType });
  const n = new THREE.Vector3(...a.normal);
  const c = new THREE.Vector3(...a.origin)
    .addScaledVector(new THREE.Vector3(...a.u), 0.5)
    .addScaledVector(new THREE.Vector3(...a.v), 0.5)
    .addScaledVector(n, -(a.depth + 0.08));
  viewCam.position.copy(c);
  viewCam.up.set(0, 1, 0);
  viewCam.lookAt(c.x - n.x, c.y, c.z - n.z);
  viewCam.updateMatrixWorld();
  const prev = gl.getRenderTarget();
  const sunDisc = skyMaterial.uniforms.sunDiscScale!.value as number;
  skyMaterial.uniforms.sunDiscScale!.value = 0;
  skyMaterial.uniforms.nightLight!.value = 0.5;
  gl.setRenderTarget(rt);
  gl.clear();
  gl.render(scene, viewCam);
  skyMaterial.uniforms.sunDiscScale!.value = sunDisc;
  skyMaterial.uniforms.nightLight!.value = 1;
  const buf = new Float32Array(size * size * 4);
  gl.readRenderTargetPixels(rt, 0, 0, size, size, buf);
  gl.setRenderTarget(prev);
  rt.dispose();
  const out: number[][] = [];
  for (let gy = 15; gy >= 0; gy--) {
    const row: number[] = [];
    for (let gx = 0; gx < 16; gx++) {
      let sum = 0;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const i = ((gy * 4 + y) * size + gx * 4 + x) * 4;
        sum += 0.2126 * buf[i]! + 0.7152 * buf[i + 1]! + 0.0722 * buf[i + 2]!;
      }
      row.push(+(sum / 16 * 10000).toFixed(1));
    }
    out.push(row);
  }
  return out;
}

/** Black cards over every opening, seen only by the probes' bounce-light capture. */
export function createBlockers(apertures: Aperture[]): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  for (const a of apertures) {
    const g = new THREE.BufferGeometry();
    const o = new THREE.Vector3(...a.origin).addScaledVector(new THREE.Vector3(...a.normal), 0.02);
    const u = new THREE.Vector3(...a.u);
    const v = new THREE.Vector3(...a.v);
    const p = [o, o.clone().add(u), o.clone().add(u).add(v), o.clone().add(v)];
    g.setFromPoints([p[0]!, p[1]!, p[2]!, p[0]!, p[2]!, p[3]!]);
    const mesh = new THREE.Mesh(g, mat);
    mesh.layers.set(BLOCKER_LAYER);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

// ---------------- Shadows of the openings ----------------
//
// Each opening renders the room's distances as seen from its centre into one cell of an atlas,
// stored as variance shadow map moments (d, d²) and blurred, so window light gets the very soft
// shadows a large opening casts, for one texture read per opening.

export const AP_SHADOW_SIZE = 128;
export const AP_ATLAS_COLS = 8;
const AP_ATLAS_ROWS = MAX_APERTURES / AP_ATLAS_COLS;
/** Distances are stored divided by this, to keep half-float precision. */
export const AP_SHADOW_RANGE = 24;
const atlasOptions = {
  type: THREE.HalfFloatType,
  format: THREE.RGFormat,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
} as const;
const atlasW = AP_SHADOW_SIZE * AP_ATLAS_COLS;
const atlasH = AP_SHADOW_SIZE * AP_ATLAS_ROWS;
/** Layer furniture meshes are also on, so the furniture can be drawn into its own shadow atlas. */
export const FURNITURE_LAYER = 3;
/** The blurred moments of the walls, doors and joinery (crisp: they stop light passing between rooms). */
export const apertureShadowTarget = new THREE.WebGLRenderTarget(atlasW, atlasH, { ...atlasOptions, depthBuffer: false });
/**
 * The furniture's, kept apart and mipmapped: furniture only ever hides part of a large opening, and
 * the shaders widen the blur where its penumbra should be wide.
 */
export const apertureFurnitureTarget = new THREE.WebGLRenderTarget(atlasW, atlasH, {
  ...atlasOptions,
  depthBuffer: false,
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
});
const rawTarget = new THREE.WebGLRenderTarget(atlasW, atlasH, atlasOptions);
const blurTarget = new THREE.WebGLRenderTarget(atlasW, atlasH, { ...atlasOptions, depthBuffer: false });
/** View-projection of each opening's shadow camera, and the camera's position (shared with the shaders). */
export const apertureShadowMatrices = Array.from({ length: MAX_APERTURES }, () => new THREE.Matrix4());
export const apertureShadowOrigins = Array.from({ length: MAX_APERTURES }, () => new THREE.Vector3());

const shadowCam = new THREE.PerspectiveCamera(140, 1, 0.03, AP_SHADOW_RANGE);
const momentsMaterial = new THREE.ShaderMaterial({
  uniforms: { origin: { value: new THREE.Vector3() } },
  vertexShader: /* glsl */ `
    varying vec3 vW;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 origin;
    varying vec3 vW;
    void main() {
      float d = length(vW - origin) / ${AP_SHADOW_RANGE.toFixed(1)};
      gl_FragColor = vec4(d, d * d, 0.0, 1.0);
    }`,
  side: THREE.DoubleSide,
});

// Separable blur that stays inside each atlas cell.
const blurMaterial = new THREE.ShaderMaterial({
  uniforms: { src: { value: null as THREE.Texture | null }, dir: { value: new THREE.Vector2(1, 0) } },
  vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D src;
    uniform vec2 dir;
    void main() {
      ivec2 p = ivec2(gl_FragCoord.xy);
      ivec2 cell = p / ${AP_SHADOW_SIZE};
      ivec2 lo = cell * ${AP_SHADOW_SIZE};
      ivec2 hi = lo + ${AP_SHADOW_SIZE - 1};
      vec2 sum = vec2(0.0);
      float wsum = 0.0;
      for (int k = -6; k <= 6; k++) {
        float w = exp(-float(k * k) / 18.0);
        ivec2 q = clamp(p + ivec2(dir) * k, lo, hi);
        sum += texelFetch(src, q, 0).rg * w;
        wsum += w;
      }
      gl_FragColor = vec4(sum / wsum, 0.0, 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
});
const blurScene = new THREE.Scene();
const blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
blurQuad.frustumCulled = false;
blurScene.add(blurQuad);
// Its own camera: the shadow camera's layers change between the building and furniture passes.
const blurCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/**
 * Renders what each opening can see of the room, for window-light shadows: once for the building
 * (with the furniture hidden) and once for the furniture alone.
 */
export function renderApertureShadows(gl: THREE.WebGLRenderer, scene: THREE.Scene, apertures: Aperture[], furniture: THREE.Object3D | null) {
  const prevTarget = gl.getRenderTarget();
  const prevOverride = scene.overrideMaterial;
  const prevClear = gl.getClearColor(new THREE.Color());
  const prevAlpha = gl.getClearAlpha();
  scene.overrideMaterial = momentsMaterial;
  // Cleared to the far range: nothing in the way.
  gl.setClearColor(new THREE.Color(1, 1, 0), 1);
  const wasVisible = furniture?.visible ?? false;
  if (furniture) furniture.visible = false;
  shadowCam.layers.set(0);
  renderCells(gl, scene, apertures, apertureShadowTarget, false);
  if (furniture) furniture.visible = wasVisible;
  shadowCam.layers.set(FURNITURE_LAYER);
  renderCells(gl, scene, apertures, apertureFurnitureTarget, true);
  shadowCam.layers.set(0);
  scene.overrideMaterial = prevOverride;
  gl.setClearColor(prevClear, prevAlpha);
  gl.setRenderTarget(prevTarget);
}

function renderCells(gl: THREE.WebGLRenderer, scene: THREE.Scene, apertures: Aperture[], out: THREE.WebGLRenderTarget, furniturePass: boolean) {
  gl.setRenderTarget(rawTarget);
  gl.clear();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < apertures.length && i < MAX_APERTURES; i++) {
    const a = apertures[i]!;
    n.set(...a.normal);
    c.set(...a.origin)
      .addScaledVector(new THREE.Vector3(...a.u), 0.5)
      .addScaledVector(new THREE.Vector3(...a.v), 0.5)
      .addScaledVector(n, 0.01);
    shadowCam.position.copy(c);
    shadowCam.up.set(0, 1, 0);
    shadowCam.lookAt(c.x + n.x, c.y + n.y, c.z + n.z);
    shadowCam.updateMatrixWorld();
    if (!furniturePass) {
      apertureShadowMatrices[i]!.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse);
      apertureShadowOrigins[i]!.copy(c);
    }
    (momentsMaterial.uniforms.origin!.value as THREE.Vector3).copy(c);
    const x = (i % AP_ATLAS_COLS) * AP_SHADOW_SIZE;
    const y = Math.floor(i / AP_ATLAS_COLS) * AP_SHADOW_SIZE;
    rawTarget.viewport.set(x, y, AP_SHADOW_SIZE, AP_SHADOW_SIZE);
    rawTarget.scissor.set(x, y, AP_SHADOW_SIZE, AP_SHADOW_SIZE);
    rawTarget.scissorTest = true;
    gl.setRenderTarget(rawTarget);
    gl.render(scene, shadowCam);
  }
  rawTarget.scissorTest = false;
  rawTarget.viewport.set(0, 0, atlasW, atlasH);
  // Blur horizontally into the spare target, then vertically into the atlas.
  blurMaterial.uniforms.src!.value = rawTarget.texture;
  (blurMaterial.uniforms.dir!.value as THREE.Vector2).set(1, 0);
  gl.setRenderTarget(blurTarget);
  gl.render(blurScene, blurCam);
  blurMaterial.uniforms.src!.value = blurTarget.texture;
  (blurMaterial.uniforms.dir!.value as THREE.Vector2).set(0, 1);
  gl.setRenderTarget(out);
  gl.render(blurScene, blurCam);
}

// ---------------- Uniforms shared by the shell materials ----------------

/** Diagnostics: scales for window light (x), bounce light (y), downlights (z) and reflections (w). */
export const lightDebug = { value: new THREE.Vector4(1, 1, 1, 1) };

export const apertureTexture = { value: apertureTarget.texture };
export const apertureShadowTexture = { value: apertureShadowTarget.texture };
export const apertureFurnitureTexture = { value: apertureFurnitureTarget.texture };

export interface ZoneDiffuse {
  /** Bounce light for the zone, captured with the openings covered (the window term adds the daylight). */
  texture: { value: THREE.Texture | null };
  /** 0 until the first capture, so nothing is lit by a stale or missing probe. */
  scale: { value: number };
}
const zoneDiffuse = new Map<ZoneId, ZoneDiffuse>();
export function zoneDiffuseUniforms(zone: ZoneId): ZoneDiffuse {
  let z = zoneDiffuse.get(zone);
  if (!z) zoneDiffuse.set(zone, (z = { texture: { value: null }, scale: { value: 0 } }));
  return z;
}

/** Downlights a zone's surfaces are lit by (the rest still show, but light nothing). */
export const MAX_DL_PER_ZONE = 8;
/**
 * Colour × intensity of each of a zone's downlights, in the order of `zoneLighting` (black when
 * off). Always MAX_DL_PER_ZONE long; a material uses as many as it was compiled for.
 */
const zoneDownlights = new Map<ZoneId, { value: THREE.Color[] }>();
export function zoneDownlightUniforms(zone: ZoneId): { value: THREE.Color[] } {
  let z = zoneDownlights.get(zone);
  if (!z) zoneDownlights.set(zone, (z = { value: Array.from({ length: MAX_DL_PER_ZONE }, () => new THREE.Color(0, 0, 0)) }));
  return z;
}

/** Lamps (floor, table and pendant lights) that light each zone, as point lights in the surface shaders. */
export const MAX_LAMPS = 4;
export interface ZoneLamps {
  /** xyz = position; w = how much of the light goes down (0 = all round, 1 = a downward cone). */
  pos: { value: THREE.Vector4[] };
  /** Colour × intensity (irradiance at 1 m); black for unused slots. */
  color: { value: THREE.Color[] };
}
const zoneLamps = new Map<ZoneId, ZoneLamps>();
export function zoneLampUniforms(zone: ZoneId): ZoneLamps {
  let z = zoneLamps.get(zone);
  if (!z) {
    z = {
      pos: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4()) },
      color: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Color(0, 0, 0)) },
    };
    zoneLamps.set(zone, z);
  }
  return z;
}

/** Per-zone lighting inputs for a shell material. */
export interface ZoneLighting {
  zone: ZoneId;
  apertures: { aperture: Aperture; row: number }[];
  downlights: V3[];
}
