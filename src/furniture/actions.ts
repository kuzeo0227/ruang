// Edits made from the keyboard, the hover card, the touch sheet and the catalogue. Each is one undo
// step; anything that makes a piece disappear says so, with an Undo button.

import { CATALOGUE_BY_ID } from '../catalogue/items';
import { useLayout } from '../state/layout';
import { showToast } from '../state/store';
import { defaultElevation, itemOf, sizeOf } from './catalogue';
import { newUid, remove, setHidden, transform, update, wrapAngle } from './edit';
import type { Placement } from './types';

const L = () => useLayout.getState();
const find = (uid: string) => L().placements.find((p) => p.uid === uid);
const nameOf = (p: Placement) => itemOf(p)?.name ?? 'piece';

/** Pieces hung on a wall face out of it, so only free-standing pieces turn. */
export function canRotate(p: Placement): boolean {
  const item = itemOf(p);
  return !!item && item.mount !== 'wall' && item.mount !== 'window';
}

export function rotate(uid: string, by = Math.PI / 4) {
  const p = find(uid);
  if (!p || !canRotate(p)) return;
  const next = transform(L().placements, uid, { rot: wrapAngle(p.rot + by) });
  if (L().carrying === uid) L().live(next);
  else L().commit(next);
}

export function setFinish(uid: string, finish: number) {
  const p = find(uid);
  const item = p && itemOf(p);
  if (!p || !item || finish === p.finish || finish < 0 || finish >= item.finishes.length) return;
  const next = update(L().placements, uid, { finish });
  if (L().carrying === uid) L().live(next);
  else L().commit(next);
}

export function nextFinish(uid: string) {
  const p = find(uid);
  const item = p && itemOf(p);
  if (!p || !item || item.finishes.length < 2) return;
  setFinish(uid, (p.finish + 1) % item.finishes.length);
}

export function setVariant(uid: string, variant: number) {
  const p = find(uid);
  if (!p || p.variant === variant) return;
  L().commit(update(L().placements, uid, { variant }));
}

export function hide(uid: string) {
  const p = find(uid);
  if (!p) return;
  L().commit(setHidden(L().placements, uid, true));
  L().set({ hovered: null, selected: null });
  showToast(`Hid ${nameOf(p)}`, true);
}

export function unhide(uid: string) {
  L().commit(setHidden(L().placements, uid, false));
}

export function removePiece(uid: string) {
  const p = find(uid);
  if (!p) return;
  L().commit(remove(L().placements, uid));
  L().set({ hovered: null, selected: null });
  showToast(`Removed ${nameOf(p)}`, true);
}

/** Put a different catalogue piece in the same spot. */
export function swap(uid: string, itemId: string) {
  const p = find(uid);
  const before = p && itemOf(p);
  const item = CATALOGUE_BY_ID[itemId];
  if (!p || !before || !item || item.id === before.id) return;
  // Keep the size class where the new piece has sizes: the variant nearest the old width.
  let variant: number | undefined;
  if (item.variants) {
    const w = sizeOf(before, p.variant).w * 1000;
    variant = item.variants.reduce((best, v, i) => (Math.abs(v.w - w) < Math.abs(item.variants![best]!.w - w) ? i : best), 0);
  }
  const y = item.mount === before.mount ? p.y : defaultElevation(item, variant);
  L().commit(L().placements.map((q) => (q.uid === uid ? { ...q, itemId, finish: 0, variant, y } : q)));
  L().set({ swapFor: null });
  showToast(`Swapped in ${item.name}`, true);
}

export function pickUp(uid: string) {
  L().begin();
  L().set({ carrying: uid, hovered: null, selected: null });
}

export function place() {
  L().end();
  L().set({ carrying: null });
}

export function cancelCarry() {
  L().cancel();
}

/** Add a catalogue piece at a spot and pick it up, so it can be carried to where it should go. */
export function addAndCarry(itemId: string, at: { x: number; z: number; rot: number }) {
  const item = CATALOGUE_BY_ID[itemId];
  if (!item) return;
  const p: Placement = { uid: newUid(item.category), itemId, finish: 0, x: at.x, z: at.z, y: defaultElevation(item), rot: at.rot };
  if (item.variants) p.variant = Math.min(1, item.variants.length - 1);
  L().begin();
  L().live([...L().placements, p]);
  L().set({ carrying: p.uid, hovered: null, selected: null, swapFor: null });
}

export function undo() {
  if (L().past.length) L().undo();
}

export function redo() {
  if (L().future.length) L().redo();
}
