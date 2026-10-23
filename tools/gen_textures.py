"""Generate tileable PBR detail textures (albedo + normal) for the terrain and roads.

Spectral (FFT) synthesis makes every layer seamlessly tileable. Output: textures/<name>_albedo.jpg, <name>_normal.jpg
Run: python3 tools/gen_textures.py
"""
import os
import numpy as np
from PIL import Image

N = 1024
rng = np.random.default_rng(1991)
OUT = os.path.join(os.path.dirname(__file__), '..', 'textures')
os.makedirs(OUT, exist_ok=True)

fx = np.fft.fftfreq(N)[:, None]
fy = np.fft.fftfreq(N)[None, :]
FR = np.sqrt(fx * fx + fy * fy)
FR[0, 0] = 1e-6


def spectral(beta=2.0, lo=0.0, hi=0.5, aniso=None):
    """Tileable noise with a 1/f^beta spectrum; aniso=(angle, stretch) squeezes it along a direction."""
    f = FR
    if aniso is not None:
        a, s = aniso
        u = fx * np.cos(a) + fy * np.sin(a)
        v = -fx * np.sin(a) + fy * np.cos(a)
        f = np.sqrt((u * s) ** 2 + (v / s) ** 2) + 1e-6
    amp = f ** (-beta / 2)
    amp[(f < lo) | (f > hi)] = 0
    ph = np.exp(2j * np.pi * rng.random((N, N)))
    n = np.real(np.fft.ifft2(amp * ph))
    n -= n.mean()
    return n / (n.std() + 1e-9)


def norm01(a):
    a = a - a.min()
    return a / (a.max() + 1e-9)


def worley(cells, jitter=1.0):
    """Tileable cellular noise: distance to nearest and second-nearest feature point, plus a per-cell random id."""
    g = np.arange(N) / N * cells
    X, Y = np.meshgrid(g, g, indexing='ij')
    pts = rng.random((cells, cells, 2)) * jitter + (1 - jitter) / 2
    ids = rng.random((cells, cells))
    d1 = np.full((N, N), 9.0); d2 = np.full((N, N), 9.0); idm = np.zeros((N, N))
    cx, cy = np.floor(X).astype(int), np.floor(Y).astype(int)
    for ox in (-1, 0, 1):
        for oy in (-1, 0, 1):
            nx, ny = (cx + ox) % cells, (cy + oy) % cells
            px = cx + ox + pts[nx, ny, 0]
            py = cy + oy + pts[nx, ny, 1]
            d = np.sqrt((X - px) ** 2 + (Y - py) ** 2)
            closer = d < d1
            d2 = np.where(closer, d1, np.minimum(d2, d))
            idm = np.where(closer, ids[nx, ny], idm)
            d1 = np.where(closer, d, d1)
    return d1, d2, idm


def normal_from_height(h, strength):
    # R = -dh/du (image columns), G = -dh/dv (image rows, top row = v 0); matches the shader's world-space sampling
    du = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dv = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx, ny, nz = -du * strength, -dv * strength, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1)


def save(name, albedo, height, strength):
    a = np.clip(albedo, 0, 1)
    Image.fromarray((a ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'{name}_albedo.jpg'), quality=88)
    n = normal_from_height(height, strength)
    Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'{name}_normal.jpg'), quality=92)
    mean = a.reshape(-1, 3).mean(0)
    print(name, 'mean linear', np.round(mean, 4).tolist())
    return mean.tolist()


def lerp(a, b, t):
    return a + (b - a) * t[..., None] if np.ndim(t) == 2 else a + (b - a) * t


def col(r, g, b):
    return np.array([r, g, b]) ** 2.2  # sRGB-ish -> linear


means = {}

# ---------------- asphalt: bitumen with exposed aggregate, fine cracks, tyre polish
stone = np.zeros((N, N)); shade = np.zeros((N, N))
for cells, rad, keep in ((260, 2.8, 0.45), (150, 2.6, 0.6), (90, 2.4, 0.8)):
    d1, d2, idm = worley(cells, 1.0)
    st = np.clip(1 - d1 * rad, 0, 1) ** 0.7 * (idm > keep)
    shade = np.where(st > stone, idm, shade); stone = np.maximum(stone, st)
