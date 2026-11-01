"""Shared image-processing building blocks (indices, texture, morphology, components, overlays)."""
from __future__ import annotations

import math

import cv2
import numpy as np
import matplotlib

matplotlib.use("Agg")
from matplotlib import colormaps  # noqa: E402
from skimage.measure import regionprops  # noqa: E402

from ..util import CLASS_COLORS, CLASS_KEYS, CLASS_NAMES, hex_color  # noqa: E402


def gray_of(rgb):
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)


def chroma(rgb):
    """Chromatic coordinates r+g+b = 1 (removes brightness, keeps colour)."""
    f = rgb.astype(np.float32) + 1.0
    s = f.sum(axis=2)
    return f[..., 0] / s, f[..., 1] / s, f[..., 2] / s


def exg_index(rgb):
    """Excess-Green index 2g - r - b. Positive for green vegetation (RGB only - this is NOT NDVI)."""
    r, g, b = chroma(rgb)
    return 2 * g - r - b


def water_index(rgb):
    """Blue-dominance index b - r. Positive for water-like pixels."""
    r, g, b = chroma(rgb)
    return b - r


def local_std(gray, k=7):
    g = gray.astype(np.float32)
    m = cv2.boxFilter(g, -1, (k, k))
    m2 = cv2.boxFilter(g * g, -1, (k, k))
    return np.sqrt(np.maximum(m2 - m * m, 0))


def norm01(a, p=98):
    hi = np.percentile(a, p)
    return np.clip(a / (hi + 1e-6), 0, 1)


def texture_norm(gray):
    return norm01(local_std(gray, 7))


def urban_score(rgb):
    """Built-up likelihood: texture (45%) + edge density (30%) + low colour saturation (25%)."""
    gray = gray_of(rgb)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blur, 60, 140).astype(np.float32) / 255
    edge_d = norm01(cv2.boxFilter(edges, -1, (9, 9)))
    tex = texture_norm(gray)
    sat = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)[..., 1].astype(np.float32) / 255
    score = 0.45 * tex + 0.30 * edge_d + 0.25 * (1 - np.clip(sat / 0.6, 0, 1))
    return cv2.GaussianBlur(score, (0, 0), 2.0)


def colorize(v, vmin, vmax, cmap="viridis"):
    t = np.clip((v - vmin) / (vmax - vmin + 1e-9), 0, 1)
    return (colormaps[cmap](t)[..., :3] * 255).astype(np.uint8)


def clean_mask(mask, k=5, min_area=30):
    """Morphological opening (remove specks) then closing (fill holes) then drop tiny components."""
    m8 = mask.astype(np.uint8)
    k = max(1, int(k))
    if k > 1:
        ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        m8 = cv2.morphologyEx(m8, cv2.MORPH_OPEN, ker)
        m8 = cv2.morphologyEx(m8, cv2.MORPH_CLOSE, ker)
    if min_area and min_area > 1:
        n, lab, st, _ = cv2.connectedComponentsWithStats(m8, connectivity=8)
        keep = np.zeros(n, bool)
        keep[1:] = st[1:, cv2.CC_STAT_AREA] >= min_area
        m8 = keep[lab].astype(np.uint8)
    return m8.astype(bool)


def overlay_mask(rgb, mask, color, alpha=0.55, outline=True):
    col = np.array(color, np.float32)
    out = rgb.astype(np.float32)
    out = np.where(mask[..., None], out * (1 - alpha) + col * alpha, out)
    if outline:
        m8 = mask.astype(np.uint8)
        edge = (m8 - cv2.erode(m8, np.ones((3, 3), np.uint8))).astype(bool)
        out[edge] = col
    return out.astype(np.uint8)


def label_to_rgb(lm):
    return np.array(CLASS_COLORS, np.uint8)[lm]


def blend_label(rgb, lm, alpha=0.6):
    return (rgb.astype(np.float32) * (1 - alpha) + label_to_rgb(lm).astype(np.float32) * alpha).astype(np.uint8)


def class_stats(lm, gsd):
    total = lm.size
    out = []
    for i in range(4):
        px = int((lm == i).sum())
        out.append({"index": i, "key": CLASS_KEYS[i], "name": CLASS_NAMES[i], "color": hex_color(CLASS_COLORS[i]),
                    "pixels": px, "pct": px / total * 100, "area_ha": px * gsd * gsd / 10000,
                    "area_km2": px * gsd * gsd / 1e6})
    return out


def components(mask, gsd=10.0, top=12):
    """Connected-component analysis with shape features for the biggest regions."""
    m8 = mask.astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m8, connectivity=8)
    if n <= 1:
        return {"count": 0, "rows": []}
    areas = st[1:, cv2.CC_STAT_AREA]
    order = np.argsort(-areas)[:top]
    rows = []
    for rank, o in enumerate(order, 1):
        cid = int(o) + 1
        x, y, w, h, area = [int(v) for v in st[cid]]
        crop = np.pad((lab[y:y + h, x:x + w] == cid).astype(np.uint8), 1)
        props = regionprops(crop)[0]
        per = float(props.perimeter) or 1e-6
        rows.append({
            "rank": rank, "area_px": area, "area_ha": area * gsd * gsd / 10000,
            "perimeter_px": per, "circularity": min(1.0, 4 * math.pi * area / per ** 2),
            "compactness": per ** 2 / area, "eccentricity": float(props.eccentricity),
            "aspect_ratio": w / max(h, 1), "bbox": [x, y, w, h],
            "centroid": [float(cen[cid][0]), float(cen[cid][1])],
        })
    return {"count": int(n - 1), "rows": rows}


def draw_boxes(rgb, rows, color, label_prefix=""):
    out = rgb.copy()
    for r in rows:
        x, y, w, h = r["bbox"]
        cv2.rectangle(out, (x, y), (x + w, y + h), color, 2)
        cv2.putText(out, f"{label_prefix}{r['rank']}", (x + 3, max(y + 14, 14)), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(out, f"{label_prefix}{r['rank']}", (x + 3, max(y + 14, 14)), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    color, 1, cv2.LINE_AA)
    return out


def grid_pct(mask, n=6):
    small = cv2.resize(mask.astype(np.float32), (n, n), interpolation=cv2.INTER_AREA)
    return (small * 100).tolist()


def hist_curve(values, vmin, vmax, bins=64):
    h, edges = np.histogram(values, bins=bins, range=(vmin, vmax))
    h = h / max(h.sum(), 1)
    centers = (edges[:-1] + edges[1:]) / 2
    return [{"x": float(c), "y": float(v)} for c, v in zip(centers, h)]
