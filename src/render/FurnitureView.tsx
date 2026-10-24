// The furniture of the current layout: code-built pieces and scanned models, each lit by the room it
// stands in. Also keeps the lamps' light, the collision footprints, the crosshair targets and the
// shadows in step with the layout.

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CategoryId } from '../catalogue/pricing';
import type { StyleId } from '../catalogue/styles';
import { blocksWalking, itemOf, sizeOf } from '../furniture/catalogue';
import { descendants } from '../furniture/edit';
import { buildItem, detailStyle } from '../furniture/gen';
import { defaultLayout } from '../furniture/layouts';
import type { Placement } from '../furniture/types';
import { CEIL } from '../shell/build';
import type { ShellData, ZoneId } from '../shell/types';
import { useLayout } from '../state/layout';
import { useStore } from '../state/store';
import { ensureBvh } from './bvh';
import { FURNITURE_LAYER, MAX_LAMPS, zoneLampUniforms } from './daylight';
import { ensureFurnitureMaterial, furnitureMaterialNow, modelMaterial } from './furnitureMaterials';
import { kelvinColor, useLightsOn } from './Lighting';
import { loadModel, modelNow } from './models';
import { invalidateLighting, registry, type Obstacle } from './registry';
import { hiddenInPlan } from './PlanView';
import { getShell, spaceAt } from './shellCache';

/** The zone a placement is lit as, and the world height of its base. */
export function whereIs(shell: ShellData, p: Placement): { zone: ZoneId; y: number } {
  const space = spaceAt(shell, p.x, p.z);
  return { zone: space?.zone ?? 'exterior', y: (space?.floorY ?? 0) + p.y };
}

interface Part {
  key: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  shadow: boolean;
}

/** Artwork is painted landscape for wide pieces (the TV) and portrait for prints. */
const landscape = (p: Placement) => {
  const item = itemOf(p);
  if (!item) return false;
  const s = sizeOf(item, p.variant);
  return s.w >= s.h;
};

/** Meshes for a placement, or null while a material or model is still loading. */
function partsFor(shell: ShellData, p: Placement, style: StyleId): Part[] | null {
  const item = itemOf(p);
  if (!item) return [];
  const { zone, y } = whereIs(shell, p);
  if (item.model.kind === 'parametric') {
    const res = buildItem(item, { variant: p.variant, finish: p.finish, style, toCeiling: CEIL - y });
    if (!res) return [];
    const ds = detailStyle(item, style);
    const out: Part[] = [];
    for (const [slot, geometry] of res.geometry) {
      const def = res.slots[slot];
      if (!def) continue;
      const material = furnitureMaterialNow(zone, def, ds, landscape(p));
      if (!material) return null;
      ensureBvh(geometry);
      out.push({ key: slot, geometry, material, shadow: !material.transparent });
    }
    return out;
  }
  const model = modelNow(item);
  if (!model) return null;
  return model.parts.map((part, i) => {
    const material = modelMaterial(shell, zone, part.material);
    return { key: `m${i}`, geometry: part.geometry, material, shadow: !material.transparent || material.alphaTest > 0 };
  });
}

/** Loads whatever a placement needs (textures, materials for its zone, the scanned model). */
async function prepare(shell: ShellData, p: Placement, style: StyleId): Promise<void> {
  const item = itemOf(p);
  if (!item) return;
  const { zone, y } = whereIs(shell, p);
  if (item.model.kind === 'parametric') {
    const res = buildItem(item, { variant: p.variant, finish: p.finish, style, toCeiling: CEIL - y });
    if (!res) return;
    const ds = detailStyle(item, style);
    await Promise.all(Object.values(res.slots).map((def) => ensureFurnitureMaterial(shell, zone, def, ds, landscape(p))));
  } else {
    await loadModel(item);
  }
}

/** Footprints the walker bumps into: everything standing on the floor below head height. */
function obstaclesFor(list: Placement[], carrying: string | null): Obstacle[] {
  const carried = new Set(carrying ? [carrying, ...descendants(list, carrying).map((c) => c.uid)] : []);
  const out: Obstacle[] = [];
  for (const p of list) {
    if (p.parent || carried.has(p.uid)) continue;
    const item = itemOf(p);
    if (!item || !blocksWalking(item, p.y)) continue;
    const s = sizeOf(item, p.variant);
    out.push({ x: p.x, z: p.z, hw: s.w / 2, hd: s.d / 2, cos: Math.cos(p.rot), sin: Math.sin(p.rot) });
  }
  return out;
}

// ---------------- Lamps ----------------

interface LampSpec {
  /** Height of the light above the piece's base, from its height. */
  at: (h: number) => number;
  /** 0 = all round, 1 = mostly down. */
  down: number;
  /** Irradiance at 1 m, in the same units as the downlights (0.05). */
  power: number;
  /** How far forward of the piece's centre the light is. */
  fwd?: number;
}

const LAMPS: Partial<Record<CategoryId, LampSpec>> = {
  floorLamp: { at: (h) => h - 0.22, down: 0.15, power: 0.0075 },
  tableLamp: { at: (h) => h * 0.62, down: 0.15, power: 0.0045 },
  pendant: { at: (h) => Math.min(h * 0.5, 0.18), down: 0.6, power: 0.0065 },
  deskLamp: { at: (h) => h - 0.03, down: 0.85, power: 0.003 },
  ceilingFan: { at: () => 0.02, down: 0.7, power: 0.009 },
};
const ARM_LAMP: LampSpec = { at: (h) => h - 0.12, down: 0.85, power: 0.003, fwd: 0.18 };
const LAMP_COLOUR = kelvinColor(2700);
/** Luminance of a lit shade, in scene units (sunlit white paper is about 1). */
const SHADE_GLOW = 0.035;