fine = spectral(1.2, 0.02, 0.5)
mid = spectral(2.2, 0.0, 0.08)
cracks = np.clip(1 - np.abs(spectral(2.6, 0.0, 0.05)) * 14, 0, 1) ** 3 * (spectral(2.0, 0, 0.02) > 0.6)
base = 0.085 + 0.016 * mid + 0.012 * fine
lum = base * (1 - stone * 0.85) + stone * 0.85 * (0.09 + shade * 0.09)
lum *= 1 - 0.55 * cracks
alb = np.stack([lum, lum * 0.99, lum * 1.02], -1)
h = stone * 1.0 + fine * 0.15 + mid * 0.2 - cracks * 1.2
means['asphalt'] = save('asphalt', alb, h, 6.0)

# ---------------- grass: thousands of thin blades (anisotropic strokes) with shadowed gaps, mixed hues, clover and soil
blades = np.zeros((N, N)); hue = np.zeros((N, N))
for k in range(9):
    a = rng.random() * np.pi
    layer = spectral(0.7, 0.06, 0.5, aniso=(a, 10.0))
    m = np.clip(layer - 0.4, 0, None)
    blades = np.maximum(blades, m)
    hue = np.where(m > 0.05, rng.random(), hue)
blades = norm01(blades) ** 0.7
gaps = np.clip(1 - blades * 2.2, 0, 1)
clump = norm01(spectral(2.2, 0, 0.05))
dry = norm01(spectral(2.0, 0, 0.08))
c1, c2, c3 = col(0.20, 0.36, 0.10), col(0.36, 0.50, 0.16), col(0.55, 0.56, 0.28)
green = lerp(c1, c2, np.clip(hue * 0.8 + clump * 0.4, 0, 1))
green = lerp(green, c3, np.clip((dry - 0.6) * 2.5, 0, 1) * (hue > 0.6))
green *= (0.55 + 0.6 * blades)[..., None]
soil = np.clip((0.28 - clump) * 6, 0, 1) * gaps
alb = lerp(green, col(0.30, 0.24, 0.16), soil)
alb = lerp(alb, col(0.06, 0.09, 0.04), gaps * 0.55)
h = blades - gaps * 0.6
means['grass'] = save('grass', alb, h, 7.0)

# ---------------- forest floor: soil, irregular fallen leaves, needles, moss
soilN = spectral(1.8, 0, 0.5)
leafSum = np.zeros((N, N)); leafCol = np.zeros((N, N, 3)) + col(0.22, 0.16, 0.11)
for cells, thr in ((40, 0.45), (75, 0.4), (130, 0.35)):
    d1, d2, idm = worley(cells, 1.0)
    wob = spectral(1.5, 0.02, 0.5) * 0.08
    leaf = np.clip((0.42 - d1 + wob) * 9, 0, 1) * (idm > thr)
    cc = lerp(col(0.40, 0.22, 0.09), col(0.66, 0.46, 0.18), idm)
    cc = lerp(cc, col(0.30, 0.20, 0.12), (idm > 0.85).astype(float))
    leafCol = lerp(leafCol, cc, leaf)
    leafSum = np.maximum(leafSum, leaf)
needles = np.clip(spectral(0.8, 0.08, 0.5, aniso=(0.7, 12.0)), 0, None) + np.clip(spectral(0.8, 0.08, 0.5, aniso=(2.3, 12.0)), 0, None)
needles = np.clip((norm01(needles) - 0.72) * 6, 0, 1)
moss = np.clip((norm01(spectral(2.4, 0, 0.05)) - 0.6) * 5 + spectral(1.0, 0.05, 0.5) * 0.3, 0, 1)
soilC = lerp(col(0.18, 0.13, 0.09), col(0.27, 0.20, 0.14), norm01(soilN))
alb = lerp(soilC, leafCol, leafSum * 0.95)
alb = lerp(alb, col(0.40, 0.29, 0.17), needles * 0.8)
alb = lerp(alb, col(0.20, 0.31, 0.10) * (0.8 + 0.3 * norm01(spectral(1, 0.1, 0.5)))[..., None], moss * 0.85)
h = soilN * 0.2 + leafSum * 0.7 + needles * 0.3 + moss * 0.3
means['forest'] = save('forest', alb, h, 5.0)

