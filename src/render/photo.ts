// Photo Mode: a path-traced still of the current view. three-gpu-pathtracer traces the shell,
// furniture and lights, with the sky (and the window view in it) as the environment. The result is
// shown through the app's own exposure, white balance, bloom and tone mapping (see PhotoMode.tsx).
//
// The path tracer sees only standard material inputs, so each material is copied with what the
// app's shader patch does folded in where it can be: texture scale (UVs are in metres), rotated
// planks, re-centred roughness, greyscale fabrics. Tile joints and per-tile tone are not reproduced.

import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { ParallelMeshBVHWorker } from 'three-mesh-bvh/worker';
import { CEIL } from '../shell/build';
import type { ShellData } from '../shell/types';
import { MAX_DL_PER_ZONE, MAX_LAMPS, zoneDownlightUniforms, zoneLampUniforms } from './daylight';
import { denoise, loadDenoiser, readTarget, renderGuides, toTexture, type Guides } from './denoise';
import type { PhotoHints } from './materials';
import { registry } from './registry';
import { createSkyEquirectMaterial, skyMaterial } from './skyMaterial';

/** Width of the sky image the path tracer importance-samples for light. */
const ENV_WIDTH = 2048;
/** Width of the sky image seen directly and through the windows. */
const BACKGROUND_WIDTH = 4096;

/** Renders the current sky (with the landscape) as an equirectangular image in the path tracer's layout. */
function renderSky(gl: THREE.WebGLRenderer, width: number): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(width, width / 2, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  rt.texture.wrapS = THREE.RepeatWrapping;
  const material = createSkyEquirectMaterial();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const u = skyMaterial.uniforms;
  // The sun is a light of its own; its disc in the sky would count it twice.
  const disc = u.sunDiscScale!.value as number;
  u.sunDiscScale!.value = 0;
  const target = gl.getRenderTarget();
  const autoClear = gl.autoClear;
  gl.autoClear = true;
  gl.setRenderTarget(rt);
  gl.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  gl.setRenderTarget(target);
  gl.autoClear = autoClear;
  u.sunDiscScale!.value = disc;
  material.dispose();
  quad.geometry.dispose();
  return rt;
}

/** A CPU copy of a half-float target: the path tracer builds its sampling tables from the pixels. */
function toDataTexture(gl: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget): THREE.DataTexture {
  const { width, height } = rt;
  const data = new Uint16Array(width * height * 4);
  gl.readRenderTargetPixels(rt, 0, 0, width, height, data);
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Textures made for the traced copies (so only these are disposed afterwards). */
const clones = new Set<THREE.Texture>();

/** A texture scaled (and turned) the way the app's shader patch reads it. Shares the image. */
function scaled(t: THREE.Texture | null, h: PhotoHints): THREE.Texture | null {
  if (!t) return null;
  const c = t.clone();
  clones.add(c);
  c.repeat.set(1 / h.texSize.x, 1 / h.texSize.y);
  // The patch swaps u and v; a quarter turn does the same up to a mirror, which grain can't show.
  c.rotation = h.rotate ? Math.PI / 2 : 0;
  c.center.set(0, 0);
  c.offset.set(0, 0);
  c.updateMatrix();
  return c;
}

const isGlass = (m: THREE.Material) => m.name === 'glass' || m.name.startsWith('furniture-glass') || m.name.startsWith('fluted@');

/** The path tracer's copy of an app material, or null if the object shouldn't be traced. */
function tracedMaterial(src: THREE.Material): THREE.Material | null {
  if (src instanceof THREE.MeshBasicMaterial) {
    // Lit downlight lenses: pure emission. Other unlit materials are helpers (highlights, guides).
    return src.name === 'downlight-glow' ? new THREE.MeshStandardMaterial({ color: 0x000000, emissive: src.color, roughness: 1 }) : null;
  }
  if (!(src instanceof THREE.MeshStandardMaterial)) return null;
  if (isGlass(src)) {
    // Thin glass (no thickness): light passes straight through, with Fresnel reflections. Shadow
    // rays ignore it, so sunlight comes in at full strength.
    const g = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: src.normalMap ? 0.12 : 0.02, transmission: 1, ior: 1.5, thickness: 0, side: THREE.DoubleSide });
    Object.assign(g, { castShadow: false });
    return g;
  }
  const h = src.userData.photo as PhotoHints | undefined;
  const m = new THREE.MeshStandardMaterial({
    name: src.name,
    color: src.color,
    roughness: src.roughness,
    metalness: src.metalness,
    emissive: src.emissive,
    emissiveIntensity: src.emissiveIntensity,
    emissiveMap: src.emissiveMap,
    metalnessMap: src.metalnessMap,
    alphaMap: src.alphaMap,
    side: src.side,
    transparent: src.transparent,
    opacity: src.opacity,
    alphaTest: src.alphaTest,
  });
  m.normalScale.copy(src.normalScale);
  if (h) {
    m.roughness = h.roughness;
    if (h.luma) m.color.multiplyScalar(h.luma);
    else m.map = scaled(src.map, h);
    m.normalMap = scaled(src.normalMap, h);
  } else {
    m.map = src.map;
    m.normalMap = src.normalMap;
    m.roughnessMap = src.roughnessMap;
  }
  // Lamp shades glow by themselves and must not block their own lamp (the app's lamps cast no shadows either).
  if (registry.glowMaterials.has(src)) Object.assign(m, { castShadow: false });
  return m;
}

