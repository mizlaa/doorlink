#!/usr/bin/env python3
"""
Generates the demo's 3D surface textures: seamless, tileable colour and
normal maps for Australian brick, acrylic render, concrete roof tiles,
broom-finished concrete, lawn, mulch, timber grain, eucalypt bark and the
painted-steel skin of a door, plus alpha leaf cards for the plants.

Everything is drawn from code (no photos), so the files are ours to ship.
Each texture covers a known real-world size, noted beside it, and the
scene sets UV repeats in metres so bricks, tiles and grass sit at true
scale whatever the door size.

Also converts the CC0 "Rooitou Park" HDRI (Poly Haven, via the pmndrs
drei-assets mirror) to a 512 x 256 Radiance file for image-based lighting.

    python3 demo-app/scripts/make-textures.py [path/to/rooitou_park_1k.hdr]
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'three', 'textures')
os.makedirs(OUT, exist_ok=True)


# ---------------------------------------------------------------- helpers

def value_noise(size, freq, seed):
    """Tileable value noise in [0, 1] (freq lattice cells across the tile)."""
    rng = np.random.default_rng(seed)
    lattice = rng.random((freq, freq))
    coords = np.arange(size) * freq / size
    i0 = np.floor(coords).astype(int)
    f = coords - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % freq
    i0 = i0 % freq
    a = lattice[np.ix_(i0, i0)]
    b = lattice[np.ix_(i0, i1)]
    c = lattice[np.ix_(i1, i0)]
    d = lattice[np.ix_(i1, i1)]
    fy = f[:, None]
    fx = f[None, :]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(size, base, octaves, seed, gain=0.5):
    total = np.zeros((size, size))
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        freq = base * (2 ** o)
        if freq > size:
            break
        total += amp * value_noise(size, freq, seed + o * 101)
        norm += amp
        amp *= gain
    return total / norm


def stretched_noise(size, fx, fy, seed):
    """Tileable noise with different frequencies on each axis (streaks)."""
    rng = np.random.default_rng(seed)
    lattice = rng.random((fy, fx))
    def axis(freq):
        coords = np.arange(size) * freq / size
        i0 = np.floor(coords).astype(int)
        f = coords - i0
        f = f * f * (3 - 2 * f)
        return i0 % freq, (i0 + 1) % freq, f
    y0, y1, wy = axis(fy)
    x0, x1, wx = axis(fx)
    a = lattice[np.ix_(y0, x0)]
    b = lattice[np.ix_(y0, x1)]
    c = lattice[np.ix_(y1, x0)]
    d = lattice[np.ix_(y1, x1)]
    wy = wy[:, None]
    wx = wx[None, :]
    return (a * (1 - wx) + b * wx) * (1 - wy) + (c * (1 - wx) + d * wx) * wy


def normal_map(height, strength):
    """OpenGL-convention tangent-space normals from a tileable height field."""
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5
    nx = -dx * strength
    ny = dy * strength  # image rows run down; texture v runs up
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack([nx / length, ny / length, nz / length], axis=-1) * 0.5 + 0.5
    return Image.fromarray((rgb * 255).clip(0, 255).astype(np.uint8), 'RGB')


def rgb_image(arr):
    return Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGB')


def save(img, name, quality=82):
    path = os.path.join(OUT, name)
    img.save(path, 'WEBP', quality=quality, method=6)
    print(f'{name:28s} {img.size[0]}x{img.size[1]}  {os.path.getsize(path) // 1024} KB')


def hex_rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


# ------------------------------------------------------------------ brick
# 1024 px = 4 bricks x 12 courses: 960 x 1032 mm. 230 x 76 mm bricks,
# 10 mm raked mortar joints, stretcher bond. A blond-to-tan blend.

def brick():
    s = 1024
    yy, xx = np.mgrid[0:s, 0:s].astype(float)
    x_mm = xx / s * 960
    y_mm = yy / s * 1032
    course = np.floor(y_mm / 86).astype(int)
    offset = (course % 2) * 120
    bx = (x_mm + offset) % 240
    by = y_mm % 86
    jitter = (fbm(s, 16, 3, 3) - 0.5) * 2.2
    mortar = (bx > 230 + jitter * 0.4) | (by > 76 + jitter * 0.4)
    brick_id = course * 7 + (np.floor((x_mm + offset) / 240).astype(int) % 4) * 3
    rng = np.random.default_rng(11)
    palette = np.array([hex_rgb(c) for c in ['#d9b98c', '#cfa877', '#e3c79f', '#c99a6b', '#d6b184', '#bf8c5d', '#e0be92', '#b98457']])
    pick = rng.integers(0, len(palette), size=400)
    base = palette[pick[brick_id % 400]]
    tone = rng.random(400)[brick_id % 400][..., None] * 0.12 - 0.06
    speck = fbm(s, 128, 3, 5)
    grain = fbm(s, 32, 5, 9)
    colour = base + tone + (grain[..., None] - 0.5) * 0.12 - (speck[..., None] > 0.72) * 0.08
    # Darker "flashed" ends on some bricks.
    flash = (rng.random(400)[brick_id % 400] > 0.8)[..., None] * (np.abs(bx - 115)[..., None] / 115) ** 3 * 0.18
    colour = colour - flash
    mortar_col = hex_rgb('#cfc8bb')[None, None, :] + (fbm(s, 64, 3, 21)[..., None] - 0.5) * 0.1
    colour = np.where(mortar[..., None], mortar_col, colour)
    # Height: bricks proud, rounded arrises, mortar raked back.
    edge = np.minimum(np.minimum(bx, 230 - bx), np.minimum(by, 76 - by))
    height = np.where(mortar, 0.15 + fbm(s, 96, 2, 31) * 0.1, 0.75 + np.clip(edge / 4, 0, 1) * 0.25 + (grain - 0.5) * 0.18)
    save(rgb_image(colour), 'brick_color.webp', 84)
    save(normal_map(height, 6.0), 'brick_normal.webp', 88)


# ----------------------------------------------------------------- render
# 512 px = 1 m of sand-finish acrylic render. Near-white: tinted in scene.

def render():
    s = 512
    fine = fbm(s, 128, 3, 41)
    mid = fbm(s, 16, 4, 43)
    colour = 0.9 + (mid - 0.5) * 0.08 + (fine - 0.5) * 0.06
    save(rgb_image(np.stack([colour] * 3, -1)), 'render_color.webp')
    save(normal_map(fine * 0.6 + mid * 0.2, 3.0), 'render_normal.webp', 86)


# -------------------------------------------------------------- roof tile
# 1024 px = 4 tiles x 4 courses: 1320 x 1380 mm concrete roof tiles with
# a low double-roman profile and a shadowed lip at each course.

def roof():
    s = 1024
    yy, xx = np.mgrid[0:s, 0:s].astype(float)
    tile = 330.0
    gauge = 345.0
    x_mm = xx / s * tile * 4
    y_mm = yy / s * gauge * 4
    course = np.floor(y_mm / gauge).astype(int)
    shift = (np.random.default_rng(3).random(8)[course % 8] - 0.5) * 16
    tx = (x_mm + shift) % tile
    ty = (y_mm % gauge) / gauge  # 0 at top (under the course above), 1 at the lip
    profile = 0.5 + 0.5 * np.cos((tx / tile) * 2 * math.pi * 2)  # pan and roll
    roll = np.clip(np.cos((tx / tile - 0.75) * 2 * math.pi), 0, 1) ** 2
    slope = ty * 0.55
    lip = np.clip((ty - 0.93) / 0.07, 0, 1)
    height = profile * 0.35 + roll * 0.35 + slope - lip * 0.6
    joint = (np.minimum(tx, tile - tx) < 3)
    height = np.where(joint, height - 0.25, height)
    rng = np.random.default_rng(17)
    tile_id = course * 9 + np.floor((x_mm + shift) / tile).astype(int)
    tone = (rng.random(200)[tile_id % 200] - 0.5) * 0.06
    grain = fbm(s, 96, 3, 13)
    lichen = (fbm(s, 8, 4, 19) > 0.66) * fbm(s, 64, 2, 23) * 0.05
    base = hex_rgb('#4a4d50')
    shade = (0.62 + ty * 0.38 - lip * 0.35) * (0.78 + 0.22 * (profile * 0.5 + roll * 0.5)) - joint * 0.12
    colour = base[None, None, :] * shade[..., None] + tone[..., None] + (grain[..., None] - 0.5) * 0.05 + lichen[..., None] * np.array([0.3, 0.32, 0.18])
    save(rgb_image(colour), 'roof_color.webp', 84)
    save(normal_map(height, 7.0), 'roof_normal.webp', 88)


# --------------------------------------------------------------- concrete
# 1024 px = 2 m of broom-finished driveway concrete.

def concrete():
    s = 1024
    broom = stretched_noise(s, 4, 220, 51) * 0.6 + stretched_noise(s, 8, 420, 53) * 0.4
    large = fbm(s, 4, 4, 55)
    speck = fbm(s, 256, 2, 57)
    aggregate = (speck > 0.68) * 0.07 - (speck < 0.25) * 0.05
    colour = 0.71 + (large - 0.5) * 0.08 + (broom - 0.5) * 0.05 + aggregate
    tint = np.stack([colour * 1.0, colour * 0.985, colour * 0.955], -1)
    save(rgb_image(tint), 'concrete_color.webp', 84)
    save(normal_map(broom * 0.8 + speck * 0.2, 4.0), 'concrete_normal.webp', 86)


# ------------------------------------------------------------------ lawn
# 1024 px = 1.5 m of buffalo-style lawn: thousands of short blades.

def grass():
    s = 1024
    rng = np.random.default_rng(61)
    base = fbm(s, 6, 4, 63)
    img = Image.new('RGB', (s, s))
    arr = np.stack([0.24 + base * 0.06, 0.38 + base * 0.1, 0.14 + base * 0.04], -1)
    img = rgb_image(arr)
    height = Image.new('L', (s, s), 40)
    draw = ImageDraw.Draw(img)
    hdraw = ImageDraw.Draw(height)
    for _ in range(26000):
        x, y = rng.random() * s, rng.random() * s
        length = 6 + rng.random() * 14
        angle = -math.pi / 2 + (rng.random() - 0.5) * 1.6
        x2, y2 = x + math.cos(angle) * length, y + math.sin(angle) * length
        g = rng.random()
        dry = rng.random() < 0.08
        col = (
            int((0.32 + g * 0.2 + dry * 0.25) * 255),
            int((0.48 + g * 0.22 + dry * 0.08) * 255),
            int((0.16 + g * 0.1) * 255),
        )
        width = 1 + int(rng.random() * 2)
        for ox in (-s, 0, s):
            for oy in (-s, 0, s):
                draw.line((x + ox, y + oy, x2 + ox, y2 + oy), fill=col, width=width)
                hdraw.line((x + ox, y + oy, x2 + ox, y2 + oy), fill=int(120 + g * 135), width=width)
    img = img.filter(ImageFilter.GaussianBlur(0.5))
    save(img, 'grass_color.webp', 66)
    h = np.asarray(height.filter(ImageFilter.GaussianBlur(0.8)), dtype=float) / 255
    save(normal_map(h, 3.0).resize((512, 512), Image.LANCZOS), 'grass_normal.webp', 76)


# ------------------------------------------------------------------ mulch
# 512 px = 0.8 m of pine-bark mulch.

def mulch():
    s = 512
    rng = np.random.default_rng(71)
    img = Image.new('RGB', (s, s), (46, 32, 22))
    height = Image.new('L', (s, s), 30)
    draw = ImageDraw.Draw(img)
    hdraw = ImageDraw.Draw(height)
    for _ in range(5200):
        cx, cy = rng.random() * s, rng.random() * s
        w, h = 4 + rng.random() * 14, 2 + rng.random() * 6
        a = rng.random() * math.pi
        pts = [(cx + math.cos(a) * w * sx - math.sin(a) * h * sy, cy + math.sin(a) * w * sx + math.cos(a) * h * sy) for sx, sy in ((-1, -1), (1, -0.6), (1, 1), (-1, 0.7))]
        t = rng.random()
        col = (int(90 + t * 70), int(58 + t * 42), int(34 + t * 24))
        for ox in (-s, 0, s):
            for oy in (-s, 0, s):
                shifted = [(px + ox, py + oy) for px, py in pts]
                draw.polygon(shifted, fill=col)
                hdraw.polygon(shifted, fill=int(110 + t * 140))
    save(img.filter(ImageFilter.GaussianBlur(0.4)), 'mulch_color.webp', 80)
    save(normal_map(np.asarray(height.filter(ImageFilter.GaussianBlur(1)), dtype=float) / 255, 4.0), 'mulch_normal.webp', 82)


# ------------------------------------------------------------------- wood
# 1024 px = 1 m of timber-look grain running along x. Light, so the
# chosen door colour tints it.

def wood():
    s = 1024
    yy, xx = np.mgrid[0:s, 0:s].astype(float)
    warp = stretched_noise(s, 3, 24, 81) * 18 + stretched_noise(s, 6, 60, 83) * 4
    rings = np.sin((yy + warp) / s * 2 * math.pi * 46)
    rings = (rings * 0.5 + 0.5) ** 3
    pores = stretched_noise(s, 2, 400, 85)
    streak = stretched_noise(s, 4, 90, 87)
    value = 0.72 + streak * 0.14 - rings * 0.2 - (pores > 0.7) * 0.06
    save(rgb_image(np.stack([value * 1.02, value * 0.96, value * 0.88], -1)), 'wood_color.webp', 84)
    save(normal_map(rings * 0.5 + pores * 0.3, 3.5), 'wood_normal.webp', 86)


# ---------------------------------------------------------------- steel
# 512 px = 0.3 m of stucco-embossed steel door skin (normal only).

def steel():
    s = 512
    bumps = fbm(s, 48, 3, 91)
    peel = fbm(s, 160, 2, 93)
    save(normal_map(bumps * 0.7 + peel * 0.3, 2.2), 'steel_normal.webp', 86)


# ------------------------------------------------------------------- bark
# 512 x 1024 px = 0.5 x 1 m of smooth spotted-gum bark.

def bark():
    w, h = 512, 1024
    rng = np.random.default_rng(101)
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    # Voronoi-ish patches, tileable by wrapping the seed points.
    pts = rng.random((150, 2)) * [w, h]
    best = np.full((h, w), 1e9)
    which = np.zeros((h, w), dtype=int)
    for i, (px, py) in enumerate(pts):
        dx = np.minimum(np.abs(xx - px), w - np.abs(xx - px))
        dy = np.minimum(np.abs(yy - py), h - np.abs(yy - py)) * 0.6
        d = dx * dx + dy * dy
        closer = d < best
        best = np.where(closer, d, best)
        which = np.where(closer, i, which)
    palette = np.array([hex_rgb(c) for c in ['#d9d2c3', '#c9c1b1', '#bfb7a6', '#d8c3a8', '#e2ddd2', '#b5ad9c']])
    colour = palette[rng.integers(0, len(palette), 150)[which]]
    colour = colour + (fbm(512, 64, 3, 103)[np.ix_(np.arange(h) % 512, np.arange(w))] - 0.5)[..., None] * 0.08
    height = (which % 3) * 0.1 + np.sqrt(best) / 120
    save(rgb_image(colour).filter(ImageFilter.GaussianBlur(2)), 'bark_color.webp', 82)
    save(normal_map(np.clip(height, 0, 1), 2.5), 'bark_normal.webp', 84)


# ----------------------------------------------------------------- leaves

def leaf_card(name, seed, kind):
    s = 512
    rng = np.random.default_rng(seed)
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if kind == 'gum':
        greens = [(118, 140, 104), (98, 122, 90), (138, 156, 118), (84, 106, 80), (126, 146, 120)]
        for _ in range(70):
            # Drooping lance-shaped eucalypt leaves from twigs near the top.
            ax, ay = s * (0.2 + rng.random() * 0.6), s * (0.08 + rng.random() * 0.3)
            ang = math.pi / 2 + (rng.random() - 0.5) * 1.3
            length = s * (0.22 + rng.random() * 0.2)
            width = length * 0.14
            pts = []
            for t in np.linspace(0, 1, 12):
                r = math.sin(math.pi * t) ** 0.8 * width
                cx = ax + math.cos(ang) * length * t + math.sin(t * 3) * 6
                cy = ay + math.sin(ang) * length * t
                pts.append((cx - math.sin(ang) * r, cy + math.cos(ang) * r))
            for t in np.linspace(1, 0, 12):
                r = math.sin(math.pi * t) ** 0.8 * width
                cx = ax + math.cos(ang) * length * t + math.sin(t * 3) * 6
                cy = ay + math.sin(ang) * length * t
                pts.append((cx + math.sin(ang) * r, cy - math.cos(ang) * r))
            c = greens[rng.integers(0, len(greens))]
            draw.polygon(pts, fill=c + (255,))
            draw.line([pts[0], pts[11]], fill=(c[0] + 20, c[1] + 20, c[2] + 14, 255), width=1)
        draw.line((s * 0.15, s * 0.1, s * 0.85, s * 0.2), fill=(110, 84, 64, 255), width=4)
    elif kind == 'shrub':
        greens = [(46, 86, 44), (58, 102, 52), (38, 72, 40), (70, 112, 58), (52, 94, 60)]
        for _ in range(260):
            cx, cy = s * (0.1 + rng.random() * 0.8), s * (0.1 + rng.random() * 0.8)
            if (cx - s / 2) ** 2 + (cy - s / 2) ** 2 > (s * 0.44) ** 2:
                continue
            length = 22 + rng.random() * 26
            ang = rng.random() * math.pi * 2
            pts = []
            for t in np.linspace(0, 2 * math.pi, 16):
                r = length * (0.5 + 0.5 * math.cos(t)) if False else None
            for t in np.linspace(0, 1, 9):
                r = math.sin(math.pi * t) * length * 0.34
                pts.append((cx + math.cos(ang) * length * t - math.sin(ang) * r, cy + math.sin(ang) * length * t + math.cos(ang) * r))
            for t in np.linspace(1, 0, 9):
                r = math.sin(math.pi * t) * length * 0.34
                pts.append((cx + math.cos(ang) * length * t + math.sin(ang) * r, cy + math.sin(ang) * length * t - math.cos(ang) * r))
            c = greens[rng.integers(0, len(greens))]
            light = rng.random() * 30
            draw.polygon(pts, fill=(int(c[0] + light), int(c[1] + light), int(c[2] + light * 0.6), 255))
    elif kind == 'bottlebrush':
        for _ in range(520):
            cx, cy = s * (0.08 + rng.random() * 0.84), s * (0.08 + rng.random() * 0.84)
            if (cx - s / 2) ** 2 + (cy - s / 2) ** 2 > (s * 0.45) ** 2:
                continue
            ang = rng.random() * math.pi * 2
            length = 22 + rng.random() * 24
            c = (50 + int(rng.random() * 34), 86 + int(rng.random() * 34), 50, 255)
            draw.line((cx, cy, cx + math.cos(ang) * length, cy + math.sin(ang) * length), fill=c, width=6)
        for _ in range(16):
            # Red bottlebrush flower spikes.
            cx, cy = s * (0.2 + rng.random() * 0.6), s * (0.2 + rng.random() * 0.6)
            for k in range(60):
                t = k / 60
                y = cy - 30 + t * 60
                ox = (rng.random() - 0.5) * 18
                draw.line((cx, y, cx + ox, y + (rng.random() - 0.5) * 6), fill=(196 + int(rng.random() * 40), 30, 40, 255), width=2)
    elif kind == 'tuft':
        s2 = 256
        img = Image.new('RGBA', (s2, s2), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        for _ in range(60):
            x = s2 * (0.15 + rng.random() * 0.7)
            top = s2 * (0.05 + rng.random() * 0.45)
            bend = (rng.random() - 0.5) * 50
            g = rng.random()
            col = (int(60 + g * 50), int(100 + g * 60), int(40 + g * 20), 255)
            draw.polygon([(x - 3, s2), (x + 3, s2), (x + bend, top)], fill=col)
        save(img, f'{name}.webp', 88)
        return
    save(img, f'{name}.webp', 88)


# -------------------------------------------------------------------- HDR

def read_hdr(path):
    with open(path, 'rb') as f:
        data = f.read()
    header_end = data.index(b'\n\n') + 2
    line_end = data.index(b'\n', header_end)
    _, h, _, w = data[header_end:line_end].split()
    h, w = int(h), int(w)
    pos = line_end + 1
    out = np.zeros((h, w, 4), dtype=np.uint8)
    for y in range(h):
        assert data[pos] == 2 and data[pos + 1] == 2, 'expected new-style RLE'
        pos += 4
        for c in range(4):
            x = 0
            while x < w:
                count = data[pos]
                pos += 1
                if count > 128:
                    count -= 128
                    out[y, x:x + count, c] = data[pos]
                    pos += 1
                else:
                    out[y, x:x + count, c] = np.frombuffer(data[pos:pos + count], dtype=np.uint8)
                    pos += count
                x += count
    rgb = out[..., :3].astype(np.float32)
    e = out[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return rgb * scale[..., None]


def write_hdr(path, img):
    h, w, _ = img.shape
    brightest = img.max(axis=-1)
    mantissa, exponent = np.frexp(brightest)
    scale = np.where(brightest > 1e-32, mantissa * 256.0 / np.maximum(brightest, 1e-32), 0)
    rgbe = np.zeros((h, w, 4), dtype=np.uint8)
    rgbe[..., :3] = np.clip(img * scale[..., None], 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.where(brightest > 1e-32, exponent + 128, 0).astype(np.uint8)
    with open(path, 'wb') as f:
        f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n')
        f.write(f'-Y {h} +X {w}\n'.encode())
        f.write(rgbe.tobytes())
    print(f'{os.path.basename(path):28s} {w}x{h}  {os.path.getsize(path) // 1024} KB')


def hdri(source):
    img = read_hdr(source)
    h, w, _ = img.shape
    small = img.reshape(h // 2, 2, w // 2, 2, 3).mean(axis=(1, 3))
    write_hdr(os.path.join(OUT, 'park_512.hdr'), small.astype(np.float32))


if __name__ == '__main__':
    brick()
    render()
    roof()
    concrete()
    grass()
    mulch()
    wood()
    steel()
    bark()
    leaf_card('leaves_gum', 201, 'gum')
    leaf_card('leaves_shrub', 203, 'shrub')
    leaf_card('leaves_bottlebrush', 205, 'bottlebrush')
    leaf_card('grass_tuft', 207, 'tuft')
    if len(sys.argv) > 1:
        hdri(sys.argv[1])
