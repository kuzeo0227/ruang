"""Rainforest from level 5, about 15 m up, at canopy height.

The block stands in a garden clearing (lawn, a lap pool, paths, shrubs, palms and frangipani) cut
into lowland dipterocarp forest. Most of the way round, the forest is a wall of trees 30 to 55 m
tall a few dozen metres away; to the north-north-east the ground falls into a valley, so the view
runs out over the canopy to forested hills and the Titiwangsa range in the haze.

Near trees are modelled in full: trunks with buttresses, branches, and crowns of leafy branchlets
(every leaf is geometry). The forest edge has bamboo, palms, tree ferns and wild bananas. Further
out, crowns are lumpy shells with a foliage shader; the hills are terrain with a canopy shader.

The day pass is lit by a humid sky; the night pass keeps only the garden's lamps, the pool lights
and a few far-off houses.

  blender -b --factory-startup --python tools/views/rainforest.py -- --out DIR --mode day|night
      [--width 6144] [--samples 48] [--window lon0,lon1,lat0,lat1]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import kit  # noqa: E402
from pngio import save_png  # noqa: E402

A = kit.parse_args(out='/tmp/forest', mode='day', width=1536, samples=16, seed=5, window='')
EL_MIN, EL_MAX, EYE = -80.0, 50.0, 15.0
NIGHT = A['mode'] == 'night'
WINDOW = tuple(float(v) for v in A['window'].split(',')) if A['window'] else None
rng = np.random.default_rng(int(A['seed']))
DETAIL = 150.0  # trees are modelled leaf by leaf within this distance
VALLEY_BEARING = 20.0

sc = kit.reset_scene()
kit.setup_render(sc, A['width'], EL_MIN, EL_MAX, A['samples'], EYE, WINDOW)
os.makedirs(A['out'], exist_ok=True)
if NIGHT:
    kit.world_black(sc)
    sc.cycles.max_bounces = 2
else:
    kit.world_sky(sc, sun_elevation=50, sun_azimuth=250, strength=1.0, air=1.0, dust=4.0, ozone=1.0, altitude=60)
    kit.sun_lamp(sc, 50, 250, strength=3.2, angle_deg=0.6)
kit.mist(sc, 0, 40000)
# Leaves are thin and see-through in places; give light a few more transmission bounces.
sc.cycles.transmission_bounces = 4

# ---------------------------------------------------------------- terrain


def bearing_of(x, y):
    return np.degrees(np.arctan2(x, y))


def ang_diff(a, b):
    return (a - b + 180.0) % 360.0 - 180.0


def edge_radius(b):
    """Distance from the viewpoint to the forest edge at bearing b: wider to the north."""
    br = np.radians(b)
    return 40 + 12 * np.cos(br) + 5 * np.sin(2 * br + 1.0) + 3.5 * np.sin(5 * br + 2.0) + 2.0 * np.sin(11 * br)


def valley_weight(b):
    return np.exp(-((ang_diff(b, VALLEY_BEARING) / 48.0) ** 2))


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


PHASES = rng.uniform(0, 100, 12)


def undulation(x, y, scale):
    h = np.zeros_like(np.asarray(x, dtype=np.float64))
    for k in range(6):
        f = 2 ** k / scale
        ang = PHASES[k] * 0.7
        u = x * math.cos(ang) + y * math.sin(ang)
        v = -x * math.sin(ang) + y * math.cos(ang)
        h += np.sin(u * f + PHASES[k]) * np.cos(v * f * 0.8 + PHASES[k + 6]) / 1.9 ** k
    return h


def terrain(x, y):
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    r = np.hypot(x, y)
    b = bearing_of(x, y)
    e = edge_radius(b)
    vw = valley_weight(b)
    out = np.clip(r - e, 0, None)
    # The valley: a steep bank just beyond the garden (so the trees on it stand below the eye),
    # then a floor that falls gently and climbs into far hills.
    drop = -(42 * smoothstep(0, 30, out) + 22 * smoothstep(25, 260, out)) * vw
    climb = (1 - vw) * (out * 0.09 + 25 * smoothstep(60, 600, out))
    hills = 260 * smoothstep(900, 4000, r) * (0.55 + 0.45 * undulation(x, y, 2600))
    rough = 6 * undulation(x, y, 140) * smoothstep(0, 40, out)
    return np.where(r < e, 0.0, drop + climb + hills + rough)


def terrain_mesh(name, r0, r1, nr, na, mat, gamma=2.2):
    t = np.linspace(0, 1, nr) ** gamma
    rs = r0 + (r1 - r0) * t
    angs = np.linspace(0, 2 * np.pi, na, endpoint=False)
    R, Ang = np.meshgrid(rs, angs, indexing='ij')
    X, Y = R * np.sin(Ang), R * np.cos(Ang)
    Z = terrain(X, Y)
    verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
    faces = []
    for i in range(nr - 1):
        for j in range(na):
            a = i * na + j
            b = i * na + (j + 1) % na
            faces.append((a, b, b + na, a + na))
    return kit.mesh_object(name, verts, faces, mat, smooth=True)


# ---------------------------------------------------------------- materials


def attr_node(nt, name, kind='GEOMETRY'):
    n = nt.nodes.new('ShaderNodeAttribute')
    n.attribute_type = kind
    n.attribute_name = name
    return n


def ramp(nt, fac, stops):
    n = nt.nodes.new('ShaderNodeValToRGB')
    cr = n.color_ramp
    while len(cr.elements) < len(stops):
        cr.elements.new(0.5)
    for el, (pos, col) in zip(cr.elements, stops):
        el.position = pos
        el.color = col
    nt.links.new(fac, n.inputs['Fac'])
    return n.outputs['Color']


def leaf_material(name, stops, translucent=0.3, rough=0.45, spec=0.5):
    """Leaves: tone per tree (instancer attribute 'tone'), a little per branchlet and per leaf."""
    m, nt, out = kit.node_mat(name)
    tone = attr_node(nt, 'tone', 'INSTANCER').outputs['Fac']
    info = nt.nodes.new('ShaderNodeObjectInfo')
    lv = attr_node(nt, 'lv').outputs['Fac']
    fac = kit.math_node(nt, 'ADD', tone, kit.math_node(nt, 'MULTIPLY', kit.math_node(nt, 'SUBTRACT', info.outputs['Random'], 0.5), 0.12))
    fac = kit.math_node(nt, 'ADD', fac, kit.math_node(nt, 'MULTIPLY', kit.math_node(nt, 'SUBTRACT', lv, 0.5), 0.16), clamp=True)
    col = ramp(nt, fac, stops)
    p = kit.principled(nt, rough=rough, spec=spec)
    nt.links.new(col, p.inputs['Base Color'])
    tr = nt.nodes.new('ShaderNodeBsdfTranslucent')
    tcol = kit.mix_rgb(nt, 1.0, col, (1.6, 1.9, 0.7, 1), 'MULTIPLY')
    nt.links.new(tcol, tr.inputs['Color'])
    mix = nt.nodes.new('ShaderNodeMixShader')
    mix.inputs['Fac'].default_value = translucent
    nt.links.new(p.outputs['BSDF'], mix.inputs[1])
    nt.links.new(tr.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    return m


C = lambda r, g, b: (r, g, b, 1.0)  # noqa: E731
LEAF_CANOPY = leaf_material('leaf_canopy', [(0.0, C(0.018, 0.045, 0.012)), (0.45, C(0.04, 0.085, 0.02)), (0.8, C(0.07, 0.12, 0.028)), (1.0, C(0.11, 0.15, 0.035))])
LEAF_FINE = leaf_material('leaf_fine', [(0.0, C(0.03, 0.06, 0.015)), (0.5, C(0.06, 0.11, 0.025)), (0.85, C(0.1, 0.15, 0.03)), (0.97, C(0.16, 0.09, 0.03)), (1.0, C(0.2, 0.08, 0.035))])
LEAF_LIGHT = leaf_material('leaf_light', [(0.0, C(0.05, 0.1, 0.02)), (0.6, C(0.1, 0.17, 0.035)), (1.0, C(0.16, 0.22, 0.05))], translucent=0.4)
LEAF_PALM = leaf_material('leaf_palm', [(0.0, C(0.04, 0.08, 0.02)), (0.7, C(0.09, 0.14, 0.03)), (0.92, C(0.14, 0.15, 0.04)), (1.0, C(0.2, 0.17, 0.07))], rough=0.4, spec=0.6)
LEAF_SHRUB = leaf_material('leaf_shrub', [(0.0, C(0.03, 0.07, 0.015)), (0.55, C(0.07, 0.12, 0.03)), (0.75, C(0.25, 0.03, 0.03)), (1.0, C(0.35, 0.05, 0.04))], rough=0.4, spec=0.55)


def bark_material(name, base, light, dark, scale=1.0):
    m, nt, out = kit.node_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 1.4 * scale
    noise.inputs['Detail'].default_value = 8
    nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
    lich = nt.nodes.new('ShaderNodeTexNoise')
    lich.inputs['Scale'].default_value = 0.6 * scale
    lich.inputs['Detail'].default_value = 3
    nt.links.new(tc.outputs['Object'], lich.inputs['Vector'])
    col = kit.mix_rgb(nt, noise.outputs['Fac'], dark, base)
    col = kit.mix_rgb(nt, kit.math_node(nt, 'GREATER_THAN', lich.outputs['Fac'], 0.58), col, light)
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.4
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    p = kit.principled(nt, rough=0.9, spec=0.25)
    nt.links.new(col, p.inputs['Base Color'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


BARK = bark_material('bark', C(0.32, 0.29, 0.24), C(0.5, 0.48, 0.42), C(0.12, 0.11, 0.08))
BARK_DARK = bark_material('bark_dark', C(0.16, 0.13, 0.1), C(0.33, 0.33, 0.27), C(0.06, 0.05, 0.035))
PALM_TRUNK = bark_material('palm_trunk', C(0.26, 0.24, 0.21), C(0.34, 0.33, 0.3), C(0.13, 0.12, 0.1), scale=3.0)
BAMBOO = kit.simple_mat('bamboo', C(0.22, 0.28, 0.06), rough=0.35, spec=0.6)


def foliage_material(name, coords, cell, stops, bump_strength=0.8):
    """Distant foliage as a surface: crowns as Voronoi cells, shaded gaps between them, leafy noise."""
    m, nt, out = kit.node_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    # Instances share their local coordinates; shift each by its own random so no two crowns match.
    info = nt.nodes.new('ShaderNodeObjectInfo')
    shift = nt.nodes.new('ShaderNodeCombineXYZ')
    for i, k in enumerate((53.1, 71.7, 37.3)):
        nt.links.new(kit.math_node(nt, 'MULTIPLY', info.outputs['Random'], k), shift.inputs[i])
    vec = kit.vmath(nt, 'ADD', tc.outputs[coords], shift.outputs['Vector']).outputs['Vector']
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.feature = 'DISTANCE_TO_EDGE'
    vor.inputs['Scale'].default_value = 1.0 / cell
    nt.links.new(vec, vor.inputs['Vector'])
    vor2 = nt.nodes.new('ShaderNodeTexVoronoi')
    vor2.inputs['Scale'].default_value = 1.0 / cell
    nt.links.new(vec, vor2.inputs['Vector'])
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 6.0 / cell
    noise.inputs['Detail'].default_value = 10
    noise.inputs['Roughness'].default_value = 0.65
    nt.links.new(vec, noise.inputs['Vector'])
    edge = kit.math_node(nt, 'POWER', kit.math_node(nt, 'MULTIPLY', vor.outputs['Distance'], 2.2, clamp=True), 0.6)
    tone = kit.math_node(nt, 'ADD', kit.math_node(nt, 'MULTIPLY', vor2.outputs['Color'], 0.7), kit.math_node(nt, 'MULTIPLY', noise.outputs['Fac'], 0.3))
    col = ramp(nt, tone, stops)
    col = kit.mix_rgb(nt, kit.math_node(nt, 'SUBTRACT', 1.0, edge), col, C(0.005, 0.012, 0.004))
    height = kit.math_node(nt, 'ADD', edge, kit.math_node(nt, 'MULTIPLY', noise.outputs['Fac'], 0.5))
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = bump_strength
    bump.inputs['Distance'].default_value = cell * 0.4
    nt.links.new(height, bump.inputs['Height'])
    p = kit.principled(nt, rough=0.8, spec=0.25)
    nt.links.new(col, p.inputs['Base Color'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


FOREST_STOPS = [(0.0, C(0.02, 0.045, 0.014)), (0.5, C(0.045, 0.085, 0.022)), (0.85, C(0.075, 0.12, 0.03)), (1.0, C(0.11, 0.14, 0.04))]
CROWN_SHELL = foliage_material('crown_shell', 'Object', 0.35, FOREST_STOPS)
HILL_CANOPY = foliage_material('hill_canopy', 'Object', 14.0, FOREST_STOPS, bump_strength=1.0)

# ---------------------------------------------------------------- leaves and branchlets

SOURCES = kit.hidden_collection('branchlets')


def leaf_geom(verts, faces, lv, origin, d_along, d_side, L, W, droop, fold, value):
    """One leaf: a pointed blade along d_along, width along d_side, normal = along x side; folded at the midrib."""
    nrm = np.cross(d_along, d_side)
    ts = (0.0, 0.22, 0.48, 0.74, 1.0)
    half = [W / 2 * math.sin(math.pi * t**0.8) ** 0.85 for t in ts]

    def pt(t, s):
        z = -droop * t * t * L + fold * abs(s)
        return origin + d_along * (t * L) + d_side * s + nrm * z

    n0 = len(verts)
    mid = [pt(t, 0.0) for t in ts]
    left = [pt(ts[i], half[i]) for i in (1, 2, 3)]
    right = [pt(ts[i], -half[i]) for i in (1, 2, 3)]
    verts += mid + left + right
    M = lambda i: n0 + i  # noqa: E731
    Lf = lambda i: n0 + 5 + i  # noqa: E731
    Rt = lambda i: n0 + 8 + i  # noqa: E731
    fs = [
        (M(0), Lf(0), M(1)),
        (M(1), Lf(0), Lf(1), M(2)),
        (M(2), Lf(1), Lf(2), M(3)),
        (M(3), Lf(2), M(4)),
        (M(0), M(1), Rt(0)),
        (M(1), M(2), Rt(1), Rt(0)),
        (M(2), M(3), Rt(2), Rt(1)),
        (M(3), M(4), Rt(2)),
    ]
    faces += fs
    lv += [value] * len(fs)


def unit(v):
    v = np.asarray(v, dtype=np.float64)
    return v / (np.linalg.norm(v) + 1e-12)


def branchlet(name, seed, mat, length, n_twigs, leaves_per_twig, leaf_len, leaf_w, droop=0.25, fold=0.08, spread=50):
    """A leafy branchlet along +x, leaves roughly facing +z, as one mesh (no wood: it doesn't show)."""
    r = np.random.default_rng(seed)
    verts, faces, lv = [], [], []
    for k in range(n_twigs):
        t0 = 0.12 + 0.85 * k / max(1, n_twigs - 1)
        base = np.array([t0 * length, 0.0, 0.08 * length * t0 * t0])
        side = 1 if k % 2 else -1
        a = math.radians(r.uniform(spread - 15, spread + 15)) * side
        tw = unit([math.cos(a), math.sin(a), r.uniform(0.05, 0.3)])
        tl = length * r.uniform(0.28, 0.45) * (1.15 - 0.4 * t0)
        for j in range(leaves_per_twig):
            s = (j + 0.6) / leaves_per_twig
            p = base + tw * tl * s
            ls = 1 if j % 2 else -1
            la = math.radians(r.uniform(35, 65)) * ls
            # Leaf direction: off the twig in the twig's plane, tipped a little up or down.
            perp = unit(np.cross([0, 0, 1], tw))
            d = unit(tw * math.cos(la) + perp * math.sin(la) + np.array([0, 0, r.uniform(-0.25, 0.2)]))
            side_v = unit(np.cross([0, 0, 1], d))
            roll = r.uniform(-0.5, 0.5)
            up = unit(np.cross(d, side_v))
            side_v = unit(side_v * math.cos(roll) + up * math.sin(roll))
            sz = r.uniform(0.8, 1.2) * (1.1 - 0.3 * s)
            leaf_geom(verts, faces, lv, p, d, side_v, leaf_len * sz, leaf_w * sz, droop, fold, r.random())
        tip = base + tw * tl
        leaf_geom(verts, faces, lv, tip, unit(tw + np.array([0, 0, 0.1])), unit(np.cross([0, 0, 1], tw)), leaf_len * 1.1, leaf_w * 1.05, droop, fold, r.random())
    end = np.array([length, 0.0, 0.08 * length])
    for j in range(3):
        a = math.radians((j - 1) * 30)
        d = unit([math.cos(a), math.sin(a), 0.1])
        leaf_geom(verts, faces, lv, end, d, unit(np.cross([0, 0, 1], d)), leaf_len, leaf_w, droop, fold, r.random())
    return kit.mesh_object(name, verts, faces, mat, attrs={'lv': lv}, collection=SOURCES)


# Index → (name, material). Trees pick from these by leaf type.
B = []


def add_branchlet(*args, **kw):
    o = branchlet(f'bl_{len(B):02d}', *args, **kw)
    B.append(o)
    return len(B) - 1


BROAD = [add_branchlet(11 + k, LEAF_CANOPY, 1.7, 7, 6, 0.19, 0.075) for k in range(3)]
FINE = [add_branchlet(21 + k, LEAF_FINE, 1.4, 9, 9, 0.11, 0.045, spread=55) for k in range(2)]
LARGE = [add_branchlet(31, LEAF_LIGHT, 1.8, 4, 3, 0.34, 0.26, droop=0.35, fold=0.04, spread=60)]
SHRUB = [add_branchlet(41 + k, LEAF_SHRUB, 0.9, 6, 5, 0.12, 0.05, spread=45) for k in range(2)]

# ---------------------------------------------------------------- crowns


class Instances:
    def __init__(self):
        self.pos, self.scale, self.euler, self.index, self.tone = [], [], [], [], []

    def add(self, pos, scale, euler, index, tone):
        self.pos.append(pos)
        self.scale.append(scale)
        self.euler.append(euler)
        self.index.append(index)
        self.tone.append(tone)

    def extend(self, pos, scale, euler, index, tone):
        self.pos += list(pos)
        self.scale += list(scale)
        self.euler += list(euler)
        self.index += list(index)
        self.tone += list(tone)

    def build(self, name, source):
        if not self.pos:
            return None
        o = kit.instancer3(name, np.array(self.pos), np.array(self.scale), np.array(self.euler), np.array(self.index), source)
        a = o.data.attributes.new('tone', 'FLOAT', 'POINT')
        a.data.foreach_set('value', np.asarray(self.tone, dtype=np.float32))
        return o


LEAVES = Instances()


def eulers_facing(normals, r, roll=0.6):
    """XYZ Euler angles that point a branchlet's +x along each normal (leaves stay roughly up)."""
    n = normals / (np.linalg.norm(normals, axis=1, keepdims=True) + 1e-12)
    yaw = np.arctan2(n[:, 1], n[:, 0])
    pitch = -np.arcsin(np.clip(n[:, 2], -1, 1))
    rl = r.uniform(-roll, roll, len(n))
    return np.stack([rl, pitch, yaw], 1)


def crown_cluster(centre, radii, density, kinds, tone, r, scale=1.0, lump=0.25):
    """Branchlets over an ellipsoidal leaf cluster: mostly on the surface, some inside."""
    rx, ry, rz = radii
    p = 1.6
    area = 4 * math.pi * (((rx * ry) ** p + (rx * rz) ** p + (ry * rz) ** p) / 3) ** (1 / p)
    n = max(4, int(area * density))
    d = r.normal(size=(n, 3))
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    # Fewer underneath: crowns are lit and leafy on top.
    keep = (d[:, 2] > -0.55) | (r.random(n) < 0.35)
    d = d[keep]
    n = len(d)
    depth = 1 - lump * r.random(n) ** 2 - 0.12 * r.random(n)
    pos = np.asarray(centre) + d * np.array(radii) * depth[:, None]
    out = d + np.array([0, 0, 0.45])
    eul = eulers_facing(out, r)
    s = scale * r.uniform(0.8, 1.2, n)
    LEAVES.extend(pos, np.stack([s, s, s], 1), eul, r.choice(kinds, n), tone + r.normal(0, 0.03, n))


def lerp(a, b, t):
    return a + (b - a) * t


TUBES = {'bark': kit.TubeBuilder(), 'bark_dark': kit.TubeBuilder(), 'palm': kit.TubeBuilder(), 'bamboo': kit.TubeBuilder()}
CORES = []  # (centre, radii, tone) dark crown cores so gaps show shade, not sky


def curve(p0, p1, bend, n=6):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    pts = []
    for i in range(n):
        t = i / (n - 1)
        q = lerp(p0, p1, t)
        q = q + np.asarray(bend) * math.sin(math.pi * t)
        pts.append(q)
    return np.array(pts)


def buttresses(x, y, z, r0, h, r, tb):
    """Plank buttresses: thin fins running out from the base of the trunk."""
    k = r.integers(3, 6)
    a0 = r.uniform(0, 2 * math.pi)
    for i in range(k):
        a = a0 + 2 * math.pi * i / k + r.uniform(-0.4, 0.4)
        reach = r0 + r.uniform(1.2, 2.8)
        top = h * r.uniform(0.7, 1.1)
        ca, sa = math.cos(a), math.sin(a)
        t = 0.09
        P = lambda d, zz, s: (x + ca * d - sa * s, y + sa * d + ca * s, z + zz)  # noqa: E731
        v0 = len(tb.v)
        tb.v += [P(r0 * 0.5, top, -t), P(r0 * 0.5, top, t), P(r0 * 0.5, -0.3, -t), P(r0 * 0.5, -0.3, t), P(reach, -0.3, -t * 0.6), P(reach, -0.3, t * 0.6), P(lerp(r0, reach, 0.45), top * 0.32, -t * 0.8), P(lerp(r0, reach, 0.45), top * 0.32, t * 0.8)]
        tb.f += [(v0, v0 + 6, v0 + 4, v0 + 2), (v0 + 1, v0 + 3, v0 + 5, v0 + 7), (v0, v0 + 1, v0 + 7, v0 + 6), (v0 + 6, v0 + 7, v0 + 5, v0 + 4)]


# Archetypes: height, trunk radius, crown radius, clusters, where the crown starts (share of the
# height), cluster flattening, leaf density, buttress chance.
ARCHETYPES = {
    'emergent': dict(h=(42, 56), r0=(0.55, 0.8), crown=(10, 14), clusters=(11, 16), base=(0.72, 0.8), squash=0.55, density=1.7, buttress=1.0),
    'canopy': dict(h=(26, 38), r0=(0.3, 0.5), crown=(6, 9), clusters=(9, 14), base=(0.5, 0.62), squash=0.75, density=1.9, buttress=0.4),
    'subcanopy': dict(h=(14, 24), r0=(0.16, 0.3), crown=(3.5, 6), clusters=(6, 10), base=(0.4, 0.55), squash=0.8, density=2.1, buttress=0.0),
    'understorey': dict(h=(5, 12), r0=(0.07, 0.15), crown=(2.0, 3.5), clusters=(3, 6), base=(0.3, 0.5), squash=0.85, density=2.3, buttress=0.0),
}


def tree(x, y, kind, r):
    """One tree at ground position (x, y): trunk, branches and crown clusters by archetype."""
    z = float(terrain(x, y))
    a = ARCHETYPES[kind]
    tone = r.uniform(0.1, 0.95)
    H = r.uniform(*a['h'])
    # Trees right at the top of the valley bank are young and short (it was cleared for the garden).
    out = math.hypot(x, y) - float(edge_radius(bearing_of(x, y)))
    H *= 1 - 0.45 * float(valley_weight(bearing_of(x, y))) * max(0.0, 1 - out / 30)
    r0 = r.uniform(*a['r0'])
    crown_r = r.uniform(*a['crown'])
    clusters = int(r.integers(*a['clusters']))
    base = H * r.uniform(*a['base'])
    if kind == 'emergent':
        kinds, tb = (BROAD if r.random() < 0.6 else FINE), TUBES['bark']
    elif kind == 'canopy':
        kinds = BROAD if r.random() < 0.55 else (FINE if r.random() < 0.7 else LARGE)
        tb = TUBES['bark'] if r.random() < 0.6 else TUBES['bark_dark']
    else:
        kinds = LARGE if r.random() < 0.3 else (FINE if r.random() < 0.5 else BROAD)
        tb = TUBES['bark_dark']
    if r.random() < a['buttress']:
        buttresses(x, y, z, r0, r.uniform(1.5, 4.5) * r0 / 0.6, r, tb)
    lean = r.normal(0, 0.03, 2) * H
    top = np.array([x + lean[0], y + lean[1], z + base])
    trunk = curve([x, y, z - 0.5], [top[0], top[1], z + H * 0.85], [r.normal(0, 0.4), r.normal(0, 0.4), 0], 8)
    tb.tube(trunk, np.linspace(r0, r0 * 0.45, len(trunk)), sides=10 if r0 > 0.25 else 6)
    for c in range(clusters):
        # Clusters fill the crown from its base to the top, widest a third of the way up.
        t = r.uniform(0, 1) ** 0.8
        cz = z + base + (H - base) * t
        width = crown_r * (0.55 + 0.45 * math.sin(math.pi * min(1.0, 0.25 + t)))
        ang = r.uniform(0, 2 * math.pi)
        d = width * math.sqrt(r.uniform(0.05, 1.0))
        cx, cy = top[0] + d * math.cos(ang), top[1] + d * math.sin(ang)
        size = crown_r * r.uniform(0.38, 0.55)
        radii = (size * r.uniform(0.9, 1.15), size * r.uniform(0.9, 1.15), size * a['squash'] * r.uniform(0.85, 1.15))
        # A branch from the trunk out to the cluster, rising as it goes.
        start = np.array([top[0], top[1], min(cz - 1.0, z + base + (H - base) * t * 0.6)])
        end = np.array([cx, cy, cz - radii[2] * 0.4])
        br = curve(start, end, [0, 0, r.uniform(0.3, 1.5)], 5)
        tb.tube(br, np.linspace(max(0.04, r0 * 0.4), 0.04, len(br)), sides=6 if r0 > 0.2 else 4)
        crown_cluster((cx, cy, cz), radii, a['density'], kinds, tone, r)
        CORES.append(((cx, cy, cz), tuple(v * 0.72 for v in radii), tone))
    return H


# ---------------------------------------------------------------- the forest


def in_forest(x, y, margin=0.0):
    b = bearing_of(x, y)
    return np.hypot(x, y) > edge_radius(b) + margin


def jittered(spacing, rmax, jitter=0.4, rmin=0.0):
    g = np.arange(-rmax, rmax, spacing)
    GX, GY = np.meshgrid(g, g)
    pts = np.stack([GX.ravel(), GY.ravel()], 1) + rng.uniform(-jitter * spacing, jitter * spacing, (GX.size, 2))
    d = np.hypot(pts[:, 0], pts[:, 1])
    return pts[(d < rmax) & (d >= rmin)]


def reach(x, y):
    """Detail range: further out along the valley, where the canopy is seen from above."""
    return DETAIL * (1 + 0.6 * float(valley_weight(bearing_of(x, y))))


# Layers, tallest first: spacing within a layer, and how deep into the forest the layer still
# shows (lower layers are hidden under the canopy further in, except down the valley slope).
LAYERS = (('emergent', 30, 0.6, 1e9), ('canopy', 10, 0.95, 1e9), ('subcanopy', 7, 0.85, 45), ('understorey', 4.2, 0.85, 22))
trunks = []  # every trunk so far, so no two stand in the same spot
counts = {}
for kind, spacing, keep, max_depth in LAYERS:
    pts = jittered(spacing, DETAIL * 1.6)
    rng.shuffle(pts)
    mine = []
    for x, y in pts:
        if not in_forest(x, y, 1.5) or math.hypot(x, y) > reach(x, y) or rng.random() > keep:
            continue
        depth = math.hypot(x, y) - float(edge_radius(bearing_of(x, y)))
        if depth > max_depth * (1 + 2.5 * float(valley_weight(bearing_of(x, y)))):
            continue
        if any((x - px) ** 2 + (y - py) ** 2 < (spacing * 0.75) ** 2 for px, py in mine[-3000:]):
            continue
        if any((x - px) ** 2 + (y - py) ** 2 < 1.6**2 for px, py in trunks[-6000:]):
            continue
        mine.append((x, y))
        trunks.append((x, y))
        tree(x, y, kind, np.random.default_rng(rng.integers(1 << 31)))
    counts[kind] = len(mine)
print('trees', counts, 'branchlets', len(LEAVES.pos))


def curtain():
    """Climbers and saplings along the edge: a ragged wall of leaves from the ground to the canopy."""
    for b in np.arange(0, 360, 0.7):
        e = float(edge_radius(b))
        top = 9 + 9 * (0.5 + 0.5 * math.sin(math.radians(b) * 7 + 1.3)) + 5 * (0.5 + 0.5 * math.sin(math.radians(b) * 23))
        top *= 1 - 0.85 * float(valley_weight(b))
        for zz in np.arange(0.8, top, 0.85):
            if math.sin(b * 0.9 + zz * 0.7) * math.cos(b * 0.37 - zz * 0.45) > 0.45:
                continue  # gaps
            bulge = 1.6 * math.sin(zz * 0.5 + b * 0.2)
            for layer in range(2):
                bb = b + rng.uniform(-0.35, 0.35)
                rr = e + 2.2 + layer * 1.3 + bulge + rng.uniform(-0.5, 0.5)
                x, y = kit.polar(bb, rr)
                z = float(terrain(x, y)) + zz + rng.uniform(-0.3, 0.3)
                out = np.array([-math.sin(math.radians(bb)), -math.cos(math.radians(bb)), rng.uniform(-0.6, 0.5)])
                out += rng.normal(0, 0.45, 3)
                eul = eulers_facing(out[None, :], rng, roll=0.9)[0]
                s = rng.uniform(0.8, 1.2)
                LEAVES.add((x, y, z), (s, s, s), eul, rng.choice(BROAD + LARGE + FINE), rng.uniform(0.3, 1.0))


curtain()
print('curtain done, branchlets', len(LEAVES.pos))

# ---------------------------------------------------------------- the forest edge: bamboo, palms, ferns, bananas, shrubs

PALM_SRC = kit.hidden_collection('palm_parts')


def frond(name, length, n_leaflets, leaflet_len, leaflet_w, arch, droop, mat, seed):
    """A pinnate frond along +x arching down, with leaflets both sides (one mesh)."""
    r = np.random.default_rng(seed)
    verts, faces, lv = [], [], []
    for i in range(n_leaflets):
        t = 0.12 + 0.88 * i / (n_leaflets - 1)
        x = t * length
        zc = arch * length * math.sin(math.pi * t * 0.5) - droop * length * t**2.2
        dz = (arch * math.pi * 0.5 * math.cos(math.pi * t * 0.5) - droop * 2.2 * t**1.2) * 1.0
        rach = unit([1.0, 0.0, dz])
        for side in (-1, 1):
            a = math.radians(r.uniform(50, 70))
            d = unit(rach * math.cos(a) + np.array([0, side, 0]) * math.sin(a) + np.array([0, 0, -r.uniform(0.1, 0.5)]))
            sv = unit(np.cross(rach, d)) * side
            ll = leaflet_len * (1 - 0.55 * t) * math.sin(math.pi * (0.15 + 0.85 * t)) ** 0.3
            leaf_geom(verts, faces, lv, np.array([x, 0.0, zc]), d, sv, ll, leaflet_w, 0.3, 0.03, r.random())
    return kit.mesh_object(name, verts, faces, mat, attrs={'lv': lv}, collection=PALM_SRC)


F = []
for k in range(3):
    F.append(frond(f'fr_{len(F):02d}', 3.6, 34, 0.75, 0.045, 0.35, 0.55, LEAF_PALM, 50 + k))  # coconut / royal palm
for k in range(2):
    F.append(frond(f'fr_{len(F):02d}', 2.4, 26, 0.32, 0.05, 0.3, 0.4, LEAF_FINE, 60 + k))  # tree fern
for k in range(2):
    # Banana leaf: few, very wide leaflets read as one torn blade.
    F.append(frond(f'fr_{len(F):02d}', 2.0, 12, 0.36, 0.17, 0.25, 0.35, LEAF_LIGHT, 70 + k))
PALM_F, FERN_F, BANANA_F = [0, 1, 2], [3, 4], [5, 6]
FRONDS = Instances()


def crown_of_fronds(top, n, kinds, r, tone, tilt=(0.1, 0.7), scale=1.0):
    for i in range(n):
        yaw = 2 * math.pi * i / n + r.uniform(-0.2, 0.2)
        pitch = -r.uniform(*tilt)  # negative: up
        s = scale * r.uniform(0.85, 1.15)
        FRONDS.add(top, (s, s, s), (r.uniform(-0.3, 0.3), pitch, yaw), r.choice(kinds), tone)


def palm(x, y, r, garden=False):
    z = float(terrain(x, y))
    h = r.uniform(9, 16) if not garden else r.uniform(7, 12)
    lean = r.normal(0, 0.06, 2) * h
    top = np.array([x + lean[0], y + lean[1], z + h])
    tr = curve([x, y, z - 0.3], top, [lean[0] * 0.3, lean[1] * 0.3, 0], 8)
    TUBES['palm'].tube(tr, np.linspace(0.2, 0.15, len(tr)), sides=9)
    crown_of_fronds(top, r.integers(14, 19), PALM_F, r, r.uniform(0.2, 0.8), tilt=(-0.6, 0.8))


def tree_fern(x, y, r):
    z = float(terrain(x, y))
    h = r.uniform(2.5, 5.5)
    top = np.array([x, y, z + h])
    TUBES['bark_dark'].tube(curve([x, y, z - 0.2], top, [r.normal(0, 0.2), r.normal(0, 0.2), 0], 5), np.linspace(0.14, 0.11, 5), sides=7)
    crown_of_fronds(top, r.integers(10, 15), FERN_F, r, r.uniform(0.2, 0.8), tilt=(-0.4, 0.5))


def banana(x, y, r):
    z = float(terrain(x, y))
    for _ in range(r.integers(2, 5)):
        ox, oy = r.normal(0, 0.7, 2)
        h = r.uniform(2.2, 4.0)
        top = np.array([x + ox, y + oy, z + h])
        TUBES['palm'].tube(curve([x + ox, y + oy, z - 0.2], top, [0, 0, 0], 4), np.linspace(0.13, 0.09, 4), sides=7)
        crown_of_fronds(top, r.integers(6, 10), BANANA_F, r, r.uniform(0.3, 0.9), tilt=(-1.1, 0.2), scale=1.15)


def bamboo_clump(x, y, r):
    z = float(terrain(x, y))
    tone = r.uniform(0.5, 1.0)
    for _ in range(r.integers(18, 34)):
        ox, oy = r.normal(0, 0.9, 2)
        h = r.uniform(9, 16)
        out = unit([ox + r.normal(0, 0.3), oy + r.normal(0, 0.3), 0.0])
        base = np.array([x + ox, y + oy, z - 0.2])
        tip = base + np.array([out[0] * h * 0.45, out[1] * h * 0.45, h * 0.85])
        pts = curve(base, tip, [out[0] * h * 0.12, out[1] * h * 0.12, 0], 9)
        TUBES['bamboo'].tube(pts, np.linspace(0.05, 0.015, len(pts)), sides=5)
        for p in pts[4:]:
            for _ in range(3):
                d = unit(np.r_[out[:2] + r.normal(0, 0.6, 2), r.uniform(-0.4, 0.3)])
                eul = eulers_facing(d[None, :], r, roll=0.8)[0]
                s = r.uniform(0.6, 0.9)
                LEAVES.add(p, (s, s, s), eul, r.choice(FINE), tone)


def shrub(x, y, r, size, kinds=None, tone=None):
    z = float(terrain(x, y))
    t = r.uniform(0, 0.6) if tone is None else tone
    crown_cluster((x, y, z + size * 0.55), (size, size * r.uniform(0.8, 1.2), size * 0.7), 3.2, kinds or SHRUB, t, r, scale=0.75, lump=0.45)
    CORES.append(((x, y, z + size * 0.5), (size * 0.7, size * 0.7, size * 0.5), t))


# Along the edge, a band of mixed edge growth.
angles = np.arange(0, 360, 1.2)
for b in angles:
    for depth in (1.5, 5.0, 9.0):
        bb = b + rng.uniform(-0.6, 0.6)
        rr = float(edge_radius(bb)) + depth + rng.uniform(-1, 1.5)
        x, y = kit.polar(bb, rr)
        u = rng.random()
        rr_ = np.random.default_rng(rng.integers(1 << 31))
        if depth < 3:
            if u < 0.55:
                shrub(x, y, rr_, rng.uniform(1.2, 2.6), kinds=BROAD + LARGE, tone=rng.uniform(0.3, 1.0))
            elif u < 0.62:
                tree_fern(x, y, rr_)
            elif u < 0.7:
                banana(x, y, rr_)
        elif depth < 6:
            if u < 0.06:
                bamboo_clump(x, y, rr_)
            elif u < 0.12:
                palm(x, y, rr_)
            elif u < 0.4:
                shrub(x, y, rr_, rng.uniform(2.0, 3.5), kinds=BROAD + LARGE + FINE, tone=rng.uniform(0.2, 1.0))
        elif u < 0.25:
            tree_fern(x, y, rr_)
print('edge done, branchlets', len(LEAVES.pos), 'fronds', len(FRONDS.pos))

# ---------------------------------------------------------------- the garden

GARDEN = 70.0  # half-size of the garden raster (m)
RES = 4096
POOL = dict(cx=12.0, cy=24.0, w=8.0, d=25.0, ang=math.radians(-12))


def garden_raster():
    n = RES
    c = (np.arange(n) + 0.5) / n * 2 * GARDEN - GARDEN
    X, Y = np.meshgrid(c, -c)  # row 0 is north
    b = bearing_of(X, Y)
    r = np.hypot(X, Y)
    e = edge_radius(b)
    rngl = np.random.default_rng(3)
    img = np.zeros((n, n, 3), np.float32)
    # Lawn with mowing stripes and soft patches; bare earth and litter towards the forest.
    stripes = 0.5 + 0.5 * np.sin((X * 0.94 + Y * 0.34) * math.pi / 1.6)
    patch = 0.5 + 0.5 * undulation(X, Y, 9.0) * 0.6
    # Linear albedo: mown grass reflects about a tenth of green light.
    grass = np.stack([0.045 + 0.012 * stripes + 0.015 * patch, 0.095 + 0.018 * stripes + 0.02 * patch, 0.028 + 0.006 * stripes], -1)
    grain = rngl.normal(0, 0.006, (n, n, 1))
    img[:] = grass + grain
    litter = np.stack([0.07 + 0.03 * patch, 0.05 + 0.02 * patch, 0.03 + 0.01 * patch], -1)
    w = smoothstep(-6, 0, r - e)[..., None]
    img = img * (1 - w) + litter * w
    # A path: a loop round the lawn and a spur to the pool, light pavers with joints.
    loop = np.abs(r - (e - 9)) < 0.9
    spur = (np.abs(X - 0.4 * Y) < 0.8) & (Y > 0) & (Y < 15)
    path = loop | spur
    joints = ((np.floor(X / 0.6) + np.floor(Y / 0.3)) % 2 == 0)
    pav = np.where(joints[..., None], [0.3, 0.29, 0.27], [0.36, 0.35, 0.33]) + rngl.normal(0, 0.01, (n, n, 1))
    img = np.where(path[..., None], pav, img)
    # Pool deck (timber) and coping.
    ca, sa = math.cos(POOL['ang']), math.sin(POOL['ang'])
    lx = (X - POOL['cx']) * ca + (Y - POOL['cy']) * sa
    ly = -(X - POOL['cx']) * sa + (Y - POOL['cy']) * ca
    deck = (np.abs(lx) < POOL['w'] / 2 + 3.2) & (np.abs(ly) < POOL['d'] / 2 + 3.2)
    boards = 0.85 + 0.15 * ((np.floor(ly / 0.14) % 3) / 2)
    wood = np.stack([0.2 * boards, 0.12 * boards, 0.07 * boards], -1) + rngl.normal(0, 0.008, (n, n, 1))
    img = np.where(deck[..., None], wood, img)
    coping = (np.abs(lx) < POOL['w'] / 2 + 0.4) & (np.abs(ly) < POOL['d'] / 2 + 0.4)
    img = np.where(coping[..., None], [0.55, 0.53, 0.5], img)
    # Planting beds: dark mulch in a ring inside the edge.
    bed = (r > e - 6.5) & (r < e - 1.5) & ~path
    img = np.where(bed[..., None], np.array([0.035, 0.025, 0.018]) + rngl.normal(0, 0.004, (n, n, 1)), img)
    srgb = np.clip(img, 0, 1) ** (1 / 2.2)
    path_png = os.path.join(A['out'], 'garden.png')
    save_png(path_png, (srgb * 255 + 0.5).astype(np.uint8))
    return path_png, lx, ly


garden_png, _, _ = garden_raster()


def image_ground_material(name, path, extent):
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
    bump.inputs['Strength'].default_value = 0.25
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    p = kit.principled(nt, rough=0.9, spec=0.3)
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


# The garden as a fine terrain patch, the rest of the ground coarser.
gm = image_ground_material('garden', garden_png, GARDEN)
n = 280
c = np.linspace(-GARDEN, GARDEN, n)
GX, GY = np.meshgrid(c, c)
GZ = terrain(GX, GY)
pool_ca, pool_sa = math.cos(POOL['ang']), math.sin(POOL['ang'])
verts = np.stack([GX, GY, GZ], -1).reshape(-1, 3)
faces = []
for i in range(n - 1):
    for j in range(n - 1):
        cx, cy = (c[j] + c[j + 1]) / 2, (c[i] + c[i + 1]) / 2
        # A round patch (the outer terrain takes over beyond it), with a hole for the pool.
        if math.hypot(cx, cy) > GARDEN * 0.99:
            continue
        lx = (cx - POOL['cx']) * pool_ca + (cy - POOL['cy']) * pool_sa
        ly = -(cx - POOL['cx']) * pool_sa + (cy - POOL['cy']) * pool_ca
        if abs(lx) < POOL['w'] / 2 - 0.2 and abs(ly) < POOL['d'] / 2 - 0.2:
            continue
        a = i * n + j
        faces.append((a, a + 1, a + n + 1, a + n))
kit.mesh_object('garden', verts, faces, gm, smooth=True)
outer = terrain_mesh('terrain', GARDEN * 0.97, 30000, 420, 720, HILL_CANOPY)

# The lap pool: a tiled basin under a clear water surface.
tile = kit.simple_mat('pool_tile', C(0.18, 0.42, 0.48), 0.3, spec=0.5)
water_m, nt, out_n = kit.node_mat('water')
# Fresnel mix of a mirror and a clear see-through layer (no refraction, so sunlight reaches the
# floor without caustics).
fres = nt.nodes.new('ShaderNodeFresnel')
fres.inputs['IOR'].default_value = 1.333
clear = nt.nodes.new('ShaderNodeBsdfTransparent')
clear.inputs['Color'].default_value = (0.82, 0.95, 0.95, 1)
mirror = nt.nodes.new('ShaderNodeBsdfGlossy')
mirror.inputs['Roughness'].default_value = 0.03
wn = nt.nodes.new('ShaderNodeTexNoise')
wn.inputs['Scale'].default_value = 1.6
wn.inputs['Detail'].default_value = 4
wb = nt.nodes.new('ShaderNodeBump')
wb.inputs['Strength'].default_value = 0.06
nt.links.new(wn.outputs['Fac'], wb.inputs['Height'])
nt.links.new(wb.outputs['Normal'], mirror.inputs['Normal'])
nt.links.new(wb.outputs['Normal'], fres.inputs['Normal'])
mixw = nt.nodes.new('ShaderNodeMixShader')
nt.links.new(fres.outputs['Fac'], mixw.inputs['Fac'])
nt.links.new(clear.outputs['BSDF'], mixw.inputs[1])
nt.links.new(mirror.outputs['BSDF'], mixw.inputs[2])
nt.links.new(mixw.outputs['Shader'], out_n.inputs['Surface'])
mb = kit.MeshBuilder()
hw, hd = POOL['w'] / 2, POOL['d'] / 2
corners = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]


