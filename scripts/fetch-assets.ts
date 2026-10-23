// Downloads the CC0 textures and models the app needs into public/assets (git-ignored),
// and writes public/assets/tex/manifest.json with each texture's real-world size.
// Runs automatically before `npm run dev` and `npm run build`; files already present are skipped.
//
// Behind an HTTPS proxy, run with NODE_USE_ENV_PROXY=1 so Node's fetch uses it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { MODELS, shellTextureSets, type TextureManifest, type TextureManifestEntry, type TextureSetSpec } from '../src/assets/textureSets';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const TEX = join(ROOT, 'tex');
const MODEL_DIR = join(ROOT, 'models');
const MANIFEST = join(TEX, 'manifest.json');
const UA = { 'User-Agent': 'ruang-asset-fetch/1.0 (+https://github.com/kuzeo0227/ruang)' };

async function get(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: UA, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}
const json = async <T>(url: string) => (await (await get(url)).json()) as T;
const bytes = async (url: string) => new Uint8Array(await (await get(url)).arrayBuffer());

function save(path: string, data: Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

type PhFiles = Record<string, Record<string, Record<string, { url: string; include?: Record<string, { url: string }> }>>>;

async function fetchPolyHavenTexture(spec: TextureSetSpec): Promise<TextureManifestEntry> {
  const dir = join(TEX, spec.id);
  const info = await json<{ dimensions?: [number, number] }>(`https://api.polyhaven.com/info/${spec.id}`);
  const files = await json<PhFiles>(`https://api.polyhaven.com/files/${spec.id}`);
  const pick = (key: string) => files[key]?.[spec.res]?.jpg?.url;
  const wanted: [string, string | undefined][] = [
    ['color.jpg', pick('Diffuse')],
    ['normal.jpg', pick('nor_gl')],
    ['arm.jpg', pick('arm')],
  ];
  for (const [name, url] of wanted) {
    if (!url) throw new Error(`${spec.id}: no ${name} at ${spec.res}`);
    if (!existsSync(join(dir, name))) save(join(dir, name), await bytes(url));
  }
  const [w, h] = info.dimensions ?? [2000, 2000];
  return { res: spec.res, widthM: w / 1000, heightM: h / 1000, color: 'color.jpg', normal: 'normal.jpg', rough: 'arm.jpg', ao: 'arm.jpg' };
}

async function fetchAmbientCgTexture(spec: TextureSetSpec): Promise<TextureManifestEntry> {
  const dir = join(TEX, spec.id);
  const meta = await json<{ foundAssets: { dimensionX: number; dimensionY: number }[] }>(
    `https://ambientcg.com/api/v2/full_json?id=${spec.id}&include=dimensionsData`,
  );
  const dims = meta.foundAssets[0];
  const has = (n: string) => existsSync(join(dir, n));
  if (!has('color.jpg') || !has('normal.jpg') || !has('rough.jpg')) {
    const zip = unzipSync(await bytes(`https://ambientcg.com/get?file=${spec.id}_${spec.res.toUpperCase()}-JPG.zip`));
    const find = (suffix: string) => Object.entries(zip).find(([name]) => name.endsWith(suffix))?.[1];
    const color = find('_Color.jpg');
    const normal = find('_NormalGL.jpg');
    const rough = find('_Roughness.jpg');
    if (!color || !normal || !rough) throw new Error(`${spec.id}: zip is missing colour, normal or roughness`);
    save(join(dir, 'color.jpg'), color);
    save(join(dir, 'normal.jpg'), normal);
    save(join(dir, 'rough.jpg'), rough);
    const ao = find('_AmbientOcclusion.jpg');
    if (ao) save(join(dir, 'ao.jpg'), ao);
  }
  // ambientCG sizes are in centimetres; 0 means unknown.
  const w = dims?.dimensionX ? dims.dimensionX / 100 : 1;
  const h = dims?.dimensionY ? dims.dimensionY / 100 : w;
  return { res: spec.res, widthM: w, heightM: h, color: 'color.jpg', normal: 'normal.jpg', rough: 'rough.jpg', ao: has('ao.jpg') ? 'ao.jpg' : null };
}

async function fetchPolyHavenModel(id: string) {
  const dir = join(MODEL_DIR, id);
  const gltfPath = join(dir, `${id}.gltf`);
  if (existsSync(gltfPath)) return;
  const files = await json<PhFiles>(`https://api.polyhaven.com/files/${id}`);
  const entry = files.gltf?.['1k']?.gltf;
  if (!entry) throw new Error(`${id}: no 1k glTF`);
  for (const [rel, f] of Object.entries(entry.include ?? {})) save(join(dir, rel), await bytes(f.url));
  save(gltfPath, await bytes(entry.url));
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: limit }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

async function main() {
  const sets = shellTextureSets();
  const manifest: TextureManifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
  const complete = (s: TextureSetSpec) => {
    const m = manifest[s.id];
    return m && m.res === s.res && [m.color, m.normal, m.rough].every((f) => existsSync(join(TEX, s.id, f)));
  };
  const todo = sets.filter((s) => !complete(s));
  const modelsTodo = MODELS.filter((id) => !existsSync(join(MODEL_DIR, id, `${id}.gltf`)));
  if (!todo.length && !modelsTodo.length) {
    console.log(`Assets ready (${sets.length} texture sets, ${MODELS.length} model).`);
    return;
  }
  console.log(`Downloading ${todo.length} texture set(s) and ${modelsTodo.length} model(s) from Poly Haven and ambientCG (CC0). First run only.`);
  await pool(todo, 4, async (spec) => {
    const entry = spec.source === 'polyhaven' ? await fetchPolyHavenTexture(spec) : await fetchAmbientCgTexture(spec);
    manifest[spec.id] = entry;
    console.log(`  ✓ ${spec.id} (${spec.res}, ${entry.widthM.toFixed(2)} × ${entry.heightM.toFixed(2)} m)`);
  });
  await pool([...modelsTodo], 2, async (id) => {
    await fetchPolyHavenModel(id);
    console.log(`  ✓ model ${id}`);
  });
  mkdirSync(TEX, { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log('Assets ready.');
}

main().catch((err) => {
  console.error(`\nCould not download assets: ${err instanceof Error ? err.message : err}`);
  console.error('Check your internet connection and run `npm run fetch:assets` again.');
  process.exit(1);
});
