#!/usr/bin/env python3
"""
Remove the solid black background from the Watcher mascot, producing a
transparent PNG that sits cleanly on both light and dark themes.

Approach: flood-fill transparency from the image borders, treating only *dark*
pixels that are CONNECTED to the edge as background. This preserves the dark
navy/purple face dome inside the mascot (which a naive "remove all dark pixels"
threshold would eat into). Then feather the alpha edge slightly for clean
anti-aliasing, and trim to the mascot's bounding box.
"""
import sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

SRC = sys.argv[1] if len(sys.argv) > 1 else "photo_2026-06-04 23.30.45.jpeg"
OUT = sys.argv[2] if len(sys.argv) > 2 else "apps/mini-app/public/mascot.png"

# A pixel counts as "background black" if its max channel is below this.
BLACK_MAX = 60

img = Image.open(SRC).convert("RGB")
arr = np.asarray(img)
h, w, _ = arr.shape

is_dark = arr.max(axis=2) < BLACK_MAX  # True where pixel is near-black

# Flood fill from all border pixels through connected dark regions.
bg = np.zeros((h, w), dtype=bool)
dq = deque()
for x in range(w):
    for y in (0, h - 1):
        if is_dark[y, x] and not bg[y, x]:
            bg[y, x] = True
            dq.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if is_dark[y, x] and not bg[y, x]:
            bg[y, x] = True
            dq.append((y, x))

while dq:
    y, x = dq.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and is_dark[ny, nx] and not bg[ny, nx]:
            bg[ny, nx] = True
            dq.append((ny, nx))

alpha = np.where(bg, 0, 255).astype(np.uint8)

# Build RGBA, feather the alpha edge a touch to kill the hard black halo.
rgba = np.dstack([arr, alpha])
out = Image.fromarray(rgba)
a = out.split()[3].filter(ImageFilter.GaussianBlur(0.8))
out.putalpha(a)

# Trim to the mascot's bounding box so it isn't floating in dead space.
bbox = out.getbbox()
if bbox:
    out = out.crop(bbox)

# Cap size for web; keep aspect.
out.thumbnail((512, 512), Image.LANCZOS)
out.save(OUT)
print(f"saved {OUT}  size={out.size}")
