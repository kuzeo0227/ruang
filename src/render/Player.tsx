// First-person walking: keyboard + mouse (pointer lock or drag), touch joystick + drag look,
// circle-vs-box collision against walls, closed doors and the sliding door's panels, and smooth
// floor height over the small steps into wet areas.

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { floorHeightAt } from '../shell/build';
import type { Rect, ShellData, WallSwitch } from '../shell/types';
import { useStore } from '../state/store';
import { furnitureUse } from './EditController';
import { registry, type Obstacle } from './registry';
import { isDusk, lightRooms, litRooms, toggleAllLights, toggleRooms } from './roomLights';
import { getShell } from './shellCache';

const RADIUS = 0.25;
const WALK = 1.35;
const RUN = 2.7;
const PITCH_LIMIT = 1.45;

/** Shared input, written by keyboard/mouse handlers here and by the touch UI. */
export const controls = {
  keys: new Set<string>(),
  moveX: 0,
  moveY: 0,
  lookDX: 0,
  lookDY: 0,
  yaw: 0,
  pitch: -0.04,
  position: new THREE.Vector3(),
  teleport: null as null | { x: number; z: number; yaw: number; pitch?: number },
};

function dynamicRects(shell: ShellData): Rect[] {
  const out: Rect[] = [];
  for (const d of shell.doors) {
    const open = registry.doorOpen.get(d.id) ?? d.defaultOpen;
    if (open < 0.35) out.push(d.closedRect);
  }
  for (const s of shell.sliders) {
    const open = registry.doorOpen.get(s.id) ?? s.defaultOpen;
    const eased = open * open * (3 - 2 * open);
    const [a0, a1] = s.across;
    const span = (lo: number, hi: number): Rect =>
      s.axis === 'x' ? { x0: lo, z0: a0, x1: hi, z1: a1 } : { x0: a0, z0: lo, x1: a1, z1: hi };
    out.push(span(s.fixedSpan[0], s.fixedSpan[1]));
    const shift = s.travel * eased;
    out.push(span(s.slideSpan[0] + shift, s.slideSpan[1] + shift));
  }
  return out;
}

function resolve(pos: THREE.Vector3, rects: Rect[]) {
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const r of rects) {
      const cx = Math.max(r.x0, Math.min(pos.x, r.x1));
      const cz = Math.max(r.z0, Math.min(pos.z, r.z1));
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= RADIUS * RADIUS) continue;
      if (d2 < 1e-10) {
        // Centre inside the box: push out along the shortest axis.
        const left = pos.x - r.x0;
        const right = r.x1 - pos.x;
        const top = pos.z - r.z0;
        const bottom = r.z1 - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = r.x0 - RADIUS;
        else if (m === right) pos.x = r.x1 + RADIUS;
        else if (m === top) pos.z = r.z0 - RADIUS;
        else pos.z = r.z1 + RADIUS;
      } else {
        const d = Math.sqrt(d2);
        dx /= d;
        dz /= d;
        pos.x = cx + dx * RADIUS;
        pos.z = cz + dz * RADIUS;
      }
      moved = true;
    }
    if (!moved) break;
  }
}

/** Pushes the walker out of furniture footprints (boxes turned in plan). */
function resolveObstacles(pos: THREE.Vector3, obstacles: Obstacle[]) {
  for (const o of obstacles) {
    // Into the box's frame: (x, z) -> (x cos - z sin, x sin + z cos) undoes its turn.
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    let lx = dx * o.cos - dz * o.sin;
    let lz = dx * o.sin + dz * o.cos;
    const cx = Math.max(-o.hw, Math.min(lx, o.hw));
    const cz = Math.max(-o.hd, Math.min(lz, o.hd));
    let ex = lx - cx;
    let ez = lz - cz;
    const d2 = ex * ex + ez * ez;
    if (d2 >= RADIUS * RADIUS) continue;
    if (d2 < 1e-10) {
      const m = Math.min(o.hw - lx, lx + o.hw, o.hd - lz, lz + o.hd);
      if (m === o.hw - lx) lx = o.hw + RADIUS;
      else if (m === lx + o.hw) lx = -o.hw - RADIUS;
      else if (m === o.hd - lz) lz = o.hd + RADIUS;
      else lz = -o.hd - RADIUS;
    } else {
      const d = Math.sqrt(d2);
      ex /= d;
      ez /= d;
      lx = cx + ex * RADIUS;
      lz = cz + ez * RADIUS;
    }
    // Back to the world: (x, z) -> (x cos + z sin, -x sin + z cos).
    pos.x = o.x + lx * o.cos + lz * o.sin;
    pos.z = o.z - lx * o.sin + lz * o.cos;
  }
}

