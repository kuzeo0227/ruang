// URL parameters and a window hook, so the scene can be set up without a mouse (headless screenshots,
// bookmarking a viewpoint while tuning). Example:
//   /?autostart=1&x=4.2&z=3.1&yaw=180&pitch=-5&time=17.5&style=muji&hud=0

import * as THREE from 'three';
import { STYLE_ORDER, type StyleId } from './catalogue/styles';
import { BLOCKER_LAYER, apertureTarget, lightDebug } from './render/daylight';
import { activeCameraRef, controls } from './render/Player';
import { registry } from './render/registry';
import { useStore, type LightsMode, type Panel, type Quality } from './state/store';

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
  const quality = p.get('quality');
  if (quality === 'low' || quality === 'medium' || quality === 'high') patch.quality = quality as Quality;
  const lights = p.get('lights');
  if (lights === 'auto' || lights === 'on' || lights === 'off') patch.lights = lights as LightsMode;
  const ev = num('ev');
  if (ev !== null) patch.exposureEv = ev;
  const fov = num('fov');
  if (fov !== null) patch.fov = fov;
  if (p.get('stats') === '1') patch.showStats = true;
  if (p.get('hud') === '0') patch.hudHidden = true;
  const panel = p.get('panel');
  if (panel === 'style' || panel === 'lighting' || panel === 'views' || panel === 'settings') patch.panel = panel as Panel;
  if (p.get('autostart') === '1') patch.started = true;
  s.set(patch);

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
      controls,
      registry,
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
      /** True once textures are loaded and the reflection probes have settled. */
      ready() {
        return useStore.getState().loading.done && !registry.probeBusy && !registry.flags.probes && registry.zoneEnv.size > 0;
      },
    },
  });
}
