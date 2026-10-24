// Everything drawn over the 3D view, plus the panel shortcuts and touch/mouse switching.

import { DoorClosed, DoorOpen, Footprints, Map as MapIcon, MousePointer2, Ruler, X } from 'lucide-react';
import { useEffect } from 'react';
import { formatLength } from '../render/MeasureView';
import { interact } from '../render/Player';
import { useLayout } from '../state/layout';
import { useStore, type Panel } from '../state/store';
import { STYLE_SHORT } from './common';
import { Dock, TOOLS } from './Dock';
import { CarryHint, FocusCard, Toast, TouchSheet } from './EditHud';
import { Minimap } from './Minimap';
import { LoadingOverlay, StartOverlay, requestLock, useFirstLoadDone } from './Overlays';
import { PanelHost } from './panels';
import { TopBar } from './TopBar';
import { TouchControls } from './TouchControls';

export function Hud() {
  const hudHidden = useStore((s) => s.hudHidden);
  const touch = useStore((s) => s.touchUi);
  const started = useStore((s) => s.started);
  const panel = useStore((s) => s.panel);
  const plan = useStore((s) => s.mode === 'plan');
  const walking = started && !plan;
  useShortcuts();
  useInputSwitch();

  // Opening a panel frees the mouse so the panel can be used.
  useEffect(() => {
    if (panel && document.pointerLockElement) document.exitPointerLock();
  }, [panel]);

  return (
    <div className={`hud ${touch ? 'touch' : 'desk'} ${panel ? 'has-panel' : ''}`}>
      {!hudHidden && (
        <>
          <TopBar />
          {started && <FocusCard />}
          {walking && <Crosshair />}
          {walking && <ActionHint />}
          {walking && <CarryHint />}
          {started && <TouchSheet />}
          <Toast />
          <MeasureChip />
          <StyleLoadingPill />
          {panel !== 'furniture' && !plan && <Minimap />}
          <div className="bottom">
            {started && <ModeToggle />}
            <Dock />
          </div>
          {!touch && (plan ? <PlanHints /> : <KeyHints />)}
          {!touch && walking && <UnlockedHint />}
          <PanelHost />
        </>
      )}
      <TouchControls />
      <LoadingOverlay />
      <StartOverlay />
    </div>
  );
}

function Crosshair() {
  const hint = useStore((s) => s.hint);
  const measuring = useStore((s) => s.measuring);
  const piece = useLayout((s) => !!(s.hovered || s.carrying));
  return (
    <div className={`crosshair ${hint || piece ? 'target' : ''} ${piece ? 'piece' : ''} ${measuring ? 'measure' : ''}`}>
      <i />
    </div>
  );
}

/** "Open door" under the crosshair: a key hint on desktop, a button on touch. */
function ActionHint() {
  const hint = useStore((s) => s.hint);
  const touch = useStore((s) => s.touchUi);
  const furniture = useLayout((s) => !!(s.hovered || s.carrying || s.selected));
  if (!hint || furniture) return null;
  const Icon = hint.startsWith('Open') ? DoorOpen : DoorClosed;
  return touch ? (
    <button className="actionhint glass tappable" onClick={interact}>
      <Icon className="ic" size={16} />
      {hint}
    </button>
  ) : (
    <div className="actionhint glass">
      <kbd>E</kbd>
      {hint}
    </div>
  );
}

function MeasureChip() {
  const measuring = useStore((s) => s.measuring);
  const measure = useStore((s) => s.measure);
  const touch = useStore((s) => s.touchUi);
  const set = useStore((s) => s.set);
  if (!measuring) return null;
  const done = measure.a && measure.b;
  const dist = done ? Math.hypot(measure.a![0] - measure.b![0], measure.a![1] - measure.b![1], measure.a![2] - measure.b![2]) : 0;
  const press = touch ? 'Tap the ruler' : 'Press M';
  return (
    <div className="measurechip glass">
      <Ruler className="ic" size={16} />
      {done ? (
        <span>
          <b className="tabular">{formatLength(dist)}</b> · {press} to measure again
        </span>
      ) : (
        <span>{press} on the end point</span>
      )}
      <button className="iconbtn" aria-label="Stop measuring" onClick={() => set({ measuring: false, measure: { a: null, b: null } })}>
        <X className="ic" size={14} />
      </button>
    </div>
  );
}