/**
 * The downlights and lamps as real lights, with the colour × intensity the surface shaders use:
 * downlights are spotlights with the same beam (smoothstep(0.15, 0.8, cos θ)), lamps point lights.
 */
function buildLights(shell: ShellData): THREE.Group {
  const group = new THREE.Group();
  group.name = 'photo-lights';
  const index = new Map<string, number>();
  for (const d of shell.downlights) {
    const i = index.get(d.zone) ?? 0;
    index.set(d.zone, i + 1);
    if (i >= MAX_DL_PER_ZONE) continue;
    const c = zoneDownlightUniforms(d.zone).value[i]!;
    if (c.r + c.g + c.b <= 0) continue;
    const s = new THREE.SpotLight(c.clone(), 1, 0, Math.acos(0.15), 1 - Math.acos(0.8) / Math.acos(0.15), 2);
    s.position.set(d.position[0], CEIL - 0.01, d.position[2]);
    s.target.position.set(d.position[0], 0, d.position[2]);
    group.add(s, s.target);
  }
  for (const z of shell.zones) {
    const u = zoneLampUniforms(z.id);
    for (let i = 0; i < MAX_LAMPS; i++) {
      const c = u.color.value[i]!;
      if (c.r + c.g + c.b <= 0) continue;
      const p = u.pos.value[i]!;
      if (p.w > 0.5) {
        // Pendants and desk lamps throw their light down.
        const s = new THREE.SpotLight(c.clone().multiplyScalar(1.4), 1, 0, THREE.MathUtils.degToRad(75), 0.8, 2);
        s.position.set(p.x, p.y, p.z);
        s.target.position.set(p.x, p.y - 1, p.z);
        group.add(s, s.target);
      } else {
        const l = new THREE.PointLight(c.clone(), 1, 0, 2);
        l.position.set(p.x, p.y, p.z);
        group.add(l);
      }
    }
  }
  return group;
}

export interface PhotoOptions {
  /** Samples to stop at. */
  target: number;
  /** Share of the canvas resolution to trace at. */
  renderScale: number;
  onProgress?: (share: number) => void;
}

/** One path-traced photo: prepares the scene, accumulates samples, and puts everything back. */
export class PhotoSession {
  readonly tracer: WebGLPathTracer;
  private worker = new ParallelMeshBVHWorker();
  private undo: (() => void)[] = [];
  private materialUndo: (() => void)[] = [];
  private copies = new Map<THREE.Material, THREE.Material | null>();
  private lights: THREE.Group | null = null;
  private env: THREE.DataTexture | null = null;
  private background: THREE.WebGLRenderTarget | null = null;
  private disposed = false;
  private guides: Guides | null = null;
  ready = false;

  constructor(
    private gl: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    /** The full-screen quad that shows the result; kept out of the traced scene. */
    private display: THREE.Object3D,
    private options: PhotoOptions,
  ) {
    const pt = new WebGLPathTracer(gl);
    pt.renderToCanvas = false;
    pt.rasterizeScene = false;
    pt.renderDelay = 0;
    pt.minSamples = 0;
    pt.fadeDuration = 0;
    pt.dynamicLowRes = false;
    pt.multipleImportanceSampling = true;
    pt.bounces = 6;
    pt.transmissiveBounces = 8;
    pt.filterGlossyFactor = 0.5;
    pt.renderScale = options.renderScale;
    pt.tiles.set(2, 2);
    pt.textureSize.set(1024, 1024);
    pt.setBVHWorker(this.worker);
    this.tracer = pt;
  }

  get samples(): number {
    return this.tracer.samples;
  }

  async start(shell: ShellData): Promise<void> {
    try {
      await this.build(shell);
    } catch (err) {
      // Put the scene back at once rather than when Photo Mode is closed.
      this.restoreMaterials();
      for (const f of this.undo.splice(0).reverse()) f();
      throw err;
    }
  }

