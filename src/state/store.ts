// App state. The 3D scene reads it every frame where needed; UI components subscribe to slices.

import { create } from 'zustand';
import type { StyleId } from '../catalogue/styles';
import type { UnitTypeId } from '../plan/types';

export type Quality = 'low' | 'medium' | 'high';
export type LightsMode = 'auto' | 'on' | 'off';
export type Panel = null | 'unit' | 'style' | 'lighting' | 'views' | 'settings';
export type ViewId = 'mountain';

export interface Measure {
  a: [number, number, number] | null;
  b: [number, number, number] | null;
}

const isTouch = typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
const isPhone = typeof window !== 'undefined' && isTouch && Math.min(window.screen.width, window.screen.height) < 600;
/** Touch controls start on when touch is the main input; a touchscreen laptop switches on first touch. */
const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

function initialQuality(): Quality {
  const saved = readSetting('quality');
  if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
  return isPhone ? 'low' : 'medium';
}

function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(`ruang.${key}`);
  } catch {
    return null;
  }
}
export function writeSetting(key: string, value: string) {
  try {
    window.localStorage.setItem(`ruang.${key}`, value);
  } catch {
    /* storage unavailable: the setting just won't persist */
  }
}
const num = (key: string, fallback: number) => {
  const v = Number(readSetting(key));
  return Number.isFinite(v) && readSetting(key) !== null ? v : fallback;
};

export interface State {
  unit: UnitTypeId;
  style: StyleId;
  view: ViewId;
  /** Local time in hours (0-24). */
  time: number;
  month: number;
  lights: LightsMode;
  quality: Quality;
  fov: number;
  eyeHeight: number;
  /** Exposure adjustment in stops. */
  exposureEv: number;
  sensitivity: number;
  showStats: boolean;

  loading: { done: boolean; message: string; progress: number };
  /** The first full load has finished (later style changes load in the background). */
  firstLoaded: boolean;
  started: boolean;
  locked: boolean;
  touchUi: boolean;
  panel: Panel;
  /** Target openness of each door and sliding door, 0 = closed, 1 = fully open. */
  doors: Record<string, number>;
  measuring: boolean;
  measure: Measure;
  hint: string | null;
  /** Hide the interface (for clean screenshots). */
  hudHidden: boolean;
  /** Player position for the minimap (updated a few times a second). */
  player: { x: number; z: number; yaw: number; room: string };
  stats: { fps: number; gpu: string; dpr: number; width: number; height: number };

  set: (patch: Partial<State>) => void;
  togglePanel: (p: Exclude<Panel, null>) => void;
  setDoor: (id: string, open: number) => void;
}

export const useStore = create<State>((set, get) => ({
  unit: 'A',
  style: 'quietLuxury',
  view: 'mountain',
  time: 16.5,
  month: new Date().getMonth() + 1,
  lights: 'auto',
  quality: initialQuality(),
  fov: num('fov', 62),
  eyeHeight: num('eyeHeight', 1.55),
  exposureEv: num('exposureEv', 0),
  sensitivity: num('sensitivity', 1),
  showStats: readSetting('showStats') === '1',

  loading: { done: false, message: 'Preparing the unit', progress: 0 },
  firstLoaded: false,
  started: false,
  locked: false,
  touchUi: isPhone || !!coarse,
  panel: null,
  doors: {},
  measuring: false,
  measure: { a: null, b: null },
  hint: null,
  hudHidden: false,
  player: { x: 0, z: 0, yaw: 0, room: '' },
  stats: { fps: 0, gpu: '', dpr: 1, width: 0, height: 0 },

  set: (patch) => set(patch),
  togglePanel: (p) => set({ panel: get().panel === p ? null : p }),
  setDoor: (id, open) => set({ doors: { ...get().doors, [id]: open } }),
}));

export const deviceInfo = { isTouch, isPhone };
