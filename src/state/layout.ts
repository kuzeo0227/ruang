// Furniture layout state: the placements for the current unit and style, undo/redo, and what the
// walker is hovering, has selected or is carrying. Each unit + style keeps its own layout, saved in
// the browser so edits survive a reload.

import { create } from 'zustand';
import type { Placement } from '../furniture/types';

const STORAGE = 'ruang.layout.v1.';
const MAX_UNDO = 100;

export interface LayoutState {
  /** `${unit}.${style}` of the loaded layout. */
  key: string | null;
  placements: Placement[];
  past: Placement[][];
  future: Placement[][];
  /** Bumped on every change. */
  version: number;
  hovered: string | null;
  selected: string | null;
  /** Item being carried in walk mode or dragged in plan mode. */
  carrying: string | null;
  /** Snapshot taken when a live edit (carry or drag) began, so it undoes as one step. */
  liveStart: Placement[] | null;
  /** The placement the catalogue is offering replacements for. */
  swapFor: string | null;

  load: (key: string, defaults: () => Placement[]) => void;
  commit: (next: Placement[]) => void;
  /** Start a live edit; changes made with `live` until `end` undo as one step. */
  begin: () => void;
  live: (next: Placement[]) => void;
  end: () => void;
  /** Drop a live edit and restore the snapshot. */
  cancel: () => void;
  undo: () => void;
  redo: () => void;
  reset: (defaults: Placement[]) => void;
  set: (patch: Partial<Pick<LayoutState, 'hovered' | 'selected' | 'carrying' | 'swapFor'>>) => void;
}

function save(key: string | null, placements: Placement[]) {
  if (!key) return;
  try {
    window.localStorage.setItem(STORAGE + key, JSON.stringify(placements));
  } catch {
    /* storage unavailable: the layout lasts until reload */
  }
}

function restore(key: string): Placement[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Placement[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const useLayout = create<LayoutState>((set, get) => ({
  key: null,
  placements: [],
  past: [],
  future: [],
  version: 0,
  hovered: null,
  selected: null,
  carrying: null,
  liveStart: null,
  swapFor: null,

  load: (key, defaults) => {
    if (get().key === key) return;
    const placements = restore(key) ?? defaults();
    set({ key, placements, past: [], future: [], version: get().version + 1, hovered: null, selected: null, carrying: null, liveStart: null, swapFor: null });
  },
  commit: (next) => {
    const s = get();
    if (next === s.placements) return;
    set({ placements: next, past: [...s.past, s.placements].slice(-MAX_UNDO), future: [], version: s.version + 1 });
    save(s.key, next);
  },
  begin: () => {
    if (!get().liveStart) set({ liveStart: get().placements });
  },
  live: (next) => set({ placements: next, version: get().version + 1 }),
  end: () => {
    const s = get();
    if (!s.liveStart) return;
    if (s.liveStart !== s.placements) {
      set({ past: [...s.past, s.liveStart].slice(-MAX_UNDO), future: [], liveStart: null });
      save(s.key, s.placements);
    } else set({ liveStart: null });
  },
  cancel: () => {
    const s = get();
    if (!s.liveStart) return;
    set({ placements: s.liveStart, liveStart: null, carrying: null, version: s.version + 1 });
  },
  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev || s.liveStart) return;
    set({ placements: prev, past: s.past.slice(0, -1), future: [s.placements, ...s.future], version: s.version + 1, selected: null });
    save(s.key, prev);
  },
  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next || s.liveStart) return;
    set({ placements: next, past: [...s.past, s.placements], future: s.future.slice(1), version: s.version + 1, selected: null });
    save(s.key, next);
  },
  reset: (defaults) => {
    const s = get();
    set({ placements: defaults, past: [...s.past, s.placements].slice(-MAX_UNDO), future: [], version: s.version + 1, selected: null });
    save(s.key, defaults);
  },
  set: (patch) => set(patch),
}));
