// Walk-mode editing: which piece the crosshair is on, carrying a piece around (it follows the view:
// along the floor, onto table tops, flat against walls or under the ceiling), and the edit keys.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { cancelCarry, canRotate, hide, nextFinish, pickUp, place, redo, removePiece, rotate, undo } from '../furniture/actions';
import { isSurfaceItem, itemOf, sizeOf } from '../furniture/catalogue';
import { descendants, transform } from '../furniture/edit';
import type { Placement } from '../furniture/types';
import { CEIL, floorHeightAt } from '../shell/build';
import type { Rect } from '../shell/types';
import { useLayout } from '../state/layout';
import { useStore } from '../state/store';
import './bvh';
import { activeCameraRef } from './Player';
import { registry } from './registry';

/** Screen rectangle of the piece in focus, for the highlight and the hover card (CSS pixels). */
export const editView = {
  rect: null as null | { x: number; y: number; w: number; h: number },
  uid: null as string | null,
};

const ray = new THREE.Raycaster();
ray.firstHitOnly = true;
const CENTRE = new THREE.Vector2(0, 0);
const REACH = 6;
const _n = new THREE.Vector3();
const _box = new THREE.Box3();
const _v = new THREE.Vector3();

export function targets(exclude?: Set<string>): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const f of registry.furniture.values()) if (!exclude?.has(f.uid)) out.push(f.object);
  for (const t of registry.hitTargets) out.push(t);
  return out;
}

export const uidOf = (hit: THREE.Intersection): string | null => (hit.object.userData.uid as string | undefined) ?? null;

export function worldNormal(hit: THREE.Intersection): THREE.Vector3 {
  if (!hit.face) return _n.set(0, 1, 0);
  return _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
}

/** The piece (if any) under a point of the screen (normalised device coordinates). */
export function pickAt(ndc: THREE.Vector2, camera: THREE.Camera, far = REACH): string | null {
  ray.setFromCamera(ndc, camera);
  ray.far = far;
  // Pieces just hidden or removed can still be in the scene until React catches up.
  const live = new Set(useLayout.getState().placements.flatMap((p) => (p.hidden ? [] : [p.uid])));
  const gone = new Set([...registry.furniture.keys()].filter((uid) => !live.has(uid)));
  const hit = ray.intersectObjects(targets(gone), true)[0];
  return hit ? uidOf(hit) : null;
}

/** Touch: select the piece under a screen point (client pixels), or clear the selection. */
export function selectAt(clientX: number, clientY: number) {
  const camera = activeCameraRef();
  const canvas = registry.gl?.domElement;
  if (!camera || !canvas) return;
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  const L = useLayout.getState();
  if (L.carrying) return;
  L.set({ selected: pickAt(ndc, camera, 12) });
}

/** First hit under the crosshair, furniture included (for the tape measure). */
export function centreHit(camera: THREE.Camera, far = 30): THREE.Vector3 | null {
  ray.setFromCamera(CENTRE, camera);
  ray.far = far;
  return ray.intersectObjects(targets(), true)[0]?.point ?? null;
}

/** Keeps a footprint out of the walls: pushes its bounding box out of any wall box it overlaps. */
export function pushOut(x: number, z: number, hw: number, hd: number, rects: Rect[]): [number, number] {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const r of rects) {
      const ox = Math.min(x + hw, r.x1) - Math.max(x - hw, r.x0);
      const oz = Math.min(z + hd, r.z1) - Math.max(z - hd, r.z0);
      if (ox <= 0 || oz <= 0) continue;
      if (ox < oz) x += x < (r.x0 + r.x1) / 2 ? -ox : ox;
      else z += z < (r.z0 + r.z1) / 2 ? -oz : oz;
      moved = true;
    }
    if (!moved) break;
  }
  return [x, z];
}

export interface CarryPose {
  x: number;
  z: number;
  y: number;
  rot: number;
  parent: string | undefined;
}

