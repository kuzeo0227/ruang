// The furnished layout each style starts with, written room by room against the plan's interior
// faces (rooms.ts) so it fits every unit type. Positions keep door swings, the sliding balcony
// door and the windows clear; pieces that sit on others (lamps, mattresses, the hob) are linked
// to them so they move together.

import type { MaterialId } from '../../catalogue/materials';
import { STYLES, type StyleId } from '../../catalogue/styles';
import type { UnitPlan } from '../../plan/types';
import { CATALOGUE_BY_ID } from '../../catalogue/items';
import { BED_HEAD } from '../gen/beds';
import type { Placement } from '../types';
import { LayoutBuilder, type PlaceOpts } from './builder';
import { openingSpan, roomBoxes } from './rooms';

interface Picks {
  vanity: string;
  vanityFinish: MaterialId;
  wc: string;
  wcFinish: MaterialId;
  mirror: string;
  mirrorFinish: MaterialId;
  screen: MaterialId;
  fridge: string;
  fridgeFinish: MaterialId;
  hoodFinish: MaterialId;
  washer: string;
  outdoor: string;
  curtain: MaterialId;
  frame: MaterialId;
  mattress: string;
}

/** Shared pieces each style chooses, and their finishes. */
const PICKS: Record<StyleId, Picks> = {
  muji: {
    vanity: 'vanity-60', vanityFinish: 'oakLight', wc: 'wc-onepiece', wcFinish: 'porcelainWhite', mirror: 'mirror-round', mirrorFinish: 'steelBlack',
    screen: 'glassClear', fridge: 'fridge-2d', fridgeFinish: 'lacquerWhite', hoodFinish: 'steelStainless', washer: 'washer-95', outdoor: 'out-acacia',
    curtain: 'cottonWhite', frame: 'oakLight', mattress: 'mattress-q',
  },
  japanese: {
    vanity: 'vanity-60', vanityFinish: 'smokedOak', wc: 'wc-onepiece', wcFinish: 'porcelainWhite', mirror: 'mirror-round', mirrorFinish: 'steelBlack',
    screen: 'glassFluted', fridge: 'fridge-2d', fridgeFinish: 'steelStainless', hoodFinish: 'steelStainless', washer: 'washer-95', outdoor: 'out-acacia',
    curtain: 'linenStone', frame: 'steelBlack', mattress: 'mattress-q',
  },
  brutalist: {
    vanity: 'vanity-80', vanityFinish: 'terrazzo', wc: 'wc-wallhung', wcFinish: 'stonewareMatte', mirror: 'mirror-round', mirrorFinish: 'steelBlack',
    screen: 'glassClear', fridge: 'fridge-sbs', fridgeFinish: 'steelBlack', hoodFinish: 'steelBlack', washer: 'washer-95', outdoor: 'out-teak',
    curtain: 'linenCharcoal', frame: 'steelBlack', mattress: 'mattress-q',
  },
  minimal: {
    vanity: 'vanity-80', vanityFinish: 'oakLight', wc: 'wc-wallhung', wcFinish: 'porcelainWhite', mirror: 'mirror-cabinet', mirrorFinish: 'lacquerWhite',
    screen: 'glassClear', fridge: 'fridge-2d', fridgeFinish: 'lacquerWhite', hoodFinish: 'steelStainless', washer: 'washer-95', outdoor: 'out-acacia',
    curtain: 'cottonWhite', frame: 'steelBlack', mattress: 'mattress-q',
  },
  quietLuxury: {
    vanity: 'vanity-80', vanityFinish: 'walnut', wc: 'wc-wallhung', wcFinish: 'porcelainWhite', mirror: 'mirror-round', mirrorFinish: 'brassBrushed',
    screen: 'glassFluted', fridge: 'fridge-sbs', fridgeFinish: 'steelStainless', hoodFinish: 'steelStainless', washer: 'washer-dryer', outdoor: 'out-teak',
    curtain: 'linenOat', frame: 'walnut', mattress: 'mattress-q-latex',
  },
};

/** Index of the variant whose width is closest to (but not over) `max` metres. */
function variantFitting(id: string, max: number): number | undefined {
  const vs = CATALOGUE_BY_ID[id]?.variants;
  if (!vs) return undefined;
  let best: number | undefined;
  vs.forEach((v, i) => {
    if (v.w / 1000 <= max + 1e-6 && (best === undefined || v.w > vs[best]!.w)) best = i;
  });
  return best ?? 0;
}

