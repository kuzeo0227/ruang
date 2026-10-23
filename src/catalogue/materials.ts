// Finish library. Every finish maps to a CC0 texture set (Poly Haven or ambientCG)
// or to a plain PBR colour, plus a price factor relative to an item's default finish.

export type MaterialFamily = 'wood' | 'fabric' | 'leather' | 'stone' | 'metal' | 'lacquer' | 'fibre' | 'ceramic' | 'glass';

export interface MaterialDef {
  id: string;
  name: string;
  family: MaterialFamily;
  /** Representative colour, used for UI swatches and as the tint when a texture is shared. */
  swatch: string;
  texture?: { source: 'polyhaven' | 'ambientcg'; id: string };
  roughness: number;
  metalness: number;
  /** Relative cost of this finish. An item's price is quoted in its first (default) finish. */
  priceFactor: number;
}

const m = (
  id: string,
  name: string,
  family: MaterialFamily,
  swatch: string,
  priceFactor: number,
  texture?: MaterialDef['texture'],
  roughness = 0.6,
  metalness = 0,
): MaterialDef => ({ id, name, family, swatch, texture, roughness, metalness, priceFactor });

const ph = (id: string) => ({ source: 'polyhaven' as const, id });
const acg = (id: string) => ({ source: 'ambientcg' as const, id });