/** Where the carried piece should be this frame, from what the view ray meets. */
function carryPose(camera: THREE.Camera, list: Placement[], p: Placement): CarryPose | null {
  const shell = registry.shell;
  const item = itemOf(p);
  if (!shell || !item) return null;
  const size = sizeOf(item, p.variant);
  const exclude = new Set([p.uid, ...descendants(list, p.uid).map((c) => c.uid)]);
  ray.setFromCamera(CENTRE, camera);
  ray.far = 8;
  const hits = ray.intersectObjects(targets(exclude), true);
  const o = ray.ray.origin;
  const d = ray.ray.direction;
  const floorAt = (x: number, z: number) => floorHeightAt(shell.spaces, x, z) ?? 0;

  if (item.mount === 'wall' || item.mount === 'window') {
    const hit = hits.find((h) => !uidOf(h) && Math.abs(worldNormal(h).y) < 0.3);
    if (!hit) return null;
    const n = worldNormal(hit).setY(0).normalize();
    const off = size.d / 2 + 0.005;
    const x = hit.point.x + n.x * off;
    const z = hit.point.z + n.z * off;
    const floor = floorAt(x, z);
    const y = item.category === 'curtains' ? 0 : Math.min(Math.max(hit.point.y - floor - size.h / 2, 0), CEIL - floor - size.h);
    return { x, z, y, rot: Math.atan2(n.x, n.z), parent: undefined };
  }

  if (item.mount === 'ceiling') {
    const hit = hits.find((h) => !uidOf(h) && worldNormal(h).y < -0.7);
    if (!hit) return null;
    return { x: hit.point.x, z: hit.point.z, y: p.y, rot: p.rot, parent: undefined };
  }

  const first = hits[0];
  // Lamps, plants and the like go onto the top of whatever piece they're over.
  if (isSurfaceItem(item) && first && uidOf(first) && worldNormal(first).y > 0.6) {
    const x = first.point.x;
    const z = first.point.z;
    return { x, z, y: first.point.y - floorAt(x, z), rot: p.rot, parent: uidOf(first)! };
  }
  // Otherwise along the floor where the view meets it, no further than 4 m, stopping short of
  // anything in the way.
  const floorY = floorAt(camera.position.x, camera.position.z);
  const horiz = Math.max(Math.hypot(d.x, d.z), 1e-3);
  let t = d.y < -0.01 ? (floorY - o.y) / d.y : Infinity;
  t = Math.min(t, 4 / horiz);
  let back = 0;
  if (first && first.distance < t) {
    t = first.distance;
    back = Math.max(size.w, size.d) / 2 + 0.03;
  }
  let x = o.x + d.x * t - (d.x / horiz) * back;
  let z = o.z + d.z * t - (d.z / horiz) * back;
  // Bounding box of the turned footprint.
  const c = Math.abs(Math.cos(p.rot));
  const s = Math.abs(Math.sin(p.rot));
  [x, z] = pushOut(x, z, (size.w * c + size.d * s) / 2, (size.w * s + size.d * c) / 2, shell.collision);
  return { x, z, y: 0, rot: p.rot, parent: undefined };
}

export function applyPose(list: Placement[], uid: string, pose: CarryPose): Placement[] {
  const moved = transform(list, uid, pose);
  return moved.map((q) => (q.uid === uid && q.parent !== pose.parent ? { ...q, parent: pose.parent } : q));
}

/** E: pick up the piece under the crosshair, or put down the one being carried. */
export function furnitureUse(): boolean {
  const L = useLayout.getState();
  if (L.carrying) {
    place();
    return true;
  }
  if (L.hovered) {
    pickUp(L.hovered);
    return true;
  }
  return false;
}

/** The piece edit keys act on: the one carried, else the one under the crosshair or picked on touch. */
export const focusUid = () => {
  const L = useLayout.getState();
  return L.carrying ?? L.swapFor ?? L.selected ?? L.hovered;
};