def to_world(px, py, z):
    return (POOL['cx'] + px * pool_ca - py * pool_sa, POOL['cy'] + px * pool_sa + py * pool_ca, z)


basin = []
for i in range(4):
    (ax, ay), (bx, by) = corners[i], corners[(i + 1) % 4]
    basin.append([to_world(ax, ay, 0.0), to_world(ax, ay, -1.4), to_world(bx, by, -1.4), to_world(bx, by, 0.0)])
basin.append([to_world(x_, y_, -1.4) for x_, y_ in corners])
kit.mesh_object('pool_basin', [v for f in basin for v in f], [tuple(range(4 * k, 4 * k + 4)) for k in range(len(basin))], tile)
kit.mesh_object('pool_water', [to_world(x_, y_, -0.12) for x_, y_ in corners], [(0, 1, 2, 3)], water_m)

# Garden planting: shrub beds, frangipani, palms.
for b in np.arange(0, 360, 4.5):
    rr = float(edge_radius(b)) - rng.uniform(2.5, 5.5)
    x, y = kit.polar(b + rng.uniform(-1.5, 1.5), rr)
    if (x - POOL['cx']) ** 2 + (y - POOL['cy']) ** 2 < (POOL['d'] / 2 + 5) ** 2:
        continue
    shrub(x, y, np.random.default_rng(rng.integers(1 << 31)), rng.uniform(0.6, 1.3), tone=rng.uniform(0, 1.0))


