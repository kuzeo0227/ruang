// Photo Mode in the scene: runs a PhotoSession (photo.ts) while the store has Photo Mode open, and
// shows the path tracer's image on a full-screen quad, so it gets the usual exposure, white
// balance, bloom, tone mapping and vignette.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useStore, type PhotoState } from '../state/store';
import { loadDenoiser } from './denoise';
import { PhotoSession } from './photo';
import { invalidateLighting, registry } from './registry';

/** Samples per photo: with the denoiser, enough for a clean image indoors. */
export const PHOTO_SAMPLES = 256;
/** Denoised previews along the way, then the final image. */
const MILESTONES = [16, 64, PHOTO_SAMPLES];

const setPhoto = (patch: Partial<PhotoState>) => {
  const s = useStore.getState();
  if (s.photo) s.set({ photo: { ...s.photo, ...patch } });
};

export function PhotoMode() {
  const active = useStore((s) => s.photo !== null);
  const { gl, scene, camera } = useThree();
  const session = useRef<PhotoSession | null>(null);
  const lastReport = useRef(0);
  const shown = useRef<THREE.DataTexture | null>(null);
  const milestone = useRef(0);
  const busy = useRef(false);

  const display = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      name: 'photo-display',
      uniforms: { map: { value: null } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    mesh.name = 'photo-display';
    mesh.frustumCulled = false;
    mesh.renderOrder = 1e6;
    mesh.visible = false;
    return mesh;
  }, []);

  useEffect(() => {
    scene.add(display);
    return () => {
      scene.remove(display);
    };
  }, [scene, display]);

  useEffect(() => {
    if (!active || !registry.shell) return;
    if (document.pointerLockElement) document.exitPointerLock();
    void loadDenoiser();
    milestone.current = 0;
    busy.current = false;
    const quality = useStore.getState().quality;
    const s = new PhotoSession(gl, scene, camera, display, {
      target: PHOTO_SAMPLES,
      renderScale: quality === 'low' ? 0.5 : 1,
      onProgress: (p) => setPhoto({ progress: p }),
    });
    session.current = s;
    s.start(registry.shell)
      .then(() => setPhoto({ status: 'rendering', progress: 1 }))
      .catch((err: unknown) => {
        console.error('Photo Mode failed', err);
        setPhoto({ status: 'failed' });
      });
    return () => {
      session.current = null;
      shown.current?.dispose();
      shown.current = null;
      s.dispose();
      // Probes and shadows were left alone while the scene was hidden; refresh them.
      invalidateLighting(true);
      registry.exposureReset = true;
    };
  }, [active, gl, scene, camera, display]);

  // Trace before the effects draw the frame; denoise at each milestone (the tracer keeps going).
  useFrame((state) => {
    const s = session.current;
    if (!s?.ready) return;
    s.step();
    const samples = Math.min(s.samples, PHOTO_SAMPLES);
    const last = milestone.current === MILESTONES.length - 1;
    if (!busy.current && milestone.current < MILESTONES.length && samples >= MILESTONES[milestone.current]!) {
      busy.current = true;
      if (last) setPhoto({ status: 'denoising', samples });
      s.denoised()
        .then((tex) => {
          if (session.current !== s) return tex?.dispose();
          if (tex) {
            shown.current?.dispose();
            shown.current = tex;
          }
          if (last) setPhoto({ status: 'done', samples, denoised: !!tex });
          else if (tex) setPhoto({ denoised: true });
        })
        .catch((err: unknown) => {
          console.warn('Photo Mode: denoising failed', err);
          if (last) setPhoto({ status: 'done', samples });
        })
        .finally(() => {
          if (session.current !== s) return;
          busy.current = false;
          milestone.current++;
        });
    }
    (display.material as THREE.ShaderMaterial).uniforms.map!.value = shown.current ?? s.tracer.target.texture;
    const now = state.clock.elapsedTime;
    if (now - lastReport.current > 0.25 && useStore.getState().photo?.status === 'rendering') {
      lastReport.current = now;
      setPhoto({ samples });
    }
  }, 0.5);

  // Save: read the canvas once the effects have drawn it, in the same frame.
  useFrame(() => {
    const save = registry.photoSave;
    if (!save) return;
    registry.photoSave = null;
    save(gl.domElement.toDataURL('image/png'));
  }, 2);

  return null;
}
