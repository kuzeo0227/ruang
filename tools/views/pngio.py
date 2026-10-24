"""Write 8-bit PNGs from numpy arrays without PIL (Blender's Python has numpy but not PIL)."""

import struct
import zlib

import numpy as np


def save_png(path, img):
    img = np.ascontiguousarray(img, dtype=np.uint8)
    if img.ndim == 2:
        img = img[..., None]
    h, w, c = img.shape
    color_type = {1: 0, 3: 2, 4: 6}[c]
    raw = np.empty((h, 1 + w * c), dtype=np.uint8)
    raw[:, 0] = 0  # no filter
    raw[:, 1:] = img.reshape(h, w * c)

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, color_type, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(raw.tobytes(), 6)))
        f.write(chunk(b'IEND', b''))
