// The 3D canvas: renderer settings, scene contents and the per-frame stats probe.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { Effects } from './Effects';
import { Lighting } from './Lighting';
import { setMaxAnisotropy } from './materials';
import { MeasureView } from './MeasureView';
import { Player, setActiveCamera } from './Player';
import { QUALITY, dprFor } from './quality';
import { registry } from './registry';
import { ShellView } from './ShellView';

export function Viewer() {
  const quality = useStore((s) => s.quality);
  const [dpr, setDpr] = useState(() => dprFor(quality));

  useEffect(() => {
    const update = () => setDpr(dprFor(quality));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [quality]);

  return (
    <Canvas
      className="viewer"
      dpr={dpr}
      flat
      shadows="percentage"
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false }}
      camera={{ fov: useStore.getState().fov, near: 0.03, far: 3000, position: [0, 1.55, 0] }}
      onCreated={({ gl, camera }) => {
        setActiveCamera(camera);
        registry.gl = gl;
        const ctx = gl.getContext();
        const info = ctx.getExtension('WEBGL_debug_renderer_info');
        const gpu = info ? String(ctx.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(ctx.getParameter(ctx.RENDERER));
        const s = useStore.getState();
        s.set({ stats: { ...s.stats, gpu } });
      }}
    >
      <Anisotropy />
      <Lighting />
      <Suspense fallback={null}>
        <ShellView />
      </Suspense>
      <Player />
      <MeasureView />
      <Effects />
      <StatsProbe />
    </Canvas>
  );
}

/** Texture filtering quality follows the quality preset (capped by the GPU). */
function Anisotropy() {
  const { gl } = useThree();
  const quality = useStore((s) => s.quality);
  useEffect(() => {
    setMaxAnisotropy(Math.min(gl.capabilities.getMaxAnisotropy(), QUALITY[quality].anisotropy));
  }, [gl, quality]);
  return null;
}

/** Frame rate and render size, sampled twice a second for the stats readout and diagnostics. */
function StatsProbe() {
  const { gl } = useThree();
  const ref = useRef({ frames: 0, time: 0 });
  useFrame((_, dt) => {
    const acc = ref.current;
    acc.frames++;
    acc.time += dt;
    if (acc.time < 0.5) return;
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const s = useStore.getState();
    s.set({ stats: { ...s.stats, fps: Math.round(acc.frames / acc.time), dpr: gl.getPixelRatio(), width: size.x, height: size.y } });
    acc.frames = 0;
    acc.time = 0;
  });
  return null;
}
