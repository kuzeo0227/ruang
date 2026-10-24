// Surface materials for the shell: maps a surface role and style to a PBR material, loads the
// CC0 textures at their real-world size, and patches three.js shaders for:
//   - tile and plank layouts (grout lines, per-tile texture offset and tone variation),
//   - box-projected reflections, so each room reflects its own walls and windows in place,
//   - daylight through the room's openings as area lights (see daylight.ts),
//   - the room's own ceiling downlights, so light never passes through walls into other rooms,
//   - bounce light from a probe captured with the openings covered, so daylight isn't counted twice.

import * as THREE from 'three';
import { PAINT_DETAIL, type TextureManifest, type TextureManifestEntry } from '../assets/textureSets';
import { MATERIALS, type MaterialDef, type MaterialId } from '../catalogue/materials';
import type { StylePack } from '../catalogue/styles';
import type { Role, Zone } from '../shell/types';
import {
  AP_ATLAS_COLS,
  AP_SHADOW_RANGE,
  MAX_APERTURES,
  apertureShadowMatrices,
  apertureShadowOrigins,
  apertureFurnitureTexture,
  apertureShadowTexture,
  apertureTexture,
  lightDebug,
  MAX_DL_PER_ZONE,
  MAX_LAMPS,
  zoneDiffuseUniforms,
  zoneDownlightUniforms,
  zoneLampUniforms,
  type ZoneLighting,
} from './daylight';

export interface SurfaceSpec {
  key: string;
  /** Catalogue material for colour, roughness and texture. Null means plain paint. */
  material: MaterialId | null;
  paint?: string;
  layout: 'none' | 'grid' | 'planks';
  tile?: [number, number];
  grout?: number;
  groutColor?: string;
  rotate?: boolean;
  variation?: number;
  roughness?: number;
  normalScale?: number;
  metalness?: number;
  envIntensity?: number;
  /** Paint and plaster get the fine plaster relief map. */
  paintDetail?: boolean;
  /** Use only the texture's light and dark pattern, coloured by the catalogue swatch (for textures whose hue is off). */
  luma?: boolean;
}

const FACADE = '#E6E1D8';
const COMMON_WALL = '#E8E4DC';

function floorSpec(id: MaterialId, where: 'main' | 'bedroom' | 'wet'): SurfaceSpec {
  const def = MATERIALS[id];
  const key = `floor:${id}:${where}`;
  if (def.family === 'wood') {
    if (id === 'oakHerringbone') return { key, material: id, layout: 'none', variation: 0 };
    return { key, material: id, layout: 'planks', tile: [1.8, 0.19], grout: 0.0012, groutColor: '#4a3626', rotate: true, variation: 0.08 };
  }
  if (def.family === 'fibre') return { key, material: id, layout: 'none' };
  if (id === 'microcement' || id === 'concreteRaw' || id === 'concreteDark') return { key, material: id, layout: 'none', variation: 0 };
  const big = where !== 'wet';
  const grout = id === 'terrazzo' || id === 'porcelainTile' ? '#b9b3aa' : '#a99d8b';
  const tile: [number, number] = id === 'terrazzo' ? [0.6, 0.6] : big ? [1.2, 0.6] : [0.6, 0.6];
  return { key, material: id, layout: 'grid', tile, grout: 0.002, groutColor: grout, variation: 0.05, roughness: where === 'wet' ? 0.75 : undefined };
}

function wetWallSpec(id: MaterialId): SurfaceSpec {
  const def = MATERIALS[id];
  const key = `wetwall:${id}`;
  if (id === 'concreteDark' || id === 'concreteRaw' || id === 'microcement') return { key, material: id, layout: 'none' };
  if (def.family === 'stone' || def.family === 'ceramic') {
    const tile: [number, number] = id === 'travertine' ? [1.2, 0.6] : [0.6, 0.3];
    return { key, material: id, layout: 'grid', tile, grout: 0.0025, groutColor: '#c4beb4', variation: 0.04, roughness: id === 'porcelainTile' ? 0.25 : undefined };
  }
  return { key, material: id, layout: 'none' };
}

const paint = (key: string, color: string, roughness = 0.88): SurfaceSpec => ({ key, material: null, paint: color, layout: 'none', paintDetail: true, roughness, normalScale: 0.35 });

