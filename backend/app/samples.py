"""Built-in demo imagery.

So you can demo LandLens without hunting for images, we synthesise a small "river delta" scene with
forest, farmland, a lake, a river, a city and a town. The 2026 version contains deliberate changes
(city grows, lake shrinks, a patch is cleared, slight lighting + position shift) so Change Detection
has something real to find. A 4-band (R, G, B, NIR) GeoTIFF-style sample is included for NDVI.
"""
from __future__ import annotations

import cv2
import numpy as np
import tifffile

from . import storage

SAMPLE_INFO = {
    "delta_2024": {"title": "River delta - 2024", "kind": "RGB", "file": "delta_2024.png",
                   "desc": "Forest, farmland, lake, river and a growing city."},
    "delta_2026": {"title": "River delta - 2026", "kind": "RGB", "file": "delta_2026.png",
                   "desc": "Same area two years later: city expansion, smaller lake, cleared forest."},
    "delta_multispectral": {"title": "River delta - 4-band (R,G,B,NIR)", "kind": "Multispectral", "file": "delta_multispectral.tif",
                            "desc": "Use this one for real NDVI in the Vegetation Lab."},
}


def _fbm(h, w, seed, octaves=5, base=4):
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = base * 2 ** o
        small = rng.random((n, n)).astype(np.float32)
        acc += amp * cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC)
        tot += amp
        amp *= 0.5
    acc /= tot
    return (acc - acc.min()) / (acc.max() - acc.min() + 1e-9)


def _world(size: int, year: int):
    h = w = size
    e = _fbm(h, w, 11, 5, 3)
    m = _fbm(h, w, 23, 5, 4)
    n = _fbm(h, w, 5, 4, 10)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cls = np.zeros((h, w), np.uint8)
    cls[m > 0.40] = 1                                   # vegetation
    water = e < (0.19 if year == 2024 else 0.165)       # lake shrinks by 2026
    y0 = h * 0.70 + 55 * np.sin(xx[0] / 110) + 25 * np.sin(xx[0] / 37 + 1)
    water |= np.abs(yy - y0[None, :]) < (6 + 2.5 * np.sin(xx / 60))
    city_r = 120 if year == 2024 else 175               # city grows
    urban = np.hypot(xx - w * 0.30, yy - h * 0.30) < city_r * (0.75 + 0.5 * n)
    urban |= np.hypot(xx - w * 0.78, yy - h * 0.38) < (50 if year == 2024 else 78) * (0.75 + 0.5 * n)
    cls[urban] = 3
    cls[water] = 2
    if year != 2024:
        cleared = np.hypot(xx - w * 0.64, yy - h * 0.84) < 70       # deforestation patch
        cls[cleared & (cls == 1)] = 0
        strip = (np.abs(yy - (h * 0.12 + 0.25 * xx)) < 12) & (xx > w * 0.35) & (xx < w * 0.7) & (cls != 2)
        cls[strip] = 3                                              # new development corridor
    return cls, e, m


def _hash01(a):
    return np.abs(np.modf(np.sin(a) * 43758.5453)[0]).astype(np.float32)


