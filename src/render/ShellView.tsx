// Renders the unit shell for the current style: static surfaces, doors, the sliding balcony door
// and the AC condensers. Materials are created per (zone, role) so each room gets its own probe.

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { STYLES } from '../catalogue/styles';
import type { Role, ShellData, SlidingPanel, SwingDoor, ZoneId } from '../shell/types';
import { useStore } from '../state/store';
import { createSurfaceMaterial, surfaceSpec, texturesForStyle, loadTextureSet, type ShellMaterial } from './materials';
import { ensureBvh } from './bvh';
import { addZoneMaterial, invalidateLighting, registry, removeZoneMaterial } from './registry';
import { getShell, zoneLighting } from './shellCache';

type MatMap = Map<string, ShellMaterial>;
const key = (zone: ZoneId, role: Role) => `${zone}|${role}`;

export function ShellView() {
  const unit = useStore((s) => s.unit);
  const styleId = useStore((s) => s.style);
  const shell = useMemo(() => getShell(unit), [unit]);
  const [mats, setMats] = useState<MatMap | null>(null);

  useEffect(() => {
    for (const d of shell.doors) if (!registry.doorOpen.has(d.id)) registry.doorOpen.set(d.id, d.defaultOpen);
    for (const s of shell.sliders) if (!registry.doorOpen.has(s.id)) registry.doorOpen.set(s.id, s.defaultOpen);
  }, [shell]);

  useEffect(() => {
    let cancelled = false;
    const style = STYLES[styleId];
    const set = useStore.getState().set;
    (async () => {
      set({ loading: { done: false, message: `Loading ${style.name} materials`, progress: 0.2 } });
      const ids = texturesForStyle(style);
      let n = 0;
      await Promise.all(
        ids.map((id) =>
          loadTextureSet(id).then(() => {
            n++;
            set({ loading: { done: false, message: `Loading textures (${n}/${ids.length})`, progress: 0.2 + (0.6 * n) / ids.length } });
          }),
        ),
      );
      const zones = new Map(shell.zones.map((z) => [z.id, z]));
      const wanted = new Set<string>();
      for (const b of shell.batches) wanted.add(key(b.zone, b.role));
      for (const d of [...shell.doors, ...shell.sliders]) for (const p of d.pieces) wanted.add(key(d.zone, p.role));
      const next: MatMap = new Map();
      await Promise.all(
        [...wanted].map(async (k) => {
          const [zone, role] = k.split('|') as [ZoneId, Role];
          next.set(k, await createSurfaceMaterial(surfaceSpec(role, style), zones.get(zone) ?? null, zoneLighting(shell, zone)));
        }),
      );
      if (cancelled) {
        for (const m of next.values()) m.material.dispose();
        return;
      }
      for (const [k, m] of next) addZoneMaterial(k.split('|')[0] as ZoneId, m.material);
      setMats((prev) => {
        if (prev) {
          for (const [k, m] of prev) {
            removeZoneMaterial(k.split('|')[0] as ZoneId, m.material);
            m.material.dispose();
          }
        }
        return next;
      });
      set({ loading: { done: true, message: '', progress: 1 }, firstLoaded: true });
    })().catch((err: unknown) => {
      set({ loading: { done: false, message: err instanceof Error ? err.message : String(err), progress: 0 } });
    });
    return () => {
      cancelled = true;
    };
  }, [shell, styleId]);

  // Redraw shadows and probes once the new surfaces are actually in the scene.
  useEffect(() => {
    if (mats) invalidateLighting();
  }, [mats]);

  if (!mats) return null;
  return (
    <group>
      {shell.batches.map((b) => (
        <ShellMesh key={key(b.zone, b.role)} geometry={b.geometry} material={mats.get(key(b.zone, b.role))!.material} role={b.role} />
      ))}
      {shell.doors.map((d) => (
        <Door key={d.id} door={d} mats={mats} />
      ))}
      {shell.sliders.map((s) => (
        <Slider key={s.id} slider={s} mats={mats} />
      ))}
      <Suspense fallback={null}>
        <AcUnits shell={shell} />
      </Suspense>
    </group>
  );
}

