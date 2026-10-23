// Price bands per furniture category, taken from Malaysian online retail listings
// (accessed 23 Oct 2026). Every catalogue item is invented; its price is placed inside
// the band for its category according to its style's tier, so prices sit where comparable
// real products sell.
//
//   budget  = IKEA Malaysia (ikea.com/my) median for the category
//   mid     = Fella Design (fella.com.my, Malaysian brand) median, or MUJI Malaysia
//   premium = BoConcept Malaysia (boconcept.com/en-my) recommended retail median
//
// Where a tier had no listing, the value is derived and marked `derived`.

export type CategoryId =
  | 'sofa' | 'loungeChair' | 'coffeeTable' | 'sideTable' | 'tvConsole' | 'rug' | 'floorLamp'
  | 'diningTable' | 'diningChair' | 'pendant' | 'sideboard'
  | 'bedQueen' | 'bedSingle' | 'bedside' | 'wardrobe' | 'dresser' | 'tableLamp'
  | 'desk' | 'bookshelf' | 'shoeCabinet'
  | 'tv' | 'ceilingFan' | 'airCon' | 'plant' | 'decor' | 'curtains' | 'mattress' | 'taskChair' | 'deskLamp' | 'bench'
  | 'kitchenBase' | 'kitchenWall' | 'kitchenSink' | 'kitchenTall' | 'hob' | 'hood' | 'fridge' | 'washer' | 'dryingRack'
  | 'wc' | 'vanity' | 'showerScreen' | 'mirror' | 'outdoorSeat' | 'planter' | 'downlight';

export interface PriceRef {
  tier: 'budget' | 'mid' | 'premium';
  myr: number;
  note: string;
  url?: string;
  derived?: boolean;
}

export interface PriceBand {
  budget: number;
  mid: number;
  premium: number;
  refs: PriceRef[];
}

const IKEA = (slug: string) => `https://www.ikea.com/my/en/cat/${slug}/`;
const BOC = (path: string) => `https://www.boconcept.com/en-my/shop/${path}/`;
const FELLA = 'https://fella.com.my/collections/all';
const COURTS = (path: string) => `https://www.courts.com.my/${path}`;

const band = (budget: PriceRef, mid: PriceRef, premium: PriceRef): PriceBand => ({
  budget: budget.myr,
  mid: mid.myr,
  premium: premium.myr,
  refs: [budget, mid, premium],
});
const b = (myr: number, note: string, url?: string, derived = false): PriceRef => ({ tier: 'budget', myr, note, url, derived });
const md = (myr: number, note: string, url?: string, derived = false): PriceRef => ({ tier: 'mid', myr, note, url, derived });
const p = (myr: number, note: string, url?: string, derived = false): PriceRef => ({ tier: 'premium', myr, note, url, derived });
/** Geometric mean, used to fill a missing middle tier. */
const gm = (lo: number, hi: number) => Math.round(Math.sqrt(lo * hi));

