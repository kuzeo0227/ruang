// Light switch plates beside the doors. Each rocker shows its room's state (down is on, as in
// Malaysia); E (or the touch button) flips the plate the crosshair is on.

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { StyleId } from '../catalogue/styles';
import type { SlotDef } from '../furniture/gen/context';
import type { SpaceId, WallSwitch } from '../shell/types';
import { useStore } from '../state/store';
import { ensureFurnitureMaterial } from './furnitureMaterials';
import { useLitRooms, type LitRoom } from './roomLights';
import { getShell } from './shellCache';

const PLATE_H = 0.086;
const PLATE_D = 0.009;
const ROCKER_D = 0.005;
/** How far a rocker tips when pressed. */
const TIP = 0.09;

const slotFor = (style: StyleId): SlotDef => ({ mat: style === 'brutalist' ? 'x-black' : 'x-white' });

export const plateWidth = (gangs: number) => (gangs > 3 ? 0.146 : 0.086);

/** Rocker rectangles on the plate face (centre x, centre y, width, height), in the plate's frame. */
function rockers(gangs: number): [number, number, number, number][] {
  const w = plateWidth(gangs);
  const cols = gangs > 3 ? Math.ceil(gangs / 2) : gangs;
  const rows = gangs > 3 ? 2 : 1;
  const rw = (w - 0.028 - (cols - 1) * 0.005) / cols;
  const rh = rows === 1 ? 0.05 : (PLATE_H - 0.024 - 0.005) / 2;
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < gangs; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push([-w / 2 + 0.014 + rw / 2 + c * (rw + 0.005), rows === 1 ? 0 : (r === 0 ? 1 : -1) * (rh / 2 + 0.0025), rw, rh]);
  }
  return out;
}

export function Switches() {
  const unit = useStore((s) => s.unit);
  const style = useStore((s) => s.style);
  const shell = useMemo(() => getShell(unit), [unit]);
  const lit = useLitRooms();
  const [mats, setMats] = useState<Map<string, THREE.Material> | null>(null);

  useEffect(() => {
    let alive = true;
    const zones = [...new Set(shell.switches.map((s) => s.zone))];
    Promise.all(zones.map(async (z) => [z, await ensureFurnitureMaterial(shell, z, slotFor(style), style)] as const)).then((list) => {
      if (alive) setMats(new Map(list));
    });
    return () => {
      alive = false;
    };
  }, [shell, style]);

  if (!mats) return null;
  return (
    <group>
      {shell.switches.map((sw) => (
        <Plate key={sw.id} sw={sw} lit={lit} material={mats.get(sw.zone)!} />
      ))}
    </group>
  );
}

const plateGeometry = new Map<number, THREE.BufferGeometry>();
function plateGeo(gangs: number) {
  let g = plateGeometry.get(gangs);
  if (!g) {
    g = new THREE.BoxGeometry(plateWidth(gangs), PLATE_H, PLATE_D);
    g.translate(0, 0, PLATE_D / 2);
    plateGeometry.set(gangs, g);
  }
  return g;
}

function Plate({ sw, lit, material }: { sw: WallSwitch; lit: Map<SpaceId, LitRoom>; material: THREE.Material }) {
  const rot = Math.atan2(sw.normal[0], sw.normal[2]);
  const rk = useMemo(() => rockers(sw.gangs), [sw.gangs]);
  return (
    <group position={sw.position} rotation={[0, rot, 0]}>
      <mesh geometry={plateGeo(sw.gangs)} material={material} castShadow={false} receiveShadow />
      {rk.map(([x, y, w, h], i) => {
        const on = !!lit.get(sw.rooms[i]!)?.on;
        return (
          <mesh key={i} position={[x, y, PLATE_D + ROCKER_D / 2]} rotation={[on ? -TIP : TIP, 0, 0]} material={material}>
            <boxGeometry args={[w, h, ROCKER_D]} />
          </mesh>
        );
      })}
    </group>
  );
}