export function surfaceSpec(role: Role, style: StylePack): SurfaceSpec {
  const s = style.shell;
  switch (role) {
    case 'floorMain':
      return floorSpec(s.floor, 'main');
    case 'floorBedroom':
      return floorSpec(s.bedroomFloor, 'bedroom');
    case 'floorWet':
      return floorSpec(s.wetFloor, 'wet');
    case 'floorService':
      return { key: 'floor:service', material: 'concreteDark', layout: 'none', roughness: 0.9 };
    case 'floorCommon':
      return { key: 'floor:common', material: null, paint: '#d6d1ca', layout: 'grid', tile: [0.6, 0.6], grout: 0.003, groutColor: '#b8b2a8', variation: 0.04, roughness: 0.45 };
    case 'ceiling':
      return paint(`ceiling:${s.ceiling}`, s.ceiling, 0.95);
    case 'wallPaint':
      return paint(`wall:${s.wallPaint}`, s.wallPaint);
    case 'wallFeature':
      return s.featureWall ? { key: `feature:${s.featureWall}`, material: s.featureWall, layout: 'none', paintDetail: false } : paint(`wall:${s.wallPaint}`, s.wallPaint);
    case 'wallWet':
      return wetWallSpec(s.wetFloor);
    case 'wallOutdoor':
    case 'facade':
    case 'slab':
      return paint('facade', FACADE, 0.92);
    case 'wallCommon':
      return paint('common', COMMON_WALL);
    case 'skirting':
    case 'timber':
      return { key: `timber:${s.doors}`, material: s.doors, layout: 'none' };
    case 'stone': {
      const m = MATERIALS[s.worktop].family === 'metal' ? 'concreteRaw' : s.worktop;
      return { key: `stone:${m}`, material: m, layout: 'none' };
    }
    case 'frame':
    case 'louvre':
      return { key: `frame:${s.windowFrames}`, material: s.windowFrames, layout: 'none' };
    case 'metal': {
      const m: MaterialId = style.id === 'quietLuxury' ? 'brassBrushed' : style.id === 'brutalist' ? 'steelBlack' : 'steelStainless';
      return { key: `metal:${m}`, material: m, layout: 'none' };
    }
    case 'glass':
      return { key: 'glass', material: 'glassClear', layout: 'none' };
  }
}

// ---------------- Textures ----------------

export interface LoadedTexture {
  entry: TextureManifestEntry;
  color: THREE.Texture | null;
  normal: THREE.Texture;
  rough: THREE.Texture;
  ao: THREE.Texture | null;
  /** Average linear colour of the colour map, for tinting to the catalogue swatch. */
  mean: THREE.Color;
  /** Average roughness (green channel) of the roughness map. */
  roughMean: number;
}

const loader = new THREE.TextureLoader();
let manifestPromise: Promise<TextureManifest> | null = null;
const textureCache = new Map<string, Promise<LoadedTexture>>();
let maxAnisotropy = 8;
const loadedTextures = new Set<THREE.Texture>();

export function setMaxAnisotropy(n: number) {
  if (n === maxAnisotropy) return;
  maxAnisotropy = n;
  for (const t of loadedTextures) {
    t.anisotropy = n;
    t.needsUpdate = true;
  }
}

export function loadManifest(): Promise<TextureManifest> {
  manifestPromise ??= fetch('/assets/tex/manifest.json').then((r) => {
    if (!r.ok) throw new Error('Texture manifest missing. Run `npm run fetch:assets`.');
    return r.json() as Promise<TextureManifest>;
  });
  return manifestPromise;
}

function loadTex(url: string, srgb: boolean): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = maxAnisotropy;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        loadedTextures.add(t);
        resolve(t);
      },
      undefined,
      () => reject(new Error(`Could not load ${url}`)),
    );
  });
}

/** Average 8-bit channel values of an image, sampled at 16 x 16. */
function meanRgb(tex: THREE.Texture): [number, number, number] {
  const img = tex.image as HTMLImageElement | ImageBitmap;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img as CanvasImageSource, 0, 0, 16, 16);
  const data = ctx.getImageData(0, 0, 16, 16).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
  }
  const n = (data.length / 4) * 255;
  return [r / n, g / n, b / n];
}

