// Denoising for Photo Mode: Intel Open Image Denoise (oidn-web, on WebGPU) cleans the path tracer's
// image using albedo and normal guide images rendered from the same camera. Without WebGPU the
// photo is shown as traced.

import { initUNetFromURL, type UNet } from 'oidn-web';
import * as THREE from 'three';

let unet: Promise<UNet | null> | null = null;

/** The denoiser, loaded once (weights are about 2 MB); null where WebGPU isn't available. */
export function loadDenoiser(): Promise<UNet | null> {
  if (!unet) {
    unet = ('gpu' in navigator ? initUNetFromURL('/oidn/rt_hdr_alb_nrm.tza', undefined, { aux: true, hdr: true }) : Promise.resolve(null)).catch((err: unknown) => {
      console.warn('Photo Mode: no denoiser', err);
      return null;
    });
  }
  return unet;
}

export interface Guides {
  albedo: ImageData;
  normal: ImageData;
}

function readImage(gl: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget): ImageData {
  const data = new Uint8ClampedArray(rt.width * rt.height * 4);
  gl.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, data);
  return new ImageData(data, rt.width, rt.height);
}

/**
 * Guide images for the denoiser: each surface's own colour (unlit) and its normal. Glass is left
 * out, so the guides show what is behind it, as the denoiser expects.
 */
export function renderGuides(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, isGlass: (m: THREE.Material) => boolean): Guides {
  const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType });
  const undo: (() => void)[] = [];
  const basics = new Map<THREE.Material, THREE.Material>();
  scene.traverseVisible((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const m = o.material as THREE.Material;
    if (isGlass(m)) {
      o.visible = false;
      undo.push(() => (o.visible = true));
      return;
    }
    let b = basics.get(m);
    if (!b) {
      const s = m as THREE.MeshStandardMaterial;
      b = new THREE.MeshBasicMaterial({ color: s.color ?? 0xffffff, map: s.map ?? null, side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest });
      basics.set(m, b);
    }
    o.material = b;
    undo.push(() => (o.material = m));
  });
  const target = gl.getRenderTarget();
  const clear = gl.getClearColor(new THREE.Color());
  const clearAlpha = gl.getClearAlpha();
  const autoClear = gl.autoClear;
  gl.autoClear = true;
  gl.setRenderTarget(rt);
  // Albedo: the sky through the windows counts as white.
  gl.setClearColor(0xffffff, 1);
  gl.render(scene, camera);
  const albedo = readImage(gl, rt);
  // Normals (view space, packed into 0..1); the sky has none.
  const normalMaterial = new THREE.MeshNormalMaterial();
  scene.overrideMaterial = normalMaterial;
  gl.setClearColor(new THREE.Color(0.5, 0.5, 0.5), 1);
  gl.render(scene, camera);
  scene.overrideMaterial = null;
  const normal = readImage(gl, rt);
  gl.setRenderTarget(target);
  gl.setClearColor(clear, clearAlpha);
  gl.autoClear = autoClear;
  for (const f of undo.reverse()) f();
  for (const b of basics.values()) b.dispose();
  normalMaterial.dispose();
  rt.dispose();
  return { albedo, normal };
}

/** Reads the path tracer's accumulated image (linear, HDR). */
export function readTarget(gl: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget): Float32Array {
  const data = new Float32Array(rt.width * rt.height * 4);
  gl.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, data);
  return data;
}

/**
 * Denoises an HDR image. The network expects mid-grey near 0.18, so the image is scaled to that
 * by its log-average brightness first, and back afterwards.
 */
export function denoise(net: UNet, color: Float32Array, width: number, height: number, guides: Guides): Promise<Float32Array> {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < color.length; i += 4) {
    const l = 0.2126 * color[i]! + 0.7152 * color[i + 1]! + 0.0722 * color[i + 2]!;
    if (Number.isFinite(l)) {
      sum += Math.log(l + 1e-5);
      n++;
    }
  }
  const scale = 0.18 / Math.exp(sum / Math.max(n, 1));
  for (let i = 0; i < color.length; i++) color[i] = Number.isFinite(color[i]!) ? color[i]! * scale : 0;
  return new Promise((resolve, reject) => {
    net.tileExecute({
      color: { data: color, width, height },
      albedo: guides.albedo,
      normal: guides.normal,
      done: (out) => {
        const d = out.data;
        for (let i = 0; i < d.length; i++) d[i] = d[i]! / scale;
        resolve(d);
      },
      error: reject,
    });
  });
}

/** A displayable (filterable) texture from linear RGBA floats. */
export function toTexture(data: Float32Array, width: number, height: number): THREE.DataTexture {
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(Math.min(data[i]!, 65000));
  const tex = new THREE.DataTexture(half, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