/** Bands for style-driven furniture. Shared items (appliances, sanitary ware, etc.) carry their own references. */
export const BANDS: Partial<Record<CategoryId, PriceBand>> = {
  sofa: band(
    b(1395, 'IKEA 3-seat sofas, median of 24 (MANNARP RM1,295, KIVIK RM1,495)', IKEA('sofas-fu003')),
    md(4899, 'Fella Design sofas, median of 45', FELLA),
    p(19845, 'BoConcept 3-seater sofas, median of 23 (from RM9,945)', BOC('sofas/3-seater-sofas')),
  ),
  loungeChair: band(
    b(699, 'IKEA armchairs, median of 31 (STRANDMON RM699)', IKEA('armchairs-fu006')),
    md(1549, 'Fella Design armchairs / accent chairs, median of 10', FELLA),
    p(5295, 'BoConcept chairs, median of 24', BOC('chairs')),
  ),
  coffeeTable: band(
    b(449, 'IKEA coffee tables, median of 10 (BORGEBY RM399)', IKEA('coffee-side-tables-10705')),
    md(1999, 'Fella Design coffee tables, median of 18', FELLA),
    p(5545, 'BoConcept coffee tables, median of 18', BOC('tables/coffee-tables')),
  ),
  sideTable: band(
    b(199, 'IKEA side tables, median of 9 (HOLMERUD RM199)', IKEA('coffee-side-tables-10705')),
    md(999, 'Fella Design side tables, median of 11', FELLA),
    p(2870, 'BoConcept bedside / side tables, median of 8', BOC('tables/bedside-tables')),
  ),
  tvConsole: band(
    b(644, 'IKEA TV benches, median of 20 (HAUGA RM790)', IKEA('tv-media-furniture-10475')),
    md(2399, 'Fella Design Westconi TV cabinet', FELLA),
    p(9895, 'BoConcept storage, median of 24 (Como wall system RM9,945)', BOC('storage')),
  ),
  rug: band(
    b(249, 'IKEA rugs, median of 27 (LOHALS RM249, up to RM699)', IKEA('rugs-10653')),
    md(gm(699, 6595), 'Derived: between IKEA top (RM699) and BoConcept median', undefined, true),
    p(6595, 'BoConcept rugs, median of 24 (from RM2,995)', BOC('rugs')),
  ),
  floorLamp: band(
    b(79, 'IKEA floor lamps, median of 7 (TÅGARP RM79, up to RM399)', IKEA('lamps-li002')),
    md(gm(399, 3270), 'Derived: between IKEA top (RM399) and BoConcept median', undefined, true),
    p(3270, 'BoConcept lamps, median of 24 (Dawn floor lamp)', BOC('lamps')),
  ),
  pendant: band(
    b(89, 'IKEA lamps, median of table/pendant range', IKEA('lamps-li002')),
    md(gm(399, 1695), 'Derived: between IKEA top and BoConcept Ball pendant', undefined, true),
    p(1695, 'BoConcept Ball pendant', BOC('lamps')),
  ),
  tableLamp: band(
    b(89, 'IKEA table lamps, median of 11 (ÅRSTID RM89)', IKEA('lamps-li002')),
    md(gm(199, 995), 'Derived: between IKEA top (RM199) and BoConcept Paris table lamp', undefined, true),
    p(995, 'BoConcept Paris table lamp', BOC('lamps')),
  ),
  diningTable: band(
    b(849, 'IKEA dining tables, median of 24 (VOXLÖV RM899)', IKEA('dining-tables-21825')),
    md(3949, 'Fella Design dining tables, median of 12', FELLA),
    p(17795, 'BoConcept rectangular dining tables, median of 9 (from RM6,145)', BOC('tables/dining-tables/rectangular')),
  ),
  diningChair: band(
    b(156, 'IKEA dining chairs, median of 24 (SKÅLSTA RM145)', IKEA('dining-chairs-25219')),
    md(1249, 'Fella Design chairs, median of 14 (MUJI MY walnut dining sofa chair RM1,499)', FELLA),
    p(4295, 'BoConcept dining chairs, median of 24 (Hamilton RM1,195)', BOC('chairs/dining-chairs')),
  ),
  sideboard: band(
    b(894, 'IKEA sideboards, median of 24 (HAUGA RM890)', IKEA('sideboards-buffets-console-tables-30454')),
    md(2749, 'Fella Design cabinets / sideboards, median of 12', FELLA),
    p(9895, 'BoConcept storage, median of 24', BOC('storage')),
  ),
  bedQueen: band(
    b(799, 'IKEA queen/king bed frames, median of 24 (STJÄRNÖ RM799)', IKEA('queen-and-king-size-beds-frame-16284')),
    md(3299, 'Fella Design bed frames, median of 7', FELLA),
    p(14320, 'BoConcept beds, median of 8 (Element bed from RM7,995)', BOC('beds')),
  ),
  bedSingle: band(
    b(749, 'IKEA single beds, median of 24 (HEMNES RM699)', IKEA('single-beds-16285')),
    md(Math.round(3299 * 0.7), 'Derived: 70% of Fella queen median', FELLA, true),
    p(Math.round(14320 * 0.7), 'Derived: 70% of BoConcept bed median', BOC('beds'), true),
  ),
  bedside: band(
    b(174, 'IKEA bedside tables, median of 24 (BRIMNES RM169)', IKEA('bedside-tables-20656')),
    md(1359, 'Fella Design night stands, median of 5', FELLA),
    p(2870, 'BoConcept bedside tables, median of 8 (Element RM1,495)', BOC('tables/bedside-tables')),
  ),
  wardrobe: band(
    b(749, 'IKEA wardrobes, median of 24 (RAKKESTAD 3-door RM699)', IKEA('wardrobes-19053')),
    md(2800, 'IKEA wardrobe systems, top of range (no Fella wardrobes listed)', IKEA('wardrobes-19053')),
    p(9895, 'BoConcept storage, median of 24 (closest premium storage reference)', BOC('storage'), true),
  ),
  dresser: band(
    b(524, 'IKEA dressing tables, median of 18 (NORDKISA RM499)', IKEA('dressing-tables-20657')),
    md(3618, 'Fella Design dressers, median of 4', FELLA),
    p(9895, 'BoConcept storage, median (Element dresser)', BOC('storage'), true),
  ),
  desk: band(
    b(399, 'IKEA desks, median of 24 (MICKE RM399)', IKEA('desks-for-home-20651')),
    md(3149, 'Fella Design home office desks, median of 2', FELLA),
    p(6945, 'BoConcept desks, median of 3 (Cupertino)', BOC('tables/desks')),
  ),
  bookshelf: band(
    b(429, 'IKEA bookcases, median of 24 (BILLY RM419)', IKEA('bookcases-10382')),
    md(3369, 'Fella Design bookcases, median of 2', FELLA),
    p(9895, 'BoConcept storage, median of 24', BOC('storage'), true),
  ),
  shoeCabinet: band(
    b(249, 'IKEA shoe cabinets, median of 24 (BISSA RM199)', IKEA('shoe-cabinets-10456')),
    md(899, 'IKEA shoe cabinets, top of range (no Fella listing)', IKEA('shoe-cabinets-10456'), true),
    p(1495, 'BoConcept storage, entry price (Element night stand)', BOC('storage'), true),
  ),
};

