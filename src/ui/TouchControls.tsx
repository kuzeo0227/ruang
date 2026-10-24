// Touch input: a floating joystick on the left of the screen, drag to look on the right.
// Listeners are always active, so the first touch on a touchscreen laptop already works.

import { Ruler } from 'lucide-react';
import { useEffect, useState } from 'react';
import { selectAt } from '../render/EditController';
import { controls, measureAction } from '../render/Player';
import { useStore } from '../state/store';

const RADIUS = 56;
const DEAD = 0.12;

export function TouchControls() {
  const touchUi = useStore((s) => s.touchUi);
  const started = useStore((s) => s.started);
  const measuring = useStore((s) => s.measuring);
  const plan = useStore((s) => s.mode === 'plan');
  const [stick, setStick] = useState<{ x: number; y: number; kx: number; ky: number } | null>(null);

  useEffect(() => {
    let move: { id: number; ox: number; oy: number } | null = null;
    let look: { id: number; x: number; y: number; sx: number; sy: number; t: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !(e.target instanceof HTMLCanvasElement)) return;
      const st = useStore.getState();
      if (!st.started || st.mode === 'plan') return;
      if (st.panel) st.set({ panel: null });
      if (e.clientX < window.innerWidth * 0.45 && !move) {
        move = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
        setStick({ x: e.clientX, y: e.clientY, kx: 0, ky: 0 });
      } else if (!look) {
        look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
      }
    };
    const drag = (e: PointerEvent) => {
      if (move && e.pointerId === move.id) {
        let dx = e.clientX - move.ox;
        let dy = e.clientY - move.oy;
        const d = Math.hypot(dx, dy);
        if (d > RADIUS) {
          dx *= RADIUS / d;
          dy *= RADIUS / d;
        }
        const m = Math.min(1, d / RADIUS);
        const scaled = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD);
        const k = d > 0 ? scaled / Math.max(m, 1e-6) : 0;
        controls.moveX = (dx / RADIUS) * k;
        controls.moveY = (-dy / RADIUS) * k;
        setStick({ x: move.ox, y: move.oy, kx: dx, ky: dy });
      } else if (look && e.pointerId === look.id) {
        const s = useStore.getState().sensitivity;
        controls.lookDX += (e.clientX - look.x) * 0.0055 * s;
        controls.lookDY += (e.clientY - look.y) * 0.0055 * s;
        look.x = e.clientX;
        look.y = e.clientY;
      }
    };
    const up = (e: PointerEvent) => {
      if (move && e.pointerId === move.id) {
        move = null;
        controls.moveX = 0;
        controls.moveY = 0;
        setStick(null);
      }
      if (look && e.pointerId === look.id) {
        // A quick tap (not a drag) picks the piece under the finger.
        if (Math.hypot(e.clientX - look.sx, e.clientY - look.sy) < 10 && performance.now() - look.t < 350) selectAt(e.clientX, e.clientY);
        look = null;
      }
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', drag);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', drag);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  if (!touchUi || !started || plan) return null;
  return (
    <>
      <div className={`joystick ${stick ? 'live' : ''}`} style={stick ? { left: stick.x, top: stick.y } : undefined} aria-hidden>
        <div className="knob" style={stick ? { transform: `translate(${stick.kx}px, ${stick.ky}px)` } : undefined} />
      </div>
      {!stick && <div className="look-hint">Drag here to look</div>}
      <div className="touch-actions">
        <button className={`roundbtn glass ${measuring ? 'on' : ''}`} onClick={measureAction} aria-label="Tape measure">
          <Ruler className="ic" size={20} />
        </button>
      </div>
    </>
  );
}
