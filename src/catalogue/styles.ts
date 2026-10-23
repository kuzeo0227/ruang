// The five style packs. Each one sets the shell finishes, light colour, price tier
// and the invented brand its furniture is sold under. Mood boards and the 3D shell read from here.

import type { MaterialId } from './materials';

export type StyleId = 'muji' | 'japanese' | 'brutalist' | 'minimal' | 'quietLuxury';

export interface Swatch {
  name: string;
  hex: string;
  role: 'base' | 'secondary' | 'accent';
}

export interface StylePack {
  id: StyleId;
  name: string;
  tagline: string;
  /** Invented brand for this style's furniture. */
  brand: string;
  /** Price position: 0 = budget (IKEA MY), 1 = mid (Fella Design MY), 2 = premium (BoConcept MY). */
  tier: number;
  palette: Swatch[];
  shell: {
    floor: MaterialId;
    bedroomFloor: MaterialId;
    wetFloor: MaterialId;
    wallPaint: string;
    featureWall?: MaterialId;
    ceiling: string;
    doors: MaterialId;
    windowFrames: MaterialId;
    kitchenFronts: MaterialId;
    worktop: MaterialId;
  };
  /** Colour temperature of the default room lights. */
  lightKelvin: number;
  keyMaterials: MaterialId[];
  principles: string[];
  sources: { title: string; url: string }[];
}

