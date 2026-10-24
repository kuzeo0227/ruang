// Plan mode: the unit seen from straight above, ceilings off. Drag a piece to move it (wall pieces
// slide along the walls, lamps hop onto tables), drag the floor to pan, wheel or pinch to zoom,
// double-click the floor to walk from there.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isSurfaceItem, itemOf, sizeOf } from '../furniture/catalogue';
import { descendants } from '../furniture/edit';
import type { Placement } from '../furniture/types';
import { floorHeightAt } from '../shell/build';
import type { Rect } from '../shell/types';
import { useLayout } from '../state/layout';
import { useStore } from '../state/store';
import { applyPose, pushOut, targets, uidOf, worldNormal, type CarryPose } from './EditController';
import { controls } from './Player';
import { invalidateLighting, registry } from './registry';

/** Layer only the plan camera sees: the backdrop under the unit and the walker's marker. */
export const PLAN_LAYER = 5;

/** Pieces left out of the plan view because they would hide what's below them. */
export function hiddenInPlan(p: Placement): boolean {
  const item = itemOf(p);
  if (!item) return false;
  return item.mount === 'ceiling' || item.category === 'airCon' || item.category === 'hood' || item.category === 'kitchenWall';
}

const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

/** Nearest hit on something actually drawn (ceilings are hidden, not removed, in plan mode). */
function firstVisible(hits: THREE.Intersection[]): THREE.Intersection | undefined {
  return hits.find((h) => {
    for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (!o.visible) return false;
    return true;
  });
}

/** The wall face nearest a plan point, with its outward normal (null if none within reach). */
function nearestWall(x: number, z: number, rects: Rect[], reach = 1.2): { x: number; z: number; nx: number; nz: number } | null {
  let best: { x: number; z: number; nx: number; nz: number; d: number } | null = null;
  for (const r of rects) {
    const faces = [
      { d: r.x0 - x, x: r.x0, z: Math.min(Math.max(z, r.z0), r.z1), nx: -1, nz: 0 },
      { d: x - r.x1, x: r.x1, z: Math.min(Math.max(z, r.z0), r.z1), nx: 1, nz: 0 },
      { d: r.z0 - z, x: Math.min(Math.max(x, r.x0), r.x1), z: r.z0, nx: 0, nz: -1 },
      { d: z - r.z1, x: Math.min(Math.max(x, r.x0), r.x1), z: r.z1, nx: 0, nz: 1 },
    ];
    for (const f of faces) {
      if (f.d < -0.01) continue;
      const dist = Math.hypot(x - f.x, z - f.z);
      if (dist <= reach && (!best || dist < best.d)) best = { ...f, d: dist };
    }
  }
  return best;
}

/** Where a dragged piece goes for a plan point. */
function planPose(list: Placement[], p: Placement, x: number, z: number): CarryPose | null {
  const shell = registry.shell;
  const item = itemOf(p);
  if (!shell || !item) return null;
  const size = sizeOf(item, p.variant);
  if (item.mount === 'wall' || item.mount === 'window') {
    const w = nearestWall(x, z, shell.collision);
    if (!w) return null;
    const off = size.d / 2 + 0.005;
    return { x: w.x + w.nx * off, z: w.z + w.nz * off, y: p.y, rot: Math.atan2(w.nx, w.nz), parent: undefined };
  }
  if (item.mount === 'ceiling') return { x, z, y: p.y, rot: p.rot, parent: undefined };
  const floor = floorHeightAt(shell.spaces, x, z) ?? 0;
  if (isSurfaceItem(item)) {
    // Look straight down from just under the ceiling for a table top to stand on.
    const exclude = new Set([p.uid, ...descendants(list, p.uid).map((c) => c.uid), ...list.filter(hiddenInPlan).map((q) => q.uid)]);
    ray.set(new THREE.Vector3(x, 2.6, z), down);
    ray.far = 3;
    const hit = firstVisible(ray.intersectObjects(targets(exclude), true));
    if (hit && uidOf(hit) && worldNormal(hit).y > 0.6) return { x, z, y: hit.point.y - floor, rot: p.rot, parent: uidOf(hit)! };
  }
  const c = Math.abs(Math.cos(p.rot));
  const s = Math.abs(Math.sin(p.rot));
  const [px, pz] = pushOut(x, z, (size.w * c + size.d * s) / 2, (size.w * s + size.d * c) / 2, shell.collision);
  return { x: px, z: pz, y: 0, rot: p.rot, parent: undefined };
}

