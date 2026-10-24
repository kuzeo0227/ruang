// URL parameters and a window hook, so the scene can be set up without a mouse (headless screenshots,
// bookmarking a viewpoint while tuning). Example:
//   /?autostart=1&x=4.2&z=3.1&yaw=180&pitch=-5&time=17.5&style=muji&view=city&lights=evening&hud=0

import * as THREE from 'three';
import { STYLE_ORDER, type StyleId } from './catalogue/styles';
import { BLOCKER_LAYER, apertureTarget, debugApertureView, lightDebug } from './render/daylight';
import { adaptedAverage } from './render/Effects';
import { editView } from './render/EditController';
import { activeCameraRef, controls } from './render/Player';
import { registry } from './render/registry';
import { useLayout } from './state/layout';
import { applyLightScene, setRoomLight, toggleRooms } from './render/roomLights';
import { useStore, type Panel, type Quality } from './state/store';
import { openPhoto } from './ui/PhotoBar';
import { createSkyEquirectMaterial } from './render/skyMaterial';

const deg = Math.PI / 180;

export function applyUrlParams() {
  const p = new URLSearchParams(window.location.search);
  const s = useStore.getState();
  const num = (k: string) => {
    const v = p.get(k);
    return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  };
  const patch: Parameters<typeof s.set>[0] = {};
  const time = num('time');
  if (time !== null) patch.time = Math.min(24, Math.max(0, time));
  const month = num('month');
  if (month !== null) patch.month = Math.min(12, Math.max(1, Math.round(month)));
  const style = p.get('style');
  if (style && (STYLE_ORDER as string[]).includes(style)) patch.style = style as StyleId;
  const view = p.get('view');
  if (view === 'mountain' || view === 'rainforest' || view === 'beach' || view === 'city') patch.view = view;
  const quality = p.get('quality');
  if (quality === 'low' || quality === 'medium' || quality === 'high') patch.quality = quality as Quality;
  const ev = num('ev');
  if (ev !== null) patch.exposureEv = ev;
  const fov = num('fov');
  if (fov !== null) patch.fov = fov;
  if (p.get('stats') === '1') patch.showStats = true;
  if (p.get('hud') === '0') patch.hudHidden = true;
  const panel = p.get('panel');
  if (panel === 'style' || panel === 'furniture' || panel === 'lighting' || panel === 'views' || panel === 'settings') patch.panel = panel as Panel;
  if (p.get('autostart') === '1') patch.started = true;
  s.set(patch);
  // lights=auto|on|off, or a scene: evening, movie.
  const lights = p.get('lights');
  const scene = ({ auto: 'auto', on: 'allOn', off: 'allOff', evening: 'evening', movie: 'movie' } as const)[lights ?? ''];
  if (scene) applyLightScene(scene);

  const x = num('x');
  const z = num('z');
  if (x !== null && z !== null) {
    const yaw = num('yaw');
    const pitch = num('pitch');
    controls.teleport = { x, z, yaw: (yaw ?? 0) * deg, pitch: pitch === null ? undefined : pitch * deg };
  }
}

