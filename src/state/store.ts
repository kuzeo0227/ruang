// App state. The 3D scene reads it every frame where needed; UI components subscribe to slices.

import { create } from 'zustand';
import type { StyleId } from '../catalogue/styles';
import type { RoomId, UnitTypeId } from '../plan/types';

export type Quality = 'low' | 'medium' | 'high';
export type LightsMode = 'auto' | 'on' | 'off';
export type LightScene = 'auto' | 'evening' | 'movie' | 'allOn' | 'allOff';

/** One room's lights: the switch, the dimmer and the colour temperature. */
export interface RoomLight {
  /** Auto follows the daylight (on once the sun is below 4°); On and Off are the switch. */
  mode: LightsMode;
  /** Dimmer, 0.05 to 1. */
  level: number;
  /** Colour temperature in kelvin, or 0 for the style's own. */
  kelvin: number;
}
export type Panel = null | 'unit' | 'style' | 'furniture' | 'lighting' | 'views' | 'settings';
export type ViewId = 'mountain' | 'rainforest' | 'beach' | 'city';

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

export type ViewMode = 'walk' | 'plan';

export interface State {
  /** Walking through the unit, or looking down at the plan. */
  mode: ViewMode;
  unit: UnitTypeId;
  style: StyleId;
  view: ViewId;
  /** Local time in hours (0-24). */
  time: number;
  month: number;
  /** Each room's lights; rooms not listed are on Auto at full brightness in the style's colour. */
  roomLights: Partial<Record<RoomId, RoomLight>>;
  /** The light scene last chosen, until a room is changed by hand. */
  lightScene: LightScene | null;
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
  /** Which side of the furniture panel is showing. */
  furnitureTab: 'catalogue' | 'bill';
  /** A short message at the bottom of the view, with an Undo button for edits. */
  toast: { id: number; text: string; undo?: boolean } | null;
  /** Player position for the minimap (updated a few times a second). */
  player: { x: number; z: number; yaw: number; room: string };
  stats: { fps: number; gpu: string; dpr: number; width: number; height: number };

  set: (patch: Partial<State>) => void;
  togglePanel: (p: Exclude<Panel, null>) => void;
  setDoor: (id: string, open: number) => void;
}

export const useStore = create<State>((set, get) => ({
  mode: 'walk',
  unit: 'A',
  style: 'quietLuxury',
  view: 'mountain',
  time: 16.5,
  month: new Date().getMonth() + 1,
  roomLights: {},
  lightScene: 'auto',
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
  furnitureTab: 'catalogue',
  toast: null,
  player: { x: 0, z: 0, yaw: 0, room: '' },
  stats: { fps: 0, gpu: '', dpr: 1, width: 0, height: 0 },

  set: (patch) => set(patch),
  togglePanel: (p) => set({ panel: get().panel === p ? null : p }),
  setDoor: (id, open) => set({ doors: { ...get().doors, [id]: open } }),
}));

export const deviceInfo = { isTouch, isPhone };

let toastId = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
/** Show a toast for a few seconds. */
export function showToast(text: string, undo = false) {
  const id = ++toastId;
  useStore.getState().set({ toast: { id, text, undo } });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (useStore.getState().toast?.id === id) useStore.getState().set({ toast: null });
  }, 4500);
}
