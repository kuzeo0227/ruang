// Furniture editing over the 3D view: the highlight around the piece in focus, its price card
// (key hints on desktop, buttons on touch), the carry bar, the undo toast and the running total.

import { Check, EyeOff, Hand, Move, Palette, Repeat2, RotateCw, Trash2, Undo2, Wallet, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { MATERIALS } from '../catalogue/materials';
import { canRotate, cancelCarry, hide, nextFinish, pickUp, place, removePiece, rotate, setFinish, undo } from '../furniture/actions';
import { CATEGORY_LABEL, finishOf, formatMYR, itemOf, priceOf, sizeOf, totalOf } from '../furniture/catalogue';
import type { Placement } from '../furniture/types';
import { editView } from '../render/EditController';
import { useLayout } from '../state/layout';
import { useStore } from '../state/store';

function useFocus(): Placement | null {
  const uid = useLayout((s) => s.carrying ?? s.swapFor ?? s.selected ?? s.hovered);
  return useLayout((s) => (uid ? (s.placements.find((p) => p.uid === uid) ?? null) : null));
}

/** "160 × 230 cm", or the size variant's label. */
export function sizeLabel(p: Placement): string {
  const item = itemOf(p);
  if (!item) return '';
  const v = p.variant !== undefined ? item.variants?.[p.variant] : undefined;
  const s = sizeOf(item, p.variant);
  const dims = `${Math.round(s.w * 100)} × ${Math.round(s.d * 100)} cm`;
  return v ? `${v.label} · ${dims}` : dims;
}

export function Swatches({ p, size = 22 }: { p: Placement; size?: number }) {
  const item = itemOf(p);
  if (!item || item.finishes.length < 2) return null;
  return (
    <div className="swatches">
      {item.finishes.map((f, i) => (
        <button
          key={f.material}
          className={`sw ${i === p.finish ? 'on' : ''}`}
          style={{ background: MATERIALS[f.material].swatch, width: size, height: size }}
          title={MATERIALS[f.material].name}
          aria-label={MATERIALS[f.material].name}
          onClick={() => setFinish(p.uid, i)}
        />
      ))}
    </div>
  );
}

/** Highlight and card, positioned every frame from the piece's projected bounds. */
export function FocusCard() {
  const p = useFocus();
  const touch = useStore((s) => s.touchUi);
  const panel = useStore((s) => s.panel);
  const carrying = useLayout((s) => s.carrying);
  const plan = useStore((s) => s.mode === 'plan');
  const box = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const r = editView.rect;
      const b = box.current;
      if (b) {
        if (r) {
          b.style.opacity = '1';
          b.style.transform = `translate(${r.x}px, ${r.y}px)`;
          b.style.width = `${r.w}px`;
          b.style.height = `${r.h}px`;
        } else b.style.opacity = '0';
      }
      const c = card.current;
      if (c && r) {
        const cw = c.offsetWidth;
        const ch = c.offsetHeight;
        const W = window.innerWidth;
        const H = window.innerHeight;
        let x = r.x - cw - 18;
        if (x < 14) x = r.x + r.w + 18;
        if (x + cw > W - 14) x = 24;
        // Keep clear of the top bar, and of the minimap in the bottom-left corner.
        const bottom = x < 200 ? H - 210 : H - 120;
        const y = Math.min(Math.max(r.y + r.h / 2 - ch / 2, 76), bottom - ch);
        c.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        c.style.opacity = '1';
      } else if (c) c.style.opacity = '0';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const item = p ? itemOf(p) : undefined;
  const showCard = !!p && !!item && !touch && (!panel || panel === 'furniture');
  return (
    <>
      <div ref={box} className={`focusbox ${carrying ? 'carry' : ''}`} style={{ opacity: 0 }} aria-hidden />
      {showCard && (
        <div ref={card} className="hovercard glass" style={{ opacity: 0 }}>
          <div className="hc-top">
            <span className="cat">{CATEGORY_LABEL[item.category]}</span>
            <span className="brand">{item.brand}</span>
          </div>
          <b className="hc-name">{item.name}</b>
          <div className="hc-price">
            <span className="price tabular">{formatMYR(priceOf(p))}</span>
            <span className="hc-size">{sizeLabel(p)}</span>
          </div>
          {item.finishes.length > 1 && (
            <div className="hc-finish">
              <span className="label">Finish</span>
              <Swatches p={p} size={18} />
              <span className="fname">{MATERIALS[finishOf(item, p.finish)].name}</span>
            </div>
          )}
          <div className="hc-keys">
            {plan ? (
              <>
                <span className="key"><kbd>Drag</kbd>Move</span>
                {canRotate(p) && <span className="key"><kbd>R</kbd>Rotate</span>}
                {item.finishes.length > 1 && <span className="key"><kbd>F</kbd>Finish</span>}
                <span className="key"><kbd>C</kbd>Swap</span>
                <span className="key"><kbd>H</kbd>Hide</span>
                <span className="key"><kbd>Del</kbd>Remove</span>
              </>
            ) : carrying ? (
              <>
                <span className="key"><kbd>E</kbd>Put down</span>
                {canRotate(p) && <span className="key"><kbd>R</kbd>Rotate</span>}
                {item.finishes.length > 1 && <span className="key"><kbd>F</kbd>Finish</span>}
                <span className="key"><kbd>Esc</kbd>Cancel</span>
              </>
            ) : (
              <>
                <span className="key"><kbd>E</kbd>Pick up</span>
                {canRotate(p) && <span className="key"><kbd>R</kbd>Rotate</span>}
                {item.finishes.length > 1 && <span className="key"><kbd>F</kbd>Finish</span>}
                <span className="key"><kbd>C</kbd>Swap</span>
                <span className="key"><kbd>H</kbd>Hide</span>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Touch: a sheet for the piece in focus, with buttons for what the keys do on desktop. */
export function TouchSheet() {
  const p = useFocus();
  const touch = useStore((s) => s.touchUi);
  const plan = useStore((s) => s.mode === 'plan');
  const panel = useStore((s) => s.panel);
  const carrying = useLayout((s) => s.carrying);
  const set = useStore((s) => s.set);
  const item = p ? itemOf(p) : undefined;
  if (!touch || !p || !item || panel) return null;
  const close = () => useLayout.getState().set({ selected: null, hovered: null });
  return (
    <div className="sheet glass">
      <div className="sheet-grab" />
      <div className="sheet-head">
        <div className="sheet-title">
          <span className="cat">{CATEGORY_LABEL[item.category]}</span>
          <b>{item.name}</b>
          <span className="hc-size">
            {item.brand} · {sizeLabel(p)}
          </span>
        </div>
        <span className="price tabular">{formatMYR(priceOf(p))}</span>
      </div>
      {carrying ? (
        <div className="sheet-actions">
          <button className="sa primary" onClick={place}>
            <Check className="ic" size={20} />
            Put down
          </button>
          {canRotate(p) && (
            <button className="sa" onClick={() => rotate(p.uid)}>
              <RotateCw className="ic" size={20} />
              Rotate
            </button>
          )}
          <button className="sa" onClick={cancelCarry}>
            <X className="ic" size={20} />
            Cancel
          </button>
        </div>
      ) : (
        <div className="sheet-actions">
          {!plan && (
            <button className="sa" onClick={() => pickUp(p.uid)}>
              <Move className="ic" size={20} />
              Move
            </button>
          )}
          {canRotate(p) && (
            <button className="sa" onClick={() => rotate(p.uid)}>
              <RotateCw className="ic" size={20} />
              Rotate
            </button>
          )}
          <button
            className="sa"
            onClick={() => {
              useLayout.getState().set({ swapFor: p.uid });
              set({ panel: 'furniture' });
            }}
          >
            <Repeat2 className="ic" size={20} />
            Swap
          </button>
          {item.finishes.length > 1 && (
            <button className="sa" onClick={() => nextFinish(p.uid)}>
              <Palette className="ic" size={20} />
              Finish
            </button>
          )}
          <button className="sa" onClick={() => hide(p.uid)}>
            <EyeOff className="ic" size={20} />
            Hide
          </button>
          <button className="sa danger" onClick={() => removePiece(p.uid)} aria-label="Remove">
            <Trash2 className="ic" size={20} />
            Remove
          </button>
        </div>
      )}
      {!carrying && (
        <button className="iconbtn sheet-x" onClick={close} aria-label="Close">
          <X className="ic" size={14} />
        </button>
      )}
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  const set = useStore((s) => s.set);
  if (!toast) return null;
  return (
    <div className="toast glass" key={toast.id}>
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          className="ghostbtn small"
          onClick={() => {
            undo();
            set({ toast: null });
          }}
        >
          <Undo2 className="ic" size={14} />
          Undo
        </button>
      )}
    </div>
  );
}

/** Carrying on desktop: what the keys do, under the crosshair. */
export function CarryHint() {
  const carrying = useLayout((s) => s.carrying);
  const touch = useStore((s) => s.touchUi);
  if (!carrying || touch) return null;
  return (
    <div className="carryhint glass">
      <Hand className="ic" size={16} />
      Look where it should go, then <kbd>E</kbd>
    </div>
  );
}

/** Running total of everything shown, in the top bar; opens the bill. */
export function TotalPill() {
  const placements = useLayout((s) => s.placements);
  const set = useStore((s) => s.set);
  const panel = useStore((s) => s.panel);
  const shown = placements.filter((p) => !p.hidden);
  return (
    <button className={`chip glass c-price ${panel === 'furniture' ? 'open' : ''}`} onClick={() => set(panel === 'furniture' ? { panel: null } : { panel: 'furniture', furnitureTab: 'bill' })} aria-label="Furniture total">
      <Wallet className="ic" size={16} />
      <span className="chip-sub hide-phone">{shown.length} pieces</span>
      <b className="tabular">{formatMYR(totalOf(placements))}</b>
    </button>
  );
}