export const MATERIALS = {
  // Woods
  oakLight: m('oakLight', 'Natural oak', 'wood', '#C9A87C', 1.0, ph('oak_veneer_01'), 0.55),
  ashWhite: m('ashWhite', 'White-washed ash', 'wood', '#DCCDB2', 1.0, ph('ash_veneer'), 0.6),
  hinoki: m('hinoki', 'Hinoki cypress', 'wood', '#E2C9A0', 1.15, ph('oak_veneer_03'), 0.6),
  bamboo: m('bamboo', 'Bamboo', 'wood', '#CDB48A', 0.95, ph('bamboo_veneer'), 0.55),
  greyOak: m('greyOak', 'Grey-washed oak', 'wood', '#9C9086', 1.05, ph('grey_oak_veneer_01'), 0.6),
  smokedOak: m('smokedOak', 'Smoked oak', 'wood', '#5E4838', 1.1, ph('mocha_oak_veneer'), 0.5),
  walnut: m('walnut', 'American walnut', 'wood', '#6B4A33', 1.2, ph('american_walnut_veneer'), 0.45),
  blackOak: m('blackOak', 'Black-stained oak', 'wood', '#2F2A26', 1.1, ph('black_oak_veneer'), 0.5),

  // Textiles
  linenOat: m('linenOat', 'Oat linen', 'fabric', '#D8CDBB', 1.0, ph('rough_linen'), 0.9),
  linenStone: m('linenStone', 'Stone linen', 'fabric', '#B7AE9F', 1.0, ph('rough_linen'), 0.9),
  linenCharcoal: m('linenCharcoal', 'Charcoal linen', 'fabric', '#4A4744', 1.0, ph('rough_linen'), 0.9),
  cottonWhite: m('cottonWhite', 'Washed cotton', 'fabric', '#EEEAE2', 0.9, acg('Fabric036'), 0.9),
  boucleIvory: m('boucleIvory', 'Ivory bouclé', 'fabric', '#EEE7DA', 1.15, acg('Fabric045'), 0.95),
  boucleSand: m('boucleSand', 'Sand bouclé', 'fabric', '#D6C4A8', 1.15, acg('Fabric045'), 0.95),
  velvetMoss: m('velvetMoss', 'Moss velvet', 'fabric', '#5E6B4E', 1.2, ph('velour_velvet'), 0.7),
  woolGrey: m('woolGrey', 'Felted grey wool', 'fabric', '#8C8A86', 1.05, ph('poly_wool_herringbone'), 0.9),

  // Leather
  leatherBlack: m('leatherBlack', 'Black aniline leather', 'leather', '#1F1D1C', 1.35, ph('brown_leather'), 0.45),
  leatherCognac: m('leatherCognac', 'Cognac leather', 'leather', '#8A5A36', 1.35, ph('brown_leather'), 0.45),

  // Stone and mineral
  travertine: m('travertine', 'Honed travertine', 'stone', '#DCCDB5', 1.3, acg('Travertine009'), 0.55),
  marbleWhite: m('marbleWhite', 'Carrara marble', 'stone', '#ECEAE6', 1.3, ph('marble_01'), 0.3),
  terrazzo: m('terrazzo', 'Warm terrazzo', 'stone', '#E6E1D8', 1.1, acg('Terrazzo019M'), 0.45),
  concreteRaw: m('concreteRaw', 'Raw concrete', 'stone', '#A3A09B', 1.0, acg('Concrete034'), 0.85),
  concreteDark: m('concreteDark', 'Dark cast concrete', 'stone', '#6F6C68', 1.0, acg('Concrete036'), 0.8),
  microcement: m('microcement', 'Microcement', 'stone', '#BDB7AE', 1.1, ph('grey_plaster'), 0.7),
  quartzWhite: m('quartzWhite', 'White quartz', 'stone', '#F1EFEA', 1.1, undefined, 0.25),

  // Metal
  brassBrushed: m('brassBrushed', 'Brushed brass', 'metal', '#B08D57', 1.2, undefined, 0.35, 1),
  steelBlack: m('steelBlack', 'Black powder-coated steel', 'metal', '#232323', 1.0, undefined, 0.5, 0.6),
  steelStainless: m('steelStainless', 'Brushed stainless steel', 'metal', '#C9CBCC', 1.05, undefined, 0.3, 1),
  aluminiumWhite: m('aluminiumWhite', 'White aluminium', 'metal', '#EDEDEB', 1.0, undefined, 0.4, 0.5),

  // Lacquer and paint
  lacquerWhite: m('lacquerWhite', 'Matte white lacquer', 'lacquer', '#F2F0EB', 0.95, undefined, 0.5),
  lacquerGreige: m('lacquerGreige', 'Greige lacquer', 'lacquer', '#CFC7BB', 0.95, undefined, 0.5),
  lacquerCharcoal: m('lacquerCharcoal', 'Charcoal lacquer', 'lacquer', '#3B3A39', 0.95, undefined, 0.5),
  lacquerSage: m('lacquerSage', 'Sage lacquer', 'lacquer', '#A3AD98', 1.0, undefined, 0.5),

  // Natural fibres
  rattan: m('rattan', 'Woven rattan', 'fibre', '#C8A46E', 1.05, acg('Wicker009A'), 0.7),
  tatami: m('tatami', 'Rush tatami', 'fibre', '#C9C08E', 1.0, acg('Tatami004'), 0.85),
  washi: m('washi', 'Washi paper', 'fibre', '#F3EEE2', 1.0, acg('Paper001'), 0.9),
  jute: m('jute', 'Natural jute', 'fibre', '#B59B76', 0.9, acg('Wicker008A'), 0.95),

  // Wall and floor surfaces
  clayPlaster: m('clayPlaster', 'Clay plaster', 'stone', '#E4D8C6', 1.1, ph('clay_plaster'), 0.9),
  limewash: m('limewash', 'Limewash', 'stone', '#EFE7DC', 1.05, acg('Plaster002'), 0.9),
  porcelainTile: m('porcelainTile', 'Large-format matte porcelain', 'ceramic', '#E7E4DF', 1.0, undefined, 0.5),
  oakHerringbone: m('oakHerringbone', 'Oak herringbone', 'wood', '#B8946A', 1.2, ph('herringbone_parquet'), 0.5),
  bronze: m('bronze', 'Satin bronze', 'metal', '#6E5A45', 1.2, undefined, 0.4, 1),

  // Ceramic and glass
  porcelainWhite: m('porcelainWhite', 'Gloss white porcelain', 'ceramic', '#F7F7F5', 1.0, acg('Porcelain001'), 0.15),
  stonewareMatte: m('stonewareMatte', 'Matte stoneware', 'ceramic', '#D9D3C9', 1.15, undefined, 0.6),
  alabaster: m('alabaster', 'Alabaster', 'stone', '#F1E9DC', 1.25, undefined, 0.4),
  glassClear: m('glassClear', 'Clear glass', 'glass', '#DCEEF2', 1.0, undefined, 0.05),
  glassFluted: m('glassFluted', 'Fluted glass', 'glass', '#D3E4E6', 1.15, undefined, 0.1),
} satisfies Record<string, MaterialDef>;

export type MaterialId = keyof typeof MATERIALS;
