// Beds (the frame; the mattress is its own catalogue item) and the mattress with bedding.

import type { StyleId } from '../../catalogue/styles';
import { LINEN, type GenCtx } from './context';

/** Depth of the headboard, where the mattress starts, per style. */
export const BED_HEAD: Record<StyleId, number> = { muji: 0.03, japanese: 0.03, brutalist: 0.08, minimal: 0.09, quietLuxury: 0.13 };

/** Height of the deck the mattress lies on, per style. */
export const BED_DECK: Record<StyleId, number> = { muji: 0.25, japanese: 0.15, brutalist: 0.3, minimal: 0.35, quietLuxury: 0.35 };

export function bed(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  const deck = BED_DECK[style];
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  if (style === 'muji') {
    P.box('main', [x0, 0.1, z0 + 0.03], [x1, deck, z1], 0.006);
    for (const x of [x0 + 0.05, x1 - 0.05]) for (const z of [z0 + 0.08, z1 - 0.05]) P.box('main', [x - 0.025, 0, z - 0.025], [x + 0.025, 0.1, z + 0.025]);
    P.box('main', [x0, 0.1, z0], [x1, h, z0 + 0.03], 0.008);
  } else if (style === 'japanese') {
    // Slatted platform close to the floor.
    P.box('main', [x0, 0, z0], [x1, deck - 0.025, z1], 0.004);
    const n = Math.round(d / 0.12);
    for (let i = 0; i < n; i++) {
      const z = z0 + 0.01 + ((d - 0.02) * i) / n;
      P.box('main', [x0 + 0.01, deck - 0.025, z], [x1 - 0.01, deck, z + (d - 0.02) / n - 0.025], 0.002);
    }
    P.box('main', [x0, deck, z0], [x1, h, z0 + 0.03], 0.004);
  } else if (style === 'brutalist') {
    g.slots.shadow = { mat: 'x-shadow' };
    P.box('shadow', [x0 + 0.08, 0, z0 + 0.1], [x1 - 0.08, 0.07, z1 - 0.08]);
    P.box('main', [x0, 0.07, z0 + 0.08], [x1, deck, z1], 0.006);
    P.box('main', [x0, 0, z0], [x1, h, z0 + 0.08], 0.006);
  } else if (style === 'minimal') {
    P.box('main', [x0, 0.01, z0 + 0.06], [x1, deck, z1], 0.03);
    P.cushion('main', [x0, 0.01, z0], [x1, h, z0 + 0.09], 0.15);
    g.slots.shadow = { mat: 'x-shadow' };
    P.box('shadow', [x0 + 0.05, 0, z0 + 0.1], [x1 - 0.05, 0.012, z1 - 0.05]);
  } else {
    // Quiet Luxury: upholstered base and a tall channel-tufted headboard.
    g.slots.shadow = { mat: 'x-shadow' };
    P.box('shadow', [x0 + 0.06, 0, z0 + 0.12], [x1 - 0.06, 0.04, z1 - 0.06]);
    P.box('main', [x0, 0.04, z0 + 0.1], [x1, deck, z1], 0.04);
    const channels = Math.max(5, Math.round(w / 0.2));
    const cw = w / channels;
    for (let i = 0; i < channels; i++) {
      const cx0 = x0 + i * cw;
      P.cushion('main', [cx0 + 0.003, 0.08, z0], [cx0 + cw - 0.003, h, z0 + 0.13], 0.45);
    }
  }
  g.top = deck;
}

export function mattress(g: GenCtx) {
  const { w, d, h, style, P } = g;
  g.slots.main = { mat: g.finish };
  g.slots.linen = { mat: LINEN[style] };
  g.slots.pillow = { mat: 'cottonWhite' };
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  P.box('main', [x0, 0, z0], [x1, h - 0.01, z1], 0.05);
  // Duvet, drooping a little over the sides and foot, with its top edge folded back.
  P.cushion('linen', [x0 - 0.035, h - 0.07, z0 + 0.5], [x1 + 0.035, h + 0.07, z1 + 0.035], 0.35);
  P.cushion('linen', [x0 - 0.03, h + 0.02, z0 + 0.46], [x1 + 0.03, h + 0.1, z0 + 0.72], 0.6);
  const pillows = w > 1.3 ? 2 : 1;
  const pw = (w - 0.12) / pillows;
  for (let i = 0; i < pillows; i++) {
    const a = x0 + 0.06 + i * pw;
    P.tiltedCushion('pillow', [a + pw / 2, h + 0.08, z0 + 0.27], [pw - 0.04, 0.15, 0.42], -0.25, 0, 0.6);
  }
  g.top = h + 0.1;
}
