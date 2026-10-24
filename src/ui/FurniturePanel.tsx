// The furniture panel: the catalogue (search, rooms, styles, 3D thumbnails; add a piece or swap the
// one in focus) and the bill (everything placed, room by room, with hide, remove, undo and reset).

import { Eye, EyeOff, Plus, Redo2, Repeat2, RotateCcw, Search, Sofa, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATALOGUE } from '../catalogue/items';
import { MATERIALS } from '../catalogue/materials';
import { STYLE_ORDER, type StyleId } from '../catalogue/styles';
import type { CatalogueItem } from '../catalogue/types';
import { addAndCarry, redo, removePiece, swap, undo, unhide, hide } from '../furniture/actions';
import { CATEGORY_GROUPS, CATEGORY_LABEL, finishOf, formatMYR, itemOf, priceOf, sizeOf, totalOf } from '../furniture/catalogue';
import { defaultLayout } from '../furniture/layouts';
import type { Placement } from '../furniture/types';
import { controls } from '../render/Player';
import { getShell, spaceAt } from '../render/shellCache';
import { thumbnail } from '../render/thumbnails';
import { useLayout } from '../state/layout';
import { showToast, useStore } from '../state/store';
import { PanelFrame, ROOM_NAMES, STYLE_SHORT } from './common';
import { requestLock } from './Overlays';

export function FurniturePanel() {
  const tab = useStore((s) => s.furnitureTab);
  const set = useStore((s) => s.set);
  const swapFor = useLayout((s) => s.swapFor);
  const total = useLayout((s) => totalOf(s.placements));
  const showing = swapFor ? 'catalogue' : tab;
  // Closing the panel ends a swap. (React's development-mode rehearsal unmount leaves the panel
  // open, and must not end it.)
  useEffect(
    () => () => {
      if (useStore.getState().panel !== 'furniture') useLayout.getState().set({ swapFor: null });
    },
    [],
  );
  return (
    <PanelFrame family="furniture" icon={Sofa} title="Furniture">
      <div className="seg" role="tablist" aria-label="Furniture">
        <button role="tab" aria-selected={showing === 'catalogue'} className={showing === 'catalogue' ? 'on' : ''} onClick={() => set({ furnitureTab: 'catalogue' })}>
          Catalogue
        </button>
        <button
          role="tab"
          aria-selected={showing === 'bill'}
          className={showing === 'bill' ? 'on' : ''}
          onClick={() => {
            useLayout.getState().set({ swapFor: null });
            set({ furnitureTab: 'bill' });
          }}
        >
          Bill · <span className="tabular">{formatMYR(total)}</span>
        </button>
      </div>
      {showing === 'catalogue' ? <Catalogue /> : <Bill />}
    </PanelFrame>
  );
}

// ---------------- Catalogue ----------------

