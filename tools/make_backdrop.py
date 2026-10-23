# Makes a window-view backdrop from a Poly Haven panorama and its "_puresky" twin.
#
# The landscape mask is where the two tonemapped panoramas differ (the puresky version has
# the ground replaced by sky). Output: an equirectangular band with the landscape in RGB and
# the mask in alpha; the renderer draws its own sky (time of day) behind it.
#
# usage: python3 -I tools/make_backdrop.py full.jpg puresky.jpg out_dir el_min el_max u_north
# Outputs band_6k.webp, band_3k.webp and meta.json (committed under public/backdrops/<name>/).

import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

full_path, sky_path, out_dir = sys.argv[1:4]
el_min, el_max, u_north = map(float, sys.argv[4:7])

full = Image.open(full_path).convert('RGB')
sky = Image.open(sky_path).convert('RGB')
W, H = full.size
assert sky.size == full.size, 'panoramas differ in size'

# Rows for the elevation band (equirect: row 0 = +90 deg, row H = -90 deg).
top = int(round((0.5 - el_max / 180) * H))
bot = int(round((0.5 - el_min / 180) * H))
f = np.asarray(full.crop((0, top, W, bot)), dtype=np.float32)
s = np.asarray(sky.crop((0, top, W, bot)), dtype=np.float32)

# Mask: colour difference, smoothed, then a soft threshold.
diff = np.abs(f - s).mean(axis=2)
diff_img = Image.fromarray(np.clip(diff * 4, 0, 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))
d = np.asarray(diff_img, dtype=np.float32) / 4
mask = np.clip((d - 6.0) / (22.0 - 6.0), 0, 1)
# Everything well below the horizon is ground even where the colours happen to match.
rows = np.linspace(el_max, el_min, bot - top)[:, None]
mask = np.where(rows < -4.0, 1.0, mask)
mask_img = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))

rgba = Image.fromarray(f.astype(np.uint8)).convert('RGBA')
rgba.putalpha(mask_img)

os.makedirs(out_dir, exist_ok=True)
for name, width in (('band_6k.webp', 6144), ('band_3k.webp', 3072)):
    h = int(round((bot - top) * width / W))
    rgba.resize((width, h), Image.LANCZOS).save(os.path.join(out_dir, name), quality=88, method=6)

# Average colour of the landscape just below the horizon, for haze and the nadir fill.
horizon_rows = slice(int((el_max - 0) / (el_max - el_min) * (bot - top)), int((el_max + 3) / (el_max - el_min) * (bot - top)))
haze = f[horizon_rows].reshape(-1, 3).mean(axis=0)
ground = f[-int((bot - top) * 0.1):].reshape(-1, 3).mean(axis=0)

meta = {
    'elMinDeg': el_min,
    'elMaxDeg': el_max,
    'uNorth': u_north,
    'hazeSRGB': [round(float(c) / 255, 4) for c in haze],
    'groundSRGB': [round(float(c) / 255, 4) for c in ground],
    'source': os.path.basename(full_path),
}
with open(os.path.join(out_dir, 'meta.json'), 'w') as fh:
    json.dump(meta, fh, indent=2)
print(json.dumps(meta, indent=2))