def frangipani(x, y, r):
    z = float(terrain(x, y))
    tone = r.uniform(0.4, 0.9)
    tb = TUBES['bark']
    tips = [np.array([x, y, z - 0.2])]
    for level in range(3):
        nxt = []
        for p in tips:
            for _ in range(2 if level else 3):
                d = unit([r.normal(), r.normal(), 1.4 + level * 0.3])
                q = p + d * r.uniform(1.2, 1.8)
                tb.tube(np.array([p, q]), [0.13 / (level + 1) ** 0.6, 0.09 / (level + 1) ** 0.6], sides=6)
                nxt.append(q)
        tips = nxt
    for p in tips:
        crown_cluster(tuple(p + [0, 0, 0.3]), (0.9, 0.9, 0.5), 5.0, LARGE, tone, r, scale=0.55)


for x, y in ((-14.0, 20.0), (26.0, 8.0), (-22.0, -6.0)):
    frangipani(x, y, np.random.default_rng(abs(int(x * 7 + y * 131))))
for x, y in ((3.0, 32.0), (22.0, 34.0), (-8.0, 28.0), (-30.0, 12.0), (30.0, -10.0)):
    palm(x, y, np.random.default_rng(abs(int(x * 13 + y * 157))), garden=True)

# ---------------------------------------------------------------- far forest: crown shells

