# Turns a Blender view render (see kit.py) into the app's window-view band.
#
# Reads <dir>/day_rgba.npy and day_mist.npy (linear, premultiplied alpha), and night_rgba.npy and
# mask_rgba.npy (where the water is) if present. Adds aerial haze by distance, tone-maps to sRGB
# with a soft shoulder, and writes band_6k.webp / band_3k.webp (landscape in RGB, coverage in
# alpha), night_6k.webp / night_3k.webp (lights only, RGB), water_6k.webp / water_3k.webp (water
# mask) and meta.json into the output folder.
#
# usage: python3 -I tools/views/make_band.py <render dir> <out dir> --el-min -80 --el-max 14
#            [--mist-depth 40000] [--visibility 20000] [--haze 0.78,0.82,0.88] [--target 0.42]
#            [--night-peak 0.04] [--sky-glow 0] [--preview p.png]

import argparse
import json
import os

import numpy as np
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('render_dir')
p.add_argument('out_dir')
p.add_argument('--el-min', type=float, required=True)
p.add_argument('--el-max', type=float, required=True)
p.add_argument('--mist-depth', type=float, default=40000.0)
p.add_argument('--visibility', type=float, default=20000.0, help='distance (m) at which haze reaches 63%')
p.add_argument('--haze', default='0.78,0.82,0.88', help='haze colour, display sRGB')
p.add_argument('--target', type=float, default=0.42, help='median display value of the landscape')
p.add_argument('--exposure', type=float, default=0.0, help='fixed exposure instead of --target (to keep views lit alike)')
p.add_argument('--night-peak', type=float, default=0.04, help="app radiance of the brightest night lights (scene units)")
p.add_argument('--sky-glow', type=float, default=0.0, help='light-pollution glow over the horizon at night (0 = none)')
p.add_argument('--night-percentile', type=float, default=99.0, help='lit pixels at or above this percentile show at full brightness')
p.add_argument('--horizon-haze', type=float, default=1.0, help="share of the app's time-of-day haze at the horizon (0 when near things fill it)")
p.add_argument('--sea-shade', type=float, default=0.0, help='shade far water (from the mask pass) towards --sea-colour, up to this share near the horizon')
p.add_argument('--sea-colour', default='0.30,0.42,0.50', help='deep water colour seen at a low angle, display sRGB')
p.add_argument('--preview', default='')
a = p.parse_args()

haze_srgb = np.array([float(v) for v in a.haze.split(',')], dtype=np.float32)


def to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def tonemap(lin, exposure):
    """Exposure, then a soft shoulder that keeps mid-tones linear and rolls off highlights."""
    x = lin * exposure
    knee = 0.7
    over = np.maximum(x - knee, 0)
    x = np.where(x > knee, knee + over / (1 + over / (1 - knee)), x)
    return to_srgb(x)


rgba = np.load(os.path.join(a.render_dir, 'day_rgba.npy')).astype(np.float32)
mist = np.load(os.path.join(a.render_dir, 'day_mist.npy')).astype(np.float32)
alpha = np.clip(rgba[..., 3], 0, 1)
rgb = rgba[..., :3] / np.maximum(alpha, 1e-4)[..., None]
dist = np.clip(mist, 0, 1) * a.mist_depth
haze = (1 - np.exp(-dist / a.visibility))[..., None]

# Exposure from the landscape's median luminance, so every view sits at the same brightness.
lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
solid = alpha > 0.99
target_lin = ((a.target + 0.055) / 1.055) ** 2.4
exposure = a.exposure or target_lin / max(float(np.median(lum[solid])), 1e-6)
disp = tonemap(rgb, exposure)
# Far water: seen at a low angle, wind waves turn their facets towards the eye, hiding the bright
# horizon a bump-mapped sea mirrors almost whole, so the distant sea shows its own deep blue.
mask_path = os.path.join(a.render_dir, 'mask_rgba.npy')
if a.sea_shade > 0 and os.path.exists(mask_path):
    water = np.clip(np.load(mask_path)[..., 0], 0, 1).astype(np.float32)
    el = np.linspace(a.el_max, a.el_min, disp.shape[0], dtype=np.float32)[:, None]
    t = np.clip((el + 14) / 12.5, 0, 1)
    f = (a.sea_shade * t * t * (3 - 2 * t) * water)[..., None]
    sea = np.array([float(v) for v in a.sea_colour.split(',')], dtype=np.float32)
    disp = disp * (1 - f) + sea * f