  private async build(shell: ShellData): Promise<void> {
    const { gl, scene, camera } = this;
    // The sky: a sharp copy for what is seen, a smaller one for lighting.
    this.background = renderSky(gl, BACKGROUND_WIDTH);
    const envRt = renderSky(gl, ENV_WIDTH);
    this.env = toDataTexture(gl, envRt);
    envRt.dispose();

    // Lights stay hidden from the rasteriser (which would recompile every material for them).
    this.lights = buildLights(shell);
    this.lights.visible = false;
    scene.add(this.lights);

    this.prepare(scene, camera);
    // The tracer reads the scene's environment as it finishes building, and the app's own (a
    // prefiltered render target) is not something it can sample: leave it out until the sky is set.
    const prevEnv = scene.environment;
    const prevBackground = scene.background;
    scene.environment = null;
    try {
      await this.tracer.setSceneAsync(scene, camera, { onProgress: this.options.onProgress });
    } finally {
      scene.environment = prevEnv;
    }
    if (this.disposed) return;

    scene.environment = this.env;
    scene.background = this.background.texture;
    this.tracer.updateEnvironment();
    scene.environment = prevEnv;
    scene.background = prevBackground;
    this.lights.visible = true;
    this.tracer.updateLights();
    this.lights.visible = false;

    // Guide images for the denoiser, at the size the tracer will render.
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.floor(size.x * this.options.renderScale);
    const h = Math.floor(size.y * this.options.renderScale);
    this.guides = renderGuides(gl, scene, camera, w, h, (m) => (m as THREE.MeshPhysicalMaterial).transmission > 0);

    // The tracer holds its own copy of everything now: put the app's materials back and show
    // only the result.
    this.restoreMaterials();
    for (const child of scene.children) {
      if (child === this.display || !child.visible) continue;
      child.visible = false;
      this.undo.push(() => (child.visible = true));
    }
    this.display.visible = true;
    this.ready = true;
  }

  /** Swap in traced copies of the materials and hide what shouldn't be traced. */
  private prepare(scene: THREE.Scene, camera: THREE.Camera) {
    const hide = (o: THREE.Object3D) => {
      o.visible = false;
      this.undo.push(() => (o.visible = true));
    };
    const visit = (o: THREE.Object3D) => {
      if (!o.visible || o === this.display || o === this.lights) return;
      // Objects the camera can't see (the daylight blockers live on their own layer).
      if (!o.layers.test(camera.layers)) return hide(o);
      if (o instanceof THREE.Mesh) {
        const src = o.material as THREE.Material | THREE.Material[];
        const list = Array.isArray(src) ? src : [src];
        const copies = list.map((m) => {
          if (!this.copies.has(m)) this.copies.set(m, tracedMaterial(m));
          return this.copies.get(m)!;
        });
        if (copies.some((c) => !c)) return hide(o);
        o.material = Array.isArray(src) ? (copies as THREE.Material[]) : copies[0]!;
        this.materialUndo.push(() => (o.material = src));
      } else if (o instanceof THREE.Line || o instanceof THREE.Points || o instanceof THREE.Sprite) {
        return hide(o);
      }
      for (const c of o.children) visit(c);
    };
    visit(scene);
  }

  private restoreMaterials() {
    for (const f of this.materialUndo.splice(0)) f();
  }

  /** Accumulate a sample (one tile of one, really) until the target is reached. */
  step(): boolean {
    if (!this.ready || this.disposed) return false;
    if (this.tracer.samples >= this.options.target) return false;
    const target = this.gl.getRenderTarget();
    this.tracer.renderSample();
    this.gl.setRenderTarget(target);
    return true;
  }

  /** A denoised copy of the image so far, or null if there is no denoiser here. */
  async denoised(): Promise<THREE.DataTexture | null> {
    const net = await loadDenoiser();
    const rt = this.tracer.target;
    if (!net || !this.guides || this.disposed || rt.width !== this.guides.albedo.width || rt.height !== this.guides.albedo.height) return null;
    const out = await denoise(net, readTarget(this.gl, rt), rt.width, rt.height, this.guides);
    return this.disposed ? null : toTexture(out, rt.width, rt.height);
  }

  dispose() {
    this.disposed = true;
    this.restoreMaterials();
    for (const f of this.undo.splice(0).reverse()) f();
    this.display.visible = false;
    if (this.lights) this.scene.remove(this.lights);
    this.tracer.dispose();
    this.worker.dispose();
    this.env?.dispose();
    this.background?.dispose();
    for (const m of this.copies.values()) m?.dispose();
    for (const t of clones) t.dispose();
    clones.clear();
  }
}
