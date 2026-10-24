// Room lights: each room's switch, dimmer and colour temperature, the scenes that set them all at
// once, and what that means for every light at the current time of day.

import { useMemo } from 'react';
import { STYLES, type StyleId } from '../catalogue/styles';
import { UNITS } from '../plan/units';
import type { RoomId, UnitTypeId } from '../plan/types';
import type { SpaceId } from '../shell/types';
import { useStore, type LightScene, type RoomLight } from '../state/store';
import { sunPosition } from './sun';

/** Rooms with their own lights, in the order the Lighting panel lists them. */
const ORDER: RoomId[] = ['living', 'dining', 'kitchen', 'corridor', 'bedroom1', 'bedroom2', 'study', 'toilet1', 'toilet2', 'yard', 'balcony'];

export const DEFAULT_LIGHT: RoomLight = { mode: 'auto', level: 1, kelvin: 0 };
/** Colour temperatures offered, warm to cool. */
export const KELVINS = [2700, 3000, 3500, 4000, 5000] as const;
/** Lamps (floor, table, pendant) keep a warm bulb unless the room's colour is set by hand. */
const LAMP_KELVIN = 2700;
/** The common corridor and the foyer recess belong to the building: on from dusk, cool white. */
const BUILDING_KELVIN = 4000;
/** Auto switches on once the sun is this low (degrees). */
export const DUSK_ELEVATION = 4;

/** Scene levels; rooms left out are switched off. */
const SCENE_LEVELS: Record<'evening' | 'movie', Partial<Record<RoomId, number>>> = {
  evening: { living: 0.65, dining: 0.5, corridor: 0.3, bedroom1: 0.3, balcony: 0.35 },
  movie: { living: 0.15 },
};

export interface LitRoom {
  on: boolean;
  level: number;
  /** Downlight colour temperature. */
  kelvin: number;
  /** Lamp colour temperature. */
  lampKelvin: number;
}

export function lightRooms(unit: UnitTypeId): { id: RoomId; name: string }[] {
  const rooms = UNITS[unit].rooms;
  return ORDER.flatMap((id) => {
    const r = rooms.find((x) => x.id === id);
    return r ? [{ id, name: r.name }] : [];
  });
}

export const isDusk = (month: number, time: number) => sunPosition(month, time).elevation < DUSK_ELEVATION;

export function roomLight(roomLights: Partial<Record<RoomId, RoomLight>>, id: RoomId): RoomLight {
  return roomLights[id] ?? DEFAULT_LIGHT;
}

/** What the lights of every space in the unit (and the building's outside it) are doing. */
export function litRooms(unit: UnitTypeId, roomLights: Partial<Record<RoomId, RoomLight>>, style: StyleId, dusk: boolean): Map<SpaceId, LitRoom> {
  const styleKelvin = STYLES[style].lightKelvin;
  const out = new Map<SpaceId, LitRoom>();
  for (const { id } of lightRooms(unit)) {
    const r = roomLight(roomLights, id);
    out.set(id, { on: r.mode === 'on' || (r.mode === 'auto' && dusk), level: r.level, kelvin: r.kelvin || styleKelvin, lampKelvin: r.kelvin || LAMP_KELVIN });
  }
  for (const id of ['foyer', 'common'] as const) out.set(id, { on: dusk, level: 1, kelvin: BUILDING_KELVIN, lampKelvin: BUILDING_KELVIN });
  return out;
}

/** The unit's lights now; components re-render only when a switch, dimmer or Auto changes. */
export function useLitRooms(): Map<SpaceId, LitRoom> {
  const unit = useStore((s) => s.unit);
  const roomLights = useStore((s) => s.roomLights);
  const style = useStore((s) => s.style);
  const dusk = useStore((s) => isDusk(s.month, s.time));
  return useMemo(() => litRooms(unit, roomLights, style, dusk), [unit, roomLights, style, dusk]);
}

function litNow() {
  const s = useStore.getState();
  return litRooms(s.unit, s.roomLights, s.style, isDusk(s.month, s.time));
}

/** Changes one room by hand (which ends the current scene, except for colour changes). */
export function setRoomLight(id: RoomId, patch: Partial<RoomLight>) {
  const s = useStore.getState();
  const keepScene = Object.keys(patch).every((k) => k === 'kelvin');
  s.set({ roomLights: { ...s.roomLights, [id]: { ...roomLight(s.roomLights, id), ...patch } }, lightScene: keepScene ? s.lightScene : null });
}

/** Flips the switch for a group of rooms: all off if any is on, otherwise all on. */
export function toggleRooms(ids: RoomId[]) {
  const s = useStore.getState();
  const lit = litNow();
  const anyOn = ids.some((id) => lit.get(id)?.on);
  const next = { ...s.roomLights };
  for (const id of ids) next[id] = { ...roomLight(s.roomLights, id), mode: anyOn ? 'off' : 'on' };
  s.set({ roomLights: next, lightScene: null });
}

/** L: every light in the unit off if any is on, otherwise all on. */
export function toggleAllLights() {
  const s = useStore.getState();
  const lit = litNow();
  applyLightScene(lightRooms(s.unit).some((r) => lit.get(r.id)?.on) ? 'allOff' : 'allOn');
}

export function applyLightScene(scene: LightScene) {
  const s = useStore.getState();
  const next: Partial<Record<RoomId, RoomLight>> = {};
  for (const { id } of lightRooms(s.unit)) {
    const cur = roomLight(s.roomLights, id);
    if (scene === 'auto') next[id] = { ...cur, mode: 'auto', level: 1 };
    else if (scene === 'allOn') next[id] = { ...cur, mode: 'on', level: 1 };
    else if (scene === 'allOff') next[id] = { ...cur, mode: 'off' };
    else {
      const level = SCENE_LEVELS[scene][id];
      next[id] = level ? { ...cur, mode: 'on', level } : { ...cur, mode: 'off' };
    }
  }
  s.set({ roomLights: next, lightScene: scene });
}
