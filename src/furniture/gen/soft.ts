// Soft furnishings: rugs and curtains (drawn open, gathered at both sides of the window).

import { pleatedPanel } from '../geom';
import { METAL, type GenCtx } from './context';

export function rug(g: GenCtx) {
  const { w, d, h, P } = g;
  g.slots.main = { mat: g.finish };
  P.box('main', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], Math.min(0.004, h / 2 - 0.0005));
  g.top = h;
}

export function curtains(g: GenCtx) {
  const { w, d, P, style } = g;
  // Made-to-measure curtains run from the ceiling track to the floor; ready-made pairs keep their drop.
  const h = g.item.id.includes('custom') && g.toCeiling > g.h ? g.toCeiling : g.h;
  g.slots.main = { mat: g.finish, doubleSide: true };
  g.slots.rail = { mat: METAL[style] === 'brassBrushed' ? 'brassBrushed' : 'aluminiumWhite' };
  // Ceiling track along the top, then two gathered stacks of pleated fabric.
  P.box('rail', [-w / 2, h - 0.03, -0.02], [w / 2, h, 0.02], 0.004);
  const stack = Math.max(0.28, w * 0.16);
  const pleats = Math.max(4, Math.round(stack / 0.07));
  for (const side of [-1, 1]) {
    const cx = side * (w / 2 - stack / 2 - 0.02);
    const panel = pleatedPanel(stack, 0.015, h - 0.035, Math.min(0.1, d * 0.7), pleats);
    panel.translate(cx, 0, 0);
    P.geometry('main', panel, undefined, 'y');
  }
}
