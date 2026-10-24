// The Ruang catalogue: invented products with prices placed inside real Malaysian
// retail bands (see pricing.ts). Style furniture is priced from its style's tier;
// shared items (appliances, sanitary ware, plants, lighting) quote a specific listing.

import type { RoomId } from '../plan/types';
import { MATERIALS, type MaterialId } from './materials';
import { BANDS, priceAtTier, retailRound, SHARED_SOURCES, type CategoryId } from './pricing';
import { STYLES, STYLE_ORDER, type StyleId } from './styles';
import type { CatalogueItem, ModelSource } from './types';

type Size = [w: number, d: number, h: number];

const DEFAULT_ROOMS: Partial<Record<CategoryId, RoomId[]>> = {
  sofa: ['living'], loungeChair: ['living', 'bedroom1', 'balcony'], coffeeTable: ['living'], sideTable: ['living', 'bedroom1'],
  tvConsole: ['living', 'bedroom1'], rug: ['living', 'dining', 'bedroom1', 'bedroom2'], floorLamp: ['living', 'bedroom1', 'study'],
  diningTable: ['dining'], diningChair: ['dining', 'study'], pendant: ['dining', 'living', 'kitchen'], sideboard: ['dining', 'living'],
  bedQueen: ['bedroom1'], bedSingle: ['bedroom2', 'study'], bedside: ['bedroom1', 'bedroom2'], wardrobe: ['bedroom1', 'bedroom2'],
  dresser: ['bedroom1', 'bedroom2'], tableLamp: ['bedroom1', 'bedroom2', 'living', 'study'], desk: ['study', 'bedroom2'],
  bookshelf: ['study', 'living', 'bedroom2'], shoeCabinet: ['dining', 'foyer'],
};

const PARAMETRIC: Partial<Record<CategoryId, string>> = {
  sofa: 'sofa', loungeChair: 'armchair', coffeeTable: 'table-low', sideTable: 'table-side', tvConsole: 'cabinet-low', rug: 'rug',
  floorLamp: 'lamp-floor', diningTable: 'table-dining', diningChair: 'chair-dining', pendant: 'lamp-pendant', sideboard: 'cabinet-low',
  bedQueen: 'bed', bedSingle: 'bed', bedside: 'cabinet-small', wardrobe: 'wardrobe', dresser: 'table-desk', tableLamp: 'lamp-table',
  desk: 'table-desk', bookshelf: 'shelf', shoeCabinet: 'cabinet-low',
};

const deltas = (base: number, finishes: MaterialId[]) => {
  const f0 = MATERIALS[finishes[0]!].priceFactor;
  return finishes.map((material) => ({ material, deltaMYR: Math.round((base * (MATERIALS[material].priceFactor / f0 - 1)) / 10) * 10 }));
};

const fmt = (n: number) => `RM${n.toLocaleString('en-MY')}`;

interface Opts {
  mount?: CatalogueItem['mount'];
  model?: ModelSource;
  rooms?: RoomId[];
  /** Nudges this piece above or below its style's tier, e.g. a statement piece. */
  tierShift?: number;
  variants?: { label: string; w: number; d: number; factor: number }[];
}

/** A style-specific piece priced from its category band at the style's tier. */
function styled(style: StyleId, category: CategoryId, id: string, name: string, [w, d, h]: Size, finishes: MaterialId[], description: string, o: Opts = {}): CatalogueItem {
  const band = BANDS[category]!;
  const s = STYLES[style];
  const tier = s.tier + (o.tierShift ?? 0);
  const priceMYR = priceAtTier(band, tier);
  return {
    id: `${style}-${id}`,
    name,
    brand: s.brand,
    category,
    styles: [style],
    rooms: o.rooms ?? DEFAULT_ROOMS[category] ?? [],
    size: { w, d, h },
    mount: o.mount ?? 'floor',
    priceMYR,
    finishes: deltas(priceMYR, finishes),
    variants: o.variants?.map((v) => ({ label: v.label, w: v.w, d: v.d, priceMYR: retailRound(priceMYR * v.factor) })),
    model: o.model ?? { kind: 'parametric', generator: PARAMETRIC[category] ?? category },
    priceBasis: `Band ${fmt(band.budget)} (IKEA) / ${fmt(band.mid)} (mid) / ${fmt(band.premium)} (BoConcept); ${s.brand} sits at tier ${tier.toFixed(2)}`,
    description,
  };
}

/** A shared piece that quotes a specific listing (or an estimate). */
function shared(category: CategoryId, id: string, name: string, brand: string, priceMYR: number, [w, d, h]: Size, rooms: RoomId[], finishes: MaterialId[], basis: keyof typeof SHARED_SOURCES, description: string, o: Opts & { styles?: StyleId[] } = {}): CatalogueItem {
  return {
    id,
    name,
    brand,
    category,
    styles: o.styles ?? STYLE_ORDER,
    rooms,
    size: { w, d, h },
    mount: o.mount ?? 'floor',
    priceMYR,
    finishes: deltas(priceMYR, finishes),
    variants: o.variants?.map((v) => ({ label: v.label, w: v.w, d: v.d, priceMYR: retailRound(priceMYR * v.factor) })),
    model: o.model ?? { kind: 'parametric', generator: category },
    priceBasis: SHARED_SOURCES[basis].note,
    description,
  };
}