function StyleLoadingPill() {
  const loading = useStore((s) => s.loading);
  const style = useStore((s) => s.style);
  const firstDone = useFirstLoadDone();
  if (!firstDone || loading.done) return null;
  return (
    <div className="loadpill glass">
      <span className="spinner" />
      Applying {STYLE_SHORT[style]}…
    </div>
  );
}

/** Walk / Plan switch beside the dock (Tab on a keyboard). */
function ModeToggle() {
  const mode = useStore((s) => s.mode);
  const set = useStore((s) => s.set);
  return (
    <div className="modetoggle glass" role="radiogroup" aria-label="View">
      <button role="radio" aria-checked={mode === 'walk'} className={mode === 'walk' ? 'on' : ''} onClick={() => set({ mode: 'walk' })}>
        <Footprints className="ic" size={16} />
        Walk
      </button>
      <button role="radio" aria-checked={mode === 'plan'} className={mode === 'plan' ? 'on' : ''} onClick={() => set({ mode: 'plan' })}>
        <MapIcon className="ic" size={16} />
        Plan
      </button>
    </div>
  );
}

function PlanHints() {
  return (
    <div className="hints">
      <span className="key">
        <kbd>Drag</kbd>Move a piece
      </span>
      <span className="key opt">
        <kbd>R</kbd>Rotate
      </span>
      <span className="key opt">
        <kbd>Wheel</kbd>Zoom
      </span>
      <span className="key">
        <kbd>Double-click</kbd>Walk there
      </span>
      <span className="key opt">
        <kbd>Tab</kbd>Walk
      </span>
    </div>
  );
}

function KeyHints() {
  return (
    <div className="hints">
      <span className="key opt">
        <kbd>WASD</kbd>Move
      </span>
      <span className="key">
        <kbd>E</kbd>Pick up / door
      </span>
      <span className="key opt">
        <kbd>M</kbd>Measure
      </span>
      <span className="key">
        <kbd>L</kbd>Lights
      </span>
      <span className="key">
        <kbd>Tab</kbd>Plan
      </span>
    </div>
  );
}

function UnlockedHint() {
  const locked = useStore((s) => s.locked);
  const panel = useStore((s) => s.panel);
  if (locked || panel) return null;
  return (
    <button className="unlocked glass" onClick={requestLock}>
      <MousePointer2 className="ic" size={16} />
      Click the view to look with the mouse, or drag to look
    </button>
  );
}

function useShortcuts() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
      const s = useStore.getState();
      if (!s.started) return;
      const tool = TOOLS.find((t) => t.key === e.key);
      if (tool?.panel) s.togglePanel(tool.panel as Exclude<Panel, null>);
      if (e.key === 'Tab') {
        e.preventDefault();
        if (!useLayout.getState().carrying) s.set({ mode: s.mode === 'plan' ? 'walk' : 'plan' });
      }
      if (e.key === 'Escape') {
        if (useLayout.getState().carrying) return;
        if (s.panel) s.set({ panel: null });
        else if (useLayout.getState().selected) useLayout.getState().set({ selected: null });
        else if (s.measuring) s.set({ measuring: false, measure: { a: null, b: null } });
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);
}

/** Show the touch controls when the screen is touched; hide them again on mouse use. */
function useInputSwitch() {
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const s = useStore.getState();
      if (e.pointerType === 'touch' && !s.touchUi) s.set({ touchUi: true });
      if (e.pointerType === 'mouse' && s.touchUi) s.set({ touchUi: false });
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, []);
}