export function defaultLayout(plan: UnitPlan, style: StyleId): Placement[] {
  const R = roomBoxes(plan);
  const L = new LayoutBuilder(style);
  const pick = PICKS[style];
  const jp = style === 'japanese';
  const front = STYLES[style].shell.kitchenFronts;

  // ---------- Living: TV wall to the west, sofa against the east wall ----------
  const liv = R.living;
  const corridor = R.corridor;
  if (liv) {
    const cz = liv.z0 + 1.78;
    const media = L.wall('tvConsole', 'W', liv.x0, cz);
    const mediaTop = media ? media.y + L.size('tvConsole').h : 0.5;
    L.wall('tv', 'W', liv.x0, cz, { y: Math.max(mediaTop + 0.2, 0.7) });
    L.on(media, 'decor', -L.size('tvConsole').w / 2 + 0.25, 0, { id: 'vase' });
    L.wall('airCon', 'W', liv.x0, cz, { id: 'aircon-15hp' });
    const sofa = L.size('sofa');
    L.wall('sofa', 'E', liv.x1, cz);
    const consoleD = L.size('tvConsole').d;
    const tableX = (liv.x0 + consoleD + liv.x1 - sofa.d) / 2;
    L.at('coffeeTable', tableX, cz, 'E');
    const rug = L.size('rug');
    L.at('rug', Math.min((liv.x0 + liv.x1) / 2 + 0.15, liv.x1 - rug.w / 2 - 0.05), cz, 'S');
    L.at('floorLamp', liv.x1 - 0.3, cz - sofa.w / 2 - 0.22, 'W');
    const side = L.size('sideTable');
    const st = L.at('sideTable', liv.x1 - side.d / 2 - 0.06, cz + sofa.w / 2 + side.w / 2 + 0.06, 'W');
    L.on(st, 'tableLamp');
    L.at('ceilingFan', (liv.x0 + liv.x1) / 2, cz, 'S');
    if (jp) L.at('loungeChair', tableX, cz - 0.85, 'S');
    const slider = openingSpan(plan, 'balcony-slider');
    if (slider) L.wall('curtains', 'N', liv.z0, slider.mid.x, { variant: variantFitting('curtain-custom', Math.min(slider.width + 0.4, liv.x1 - liv.x0 - 0.05)), finish: pick.curtain, gap: 0.03 });
  }

  // ---------- Dining: table in the middle, pendant above, a print and a tree ----------
  const din = R.dining;
  if (din && liv) {
    const cx = (din.x0 + din.x1) / 2;
    const cz = din.z0 + 1.35;
    const table = L.size('diningTable');
    L.at('diningTable', cx, cz, 'S');
    const chair = L.size('diningChair');
    const xs = table.w >= 1.9 ? [-0.66, 0, 0.66] : [-0.42, 0.42];
    for (const dx of xs) {
      L.at('diningChair', cx + dx, cz - table.d / 2 - chair.d / 2 + 0.14, 'S');
      L.at('diningChair', cx + dx, cz + table.d / 2 + chair.d / 2 - 0.14, 'N');
    }
    L.at('pendant', cx, cz, 'S');
    L.wall('decor', 'W', din.x0, cz, { id: 'print', finish: pick.frame });
    L.at('plant', liv.x1 - 0.38, din.z0 - 0.4, 'W', { id: 'plant-fig' });
  }

  // ---------- Kitchen: one run along the south wall, fridge by the yard door ----------
  const kit = R.kitchen;
  if (kit) {
    const width = kit.x1 - kit.x0;
    const opts = { finish: front };
    // Sink by the yard (plumbing), then the hob on an 80 cm drawer base, then cabinets to the end
    // wall; any odd gap is left at the sink end, where a filler strip would go.
    const fill: number[] = [];
    let rest = width - 1.6;
    while (rest >= 0.3 - 1e-6) {
      const v = variantFitting('k-base', rest)!;
      fill.push(v);
      rest -= CATALOGUE_BY_ID['k-base']!.variants![v]!.w / 1000;
    }
    let x = kit.x0 + Math.max(0, rest);
    const sink = L.wall('kitchenSink', 'S', kit.z1, x + 0.4, { ...opts, gap: 0 });
    x += 0.8;
    const hobBase = L.wall('kitchenBase', 'S', kit.z1, x + 0.4, { ...opts, id: 'k-drawer', variant: variantFitting('k-drawer', 0.8), gap: 0 });
    L.on(hobBase, 'hob', 0, 0.02, { id: 'hob-2' });
    L.wall('hood', 'S', kit.z1, x + 0.4, { finish: pick.hoodFinish, gap: 0 });
    x += 0.8;
    for (const v of fill) {
      const w = CATALOGUE_BY_ID['k-base']!.variants![v]!.w / 1000;
      L.wall('kitchenBase', 'S', kit.z1, x + w / 2, { ...opts, id: 'k-base', variant: v, gap: 0 });
      x += w;
    }
    if (sink) L.wall('kitchenWall', 'S', kit.z1, sink.x - 0.1, { ...opts, gap: 0 });
    const fridge = L.size('fridge', { id: pick.fridge });
    if (width > fridge.w + 0.3) L.wall('fridge', 'N', kit.z0, kit.x0 + fridge.w / 2 + 0.02, { id: pick.fridge, finish: pick.fridgeFinish, gap: 0.02 });
  }

  // ---------- Yard: washer with the drying rack above ----------
  const yard = R.yard;
  if (yard) {
    L.wall('washer', 'S', yard.z1, yard.x0 + 0.36, { id: pick.washer, gap: 0.03 });
    L.wall('dryingRack', 'S', yard.z1, (yard.x0 + yard.x1) / 2, { gap: 0 });
  }

  // ---------- Bedroom 1: bed against the west wall, wardrobe east, dresser by the window ----------
  const b1 = R.bedroom1;
  if (b1) {
    const bed = L.size('bedQueen');
    const bz = b1.z1 - 1.84;
    const bedP = L.wall('bedQueen', 'W', b1.x0, bz, { gap: 0.02 });
    const mat = L.size('mattress', { id: pick.mattress });
    L.on(bedP, 'mattress', 0, -bed.d / 2 + BED_HEAD[style] + mat.d / 2 + 0.01, { id: pick.mattress });
    const bs = L.size('bedside');
    for (const sgn of [-1, 1]) {
      const b = L.wall('bedside', 'W', b1.x0, bz + sgn * (bed.w / 2 + bs.w / 2 + 0.04));
      L.on(b, 'tableLamp', 0, -0.03);
    }
    const wardrobe = L.size('wardrobe');
    L.wall('wardrobe', 'E', b1.x1, b1.z0 + 0.18 + wardrobe.w / 2);
    const dresser = L.size('dresser');
    L.wall('dresser', 'W', b1.x0, b1.z0 + 0.18 + dresser.w / 2);
    const small = L.item('rug')?.variants ? 0 : undefined;
    const rs = L.size('rug', { variant: small });
    const across = rs.d <= b1.x1 - b1.x0 - 0.3;
    const extent = across ? rs.d : rs.w;
    L.at('rug', Math.min(b1.x0 + extent / 2 + 0.45, b1.x1 - 0.1 - extent / 2), bz, across ? 'E' : 'S', { variant: small });
    L.wall('airCon', 'S', b1.z1, b1.x1 - 0.85, { id: 'aircon-1hp' });
    const win = openingSpan(plan, 'bed1-window');
    if (win) L.wall('curtains', 'N', b1.z0, win.mid.x, { variant: variantFitting('curtain-custom', Math.min(win.width + 0.4, b1.x1 - b1.x0 - 0.05)), finish: pick.curtain, gap: 0.03 });
  }

  // ---------- Bedroom 2: bed with its head to the east wall, wardrobe west ----------
  const b2 = R.bedroom2;
  if (b2) {
    const bed = L.size('bedSingle');
    const bz = b2.z0 + 1.05;
    const bedP = L.wall('bedSingle', 'E', b2.x1, bz, { gap: 0.02 });
    L.on(bedP, 'mattress', 0, -bed.d / 2 + BED_HEAD[style] + L.size('mattress', { id: 'mattress-ss' }).d / 2 + 0.01, { id: 'mattress-ss' });
    const bs = L.size('bedside');
    const b = L.wall('bedside', 'E', b2.x1, bz + bed.w / 2 + bs.w / 2 + 0.04);
    L.on(b, 'tableLamp', 0, -0.03);
    const wv = 0;
    const ward = L.size('wardrobe', { variant: wv });
    L.wall('wardrobe', 'W', b2.x0, b2.z1 - 0.2 - ward.w / 2, { variant: wv });
    L.wall('airCon', 'S', b2.z1, b2.x0 + 1.05, { id: 'aircon-1hp' });
    const win = openingSpan(plan, 'bed2-window');
    if (win) L.wall('curtains', 'N', b2.z0, win.mid.x, { finish: pick.curtain, gap: 0.03 });
  }

  // ---------- Study: desk on the west wall, shelving by the door ----------
  const st = R.study;
  if (st) {
    const desk = L.size('desk');
    const shelf = L.size('bookshelf');
    const dz = st.z0 + Math.max(0.45, shelf.d + 0.12) + desk.w / 2;
    const deskP = L.wall('desk', 'W', st.x0, dz);
    L.at('taskChair', st.x0 + desk.d + 0.32, dz, 'W');
    L.on(deskP, 'deskLamp', desk.w / 2 - 0.18, -desk.d / 2 + 0.14, { id: 'lamp-pillar-desk' });
    L.on(deskP, 'plant', -desk.w / 2 + 0.2, -desk.d / 2 + 0.16, { id: 'plant-succ' });
    L.wall('bookshelf', 'N', st.z0, st.x0 + 0.01 + shelf.w / 2);
    L.at('floorLamp', st.x1 - 0.3, st.z1 - 0.3, 'N');
    L.wall('airCon', 'E', st.x1, (st.z0 + st.z1) / 2, { id: 'aircon-1hp' });
    const win = openingSpan(plan, 'study-window');
    if (win) L.wall('curtains', 'S', st.z1, win.mid.x, { variant: variantFitting('curtain-custom', win.width + 0.35), finish: pick.curtain, gap: 0.03 });
  }

  // ---------- Toilets: WC near the door, vanity opposite, shower at the far end ----------
  const toilet = (box: typeof R.toilet1, wcSide: 'W' | 'E') => {
    if (!box) return;
    const other = wcSide === 'W' ? 'E' : 'W';
    const face = (s: 'W' | 'E') => (s === 'W' ? box.x0 : box.x1);
    L.wall('wc', wcSide, face(wcSide), box.z0 + 0.72, { id: pick.wc, finish: pick.wcFinish, gap: pick.wc === 'wc-wallhung' ? 0.005 : 0.02 });
    const vanity = L.size('vanity', { id: pick.vanity });
    const vz = box.z0 + 0.9 + vanity.w / 2;
    L.wall('vanity', other, face(other), vz, { id: pick.vanity, finish: pick.vanityFinish });
    const mirrorOpts: PlaceOpts = { id: pick.mirror, finish: pick.mirrorFinish, gap: 0.003 };
    L.wall('mirror', other, face(other), vz, mirrorOpts);
    const width = box.x1 - box.x0;
    L.at('showerScreen', (box.x0 + box.x1) / 2, box.z1 - 0.9, 'S', { variant: variantFitting('screen', width - 0.01), finish: pick.screen });
  };
  toilet(R.toilet1, 'W');
  toilet(R.toilet2, 'E');

  // ---------- Balcony: two chairs facing the view beside the door, a planter along the glass ----------
  const bal = R.balcony;
  if (bal) {
    const z = (bal.z0 + bal.z1) / 2 + 0.04;
    const seat = L.size('outdoorSeat', { id: pick.outdoor });
    const x1 = bal.x1 - 0.02 - seat.w / 2;
    L.at('outdoorSeat', x1, z, 'N', { id: pick.outdoor });
    L.at('outdoorSeat', x1 - seat.w - 0.03, z, 'N', { id: pick.outdoor });
    const planter = L.size('planter');
    L.at('planter', bal.x0 + 0.03 + planter.w / 2, bal.z0 + 0.06 + planter.d / 2, 'S');
  }

  // ---------- Foyer (outside the main door) and corridor ----------
  const foy = R.foyer;
  if (foy) L.wall('shoeCabinet', 'S', foy.z1, foy.x0 + 0.1 + L.size('shoeCabinet').w / 2);
  if (corridor) L.wall('decor', 'N', corridor.z0, corridor.x0 + 0.9, { id: 'print', finish: pick.frame });

  return L.list;
}