def _render(cls, e, m, year):
    h, w = cls.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    rng = np.random.default_rng(99)
    fine = _fbm(h, w, 77, 4, 24)
    img = np.zeros((h, w, 3), np.float32)

    # bare land
    bare = np.array([184, 143, 100], np.float32)
    img[:] = bare * (0.85 + 0.3 * fine[..., None])

    # vegetation: fields (crops) where moisture is high, forest elsewhere
    forest = np.array([30, 84, 40], np.float32) * (0.75 + 0.5 * fine[..., None])
    fid = np.floor(xx / 38) * 131 + np.floor(yy / 30) * 17
    r1 = _hash01(fid)
    crop = np.where(r1[..., None] > 0.5, np.array([108, 150, 66], np.float32), np.array([150, 168, 80], np.float32))
    crop = crop * (0.85 + 0.25 * _hash01(fid * 3.1)[..., None]) * (0.95 + 0.1 * fine[..., None])
    veg = np.where((m > 0.58)[..., None], crop, forest)
    if year != 2024:                                    # seasonal drying
        veg = veg * 0.93 + np.array([14, 10, 0], np.float32)
    img = np.where((cls == 1)[..., None], veg, img)

    # water (deeper = darker)
    depth = 0.75 + 0.5 * np.clip(e / 0.19, 0, 1)
    wat = np.array([22, 74, 118], np.float32) * depth[..., None] * (0.95 + 0.1 * fine[..., None])
    img = np.where((cls == 2)[..., None], wat, img)

    # built-up: buildings on a street grid
    cell = 5
    rnd = rng.random((h // cell + 1, w // cell + 1)).astype(np.float32)
    bld = np.repeat(np.repeat(rnd, cell, 0), cell, 1)[:h, :w]
    tint = np.repeat(np.repeat(rng.random((h // cell + 1, w // cell + 1)) > 0.82, cell, 0), cell, 1)[:h, :w]
    urb = np.array([150, 150, 156], np.float32) * (0.62 + 0.75 * bld[..., None])
    urb = np.where(tint[..., None], urb * np.array([1.18, 0.86, 0.8], np.float32), urb)
    roads = ((xx % 26) < 3) | ((yy % 26) < 3)
    urb = np.where(roads[..., None], np.array([84, 84, 90], np.float32), urb)
    img = np.where((cls == 3)[..., None], urb, img)

    # terrain shading + sensor noise
    gx, gy = np.gradient(cv2.GaussianBlur(e, (0, 0), 2))
    shade = np.clip(1 + (-gx * 1.5 - gy) * 9, 0.88, 1.12)
    img = np.where((cls == 3)[..., None], img, img * shade[..., None])
    img += rng.normal(0, 2.5, img.shape).astype(np.float32)
    img = cv2.GaussianBlur(img, (0, 0), 0.6)

    if year != 2024:                                    # different date: lighting + 5px/-4px camera shift
        img = img * np.array([1.0, 0.97, 0.94], np.float32) * 0.96
        M = np.float32([[1, 0, 5], [0, 1, -4]])
        img = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REFLECT)
    return np.clip(img, 0, 255).astype(np.uint8)


def ensure_sample(key: str):
    info = SAMPLE_INFO[key]
    path = storage.SAMPLES / info["file"]
    if path.exists():
        return path
    size = 768
    if key == "delta_multispectral":
        cls, e, m = _world(size, 2024)
        rgb = _render(cls, e, m, 2024).astype(np.float32)
        rng = np.random.default_rng(3)
        nir = np.select([cls == 1, cls == 2, cls == 3, cls == 0],
                        [0.55 + 0.2 * m, np.full_like(m, 0.012), np.full_like(m, 0.22), np.full_like(m, 0.28)])
        nir = nir + rng.normal(0, 0.012, nir.shape)
        bands = np.dstack([rgb[..., 0], rgb[..., 1], rgb[..., 2]]) / 255 * 0.30
        arr = np.dstack([bands, nir[..., None]]) * 10000
        arr = np.clip(arr, 0, 65535).astype(np.uint16)
        tifffile.imwrite(path, arr, photometric="minisblack", planarconfig="contig")
    else:
        year = 2024 if key == "delta_2024" else 2026
        cls, e, m = _world(size, year)
        from PIL import Image
        Image.fromarray(_render(cls, e, m, year)).save(path, compress_level=4)
    return path


def list_samples():
    out = []
    for k, v in SAMPLE_INFO.items():
        loaded = storage.find_sample(k)
        out.append({"key": k, **{x: v[x] for x in ("title", "kind", "desc")}, "loaded_id": loaded["id"] if loaded else None})
    return out


def load_sample(key: str) -> dict:
    if key not in SAMPLE_INFO:
        raise KeyError(key)
    existing = storage.find_sample(key)
    if existing:
        return existing
    path = ensure_sample(key)
    data = path.read_bytes()
    rgb, bands, fmt, extra = storage.decode_upload(data, path.name)
    return storage.save_image(rgb, path.name, fmt, len(data), source="sample", bands=bands, extra=extra, sample_key=key)