SHELLS = kit.hidden_collection('shells')


def shell_mesh(name, seed, squash):
    r = np.random.default_rng(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0)
    ico = bpy.context.object
    v = np.array([p.co[:] for p in ico.data.vertices])
    f = [tuple(p.vertices) for p in ico.data.polygons]
    bpy.data.objects.remove(ico)
    # Lumps: a few bulges, flattened underneath.
    bumps = r.normal(size=(7, 3))
    bumps /= np.linalg.norm(bumps, axis=1, keepdims=True)
    k = np.ones(len(v))
    for bvec in bumps:
        k += 0.18 * np.maximum(0, v @ bvec) ** 6
    v = v * k[:, None]
    v[:, 2] = np.where(v[:, 2] < 0, v[:, 2] * 0.35, v[:, 2]) * squash
    return kit.mesh_object(name, v, f, CROWN_SHELL, smooth=True, collection=SHELLS)


for k in range(5):
    shell_mesh(f'sh_{k:02d}', 90 + k, (0.55, 0.65, 0.5, 0.7, 0.6)[k])
far = jittered(8.5, 1400, jitter=0.45)
d = np.hypot(far[:, 0], far[:, 1])
fb = bearing_of(far[:, 0], far[:, 1])
keep = (d > np.array([reach(x, y) for x, y in far]) * 0.92) & in_forest(far[:, 0], far[:, 1], 3)
# Out of the valley the far forest is hidden behind the near one; keep it sparse there.
keep &= (valley_weight(fb) > 0.25) | (rng.random(len(far)) < 0.3)
far = far[keep]
nf = len(far)
fz = terrain(far[:, 0], far[:, 1])
size = rng.uniform(4.5, 9.0, nf) * np.where(rng.random(nf) < 0.08, 1.7, 1.0)
height = rng.uniform(22, 38, nf) * np.where(size > 9, 1.3, 1.0)
pos = np.stack([far[:, 0], far[:, 1], fz + height - size * 0.3], 1)
scl = np.stack([size, size * rng.uniform(0.85, 1.15, nf), size], 1)
eul = np.stack([np.zeros(nf), np.zeros(nf), rng.uniform(0, 2 * np.pi, nf)], 1)
shells = kit.instancer3('far_crowns', pos, scl, eul, rng.integers(0, 5, nf), SHELLS)
print('far crowns', nf)

