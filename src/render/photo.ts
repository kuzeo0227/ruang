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

/** Samples traced to measure the light before the photo proper (see PhotoSession.meter). */
export const METER_SAMPLES = 8;
/** Limits on how far the view behind the glass may be dimmed or brightened. */
const PULL_MIN = 0.2;
const PULL_MAX = 2;

/** The walk view's auto exposure: exposure = clamp(key / average luminance, min, max). */
export interface ExposureRule {
  key: number;
  min: number;
  max: number;
}

/**
 * A photographer's "window pull": how much to dim the view seen through the windows so it looks as
 * it did in the walk view, and the average luminance to hold the exposure at, with the room
 * exposed by the walk view's own rule (a centre-weighted log average, see Effects.tsx). It is
 * measured on 8 × 8 pixel blocks, so a few noisy samples are enough. The camera sees the sky or the
 * view where the normal guide has no normal (its clear grey).
 */
function windowPull(color: Float32Array, normal: ImageData, width: number, height: number, walkAvg: number, rule: ExposureRule): { pull: number; avg: number } {
  const B = 8;
  const bw = Math.ceil(width / B);
  const bh = Math.ceil(height / B);
  const room = new Float64Array(bw * bh);
  const view = new Float64Array(bw * bh);
  const count = new Float64Array(bw * bh);
  const n = normal.data;
  const grey = (v: number) => Math.abs(v - 127.5) <= 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const l = 0.2126 * color[i * 4]! + 0.7152 * color[i * 4 + 1]! + 0.0722 * color[i * 4 + 2]!;
      if (!Number.isFinite(l)) continue;
      const k = Math.floor(y / B) * bw + Math.floor(x / B);
      if (grey(n[i * 4]!) && grey(n[i * 4 + 1]!) && grey(n[i * 4 + 2]!)) view[k]! += l;
      else room[k]! += l;
      count[k]!++;
    }
  }
  const weight = new Float64Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const dx = ((bx + 0.5) * B) / width - 0.5;
      const dy = ((by + 0.5) * B) / height - 0.5;
      weight[by * bw + bx] = count[by * bw + bx]! > 0 ? 0.35 + 0.65 * Math.exp(-(dx * dx + dy * dy) * 6) : 0;
    }
  }
  const exposureFor = (pull: number) => {
    let sum = 0;
    let wsum = 0;
    for (let k = 0; k < weight.length; k++) {
      const w = weight[k]!;
      if (w === 0) continue;
      const l = (room[k]! + pull * view[k]!) / count[k]!;
      sum += w * Math.log2(THREE.MathUtils.clamp(l, 1e-4, 64));
      wsum += w;
    }
    return THREE.MathUtils.clamp(rule.key / 2 ** (sum / Math.max(wsum, 1e-9)), rule.min, rule.max);
  };
  // The view looks the same when pull × exposure matches the walk view's exposure. That product
  // only grows with the pull (a brighter view lowers the exposure, but by less), so bisect.
  const walk = THREE.MathUtils.clamp(rule.key / walkAvg, rule.min, rule.max);
  const seen = (pull: number) => pull * exposureFor(pull);
  let pull: number;
  if (seen(PULL_MIN) >= walk) pull = PULL_MIN;
  else if (seen(PULL_MAX) <= walk) pull = PULL_MAX;
  else {
    let lo = Math.log2(PULL_MIN);
    let hi = Math.log2(PULL_MAX);
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (seen(2 ** mid) < walk) lo = mid;
      else hi = mid;
    }
    pull = 2 ** ((lo + hi) / 2);
  }
  return { pull, avg: rule.key / exposureFor(pull) };
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
  /** What prepare() changed, put back as soon as the tracer has read the scene. */
  private prepUndo: (() => void)[] = [];
  private copies = new Map<THREE.Material, THREE.Material | null>();
  private lights: THREE.Group | null = null;
  private env: THREE.DataTexture | null = null;
  private background: THREE.WebGLRenderTarget | null = null;
  private disposed = false;
  private guides: Guides | null = null;
  private shown = false;
  /** The scene is built and the tracer is running. */
  ready = false;
  /** The light has been measured and the photo proper is being traced. */
  metered = false;
  /** Brightness of the view seen through the glass, relative to the sky it lights the room with. */
  pull = 1;

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
      this.restoreScene();
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

    // The tracer takes the geometry and materials from the scene at once and builds its BVH in a
    // worker, so the scene is only changed for that moment (and for the denoiser's guide images,
    // drawn from the same scene at the size the tracer renders at).
    this.prepare(scene, camera);
    // The tracer reads the scene's environment when it finishes building, and the app's own (a
    // prefiltered render target) is not something it can sample: leave it out until the sky is set.
    const prevEnv = scene.environment;
    scene.environment = null;
    try {
      const built = this.tracer.setSceneAsync(scene, camera, { onProgress: this.options.onProgress });
      const size = gl.getDrawingBufferSize(new THREE.Vector2());
      const w = Math.floor(size.x * this.options.renderScale);
      const h = Math.floor(size.y * this.options.renderScale);
      this.guides = renderGuides(gl, scene, camera, w, h, (m) => (m as THREE.MeshPhysicalMaterial).transmission > 0);
      this.restoreScene();
      await built;
    } finally {
      scene.environment = prevEnv;
    }
    if (this.disposed) return;

    this.setEnvironment(1);
    this.lights.visible = true;
    this.tracer.updateLights();
    this.lights.visible = false;
    this.ready = true;
  }

  /** The sky and the view for the tracer; the view seen through the glass at `pull` brightness. */
  private setEnvironment(pull: number) {
    const { scene } = this;
    const prev = { environment: scene.environment, background: scene.background, intensity: scene.backgroundIntensity };
    scene.environment = this.env;
    scene.background = this.background!.texture;
    scene.backgroundIntensity = pull;
    this.tracer.updateEnvironment();
    scene.environment = prev.environment;
    scene.background = prev.background;
    scene.backgroundIntensity = prev.intensity;
  }

  /**
   * Measures the light in the first samples, then starts the photo proper with the view behind the
   * glass dimmed to look as it did in the walk view. Returns the average luminance to hold the
   * exposure at.
   */
  meter(walkAvg: number, rule: ExposureRule): number {
    const rt = this.tracer.target;
    const g = this.guides;
    const fits = g !== null && rt.width === g.normal.width && rt.height === g.normal.height;
    const { pull, avg } = fits ? windowPull(readTarget(this.gl, rt), g.normal, rt.width, rt.height, walkAvg, rule) : { pull: 1, avg: walkAvg };
    this.setEnvironment(pull); // which also restarts the accumulation
    this.pull = pull;
    this.metered = true;
    return avg;
  }

  get isShown(): boolean {
    return this.shown;
  }

  /** Show only the result from now on (the walk view stays up until there is something to show). */
  show() {
    for (const child of this.scene.children) {
      if (child === this.display || !child.visible) continue;
      child.visible = false;
      this.undo.push(() => (child.visible = true));
    }
    this.display.visible = true;
    this.shown = true;
  }

  /** Swap in traced copies of the materials and hide what shouldn't be traced. */
  private prepare(scene: THREE.Scene, camera: THREE.Camera) {
    const hide = (o: THREE.Object3D) => {
      o.visible = false;
      this.prepUndo.push(() => (o.visible = true));
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
        this.prepUndo.push(() => (o.material = src));
      } else if (o instanceof THREE.Line || o instanceof THREE.Points || o instanceof THREE.Sprite) {
        return hide(o);
      }
      for (const c of o.children) visit(c);
    };
    visit(scene);
  }

  /** Put back what prepare() changed. */
  private restoreScene() {
    for (const f of this.prepUndo.splice(0).reverse()) f();
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
    this.restoreScene();
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
