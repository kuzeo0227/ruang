# Thumbnail for the Views panel from a view's band: the north-facing part over a plain daytime sky.
#
# usage: python3 -I tools/views/thumb.py public/backdrops/<view> public/ui/views/<view>.jpg [--width 110] [--top 14]

import argparse
import json
import os

import numpy as np
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('band_dir')
p.add_argument('out')
p.add_argument('--width', type=float, default=110.0, help='degrees of bearing, centred on north')
p.add_argument('--top', type=float, default=None, help='elevation of the top edge (default: the band top)')
p.add_argument('--size', default='427x204')
a = p.parse_args()

meta = json.load(open(os.path.join(a.band_dir, 'meta.json')))
band = np.asarray(Image.open(os.path.join(a.band_dir, 'band_6k.webp')).convert('RGBA'), dtype=np.float32) / 255
H, W = band.shape[:2]
el0, el1 = meta['elMinDeg'], meta['elMaxDeg']
tw, th = (int(v) for v in a.size.split('x'))
top = a.top if a.top is not None else el1
height = a.width * th / tw
col = lambda b: int(round((meta['uNorth'] + b / 360) * W))  # noqa: E731
row = lambda el: int(round((el1 - el) / (el1 - el0) * H))  # noqa: E731
crop = band[max(0, row(top)) : row(top - height), col(-a.width / 2) : col(a.width / 2)]
# Sky: deep blue overhead to a pale haze at the horizon.
rows = np.linspace(top, top - height, crop.shape[0])[:, None, None]
t = np.clip(rows / 30, 0, 1)
sky = np.array([0.80, 0.86, 0.92]) * (1 - t) + np.array([0.42, 0.62, 0.86]) * t
img = crop[..., :3] * crop[..., 3:] + sky * (1 - crop[..., 3:])
Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((tw, th), Image.LANCZOS).save(a.out, quality=86)
print('saved', a.out)