function ShellMesh({ geometry, material, role }: { geometry: THREE.BufferGeometry; material: THREE.Material; role: Role }) {
  const ref = useRef<THREE.Mesh>(null);
  // Ceilings and the slab above come off in plan mode.
  const plan = useStore((s) => s.mode === 'plan');
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh || role === 'glass') return;
    ensureBvh(mesh.geometry);
    registry.hitTargets.add(mesh);
    return () => {
      registry.hitTargets.delete(mesh);
    };
  }, [role]);
  const glass = role === 'glass';
  const visible = !(plan && (role === 'ceiling' || role === 'slab'));
  return <mesh ref={ref} geometry={geometry} material={material} castShadow={!glass} receiveShadow={!glass} renderOrder={glass ? 2 : 0} visible={visible} />;
}

const DOOR_SPEED = 1.4;

function useAnimatedOpen(id: string, fallback: number) {
  const target = useStore((s) => s.doors[id]);
  return { target: target ?? fallback };
}

function Door({ door, mats }: { door: SwingDoor; mats: MatMap }) {
  const leaf = useRef<THREE.Group>(null);
  const { target } = useAnimatedOpen(door.id, door.defaultOpen);
  const settled = useRef(true);
  useFrame((_, dt) => {
    const cur = registry.doorOpen.get(door.id) ?? door.defaultOpen;
    const next = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * DOOR_SPEED);
    if (next !== cur) {
      registry.doorOpen.set(door.id, next);
      registry.flags.shadows = true;
      settled.current = false;
    } else if (!settled.current) {
      settled.current = true;
      invalidateLighting();
    }
    if (leaf.current) {
      // Ease the swing so it starts and stops softly.
      const eased = next * next * (3 - 2 * next);
      leaf.current.rotation.y = door.openSign * eased * door.maxAngle;
    }
  });
  return (
    <group position={door.hinge} rotation={[0, door.rotationY, 0]}>
      <group ref={leaf} userData={{ doorId: door.id }}>
        {door.pieces.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={mats.get(key(door.zone, p.role))!.material} castShadow={p.role !== 'glass'} receiveShadow userData={{ doorId: door.id }} />
        ))}
      </group>
    </group>
  );
}

function Slider({ slider, mats }: { slider: SlidingPanel; mats: MatMap }) {
  const panel = useRef<THREE.Group>(null);
  const { target } = useAnimatedOpen(slider.id, slider.defaultOpen);
  const settled = useRef(true);
  useFrame((_, dt) => {
    const cur = registry.doorOpen.get(slider.id) ?? slider.defaultOpen;
    const next = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * DOOR_SPEED * 0.8);
    if (next !== cur) {
      registry.doorOpen.set(slider.id, next);
      registry.flags.shadows = true;
      settled.current = false;
    } else if (!settled.current) {
      settled.current = true;
      invalidateLighting();
    }
    if (panel.current) {
      const eased = next * next * (3 - 2 * next);
      panel.current.position.set(slider.slideDir[0] * slider.travel * eased, 0, slider.slideDir[2] * slider.travel * eased);
    }
  });
  return (
    <group ref={panel}>
      {slider.pieces.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={mats.get(key(slider.zone, p.role))!.material} castShadow={p.role !== 'glass'} receiveShadow userData={{ doorId: slider.id }} />
      ))}
    </group>
  );
}

const AC_URL = '/assets/models/exterior_aircon_unit/exterior_aircon_unit.gltf';
useGLTF.preload(AC_URL);

function AcUnits({ shell }: { shell: ShellData }) {
  const gltf = useGLTF(AC_URL);
  const clones = useMemo(
    () =>
      shell.acUnits.map(() => {
        const c = gltf.scene.clone(true);
        c.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        return c;
      }),
    [gltf, shell],
  );
  useEffect(() => {
    invalidateLighting();
  }, [clones]);
  return (
    <>
      {shell.acUnits.map((u, i) => (
        <primitive key={i} object={clones[i]!} position={u.position} rotation={[0, u.rotationY, 0]} />
      ))}
    </>
  );
}