/**
 * Price at a style tier (0 budget .. 1 mid .. 2 premium), interpolated on a log scale
 * so a tier step is a consistent percentage, then rounded to a retail-looking figure.
 */
export function priceAtTier(bandOrPrices: Pick<PriceBand, 'budget' | 'mid' | 'premium'>, tier: number): number {
  const { budget, mid, premium } = bandOrPrices;
  const t = Math.max(0, Math.min(2, tier));
  const [lo, hi, k] = t <= 1 ? [budget, mid, t] : [mid, premium, t - 1];
  return retailRound(Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * k));
}

/** Round to prices that end the way Malaysian retail prices do: RM49, RM899, RM2,449. */
export function retailRound(v: number): number {
  if (v < 100) return Math.max(9, Math.round(v / 5) * 5 - 1);
  if (v < 1000) return Math.round(v / 10) * 10 - 1;
  return Math.round(v / 50) * 50 - 1;
}

export const SHARED_SOURCES = {
  courtsTv: { note: 'Courts MY TVs: LG 55" UHD RM1,839; Samsung 65" Frame RM6,499', url: COURTS('tv-home-theatre/tv') },
  courtsFan: { note: 'Courts MY: Khind 56" DC ceiling fan with light RM335-339', url: COURTS('home-appliances/fan') },
  courtsFridge: { note: 'Courts MY: LG 2-door 330L RM2,159; Hisense side-by-side 660L RM2,899', url: COURTS('home-appliances/refrigeration') },
  courtsAircon: { note: 'Courts MY: LG 1hp inverter split RM1,199; LG 1.5hp RM1,349', url: COURTS('home-appliances/air-cooling') },
  courtsWasher: { note: 'Courts MY: Hisense front-load 9.5kg RM1,299; Electrolux 11kg RM3,399', url: COURTS('home-appliances/washer-dryer') },
  hob: { note: 'Senheng MY: Electrolux 90cm gas hob RM1,279; Mudah: Elba 2-burner built-in hob RM699-745', url: 'https://www.senheng.com.my/kitchen-appliances/cooking/cooker-hobs.html?brand=7' },
  hood: { note: 'Lowyat forum (2025): Rubine RCH-Monza-X hood RM1,350', url: 'https://forum.lowyat.net/topic/3080382' },
  kitchenCabinet: { note: 'Qanvast MY: kitchen cabinets (base + wall) RM545-720 per foot run; IKEA METOD base cabinet RM510', url: 'https://qanvast.com/my/articles/how-much-does-it-cost-to-renovate-in-malaysia-928' },
  wc: { note: 'Lapasar MY: Sorento one-piece water closet RM1,557.60', url: 'https://mall.lapasar.com/products/sorento-sorento-washdown-flushing-technology-toilet-bowl-srtwc8318-rl-one-piece-water-closet-bathroom-accessories-malaysia/193101' },
  vanity: { note: 'IKEA MY wash stands: HEMNES / HAVBÄCK RM895, up to RM2,144', url: IKEA('bathroom-vanities-20719') },
  showerScreen: { note: 'Mudah MY installer: frameless tempered glass screen RM1,800 per 5x6 ft set (RM70/sq ft)', url: 'https://www.mudah.my/pasang-glass-skrin-mandian-l-shower-glass-panel-114590149.htm' },
  mirror: { note: 'IKEA MY mirrors, median of 24 (LINDBYN RM149), up to RM569', url: IKEA('mirrors-20489') },
  curtains: { note: 'Qanvast MY: ready-made sets RM100-400; custom day + night curtains RM500-1,500 per window', url: 'https://qanvast.com/my/articles/which-should-you-get-curtains-or-blinds-1496' },
  mattress: { note: 'IKEA MY pocket-sprung mattresses, median RM1,199 (VÅGSTRANDA RM1,499); Fella Design Cloud series median RM2,159', url: IKEA('spring-mattresses-24828') },
  taskChair: { note: 'IKEA MY office chairs: median RM648 (MARKUS RM599), from RM249', url: IKEA('desk-chairs-for-home-20653') },
  deskLamp: { note: 'IKEA MY work lamps RM19-85 (TERTIAL RM59); lamps up to RM399', url: IKEA('lamps-li002') },
  bench: { note: 'IKEA MY MACKAPÄR storage bench RM299; Fella Design benches median RM999; MUJI MY oak bench RM1,099', url: FELLA },
  drying: { note: 'IKEA MY JOSTEIN shelving with drying rack RM230', url: IKEA('drying-racks-20602') },
  outdoor: { note: 'IKEA MY NÄMMARÖ easy chair RM385; BoConcept Cancún outdoor median RM1,745', url: BOC('outdoor-furniture') },
  plants: { note: 'IKEA MY plants and pots, up to RM219; larger live plants are an estimate', url: IKEA('outdoor-pots-plants-31787') },
  estimate: { note: 'No Malaysian listing found; estimated relative to the nearest sourced category' },
} as const;