function updateLamps(shell: ShellData, list: Placement[], on: boolean) {
  const byZone = new Map<ZoneId, { x: number; y: number; z: number; down: number; power: number }[]>();
  for (const p of list) {
    const item = itemOf(p);
    if (!item) continue;
    const spec = item.id === 'lamp-arm' ? ARM_LAMP : LAMPS[item.category];
    if (!spec) continue;
    const { zone, y } = whereIs(shell, p);
    const fwd = spec.fwd ?? 0;
    let arr = byZone.get(zone);
    if (!arr) byZone.set(zone, (arr = []));
    arr.push({ x: p.x + Math.sin(p.rot) * fwd, y: y + spec.at(sizeOf(item, p.variant).h), z: p.z + Math.cos(p.rot) * fwd, down: spec.down, power: spec.power });
  }
  for (const z of shell.zones) {
    const u = zoneLampUniforms(z.id);
    const lamps = (byZone.get(z.id) ?? []).sort((a, b) => b.power - a.power).slice(0, MAX_LAMPS);
    for (let i = 0; i < MAX_LAMPS; i++) {
      const l = lamps[i];
      if (l && on) {
        u.pos.value[i]!.set(l.x, l.y, l.z, l.down);
        u.color.value[i]!.copy(LAMP_COLOUR).multiplyScalar(l.power);
      } else u.color.value[i]!.setRGB(0, 0, 0);
    }
  }
  for (const [m, glow] of registry.glowMaterials) {
    if (glow < 0) m.emissive.copy(m.userData.emissiveOn as THREE.Color).multiplyScalar(on ? 0.08 : 0);
    else m.emissive.copy(LAMP_COLOUR).multiplyScalar(on ? SHADE_GLOW * glow : 0);
  }
}

// ---------------- Scene ----------------

/** `?furniture=0` leaves the unit empty (for comparing light with and without furniture). */
const EMPTY = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('furniture') === '0';

export function FurnitureView() {
  if (EMPTY) {
    registry.furnitureReady = true;
    return null;
  }
  return <Furniture />;
}

function Furniture() {
  const unit = useStore((s) => s.unit);
  const style = useStore((s) => s.style);
  const shell = useMemo(() => getShell(unit), [unit]);
  const placements = useLayout((s) => s.placements);
  const key = useLayout((s) => s.key);
  const carrying = useLayout((s) => s.carrying);
  const lightsOn = useLightsOn();
  const plan = useStore((s) => s.mode === 'plan');
  const [shown, setShown] = useState<{ key: string; style: StyleId; list: Placement[] } | null>(null);

  useEffect(() => {
    useLayout.getState().load(`${unit}.${style}`, () => defaultLayout(unit, style));
  }, [unit, style]);

  // Show edits at once when everything is ready; otherwise load first (a new style, a new zone).
  useEffect(() => {
    if (!key || key !== `${unit}.${style}`) return;
    const list = placements.filter((p) => !p.hidden);
    if (list.every((p) => partsFor(shell, p, style) !== null)) {
      setShown({ key, style, list });
      return;
    }
    let alive = true;
    Promise.all(list.map((p) => prepare(shell, p, style).catch((err: unknown) => console.warn(`Could not load ${p.itemId}`, err)))).then(() => {
      if (alive) setShown({ key, style, list });
    });
    return () => {
      alive = false;
    };
  }, [placements, key, unit, style, shell]);

  useEffect(() => {
    registry.furnitureReady = !!shown && shown.key === key && shown.list.length === placements.filter((p) => !p.hidden).length;
  }, [shown, key, placements]);

  useEffect(() => {
    if (!shown) return;
    registry.obstacles = obstaclesFor(shown.list, carrying);
    // While something is carried only the sun's shadows follow it; the rest updates on release.
    if (carrying) registry.flags.sunShadow = true;
    else invalidateLighting();
  }, [shown, carrying]);

  useEffect(() => {
    if (shown) updateLamps(shell, shown.list, lightsOn);
  }, [shown, shell, lightsOn]);

  useEffect(
    () => () => {
      registry.obstacles = [];
    },
    [],
  );

  if (!shown) return null;
  return (
    <group
      name="furniture"
      ref={(g) => {
        registry.furnitureRoot = g;
      }}
    >
      {shown.list.map((p) => (
        <Item key={p.uid} p={p} shell={shell} style={shown.style} visible={!(plan && hiddenInPlan(p))} />
      ))}
    </group>
  );
}

/** Furniture is also drawn into its own window-light shadow map. */
const onFurnitureMesh = (m: THREE.Mesh | null) => {
  m?.layers.enable(FURNITURE_LAYER);
};

const Item = memo(function Item({ p, shell, style, visible }: { p: Placement; shell: ShellData; style: StyleId; visible: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const { y } = whereIs(shell, p);
  const parts = partsFor(shell, p, style) ?? [];
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.updateMatrixWorld(true);
    const entry = { uid: p.uid, object: g, box: new THREE.Box3().setFromObject(g) };
    registry.furniture.set(p.uid, entry);
    return () => {
      if (registry.furniture.get(p.uid) === entry) registry.furniture.delete(p.uid);
    };
  }, [p, shell, style]);
  return (
    <group ref={ref} position={[p.x, y, p.z]} rotation={[0, p.rot, 0]} userData={{ uid: p.uid }} visible={visible}>
      {parts.map((part) => (
        <mesh key={part.key} ref={onFurnitureMesh} geometry={part.geometry} material={part.material} castShadow={part.shadow} receiveShadow userData={{ uid: p.uid }} />
      ))}
    </group>
  );
});