export function loadTextureSet(id: string, withColor = true): Promise<LoadedTexture> {
  const key = `${id}|${withColor}`;
  let p = textureCache.get(key);
  if (!p) {
    p = loadManifest().then(async (manifest) => {
      const entry = manifest[id];
      if (!entry) throw new Error(`Texture ${id} is not in the manifest. Run \`npm run fetch:assets\`.`);
      const base = `/assets/tex/${id}/`;
      const [color, normal, rough, ao] = await Promise.all([
        withColor ? loadTex(base + entry.color, true) : Promise.resolve(null),
        loadTex(base + entry.normal, false),
        loadTex(base + entry.rough, false),
        entry.ao && entry.ao !== entry.rough ? loadTex(base + entry.ao, false) : Promise.resolve(null),
      ]);
      const mean = color ? new THREE.Color().setRGB(...meanRgb(color), THREE.SRGBColorSpace) : new THREE.Color(1, 1, 1);
      return { entry, color, normal, rough, ao: entry.ao === entry.rough ? rough : ao, mean, roughMean: meanRgb(rough)[1] };
    });
    textureCache.set(key, p);
  }
  return p;
}

// ---------------- Shader patch ----------------

export interface PatchUniforms {
  rTexSize: { value: THREE.Vector2 };
  rTile: { value: THREE.Vector2 };
  rGrout: { value: number };
  rGroutColor: { value: THREE.Color };
  rVariation: { value: number };
  /** Roughness remap: x = target mean, y = map mean, z = contrast. */
  rRough: { value: THREE.Vector3 };
  rBoxMin: { value: THREE.Vector3 };
  rBoxMax: { value: THREE.Vector3 };
  rProbePos: { value: THREE.Vector3 };
  [extra: string]: THREE.IUniform;
}

const MAX_AP_PER_ZONE = 4;

const LAYOUT_CODE = { none: 0, grid: 1, planks: 2 } as const;