export function Player() {
  const unit = useStore((s) => s.unit);
  const shell = useMemo(() => getShell(unit), [unit]);
  const { camera, gl } = useThree();
  const vel = useRef(new THREE.Vector2());
  const eyeY = useRef(1.55);
  const lastReport = useRef(0);

  // Spawn.
  useEffect(() => {
    controls.position.set(shell.spawn.position[0], 0, shell.spawn.position[2]);
    controls.yaw = shell.spawn.yaw;
    controls.pitch = -0.04;
  }, [shell]);

  // Keyboard, mouse look, pointer lock.
  useEffect(() => {
    const el = gl.domElement;
    const typing = (e: KeyboardEvent) => (e.target instanceof HTMLInputElement && e.target.type !== 'range') || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (typing(e) || !useStore.getState().started || useStore.getState().mode === 'plan' || useStore.getState().photo) return;
      controls.keys.add(e.code);
      if (e.code === 'KeyE' && !furnitureUse()) interact();
      if (e.code === 'KeyM') measureAction();
      if (e.code === 'KeyL') toggleAllLights();
      if (e.code === 'Comma' || e.code === 'Period') {
        const s = useStore.getState();
        const t = Math.min(23.75, Math.max(5.5, s.time + (e.code === 'Period' ? 0.25 : -0.25)));
        s.set({ time: t });
      }
    };
    const up = (e: KeyboardEvent) => controls.keys.delete(e.code);
    const blur = () => controls.keys.clear();
    const mouse = (e: MouseEvent) => {
      if (document.pointerLockElement === el) {
        const s = useStore.getState().sensitivity;
        controls.lookDX += e.movementX * 0.0022 * s;
        controls.lookDY += e.movementY * 0.0022 * s;
      }
    };
    const lockChange = () => useStore.getState().set({ locked: document.pointerLockElement === el });

    // Drag to look without locking; a plain click locks the pointer (desktop).
    let drag: { x: number; y: number; moved: boolean; id: number } | null = null;
    const pdown = (e: PointerEvent) => {
      if (!useStore.getState().started || useStore.getState().mode === 'plan') return;
      if (e.pointerType === 'touch') return; // the touch UI handles look on phones
      drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    };
    const pmove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id || document.pointerLockElement === el) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) {
        const s = useStore.getState().sensitivity;
        controls.lookDX += dx * 0.0035 * s;
        controls.lookDY += dy * 0.0035 * s;
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const pup = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id && !drag.moved && document.pointerLockElement !== el) {
        useStore.getState().set({ panel: null });
        el.requestPointerLock?.();
      }
      drag = null;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('mousemove', mouse);
    document.addEventListener('pointerlockchange', lockChange);
    el.addEventListener('pointerdown', pdown);
    window.addEventListener('pointermove', pmove);
    window.addEventListener('pointerup', pup);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('mousemove', mouse);
      document.removeEventListener('pointerlockchange', lockChange);
      el.removeEventListener('pointerdown', pdown);
      window.removeEventListener('pointermove', pmove);
      window.removeEventListener('pointerup', pup);
    };
  }, [gl]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const st = useStore.getState();
    // Looking at the plan: the walker waits where they were (the plan camera is the default now).
    // In Photo Mode the camera holds still while the photo is traced.
    if (st.mode === 'plan' || st.photo) {
      controls.lookDX = 0;
      controls.lookDY = 0;
      return;
    }
    const cam = camera as THREE.PerspectiveCamera;
    if (controls.teleport) {
      controls.position.set(controls.teleport.x, 0, controls.teleport.z);
      controls.yaw = controls.teleport.yaw;
      if (controls.teleport.pitch !== undefined) controls.pitch = controls.teleport.pitch;
      controls.teleport = null;
      vel.current.set(0, 0);
      registry.exposureReset = true;
    }

    // Look.
    controls.yaw -= controls.lookDX;
    controls.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, controls.pitch - controls.lookDY));
    controls.lookDX = 0;
    controls.lookDY = 0;

    // Move.
    const k = controls.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + controls.moveX;
    let my = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + controls.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    if (!st.started) {
      mx = 0;
      my = 0;
    }
    const speed = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(controls.moveX, controls.moveY) > 0.95 ? RUN : WALK;
    const sin = Math.sin(controls.yaw);
    const cos = Math.cos(controls.yaw);
    const wantX = (-sin * my + cos * mx) * speed;
    const wantZ = (-cos * my - sin * mx) * speed;
    const a = Math.min(1, dt * 9);
    vel.current.x += (wantX - vel.current.x) * a;
    vel.current.y += (wantZ - vel.current.y) * a;

    const pos = controls.position;
    pos.x += vel.current.x * dt;
    pos.z += vel.current.y * dt;
    resolveObstacles(pos, registry.obstacles);
    resolve(pos, shell.collision.concat(dynamicRects(shell)));

    const floor = floorHeightAt(shell.spaces, pos.x, pos.z) ?? 0;
    const targetEye = floor + st.eyeHeight;
    eyeY.current += (targetEye - eyeY.current) * Math.min(1, dt * 10);

    cam.position.set(pos.x, eyeY.current, pos.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(controls.pitch, controls.yaw, 0);
    if (cam.fov !== st.fov) {
      cam.fov = st.fov;
      cam.updateProjectionMatrix();
    }

    // Report position for the minimap and the interaction hint.
    const now = state.clock.elapsedTime;
    if (now - lastReport.current > 0.12) {
      lastReport.current = now;
      const room = shell.spaces.find((s) => floorHeightAt([s], pos.x, pos.z) !== null)?.id ?? '';
      const hint = actionHint();
      if (room !== st.player.room || Math.abs(pos.x - st.player.x) > 0.02 || Math.abs(pos.z - st.player.z) > 0.02 || Math.abs(controls.yaw - st.player.yaw) > 0.02 || hint !== st.hint) {
        st.set({ player: { x: pos.x, z: pos.z, yaw: controls.yaw, room }, hint });
      }
    }
  });

  return null;
}

