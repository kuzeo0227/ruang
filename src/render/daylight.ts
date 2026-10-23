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
  // The sun itself arrives as the shadowed directional light, so keep it out of the window glow.
  skyMaterial.uniforms.sunDiscScale!.value = 0;
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
  gl.setRenderTarget(prevTarget);
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
export const apertureShadowTarget = new THREE.WebGLRenderTarget(atlasW, atlasH, atlasOptions);
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

/** Renders what each opening can see of the room, for window-light shadows. */
export function renderApertureShadows(gl: THREE.WebGLRenderer, scene: THREE.Scene, apertures: Aperture[]) {
  const prevTarget = gl.getRenderTarget();
  const prevOverride = scene.overrideMaterial;
  const prevClear = gl.getClearColor(new THREE.Color());
  const prevAlpha = gl.getClearAlpha();
  scene.overrideMaterial = momentsMaterial;
  // Cleared to the far range: nothing in the way.
  gl.setClearColor(new THREE.Color(1, 1, 0), 1);
  gl.setRenderTarget(apertureShadowTarget);
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
    apertureShadowMatrices[i]!.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse);
    apertureShadowOrigins[i]!.copy(c);
    (momentsMaterial.uniforms.origin!.value as THREE.Vector3).copy(c);
    const x = (i % AP_ATLAS_COLS) * AP_SHADOW_SIZE;
    const y = Math.floor(i / AP_ATLAS_COLS) * AP_SHADOW_SIZE;
    apertureShadowTarget.viewport.set(x, y, AP_SHADOW_SIZE, AP_SHADOW_SIZE);
    apertureShadowTarget.scissor.set(x, y, AP_SHADOW_SIZE, AP_SHADOW_SIZE);
    apertureShadowTarget.scissorTest = true;
    gl.setRenderTarget(apertureShadowTarget);
    gl.render(scene, shadowCam);
  }
  apertureShadowTarget.scissorTest = false;
  apertureShadowTarget.viewport.set(0, 0, atlasW, atlasH);
  scene.overrideMaterial = prevOverride;
  // Blur horizontally into the spare target, then vertically back.
  blurMaterial.uniforms.src!.value = apertureShadowTarget.texture;
  (blurMaterial.uniforms.dir!.value as THREE.Vector2).set(1, 0);
  gl.setRenderTarget(blurTarget);
  gl.render(blurScene, shadowCam);
  blurMaterial.uniforms.src!.value = blurTarget.texture;
  (blurMaterial.uniforms.dir!.value as THREE.Vector2).set(0, 1);
  gl.setRenderTarget(apertureShadowTarget);
  gl.render(blurScene, shadowCam);
  gl.setClearColor(prevClear, prevAlpha);
  gl.setRenderTarget(prevTarget);
}

// ---------------- Uniforms shared by the shell materials ----------------

/** Diagnostics: scales for window light (x), bounce light (y), downlights (z) and reflections (w). */
export const lightDebug = { value: new THREE.Vector4(1, 1, 1, 1) };

/** Colour × intensity of every downlight; black when the lights are off. */
export const downlightColor = { value: new THREE.Color(0, 0, 0) };
export const apertureTexture = { value: apertureTarget.texture };
export const apertureShadowTexture = { value: apertureShadowTarget.texture };

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

/** Per-zone lighting inputs for a shell material. */
export interface ZoneLighting {
  zone: ZoneId;
  apertures: { aperture: Aperture; row: number }[];
  downlights: V3[];
}