const ph = (id: string): ModelSource => ({ kind: 'polyhaven', id });
const RUG_SIZES = [
  { label: '160 × 230 cm', w: 1600, d: 2300, factor: 0.6 },
  { label: '200 × 300 cm', w: 2000, d: 3000, factor: 1 },
];
const KITCHEN_WIDTHS = [
  { label: '30 cm', w: 300, d: 600, factor: 0.6 },
  { label: '40 cm', w: 400, d: 600, factor: 0.75 },
  { label: '60 cm', w: 600, d: 600, factor: 1 },
  { label: '80 cm', w: 800, d: 600, factor: 1.2 },
];
const WARDROBE_WIDTHS = (d: number) => [
  { label: '120 cm', w: 1200, d, factor: 0.7 },
  { label: '180 cm', w: 1800, d, factor: 1 },
  { label: '240 cm', w: 2400, d, factor: 1.3 },
];

const STYLE_ITEMS: CatalogueItem[] = [
  // ---------- Muji-inspired Natural · Kinari Living ----------
  styled('muji', 'sofa', 'sofa', 'Hinata 3-Seat Sofa', [2000, 880, 780], ['cottonWhite', 'linenOat', 'linenCharcoal'], 'Low oak frame, loose washed-cotton covers you can take off and wash.'),
  styled('muji', 'loungeChair', 'lounge', 'Hinata Lounge Chair', [700, 780, 740], ['linenOat', 'cottonWhite', 'linenCharcoal'], 'Matching single seat with a slim oak frame.'),
  styled('muji', 'coffeeTable', 'coffee', 'Kinari Oak Coffee Table', [1100, 550, 350], ['oakLight', 'ashWhite', 'walnut'], 'Solid oak top with a lower shelf for magazines.'),
  styled('muji', 'sideTable', 'side', 'Kinari Side Table', [550, 450, 550], ['oakLight'], 'Two-tier oak side table.', { model: ph('side_table_01') }),
  styled('muji', 'tvConsole', 'media', 'Kinari Low Media Unit', [1800, 400, 450], ['oakLight', 'ashWhite'], 'Modular oak unit; cables hide behind sliding doors.'),
  styled('muji', 'rug', 'rug', 'Kapas Cotton Rug', [2000, 3000, 10], ['cottonWhite', 'jute', 'linenOat'], 'Flat-woven cotton, washable.', { variants: RUG_SIZES }),
  styled('muji', 'floorLamp', 'floorlamp', 'Kertas Paper Floor Lamp', [400, 400, 1500], ['washi', 'cottonWhite'], 'Paper shade on an oak stem; soft, warm spread.'),
  styled('muji', 'diningTable', 'dining', 'Kinari Oak Dining Table 160', [1600, 850, 720], ['oakLight', 'ashWhite', 'walnut'], 'Seats four to six.'),
  styled('muji', 'diningChair', 'chair', 'Kinari Dining Chair', [450, 520, 780], ['oakLight', 'ashWhite'], 'Light oak with a curved back rail.'),
  styled('muji', 'pendant', 'pendant', 'Kertas Paper Pendant Ø50', [500, 500, 350], ['washi', 'cottonWhite'], 'Pleated paper shade.', { mount: 'ceiling' }),
  styled('muji', 'sideboard', 'sideboard', 'Kinari Sideboard 160', [1600, 420, 750], ['oakLight', 'ashWhite'], 'Four doors, adjustable shelves.'),
  styled('muji', 'bedQueen', 'bedq', 'Kinari Platform Bed (Queen)', [1620, 2080, 700], ['oakLight', 'ashWhite', 'walnut'], 'Low oak platform with a slim headboard.'),
  styled('muji', 'bedSingle', 'beds', 'Kinari Bed (Super Single)', [1130, 2080, 700], ['oakLight', 'ashWhite'], 'The same platform, sized for the second bedroom.'),
  styled('muji', 'bedside', 'bedside', 'Kinari Bedside Table', [400, 350, 450], ['oakLight', 'ashWhite'], 'One drawer, open shelf.'),
  styled('muji', 'wardrobe', 'wardrobe', 'Kinari Wardrobe', [1800, 600, 2200], ['ashWhite', 'oakLight', 'lacquerWhite'], 'Hinged doors, hanging rail and shelves.', { variants: WARDROBE_WIDTHS(600) }),
  styled('muji', 'dresser', 'bureau', 'Kinari Writing Bureau', [1000, 450, 750], ['oakLight'], 'Doubles as a dressing table.'),
  styled('muji', 'tableLamp', 'tablelamp', 'Kertas Table Lamp', [250, 250, 400], ['washi'], 'Small paper lantern lamp.', { mount: 'surface' }),
  styled('muji', 'desk', 'desk', 'Kinari Desk 140', [1400, 650, 720], ['oakLight', 'ashWhite'], 'Oak desk with a cable tray.'),
  styled('muji', 'bookshelf', 'shelf', 'Kinari Open Shelf', [860, 350, 1750], ['oakLight', 'ashWhite'], 'Stackable open shelving.'),
  styled('muji', 'shoeCabinet', 'shoes', 'Kinari Shoe Cabinet', [900, 350, 1000], ['ashWhite', 'oakLight'], 'Slatted doors for ventilation.'),

  // ---------- Japanese · Washitsu Atelier ----------
  styled('japanese', 'sofa', 'sofa', 'Engawa Low Sofa', [2100, 900, 650], ['linenStone', 'linenCharcoal', 'cottonWhite'], 'Seat at 30 cm, close to the floor like an engawa veranda.'),
  styled('japanese', 'loungeChair', 'lounge', 'Zaisu Floor Chair', [550, 650, 450], ['linenStone', 'linenCharcoal', 'velvetMoss'], 'Legless chair with a backrest, for floor-level sitting.'),
  styled('japanese', 'coffeeTable', 'coffee', 'Chabudai Round Low Table', [900, 900, 330], ['hinoki', 'smokedOak', 'blackOak'], 'Round low table at sitting height from the floor.'),
  styled('japanese', 'sideTable', 'side', 'Ishi Side Stool', [450, 310, 310], ['smokedOak'], 'Rough-hewn wooden stool used as a side table.', { model: ph('wooden_stool_02') }),
  styled('japanese', 'tvConsole', 'media', 'Tansu Media Chest', [1800, 420, 500], ['smokedOak', 'hinoki', 'blackOak'], 'Chest-of-drawers detailing with iron pulls.'),
  styled('japanese', 'rug', 'rug', 'Igusa Rush Rug', [2000, 3000, 12], ['tatami', 'jute'], 'Woven rush grass, cool underfoot.', { variants: RUG_SIZES }),
  styled('japanese', 'floorLamp', 'floorlamp', 'Andon Floor Lamp', [300, 300, 1100], ['washi', 'hinoki'], 'Hinoki frame wrapped in washi.'),
  styled('japanese', 'diningTable', 'dining', 'Hinoki Dining Table 160', [1600, 850, 700], ['hinoki', 'smokedOak'], 'Lower than usual, at 70 cm.'),
  styled('japanese', 'diningChair', 'chair', 'Kumiko Dining Chair', [460, 500, 760], ['smokedOak', 'hinoki'], 'Lattice backrest inspired by kumiko joinery.'),
  styled('japanese', 'pendant', 'pendant', 'Chōchin Lantern Pendant', [400, 400, 500], ['washi'], 'Collapsible paper lantern on a bamboo frame.', { mount: 'ceiling' }),
  styled('japanese', 'sideboard', 'sideboard', 'Kaidan Step Chest', [1500, 420, 900], ['smokedOak', 'hinoki'], 'Stepped storage chest after kaidan-dansu.'),
  styled('japanese', 'bedQueen', 'bedq', 'Futon Platform Bed (Queen)', [1700, 2150, 350], ['hinoki', 'smokedOak'], 'Slatted hinoki platform for a thick futon.'),
  styled('japanese', 'bedSingle', 'beds', 'Futon Platform Bed (Super Single)', [1200, 2150, 350], ['hinoki', 'smokedOak'], 'Single-width platform.'),
  styled('japanese', 'bedside', 'bedside', 'Bonsai Bedside Tray', [450, 450, 250], ['hinoki', 'smokedOak'], 'Low tray table for floor-level beds.'),
  styled('japanese', 'wardrobe', 'wardrobe', 'Shoji Sliding Wardrobe', [1800, 650, 2200], ['washi', 'hinoki', 'smokedOak'], 'Sliding doors with washi panels in a hinoki frame.', { variants: WARDROBE_WIDTHS(650) }),
  styled('japanese', 'dresser', 'vanity', 'Kyōdai Floor Vanity', [800, 400, 400], ['smokedOak', 'hinoki'], 'Floor-level vanity with a folding mirror.'),
  styled('japanese', 'tableLamp', 'tablelamp', 'Andon Table Lamp', [200, 200, 350], ['washi', 'hinoki'], 'Small andon for bedside or tokonoma.', { mount: 'surface' }),
  styled('japanese', 'desk', 'desk', 'Hinoki Writing Desk 120', [1200, 600, 720], ['hinoki', 'smokedOak'], 'Simple four-leg desk.'),
  styled('japanese', 'bookshelf', 'shelf', 'Kumiko Shelf', [900, 350, 1600], ['hinoki', 'smokedOak'], 'Open shelf with lattice side panels.'),
  styled('japanese', 'shoeCabinet', 'shoes', 'Genkan Shoe Cabinet', [900, 380, 1050], ['smokedOak', 'hinoki'], 'Entry cabinet with a bench-height top.'),

  // ---------- Brutalist · Monolith & Form ----------
  styled('brutalist', 'sofa', 'sofa', 'Slab 3-Seat Sofa', [2200, 950, 700], ['leatherBlack', 'leatherCognac', 'woolGrey'], 'Blocky modules on a recessed plinth.'),
  styled('brutalist', 'loungeChair', 'lounge', 'Cast Lounge Chair', [820, 990, 1020], ['leatherBlack'], 'Solid wood frame with black leather cushions.', { model: ph('modern_arm_chair_01') }),
  styled('brutalist', 'coffeeTable', 'coffee', 'Monolith Coffee Table', [1200, 600, 390], ['concreteRaw'], 'Cast concrete top on angled oak legs.', { model: ph('modern_coffee_table_01') }),
  styled('brutalist', 'sideTable', 'side', 'Block Side Table', [400, 400, 480], ['concreteRaw', 'concreteDark', 'steelBlack'], 'Solid cube; heavy enough to stay put.'),
  styled('brutalist', 'tvConsole', 'media', 'Plinth Media Bench', [2000, 450, 400], ['concreteDark', 'blackOak', 'walnut'], 'Long low plinth, open at both ends.'),
  styled('brutalist', 'rug', 'rug', 'Ash Wool Rug', [2000, 3000, 14], ['woolGrey', 'linenCharcoal'], 'Felted wool, tonal grey.', { variants: RUG_SIZES }),
  styled('brutalist', 'floorLamp', 'floorlamp', 'Pillar Floor Lamp', [250, 250, 1600], ['concreteRaw', 'steelBlack'], 'Up-lighter that grazes the walls.'),
  styled('brutalist', 'diningTable', 'dining', 'Monolith Dining Table 180', [1800, 900, 740], ['concreteRaw', 'concreteDark', 'walnut'], 'Concrete top on two slab legs.'),
  styled('brutalist', 'diningChair', 'chair', 'Frame Dining Chair', [480, 540, 780], ['leatherBlack', 'leatherCognac', 'woolGrey'], 'Tubular steel frame with a leather sling seat.'),
  styled('brutalist', 'pendant', 'pendant', 'Dome Pendant', [430, 430, 950], ['stonewareMatte'], 'Wide dome shade with a metal canopy.', { mount: 'ceiling', model: ph('modern_ceiling_lamp_01') }),
  styled('brutalist', 'sideboard', 'sideboard', 'Plinth Sideboard', [1800, 450, 700], ['blackOak', 'concreteDark'], 'Push-to-open doors on a concrete plinth.'),
  styled('brutalist', 'bedQueen', 'bedq', 'Slab Bed (Queen)', [1700, 2150, 900], ['blackOak', 'walnut', 'woolGrey'], 'Platform with a full-width slab headboard.'),
  styled('brutalist', 'bedSingle', 'beds', 'Slab Bed (Super Single)', [1200, 2150, 900], ['blackOak', 'walnut'], 'Single version of the Slab bed.'),
  styled('brutalist', 'bedside', 'bedside', 'Block Bedside', [450, 400, 450], ['concreteRaw', 'blackOak'], 'Cube with a single drawer.'),
  styled('brutalist', 'wardrobe', 'wardrobe', 'Plinth Wardrobe', [1800, 620, 2400], ['blackOak', 'concreteDark', 'walnut'], 'Floor-to-near-ceiling, recessed pulls.', { variants: WARDROBE_WIDTHS(620) }),
  styled('brutalist', 'dresser', 'vanity', 'Block Vanity Desk', [1100, 450, 750], ['concreteDark', 'blackOak'], 'Cantilevered top on a block drawer unit.'),
  styled('brutalist', 'tableLamp', 'tablelamp', 'Pillar Table Lamp', [180, 180, 450], ['concreteRaw', 'steelBlack'], 'Cast concrete base, linen shade.', { mount: 'surface' }),
  styled('brutalist', 'desk', 'desk', 'Slab Desk 160', [1600, 700, 740], ['concreteDark', 'walnut', 'steelBlack'], 'Thick top on steel trestles.'),
  styled('brutalist', 'bookshelf', 'shelf', 'Frame Steel Shelf', [590, 500, 2140], ['steelBlack'], 'Black steel frame with timber shelves.', { model: ph('steel_frame_shelves_02') }),
  styled('brutalist', 'shoeCabinet', 'shoes', 'Plinth Shoe Cabinet', [1000, 380, 900], ['blackOak', 'concreteDark'], 'Matches the Plinth sideboard.'),

  // ---------- Minimalist · Garis Studio ----------
  styled('minimal', 'sofa', 'sofa', 'Garis 3-Seat Sofa', [2100, 900, 760], ['linenStone', 'woolGrey', 'cottonWhite'], 'Clean box arms, tight seat, slim legs.'),
  styled('minimal', 'loungeChair', 'lounge', 'Garis Armchair', [720, 780, 760], ['woolGrey', 'linenStone'], 'Matching armchair.'),
  styled('minimal', 'coffeeTable', 'coffee', 'Garis Coffee Table', [1200, 600, 350], ['lacquerWhite', 'oakLight', 'lacquerCharcoal'], 'Two nesting rectangles.'),
  styled('minimal', 'sideTable', 'side', 'Dot Side Table', [420, 420, 500], ['lacquerWhite', 'lacquerCharcoal', 'oakLight'], 'Round, single pedestal.'),
  styled('minimal', 'tvConsole', 'media', 'Garis Floating Console', [2000, 380, 300], ['lacquerWhite', 'lacquerGreige', 'oakLight'], 'Wall-hung, handleless, hides the router.', { mount: 'wall' }),
  styled('minimal', 'rug', 'rug', 'Plain Weave Rug', [2000, 3000, 10], ['linenStone', 'cottonWhite'], 'One colour, fine flat weave.', { variants: RUG_SIZES }),
  styled('minimal', 'floorLamp', 'floorlamp', 'Stick Floor Lamp', [220, 220, 1700], ['aluminiumWhite', 'steelBlack'], 'A single LED line.'),
  styled('minimal', 'diningTable', 'dining', 'Garis Dining Table 160', [1600, 850, 740], ['lacquerWhite', 'oakLight'], 'Thin top, four square legs.'),
  styled('minimal', 'diningChair', 'chair', 'Garis Dining Chair', [450, 500, 800], ['oakLight', 'lacquerWhite', 'lacquerCharcoal'], 'Stackable moulded-ply seat.'),
  styled('minimal', 'pendant', 'pendant', 'Disc Pendant', [600, 600, 80], ['aluminiumWhite', 'steelBlack'], 'Flat disc with a diffused LED face.', { mount: 'ceiling' }),
  styled('minimal', 'sideboard', 'sideboard', 'Garis Sideboard 180', [1800, 420, 700], ['lacquerWhite', 'lacquerGreige'], 'Push-latch doors, no handles.'),
  styled('minimal', 'bedQueen', 'bedq', 'Garis Storage Bed (Queen)', [1600, 2100, 950], ['linenStone', 'woolGrey', 'cottonWhite'], 'Upholstered, with a gas-lift storage base.'),
  styled('minimal', 'bedSingle', 'beds', 'Garis Storage Bed (Super Single)', [1150, 2100, 950], ['linenStone', 'cottonWhite'], 'Single version with storage.'),
  styled('minimal', 'bedside', 'bedside', 'Garis Floating Bedside', [450, 350, 150], ['lacquerWhite', 'oakLight'], 'Wall-hung drawer.', { mount: 'wall' }),
  styled('minimal', 'wardrobe', 'wardrobe', 'Garis Handleless Wardrobe', [1800, 600, 2600], ['lacquerWhite', 'lacquerGreige', 'oakLight'], 'Full height, reads as a wall.', { variants: WARDROBE_WIDTHS(600) }),
  styled('minimal', 'dresser', 'vanity', 'Garis Wall Vanity', [1000, 400, 200], ['lacquerWhite', 'oakLight'], 'Wall-hung desk-vanity with a flip mirror.', { mount: 'wall' }),
  styled('minimal', 'tableLamp', 'tablelamp', 'Dot Table Lamp', [200, 200, 300], ['lacquerWhite', 'lacquerCharcoal'], 'Opal glass sphere.', { mount: 'surface' }),
  styled('minimal', 'desk', 'desk', 'Garis Desk 140', [1400, 650, 740], ['lacquerWhite', 'oakLight'], 'Hidden drawer under the top.'),
  styled('minimal', 'bookshelf', 'shelf', 'Garis Wall Shelf System', [1600, 300, 1800], ['lacquerWhite', 'oakLight'], 'Concealed brackets.', { mount: 'wall' }),
  styled('minimal', 'shoeCabinet', 'shoes', 'Garis Shoe Cabinet', [1000, 350, 1100], ['lacquerWhite', 'lacquerGreige'], 'Wall-hung with a toe-kick light.', { mount: 'wall' }),

  // ---------- Quiet Luxury · Maison Tenang ----------
  styled('quietLuxury', 'sofa', 'sofa', 'Senja Bouclé Sofa', [2300, 1000, 720], ['boucleIvory', 'boucleSand', 'linenOat'], 'Deep, low seat with feather-wrapped cushions.'),
  styled('quietLuxury', 'loungeChair', 'lounge', 'Senja Lounge Chair & Ottoman', [1010, 1190, 1170], ['leatherCognac'], 'Cognac leather shell on a swivel base.', { model: ph('mid_century_lounge_chair') }),
  styled('quietLuxury', 'coffeeTable', 'coffee', 'Batu Travertine Coffee Table', [1200, 700, 320], ['travertine', 'marbleWhite', 'walnut'], 'Honed travertine block with softened edges.'),
  styled('quietLuxury', 'sideTable', 'side', 'Batu Round Side Table', [550, 550, 480], ['marbleWhite', 'travertine'], 'Stone top on a sculpted brass pedestal.'),
  styled('quietLuxury', 'coffeeTable', 'coffee-round', 'Batu Round Marble Coffee Table', [1300, 1300, 490], ['marbleWhite'], 'Round marble top on a sculpted base; a softer alternative to the travertine block.', { model: ph('coffee_table_round_01'), tierShift: 0.1 }),
  styled('quietLuxury', 'tvConsole', 'media', 'Tenang Fluted Console', [2000, 450, 550], ['walnut', 'lacquerGreige'], 'Fluted walnut doors, brass pulls.'),
  styled('quietLuxury', 'rug', 'rug', 'Senja Wool-Silk Rug', [2500, 3500, 14], ['boucleIvory', 'boucleSand'], 'Hand-tufted, tone-on-tone.', { variants: [{ label: '200 × 300 cm', w: 2000, d: 3000, factor: 0.7 }, { label: '250 × 350 cm', w: 2500, d: 3500, factor: 1 }] }),
  styled('quietLuxury', 'floorLamp', 'floorlamp', 'Senja Linen Floor Lamp', [450, 450, 1650], ['linenOat', 'brassBrushed'], 'Pleated linen drum on a brass stem.'),
  styled('quietLuxury', 'diningTable', 'dining', 'Batu Travertine Dining Table 200', [2000, 950, 740], ['travertine', 'walnut', 'marbleWhite'], 'Stone top on twin pedestal bases.'),
  styled('quietLuxury', 'diningChair', 'chair', 'Senja Upholstered Dining Chair', [520, 580, 800], ['boucleIvory', 'boucleSand', 'linenOat'], 'Curved back, walnut legs.'),
  styled('quietLuxury', 'pendant', 'pendant', 'Senja Alabaster Pendant', [450, 450, 300], ['alabaster', 'brassBrushed'], 'Carved alabaster bowl on a brass rod.', { mount: 'ceiling' }),
  styled('quietLuxury', 'sideboard', 'sideboard', 'Tenang Fluted Sideboard', [2440, 520, 680], ['walnut'], 'Slatted walnut fronts.', { model: ph('modern_wooden_cabinet') }),
  styled('quietLuxury', 'bedQueen', 'bedq', 'Senja Upholstered Bed (Queen)', [1800, 2200, 1200], ['boucleIvory', 'linenOat', 'boucleSand'], 'Tall channel-tufted headboard.'),
  styled('quietLuxury', 'bedSingle', 'beds', 'Senja Upholstered Bed (Super Single)', [1250, 2200, 1100], ['boucleIvory', 'linenOat'], 'Single version of the Senja bed.'),
  styled('quietLuxury', 'bedside', 'bedside', 'Tenang Bedside', [500, 400, 520], ['walnut', 'travertine'], 'Walnut drawer with a stone top.'),
  styled('quietLuxury', 'wardrobe', 'wardrobe', 'Tenang Fluted Wardrobe', [1800, 620, 2400], ['walnut', 'lacquerGreige', 'glassFluted'], 'Fluted doors, interior lighting.', { variants: WARDROBE_WIDTHS(620) }),
  styled('quietLuxury', 'dresser', 'vanity', 'Tenang Dressing Table', [1200, 450, 760], ['walnut', 'travertine'], 'With a round brass-framed mirror.'),
  styled('quietLuxury', 'tableLamp', 'tablelamp', 'Senja Ceramic Lamp', [350, 350, 600], ['stonewareMatte', 'brassBrushed'], 'Glazed stoneware base, linen shade.', { mount: 'surface' }),
  styled('quietLuxury', 'desk', 'desk', 'Tenang Walnut Desk 150', [1500, 700, 750], ['walnut', 'smokedOak'], 'Leather-inlaid writing surface.'),
  styled('quietLuxury', 'bookshelf', 'shelf', 'Tenang Display Shelf', [1000, 380, 2000], ['walnut', 'brassBrushed'], 'Walnut shelves on brass uprights.'),
  styled('quietLuxury', 'shoeCabinet', 'shoes', 'Tenang Shoe Cabinet', [1000, 400, 1000], ['walnut', 'glassFluted'], 'Fluted glass doors.'),
];