function matches(item: CatalogueItem, q: string): boolean {
  if (!q) return true;
  const hay = [item.name, item.brand, CATEGORY_LABEL[item.category], item.description, ...item.finishes.map((f) => MATERIALS[f.material].name)].join(' ').toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

function Catalogue() {
  const style = useStore((s) => s.style);
  const swapFor = useLayout((s) => s.swapFor);
  const placements = useLayout((s) => s.placements);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('all');
  const [styleFilter, setStyleFilter] = useState<StyleId | 'all'>('all');
  const current = swapFor ? placements.find((p) => p.uid === swapFor) : undefined;
  const currentItem = current ? itemOf(current) : undefined;

  const items = useMemo(() => {
    const groups = new Set(CATEGORY_GROUPS.flatMap((g) => g.categories));
    return CATALOGUE.filter((item) => {
      if (currentItem) return item.category === currentItem.category && matches(item, query);
      if (!groups.has(item.category)) return false;
      if (group !== 'all' && !CATEGORY_GROUPS.find((g) => g.id === group)?.categories.includes(item.category)) return false;
      if (styleFilter !== 'all' && !item.styles.includes(styleFilter)) return false;
      return matches(item, query);
    });
  }, [query, group, styleFilter, currentItem]);

  const placedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of placements) if (!p.hidden) m.set(p.itemId, (m.get(p.itemId) ?? 0) + 1);
    return m;
  }, [placements]);

  const choose = (item: CatalogueItem) => {
    const st = useStore.getState();
    if (current) {
      swap(current.uid, item.id);
      st.set({ panel: null });
      return;
    }
    // Put it down 1.6 m in front, facing back towards the viewer, and pick it up.
    const fx = -Math.sin(controls.yaw);
    const fz = -Math.cos(controls.yaw);
    addAndCarry(item.id, { x: controls.position.x + fx * 1.6, z: controls.position.z + fz * 1.6, rot: controls.yaw });
    st.set({ panel: null });
    if (!st.touchUi) requestLock();
  };

  return (
    <>
      {current && currentItem && (
        <div className="swapbar">
          <Repeat2 className="ic" size={16} />
          <span>
            Swapping <b>{currentItem.name}</b> · <span className="tabular">{formatMYR(priceOf(current))}</span>
          </span>
          <button className="iconbtn" aria-label="Stop swapping" onClick={() => useLayout.getState().set({ swapFor: null })}>
            <X className="ic" size={14} />
          </button>
        </div>
      )}
      <label className="search">
        <Search className="ic" size={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${CATALOGUE.length} pieces`} aria-label="Search the catalogue" />
        {query && (
          <button className="iconbtn" aria-label="Clear search" onClick={() => setQuery('')}>
            <X className="ic" size={12} />
          </button>
        )}
      </label>
      {!current && (
        <>
          <div className="chips">
            <button className={`fchip ${group === 'all' ? 'on' : ''}`} onClick={() => setGroup('all')}>
              All
            </button>
            {CATEGORY_GROUPS.map((g) => (
              <button key={g.id} className={`fchip ${group === g.id ? 'on' : ''}`} onClick={() => setGroup(g.id)}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="chips small">
            <button className={`schip ${styleFilter === 'all' ? 'on' : ''}`} onClick={() => setStyleFilter('all')}>
              Every style
            </button>
            {STYLE_ORDER.map((id) => (
              <button key={id} className={`schip ${styleFilter === id ? 'on' : ''} ${id === style ? 'cur' : ''}`} onClick={() => setStyleFilter(styleFilter === id ? 'all' : id)}>
                {STYLE_SHORT[id]}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="cards">
        {items.map((item) => (
          <Card key={item.id} item={item} style={style} placed={placedCount.get(item.id) ?? 0} current={current} onChoose={choose} />
        ))}
        {!items.length && <p className="note">Nothing matches “{query}”.</p>}
      </div>
    </>
  );
}

function Card({ item, style, placed, current, onChoose }: { item: CatalogueItem; style: StyleId; placed: number; current?: Placement; onChoose: (i: CatalogueItem) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      thumbnail(item, style)
        .then((url) => alive && setSrc(url))
        .catch(() => undefined);
    });
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [item, style]);
  const s = sizeOf(item, item.variants ? Math.min(1, item.variants.length - 1) : undefined);
  const isCurrent = current?.itemId === item.id;
  const diff = current && !isCurrent ? item.priceMYR - priceOf(current) : 0;
  return (
    <button ref={ref} className={`card ${isCurrent ? 'current' : ''}`} onClick={() => !isCurrent && onChoose(item)} disabled={isCurrent}>
      <span className="thumb" style={{ background: `radial-gradient(circle at 50% 60%, ${MATERIALS[item.finishes[0]!.material].swatch}55, transparent 70%)` }}>
        {src ? <img src={src} alt="" draggable={false} /> : <span className="spinner" />}
        {placed > 0 && !current && <span className="placed">In your home{placed > 1 ? ` ×${placed}` : ''}</span>}
        {isCurrent && <span className="placed">Placed now</span>}
      </span>
      <span className="card-body">
        <b>{item.name}</b>
        <span className="sub">
          {item.brand} · {Math.round(s.w * 100)} cm
        </span>
        <span className="card-foot">
          <span className="dots">
            {item.finishes.slice(0, 5).map((f) => (
              <i key={f.material} style={{ background: MATERIALS[f.material].swatch }} />
            ))}
          </span>
          {current && !isCurrent ? (
            <span className={`delta tabular ${diff > 0 ? 'more' : 'less'}`}>{diff > 0 ? `+${formatMYR(diff)}` : `−${formatMYR(-diff)}`}</span>
          ) : (
            <span className="cprice tabular">{formatMYR(item.priceMYR)}</span>
          )}
        </span>
      </span>
      {!isCurrent && <span className="card-act">{current ? <Repeat2 className="ic" size={14} /> : <Plus className="ic" size={14} />}</span>}
    </button>
  );
}

// ---------------- Bill ----------------

function Bill() {
  const placements = useLayout((s) => s.placements);
  const canUndo = useLayout((s) => s.past.length > 0);
  const canRedo = useLayout((s) => s.future.length > 0);
  const unit = useStore((s) => s.unit);
  const style = useStore((s) => s.style);
  const shell = useMemo(() => getShell(unit), [unit]);
  const rooms = useMemo(() => {
    const m = new Map<string, Placement[]>();
    for (const p of placements) {
      const room = spaceAt(shell, p.x, p.z)?.id ?? 'other';
      let list = m.get(room);
      if (!list) m.set(room, (list = []));
      list.push(p);
    }
    const order = ['living', 'dining', 'kitchen', 'yard', 'bedroom1', 'bedroom2', 'study', 'toilet1', 'toilet2', 'corridor', 'balcony', 'foyer'];
    const rank = (room: string) => (order.includes(room) ? order.indexOf(room) : order.length);
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  }, [placements, shell]);
  const hidden = placements.filter((p) => p.hidden);
  const total = totalOf(placements);
  const reset = () => {
    useLayout.getState().reset(defaultLayout(unit, style));
    showToast(`Back to the ${STYLE_SHORT[style]} layout`, true);
  };
  return (
    <>
      <div className="billtotal">
        <div>
          <span className="label">Total</span>
          <b className="price tabular">{formatMYR(total)}</b>
          <span className="tiny">
            {placements.length - hidden.length} pieces{hidden.length ? ` · ${hidden.length} hidden, not counted` : ''} · furniture only, excluding renovation
          </span>
        </div>
        <div className="row">
          <button className="iconbtn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <Undo2 className="ic" size={16} />
          </button>
          <button className="iconbtn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
            <Redo2 className="ic" size={16} />
          </button>
        </div>
      </div>
      {rooms.map(([room, list]) => (
        <div className="billroom" key={room}>
          <div className="row between">
            <span className="label">{ROOM_NAMES[room] ?? 'Elsewhere'}</span>
            <span className="tiny tabular">{formatMYR(totalOf(list))}</span>
          </div>
          {list.map((p) => (
            <BillRow key={p.uid} p={p} />
          ))}
        </div>
      ))}
      <button className="ghostbtn" onClick={reset}>
        <RotateCcw className="ic" size={14} />
        Reset to the {STYLE_SHORT[style]} layout
      </button>
      <p className="note">Prices are estimates placed inside real Malaysian retail ranges (IKEA, Fella Design, BoConcept, Courts). Every product is invented.</p>
    </>
  );
}

function BillRow({ p }: { p: Placement }) {
  const item = itemOf(p);
  if (!item) return null;
  const v = p.variant !== undefined ? item.variants?.[p.variant]?.label : undefined;
  return (
    <div className={`billrow ${p.hidden ? 'off' : ''}`}>
      <i className="bdot" style={{ background: MATERIALS[finishOf(item, p.finish)].swatch }} />
      <div className="bmain">
        <b>{item.name}</b>
        <span>
          {MATERIALS[finishOf(item, p.finish)].name}
          {v ? ` · ${v}` : ''}
        </span>
      </div>
      <span className="bprice tabular">{p.hidden ? 'Hidden' : formatMYR(priceOf(p))}</span>
      <button className="iconbtn" aria-label={p.hidden ? 'Show' : 'Hide'} title={p.hidden ? 'Show' : 'Hide'} onClick={() => (p.hidden ? unhide(p.uid) : hide(p.uid))}>
        {p.hidden ? <Eye className="ic" size={14} /> : <EyeOff className="ic" size={14} />}
      </button>
      <button className="iconbtn" aria-label="Remove" title="Remove" onClick={() => removePiece(p.uid)}>
        <Trash2 className="ic" size={14} />
      </button>
    </div>
  );
}