/** The door or sliding door the player is facing, within reach. */
export function targetDoor(): { id: string; open: number } | null {
  const shell = registry.shell;
  if (!shell) return null;
  const p = controls.position;
  const fx = -Math.sin(controls.yaw);
  const fz = -Math.cos(controls.yaw);
  let best: { id: string; open: number; score: number } | null = null;
  const consider = (id: string, c: [number, number, number], fallback: number) => {
    const dx = c[0] - p.x;
    const dz = c[2] - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2.3 || dist < 0.05) return;
    const cosA = (dx * fx + dz * fz) / dist;
    if (cosA < 0.8) return;
    const score = dist * (2 - cosA);
    const open = useStore.getState().doors[id] ?? fallback;
    if (!best || score < best.score) best = { id, open, score };
  };
  for (const d of shell.doors) consider(d.id, d.centre, d.defaultOpen);
  for (const s of shell.sliders) consider(s.id, s.centre, s.defaultOpen);
  return best;
}

/** The light switch under the crosshair (within about 12°), within reach and in front of the plate. */
export function targetSwitch(): WallSwitch | null {
  const shell = registry.shell;
  const cam = activeCamera;
  if (!shell || !cam) return null;
  cam.getWorldDirection(forward);
  let best: { sw: WallSwitch; cos: number } | null = null;
  for (const sw of shell.switches) {
    const dx = sw.position[0] - cam.position.x;
    const dy = sw.position[1] - cam.position.y;
    const dz = sw.position[2] - cam.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > 2.2 || -(dx * sw.normal[0] + dz * sw.normal[2]) < 0.1) continue;
    const cos = (dx * forward.x + dy * forward.y + dz * forward.z) / dist;
    if (cos > 0.978 && (!best || cos > best.cos)) best = { sw, cos };
  }
  return best?.sw ?? null;
}
const forward = new THREE.Vector3();

/** What E would do now, for the hint under the crosshair. */
function actionHint(): string | null {
  const sw = targetSwitch();
  if (sw) {
    const s = useStore.getState();
    const lit = litRooms(s.unit, s.roomLights, s.style, isDusk(s.month, s.time));
    const on = sw.rooms.some((r) => lit.get(r)?.on);
    const label = sw.rooms.length > 1 ? 'living areas' : (lightRooms(s.unit).find((r) => r.id === sw.rooms[0])?.name ?? 'lights');
    return `${on ? 'Switch off' : 'Switch on'} ${label}`;
  }
  const t = targetDoor();
  if (!t) return null;
  return t.open > 0.5 ? 'Close door' : 'Open door';
}

/** Flip the switch under the crosshair, or else toggle the door the player is facing. */
export function interact() {
  const sw = targetSwitch();
  if (sw) {
    toggleRooms(sw.rooms);
    return;
  }
  const t = targetDoor();
  if (!t) return;
  useStore.getState().setDoor(t.id, t.open > 0.5 ? 0 : 1);
}

const ray = new THREE.Raycaster();
const centre = new THREE.Vector2(0, 0);
let activeCamera: THREE.Camera | null = null;
export function setActiveCamera(c: THREE.Camera) {
  activeCamera = c;
}
export const activeCameraRef = () => activeCamera;

/** Point under the crosshair on the shell or a door. */
export function crosshairHit(): THREE.Vector3 | null {
  if (!activeCamera) return null;
  ray.setFromCamera(centre, activeCamera);
  ray.far = 30;
  const furniture = [...registry.furniture.values()].map((f) => f.object);
  const hits = ray.intersectObjects([...furniture, ...registry.hitTargets], true);
  return hits[0]?.point ?? null;
}

/** M: set point A, then B; a third press starts again. */
export function measureAction() {
  const p = crosshairHit();
  if (!p) return;
  const s = useStore.getState();
  const pt: [number, number, number] = [p.x, p.y, p.z];
  if (!s.measure.a || s.measure.b) s.set({ measuring: true, measure: { a: pt, b: null } });
  else s.set({ measure: { a: s.measure.a, b: pt } });
}