# ---------------- sand: near-parallel wind ripples with gentle bends and forks, fine grain
warp = spectral(2.8, 0, 0.02) * 5 + spectral(2.0, 0.02, 0.06) * 1.2
yy = np.arange(N)[None, :] + np.zeros((N, 1))
xx = np.arange(N)[:, None] + np.zeros((1, N))
ph = (xx * 0.2 + yy * 1.0) / N * 2 * np.pi * 48 + warp
ripple = np.sin(ph) ** 2 * np.sign(np.sin(ph))  # sharper crests
ripple = np.sin(ph + 0.5 * np.sin(ph))          # asymmetric profile: gentle windward, steep lee
grain = spectral(0.4, 0.15, 0.5)
dune = spectral(2.6, 0, 0.02)
lum = 0.60 + 0.035 * ripple + 0.035 * grain + 0.04 * dune
alb = np.stack([lum * 1.0, lum * 0.83, lum * 0.60], -1) * np.array([0.93, 0.91, 0.87])
dark = (rng.random((N, N)) > 0.995).astype(float)
alb = lerp(alb, col(0.35, 0.28, 0.22), dark * 0.6)
h = ripple * 0.45 + grain * 0.12 + dune * 0.5
means['sand'] = save('sand', np.clip(alb, 0, 1), h, 3.0)

# ---------------- rock: domain-warped ridged fractal, thin fractures, strata, lichen
wx, wy = spectral(2.4, 0, 0.06) * 30, spectral(2.4, 0, 0.06) * 30
def warped(n):
    ix = (np.arange(N)[:, None] + wx).astype(int) % N
    iy = (np.arange(N)[None, :] + wy).astype(int) % N
    return n[ix, iy]
r1 = warped(1 - np.abs(spectral(2.0, 0, 0.5)))
r2 = warped(1 - np.abs(spectral(2.3, 0, 0.1)))
frac = np.clip(1 - np.abs(warped(spectral(2.2, 0, 0.08))) * 18, 0, 1) ** 2
strata = np.sin((np.arange(N)[None, :] + wy * 2) / N * 2 * np.pi * 9) * 0.5 + 0.5
hgt = r2 * 0.55 + r1 * 0.3 + strata * 0.15 - frac * 0.5
tone = norm01(spectral(2.4, 0, 0.05))
lum = 0.27 + 0.13 * norm01(hgt) + 0.05 * tone
alb = np.stack([lum * 1.02, lum * 0.97, lum * 0.91], -1)
alb *= (1 - 0.6 * frac)[..., None]
lichen = np.clip((norm01(spectral(2.5, 0, 0.06)) - 0.72) * 6, 0, 1) * (norm01(spectral(0.8, 0.05, 0.5)) > 0.45)
alb = lerp(alb, col(0.55, 0.56, 0.40), lichen * 0.45)
means['rock'] = save('rock', alb, hgt, 9.0)

# ---------------- snow: soft drifts, wind crust, sparkle
drift = spectral(2.6, 0, 0.05)
crust = spectral(1.4, 0.02, 0.5)
sparkle = (rng.random((N, N)) > 0.9985).astype(float)
lum = 0.86 + 0.04 * drift + 0.02 * crust + 0.1 * sparkle
alb = np.stack([lum * 0.97, lum * 0.98, lum * 1.0], -1)
means['snow'] = save('snow', np.clip(alb, 0, 1), drift * 0.6 + crust * 0.2, 2.5)

import json
with open(os.path.join(OUT, 'means.json'), 'w') as f:
    json.dump(means, f, indent=1)