const FRAG_PARS = /* glsl */ `
varying vec2 vRUv;
varying vec3 vRWorld;
uniform vec2 rTexSize;
uniform vec2 rTile;
uniform float rGrout;
uniform vec3 rGroutColor;
uniform float rVariation;
uniform vec3 rRough;
uniform vec3 rBoxMin;
uniform vec3 rBoxMax;
uniform vec3 rProbePos;
uniform vec4 rDbg;
#if R_AP > 0
uniform sampler2D rApTex;
uniform vec3 rApO[R_AP];
uniform vec3 rApU[R_AP];
uniform vec3 rApV[R_AP];
uniform vec3 rApN[R_AP];
uniform float rApRow[R_AP];
// Edge term of the polygon form factor (rational fit of theta / sin(theta) / 2pi, as in three's LTC code).
vec3 rEdgeFF(vec3 v1, vec3 v2) {
  float x = dot(v1, v2);
  float y = abs(x);
  float a = 0.8543985 + (0.4965155 + 0.0145206 * y) * y;
  float b = 3.4175940 + (4.1616724 + y) * y;
  float v = a / b;
  float ts = (x > 0.0) ? v : 0.5 * inversesqrt(max(1.0 - x * x, 1e-7)) - v;
  return cross(v1, v2) * ts;
}
// Vector form factor of quad abcd seen from p: its dot with a normal is the share of the
// cosine-weighted hemisphere the quad covers; its length is the most it can cover at p.
vec3 rQuadF(vec3 p, vec3 a, vec3 b, vec3 c, vec3 d) {
  vec3 l0 = normalize(a - p);
  vec3 l1 = normalize(b - p);
  vec3 l2 = normalize(c - p);
  vec3 l3 = normalize(d - p);
  return rEdgeFF(l0, l1) + rEdgeFF(l1, l2) + rEdgeFF(l2, l3) + rEdgeFF(l3, l0);
}
uniform float rProbeS;
// How much opening is near p, whichever way p faces: the form factor of a facing disc of the same area.
float rApNear(vec3 p, vec3 centre, float area) {
  vec3 d = centre - p;
  return area / (PI * dot(d, d) + area);
}
uniform sampler2D rApShadow;
uniform sampler2D rApFurn;
uniform mat4 rApShadowMat[R_AP];
uniform vec3 rApShadowO[R_AP];
// How much of opening i's light reaches p. Two variance shadow maps, both seen from the opening's
// centre: the building's, read sharp, and the furniture's. A coarse read of the furniture map
// estimates how far away whatever is in the way is; the penumbra a window that size casts grows with
// the gap between that and p, so the final read uses a blurrier mip level where it should, and
// furniture never hides more than part of the opening.
float rChebyshev(vec2 m, float d) {
  if (d <= m.x) return 1.0;
  float variance = max(m.y - m.x * m.x, 0.00002);
  float t = d - m.x;
  return variance / (variance + t * t);
}
float rApVisible(int i, int row, vec3 p) {
  vec4 clip = rApShadowMat[i] * vec4(p, 1.0);
  if (clip.w <= 0.0) return 1.0;
  vec2 ndc = clip.xy / clip.w;
  if (abs(ndc.x) > 0.97 || abs(ndc.y) > 0.97) return 1.0;
  vec2 cell = vec2(float(row % AP_COLS), float(row / AP_COLS));
  vec2 uv = (cell + ndc * 0.5 + 0.5) / vec2(float(AP_COLS), float(AP_ROWS));
  float dm = length(p - rApShadowO[i]);
  float d = dm / AP_RANGE - 0.004;
  // Trim the light that variance maps let through behind thin walls and at door openings.
  float walls = smoothstep(0.5, 1.0, rChebyshev(textureLod(rApShadow, uv, 0.0).rg, d));
  if (walls <= 0.0) return 0.0;
  vec2 mc = textureLod(rApFurn, uv, 3.0).rg;
  if (d <= mc.x && d <= textureLod(rApFurn, uv, 0.0).r) return walls;
  float lod = 0.0;
  float pc = rChebyshev(mc, d);
  if (pc < 1.0) {
    // Mean depth of the furniture in the way, taking the unblocked share to be at the receiver.
    float zb = clamp((mc.x - pc * d) / max(1.0 - pc, 1e-3), 0.002, d);
    float size = sqrt(length(rApU[i]) * length(rApV[i]));
    float penumbra = size * (d - zb) / zb;
    // One shadow texel spans 2 tan(70°) / 128 radians.
    lod = clamp(log2(max(penumbra / (dm * 0.0429), 1.0)) - 0.5, 0.0, 5.0);
  }
  float furniture = smoothstep(0.15, 1.0, rChebyshev(textureLod(rApFurn, uv, lod).rg, d));
  return walls * (1.0 - 0.8 * (1.0 - furniture));
}
#endif
// Bounce light is captured at one point per zone; this scales it by how much more or less of the
// openings a surface sees than the probe does, so bounce fades away from the windows.
float rBounce = 1.0;
#if R_DL > 0
uniform vec3 rDownPos[R_DL];
uniform vec3 rDownColor[R_DL];
#endif
#if R_LAMP > 0
uniform vec4 rLampPos[R_LAMP];
uniform vec3 rLampColor[R_LAMP];
#endif
#if R_ENVDIFF == 1
uniform sampler2D rEnvDiffuse;
uniform float rEnvDiffuseScale;
#endif
vec2 rUv;
float rGroutMask;
float rShade;
vec2 rHash2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
void rLayout() {
  vec2 p = vRUv;
  #if R_ROTATE == 1
    p = p.yx;
  #endif
  rUv = p / rTexSize;
  rGroutMask = 0.0;
  rShade = 1.0;
  #if R_LAYOUT > 0
    vec2 q = p;
    float row = floor(q.y / rTile.y);
    #if R_LAYOUT == 2
      // Planks: each row starts at a random offset, so joints never line up.
      q.x += rHash2(vec2(row, 7.0)).x * rTile.x;
    #endif
    vec2 cell = floor(q / rTile);
    vec2 local = q - cell * rTile;
    vec2 h = rHash2(cell + 0.5);
    rUv = (local + h * rTexSize * 3.0) / rTexSize;
    rShade = 1.0 + (h.y - 0.5) * rVariation;
    vec2 edge = min(local, rTile - local);
    float d = min(edge.x, edge.y);
    float aa = max(fwidth(p.x), fwidth(p.y));
    rGroutMask = 1.0 - smoothstep(rGrout * 0.5, rGrout * 0.5 + aa * 1.2, d);
    // Joints thinner than a pixel fade instead of staying a pixel wide, though bevels still read.
    rGroutMask *= clamp(rGrout / max(aa, 1e-5), 0.4, 1.0);
  #endif
}
#define vMapUv rUv
#define vNormalMapUv rUv
#define vRoughnessMapUv rUv
#define vAoMapUv rUv
`;

