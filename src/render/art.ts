// Artwork for the framed prints and the art-frame TV: an abstract composition painted on a canvas
// in each style's palette, with paper grain, so the walls carry something that suits the room.

import * as THREE from 'three';
import type { StyleId } from '../catalogue/styles';

const cache = new Map<string, THREE.CanvasTexture>();

/** Deterministic random numbers, so the same style always paints the same picture. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i]! + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + n * 0.9));
  }
  ctx.putImageData(img, 0, 0);
}

/** A soft-edged blob: a filled path drawn a few times with a little jitter, like a printed wash. */
function wash(ctx: CanvasRenderingContext2D, colour: string, draw: (ctx: CanvasRenderingContext2D) => void, r: () => number, alpha = 0.92) {
  ctx.save();
  ctx.fillStyle = colour;
  for (let k = 0; k < 3; k++) {
    ctx.globalAlpha = alpha / (k + 1);
    ctx.save();
    ctx.translate((r() - 0.5) * 3, (r() - 0.5) * 3);
    ctx.beginPath();
    draw(ctx);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function paintMuji(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  ctx.fillStyle = '#EEE8DC';
  ctx.fillRect(0, 0, w, h);
  const s = Math.min(w, h);
  wash(ctx, '#D9CBB4', (c) => c.roundRect(w * 0.2, h * 0.18, w * 0.5, h * 0.42, s * 0.03), r);
  wash(ctx, '#C6A57A', (c) => c.arc(w * 0.62, h * 0.58, s * 0.2, 0, Math.PI * 2), r, 0.85);
  wash(ctx, '#E9DFCF', (c) => c.roundRect(w * 0.3, h * 0.62, w * 0.32, h * 0.16, s * 0.02), r, 0.9);
  wash(ctx, '#3E4A5C', (c) => c.arc(w * 0.3, h * 0.3, s * 0.035, 0, Math.PI * 2), r);
}

function paintJapanese(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  ctx.fillStyle = '#F0E9DA';
  ctx.fillRect(0, 0, w, h);
  // Paper fibres.
  ctx.strokeStyle = 'rgba(160,140,110,0.08)';
  for (let i = 0; i < 260; i++) {
    const x = r() * w;
    const y = r() * h;
    const a = r() * Math.PI;
    const l = 8 + r() * 30;
    ctx.lineWidth = 0.6 + r();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  // Ensō: one brush circle, heavy where it starts and dry where it trails off.
  const cx = w * 0.5;
  const cy = h * 0.46;
  const R = Math.min(w, h) * 0.3;
  const a0 = -1.9;
  const a1 = a0 + Math.PI * 1.86;
  const steps = 420;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const a = a0 + (a1 - a0) * t;
    const width = R * (0.2 * (1 - t) + 0.04) * (0.85 + 0.3 * Math.sin(t * 9));
    const bristles = 9;
    for (let b = 0; b < bristles; b++) {
      if (t > 0.6 && r() < (t - 0.6) * 1.6) continue;
      const off = (b / (bristles - 1) - 0.5) * width;
      const rr = R + off + (r() - 0.5) * 2;
      ctx.fillStyle = `rgba(28,26,24,${0.16 + 0.1 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, Math.max(0.8, width / bristles), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Seal.
  const sz = Math.min(w, h) * 0.06;
  ctx.fillStyle = '#AE3427';
  ctx.fillRect(w * 0.74, h * 0.8, sz, sz * 1.25);
  ctx.strokeStyle = '#F0E9DA';
  ctx.lineWidth = sz * 0.08;
  ctx.beginPath();
  ctx.moveTo(w * 0.74 + sz * 0.25, h * 0.8 + sz * 0.25);
  ctx.lineTo(w * 0.74 + sz * 0.75, h * 0.8 + sz * 0.25);
  ctx.moveTo(w * 0.74 + sz * 0.5, h * 0.8 + sz * 0.2);
  ctx.lineTo(w * 0.74 + sz * 0.5, h * 0.8 + sz * 1.05);
  ctx.moveTo(w * 0.74 + sz * 0.25, h * 0.8 + sz * 0.7);
  ctx.lineTo(w * 0.74 + sz * 0.75, h * 0.8 + sz * 0.7);
  ctx.stroke();
}

function paintBrutalist(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  ctx.fillStyle = '#9A968F';
  ctx.fillRect(0, 0, w, h);
  // Blotchy concrete.
  for (let i = 0; i < 90; i++) {
    const g = 130 + r() * 50;
    ctx.fillStyle = `rgba(${g},${g - 3},${g - 7},0.12)`;
    ctx.beginPath();
    ctx.arc(r() * w, r() * h, 10 + r() * 80, 0, Math.PI * 2);
    ctx.fill();
  }
  const s = Math.min(w, h);
  ctx.fillStyle = '#1E1D1C';
  ctx.fillRect(w * 0.16, h * 0.14, w * 0.36, h * 0.54);
  ctx.fillStyle = '#CFCBC3';
  ctx.beginPath();
  ctx.moveTo(w * 0.46, h * 0.86);
  ctx.lineTo(w * 0.46, h * 0.5);
  ctx.arc(w * 0.64, h * 0.5, w * 0.18, Math.PI, 0);
  ctx.lineTo(w * 0.82, h * 0.86);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#F3F1EC';
  ctx.lineWidth = Math.max(2, s * 0.006);
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.76);
  ctx.lineTo(w * 0.9, h * 0.76);
  ctx.stroke();
}

function paintMinimal(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#F5F4F1';
  ctx.fillRect(0, 0, w, h);
  const s = Math.min(w, h);
  ctx.fillStyle = '#2B2A29';
  ctx.fillRect(w * 0.58, h * 0.16, Math.max(2, s * 0.008), h * 0.62);
  ctx.beginPath();
  ctx.arc(w * 0.4, h * 0.66, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#C9C4BC';
  ctx.fillRect(w * 0.24, h * 0.3, w * 0.22, Math.max(2, s * 0.008));
}

function paintQuietLuxury(ctx: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  ctx.fillStyle = '#ECE3D2';
  ctx.fillRect(0, 0, w, h);
  const s = Math.min(w, h);
  const arch = (cx: number, base: number, rw: number, top: number, colour: string) =>
    wash(
      ctx,
      colour,
      (c) => {
        c.moveTo(cx - rw, base);
        c.lineTo(cx - rw, top + rw);
        c.arc(cx, top + rw, rw, Math.PI, 0);
        c.lineTo(cx + rw, base);
        c.closePath();
      },
      r,
    );
  arch(w * 0.42, h * 0.84, s * 0.2, h * 0.24, '#C9A882');
  arch(w * 0.58, h * 0.84, s * 0.15, h * 0.4, '#A9603F');
  arch(w * 0.36, h * 0.84, s * 0.09, h * 0.56, '#7E7A5C');
  wash(ctx, '#E4C9A2', (c) => c.arc(w * 0.68, h * 0.24, s * 0.07, 0, Math.PI * 2), r);
  ctx.fillStyle = '#5B4636';
  ctx.fillRect(w * 0.16, h * 0.84, w * 0.68, Math.max(2, s * 0.006));
}

const SEEDS: Record<StyleId, number> = { muji: 11, japanese: 23, brutalist: 37, minimal: 41, quietLuxury: 53 };

/** Artwork for a style, landscape (the TV) or portrait (prints); the TV version has a white mount. */
export function artTexture(style: StyleId, landscape: boolean): THREE.Texture {
  const key = `${style}|${landscape}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = landscape ? 1024 : 704;
  const h = landscape ? 560 : 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const r = rng(SEEDS[style]);
  // A mount around the picture on the TV (prints have a real one).
  const m = landscape ? Math.round(h * 0.09) : 0;
  ctx.fillStyle = '#F2F0EB';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(m, m);
  const iw = w - 2 * m;
  const ih = h - 2 * m;
  ctx.beginPath();
  ctx.rect(0, 0, iw, ih);
  ctx.clip();
  if (style === 'muji') paintMuji(ctx, iw, ih, r);
  else if (style === 'japanese') paintJapanese(ctx, iw, ih, r);
  else if (style === 'brutalist') paintBrutalist(ctx, iw, ih, r);
  else if (style === 'minimal') paintMinimal(ctx, iw, ih);
  else paintQuietLuxury(ctx, iw, ih, r);
  ctx.restore();
  grain(ctx, w, h, 10, SEEDS[style] + 7);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, tex);
  return tex;
}