# Dark cores inside the near crowns.
CORE_SRC = kit.hidden_collection('cores')
core_mat = kit.simple_mat('core', C(0.012, 0.025, 0.008), 0.9, spec=0.1)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0)
core = bpy.context.object
core.name = 'core_00'
core.data.materials.append(core_mat)
bpy.context.scene.collection.objects.unlink(core)
CORE_SRC.objects.link(core)
cpos = np.array([c[0] for c in CORES])
crad = np.array([c[1] for c in CORES])
kit.instancer3('crown_cores', cpos, crad, np.zeros((len(CORES), 3)), np.zeros(len(CORES), dtype=np.int32), CORE_SRC)

# ---------------------------------------------------------------- far ranges


def ridge(name, b0, b1, d0, d1, hmax, seed):
    r = np.random.default_rng(seed)
    nb, nd = 320, 60
    bs = np.radians(np.linspace(b0, b1, nb))
    ds = np.linspace(d0, d1, nd)
    phase = r.uniform(0, 100, 6)
    verts = []
    for dd in ds:
        t = (dd - d0) / (d1 - d0)
        env = math.sin(math.pi * min(1.0, t * 1.4)) ** 0.7
        for bb in bs:
            h = 0.0
            for k, f in enumerate((3, 7, 15, 31, 63, 127)):
                h += math.sin(bb * f + phase[k]) * math.cos(dd / 1000 * (k + 1) * 0.7 + phase[k]) / (k + 1) ** 1.1
            h = max(0.0, 0.5 + 0.5 * h) ** 1.4 * hmax * env
            verts.append((dd * math.sin(bb), dd * math.cos(bb), h))
    faces = []
    for i in range(nd - 1):
        for j in range(nb - 1):
            a = i * nb + j
            faces.append((a, a + 1, a + nb + 1, a + nb))
    return kit.mesh_object(name, verts, faces, HILL_CANOPY, smooth=True)


