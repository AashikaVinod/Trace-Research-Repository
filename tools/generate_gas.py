#!/usr/bin/env python3
"""
Generates assets/gas.webp: one soft, already-blurred colour cloud (white
to transparent). The background uses it six times, tinted with different
colours in CSS, and only moves it. Moving a pre-blurred image is far
cheaper for the browser than blurring shapes on every frame.
Usage: python3 tools/generate_gas.py   (needs numpy and Pillow)
"""
from pathlib import Path
import numpy as np
from PIL import Image

SIZE = 512
y, x = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32) / SIZE - 0.5
rng = np.random.default_rng(3)
# A lumpy, organic outline instead of a perfect circle.
angle = np.arctan2(y, x)
wobble = 1 + 0.12 * np.sin(3 * angle + 0.7) + 0.08 * np.sin(5 * angle + 2.1)
distance = np.sqrt(x ** 2 + y ** 2) / (0.42 * wobble)
alpha = np.clip(np.exp(-(distance ** 2) * 2.6) - 0.02, 0, 1)
rgba = np.zeros((SIZE, SIZE, 4), np.uint8)
rgba[..., :3] = 255
rgba[..., 3] = (alpha * 255).astype(np.uint8)
out = Path(__file__).resolve().parent.parent / 'assets' / 'gas.webp'
Image.fromarray(rgba, 'RGBA').save(out, 'WEBP', quality=85, method=6)
print(f'Wrote {out} ({out.stat().st_size // 1024} KB)')