const SHARED_ITEMS: CatalogueItem[] = [
  // Electronics and climate
  shared('tv', 'tv-55', 'Arus 55" 4K TV', 'Arus', 1839, [1230, 80, 720], ['living', 'bedroom1'], ['steelBlack'], 'courtsTv', 'Wall-mounted 55-inch UHD.', { mount: 'wall', styles: ['muji', 'japanese', 'minimal'] }),
  shared('tv', 'tv-65-frame', 'Arus 65" Art-Frame TV', 'Arus', 6499, [1450, 30, 830], ['living'], ['walnut', 'aluminiumWhite', 'steelBlack'], 'courtsTv', 'Hangs flush like a picture; shows art when off.', { mount: 'wall', styles: ['brutalist', 'quietLuxury'] }),
  shared('ceilingFan', 'fan-dc', 'Bayu 56" DC Ceiling Fan', 'Cahaya Lab', 339, [1460, 1460, 520], ['living', 'dining', 'bedroom1', 'bedroom2'], ['steelBlack'], 'courtsFan', 'Quiet DC motor with LED light.', { mount: 'ceiling', model: ph('ceiling_fan'), styles: ['brutalist', 'minimal'] }),
  shared('ceilingFan', 'fan-wood', 'Bayu Wood-Blade DC Fan', 'Cahaya Lab', 899, [1320, 1320, 430], ['living', 'dining', 'bedroom1', 'bedroom2'], ['oakLight', 'walnut', 'lacquerWhite'], 'estimate', 'Solid wood blades. Estimate: design fans sit above the RM279-339 DC range at Courts.', { mount: 'ceiling', styles: ['muji', 'japanese', 'quietLuxury'] }),
  shared('airCon', 'aircon-1hp', 'Arus 1.0hp Inverter Air-Conditioner', 'Arus', 1199, [800, 200, 290], ['bedroom1', 'bedroom2', 'study'], ['lacquerWhite'], 'courtsAircon', 'Wall split unit for bedrooms.', { mount: 'wall' }),
  shared('airCon', 'aircon-15hp', 'Arus 1.5hp Inverter Air-Conditioner', 'Arus', 1349, [900, 220, 300], ['living', 'dining'], ['lacquerWhite'], 'courtsAircon', 'Wall split unit for the living area.', { mount: 'wall' }),

  // Plants and decor
  shared('plant', 'plant-fig', 'Hijau Weeping Fig in Clay Pot', 'Hijau Goods', 259, [590, 630, 1350], ['living', 'dining', 'balcony'], ['stonewareMatte'], 'plants', 'Small indoor tree.', { model: ph('potted_plant_01') }),
  shared('plant', 'plant-philo', 'Hijau Philodendron in Clay Pot', 'Hijau Goods', 129, [700, 660, 840], ['living', 'bedroom1', 'study', 'balcony'], ['stonewareMatte'], 'plants', 'Broad heart-shaped leaves.', { model: ph('potted_plant_02') }),
  shared('plant', 'plant-succ', 'Hijau Haworthia Bowl', 'Hijau Goods', 39, [170, 190, 270], ['living', 'study', 'bedroom1', 'bedroom2'], ['stonewareMatte'], 'plants', 'Tabletop succulent.', { mount: 'surface', model: ph('potted_plant_04') }),
  shared('decor', 'vase', 'Hijau Stoneware Vase', 'Hijau Goods', 89, [200, 200, 400], ['living', 'dining', 'bedroom1'], ['porcelainWhite'], 'estimate', 'Gloss white vase.', { mount: 'surface', model: ph('ceramic_vase_01') }),
  shared('decor', 'books', 'Hijau Book Stack', 'Hijau Goods', 120, [550, 160, 240], ['living', 'study'], ['cottonWhite'], 'estimate', 'A row of books for shelves.', { mount: 'surface', model: ph('book_encyclopedia_set_01') }),
  shared('decor', 'print', 'Hijau Framed Print 60 × 80', 'Hijau Goods', 249, [600, 30, 800], ['living', 'dining', 'bedroom1', 'bedroom2', 'study'], ['oakLight', 'walnut', 'steelBlack'], 'estimate', 'Abstract print, timber frame.', { mount: 'wall' }),

  // Textiles
  shared('curtains', 'curtain-custom', 'Kain Day & Night Curtains', 'Kain House', 890, [2400, 150, 2600], ['living', 'bedroom1', 'bedroom2', 'study'], ['linenOat', 'cottonWhite', 'linenStone', 'linenCharcoal', 'velvetMoss'], 'curtains', 'Sheer plus blackout layer on a double track, made to measure.', {
    mount: 'window',
    variants: [
      { label: '110 cm track', w: 1100, d: 150, factor: 0.5 },
      { label: '240 cm track', w: 2400, d: 150, factor: 1 },
      { label: '290 cm track', w: 2900, d: 150, factor: 1.1 },
    ],
  }),
  shared('curtains', 'curtain-ready', 'Kain Ready-Made Curtain Pair', 'Kain House', 189, [1450, 120, 2500], ['bedroom2', 'study'], ['cottonWhite', 'linenStone'], 'curtains', 'Off-the-shelf pair with tab tops.', { mount: 'window' }),
  shared('mattress', 'mattress-q', 'Lena Pocket-Spring Mattress (Queen)', 'Lena Sleep', 1499, [1520, 1910, 250], ['bedroom1'], ['cottonWhite'], 'mattress', 'Medium-firm, 25 cm.', { mount: 'surface' }),
  shared('mattress', 'mattress-q-latex', 'Lena Latex Hybrid Mattress (Queen)', 'Lena Sleep', 2999, [1520, 1910, 300], ['bedroom1'], ['cottonWhite'], 'mattress', 'Latex comfort layer over pocket springs.', { mount: 'surface' }),
  shared('mattress', 'mattress-ss', 'Lena Pocket-Spring Mattress (Super Single)', 'Lena Sleep', 999, [1070, 1910, 250], ['bedroom2', 'study'], ['cottonWhite'], 'mattress', 'Super-single size.', { mount: 'surface' }),

  // Study
  shared('taskChair', 'chair-task', 'Garis Task Chair', 'Garis Studio', 349, [620, 620, 1000], ['study', 'bedroom2'], ['steelBlack', 'aluminiumWhite'], 'taskChair', 'Height-adjustable swivel chair.'),
  shared('taskChair', 'chair-ergo', 'Arus Ergo Mesh Chair', 'Arus', 799, [680, 680, 1150], ['study'], ['steelBlack'], 'taskChair', 'Mesh back with lumbar support.'),
  shared('deskLamp', 'lamp-arm', 'Cahaya Arm Lamp', 'Cahaya Lab', 59, [200, 610, 890], ['study', 'bedroom2'], ['steelStainless'], 'deskLamp', 'Spring-balanced work lamp.', { mount: 'surface', model: ph('desk_lamp_arm_01') }),
  shared('deskLamp', 'lamp-pillar-desk', 'Cahaya Pillar Desk Lamp', 'Cahaya Lab', 249, [150, 150, 420], ['study', 'bedroom1'], ['brassBrushed', 'steelBlack'], 'estimate', 'Dimmable, warm LED.', { mount: 'surface' }),

  // Entry
  shared('bench', 'bench-oak', 'Genkan Oak Bench', 'Kinari Living', 1099, [1000, 350, 450], ['foyer', 'dining', 'bedroom1'], ['oakLight', 'hinoki', 'walnut'], 'bench', 'Solid oak bench for putting on shoes.', { styles: ['muji', 'japanese', 'quietLuxury'] }),
  shared('bench', 'bench-storage', 'Garis Storage Bench', 'Garis Studio', 299, [800, 400, 450], ['foyer', 'dining'], ['lacquerWhite', 'oakLight'], 'bench', 'Lift-up seat with storage.', { styles: ['minimal', 'brutalist'] }),

  // Kitchen (modular, every module movable)
  shared('kitchenBase', 'k-base', 'Dapur Base Cabinet', 'Dapur Works', 849, [600, 600, 900], ['kitchen'], ['lacquerWhite', 'ashWhite', 'oakLight', 'smokedOak', 'walnut', 'concreteDark', 'lacquerSage'], 'kitchenCabinet', 'Doors and a shelf, worktop included. RM545-720 per foot run (base + wall) puts a 2 ft base at about RM850.', { variants: KITCHEN_WIDTHS }),
  shared('kitchenBase', 'k-drawer', 'Dapur Drawer Base', 'Dapur Works', 999, [600, 600, 900], ['kitchen'], ['lacquerWhite', 'ashWhite', 'oakLight', 'smokedOak', 'walnut', 'concreteDark', 'lacquerSage'], 'kitchenCabinet', 'Three soft-close drawers, worktop included.', { variants: KITCHEN_WIDTHS.filter((v) => v.w >= 400) }),
  shared('kitchenSink', 'k-sink-800', 'Dapur Sink Base 800', 'Dapur Works', 1499, [800, 600, 900], ['kitchen'], ['lacquerWhite', 'ashWhite', 'oakLight', 'smokedOak', 'walnut', 'concreteDark', 'lacquerSage'], 'kitchenCabinet', 'Undermount steel sink and mixer tap included.'),
  shared('kitchenWall', 'k-wall-600', 'Dapur Wall Cabinet 600', 'Dapur Works', 549, [600, 350, 700], ['kitchen'], ['lacquerWhite', 'ashWhite', 'oakLight', 'smokedOak', 'walnut', 'concreteDark', 'lacquerSage'], 'kitchenCabinet', 'Hung above the worktop.', { mount: 'wall' }),
  shared('kitchenTall', 'k-tall-600', 'Dapur Tall Pantry 600', 'Dapur Works', 1690, [600, 600, 2200], ['kitchen'], ['lacquerWhite', 'ashWhite', 'oakLight', 'smokedOak', 'walnut', 'concreteDark', 'lacquerSage'], 'kitchenCabinet', 'Floor-to-ceiling pantry with pull-outs.'),
  shared('hob', 'hob-2', 'Arus 2-Burner Glass Hob', 'Arus', 749, [780, 450, 50], ['kitchen'], ['glassClear'], 'hob', 'Built-in gas hob, set into a base cabinet.', { mount: 'surface' }),
  shared('hob', 'hob-3', 'Arus 90 cm 3-Burner Hob', 'Arus', 1279, [900, 500, 50], ['kitchen'], ['glassClear'], 'hob', 'Wide hob with a wok burner.', { mount: 'surface' }),
  shared('hood', 'hood-90', 'Arus Slim Chimney Hood 90', 'Arus', 1350, [900, 500, 700], ['kitchen'], ['steelStainless', 'steelBlack'], 'hood', 'Wall chimney hood, ducted out through the yard.', { mount: 'wall' }),
  shared('fridge', 'fridge-2d', 'Arus 2-Door Fridge 330L', 'Arus', 2159, [600, 650, 1720], ['kitchen', 'yard'], ['steelStainless', 'steelBlack', 'lacquerWhite'], 'courtsFridge', 'Bottom freezer, inverter.'),
  shared('fridge', 'fridge-sbs', 'Arus Side-by-Side Fridge 660L', 'Arus', 2899, [910, 700, 1780], ['kitchen'], ['steelBlack', 'steelStainless'], 'courtsFridge', 'Black glass doors.'),

  // Yard
  shared('washer', 'washer-95', 'Arus Front-Load Washer 9.5kg', 'Arus', 1299, [600, 600, 850], ['yard'], ['lacquerWhite'], 'courtsWasher', 'Inverter motor.'),
  shared('washer', 'washer-dryer', 'Arus Washer-Dryer 11kg', 'Arus', 3399, [600, 650, 850], ['yard'], ['lacquerWhite', 'steelBlack'], 'courtsWasher', 'Washes and dries in one drum.'),
  shared('dryingRack', 'rack', 'Arus Wall Drying Rack', 'Arus', 230, [800, 400, 80], ['yard', 'balcony'], ['steelStainless'], 'drying', 'Fold-down rails.', { mount: 'wall' }),

  // Bathrooms
  shared('wc', 'wc-onepiece', 'Mandi One-Piece WC', 'Mandi Works', 1559, [380, 700, 780], ['toilet1', 'toilet2'], ['porcelainWhite'], 'wc', 'Washdown flush with soft-close seat.'),
  shared('wc', 'wc-wallhung', 'Mandi Wall-Hung WC', 'Mandi Works', 2899, [360, 530, 400], ['toilet1', 'toilet2'], ['porcelainWhite', 'stonewareMatte'], 'estimate', 'Concealed cistern. Estimate: above the RM1,558 one-piece listing.', { mount: 'wall' }),
  shared('vanity', 'vanity-60', 'Mandi Wash Stand 60', 'Mandi Works', 895, [600, 450, 850], ['toilet1', 'toilet2'], ['lacquerWhite', 'oakLight', 'smokedOak'], 'vanity', 'Basin, tap and two drawers.'),
  shared('vanity', 'vanity-80', 'Mandi Floating Vanity 80', 'Mandi Works', 2144, [800, 460, 550], ['toilet1', 'toilet2'], ['walnut', 'oakLight', 'terrazzo'], 'vanity', 'Wall-hung, stone top, vessel basin.', { mount: 'wall' }),
  shared('showerScreen', 'screen', 'Mandi Frameless Shower Screen', 'Mandi Works', 1800, [1200, 10, 2000], ['toilet1', 'toilet2'], ['glassClear', 'glassFluted'], 'showerScreen', '10 mm tempered glass, fixed panel and door, cut to the opening.', {
    variants: [
      { label: '90 cm', w: 900, d: 10, factor: 0.85 },
      { label: '120 cm', w: 1200, d: 10, factor: 1 },
      { label: '135 cm', w: 1350, d: 10, factor: 1.1 },
      { label: '150 cm', w: 1500, d: 10, factor: 1.2 },
    ],
  }),
  shared('mirror', 'mirror-round', 'Mandi Round Mirror 60', 'Mandi Works', 149, [600, 30, 600], ['toilet1', 'toilet2', 'bedroom1', 'foyer'], ['brassBrushed', 'steelBlack'], 'mirror', 'Thin metal frame.', { mount: 'wall' }),
  shared('mirror', 'mirror-cabinet', 'Mandi Mirror Cabinet 60', 'Mandi Works', 569, [600, 150, 700], ['toilet1', 'toilet2'], ['lacquerWhite', 'oakLight'], 'mirror', 'Mirrored doors, shelves behind.', { mount: 'wall' }),

  // Balcony
  shared('outdoorSeat', 'out-acacia', 'Teras Acacia Easy Chair', 'Teras', 385, [700, 780, 780], ['balcony'], ['oakLight'], 'outdoor', 'Weather-treated acacia.'),
  shared('outdoorSeat', 'out-teak', 'Teras Teak Lounge Chair', 'Teras', 1745, [750, 820, 760], ['balcony'], ['walnut', 'rattan'], 'outdoor', 'Teak frame with outdoor cushions.'),
  shared('planter', 'planter', 'Teras Timber Planter Box', 'Teras', 149, [1250, 470, 450], ['balcony', 'yard'], ['oakLight'], 'estimate', 'With a trailing plant.', { model: ph('planter_box_02') }),

  // Light fittings (switched per room)
  shared('downlight', 'downlight', 'Cahaya Recessed Downlight', 'Cahaya Lab', 35, [90, 90, 60], ['living', 'dining', 'kitchen', 'corridor', 'bedroom1', 'bedroom2', 'study', 'toilet1', 'toilet2', 'foyer'], ['aluminiumWhite', 'steelBlack'], 'estimate', 'Warm 9W LED, dimmable.', { mount: 'ceiling' }),
  shared('downlight', 'cove', 'Cahaya LED Cove Strip (per metre)', 'Cahaya Lab', 45, [1000, 20, 10], ['living', 'dining', 'bedroom1'], ['aluminiumWhite'], 'estimate', 'Indirect light hidden in a ceiling cove.', { mount: 'ceiling', styles: ['quietLuxury', 'minimal'] }),
];

export const CATALOGUE: CatalogueItem[] = [...STYLE_ITEMS, ...SHARED_ITEMS];

export const CATALOGUE_BY_ID: Record<string, CatalogueItem> = Object.fromEntries(CATALOGUE.map((i) => [i.id, i]));
