import type { Quality } from '../state/store';

export interface QualitySettings {
  /** Upper bound for the device pixel ratio. */
  dprMax: number;
  /** Cap on internal render width in pixels (keeps 2.8K laptop screens affordable). */
  maxWidth: number;
  shadowMap: number;
  ao: boolean;
  aoHalfRes: boolean;
  bloom: boolean;
  /** Reflection probe cube size. */
  probe: number;
  anisotropy: number;
}

export const QUALITY: Record<Quality, QualitySettings> = {
  low: { dprMax: 1, maxWidth: 1280, shadowMap: 1024, ao: false, aoHalfRes: true, bloom: false, probe: 64, anisotropy: 4 },
  medium: { dprMax: 1.5, maxWidth: 1920, shadowMap: 2048, ao: true, aoHalfRes: true, bloom: true, probe: 128, anisotropy: 8 },
  high: { dprMax: 2, maxWidth: 2880, shadowMap: 4096, ao: true, aoHalfRes: false, bloom: true, probe: 256, anisotropy: 16 },
};

export function dprFor(q: Quality): number {
  if (typeof window === 'undefined') return 1;
  const s = QUALITY[q];
  return Math.max(0.5, Math.min(window.devicePixelRatio || 1, s.dprMax, s.maxWidth / Math.max(window.innerWidth, 1)));
}