const BOX_PROJECTION = /* glsl */ `
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			#if R_BOX == 1
			{
				vec3 rv = reflectVec;
				vec3 tMax = (rBoxMax - vRWorld) / rv;
				vec3 tMin = (rBoxMin - vRWorld) / rv;
				vec3 tFar = max(tMax, tMin);
				float dist = min(min(tFar.x, tFar.y), tFar.z);
				reflectVec = normalize(vRWorld + rv * dist - rProbePos);
			}
			#endif`;

/** Daylight from the zone's openings, added to the image-based irradiance. */
const WINDOW_LIGHT = /* glsl */ `
#if R_AP > 0
{
  vec3 rWN = normalize((vec4(geometryNormal, 0.0) * viewMatrix).xyz);
  vec3 rP = vRWorld;
  float rS = 0.0;
  for (int i = 0; i < R_AP; i++) {
    vec3 o = rApO[i];
    vec3 u = rApU[i];
    vec3 v = rApV[i];
    float near = rApNear(rP, o + 0.5 * (u + v), length(u) * length(v));
    // Surfaces in the opening's own wall (or outside it) get no direct daylight, but still the bounce.
    if (dot(rP - o, rApN[i]) < 0.005) {
      rS += near;
      continue;
    }
    // The part of the opening above this point is seen looking up (sky), the part below looking down.
    float h = clamp((rP.y - o.y) / v.y, 0.0, 1.0);
    vec3 m = o + v * h;
    int row = int(rApRow[i] + 0.5);
    vec3 lUp = texelFetch(rApTex, ivec2(0, row), 0).rgb;
    vec3 lDn = texelFetch(rApTex, ivec2(1, row), 0).rgb;
    vec3 fUp = rQuadF(rP, m, m + u, o + u + v, o + v);
    vec3 fDn = rQuadF(rP, o, o + u, m + u, m);
    float vis = rApVisible(i, row, rP + rWN * 0.03);
    iblIrradiance += PI * (lUp * max(0.0, dot(fUp, rWN)) + lDn * max(0.0, dot(fDn, rWN))) * vis * rDbg.x;
    rS += near * vis;
  }
  rBounce = clamp(pow(rS / rProbeS, 0.5), 0.4, 1.5);
}
#endif`;

/**
 * The zone's ceiling downlights: a wide beam pointing down, inverse-square falloff. Each has its
 * own colour (black when off), so the rooms of an open-plan zone switch and dim separately.
 */
const DOWNLIGHTS = /* glsl */ `
#if R_DL > 0
for (int i = 0; i < R_DL; i++) {
  vec3 dc = rDownColor[i];
  if (dc.r + dc.g + dc.b <= 0.0) continue;
  vec3 toL = rDownPos[i] - vRWorld;
  float d2 = max(dot(toL, toL), 0.0025);
  float cosBeam = toL.y * inversesqrt(d2);
  IncidentLight dl;
  dl.direction = normalize((viewMatrix * vec4(toL, 0.0)).xyz);
  dl.color = dc * smoothstep(0.15, 0.8, cosBeam) / d2 * rDbg.z;
  dl.visible = true;
  RE_Direct(dl, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
}
#endif
#if R_LAMP > 0
// Lamps in the zone: point lights, optionally aimed down (pendants, desk lamps); no shadows.
for (int i = 0; i < R_LAMP; i++) {
  vec3 lc = rLampColor[i];
  if (lc.r + lc.g + lc.b <= 0.0) continue;
  vec3 toL = rLampPos[i].xyz - vRWorld;
  float d2 = max(dot(toL, toL), 0.04);
  float below = toL.y * inversesqrt(d2);
  float beam = mix(1.0, 1.6 * smoothstep(-0.25, 0.6, below), rLampPos[i].w);
  IncidentLight ll;
  ll.direction = normalize((viewMatrix * vec4(toL, 0.0)).xyz);
  ll.color = lc * beam / d2 * rDbg.z;
  ll.visible = true;
  RE_Direct(ll, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
}
#endif`;

interface PatchOptions {
  layout: number;
  rotate: boolean;
  box: boolean;
  roughMap: boolean;
  luma?: boolean;
  apertures: number;
  downlights: number;
  lamps: number;
  envDiffuse: boolean;
}