const onPlanLayer = (m: THREE.Object3D | null) => {
  m?.layers.set(PLAN_LAYER);
};

export function PlanView() {
  const mode = useStore((s) => s.mode);
  if (mode !== 'plan') return null;
  return <Plan />;
}

function Plan() {
  const { gl, set, size, camera: prevCamera } = useThree();
  const cam = useMemo(() => {
    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
    c.up.set(0, 0, -1);
    c.layers.enable(PLAN_LAYER);
    return c;
  }, []);
  const marker = useRef<THREE.Group>(null);
  const backdrop = useMemo(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: '#141219', toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.4;
    m.layers.set(PLAN_LAYER);
    return m;
  }, []);
  // Wall tops: the walls' footprints drawn solid, so the view reads as a floor plan.
  const wallCaps = useMemo(() => {
    const shell = registry.shell;
    const geos: THREE.BufferGeometry[] = [];
    for (const r of shell?.collision ?? []) {
      const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0);
      g.rotateX(-Math.PI / 2);
      g.translate((r.x0 + r.x1) / 2, 2.77, (r.z0 + r.z1) / 2);
      geos.push(g);
    }
    const merged = geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry();
    const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: '#2b2735', toneMapped: false }));
    m.layers.set(PLAN_LAYER);
    m.renderOrder = 5;
    return m;
  }, []);

  // Take over the view, framed on the unit; give it back on the way out.
  useEffect(() => {
    const shell = registry.shell;
    const old = prevCamera;
    if (shell) {
      const cx = (shell.bounds.min[0] + shell.bounds.max[0]) / 2;
      const cz = (shell.bounds.min[2] + shell.bounds.max[2]) / 2;
      cam.position.set(cx, 40, cz);
      cam.lookAt(cx, 0, cz);
      const w = shell.bounds.max[0] - shell.bounds.min[0] + 1.2;
      const d = shell.bounds.max[2] - shell.bounds.min[2] + 1.2;
      cam.zoom = Math.min(size.width / w, (size.height - 150) / d);
    }
    registry.planMode = true;
    registry.planCamera = cam;
    if (document.pointerLockElement) document.exitPointerLock();
    set({ camera: cam });
    useLayout.getState().set({ hovered: null });
    return () => {
      registry.planMode = false;
      registry.planCamera = null;
      set({ camera: old });
      const L = useLayout.getState();
      if (L.carrying) L.end();
      L.set({ carrying: null, selected: null });
      // Walking again: bring shadows and probes up to date.
      invalidateLighting();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cam.left = -size.width / 2;
    cam.right = size.width / 2;
    cam.top = size.height / 2;
    cam.bottom = -size.height / 2;
    cam.updateProjectionMatrix();
  }, [cam, size]);

  // Pointer: drag pieces, pan, zoom, double-click to walk.
  useEffect(() => {
    const el = gl.domElement;
    const ndc = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const world = (e: { clientX: number; clientY: number }) => {
      const v = new THREE.Vector3(ndc(e).x, ndc(e).y, 0).unproject(cam);
      return { x: v.x, z: v.z };
    };
    const pick = (e: PointerEvent): string | null => {
      ray.setFromCamera(ndc(e), cam);
      ray.far = 200;
      const list = useLayout.getState().placements;
      const exclude = new Set(list.filter((p) => p.hidden || hiddenInPlan(p)).map((p) => p.uid));
      const hit = firstVisible(ray.intersectObjects(targets(exclude), true));
      return hit ? uidOf(hit) : null;
    };
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { uid: string; dx: number; dz: number; moved: boolean } | null = null;
    let pan: { x: number; y: number; moved: boolean } | null = null;
    let pinch: { d: number; zoom: number } | null = null;

    const downH = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        // Second finger: pinch to zoom instead of whatever the first was doing.
        if (drag) {
          useLayout.getState().cancel();
          drag = null;
        }
        pan = null;
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: cam.zoom };
        return;
      }
      const uid = pick(e);
      const L = useLayout.getState();
      if (uid) {
        const p = L.placements.find((q) => q.uid === uid)!;
        const w = world(e);
        L.set({ selected: uid });
        drag = { uid, dx: p.x - w.x, dz: p.z - w.z, moved: false };
      } else {
        pan = { x: e.clientX, y: e.clientY, moved: false };
      }
      el.setPointerCapture(e.pointerId);
    };
    const moveH = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        cam.zoom = Math.min(400, Math.max(20, (pinch.zoom * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / Math.max(pinch.d, 1)));
        cam.updateProjectionMatrix();
        return;
      }
      if (drag) {
        const L = useLayout.getState();
        if (!drag.moved) {
          if (Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 2) return;
          drag.moved = true;
          L.begin();
          L.set({ carrying: drag.uid });
        }
        const w = world(e);
        const p = L.placements.find((q) => q.uid === drag!.uid);
        const pose = p && planPose(L.placements, p, w.x + drag.dx, w.z + drag.dz);
        if (p && pose) L.live(applyPose(L.placements, p.uid, pose));
      } else if (pan) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        if (Math.abs(e.clientX - pan.x) + Math.abs(e.clientY - pan.y) > 3) pan.moved = true;
        cam.position.x -= dx / cam.zoom;
        cam.position.z -= dy / cam.zoom;
      }
    };
    const upH = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pinch) {
        if (pointers.size < 2) pinch = null;
        return;
      }
      const L = useLayout.getState();
      if (drag) {
        if (drag.moved) {
          L.end();
          L.set({ carrying: null });
        }
        drag = null;
      } else if (pan) {
        if (!pan.moved) L.set({ selected: null });
        pan = null;
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      // Zoom about the point under the cursor.
      const before = world(e);
      cam.zoom = Math.min(400, Math.max(20, cam.zoom * Math.exp(-e.deltaY * 0.0015)));
      cam.updateProjectionMatrix();
      const after = world(e);
      cam.position.x += before.x - after.x;
      cam.position.z += before.z - after.z;
    };
    const dbl = (e: MouseEvent) => {
      const w = world(e);
      const shell = registry.shell;
      if (!shell || floorHeightAt(shell.spaces, w.x, w.z) === null) return;
      controls.teleport = { x: w.x, z: w.z, yaw: controls.yaw };
      useStore.getState().set({ mode: 'walk' });
    };
    el.addEventListener('pointerdown', downH);
    el.addEventListener('pointermove', moveH);
    el.addEventListener('pointerup', upH);
    el.addEventListener('pointercancel', upH);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', dbl);
    return () => {
      el.removeEventListener('pointerdown', downH);
      el.removeEventListener('pointermove', moveH);
      el.removeEventListener('pointerup', upH);
      el.removeEventListener('pointercancel', upH);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('dblclick', dbl);
    };
  }, [gl, cam]);

  // The walker's marker: where you'd be standing, and which way you're facing.
  useFrame(() => {
    const m = marker.current;
    if (!m) return;
    const floor = registry.shell ? (floorHeightAt(registry.shell.spaces, controls.position.x, controls.position.z) ?? 0) : 0;
    m.position.set(controls.position.x, floor + 2.8, controls.position.z);
    m.rotation.y = controls.yaw;
  });

  const markerMats = useMemo(
    () => ({
      dot: new THREE.MeshBasicMaterial({ color: '#ff6b5b', toneMapped: false, depthTest: false }),
      cone: new THREE.MeshBasicMaterial({ color: '#ff6b5b', toneMapped: false, transparent: true, opacity: 0.35, depthTest: false }),
    }),
    [],
  );
  const coneGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(0.9, 24, Math.PI / 2 - 0.5, 1.0);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  return (
    <>
      <primitive object={cam} />
      <primitive object={backdrop} />
      <primitive object={wallCaps} />
      <group ref={marker}>
        <mesh ref={onPlanLayer} material={markerMats.cone} geometry={coneGeo} renderOrder={10} />
        <mesh ref={onPlanLayer} material={markerMats.dot} rotation={[-Math.PI / 2, 0, 0]} renderOrder={11}>
          <circleGeometry args={[0.16, 24]} />
        </mesh>
      </group>
    </>
  );
}
