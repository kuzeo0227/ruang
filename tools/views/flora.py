"""Tropical plants for the Blender views: leaf, bark and distant-foliage materials, leafy branchlets
and palm fronds (every leaf is geometry), trees, palms and shrubs, and lumpy distant crowns.

Create one Flora after kit.reset_scene(), place plants with its methods, then call build():

    fl = flora.Flora()
    fl.palm(x, y, z, rng, lean=(0.3, 0.1))
    fl.tree(x, y, z, 'canopy', rng)
    fl.build()

Plants are instanced: branchlets and fronds are a handful of meshes, placed per leaf cluster with a
per-plant 'tone' that the leaf materials read, so neighbours differ in colour.
"""

import math

import bpy
import numpy as np

import kit

C = lambda r, g, b: (r, g, b, 1.0)  # noqa: E731


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
    """Leaves: tone per plant (instancer attribute 'tone'), a little per branchlet and per leaf."""
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
    nt.links.new(kit.mix_rgb(nt, 1.0, col, (1.6, 1.9, 0.7, 1), 'MULTIPLY'), tr.inputs['Color'])
    mix = nt.nodes.new('ShaderNodeMixShader')
    mix.inputs['Fac'].default_value = translucent
    nt.links.new(p.outputs['BSDF'], mix.inputs[1])
    nt.links.new(tr.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    return m


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
    tone = kit.math_node(nt, 'ADD', kit.math_node(nt, 'MULTIPLY', vor2.outputs['Color'], 0.35), kit.math_node(nt, 'MULTIPLY', noise.outputs['Fac'], 0.25))
    tone = kit.math_node(nt, 'ADD', tone, kit.math_node(nt, 'MULTIPLY', info.outputs['Random'], 0.45))
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


def unit(v):
    v = np.asarray(v, dtype=np.float64)
    return v / (np.linalg.norm(v) + 1e-12)


def lerp(a, b, t):
    return a + (b - a) * t


def curve(p0, p1, bend, n=6):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    return np.array([lerp(p0, p1, i / (n - 1)) + np.asarray(bend) * math.sin(math.pi * i / (n - 1)) for i in range(n)])


def leaf_geom(verts, faces, lv, origin, d_along, d_side, L, W, droop, fold, value):
    """One leaf: a pointed blade along d_along, width along d_side, folded at the midrib."""
    nrm = np.cross(d_along, d_side)
    ts = (0.0, 0.22, 0.48, 0.74, 1.0)
    half = [W / 2 * math.sin(math.pi * t**0.8) ** 0.85 for t in ts]

    def pt(t, s):
        return origin + d_along * (t * L) + d_side * s + nrm * (-droop * t * t * L + fold * abs(s))

    n0 = len(verts)
    verts += [pt(t, 0.0) for t in ts] + [pt(ts[i], half[i]) for i in (1, 2, 3)] + [pt(ts[i], -half[i]) for i in (1, 2, 3)]
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


def eulers_facing(normals, r, roll=0.6):
    """XYZ Euler angles that point a part's +x along each normal (leaves stay roughly up)."""
    n = normals / (np.linalg.norm(normals, axis=1, keepdims=True) + 1e-12)
    yaw = np.arctan2(n[:, 1], n[:, 0])
    pitch = -np.arcsin(np.clip(n[:, 2], -1, 1))
    return np.stack([r.uniform(-roll, roll, len(n)), pitch, yaw], 1)


class Instances:
    """Points at which to place source objects, with scale, rotation, which source and a tone."""

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


# Tree archetypes: height, trunk radius, crown radius, clusters, where the crown starts (share of
# the height), cluster flattening, leaf density. 'ketapang' is the beach almond with its tiers.
ARCHETYPES = {
    'canopy': dict(h=(20, 30), r0=(0.3, 0.45), crown=(5, 8), clusters=(9, 14), base=(0.5, 0.62), squash=0.75, density=2.4),
    'garden': dict(h=(7, 12), r0=(0.15, 0.25), crown=(3.0, 5.0), clusters=(5, 9), base=(0.35, 0.5), squash=0.8, density=2.6),
    'ketapang': dict(h=(9, 15), r0=(0.2, 0.32), crown=(4.5, 7.0), clusters=(8, 12), base=(0.3, 0.45), squash=0.45, density=2.4),
}


class Flora:
    def __init__(self):
        self.LEAF_CANOPY = leaf_material('leaf_canopy', [(0.0, C(0.018, 0.045, 0.012)), (0.45, C(0.04, 0.085, 0.02)), (0.8, C(0.07, 0.12, 0.028)), (1.0, C(0.11, 0.15, 0.035))])
        self.LEAF_FINE = leaf_material('leaf_fine', [(0.0, C(0.03, 0.06, 0.015)), (0.5, C(0.06, 0.11, 0.025)), (0.85, C(0.1, 0.15, 0.03)), (0.97, C(0.16, 0.09, 0.03)), (1.0, C(0.2, 0.08, 0.035))])
        self.LEAF_LIGHT = leaf_material('leaf_light', [(0.0, C(0.05, 0.1, 0.02)), (0.6, C(0.1, 0.17, 0.035)), (1.0, C(0.16, 0.22, 0.05))], translucent=0.4)
        self.LEAF_PALM = leaf_material('leaf_palm', [(0.0, C(0.04, 0.08, 0.02)), (0.7, C(0.09, 0.14, 0.03)), (0.92, C(0.14, 0.15, 0.04)), (1.0, C(0.2, 0.17, 0.07))], rough=0.4, spec=0.6)
        # Garden shrubs: greens, with red and magenta (cordyline, bougainvillea) at the top of the tone range.
        self.LEAF_SHRUB = leaf_material('leaf_shrub', [(0.0, C(0.03, 0.07, 0.015)), (0.55, C(0.07, 0.12, 0.03)), (0.72, C(0.25, 0.03, 0.03)), (0.86, C(0.35, 0.05, 0.04)), (1.0, C(0.42, 0.04, 0.2))], rough=0.4, spec=0.55)
        self.BARK = bark_material('bark', C(0.32, 0.29, 0.24), C(0.5, 0.48, 0.42), C(0.12, 0.11, 0.08))
        self.BARK_DARK = bark_material('bark_dark', C(0.16, 0.13, 0.1), C(0.33, 0.33, 0.27), C(0.06, 0.05, 0.035))
        self.PALM_TRUNK = bark_material('palm_trunk', C(0.17, 0.155, 0.13), C(0.24, 0.23, 0.2), C(0.08, 0.07, 0.06), scale=3.0)
        self.CROWN_SHELL = foliage_material('crown_shell', 'Object', 0.35, FOREST_STOPS)
        self.HILL_CANOPY = foliage_material('hill_canopy', 'Object', 14.0, FOREST_STOPS, bump_strength=1.0)

        self.sources = kit.hidden_collection('branchlets')
        self.B = []
        self.BROAD = [self._branchlet(11 + k, self.LEAF_CANOPY, 1.7, 7, 6, 0.19, 0.075) for k in range(3)]
        self.FINE = [self._branchlet(21 + k, self.LEAF_FINE, 1.4, 9, 9, 0.11, 0.045, spread=55) for k in range(2)]
        self.LARGE = [self._branchlet(31, self.LEAF_LIGHT, 1.8, 4, 3, 0.34, 0.26, droop=0.35, fold=0.04, spread=60)]
        self.SHRUB = [self._branchlet(41 + k, self.LEAF_SHRUB, 0.9, 6, 5, 0.12, 0.05, spread=45) for k in range(2)]

        self.palm_src = kit.hidden_collection('palm_parts')
        self.F = []
        self.PALM_F = [self._frond(4.6, 44, 0.95, 0.06, 0.35, 0.6, self.LEAF_PALM, 50 + k) for k in range(3)]
        self.FERN_F = [self._frond(2.4, 26, 0.32, 0.05, 0.3, 0.4, self.LEAF_FINE, 60 + k) for k in range(2)]
        self.BANANA_F = [self._frond(2.0, 12, 0.36, 0.17, 0.25, 0.35, self.LEAF_LIGHT, 70 + k) for k in range(2)]

        self.leaves = Instances()
        self.fronds = Instances()
        self.tubes = {'bark': kit.TubeBuilder(), 'bark_dark': kit.TubeBuilder(), 'palm': kit.TubeBuilder()}
        self.shells = None

    # ---------------------------------------------------------------- parts

    def _branchlet(self, seed, mat, length, n_twigs, leaves_per_twig, leaf_len, leaf_w, droop=0.25, fold=0.08, spread=50):
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
                la = math.radians(r.uniform(35, 65)) * (1 if j % 2 else -1)
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
        kit.mesh_object(f'bl_{len(self.B):02d}', verts, faces, mat, attrs={'lv': lv}, collection=self.sources)
        self.B.append(seed)
        return len(self.B) - 1

    def _frond(self, length, n_leaflets, leaflet_len, leaflet_w, arch, droop, mat, seed):
        """A pinnate frond along +x arching down, with leaflets both sides (one mesh)."""
        r = np.random.default_rng(seed)
        verts, faces, lv = [], [], []
        for i in range(n_leaflets):
            t = 0.12 + 0.88 * i / (n_leaflets - 1)
            x = t * length
            zc = arch * length * math.sin(math.pi * t * 0.5) - droop * length * t**2.2
            dz = arch * math.pi * 0.5 * math.cos(math.pi * t * 0.5) - droop * 2.2 * t**1.2
            rach = unit([1.0, 0.0, dz])
            for side in (-1, 1):
                a = math.radians(r.uniform(50, 70))
                d = unit(rach * math.cos(a) + np.array([0, side, 0]) * math.sin(a) + np.array([0, 0, -r.uniform(0.1, 0.5)]))
                sv = unit(np.cross(rach, d)) * side
                ll = leaflet_len * (1 - 0.55 * t) * math.sin(math.pi * (0.15 + 0.85 * t)) ** 0.3
                leaf_geom(verts, faces, lv, np.array([x, 0.0, zc]), d, sv, ll, leaflet_w, 0.3, 0.03, r.random())
        kit.mesh_object(f'fr_{len(self.F):02d}', verts, faces, mat, attrs={'lv': lv}, collection=self.palm_src)
        self.F.append(seed)
        return len(self.F) - 1

    # ---------------------------------------------------------------- plants

    def crown_cluster(self, centre, radii, density, kinds, tone, r, scale=1.0, lump=0.25):
        """Branchlets over an ellipsoidal leaf cluster: mostly on the surface, some inside."""
        rx, ry, rz = radii
        p = 1.6
        area = 4 * math.pi * (((rx * ry) ** p + (rx * rz) ** p + (ry * rz) ** p) / 3) ** (1 / p)
        n = max(4, int(area * density))
        d = r.normal(size=(n, 3))
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        keep = (d[:, 2] > -0.55) | (r.random(n) < 0.35)
        d = d[keep]
        n = len(d)
        depth = 1 - lump * r.random(n) ** 2 - 0.12 * r.random(n)
        pos = np.asarray(centre) + d * np.array(radii) * depth[:, None]
        eul = eulers_facing(d + np.array([0, 0, 0.45]), r)
        s = scale * r.uniform(0.8, 1.2, n)
        self.leaves.extend(pos, np.stack([s, s, s], 1), eul, r.choice(kinds, n), tone + r.normal(0, 0.03, n))

    def tree(self, x, y, z, kind, r, height_scale=1.0):
        """A broadleaf tree: trunk, branches and leaf clusters by archetype."""
        a = ARCHETYPES[kind]
        tone = r.uniform(0.1, 0.95)
        H = r.uniform(*a['h']) * height_scale
        r0 = r.uniform(*a['r0'])
        crown_r = r.uniform(*a['crown'])
        clusters = int(r.integers(*a['clusters']))
        base = H * r.uniform(*a['base'])
        kinds = self.LARGE if kind == 'ketapang' else (self.BROAD if r.random() < 0.6 else self.FINE)
        tb = self.tubes['bark_dark' if kind == 'ketapang' else 'bark']
        lean = r.normal(0, 0.03, 2) * H
        top = np.array([x + lean[0], y + lean[1], z + base])
        trunk = curve([x, y, z - 0.5], [top[0], top[1], z + H * 0.85], [r.normal(0, 0.4), r.normal(0, 0.4), 0], 8)
        tb.tube(trunk, np.linspace(r0, r0 * 0.45, len(trunk)), sides=8)
        for _ in range(clusters):
            t = r.uniform(0, 1) ** 0.8
            if kind == 'ketapang':
                # Pagoda tiers: clusters on a few horizontal levels, widest at the bottom.
                t = (int(r.integers(0, 3)) + r.uniform(0.0, 0.25)) / 3
            cz = z + base + (H - base) * t
            width = crown_r * ((1.0 - 0.55 * t) if kind == 'ketapang' else (0.55 + 0.45 * math.sin(math.pi * min(1.0, 0.25 + t))))
            ang = r.uniform(0, 2 * math.pi)
            d = width * math.sqrt(r.uniform(0.05, 1.0))
            cx, cy = top[0] + d * math.cos(ang), top[1] + d * math.sin(ang)
            size = crown_r * r.uniform(0.38, 0.55)
            radii = (size * r.uniform(0.9, 1.15), size * r.uniform(0.9, 1.15), size * a['squash'] * r.uniform(0.85, 1.15))
            start = np.array([top[0], top[1], min(cz - 1.0, z + base + (H - base) * t * 0.6)])
            end = np.array([cx, cy, cz - radii[2] * 0.4])
            tb.tube(curve(start, end, [0, 0, r.uniform(0.3, 1.5)], 5), np.linspace(max(0.04, r0 * 0.4), 0.04, 5), sides=5)
            self.crown_cluster((cx, cy, cz), radii, a['density'], kinds, tone, r)
        return H

    def crown_of_fronds(self, top, n, kinds, r, tone, tilt=(0.1, 0.7), scale=1.0):
        for i in range(n):
            yaw = 2 * math.pi * i / n + r.uniform(-0.2, 0.2)
            s = scale * r.uniform(0.85, 1.15)
            self.fronds.add(top, (s, s, s), (r.uniform(-0.3, 0.3), -r.uniform(*tilt), yaw), r.choice(kinds), tone)

    def palm(self, x, y, z, r, height=(9, 16), lean=(0.0, 0.0)):
        """A coconut palm; lean is how far the top sits from the base, per metre of height (x, y)."""
        h = r.uniform(*height)
        dx = (lean[0] + r.normal(0, 0.06)) * h
        dy = (lean[1] + r.normal(0, 0.06)) * h
        top = np.array([x + dx, y + dy, z + h * (1 - 0.15 * math.hypot(lean[0], lean[1]))])
        # Coconut trunks bow: the lean is strongest near the base.
        tr = curve([x, y, z - 0.3], top, [-dx * 0.25, -dy * 0.25, 0], 9)
        self.tubes['palm'].tube(tr, np.linspace(0.2, 0.14, len(tr)), sides=9)
        self.crown_of_fronds(top, int(r.integers(14, 19)), self.PALM_F, r, r.uniform(0.2, 0.8), tilt=(-0.6, 0.8))

    def banana(self, x, y, z, r):
        for _ in range(int(r.integers(2, 5))):
            ox, oy = r.normal(0, 0.7, 2)
            h = r.uniform(2.2, 4.0)
            top = np.array([x + ox, y + oy, z + h])
            self.tubes['palm'].tube(curve([x + ox, y + oy, z - 0.2], top, [0, 0, 0], 4), np.linspace(0.13, 0.09, 4), sides=7)
            self.crown_of_fronds(top, int(r.integers(6, 10)), self.BANANA_F, r, r.uniform(0.3, 0.9), tilt=(-1.1, 0.2), scale=1.15)

    def shrub(self, x, y, z, r, size, kinds=None, tone=None):
        t = r.uniform(0, 0.6) if tone is None else tone
        self.crown_cluster((x, y, z + size * 0.55), (size, size * r.uniform(0.8, 1.2), size * 0.7), 9.0, kinds or self.SHRUB, t, r, scale=0.5, lump=0.6)

    def hedge(self, pts, r, height=1.0, width=0.8, tone=None):
        """A clipped hedge along a polyline of (x, y, z) points."""
        for (x0, y0, z0), (x1, y1, z1) in zip(pts[:-1], pts[1:]):
            n = max(1, int(math.hypot(x1 - x0, y1 - y0) / 0.8))
            for k in range(n):
                t = (k + 0.5) / n
                self.crown_cluster((lerp(x0, x1, t), lerp(y0, y1, t), lerp(z0, z1, t) + height * 0.5), (0.7, width / 2, height / 2), 16.0, self.SHRUB, r.uniform(0, 0.55) if tone is None else tone, r, scale=0.45, lump=0.3)

    # ---------------------------------------------------------------- distant crowns

    def _cauliflower(self, name, seed, squash):
        """A distant crown: dozens of leafy lumps over a dome, so its outline is ragged and it shades itself."""
        r = np.random.default_rng(seed)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.0)
        ico = bpy.context.object
        bv = np.array([p.co[:] for p in ico.data.vertices])
        bf = [tuple(p.vertices) for p in ico.data.polygons]
        bpy.data.objects.remove(ico)
        verts, faces = [], []

        def lump(c, rad):
            n0 = len(verts)
            verts.extend((bv * rad * (1 + r.uniform(-0.12, 0.12, (len(bv), 1))) + c).tolist())
            faces.extend(tuple(n0 + i for i in f) for f in bf)

        lump(np.array([0, 0, 0.1]), 0.72)
        n = int(r.integers(45, 70))
        d = r.normal(size=(n, 3))
        d[:, 2] = np.abs(d[:, 2]) * 1.2 - 0.25
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        for k in range(n):
            lump(d[k] * r.uniform(0.62, 0.85) + np.array([0, 0, 0.1]), r.uniform(0.17, 0.33))
        v = np.array(verts)
        v[:, 2] = np.where(v[:, 2] < 0, v[:, 2] * 0.5, v[:, 2]) * squash
        return kit.mesh_object(name, v, faces, self.CROWN_SHELL, smooth=True, collection=self.shells)

    def far_crowns(self, name, pos, size, rng):
        """Lumpy crowns centred at pos (n x 3), radius size (n)."""
        if self.shells is None:
            self.shells = kit.hidden_collection('shells')
            for k in range(6):
                self._cauliflower(f'sh_{k:02d}', 90 + k, (0.8, 0.9, 0.75, 0.95, 0.85, 0.7)[k])
        n = len(pos)
        scl = np.stack([size, size * rng.uniform(0.85, 1.15, n), size], 1)
        eul = np.stack([np.zeros(n), np.zeros(n), rng.uniform(0, 2 * np.pi, n)], 1)
        return kit.instancer3(name, pos, scl, eul, rng.integers(0, 6, n), self.shells)

    def build(self):
        for key, mat in (('bark', self.BARK), ('bark_dark', self.BARK_DARK), ('palm', self.PALM_TRUNK)):
            if self.tubes[key].f:
                self.tubes[key].build(f'wood_{key}', mat)
        self.leaves.build('leaves', self.sources)
        self.fronds.build('fronds', self.palm_src)
        print('flora: branchlets', len(self.leaves.pos), 'fronds', len(self.fronds.pos))