function patch(mat: THREE.MeshStandardMaterial, o: PatchOptions, uniforms: PatchUniforms) {
  // onBeforeCompile sees unexpanded #include lines, so the env chunk is expanded here with box
  // projection, and with the bounce-light probe for diffuse where the zone has one.
  const envChunk = THREE.ShaderChunk.envmap_physical_pars_fragment
    .replace(/\n\t*reflectVec = transformDirectionByInverseViewMatrix\( reflectVec, viewMatrix \);/, `\n${BOX_PROJECTION}`)
    .replace('return envMapColor.rgb * envMapIntensity;', 'return envMapColor.rgb * envMapIntensity * rDbg.w;')
    .replace(
      'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );',
      `#if R_ENVDIFF == 1
			vec4 envMapColor = textureCubeUV( rEnvDiffuse, envMapRotation * worldNormal, 1.0 ) * (rEnvDiffuseScale * rDbg.y * rBounce * BOUNCE_GAIN);
			#else
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			#endif`,
    );
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.defines = {
      ...(shader.defines ?? {}),
      R_LAYOUT: o.layout,
      R_ROTATE: o.rotate ? 1 : 0,
      R_BOX: o.box ? 1 : 0,
      R_ROUGHMAP: o.roughMap ? 1 : 0,
      R_LUMA: o.luma ? 1 : 0,
      R_AP: o.apertures,
      R_DL: o.downlights,
      R_LAMP: o.lamps,
      R_ENVDIFF: o.envDiffuse ? 1 : 0,
      // An empty shell has no furniture to soak up light; this stands in for it.
      BOUNCE_GAIN: '0.85',
      AP_COLS: AP_ATLAS_COLS,
      AP_ROWS: MAX_APERTURES / AP_ATLAS_COLS,
      AP_RANGE: AP_SHADOW_RANGE.toFixed(1),
    };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRUv;\nvarying vec3 vRWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRUv = uv;\nvRWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <uv_pars_fragment>', `#include <uv_pars_fragment>\n${FRAG_PARS}`)
      .replace('#include <envmap_physical_pars_fragment>', envChunk)
      .replace('void main() {', 'void main() {\n\trLayout();')
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>\n${DOWNLIGHTS}`)
      .replace('#include <lights_fragment_maps>', `${WINDOW_LIGHT}\n#include <lights_fragment_maps>`)
      .replace(
        '#include <map_fragment>',
        THREE.ShaderChunk.map_fragment.replace(
          'diffuseColor *= sampledDiffuseColor;',
          `#if R_LUMA == 1
		sampledDiffuseColor.rgb = vec3(dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
	#endif
	diffuseColor *= sampledDiffuseColor;`,
        ) + '\n\tdiffuseColor.rgb *= rShade;\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, rGroutColor, rGroutMask);',
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
	#if R_ROUGHMAP == 1
		roughnessFactor = clamp(rRough.x + (roughnessFactor - rRough.y) * rRough.z, 0.04, 1.0);
	#endif
	roughnessFactor = mix(roughnessFactor, 0.95, rGroutMask);`,
      );
  };
  mat.customProgramCacheKey = () => `ruang-${o.layout}-${+o.rotate}-${+o.box}-${+o.roughMap}-${+!!o.luma}-${o.apertures}-${o.downlights}-${o.lamps}-${+o.envDiffuse}`;
}

// ---------------- Material creation ----------------

const linear = (hex: string) => new THREE.Color(hex);

export interface ShellMaterial {
  material: THREE.MeshStandardMaterial;
  uniforms: PatchUniforms | null;
}

/** Textures that a style needs, so they can be preloaded behind the loading screen. */
export function texturesForStyle(style: StylePack): string[] {
  const ids = new Set<string>([PAINT_DETAIL.id]);
  const roles: Role[] = ['floorMain', 'floorBedroom', 'floorWet', 'floorService', 'wallFeature', 'wallWet', 'timber', 'stone', 'frame', 'metal'];
  for (const role of roles) {
    const spec = surfaceSpec(role, style);
    const tex = spec.material ? MATERIALS[spec.material].texture : undefined;
    if (tex) ids.add(tex.id);
  }
  return [...ids];
}

/** Creates the material for one surface role in one lighting zone. */
export async function createSurfaceMaterial(spec: SurfaceSpec, zone: Zone | null, lighting: ZoneLighting | null = null): Promise<ShellMaterial> {
  if (spec.key === 'glass') return { material: createGlassMaterial(), uniforms: null };
  const def: MaterialDef | null = spec.material ? MATERIALS[spec.material] : null;
  const mat = new THREE.MeshStandardMaterial({
    name: `${spec.key}@${zone?.id ?? 'exterior'}`,
    roughness: spec.roughness ?? def?.roughness ?? 0.9,
    metalness: spec.metalness ?? def?.metalness ?? 0,
    envMapIntensity: spec.envIntensity ?? 1,
  });
  mat.shadowSide = THREE.DoubleSide;

  const texId = def?.texture?.id ?? (spec.paintDetail ? PAINT_DETAIL.id : null);
  let texSize = new THREE.Vector2(1, 1);
  const targetRough = spec.roughness ?? def?.roughness ?? 0.9;
  let roughMean = 0.5;
  if (texId) {
    const useColor = !!def?.texture;
    const t = await loadTextureSet(texId, useColor);
    texSize = new THREE.Vector2(t.entry.widthM, t.entry.heightM);
    if (t.color) mat.map = t.color;
    mat.normalMap = t.normal;
    const ns = spec.normalScale ?? (def?.family === 'stone' || def?.family === 'ceramic' ? 0.6 : 1);
    mat.normalScale.set(ns, ns);
    mat.roughnessMap = t.rough;
    mat.roughness = 1;
    roughMean = t.roughMean;
    if (t.ao) {
      mat.aoMap = t.ao;
      mat.aoMapIntensity = 0.6;
    }
    if (def && t.color) {
      // Tint so the average colour matches the catalogue swatch (same as the mood boards).
      const target = linear(def.swatch);
      const m = t.mean;
      if (spec.luma) {
        const l = Math.max(0.2126 * m.r + 0.7152 * m.g + 0.0722 * m.b, 1e-3);
        mat.color.setRGB(target.r / l, target.g / l, target.b / l);
      } else mat.color.setRGB(clampTint(target.r / Math.max(m.r, 1e-3)), clampTint(target.g / Math.max(m.g, 1e-3)), clampTint(target.b / Math.max(m.b, 1e-3)));
    }
  } else {
    mat.roughness = targetRough;
  }
  if (!def?.texture) mat.color = linear(spec.paint ?? def?.swatch ?? '#ffffff');

  const uniforms: PatchUniforms = {
    rTexSize: { value: texSize },
    rTile: { value: new THREE.Vector2(...(spec.tile ?? [1, 1])) },
    rGrout: { value: spec.grout ?? 0 },
    rGroutColor: { value: linear(spec.groutColor ?? '#888888') },
    rVariation: { value: spec.variation ?? 0 },
    rRough: { value: new THREE.Vector3(targetRough, roughMean, 0.6) },
    rBoxMin: { value: new THREE.Vector3(...(zone?.boxMin ?? [0, 0, 0])) },
    rBoxMax: { value: new THREE.Vector3(...(zone?.boxMax ?? [1, 1, 1])) },
    rProbePos: { value: new THREE.Vector3(...(zone?.probe ?? [0, 0, 0])) },
    rDbg: lightDebug,
  };
  const counts = addZoneUniforms(uniforms, zone, lighting);
  patch(
    mat,
    { layout: LAYOUT_CODE[spec.layout], rotate: !!spec.rotate, box: !!zone, roughMap: !!mat.roughnessMap, luma: !!spec.luma && !!mat.map, ...counts },
    uniforms,
  );
  return { material: mat, uniforms };
}

/** Adds the zone's daylight, bounce, downlight and lamp uniforms; returns what the shader should compile for. */
function addZoneUniforms(uniforms: PatchUniforms, zone: Zone | null, lighting: ZoneLighting | null) {
  const aps = (lighting?.apertures ?? [])
    .slice()
    .sort((a, b) => area(b.aperture) - area(a.aperture))
    .slice(0, MAX_AP_PER_ZONE);
  const dls = (lighting?.downlights ?? []).slice(0, MAX_DL_PER_ZONE);
  if (aps.length) {
    uniforms.rApTex = apertureTexture;
    uniforms.rApO = { value: aps.map((a) => new THREE.Vector3(...a.aperture.origin)) };
    uniforms.rApU = { value: aps.map((a) => new THREE.Vector3(...a.aperture.u)) };
    uniforms.rApV = { value: aps.map((a) => new THREE.Vector3(...a.aperture.v)) };
    uniforms.rApN = { value: aps.map((a) => new THREE.Vector3(...a.aperture.normal)) };
    uniforms.rApRow = { value: aps.map((a) => a.row) };
    uniforms.rApShadow = apertureShadowTexture;
    uniforms.rApFurn = apertureFurnitureTexture;
    uniforms.rApShadowMat = { value: aps.map((a) => apertureShadowMatrices[a.row]!) };
    uniforms.rApShadowO = { value: aps.map((a) => apertureShadowOrigins[a.row]!) };
    uniforms.rProbeS = { value: Math.max(1e-4, aps.reduce((n, a) => n + openingNear(zone?.probe ?? [0, 1.45, 0], a.aperture), 0)) };
    const diffuse = zoneDiffuseUniforms(lighting!.zone);
    uniforms.rEnvDiffuse = diffuse.texture;
    uniforms.rEnvDiffuseScale = diffuse.scale;
  }
  if (dls.length) {
    uniforms.rDownPos = { value: dls.map((p) => new THREE.Vector3(...p)) };
    uniforms.rDownColor = zoneDownlightUniforms(lighting!.zone);
  }
  const lamps = lighting ? MAX_LAMPS : 0;
  if (lamps) {
    const l = zoneLampUniforms(lighting!.zone);
    uniforms.rLampPos = l.pos;
    uniforms.rLampColor = l.color;
  }
  return { apertures: aps.length, downlights: dls.length, lamps, envDiffuse: aps.length > 0 };
}

/**
 * Gives a scanned model's own material (its maps and colours) the zone's lighting, like the shell.
 * The material should be a clone made for this zone.
 */
export function patchModelMaterial(mat: THREE.MeshStandardMaterial, zone: Zone | null, lighting: ZoneLighting | null) {
  const uniforms: PatchUniforms = {
    rTexSize: { value: new THREE.Vector2(1, 1) },
    rTile: { value: new THREE.Vector2(1, 1) },
    rGrout: { value: 0 },
    rGroutColor: { value: new THREE.Color(0.5, 0.5, 0.5) },
    rVariation: { value: 0 },
    rRough: { value: new THREE.Vector3(0.5, 0.5, 1) },
    rBoxMin: { value: new THREE.Vector3(...(zone?.boxMin ?? [0, 0, 0])) },
    rBoxMax: { value: new THREE.Vector3(...(zone?.boxMax ?? [1, 1, 1])) },
    rProbePos: { value: new THREE.Vector3(...(zone?.probe ?? [0, 0, 0])) },
    rDbg: lightDebug,
  };
  const counts = addZoneUniforms(uniforms, zone, lighting);
  patch(mat, { layout: 0, rotate: false, box: !!zone, roughMap: false, ...counts }, uniforms);
  return uniforms;
}

const clampTint = (v: number) => Math.min(2.5, Math.max(0.2, v));

/** How much opening is near p, whichever way p faces (same as rApNear in the shader). */
function openingNear(p: readonly number[], a: { origin: number[]; u: number[]; v: number[] }): number {
  const area = Math.hypot(a.u[0]!, a.u[1]!, a.u[2]!) * Math.hypot(a.v[0]!, a.v[1]!, a.v[2]!);
  const c = [0, 1, 2].map((i) => a.origin[i]! + 0.5 * (a.u[i]! + a.v[i]!) - p[i]!);
  return area / (Math.PI * (c[0]! ** 2 + c[1]! ** 2 + c[2]! ** 2) + area);
}
const area = (a: { u: number[]; v: number[] }) => Math.hypot(...a.u) * Math.hypot(...a.v);

/**
 * Window glass: adds the reflection on top of what is behind it (One / OneMinusSrcAlpha blending),
 * so the view stays clear by day and the room reflects in the glass at night, like real glass.
 */
export function createGlassMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    name: 'glass',
    color: new THREE.Color(0, 0, 0),
    roughness: 0.03,
    metalness: 0,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMapIntensity: 1.6,
  });
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  return mat;
}
