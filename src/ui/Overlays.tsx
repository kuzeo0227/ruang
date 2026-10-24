// Full-screen states: first load, and the start card before walking.

import { Footprints, Hand, TriangleAlert } from 'lucide-react';
import { STYLES } from '../catalogue/styles';
import { UNITS } from '../plan/units';
import { useStore } from '../state/store';
import { formatClock } from './common';

export function useFirstLoadDone() {
  return useStore((s) => s.firstLoaded);
}

export function LoadingOverlay() {
  const loading = useStore((s) => s.loading);
  const firstDone = useFirstLoadDone();
  if (firstDone) return null;
  const failed = loading.progress === 0 && /missing|could not|not in the manifest|failed/i.test(loading.message);
  return (
    <div className="overlay loading">
      <div className="brand">
        <span className="mark big">R</span>
        <span className="word">Ruang</span>
      </div>
      {failed ? (
        <div className="errorcard glass">
          <TriangleAlert className="ic" size={20} />
          <div>
            <b>Couldn't load the textures</b>
            <span>{loading.message}</span>
            <span>
              Run <code>npm run fetch:assets</code>, then reload.
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(loading.progress * 100)}>
            <div style={{ width: `${Math.max(4, loading.progress * 100)}%` }} />
          </div>
          <p className="loading-msg">{loading.message || 'Loading'}</p>
        </>
      )}
    </div>
  );
}

export function requestLock() {
  const canvas = document.querySelector<HTMLCanvasElement>('.viewer canvas');
  try {
    const p = canvas?.requestPointerLock?.() as unknown;
    if (p instanceof Promise) p.catch(() => undefined);
  } catch {
    /* pointer lock unavailable: drag to look still works */
  }
}

export function StartOverlay() {
  const started = useStore((s) => s.started);
  const unit = useStore((s) => s.unit);
  const style = useStore((s) => s.style);
  const time = useStore((s) => s.time);
  const touch = useStore((s) => s.touchUi);
  const set = useStore((s) => s.set);
  const firstDone = useFirstLoadDone();
  if (started || !firstDone) return null;
  const plan = UNITS[unit];
  const start = () => {
    set({ started: true, panel: null });
    if (!touch) requestLock();
  };
  return (
    <div className="overlay start" onPointerDown={(e) => e.stopPropagation()}>
      <div className="startcard glass">
        <span className="eyebrow">Phase 1 preview</span>
        <h1>
          {plan.name} <em>walkthrough</em>
        </h1>
        <p className="lede">
          2 bedrooms + study · {plan.schedule.totalSqft} sq ft · {STYLES[style].name} · mountain view · {formatClock(time)}
        </p>
        <button className="cta big" onClick={start}>
          <Footprints className="ic" size={20} />
          {touch ? 'Tap to start walking' : 'Start walking'}
        </button>
        {touch ? (
          <div className="howto">
            <span>
              <Hand className="ic" size={16} />
              Left thumb moves, right thumb looks.
            </span>
            <span>Tap “Open door” or “Switch on” when it appears. The ruler button measures.</span>
          </div>
        ) : (
          <div className="howto keys">
            {[
              [['W', 'A', 'S', 'D'], 'Move'],
              [['Mouse'], 'Look around'],
              [['Shift'], 'Run'],
              [['E'], 'Doors, light switches, pick up'],
              [['M'], 'Tape measure'],
              [['L'], 'All lights on or off'],
              [['1–4'], 'Style, lighting, views'],
              [['Esc'], 'Free the cursor'],
            ].map(([keys, label]) => (
              <span key={label as string}>
                <span className="keycaps">
                  {(keys as string[]).map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
                {label as string}
              </span>
            ))}
          </div>
        )}
        <p className="fine">Sun and sky are simulated for Kuala Lumpur. Prices are dummy estimates in ringgit.</p>
      </div>
    </div>
  );
}
