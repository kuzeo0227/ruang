"""Beach from level 10, about 30 m up, on the sea front.

The block's garden (lawn, a pool, coconut palms and sea almond trees) runs down to a sea wall and a
beach of pale sand. The sea fills the view to the north, with breakers along the shore, fishing
boats, a ship on the horizon and islands in the haze. The coast curves out to forested headlands
east and west, lined with low resorts; inland, to the south, are a town and hills.

Passes: day (a humid afternoon sky), night (the resorts', the road's and the boats' lights) and
mask (where the water is, so the app can draw the sun's glitter on it).

  blender -b --factory-startup --python tools/views/beach.py -- --out DIR --mode day|night|mask
      [--width 6144] [--samples 48] [--window lon0,lon1,lat0,lat1]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import flora  # noqa: E402
import kit  # noqa: E402
from pngio import save_png  # noqa: E402

A = kit.parse_args(out='/tmp/beach', mode='day', width=1536, samples=16, seed=10, window='')
EL_MIN, EL_MAX, EYE = -80.0, 15.0, 30.0
MODE = A['mode']
NIGHT = MODE == 'night'
MASK = MODE == 'mask'
WINDOW = tuple(float(v) for v in A['window'].split(',')) if A['window'] else None
rng = np.random.default_rng(int(A['seed']))
SEA = -1.8  # sea level, relative to the garden
BEACH = 30.0  # width of the sand, waterline to sea wall
C = flora.C

sc = kit.reset_scene()
kit.setup_render(sc, A['width'], EL_MIN, EL_MAX, A['samples'], EYE, WINDOW)
os.makedirs(A['out'], exist_ok=True)
if NIGHT or MASK:
    kit.world_black(sc)
    sc.cycles.max_bounces = 2 if NIGHT else 0
else:
    # Sea air is clearer than Kuala Lumpur's: a bluer horizon for the water to mirror.
    kit.world_sky(sc, sun_elevation=50, sun_azimuth=250, strength=1.0, air=1.0, dust=1.5, ozone=1.0, altitude=40)
    kit.sun_lamp(sc, 50, 250, strength=3.2, angle_deg=0.6)
kit.mist(sc, 0, 40000)
fl = flora.Flora()

# ---------------------------------------------------------------- the coast


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def shore_y(x):
    """The waterline of the bay: straight in front of the block, curving out towards the headlands."""
    return 72 + 0.000028 * np.asarray(x, dtype=np.float64) ** 2


HEADLANDS = ((-4300.0, 900.0), (4300.0, 900.0))
PHASES = rng.uniform(0, 100, 12)


def undulation(x, y, scale):
    h = np.zeros_like(np.asarray(x, dtype=np.float64))
    for k in range(6):
        f = 2**k / scale
        ang = PHASES[k] * 0.7
        u = x * math.cos(ang) + y * math.sin(ang)
        v = -x * math.sin(ang) + y * math.cos(ang)
        h += np.sin(u * f + PHASES[k]) * np.cos(v * f * 0.8 + PHASES[k + 6]) / 1.9**k
    return h


def inland(x, y):
    """Metres inland of the waterline (negative out at sea); the headlands push the land out."""
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    L = shore_y(x) - y
    for hx, hy in HEADLANDS:
        L = L + 1500 * np.exp(-(((x - hx) / 1700) ** 2 + ((y - hy) / 1200) ** 2))
    return L


def terrain(x, y):
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    L = inland(x, y)
    # Sand slopes from the foot of the sea wall (1 m below the garden) into the water; the bed
    # falls away offshore; the garden is level behind the wall.
    z = np.where(L < 0, SEA + L * 0.03, SEA + np.minimum(L, BEACH) * (0.8 / BEACH))
    z = np.where(L > BEACH, -1.0 + np.clip(L - BEACH, 0, 2) * 0.5, z)
    hills = np.zeros_like(x)
    for hx, hy in HEADLANDS:
        hills += 280 * np.exp(-(((x - hx) / 1500) ** 2 + ((y - hy) / 1000) ** 2)) * (0.75 + 0.25 * undulation(x, y, 700))
    hills += 230 * smoothstep(-900, -3500, y) * (0.6 + 0.4 * undulation(x, y, 1800))
    hills *= smoothstep(60, 500, L)
    return z + hills


# ---------------------------------------------------------------- the garden and beach (raster)

NEAR = 180.0  # half-size of the detailed ground (m)
RES = 4096
POOL = dict(cx=-14.0, cy=14.0, w=26.0, d=9.0)


def near_raster():
    n = RES
    c = ((np.arange(n) + 0.5) / n * 2 * NEAR - NEAR).astype(np.float32)
    X, Y = np.meshgrid(c, -c)  # row 0 is north (float32 keeps the 4096² rasters to a few hundred MB)
    L = inland(X, Y)
    rg = np.random.default_rng(4)
    patch = 0.5 + 0.3 * undulation(X, Y, 11.0)
    img = np.empty((n, n, 3), np.float32)
    grass = np.stack([0.05 + 0.015 * patch, 0.1 + 0.02 * patch, 0.03 + 0.004 * patch], -1)
    img[:] = grass + rg.normal(0, 0.005, (n, n, 1))
    # Sand: dry and pale up the beach, darker and wet near the water, a line of weed at high tide.
    sand_dry = np.stack([0.46 + 0.04 * patch, 0.38 + 0.03 * patch, 0.27 + 0.02 * patch], -1)
    wet = smoothstep(11, 3, L)[..., None]
    sand = sand_dry * (1 - wet) + np.array([0.22, 0.18, 0.13]) * wet
    # A faint, broken line of weed and shells at the last high tide.
    wander = 1.5 * undulation(X * 0.7, Y * 0.7, 30.0)
    tide = (np.abs(L - 13 - wander) < 0.25) & (rg.random((n, n)) < 0.35) & (undulation(X, Y, 6.0) > -0.1)
    sand = np.where(tide[..., None], sand * 0.7, sand) + rg.normal(0, 0.012, (n, n, 1))
    img = np.where((L < BEACH + 0.5)[..., None], sand, img)
    # The sea wall's coping, and a path along the top of the beach.
    img = np.where(((L >= BEACH + 0.5) & (L < BEACH + 2.2))[..., None], np.array([0.4, 0.38, 0.34]), img)
    prom = (L >= BEACH + 2.2) & (L < BEACH + 5.5)
    pav = np.where(((np.floor(X / 0.5) + np.floor(Y / 0.5)) % 2 == 0)[..., None], [0.33, 0.31, 0.28], [0.37, 0.35, 0.32])
    img = np.where(prom[..., None], pav, img)
    # The pool deck and pool (the basin itself is geometry).
    lx, ly = X - POOL['cx'], Y - POOL['cy']
    deck = (np.abs(lx) < POOL['w'] / 2 + 3.5) & (np.abs(ly) < POOL['d'] / 2 + 3.5)
    img = np.where(deck[..., None], np.array([0.36, 0.33, 0.29]) + rg.normal(0, 0.01, (n, n, 1)), img)
    # Paths from the block to the beach and round the lawn.
    path = (np.abs(X - 18) < 1.2) & (L > BEACH + 2) | (np.abs(np.hypot(X - 10, Y - 10) - 26) < 0.9) & (L > BEACH + 6)
    img = np.where(path[..., None], np.array([0.34, 0.32, 0.29]), img)
    # Planting beds along the wall.
    bed = (L > BEACH + 5.5) & (L < BEACH + 9) & ~path
    img = np.where(bed[..., None], np.array([0.035, 0.025, 0.018]), img)
    p = os.path.join(A['out'], 'near.png')
    save_png(p, (np.clip(img, 0, 1) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8))
    return p


def image_material(name, path, extent):
    m, nt, out = kit.node_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Location'].default_value = (0.5, 0.5, 0)
    mp.inputs['Scale'].default_value = (1 / (2 * extent), 1 / (2 * extent), 1)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = bpy.data.images.load(path)
    t.extension = 'EXTEND'
    nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 40
    noise.inputs['Detail'].default_value = 6
    nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.2
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    p = kit.principled(nt, rough=0.9, spec=0.3)
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


def far_land_material():
    """Beyond the detailed patch: sand by the water, forest elsewhere (vertex attribute 'sand')."""
    m, nt, out = kit.node_mat('far_land')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.feature = 'DISTANCE_TO_EDGE'
    vor.inputs['Scale'].default_value = 1 / 12.0
    nt.links.new(tc.outputs['Object'], vor.inputs['Vector'])
    vor2 = nt.nodes.new('ShaderNodeTexVoronoi')
    vor2.inputs['Scale'].default_value = 1 / 12.0
    nt.links.new(tc.outputs['Object'], vor2.inputs['Vector'])
    edge = kit.math_node(nt, 'POWER', kit.math_node(nt, 'MULTIPLY', vor.outputs['Distance'], 2.2, clamp=True), 0.6)
    col = flora.ramp(nt, vor2.outputs['Color'], flora.FOREST_STOPS)
    col = kit.mix_rgb(nt, kit.math_node(nt, 'SUBTRACT', 1.0, edge), col, C(0.005, 0.012, 0.004))
    sand = flora.attr_node(nt, 'sand').outputs['Fac']
    col = kit.mix_rgb(nt, sand, col, C(0.42, 0.35, 0.25))
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Distance'].default_value = 5.0
    nt.links.new(kit.math_node(nt, 'MULTIPLY', edge, kit.math_node(nt, 'SUBTRACT', 1.0, sand)), bump.inputs['Height'])
    p = kit.principled(nt, rough=0.85, spec=0.25)
    nt.links.new(col, p.inputs['Base Color'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


near_png = near_raster()
n = 400
c = np.linspace(-NEAR, NEAR, n)
GX, GY = np.meshgrid(c, c)
GZ = terrain(GX, GY)
verts = np.stack([GX, GY, GZ], -1).reshape(-1, 3)
faces = []
for i in range(n - 1):
    for j in range(n - 1):
        cx, cy = (c[j] + c[j + 1]) / 2, (c[i] + c[i + 1]) / 2
        if math.hypot(cx, cy) > NEAR * 0.99:
            continue
        if abs(cx - POOL['cx']) < POOL['w'] / 2 - 0.15 and abs(cy - POOL['cy']) < POOL['d'] / 2 - 0.15:
            continue
        a = i * n + j
        faces.append((a, a + 1, a + n + 1, a + n))
kit.mesh_object('near_ground', verts, faces, image_material('near', near_png, NEAR), smooth=True)

# The rest of the land, out to the horizon, on a polar grid.
nr, na = 460, 900
rs = NEAR * 0.97 + (40000 - NEAR * 0.97) * np.linspace(0, 1, nr) ** 2.4
angs = np.linspace(0, 2 * np.pi, na, endpoint=False)
R, Ang = np.meshgrid(rs, angs, indexing='ij')
X, Y = R * np.sin(Ang), R * np.cos(Ang)
Z = terrain(X, Y)
faces = []
for i in range(nr - 1):
    for j in range(na):
        a = i * na + j
        b = i * na + (j + 1) % na
        faces.append((a, b, b + na, a + na))
land = kit.mesh_object('land', np.stack([X, Y, Z], -1).reshape(-1, 3), faces, far_land_material(), smooth=True)
sand_attr = land.data.attributes.new('sand', 'FLOAT', 'POINT')
sand_attr.data.foreach_set("value", (1 - smoothstep(BEACH - 4, BEACH + 14, inland(X, Y))).reshape(-1).astype(np.float32))

# The sea wall: a stone face where the garden steps down to the sand.
wall = kit.simple_mat('sea_wall', C(0.3, 0.28, 0.25), 0.85)
mb = kit.MeshBuilder()
xs = np.arange(-NEAR, NEAR, 1.0)
for x0, x1 in zip(xs[:-1], xs[1:]):
    y0, y1 = float(shore_y(x0)) - BEACH - 0.5, float(shore_y(x1)) - BEACH - 0.5
    mb.quad((x0, y0, -1.0), (x1, y1, -1.0), (x1, y1, 0.05), (x0, y0, 0.05), col=(1, 1, 1, 1))
mb.build('sea_wall', wall)

# The pool: a tiled basin under clear water (see-through, so sunlight reaches the floor).
tile = kit.simple_mat('pool_tile', C(0.18, 0.42, 0.48), 0.3, spec=0.5)
hw, hd = POOL['w'] / 2, POOL['d'] / 2
P0 = (POOL['cx'], POOL['cy'])
corners = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]
basin = []
for i in range(4):
    (ax, ay), (bx, by) = corners[i], corners[(i + 1) % 4]
    basin.append([(P0[0] + ax, P0[1] + ay, 0.0), (P0[0] + ax, P0[1] + ay, -1.4), (P0[0] + bx, P0[1] + by, -1.4), (P0[0] + bx, P0[1] + by, 0.0)])
basin.append([(P0[0] + x_, P0[1] + y_, -1.4) for x_, y_ in corners])
kit.mesh_object('pool_basin', [v for f in basin for v in f], [tuple(range(4 * k, 4 * k + 4)) for k in range(len(basin))], tile)


def clear_water(name, tint):
    m, nt, out = kit.node_mat(name)
    fres = nt.nodes.new('ShaderNodeFresnel')
    fres.inputs['IOR'].default_value = 1.333
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    clear.inputs['Color'].default_value = tint
    mirror = nt.nodes.new('ShaderNodeBsdfGlossy')
    mirror.inputs['Roughness'].default_value = 0.03
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fres.outputs['Fac'], mix.inputs['Fac'])
    nt.links.new(clear.outputs['BSDF'], mix.inputs[1])
    nt.links.new(mirror.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    return m


kit.mesh_object('pool_water', [(P0[0] + x_, P0[1] + y_, -0.12) for x_, y_ in corners], [(0, 1, 2, 3)], clear_water('pool_water', C(0.82, 0.95, 0.95)))

# ---------------------------------------------------------------- the sea


def sea_material():
    """Opaque water: its own colour (turquoise over the sand, deep blue further out) under a
    Fresnel reflection of the sky, wind ripples, and foam where the waves break."""
    m, nt, out = kit.node_mat('sea')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
    x, y = sep.outputs['X'], sep.outputs['Y']
    shore = kit.math_node(nt, 'ADD', kit.math_node(nt, 'MULTIPLY', kit.math_node(nt, 'MULTIPLY', x, x), 0.000028), 72.0)
    d = kit.math_node(nt, 'SUBTRACT', y, shore)  # metres offshore (in front of the block)
    depth = kit.math_node(nt, 'DIVIDE', d, 500.0, clamp=True)
    water = flora.ramp(nt, depth, [(0.0, C(0.025, 0.12, 0.105)), (0.06, C(0.01, 0.065, 0.07)), (0.3, C(0.004, 0.03, 0.045)), (1.0, C(0.003, 0.018, 0.036))])
    # Ripples: wind waves at a few scales, longer swell running along the shore.
    n1 = nt.nodes.new('ShaderNodeTexNoise')
    n1.inputs['Scale'].default_value = 0.6
    n1.inputs['Detail'].default_value = 8
    nt.links.new(tc.outputs['Object'], n1.inputs['Vector'])
    swell = nt.nodes.new('ShaderNodeTexWave')
    swell.wave_type = 'BANDS'
    swell.bands_direction = 'Y'
    swell.inputs['Scale'].default_value = 0.012
    swell.inputs['Distortion'].default_value = 6.0
    swell.inputs['Detail'].default_value = 3.0
    nt.links.new(tc.outputs['Object'], swell.inputs['Vector'])
    # Wind waves a few metres long: their facets turn towards a low viewpoint, so the far sea shows
    # more of its own deep blue and mirrors higher, bluer sky instead of the bright horizon.
    n2 = nt.nodes.new('ShaderNodeTexNoise')
    n2.inputs['Scale'].default_value = 0.15
    n2.inputs['Detail'].default_value = 6
    nt.links.new(tc.outputs['Object'], n2.inputs['Vector'])
    height = kit.math_node(nt, 'ADD', n1.outputs['Fac'], kit.math_node(nt, 'MULTIPLY', swell.outputs['Fac'], 0.6))
    height = kit.math_node(nt, 'ADD', height, kit.math_node(nt, 'MULTIPLY', n2.outputs['Fac'], 2.0))
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    bump.inputs['Distance'].default_value = 0.8
    nt.links.new(height, bump.inputs['Height'])
    # Foam: the swash at the water's edge and two lines of breakers, broken up by noise.
    fn = nt.nodes.new('ShaderNodeTexNoise')
    fn.inputs['Scale'].default_value = 0.09
    fn.inputs['Detail'].default_value = 6
    nt.links.new(tc.outputs['Object'], fn.inputs['Vector'])
    fnoise = fn.outputs['Fac']

    # The breaker lines wander in and out, and come and go along the beach.
    wn = nt.nodes.new('ShaderNodeTexNoise')
    wn.inputs['Scale'].default_value = 0.012
    nt.links.new(tc.outputs['Object'], wn.inputs['Vector'])
    wander = kit.math_node(nt, 'MULTIPLY', kit.math_node(nt, 'SUBTRACT', wn.outputs['Fac'], 0.5), 14.0)

    def band(c0, w, thresh):
        dist = kit.math_node(nt, 'ABSOLUTE', kit.math_node(nt, 'SUBTRACT', kit.math_node(nt, 'SUBTRACT', d, wander), c0))
        b = kit.math_node(nt, 'SUBTRACT', 1.0, kit.math_node(nt, 'DIVIDE', dist, w, clamp=True))
        return kit.math_node(nt, 'MULTIPLY', b, kit.math_node(nt, 'GREATER_THAN', fnoise, thresh))

    swash = kit.math_node(nt, 'SUBTRACT', 1.0, kit.math_node(nt, 'DIVIDE', d, 4.0, clamp=True))
    swash = kit.math_node(nt, 'MULTIPLY', swash, kit.math_node(nt, 'GREATER_THAN', fnoise, 0.35))
    foam = kit.math_node(nt, 'MAXIMUM', kit.math_node(nt, 'MULTIPLY', swash, 0.8), band(16.0, 2.2, 0.5))
    foam = kit.math_node(nt, 'MAXIMUM', foam, band(34.0, 1.6, 0.6), clamp=True)
    col = kit.mix_rgb(nt, foam, water, C(0.72, 0.75, 0.75))
    p = kit.principled(nt, rough=0.06, spec=0.5)
    p.inputs['IOR'].default_value = 1.333
    nt.links.new(col, p.inputs['Base Color'])
    nt.links.new(kit.mix_float(nt, foam, 0.06, 0.75), p.inputs['Roughness'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


SEA_MAT = sea_material()
S = 60000.0
kit.mesh_object('sea', [(-S, -S, SEA), (S, -S, SEA), (S, S, SEA), (-S, S, SEA)], [(0, 1, 2, 3)], SEA_MAT)

# Islands in the haze, and the ship and boats.


def island(name, cx, cy, rx, ry, h, seed):
    r = np.random.default_rng(seed)
    nr_, na_ = 40, 120
    verts = []
    ph = r.uniform(0, 6.28, 4)
    for i in range(nr_):
        t = i / (nr_ - 1)
        for j in range(na_):
            a = 2 * math.pi * j / na_
            wob = 1 + 0.18 * math.sin(3 * a + ph[0]) + 0.1 * math.sin(7 * a + ph[1])
            x, y = cx + rx * t * wob * math.cos(a), cy + ry * t * wob * math.sin(a)
            z = h * (1 - t**2) ** 1.6 * (0.8 + 0.2 * math.sin(5 * a + ph[2]) * t) + SEA - 4 * t**8
            verts.append((x, y, z))
    faces = []
    for i in range(nr_ - 1):
        for j in range(na_):
            a = i * na_ + j
            b = i * na_ + (j + 1) % na_
            faces.append((a, b, b + na_, a + na_))
    return kit.mesh_object(name, verts, faces, fl.HILL_CANOPY, smooth=True)


for k, (b, dist, rx, ry, h) in enumerate(((-28, 12500, 1500, 900, 300), (8, 19000, 2600, 1300, 420), (36, 9000, 700, 500, 160), (52, 15500, 1100, 700, 230))):
    x, y = kit.polar(b, dist)
    island(f'island_{k}', x, y, rx, ry, h, 30 + k)

hull_mats = [kit.simple_mat(f'hull_{k}', c_, 0.5) for k, c_ in enumerate((C(0.6, 0.6, 0.58), C(0.05, 0.12, 0.35), C(0.45, 0.06, 0.05), C(0.05, 0.25, 0.15)))]


def boat(x, y, length, heading, mat, cabin=True):
    mb_ = kit.MeshBuilder()
    w = length * 0.28
    mb_.rotated_box(x, y, length * 0.8, w, SEA - 0.3, SEA + 0.7, heading)
    bx, by = x + math.cos(heading) * length * 0.5, y + math.sin(heading) * length * 0.5
    mb_.rotated_box(bx, by, length * 0.25, w * 0.55, SEA - 0.2, SEA + 0.9, heading)
    if cabin:
        cx_, cy_ = x - math.cos(heading) * length * 0.15, y - math.sin(heading) * length * 0.15
        mb_.rotated_box(cx_, cy_, length * 0.25, w * 0.7, SEA + 0.7, SEA + 2.2, heading, col=(1, 1, 1, 1))
    return mb_.build(f'boat_{x:.0f}_{y:.0f}', mat)


boats = []
for _ in range(9):
    b = rng.uniform(-60, 60)
    dist = rng.uniform(350, 2600)
    x, y = kit.polar(b, dist)
    if inland(x, y) > -40:
        continue
    L_ = rng.uniform(7, 13)
    boat(x, y, L_, rng.uniform(0, 2 * math.pi), hull_mats[int(rng.integers(0, len(hull_mats)))])
    boats.append((x, y, L_))
ship = kit.MeshBuilder()
sx, sy = kit.polar(-12, 16000)
ship.rotated_box(sx, sy, 190, 30, SEA - 2, SEA + 16, 0.15, col=(1, 1, 1, 1))
ship.rotated_box(sx - 70, sy - 10, 24, 26, SEA + 16, SEA + 36, 0.15, col=(1, 1, 1, 1))
for k in range(6):
    ship.rotated_box(sx - 40 + k * 22, sy - 6 + k * 3.3, 18, 24, SEA + 16, SEA + 26, 0.15, col=(1, 1, 1, 1))
ship.build('ship', kit.simple_mat('ship', C(0.35, 0.12, 0.08), 0.5))

# ---------------------------------------------------------------- the garden and beach planting

for x in np.arange(-NEAR + 6, NEAR - 6, 8.5):
    x = float(x + rng.uniform(-2.5, 2.5))
    y = float(shore_y(x)) - rng.uniform(BEACH - 8, BEACH - 3)
    r_ = np.random.default_rng(int(abs(x) * 97) + 3)
    out = rng.uniform(-0.12, 0.12)
    fl.palm(x, y, float(terrain(x, y)), r_, height=(9, 17), lean=(out, rng.uniform(0.12, 0.38)))
for x, y in ((-34.0, 26.0), (30.0, 22.0), (8.0, 30.0), (-2.0, 2.0), (40.0, -4.0), (-42.0, 4.0)):
    fl.palm(x, y, 0.0, np.random.default_rng(int(abs(x * 31 + y * 7)) + 1), height=(7, 12))
for x, y in ((22.0, 8.0), (-48.0, 24.0), (54.0, 30.0)):
    fl.tree(x, y, 0.0, 'ketapang', np.random.default_rng(int(abs(x * 13 + y)) + 5))
for x, y in ((-26.0, -6.0), (14.0, -10.0)):
    fl.tree(x, y, 0.0, 'garden', np.random.default_rng(int(abs(x * 17 + y)) + 9))
# Hedges along the top of the wall, shrubs round the pool.
pts = [(float(x), float(shore_y(x)) - BEACH - 7.0, 0.0) for x in np.arange(-NEAR + 2, NEAR - 2, 2.0)]
fl.hedge(pts, np.random.default_rng(12), height=1.3, width=1.2)
for k in range(28):
    a = 2 * math.pi * k / 28
    x = POOL['cx'] + (POOL['w'] / 2 + 5.5) * math.cos(a)
    y = POOL['cy'] + (POOL['d'] / 2 + 5.0) * math.sin(a)
    fl.shrub(x, y, 0.0, np.random.default_rng(100 + k), rng.uniform(0.5, 1.0), tone=rng.uniform(0.0, 1.0))

# Umbrellas and loungers on the beach in front of the block.
canvas = kit.simple_mat('canvas', C(0.75, 0.72, 0.65), 0.8)
loungers = kit.MeshBuilder()
umb = kit.MeshBuilder()
for k in range(7):
    x = -36 + k * 12 + rng.uniform(-1, 1)
    y = float(shore_y(x)) - BEACH + 11 + rng.uniform(-1, 1)
    z = float(terrain(x, y))
    # A parasol: eight panels round a pole.
    top = (x, y, z + 2.6)
    for s in range(8):
        a0, a1 = 2 * math.pi * s / 8, 2 * math.pi * (s + 1) / 8
        p0 = (x + 1.6 * math.cos(a0), y + 1.6 * math.sin(a0), z + 2.15)
        p1 = (x + 1.6 * math.cos(a1), y + 1.6 * math.sin(a1), z + 2.15)
        umb.f.append((len(umb.v), len(umb.v) + 1, len(umb.v) + 2))
        umb.v += [top, p0, p1]
        umb.col.append((1, 1, 1, 1))
        umb.val.append(0.0)
    umb.box(x - 0.03, y - 0.03, z, x + 0.03, y + 0.03, z + 2.6)
    for side in (-1, 1):
        loungers.rotated_box(x + side * 0.9, y - 0.6, 0.7, 1.9, z + 0.25, z + 0.38, 0.0)
umb.build('parasols', canvas)
loungers.build('loungers', kit.simple_mat('lounger', C(0.6, 0.58, 0.55), 0.6))

# ---------------------------------------------------------------- the resorts along the coast and the town

wall_cols = [C(0.62, 0.6, 0.56), C(0.6, 0.55, 0.45), C(0.55, 0.57, 0.58), C(0.62, 0.58, 0.5)]
attr_m, nt, out = kit.node_mat('blocks')
colattr = flora.attr_node(nt, 'col')
val = flora.attr_node(nt, 'val').outputs['Fac']
bp = kit.principled(nt, rough=0.75, spec=0.35)
nt.links.new(colattr.outputs['Color'], bp.inputs['Base Color'])
if NIGHT:
    # Lit windows: val is 1 for a lit bay.
    bp.inputs['Emission Color'].default_value = (1.0, 0.72, 0.45, 1)
    nt.links.new(kit.math_node(nt, 'MULTIPLY', val, 6.0), bp.inputs['Emission Strength'])
nt.links.new(bp.outputs['BSDF'], out.inputs['Surface'])

blocks = kit.MeshBuilder()


def block(cx, cy, w, d, floors, angle, wall_col, r):
    """A resort block facing the sea: a light slab edge and a shaded balcony band on every floor,
    bays lit at random at night, and a hipped tile roof."""
    fh = 3.2
    c, s = math.cos(angle), math.sin(angle)
    bays = max(1, int(w / 4.0))
    for f in range(floors):
        z0 = f * fh
        blocks.rotated_box(cx, cy, w, d, z0, z0 + 0.35, angle, col=wall_col)
        for b in range(bays):
            bx = (b + 0.5) / bays * w - w / 2
            lit = 1.0 if r.random() < 0.38 else 0.0
            px, py = cx + bx * c, cy + bx * s
            blocks.rotated_box(px, py, w / bays - 0.25, d - 1.2, z0 + 0.35, z0 + fh, angle, col=C(0.08, 0.09, 0.1), val=lit)
    # Roof: a low hip as two sloped quads and two triangles.
    hx, hy, top = w / 2 + 0.6, d / 2 + 0.6, floors * fh
    P = lambda px, py, z: (cx + px * c - py * s, cy + px * s + py * c, z)  # noqa: E731
    roof = C(0.32, 0.12, 0.07) if r.random() < 0.7 else C(0.25, 0.25, 0.27)
    blocks.quad(P(-hx, -hy, top), P(hx, -hy, top), P(hx - hy, 0, top + 3.2), P(-hx + hy, 0, top + 3.2), col=roof)
    blocks.quad(P(hx, hy, top), P(-hx, hy, top), P(-hx + hy, 0, top + 3.2), P(hx - hy, 0, top + 3.2), col=roof)
    blocks.v += [P(-hx, -hy, top), P(-hx + hy, 0, top + 3.2), P(-hx, hy, top), P(hx, hy, top), P(hx - hy, 0, top + 3.2), P(hx, -hy, top)]
    n0 = len(blocks.v) - 6
    blocks.f += [(n0, n0 + 1, n0 + 2), (n0 + 3, n0 + 4, n0 + 5)]
    blocks.col += [roof, roof]
    blocks.val += [0.0, 0.0]


far_palms = []
for side in (-1, 1):
    x = side * rng.uniform(115, 140)
    while abs(x) < 3300:
        w = rng.uniform(24, 60)
        gap = rng.uniform(25, 80)
        cxx = x + side * w / 2
        slope = 0.000056 * cxx
        ang = math.atan(slope)
        cyy = float(shore_y(cxx)) - rng.uniform(48, 76)
        if inland(cxx, cyy) > 50:
            floors = int(rng.integers(3, 11)) if abs(cxx) < 1600 else int(rng.integers(2, 5))
            block(cxx, cyy, w, rng.uniform(13, 19), floors, ang, wall_cols[int(rng.integers(0, 4))], rng)
        # Palms between the resorts and the sand.
        for px in np.arange(x, x + side * (w + gap), side * rng.uniform(9, 16)):
            far_palms.append((float(px), float(shore_y(px)) - rng.uniform(BEACH - 9, BEACH + 4)))
        x += side * (w + gap)
blocks.build('resorts', attr_m)
for px, py in far_palms:
    if abs(px) < NEAR + 30:
        continue
    r_ = np.random.default_rng(int(abs(px) * 7) + 11)
    fl.palm(px, py, float(terrain(px, py)), r_, height=(9, 16), lean=(0.0, rng.uniform(0.1, 0.3)))

# The town inland: rows of houses on the slope, shophouses, a few blocks, and trees.
town = kit.MeshBuilder()
roofs = [C(0.36, 0.13, 0.07), C(0.3, 0.14, 0.09), C(0.25, 0.25, 0.27), C(0.42, 0.2, 0.1)]
walls = [C(0.62, 0.6, 0.55), C(0.58, 0.55, 0.48), C(0.55, 0.55, 0.52)]
for _ in range(900):
    x = rng.uniform(-2500, 2500)
    y = rng.uniform(-2200, -160)
    if abs(x) < 120 and y > -260:
        continue
    z = float(terrain(x, y))
    town.terrace(x, y, int(rng.integers(3, 9)), 11, 6.5, 2.4, rng.uniform(-0.2, 0.2) + (math.pi / 2 if rng.random() < 0.3 else 0), walls, [roofs[int(rng.integers(0, 4))]], porch=False)
town_obj = town.build('town', None)
# The rows were built at z = 0; set each vertex on the terrain below it.
tv = np.array([v.co[:] for v in town_obj.data.vertices])
tv[:, 2] += terrain(tv[:, 0], tv[:, 1])
town_obj.data.vertices.foreach_set('co', tv.reshape(-1).astype(np.float32))
tm, tnt, tout = kit.node_mat('town_cols')
ta = flora.attr_node(tnt, 'col')
tp = kit.principled(tnt, rough=0.8, spec=0.3)
tnt.links.new(ta.outputs['Color'], tp.inputs['Base Color'])
tnt.links.new(tp.outputs['BSDF'], tout.inputs['Surface'])
town_obj.data.materials.append(tm)

# Forest on the headlands and the hills, and trees through the town.
pts = []
for spacing, r0_, r1_ in ((9.0, 150, 2600), (16.0, 2600, 9000)):
    g = np.arange(-r1_, r1_, spacing)
    GXf, GYf = np.meshgrid(g, g)
    P = np.stack([GXf.ravel(), GYf.ravel()], 1) + rng.uniform(-0.45 * spacing, 0.45 * spacing, (GXf.size, 2))
    d_ = np.hypot(P[:, 0], P[:, 1])
    P = P[(d_ >= r0_) & (d_ < r1_)]
    Li = inland(P[:, 0], P[:, 1])
    hz = terrain(P[:, 0], P[:, 1])
    # Forest where the land rises; groves and street trees on the plain; none on the sand or the resort strips.
    forest = (hz > 25) & (rng.random(len(P)) < 0.95)
    # Groves along the coastal plain behind the resorts, thinner in town.
    grove = (Li > 95) & (Li < 900) & (np.abs(P[:, 0]) > 200)
    town_trees = (Li > 95) & (hz <= 25) & (rng.random(len(P)) < np.where(grove, 0.35, 0.12))
    P = P[forest | town_trees]
    pts.append(P)
P = np.concatenate(pts)
nf = len(P)
fz = terrain(P[:, 0], P[:, 1])
size = rng.uniform(4.5, 8.0, nf) * np.where(np.hypot(P[:, 0], P[:, 1]) > 2600, 1.5, 1.0)
fl.far_crowns('far_crowns', np.stack([P[:, 0], P[:, 1], fz + rng.uniform(6, 16, nf)], 1), size, rng)
print('far crowns', nf)

# ---------------------------------------------------------------- night lights

if NIGHT:
    warm = kit.simple_mat('warm_light', C(0, 0, 0), emit=C(1.0, 0.72, 0.42), emit_strength=60)
    cool = kit.simple_mat('boat_light', C(0, 0, 0), emit=C(0.75, 1.0, 0.85), emit_strength=900)
    pool_l = kit.simple_mat('pool_light', C(0, 0, 0), emit=C(0.4, 0.85, 1.0), emit_strength=25)
    street = kit.simple_mat('street_light', C(0, 0, 0), emit=C(1.0, 0.78, 0.5), emit_strength=300)
    lb = kit.MeshBuilder()
    # Bollards along the beach path and the garden paths; uplights under the beach palms.
    for x in np.arange(-NEAR + 4, NEAR - 4, 7.0):
        y = float(shore_y(x)) - BEACH - 3.8
        lb.box(x - 0.08, y - 0.08, 0.5, x + 0.08, y + 0.08, 0.7)
    for k in range(30):
        a = 2 * math.pi * k / 30
        x, y = 10 + 27 * math.cos(a), 10 + 27 * math.sin(a)
        if inland(x, y) > BEACH + 6:
            lb.box(x - 0.08, y - 0.08, 0.5, x + 0.08, y + 0.08, 0.7)
    lb.build('bollards', warm)
    pb = kit.MeshBuilder()
    for k in range(5):
        px = POOL['cx'] - POOL['w'] / 2 + (k + 0.5) * POOL['w'] / 5
        for side in (-1, 1):
            y = POOL['cy'] + side * (POOL['d'] / 2 - 0.02)
            pb.box(px - 0.12, y - 0.12, -0.72, px + 0.12, y + 0.12, -0.48)
    pb.build('pool_lights', pool_l)
    # Fishing boats out at night carry bright lamps; the ship has a few.
    bl = kit.MeshBuilder()
    for x, y, L_ in boats:
        for k in range(3):
            bl.box(x - 0.25 + k * 0.6, y - 0.25, SEA + 2.4, x + 0.25 + k * 0.6, y + 0.25, SEA + 2.9)
    for k in range(8):
        bl.box(sx - 80 + k * 22, sy - 12 + k * 3.3, SEA + 26, sx - 79 + k * 22, sy - 11 + k * 3.3, SEA + 27)
    bl.build('boat_lights', cool)
    # The coast road behind the resorts, and the town's streets.
    sl = kit.MeshBuilder()
    for x in np.arange(-3200, 3200, 32.0):
        y = float(shore_y(x)) - 92
        if abs(x) < 60 or inland(x, y) < 60:
            continue
        z = float(terrain(x, y))
        sl.box(x - 0.3, y - 0.3, z + 8, x + 0.3, y + 0.3, z + 8.4)
    for _ in range(1800):
        x = rng.uniform(-2500, 2500)
        y = rng.uniform(-2200, -170)
        z = float(terrain(x, y))
        sl.box(x - 0.3, y - 0.3, z + 6, x + 0.3, y + 0.3, z + 6.4)
    sl.build('street_lights', street)

# ---------------------------------------------------------------- mask pass: where the water is

if MASK:
    # Every surface black except the sea, which glows white; the sky stays transparent.
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        mt = m.node_tree
        outs = [n_ for n_ in mt.nodes if n_.type == 'OUTPUT_MATERIAL']
        if not outs:
            continue
        em = mt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (1, 1, 1, 1) if m is SEA_MAT else (0, 0, 0, 1)
        mt.links.new(em.outputs['Emission'], outs[0].inputs['Surface'])

# ---------------------------------------------------------------- render

fl.build()
kit.render_to_npy(sc, A['out'], MODE)
print('done', MODE)