ridge('range_near', -40, 90, 7000, 16000, 650, 3)
ridge('titiwangsa', -20, 140, 18000, 42000, 1300, 5)

# ---------------------------------------------------------------- night lights

if NIGHT:
    lamp = kit.simple_mat('lamp', C(0.1, 0.1, 0.1), emit=C(1.0, 0.72, 0.42), emit_strength=60)
    pool_light = kit.simple_mat('pool_light', C(0.1, 0.1, 0.1), emit=C(0.4, 0.85, 1.0), emit_strength=25)
    mb = kit.MeshBuilder()
    for b in np.arange(0, 360, 9):
        rr = float(edge_radius(b)) - 9
        x, y = kit.polar(b, rr + 1.3)
        mb.box(x - 0.08, y - 0.08, 0.55, x + 0.08, y + 0.08, 0.75)
    mb.build('bollards', lamp)
    pb = kit.MeshBuilder()
    for k in range(6):
        py = -POOL['d'] / 2 + (k + 0.5) * POOL['d'] / 6
        for side in (-1, 1):
            x, y, z = to_world(side * (POOL['w'] / 2 - 0.02), py, -0.6)
            pb.box(x - 0.12, y - 0.12, z - 0.12, x + 0.12, y + 0.12, z + 0.12)
    pb.build('pool_lights', pool_light)
    # Houses and street lamps far off in the valley.
    hl = kit.simple_mat('far_lights', C(0.0, 0.0, 0.0), emit=C(1.0, 0.75, 0.45), emit_strength=400)
    fm = kit.MeshBuilder()
    for _ in range(260):
        bb = VALLEY_BEARING + rng.normal(0, 30)
        dd = rng.uniform(2500, 15000)
        x, y = kit.polar(bb, dd)
        z = float(terrain(x, y)) + 2
        s = 1.2 + dd / 6000
        fm.box(x - s, y - s, z, x + s, y + s, z + s)
    fm.build('far_lights', hl)

# ---------------------------------------------------------------- build and render

for key, mat in (('bark', BARK), ('bark_dark', BARK_DARK), ('palm', PALM_TRUNK), ('bamboo', BAMBOO)):
    if TUBES[key].f:
        TUBES[key].build(f'wood_{key}', mat)
LEAVES.build('leaves', SOURCES)
FRONDS.build('fronds', PALM_SRC)
print('branchlets', len(LEAVES.pos), 'fronds', len(FRONDS.pos), 'cores', len(CORES))
kit.render_to_npy(sc, A['out'], A['mode'])
print('done', A['mode'])
