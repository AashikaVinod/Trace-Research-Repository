#!/usr/bin/env python3
"""
Generates assets/marble.webp, the marble texture behind the app window.
Procedural (no stock photo): layered noise bends sine-wave veins.
Usage: python3 tools/generate_marble.py   (needs numpy and Pillow)
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

W, H = 2400, 1500
rng = np.random.default_rng(7)

def noise(scale):
    """Smooth random noise: a small random grid blown up with bicubic resampling."""
    small = rng.random((max(2, H // scale), max(2, W // scale))).astype(np.float32)
    img = Image.fromarray((small * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0

def fractal(base, octaves=6):
    total = np.zeros((H, W), np.float32)
    amp, scale, norm = 1.0, base, 0.0
    for _ in range(octaves):
        total += noise(scale) * amp
        norm += amp
        amp *= 0.5
        scale = max(2, scale // 2)
    return total / norm

y, x = np.mgrid[0:H, 0:W].astype(np.float32)
# Low-frequency warping keeps the veins flowing instead of jagged.
warp = fractal(900, 4)
warp2 = fractal(500, 4)

# Veins follow one diagonal direction; the warp only bends them (so no loops).
detail = fractal(120, 4)  # small-scale roughness along the vein edges
phase_a = (x * 0.0009 + y * 0.0016) * np.pi + warp * 3.2 + detail * 0.55
phase_b = (x * 0.0021 + y * 0.0009) * np.pi + warp2 * 3.8 + detail * 0.7
broad = (1 - np.abs(np.sin(phase_a))) ** 22
fine = (1 - np.abs(np.sin(phase_b))) ** 70
# Veins fade in and out along their length, like real stone.
fade_a = np.clip((fractal(600, 3) - 0.35) * 2.6, 0, 1)
fade_b = np.clip((fractal(450, 3) - 0.45) * 3.0, 0, 1)
veins = np.clip(broad * fade_a * 0.9 + fine * fade_b * 0.45, 0, 1)

# Soft haze around the veins, like mineral bleeding into the stone.
haze = np.asarray(Image.fromarray((veins * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(46)), np.float32) / 255.0
clouds = fractal(800, 4)

# Colours: warm white stone, pale grey clouds, soft grey-green veins.
stone = np.array([247, 245, 241], np.float32)
cloud = np.array([231, 229, 223], np.float32)
vein = np.array([128, 136, 131], np.float32)

mix = np.clip(clouds * 0.7 + haze * 1.6, 0, 1)[..., None]
rgb = stone * (1 - mix) + cloud * mix
rgb = rgb * (1 - veins[..., None]) + vein * veins[..., None]
img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.4))

out = Path(__file__).resolve().parent.parent / 'assets' / 'marble.webp'
img.save(out, 'WEBP', quality=80, method=6)
print(f'Wrote {out} ({out.stat().st_size // 1024} KB)')