export const STYLES: Record<StyleId, StylePack> = {
  muji: {
    id: 'muji',
    name: 'Muji-inspired Natural',
    tagline: 'Light oak, washed cotton, nothing extra.',
    brand: 'Kinari Living',
    tier: 0.8,
    palette: [
      { name: 'Warm white', hex: '#F4F1EA', role: 'base' },
      { name: 'Oatmeal', hex: '#DED4C4', role: 'base' },
      { name: 'Light oak', hex: '#C9A87C', role: 'secondary' },
      { name: 'Linen', hex: '#D8CDBB', role: 'secondary' },
      { name: 'Charcoal', hex: '#3F3D3A', role: 'accent' },
      { name: 'Indigo', hex: '#3E4A5C', role: 'accent' },
    ],
    shell: {
      floor: 'oakLight',
      bedroomFloor: 'oakLight',
      wetFloor: 'terrazzo',
      wallPaint: '#F4F1EA',
      ceiling: '#F7F5F0',
      doors: 'ashWhite',
      windowFrames: 'aluminiumWhite',
      kitchenFronts: 'ashWhite',
      worktop: 'quartzWhite',
    },
    lightKelvin: 2900,
    keyMaterials: ['oakLight', 'ashWhite', 'cottonWhite', 'linenOat', 'washi', 'stonewareMatte'],
    principles: [
      'Near-monochrome warm neutrals; colour comes from the wood itself.',
      'Low, modular, functional pieces that leave sightlines open.',
      'Few, well-made pieces in light oak or ash; storage that hides clutter.',
      'Soft, warm light through paper and fabric shades.',
    ],
    sources: [
      { title: 'Livingetc: Muji-style living rooms', url: 'https://www.livingetc.com/ideas/muji-style-living-room' },
      { title: 'Castlery: Japandi interior design', url: 'https://castlery.com/sg/blog/japandi-interior-design' },
    ],
  },
  japanese: {
    id: 'japanese',
    name: 'Japanese (wabi-sabi / ryokan)',
    tagline: 'Tatami, shoji light and darker timber, close to the floor.',
    brand: 'Washitsu Atelier',
    tier: 1.05,
    palette: [
      { name: 'Shoji white', hex: '#F3EEE2', role: 'base' },
      { name: 'Clay', hex: '#E4D8C6', role: 'base' },
      { name: 'Hinoki', hex: '#E2C9A0', role: 'secondary' },
      { name: 'Tatami', hex: '#C9C08E', role: 'secondary' },
      { name: 'Smoked oak', hex: '#5E4838', role: 'accent' },
      { name: 'Sumi', hex: '#2E2C2A', role: 'accent' },
    ],
    shell: {
      floor: 'hinoki',
      bedroomFloor: 'tatami',
      wetFloor: 'concreteDark',
      wallPaint: '#EFE8DC',
      featureWall: 'clayPlaster',
      ceiling: '#F3EEE2',
      doors: 'smokedOak',
      windowFrames: 'bronze',
      kitchenFronts: 'smokedOak',
      worktop: 'concreteDark',
    },
    lightKelvin: 2700,
    keyMaterials: ['hinoki', 'tatami', 'washi', 'smokedOak', 'clayPlaster', 'linenStone'],
    principles: [
      'Floor-level living: low beds, low tables, cushions instead of tall seating.',
      'Diffused light through washi and shoji; darker timber than Scandinavian styles.',
      'Imperfect, hand-made textures (clay plaster, raw ceramic) are celebrated.',
      'Earth tones with charcoal accents, used sparingly.',
    ],
    sources: [
      { title: 'MasterClass: Japandi', url: 'https://www.masterclass.com/articles/japandi' },
      { title: 'Castlery: Japandi interior design', url: 'https://castlery.com/sg/blog/japandi-interior-design' },
    ],
  },
  brutalist: {
    id: 'brutalist',
    name: 'Brutalist (softened)',
    tagline: 'Raw concrete and steel, warmed with walnut and leather.',
    brand: 'Monolith & Form',
    tier: 1.25,
    palette: [
      { name: 'Chalk', hex: '#EDEBE7', role: 'base' },
      { name: 'Concrete', hex: '#A3A09B', role: 'base' },
      { name: 'Dark concrete', hex: '#6F6C68', role: 'secondary' },
      { name: 'Black steel', hex: '#232323', role: 'secondary' },
      { name: 'Walnut', hex: '#6B4A33', role: 'accent' },
      { name: 'Cor-ten', hex: '#9A5B3C', role: 'accent' },
    ],
    shell: {
      floor: 'microcement',
      bedroomFloor: 'smokedOak',
      wetFloor: 'concreteDark',
      wallPaint: '#EDEBE7',
      featureWall: 'concreteRaw',
      ceiling: '#E3E1DD',
      doors: 'blackOak',
      windowFrames: 'steelBlack',
      kitchenFronts: 'concreteDark',
      worktop: 'steelStainless',
    },
    lightKelvin: 3000,
    keyMaterials: ['concreteRaw', 'microcement', 'steelBlack', 'walnut', 'leatherBlack', 'glassFluted'],
    principles: [
      'Concrete is the signature material: feature walls, floors, worktops.',
      'Depth from texture, not colour: grey, black and white, matte against gloss.',
      'Geometric, sculptural furniture; tubular steel, glass, stone.',
      'Warmth from walnut, leather and textiles; light grazes walls to show texture.',
    ],
    sources: [
      { title: 'Home & Texture: Brutalism interior design', url: 'https://homeandtexture.com/brutalism-interior-design/' },
      { title: 'Livingetc: Milanese brutalist-inspired home', url: 'https://www.livingetc.com/features/fantibozzettimenegon-milanese-apartment' },
    ],
  },
  minimal: {
    id: 'minimal',
    name: 'Minimalist',
    tagline: 'Hidden storage, flush surfaces, light that comes from nowhere.',
    brand: 'Garis Studio',
    tier: 0.55,
    palette: [
      { name: 'Warm white', hex: '#F5F3EF', role: 'base' },
      { name: 'Pale grey', hex: '#E3E1DD', role: 'base' },
      { name: 'Greige', hex: '#CFC7BB', role: 'secondary' },
      { name: 'Light oak', hex: '#C9A87C', role: 'secondary' },
      { name: 'Graphite', hex: '#3B3A39', role: 'accent' },
      { name: 'Sage', hex: '#A3AD98', role: 'accent' },
    ],
    shell: {
      floor: 'porcelainTile',
      bedroomFloor: 'oakLight',
      wetFloor: 'porcelainTile',
      wallPaint: '#F5F3EF',
      ceiling: '#F8F7F4',
      doors: 'lacquerWhite',
      windowFrames: 'aluminiumWhite',
      kitchenFronts: 'lacquerWhite',
      worktop: 'quartzWhite',
    },
    lightKelvin: 3500,
    keyMaterials: ['lacquerWhite', 'porcelainTile', 'oakLight', 'linenStone', 'glassClear', 'lacquerGreige'],
    principles: [
      'Curation over emptiness: every object has a reason to be there.',
      'Built-in, handleless storage and furniture that does double duty.',
      'Warm whites rather than stark cool whites; 60-30-10 neutral balance.',
      'Texture keeps it from feeling sterile: linen, wool, wood grain.',
    ],
    sources: [
      { title: 'Chairish: Minimalist interior design guide', url: 'https://www.chairish.com/blog/sc-minimalist-interior-design-guide/' },
    ],
  },
  quietLuxury: {
    id: 'quietLuxury',
    name: 'Quiet Luxury',
    tagline: 'One tonal family, real materials, nothing shouting.',
    brand: 'Maison Tenang',
    tier: 1.75,
    palette: [
      { name: 'Cream', hex: '#F1EAE0', role: 'base' },
      { name: 'Sand', hex: '#D6C4A8', role: 'base' },
      { name: 'Travertine', hex: '#DCCDB5', role: 'secondary' },
      { name: 'Taupe', hex: '#A8988A', role: 'secondary' },
      { name: 'Walnut', hex: '#6B4A33', role: 'accent' },
      { name: 'Brushed brass', hex: '#B08D57', role: 'accent' },
    ],
    shell: {
      floor: 'travertine',
      bedroomFloor: 'oakHerringbone',
      wetFloor: 'travertine',
      wallPaint: '#EFE7DC',
      featureWall: 'limewash',
      ceiling: '#F4EFE8',
      doors: 'walnut',
      windowFrames: 'bronze',
      kitchenFronts: 'walnut',
      worktop: 'travertine',
    },
    lightKelvin: 2700,
    keyMaterials: ['travertine', 'boucleIvory', 'linenOat', 'walnut', 'brassBrushed', 'limewash'],
    principles: [
      'Walls, floors and textiles stay within one tonal family: cream, sand, stone.',
      'Interest from surface feel: bouclé, slubby linen, honed stone, brushed brass.',
      'Real materials that age well; no printed imitations.',
      'Layered, warm light: cove, lamps and picture lights rather than one bright ceiling.',
    ],
    sources: [
      { title: 'Olive et Oriel: Quiet luxury styling guide', url: 'https://oliveetoriel.com/blogs/on-the-wall/quiet-luxury-interior-design-the-complete-styling-guide' },
      { title: 'Dezeen: Dieter Vander Velpen, understated luxury', url: 'https://www.dezeen.com/?p=1094308' },
    ],
  },
};

export const STYLE_ORDER: StyleId[] = ['muji', 'japanese', 'brutalist', 'minimal', 'quietLuxury'];