export function EditController() {
  const { camera, size } = useThree();
  const lastHover = useRef(0);
  const lastPose = useRef<CarryPose | null>(null);

  // Edit keys.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target instanceof HTMLInputElement && e.target.type !== 'range') || e.target instanceof HTMLTextAreaElement) return;
      const st = useStore.getState();
      if (!st.started) return;
      const L = useLayout.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyZ') {
        e.preventDefault();
        if (L.carrying) return;
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.code === 'KeyY') {
        e.preventDefault();
        if (!L.carrying) redo();
        return;
      }
      if (mod || e.altKey) return;
      const uid = focusUid();
      if (e.code === 'Escape' && L.carrying) {
        cancelCarry();
        return;
      }
      if (!uid) return;
      const p = L.placements.find((q) => q.uid === uid);
      if (!p) return;
      if (e.code === 'KeyR' && canRotate(p)) rotate(uid, e.shiftKey ? -Math.PI / 4 : Math.PI / 4);
      else if (e.code === 'KeyF') nextFinish(uid);
      else if (L.carrying) return;
      else if (e.code === 'KeyC') {
        L.set({ swapFor: uid });
        st.set({ panel: 'furniture' });
      } else if (e.code === 'KeyH') hide(uid);
      else if (e.code === 'Delete' || e.code === 'Backspace') removePiece(uid);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  useFrame((state) => {
    const st = useStore.getState();
    const L = useLayout.getState();
    if (!st.started) {
      editView.rect = null;
      return;
    }
    if (registry.planMode) {
      // The plan view drives dragging itself and has no crosshair.
      if (L.hovered) L.set({ hovered: null });
    } else if (L.carrying) {
      const p = L.placements.find((q) => q.uid === L.carrying);
      const pose = p ? carryPose(camera, L.placements, p) : null;
      const prev = lastPose.current;
      if (p && pose && (!prev || Math.abs(prev.x - pose.x) + Math.abs(prev.z - pose.z) + Math.abs(prev.y - pose.y) + Math.abs(prev.rot - pose.rot) > 0.002 || prev.parent !== pose.parent || pose.rot !== p.rot)) {
        lastPose.current = pose;
        L.live(applyPose(L.placements, p.uid, pose));
      }
    } else {
      lastPose.current = null;
      // What the crosshair is on, about twenty times a second (nothing while a panel is open).
      if (st.panel) {
        if (L.hovered) L.set({ hovered: null });
      } else if (state.clock.elapsedTime - lastHover.current > 0.05) {
        lastHover.current = state.clock.elapsedTime;
        const uid = pickAt(CENTRE, camera);
        if (uid !== L.hovered) L.set({ hovered: uid });
      }
    }

    // Screen rectangle of the piece in focus.
    const uid = focusUid();
    const entry = uid && L.placements.some((p) => p.uid === uid && !p.hidden) ? registry.furniture.get(uid) : undefined;
    editView.uid = uid;
    if (!entry) {
      editView.rect = null;
      return;
    }
    _box.setFromObject(entry.object);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let any = false;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z);
      _v.applyMatrix4(camera.matrixWorldInverse);
      if (_v.z > -0.05) _v.z = -0.05;
      _v.applyMatrix4(camera.projectionMatrix);
      any = true;
      const sx = ((_v.x + 1) / 2) * size.width;
      const sy = ((1 - _v.y) / 2) * size.height;
      x0 = Math.min(x0, sx);
      y0 = Math.min(y0, sy);
      x1 = Math.max(x1, sx);
      y1 = Math.max(y1, sy);
    }
    if (!any) {
      editView.rect = null;
      return;
    }
    const m = 8;
    x0 = Math.max(m, x0 - 6);
    y0 = Math.max(m, y0 - 6);
    x1 = Math.min(size.width - m, x1 + 6);
    y1 = Math.min(size.height - m, y1 + 6);
    editView.rect = x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  });

  return null;
}
