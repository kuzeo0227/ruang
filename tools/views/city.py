"""KL skyline from level 38, about 115 m up, looking north over the city to its centre.

A procedural Kuala Lumpur around the viewpoint: districts with their own street grids, terraced
houses, condo and office towers on podiums, parks, street trees, rivers and highways, and the
landmarks to the north (Merdeka 118, the Petronas Towers, the Exchange 106, KL Tower), with the
Titiwangsa range on the horizon. The day pass is lit by a hazy afternoon sky; the night pass keeps
only emission (lit windows, street lights, the landmarks' lighting and aircraft warning lights).

  blender -b --factory-startup --python tools/views/city.py -- --out DIR --mode day|night
      [--width 6144] [--samples 64] [--window lon0,lon1,lat0,lat1]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import kit  # noqa: E402
from pngio import save_png  # noqa: E402

A = kit.parse_args(out='/tmp/city', mode='day', width=1536, samples=16, seed=118, window='')
EL_MIN, EL_MAX, EYE = -80.0, 14.0, 115.0
R3D = 3600.0  # terraced houses are modelled in 3D within this distance
NIGHT = A['mode'] == 'night'
WINDOW = tuple(float(v) for v in A['window'].split(',')) if A['window'] else None
rng = np.random.default_rng(int(A['seed']))
CENTRE = np.array(kit.polar(19, 6300))  # KLCC

# ---------------------------------------------------------------- districts

D = 650.0
N = 56
gi, gj = np.meshgrid(np.arange(-N, N + 1), np.arange(-N, N + 1), indexing='ij')
FX = (gi + rng.uniform(0.15, 0.85, gi.shape)) * D
FY = (gj + rng.uniform(0.15, 0.85, gi.shape)) * D
ANG = rng.uniform(0, np.pi / 2, gi.shape)
SPU = rng.uniform(85, 125, gi.shape)  # across the house rows, street to street
SPV = rng.uniform(110, 170, gi.shape)  # along the rows
DC = np.hypot(FX - CENTRE[0], FY - CENTRE[1])
R0 = rng.random(gi.shape)
LEAFY = rng.random(gi.shape)  # how many street trees a district has
# 0 terraced houses, 1 commercial and offices, 2 park or forest, 3 campus, low blocks and lawns
KIND = np.where(R0 < 0.6, 0, np.where(R0 < 0.76, 3, np.where(R0 < 0.9, 2, 1)))
KIND = np.where(DC < 2200, np.where(R0 < 0.75, 1, 2), KIND)
KIND = np.where((DC >= 2200) & (DC < 4200) & (R0 < 0.35), 1, KIND)
# Bukit Kiara and the Lake Gardens stay green.
for b, d, r in ((292, 4200, 1500), (352, 6200, 900)):
    px, py = kit.polar(b, d)
    KIND = np.where(np.hypot(FX - px, FY - py) < r, 2, KIND)
KIND[N, N] = 0  # the viewpoint's own block
TOTAL = 2 * N + 1


def district(X, Y):
    """Nearest district (flat index), and half the gap to the next one (for the main roads)."""
    ci = np.floor(X / D).astype(np.int64) + N
    cj = np.floor(Y / D).astype(np.int64) + N
    best = np.full(X.shape, 1e12)
    second = np.full(X.shape, 1e12)
    idx = np.zeros(X.shape, dtype=np.int64)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            ii = np.clip(ci + di, 0, 2 * N)
            jj = np.clip(cj + dj, 0, 2 * N)
            d = (FX[ii, jj] - X) ** 2 + (FY[ii, jj] - Y) ** 2
            closer = d < best
            second = np.where(closer, best, np.minimum(second, d))
            best = np.where(closer, d, best)
            idx = np.where(closer, ii * TOTAL + jj, idx)
    return idx, (np.sqrt(second) - np.sqrt(best)) / 2


def local(X, Y, idx):
    fx, fy, a = FX.flat[idx], FY.flat[idx], ANG.flat[idx]
    c, s = np.cos(a), np.sin(a)
    dx, dy = X - fx, Y - fy
    return dx * c + dy * s, -dx * s + dy * c


def street_dist(lu, lv, idx):
    spu, spv = SPU.flat[idx], SPV.flat[idx]
    du = np.abs((lu / spu + 0.5) % 1 - 0.5) * spu
    dv = np.abs((lv / spv + 0.5) % 1 - 0.5) * spv
    return du, dv


def hashi(*ks):
    h = np.zeros(np.broadcast(*ks).shape, dtype=np.int64) + 1469598103
    for k in ks:
        h = (h ^ (np.asarray(k, dtype=np.int64) * 2654435761)) & 0xFFFFFFFF
        h = (h * 1099511) & 0xFFFFFFFF
    return (h & 0xFFFFFF) / float(0xFFFFFF)


def vnoise(X, Y, cell, seed):
    """Bilinear value noise in 0..1 with cells of the given size (smooth, unlike hashi)."""
    gx, gy = X / cell, Y / cell
    ix, iy = np.floor(gx), np.floor(gy)
    fx, fy = gx - ix, gy - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = hashi(ix, iy, seed)
    b = hashi(ix + 1, iy, seed)
    c = hashi(ix, iy + 1, seed)
    d = hashi(ix + 1, iy + 1, seed)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def spline(pts, n=500):
    pts = np.asarray(pts, dtype=float)
    t = np.linspace(0, 1, len(pts))
    tt = np.linspace(0, 1, n)
    return np.stack([np.interp(tt, t, pts[:, 0]), np.interp(tt, t, pts[:, 1])], 1)


HIGHWAYS = [
    (spline([kit.polar(250, 9000), kit.polar(240, 3000), kit.polar(300, 900), kit.polar(10, 2600), kit.polar(25, 5200), kit.polar(35, 9000), kit.polar(40, 16000)]), 34),
    (spline([kit.polar(200, 12000), kit.polar(170, 4000), kit.polar(110, 1800), kit.polar(70, 3500), kit.polar(55, 8000), kit.polar(50, 20000)]), 30),
    (spline([kit.polar(285, 14000), kit.polar(300, 6500), kit.polar(330, 5200), kit.polar(355, 7400), kit.polar(15, 9300), kit.polar(50, 9800), kit.polar(80, 12000)]), 30),
    (spline([kit.polar(140, 15000), kit.polar(150, 6000), kit.polar(160, 1500), kit.polar(230, 1400), kit.polar(265, 6000), kit.polar(275, 15000)]), 28),
]
RIVERS = [
    (spline([kit.polar(45, 22000), kit.polar(35, 11000), kit.polar(25, 7600), kit.polar(12, 5600), kit.polar(355, 4000), kit.polar(320, 2600), kit.polar(260, 3600), kit.polar(235, 9000), kit.polar(225, 20000)]), 38),
]

# ---------------------------------------------------------------- ground rasters

PAL_ROOF = np.array([[150, 78, 52], [128, 70, 54], [96, 74, 62], [76, 76, 80], [118, 118, 122], [140, 92, 72], [176, 172, 166], [104, 58, 46]], dtype=np.float32)
ASPHALT = np.array([84, 84, 86], np.float32)
PAVEMENT = np.array([150, 146, 138], np.float32)


def ground_raster(x0, y0, size, res):
    """Day albedo and night emission (uint8 RGB, sRGB) for a size x size m square at x0, y0 (lower left)."""
    day = np.zeros((res, res, 3), dtype=np.uint8)
    night = np.zeros((res, res, 3), dtype=np.uint8)
    m = size / res
    for r0 in range(0, res, 256):
        rows = np.arange(r0, min(res, r0 + 256))
        Y = y0 + (res - 1 - rows[:, None] + 0.5) * m + np.zeros((1, res))
        X = x0 + (np.arange(res)[None, :] + 0.5) * m + np.zeros((len(rows), 1))
        idx, border = district(X, Y)
        lu, lv = local(X, Y, idx)
        kind = KIND.flat[idx]
        du, dv = street_dist(lu, lv, idx)
        street = np.minimum(du, dv)
        emit = np.zeros(X.shape + (3,), dtype=np.float32)
        noise = hashi(np.floor(X / 2), np.floor(Y / 2), 7)[..., None] - 0.5
        # Terraced houses: rows 25 m apart across, houses 6.5 m wide; gardens between the rows.
        hu = np.floor(lu / 25.0)
        hv = np.floor(lv / 6.5)
        roof = PAL_ROOF[(hashi(idx, hu, np.floor(lv / 60.0)) * len(PAL_ROOF)).astype(int) % len(PAL_ROOF)]
        roof *= (0.85 + 0.3 * hashi(idx, hu, hv))[..., None]
        garden = np.abs((lu / 25.0) % 1 - 0.5) > 0.3
        lawn_col = np.array([82, 106, 56], np.float32) * (0.75 + 0.35 * vnoise(X, Y, 3.0, 9) + 0.15 * vnoise(X, Y, 11.0, 19))[..., None]
        # Where the houses are modelled in 3D the raster under them is their plots, laid out like the
        # houses (rows 25 m apart from 7.5 m into each block): drives and porches on one side, gardens behind.
        spu_ = SPU.flat[idx]
        bu = lu - (np.floor(lu / spu_) * spu_ + 6.5)
        ru = ((bu - 7.5 + 12.5) % 25.0) - 12.5
        drive = (ru > 6.0) & (ru < 11.5)
        yard = np.where(drive[..., None], np.array([146, 143, 136], np.float32) * (0.92 + 0.12 * vnoise(X, Y, 2.0, 31))[..., None], lawn_col)
        dcam = np.hypot(X, Y)
        modelled = (dcam < R3D - 60)[..., None]
        res_col = np.where(modelled, yard, np.where(garden[..., None], lawn_col, roof))
        # Commercial: concrete roofs and car parks.
        cu = np.floor(lu / 45.0)
        cv = np.floor(lv / 60.0)
        conc = 112 + 42 * hashi(idx, cu, cv, 3)
        com_col = np.stack([conc, conc, conc * 1.02], -1)
        lot = hashi(idx, cu, cv, 5) < 0.25
        com_col = np.where(lot[..., None], np.array([96, 96, 100], np.float32), com_col)
        # Parks and forest: canopy texture and lawns.
        canopy = 0.65 + 0.45 * vnoise(X, Y, 6.0, 11) + 0.25 * vnoise(X, Y, 2.0, 21)
        green_col = np.stack([38 * canopy, 64 * canopy, 28 * canopy], -1)
        lawn = hashi(np.floor(X / 70), np.floor(Y / 70), 13) < 0.25
        green_col = np.where(lawn[..., None], np.array([96, 128, 62], np.float32), green_col)
        # Campus and low blocks: large pale roofs on lawns.
        blk = hashi(idx, np.floor(lu / 70), np.floor(lv / 90), 17) < 0.55
        camp_col = np.where(blk[..., None], np.stack([conc * 1.05, conc, conc * 0.95], -1), np.array([92, 122, 60], np.float32))
        col = np.select([kind[..., None] == 0, kind[..., None] == 1, kind[..., None] == 2], [res_col, com_col, green_col], camp_col)
        # The condo's own grounds around the viewpoint: lawns and a ring path.
        own = dcam < 190
        ring = own & (np.abs(dcam - 150) < 2.5)
        col = np.where(own[..., None], lawn_col * 1.05, col)
        col = np.where(ring[..., None], np.array([168, 160, 146], np.float32), col)
        # Pavements, streets (not in parks), then the main roads along district borders.
        not_park = kind != 2
        col = np.where(((street < 6.5) & not_park & (dcam >= 190))[..., None], PAVEMENT, col)
        is_street = (street < 4.5) & not_park & ~own
        is_main = border < 9.0
        col = np.where(is_street[..., None], ASPHALT, col)
        col = np.where(((border < 11) & ~is_main)[..., None], PAVEMENT, col)
        col = np.where(is_main[..., None], ASPHALT * 1.04, col)
        col = np.clip(col * (1 + 0.16 * noise), 0, 255)
        # Night: street lights every 30 m, a softer glow along main roads, a few lit porches.
        lamp = is_street & (((du < 4.5) & (np.abs((lv % 30.0) - 15) < 2.0)) | ((dv < 4.5) & (np.abs((lu % 30.0) - 15) < 2.0)))
        emit[lamp] = (255, 150, 70)
        emit[is_main & ~lamp] = (90, 60, 30)
        porch = (kind == 0) & ~garden & (hashi(idx, hu, hv, 23) < 0.06)
        emit[porch] = np.maximum(emit[porch], (120, 90, 50))
        day[rows] = col.astype(np.uint8)
        night[rows] = np.clip(emit, 0, 255).astype(np.uint8)
    return day, night


def draw_lines(img, lines, x0, y0, size, color, night_color=None, night=None):
    """Highways and rivers drawn over a raster, in plan metres."""
    res = img.shape[0]
    m = size / res
    for pts, width in lines:
        px = (pts[:, 0] - x0) / m
        py = res - 1 - (pts[:, 1] - y0) / m
        r = max(1.0, width / m / 2)
        for k in range(len(px) - 1):
            n = max(2, int(math.hypot(px[k + 1] - px[k], py[k + 1] - py[k]) / max(r * 0.5, 0.5)) + 1)
            for t in np.linspace(0, 1, n):
                cx = px[k] + (px[k + 1] - px[k]) * t
                cy = py[k] + (py[k + 1] - py[k]) * t
                xa, xb = int(max(0, cx - r)), int(min(res, cx + r + 1))
                ya, yb = int(max(0, cy - r)), int(min(res, cy + r + 1))
                if xa >= xb or ya >= yb:
                    continue
                yy, xx = np.mgrid[ya:yb, xa:xb]
                inside = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
                img[ya:yb, xa:xb][inside] = color
                if night is not None and night_color is not None:
                    night[ya:yb, xa:xb][inside] = night_color


def ground_image(name, x0, y0, size, res, out_dir):
    day, night = ground_raster(x0, y0, size, res)
    draw_lines(day, RIVERS, x0, y0, size, (46, 60, 64))
    draw_lines(day, HIGHWAYS, x0, y0, size, (88, 88, 92), (255, 170, 90), night)
    path_d = os.path.join(out_dir, f'{name}_day.png')
    path_n = os.path.join(out_dir, f'{name}_night.png')
    save_png(path_d, day)
    save_png(path_n, night)
    return path_d, path_n


# ---------------------------------------------------------------- scene

sc = kit.reset_scene()
kit.setup_render(sc, A['width'], EL_MIN, EL_MAX, A['samples'], EYE, WINDOW)
sc.cycles.shading_system = True
os.makedirs(A['out'], exist_ok=True)
if NIGHT:
    kit.world_black(sc)
    sc.cycles.max_bounces = 1
else:
    kit.world_sky(sc, sun_elevation=50, sun_azimuth=250, strength=1.0, air=1.0, dust=3.0, ozone=1.0, altitude=150)
    kit.sun_lamp(sc, 50, 250, strength=3.2, angle_deg=0.6)
kit.mist(sc, 0, 40000)

night_values = []


def night_switch(nt):
    v = nt.nodes.new('ShaderNodeValue')
    v.outputs[0].default_value = 1.0 if NIGHT else 0.0
    night_values.append(v)
    return v.outputs[0]


def ground_material(name, day_path, night_path, extent, origin):
    m, nt, out = kit.node_mat(name)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Location'].default_value = (-origin[0] / extent, -origin[1] / extent, 0)
    mp.inputs['Scale'].default_value = (1 / extent, 1 / extent, 1)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    imgs = []
    for path in (day_path, night_path):
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.load(path)
        t.image.colorspace_settings.name = 'sRGB'
        t.extension = 'EXTEND'
        t.interpolation = 'Linear'
        nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
        imgs.append(t)
    p = kit.principled(nt, rough=0.85, spec=0.3)
    nt.links.new(imgs[0].outputs['Color'], p.inputs['Base Color'])
    nt.links.new(imgs[1].outputs['Color'], p.inputs['Emission Color'])
    nt.links.new(kit.math_node(nt, 'MULTIPLY', night_switch(nt), 3.0), p.inputs['Emission Strength'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


def plane(name, x0, y0, size, z, mat):
    return kit.mesh_object(name, [(x0, y0, z), (x0 + size, y0, z), (x0 + size, y0 + size, z), (x0, y0 + size, z)], [(0, 1, 2, 3)], mat)


for name, size, z in (('ground_vnear', 2048.0, 0.0), ('ground_near', 8192.0, -0.3), ('ground_far', 65536.0, -0.6)):
    gd, gn = ground_image(name, -size / 2, -size / 2, size, 4096, A['out'])
    plane(name, -size / 2, -size / 2, size, z, ground_material(name, gd, gn, size, (-size / 2, -size / 2)))

# ---------------------------------------------------------------- facade shader (OSL)

FACADE_OSL = r'''
// Windows on a tower's walls, in metres: floors from the height, bays along the wall.
shader facade(
    float Seed = 0.0,
    float Night = 0.0,
    float Office = 0.0,
    float LitFraction = 0.35,
    output color Base = color(0.5),
    output float Rough = 0.6,
    output float Spec = 0.5,
    output color Emit = color(0.0),
    output float Strength = 0.0)
{
    vector nn = normalize(N);
    float r1 = cellnoise(point(Seed * 97.0, 1.0, 0.0));
    float r2 = cellnoise(point(Seed * 97.0, 2.0, 0.0));
    float r3 = cellnoise(point(Seed * 97.0, 3.0, 0.0));
    float r4 = cellnoise(point(Seed * 97.0, 4.0, 0.0));
    float r5 = cellnoise(point(Seed * 97.0, 5.0, 0.0));
    // Linear albedos: white and cream render, warm greys, a few darker accents.
    color walls[8] = { color(0.62, 0.61, 0.57), color(0.5, 0.48, 0.44), color(0.68, 0.66, 0.6),
                       color(0.4, 0.41, 0.42), color(0.55, 0.49, 0.4), color(0.27, 0.29, 0.31),
                       color(0.64, 0.64, 0.66), color(0.5, 0.42, 0.36) };
    color wall = walls[(int)floor(r4 * 7.999)];
    if (abs(nn[2]) > 0.6) {
        Base = color(0.3, 0.3, 0.29) * (0.8 + 0.4 * r5);
        Rough = 0.9;
        Spec = 0.3;
        return;
    }
    vector t = normalize(cross(vector(0, 0, 1), nn));
    float s = dot(vector(P), t);
    float z = P[2];
    int office = Office > 0.5;
    float floorH = office ? mix(3.8, 4.3, r1) : mix(3.0, 3.3, r1);
    float bay = office ? mix(1.5, 2.2, r2) : mix(2.4, 4.2, r2);
    float fz = z / floorH;
    float fl = floor(fz);
    float vz = fz - fl;
    float fs = s / bay;
    float cl = floor(fs);
    float vs = fs - cl;
    int ribbon = office || r3 > 0.65;
    float glassV = office ? step(0.12, vz) : step(0.3, vz) * step(vz, 0.92);
    float glassH = ribbon ? 1.0 : step(0.12, vs) * step(vs, 0.88);
    int balcony = !office && r3 < 0.35 && fmod(cl, 3.0) < 1.0;
    float g = glassV * glassH;
    color glassCol = office ? mix(color(0.05, 0.08, 0.1), color(0.11, 0.15, 0.18), r5) : mix(color(0.05, 0.06, 0.07), color(0.1, 0.11, 0.12), r5);
    Base = mix(wall, glassCol, g);
    if (balcony && vz < 0.35) Base = wall * 0.5;
    Rough = mix(0.7, 0.06, g);
    Spec = mix(0.35, 1.0, g);
    float pick = cellnoise(point(cl, fl, Seed * 53.0));
    float lit = pick < LitFraction ? 1.0 : 0.0;
    float tint = cellnoise(point(cl + 0.5, fl, Seed * 19.0));
    color warm = mix(color(1.0, 0.62, 0.32), color(1.0, 0.82, 0.6), tint);
    color cool = mix(color(0.82, 0.88, 1.0), color(1.0, 0.95, 0.85), tint);
    Emit = office ? cool : warm;
    Strength = Night * g * lit * mix(1.5, 4.0, cellnoise(point(cl, fl + 0.5, Seed)));
}
'''
osl_text = bpy.data.texts.new('facade.osl')
osl_text.from_string(FACADE_OSL)


def facade_material(name, office=0.0, lit=0.35):
    m, nt, out = kit.node_mat(name)
    s = nt.nodes.new('ShaderNodeScript')
    s.mode = 'INTERNAL'
    s.script = osl_text
    s.update()
    info = nt.nodes.new('ShaderNodeObjectInfo')
    nt.links.new(info.outputs['Random'], s.inputs['Seed'])
    nt.links.new(night_switch(nt), s.inputs['Night'])
    s.inputs['Office'].default_value = office
    s.inputs['LitFraction'].default_value = lit
    p = kit.principled(nt)
    nt.links.new(s.outputs['Base'], p.inputs['Base Color'])
    nt.links.new(s.outputs['Rough'], p.inputs['Roughness'])
    nt.links.new(s.outputs['Spec'], p.inputs['Specular IOR Level'])
    nt.links.new(s.outputs['Emit'], p.inputs['Emission Color'])
    nt.links.new(s.outputs['Strength'], p.inputs['Emission Strength'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


def attr_material(name, rough=0.8):
    """Colour from the mesh's per-face 'col' attribute (MeshBuilder)."""
    m, nt, out = kit.node_mat(name)
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_type = 'GEOMETRY'
    attr.attribute_name = 'col'
    p = kit.principled(nt, rough=rough, spec=0.3)
    nt.links.new(attr.outputs['Color'], p.inputs['Base Color'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


def emissive(name, color, strength, base=(0.05, 0.05, 0.05, 1)):
    """Lit only at night (light fittings, the landmarks' lighting)."""
    m, nt, out = kit.node_mat(name)
    p = kit.principled(nt, base, 0.5)
    p.inputs['Emission Color'].default_value = color
    nt.links.new(kit.math_node(nt, 'MULTIPLY', night_switch(nt), strength), p.inputs['Emission Strength'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


MAT_CONDO = facade_material('condo', 0.0, 0.38)
MAT_OFFICE = facade_material('office', 1.0, 0.3)
MAT_PODIUM = kit.simple_mat('podium', (0.42, 0.42, 0.4, 1), 0.85)
MAT_ATTR = attr_material('attr')
MAT_RED = emissive('warning', (1, 0.05, 0.02, 1), 40.0, (0.3, 0.02, 0.02, 1))

# ---------------------------------------------------------------- towers

LANDMARKS = {
    'kltower': kit.polar(2, 5600),
    'merdeka': kit.polar(10, 4000),
    'exchange': kit.polar(28, 5200),
    'petronas': kit.polar(19, 6300),
}


def clear_of_landmarks(x, y, r=140):
    return all(math.hypot(x - lx, y - ly) > r for lx, ly in LANDMARKS.values())


def prism(name, cx, cy, w, d, z0, z1, angle, mat):
    mb = kit.MeshBuilder()
    mb.rotated_box(cx, cy, w, d, z0, z1, angle)
    return mb.build(name, mat)


def tower(cx, cy, w, d, h, angle, office, podium=None, crown=False):
    base = 0.0
    if podium:
        pw, pd, ph = podium
        mb = kit.MeshBuilder()
        mb.rotated_box(cx, cy, pw, pd, 0, ph, angle, col=(0.4, 0.4, 0.38, 1), top_col=(0.14, 0.22, 0.09, 1) if not office else (0.32, 0.32, 0.31, 1))
        mb.build('podium', MAT_ATTR)
        base = ph
    prism('office' if office else 'condo', cx, cy, w, d, base, h, angle, MAT_OFFICE if office else MAT_CONDO)
    top = h
    if crown:
        top = h + rng.uniform(6, 18)
        prism('crown', cx, cy, w * 0.7, d * 0.7, h, top, angle, MAT_OFFICE if office else MAT_CONDO)
    if h > 150:
        mb = kit.MeshBuilder()
        mb.box(cx - 0.8, cy - 0.8, top, cx + 0.8, cy + 0.8, top + 2.0)
        mb.build('beacon', MAT_RED)


towers_list = []
for flat in range(TOTAL * TOTAL):
    fx, fy = FX.flat[flat], FY.flat[flat]
    dcam = math.hypot(fx, fy)
    if dcam > 14000:
        continue
    kind = KIND.flat[flat]
    dc = DC.flat[flat]
    a = ANG.flat[flat]
    c, s = math.cos(a), math.sin(a)
    if kind == 1:
        count = int(rng.integers(6, 14)) if dc < 2500 else int(rng.integers(3, 8))
        for _ in range(count):
            lu, lv = rng.uniform(-270, 270), rng.uniform(-270, 270)
            x, y = fx + lu * c - lv * s, fy + lu * s + lv * c
            if math.hypot(x, y) < 220 or not clear_of_landmarks(x, y):
                continue
            near_core = max(0.0, 1.0 - dc / 3500)
            h = rng.uniform(70, 170) + near_core * rng.uniform(40, 200)
            w, d = rng.uniform(28, 55), rng.uniform(28, 50)
            towers_list.append((x, y, w, d, h, a, True, (w * 1.6, d * 1.5, rng.uniform(14, 24)) if rng.random() < 0.6 else None, rng.random() < 0.35))
    elif kind in (0, 3):
        if rng.random() < (0.7 if dcam < 6000 else 0.4):
            n = int(rng.integers(2, 6))
            lu, lv = rng.uniform(-200, 200), rng.uniform(-200, 200)
            for k in range(n):
                x = fx + (lu + (k % 3) * 55) * c - (lv + (k // 3) * 70) * s
                y = fy + (lu + (k % 3) * 55) * s + (lv + (k // 3) * 70) * c
                if math.hypot(x, y) < 160 or not clear_of_landmarks(x, y):
                    continue
                h = rng.uniform(85, 200)
                towers_list.append((x, y, rng.uniform(22, 32), rng.uniform(40, 60), h, a, False, (rng.uniform(70, 110), rng.uniform(60, 90), rng.uniform(14, 22)) if k == 0 else None, rng.random() < 0.2))

for b, dist, h, w, office in (
    (17, 6080, 343, 48, True),   # Four Seasons Place
    (21, 6600, 274, 42, True),   # Ilham Tower
    (356, 3700, 310, 46, True),  # Menara Telekom
    (352, 2700, 230, 50, True),  # KL Sentral
    (355, 2450, 205, 44, True),
    (14, 4700, 240, 45, True),   # Bukit Bintang
    (8, 4550, 210, 40, False),
    (26, 5650, 250, 45, True),   # TRX
    (31, 5000, 220, 40, True),
    (24, 6900, 260, 44, True),
    (13, 6400, 230, 42, True),
):
    x, y = kit.polar(b, dist)
    towers_list.append((x, y, w, w * 0.9, h, math.radians(b), office, None, True))

def corridor_cap(t):
    x, y, w, d, h = t[:5]
    bearing = math.degrees(math.atan2(x, y))
    if math.hypot(x, y) < 3600 and -10 < bearing < 40 and h > 100:
        return (x, y, w, d, rng.uniform(70, 100)) + t[5:7] + (t[7], False)
    return t


towers_list = [corridor_cap(t) for t in towers_list]
for t in towers_list:
    tower(*t)
print('towers', len(towers_list))

# Our own podium below the viewpoint: car park walls, a lawn deck and the pool.
mb = kit.MeshBuilder()
mb.box(-45, -40, 0, 45, 18, 22, col=(0.42, 0.42, 0.4, 1), top_col=(0.12, 0.22, 0.08, 1))
mb.box(-30, -6, 22, 10, 12, 22.3, col=(0.6, 0.6, 0.58, 1), top_col=(0.6, 0.6, 0.58, 1))
mb.build('own_podium', MAT_ATTR)
mb = kit.MeshBuilder()
mb.box(-28, -4, 22.3, 8, 10, 22.35)
mb.build('pool', kit.simple_mat('pool', (0.1, 0.42, 0.52, 1), 0.05, spec=0.8))

# ---------------------------------------------------------------- terraced houses (3D near the viewpoint)

WALLS = [(0.52, 0.49, 0.43, 1.0), (0.46, 0.45, 0.42, 1.0), (0.56, 0.53, 0.47, 1.0), (0.44, 0.4, 0.35, 1.0)]
mb = kit.MeshBuilder()
rows = 0
for flat in range(TOTAL * TOTAL):
    if KIND.flat[flat] != 0:
        continue
    fx, fy = FX.flat[flat], FY.flat[flat]
    if math.hypot(fx, fy) > R3D + 400:
        continue
    a = ANG.flat[flat]
    c, s = math.cos(a), math.sin(a)
    spu, spv = SPU.flat[flat], SPV.flat[flat]
    for ku in range(-5, 6):
        for kv in range(-4, 5):
            u0, u1 = ku * spu + 6.5, (ku + 1) * spu - 6.5
            v0, v1 = kv * spv + 6.5, (kv + 1) * spv - 6.5
            for uc in np.arange(u0 + 7.5, u1 - 6, 25.0):
                # Each row is cut into terraces of 6 to 14 houses with gaps between.
                v = v0 + rng.uniform(0, 4)
                while v < v1 - 20:
                    n_h = int(min(rng.integers(6, 15), (v1 - v) // 6.5))
                    if n_h < 3:
                        break
                    length = n_h * 6.5
                    vc = v + length / 2
                    x, y = fx + uc * c - vc * s, fy + uc * s + vc * c
                    v += length + rng.uniform(5, 12)
                    dd = math.hypot(x, y)
                    if dd < 170 or dd > R3D:
                        continue
                    idx, _ = district(np.array([x]), np.array([y]))
                    if idx[0] != flat:
                        continue
                    # Mostly one roof colour per terrace, with owners' replacements here and there.
                    base_roof = PAL_ROOF[int(rng.integers(0, len(PAL_ROOF)))]
                    roofs = []
                    for _ in range(n_h):
                        rc = PAL_ROOF[int(rng.integers(0, len(PAL_ROOF)))] if rng.random() < 0.18 else base_roof
                        rc = rc / 255.0 * rng.uniform(0.88, 1.08)
                        roofs.append(tuple(float(min(1, max(0, c_))) ** 2.2 for c_ in rc) + (1.0,))
                    walls = [WALLS[int(rng.integers(0, len(WALLS)))] for _ in range(3)]
                    storeys = 2 if rng.random() < 0.8 else 1
                    mb.terrace(x, y, n_h, 12.0, 3.3 * storeys + 0.4, 2.2, a + math.pi / 2, walls, roofs, porch=storeys == 2)
                    rows += 1
mb.build('terraced_houses', MAT_ATTR)
print('terraces', rows)

# ---------------------------------------------------------------- landmarks

MAT_STEEL = kit.simple_mat('petronas_steel', (0.62, 0.63, 0.65, 1), 0.3, metal=0.85)
MAT_GLASS = facade_material('landmark_glass', 1.0, 0.25)
MAT_CONCRETE = kit.simple_mat('concrete', (0.55, 0.54, 0.51, 1), 0.7)
MAT_LIT_WHITE = emissive('landmark_lights', (0.95, 0.97, 1.0, 1), 6.0, (0.62, 0.63, 0.65, 1))


def lathe(name, cx, cy, profile, sides, mat, star=0.0, rot=0.0):
    """A solid of revolution (r, z) about (cx, cy); star > 0 pulls in every other point (Petronas plan)."""
    verts, faces = [], []
    for r, z in profile:
        for i in range(sides):
            t = 2 * math.pi * i / sides + rot
            rr = r * (1 - star) if (i % 2 and star) else r
            verts.append((cx + rr * math.cos(t), cy + rr * math.sin(t), z))
    for k in range(len(profile) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((k * sides + i, k * sides + j, (k + 1) * sides + j, (k + 1) * sides + i))
    top = len(profile) - 1
    verts.append((cx, cy, profile[-1][1]))
    for i in range(sides):
        faces.append((top * sides + i, top * sides + (i + 1) % sides, len(verts) - 1))
    return kit.mesh_object(name, verts, faces, mat)


def petronas(cx, cy):
    h = 375.0
    prof = [(23, 0), (23, h * 0.6), (21, h * 0.6), (21, h * 0.73), (18.5, h * 0.73), (18.5, h * 0.83), (15.5, h * 0.83), (15.5, h * 0.9), (12, h * 0.9), (12, h * 0.95), (8, h * 0.98), (4, h)]
    for dx in (-29.0, 29.0):
        lathe('petronas', cx + dx, cy, prof, 16, MAT_STEEL, star=0.12)
        lathe('petronas_lights', cx + dx, cy, [(12.3, h * 0.9), (12.3, h * 0.95), (8.3, h * 0.98)], 16, MAT_LIT_WHITE, star=0.12)
        lathe('spire', cx + dx, cy, [(2.2, h), (1.0, 440), (0.25, 452)], 8, MAT_STEEL)
        mb = kit.MeshBuilder()
        mb.box(cx + dx - 0.9, cy - 0.9, 452, cx + dx + 0.9, cy + 0.9, 454)
        mb.build('petronas_beacon', MAT_RED)
    mb = kit.MeshBuilder()
    mb.box(cx - 8, cy - 2.5, 170, cx + 8, cy + 2.5, 176)
    mb.build('skybridge', MAT_STEEL)
    mb = kit.MeshBuilder()
    mb.box(cx - 120, cy - 70, 0, cx + 120, cy + 30, 30, col=(0.45, 0.45, 0.43, 1))
    mb.build('suria', MAT_ATTR)


def merdeka(cx, cy):
    prof = [(48, 0), (48, 40), (44, 120), (41, 220), (37, 320), (32, 420), (25, 500)]
    lathe('merdeka118', cx, cy, prof, 8, MAT_GLASS, rot=math.pi / 8)
    lathe('merdeka_spire', cx, cy, [(18, 500), (9, 560), (2.5, 640), (0.5, 679)], 8, MAT_GLASS, rot=math.pi / 8)
    lathe('merdeka_lights', cx, cy, [(9.2, 560), (2.7, 640), (0.7, 679)], 8, MAT_LIT_WHITE, rot=math.pi / 8)
    mb = kit.MeshBuilder()
    mb.box(cx - 1, cy - 1, 679, cx + 1, cy + 1, 682)
    mb.build('merdeka_beacon', MAT_RED)


def exchange(cx, cy):
    lathe('exchange106', cx, cy, [(37, 0), (37, 380), (33, 410), (26, 440), (18, 445)], 4, MAT_GLASS, rot=math.pi / 4)


def kl_tower(cx, cy):
    hill = 60.0
    lathe('bukit_nanas', cx, cy, [(420, 0), (320, 25), (200, 48), (60, hill)], 24, kit.simple_mat('forest_hill', (0.05, 0.1, 0.035, 1), 0.9))
    lathe('kltower_shaft', cx, cy, [(9, hill), (7, hill + 200), (6.2, hill + 276)], 16, MAT_CONCRETE)
    lathe('kltower_pod', cx, cy, [(6.2, hill + 276), (16, hill + 282), (22, hill + 300), (22, hill + 312), (17, hill + 328), (8, hill + 335)], 24, MAT_GLASS)
    lathe('kltower_mast', cx, cy, [(4, hill + 335), (2.0, hill + 380), (0.6, hill + 421)], 8, MAT_CONCRETE)
    lathe('kltower_lights', cx, cy, [(22.3, hill + 300), (22.3, hill + 312)], 24, emissive('kltower_glow', (0.5, 0.6, 1.0, 1), 8.0))
    mb = kit.MeshBuilder()
    mb.box(cx - 1, cy - 1, hill + 421, cx + 1, cy + 1, hill + 424)
    mb.build('kltower_beacon', MAT_RED)


petronas(*LANDMARKS['petronas'])
merdeka(*LANDMARKS['merdeka'])
exchange(*LANDMARKS['exchange'])
kl_tower(*LANDMARKS['kltower'])

# ---------------------------------------------------------------- trees


def leaf_material(name, dark, light):
    """Two greens mixed per tree (Object Info random works per instance), with leafy bump."""
    m, nt, out = kit.node_mat(name)
    info = nt.nodes.new('ShaderNodeObjectInfo')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 2.5
    noise.inputs['Detail'].default_value = 6
    col = kit.mix_rgb(nt, info.outputs['Random'], dark, light)
    col = kit.mix_rgb(nt, noise.outputs['Fac'], col, (0.02, 0.05, 0.02, 1), 'MULTIPLY')
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.6
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    p = kit.principled(nt, rough=0.85, spec=0.2)
    nt.links.new(col, p.inputs['Base Color'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m


LEAVES = [
    leaf_material('canopy_dark', (0.025, 0.06, 0.02, 1), (0.05, 0.09, 0.025, 1)),  # rain trees, mahogany
    leaf_material('canopy_mid', (0.045, 0.09, 0.025, 1), (0.08, 0.13, 0.035, 1)),
    leaf_material('canopy_light', (0.07, 0.12, 0.03, 1), (0.12, 0.17, 0.045, 1)),  # angsana, young growth
]


def crown_mesh(name, lumps, squash, seed, mat):
    """A crown from a few lumpy spheres, so the silhouette breaks up like foliage."""
    r = np.random.default_rng(seed)
    verts, faces = [], []
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0)
    ico = bpy.context.object
    base_v = np.array([v.co[:] for v in ico.data.vertices], dtype=np.float32)
    base_f = [tuple(p.vertices) for p in ico.data.polygons]
    bpy.data.objects.remove(ico)
    for k in range(lumps):
        off = np.array([r.uniform(-0.45, 0.45), r.uniform(-0.45, 0.45), r.uniform(0.0, 0.35)]) if k else np.zeros(3)
        rad = r.uniform(0.55, 0.8) if k else 0.85
        v = base_v * rad * (1 + r.uniform(-0.15, 0.15, (len(base_v), 1)))
        v[:, 2] *= squash
        v += off + np.array([0, 0, squash * 0.9])
        n0 = len(verts)
        verts += v.tolist()
        faces += [tuple(n0 + i for i in f) for f in base_f]
    o = kit.mesh_object(name, verts, faces, mat, smooth=True)
    return o


crowns = [crown_mesh(f'crown_{k}', lumps, squash, k + 1, LEAVES[k % 3]) for k, (lumps, squash) in enumerate(((4, 0.75), (5, 0.55), (3, 0.8), (5, 0.6), (4, 0.7), (3, 0.5)))]

# Candidate points on a jittered 6 m grid within 4 km, kept by where they fall.
g = np.arange(-4000, 4000, 6.0)
GX, GY = np.meshgrid(g, g)
pts = np.stack([GX.ravel(), GY.ravel()], 1) + rng.uniform(-2.5, 2.5, (GX.size, 2))
dist = np.hypot(pts[:, 0], pts[:, 1])
pts = pts[(dist > 40) & (dist < 4000)]
idx, border = district(pts[:, 0], pts[:, 1])
kind = KIND.flat[idx]
lu, lv = local(pts[:, 0], pts[:, 1], idx)
du, dv = street_dist(lu, lv, idx)
street = np.minimum(du, dv)
leafy = LEAFY.flat[idx]
u = rng.random(len(pts))
in_park = kind == 2
verge = (street > 5.0) & (street < 8.5) & (kind != 2) & (u < 0.25 + 0.5 * leafy)
main_verge = (border > 9.5) & (border < 13) & (u < 0.8)
garden = (kind == 0) & (np.abs((lu / 25.0) % 1 - 0.5) > 0.32) & (street > 7) & (u < 0.2)
campus = (kind == 3) & (street > 7) & (u < 0.16)
dist = np.hypot(pts[:, 0], pts[:, 1])
own = (dist < 190) & ~((np.abs(pts[:, 0]) < 50) & (pts[:, 1] > -45) & (pts[:, 1] < 22)) & (np.abs(dist - 150) > 4)
keep = ((in_park & (u < 0.92)) | verge | main_verge | garden | campus) & (dist >= 190) | (own & (u < 0.3))
P = pts[keep]
big = in_park[keep] | main_verge[keep]
n = len(P)
size = np.where(big, rng.uniform(4.0, 8.5, n), rng.uniform(2.6, 5.0, n))
scales = np.stack([size, size * rng.uniform(0.85, 1.15, n), size * rng.uniform(0.85, 1.2, n)], 1)
which = rng.integers(0, len(crowns), n)
for k, crown in enumerate(crowns):
    sel = which == k
    kit.instancer(f'trees_{k}', np.c_[P[sel], np.zeros(sel.sum())], scales[sel], rng.uniform(0, 2 * np.pi, sel.sum()), crown)
print('trees', n)

# ---------------------------------------------------------------- hills


def ridge(name, b0, b1, d0, d1, hmax, seed, color):
    """A range of hills between two bearings and distances, heights from layered waves."""
    r = np.random.default_rng(seed)
    nb, nd = 300, 70
    bs = np.radians(np.linspace(b0, b1, nb))
    ds = np.linspace(d0, d1, nd)
    phase = r.uniform(0, 100, 6)
    verts = []
    for d in ds:
        t = (d - d0) / (d1 - d0)
        env = math.sin(math.pi * min(1.0, t * 1.4)) ** 0.7
        for b in bs:
            h = 0.0
            for k, f in enumerate((3, 7, 15, 31, 63, 127)):
                h += math.sin(b * f + phase[k]) * math.cos(d / 1000 * (k + 1) * 0.7 + phase[k]) / (k + 1) ** 1.1
            h = max(0.0, 0.5 + 0.5 * h) ** 1.6 * hmax * env
            verts.append((d * math.sin(b), d * math.cos(b), h))
    faces = []
    for i in range(nd - 1):
        for j in range(nb - 1):
            a = i * nb + j
            faces.append((a, a + 1, a + nb + 1, a + nb))
    return kit.mesh_object(name, verts, faces, kit.simple_mat(name, color, 0.9, spec=0.2), smooth=True)


ridge('titiwangsa', 15, 130, 14000, 42000, 1100, 3, (0.05, 0.09, 0.04, 1))
ridge('north_hills', -40, 15, 13000, 30000, 450, 7, (0.06, 0.1, 0.045, 1))
ridge('south_hills', 150, 330, 16000, 34000, 380, 11, (0.07, 0.1, 0.05, 1))

# ---------------------------------------------------------------- render

for v in night_values:
    v.outputs[0].default_value = 1.0 if NIGHT else 0.0
kit.render_to_npy(sc, A['out'], A['mode'])
print('done', A['mode'])