disp = disp * (1 - haze) + haze_srgb * haze

H, W = disp.shape[:2]
os.makedirs(a.out_dir, exist_ok=True)
band = np.dstack([disp, alpha]) * 255
band_img = Image.fromarray(np.clip(band + 0.5, 0, 255).astype(np.uint8), 'RGBA')
sizes = [(6144, 'band_6k.webp'), (3072, 'band_3k.webp')]
for width, name in sizes:
    h = int(round(H * width / W))
    img = band_img if width == W else band_img.resize((width, h), Image.LANCZOS)
    img.save(os.path.join(a.out_dir, name), quality=88, method=6)

night_path = os.path.join(a.render_dir, 'night_rgba.npy')
if os.path.exists(night_path):
    nrgba = np.load(night_path).astype(np.float32)
    # Lights are attenuated by the haze but not tinted by it.
    nl = nrgba[..., :3] * (1 - haze)
    # Normalise to the bright end of the lit pixels (a forest has only a few lamps, a city many).
    lit = nl.max(axis=2)
    vals = lit[lit > 1e-4 * max(float(lit.max()), 1e-12)]
    peak = float(np.percentile(vals, a.night_percentile)) if len(vals) > 50 else float(lit.max()) or 1.0
    enc = to_srgb(nl / peak)
    nimg = Image.fromarray(np.clip(enc * 255 + 0.5, 0, 255).astype(np.uint8), 'RGB')
    for width, name in ((6144, 'night_6k.webp'), (3072, 'night_3k.webp')):
        h = int(round(H * width / W))
        img = nimg if width == W else nimg.resize((width, h), Image.LANCZOS)
        img.save(os.path.join(a.out_dir, name), quality=86, method=6)

# Where the water is (the mask pass: sea white, everything else black), for the app's sun glitter.
if os.path.exists(mask_path):
    m = np.clip(np.load(mask_path)[..., 0], 0, 1)
    mimg = Image.fromarray((m * 255 + 0.5).astype(np.uint8), 'L')
    for width, name in ((6144, 'water_6k.webp'), (3072, 'water_3k.webp')):
        h = int(round(H * width / W))
        img = mimg if width == W else mimg.resize((width, h), Image.LANCZOS)
        img.save(os.path.join(a.out_dir, name), quality=90, method=6)

# Landscape colour just below the horizon (haze) and at the bottom of the band (ground fill).
row = lambda el: int(round((a.el_max - el) / (a.el_max - a.el_min) * (H - 1)))
near_horizon = disp[row(0) : row(-3) + 1][alpha[row(0) : row(-3) + 1] > 0.5]
bottom = disp[int(H * 0.9) :][alpha[int(H * 0.9) :] > 0.5]
meta = {
    'elMinDeg': a.el_min,
    'elMaxDeg': a.el_max,
    'uNorth': 0.5,
    'hazeSRGB': [round(float(c), 4) for c in (near_horizon.mean(0) if len(near_horizon) else haze_srgb)],
    'groundSRGB': [round(float(c), 4) for c in (bottom.mean(0) if len(bottom) else haze_srgb)],
    'night': os.path.exists(night_path),
    'water': os.path.exists(mask_path),
    'nightPeak': a.night_peak,
    'skyGlow': a.sky_glow,
    'horizonHaze': a.horizon_haze,
    'source': 'Rendered in Blender (tools/views)',
}
with open(os.path.join(a.out_dir, 'meta.json'), 'w') as f:
    json.dump(meta, f, indent=2)

if a.preview:
    sky = np.array([0.55, 0.68, 0.86], dtype=np.float32)
    prev = disp * alpha[..., None] + sky * (1 - alpha[..., None])
    Image.fromarray((prev * 255).astype(np.uint8)).save(a.preview)
print('exposure', round(exposure, 4), 'size', W, H)