export function installDebugHook() {
  Object.assign(window, {
    __ruang: {
      store: useStore,
      layout: useLayout,
      controls,
      editView,
      registry,
      /** Open Photo Mode (progress is in store.photo). */
      photo: openPhoto,
      /** Room lights: scene('evening'), set('living', { level: 0.4 }), toggle(['study']). */
      lights: { scene: applyLightScene, set: setRoomLight, toggle: toggleRooms },
      teleport(x: number, z: number, yawDeg = 0, pitchDeg?: number) {
        controls.teleport = { x, z, yaw: yawDeg * deg, pitch: pitchDeg === undefined ? undefined : pitchDeg * deg };
      },
      /** Average radiance seen through each opening: [up, down] RGB per aperture. */
      apertures() {
        const gl = registry.gl;
        const shell = registry.shell;
        if (!gl || !shell) return null;
        const n = shell.apertures.length;
        const buf = new Uint16Array(2 * n * 4);
        gl.readRenderTargetPixels(apertureTarget, 0, 0, 2, n, buf);
        const f = Array.from(buf, (h) => THREE.DataUtils.fromHalfFloat(h));
        return shell.apertures.map((a, i) => ({
          id: a.id,
          up: f.slice(i * 8, i * 8 + 3).map((v) => +v.toFixed(4)),
          down: f.slice(i * 8 + 4, i * 8 + 7).map((v) => +v.toFixed(4)),
        }));
      },
      /** Auto exposure now: the adapted average luminance and the exposure it gives. */
      exposure() {
        const avg = registry.gl && adaptedAverage(registry.gl);
        if (!avg) return null;
        const e = registry.exposure;
        return { avg: +avg.toPrecision(4), exposure: +(THREE.MathUtils.clamp(e.key / avg, e.min, e.max) * e.bias).toPrecision(4), key: e.key, min: e.min, max: e.max };
      },
      /** The sky shader's radiance (linear RGB) towards a screen pixel, as Photo Mode's tracer sees it. */
      skyAt(px: number, py: number) {
        const cam = activeCameraRef();
        const gl = registry.gl;
        if (!cam || !gl) return null;
        const rect = gl.domElement.getBoundingClientRect();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1), cam);
        const d = ray.ray.direction;
        const W = 2048;
        const H = 1024;
        const u = Math.atan2(d.z, d.x) / (2 * Math.PI) + 0.5;
        const v = 1 - Math.acos(d.y) / Math.PI;
        const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), createSkyEquirectMaterial());
        const scene = new THREE.Scene();
        scene.add(quad);
        const prev = gl.getRenderTarget();
        gl.setRenderTarget(rt);
        gl.render(scene, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
        const buf = new Uint16Array(4);
        gl.readRenderTargetPixels(rt, Math.min(W - 1, Math.floor(u * W)), Math.min(H - 1, Math.floor(v * H)), 1, 1, buf);
        gl.setRenderTarget(prev);
        rt.dispose();
        quad.geometry.dispose();
        (quad.material as THREE.Material).dispose();
        return Array.from(buf.slice(0, 3), (h) => +THREE.DataUtils.fromHalfFloat(h).toFixed(4));
      },
      /** The walk view's own HDR radiance (linear RGB, before exposure and effects) at a screen pixel. */
      rasterAt(px: number, py: number) {
        const cam = activeCameraRef();
        const gl = registry.gl;
        const scene = registry.furnitureRoot?.parent;
        if (!cam || !gl || !(scene instanceof THREE.Scene)) return null;
        const rect = gl.domElement.getBoundingClientRect();
        const size = gl.getDrawingBufferSize(new THREE.Vector2());
        const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
        const prev = gl.getRenderTarget();
        gl.setRenderTarget(rt);
        gl.render(scene, cam);
        const buf = new Uint16Array(4);
        const x = Math.floor((px / rect.width) * size.x);
        const y = Math.floor((1 - py / rect.height) * size.y);
        gl.readRenderTargetPixels(rt, x, y, 1, 1, buf);
        gl.setRenderTarget(prev);
        rt.dispose();
        return Array.from(buf.slice(0, 3), (h) => +THREE.DataUtils.fromHalfFloat(h).toFixed(4));
      },
      /** Photo Mode's traced radiance so far (linear RGB, raw) at a screen pixel, and the view's pull. */
      photoAt(px: number, py: number) {
        const s = registry.photoSession;
        const gl = registry.gl;
        if (!s || !gl) return null;
        const rt = s.tracer.target;
        const rect = gl.domElement.getBoundingClientRect();
        const buf = new Float32Array(4);
        gl.readRenderTargetPixels(rt, Math.floor((px / rect.width) * rt.width), Math.floor((1 - py / rect.height) * rt.height), 1, 1, buf);
        return { rgb: Array.from(buf.slice(0, 3), (v) => +v.toFixed(4)), pull: +s.pull.toFixed(3), samples: s.samples };
      },
      /** Scale the window light, bounce light, downlights, reflections and sun (diagnostics). */
      lightScales(window = 1, bounce = 1, downlights = 1, reflections = 1, sun = 1) {
        lightDebug.value.set(window, bounce, downlights, reflections);
        const l = registry.sunLight;
        if (l) {
          l.userData.base ??= l.intensity;
          l.intensity = (l.userData.base as number) * sun;
        }
      },
      /** Show the cards that cover openings during the bounce-light capture (diagnostics). */
      seeBlockers(on = true) {
        const cam = activeCameraRef();
        if (on) cam?.layers.enable(BLOCKER_LAYER);
        else cam?.layers.disable(BLOCKER_LAYER);
      },
      /** What the daylight camera of an opening sees (luminance × 10⁴ on a 16 × 16 grid). */
      apertureView(id: string) {
        const gl = registry.gl;
        const shell = registry.shell;
        const scene = registry.furnitureRoot?.parent;
        const a = shell?.apertures.find((x) => x.id === id);
        if (!gl || !a || !(scene instanceof THREE.Scene)) return null;
        return debugApertureView(gl, scene, a);
      },
      /** Screen pixel of a world point in the current view. */
      worldToScreen(x: number, y: number, z: number) {
        const cam = registry.planCamera ?? activeCameraRef();
        const gl = registry.gl;
        if (!cam || !gl) return null;
        const rect = gl.domElement.getBoundingClientRect();
        const v = new THREE.Vector3(x, y, z).project(cam);
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
      },
      /** What is under a pixel of the view: the furniture piece (uid, item) or the shell surface, and the hit point. */
      pickDebug(px: number, py: number) {
        const cam = registry.planCamera ?? activeCameraRef();
        const gl = registry.gl;
        if (!cam || !gl) return null;
        const rect = gl.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, cam);
        const scene = registry.furnitureRoot?.parent;
        if (!scene) return null;
        const hits = ray.intersectObject(scene, true).filter((h) => (h.object as THREE.Mesh).isMesh && h.object.visible);
        return hits.slice(0, 3).map((h) => {
          let o: THREE.Object3D | null = h.object;
          let uid: string | undefined;
          while (o && !uid) {
            uid = o.userData.uid as string | undefined;
            o = o.parent;
          }
          const p = uid ? useLayout.getState().placements.find((q) => q.uid === uid) : undefined;
          const m = (h.object as THREE.Mesh).material as THREE.Material;
          return { uid, item: p?.itemId, mat: m.name || m.type, d: +h.distance.toFixed(2), at: h.point.toArray().map((v) => +v.toFixed(2)) };
        });
      },
      /** True once textures are loaded and the reflection probes have settled. */
      ready() {
        return useStore.getState().loading.done && registry.furnitureReady && !registry.probeBusy && !registry.flags.probes && !registry.flags.shadows && registry.zoneEnv.size > 0;
      },
    },
  });
}
