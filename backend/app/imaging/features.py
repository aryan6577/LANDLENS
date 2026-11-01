"""Feature extraction: statistics, shape descriptors, Hu moments, GLCM texture and Local Binary Patterns."""
from __future__ import annotations

import cv2
import numpy as np
from skimage.feature import graycomatrix, graycoprops, local_binary_pattern

from ..util import CLASS_COLORS, CLASS_NAMES, encode
from . import core
from .core import gray_of


def _entropy(ch):
    h = np.bincount(ch.ravel(), minlength=256).astype(np.float64)
    p = h[h > 0] / h.sum()
    return float(-(p * np.log2(p)).sum())


def statistics(rgb):
    g = gray_of(rgb)
    rows = []
    for name, ch in (("Red", rgb[..., 0]), ("Green", rgb[..., 1]), ("Blue", rgb[..., 2]), ("Gray", g)):
        f = ch.astype(np.float64)
        sd = f.std()
        skew = float(((f - f.mean()) ** 3).mean() / (sd ** 3 + 1e-9))
        rows.append({"channel": name, "mean": float(f.mean()), "std": float(sd), "variance": float(f.var()),
                     "min": int(f.min()), "max": int(f.max()), "median": float(np.median(f)), "skewness": skew, "entropy": _entropy(ch)})
    hist = []
    hs = [np.bincount((c.ravel() // 4), minlength=64) / c.size for c in (rgb[..., 0], rgb[..., 1], rgb[..., 2], g)]
    for i in range(64):
        hist.append({"bin": i * 4, "r": float(hs[0][i]), "g": float(hs[1][i]), "b": float(hs[2][i]), "gray": float(hs[3][i])})
    return {"pixel_count": int(g.size), "rows": rows, "histogram": hist}


def hu_moments(mask):
    m = cv2.moments(mask.astype(np.uint8), binaryImage=True)
    if m["m00"] == 0:
        return [0.0] * 7
    hu = cv2.HuMoments(m).ravel()
    return [float(-np.sign(v) * np.log10(abs(v))) if v != 0 else 0.0 for v in hu]


def _glcm_props(q, levels=32):
    glcm = graycomatrix(q, distances=[1, 2], angles=[0, np.pi / 4, np.pi / 2, 3 * np.pi / 4], levels=levels, symmetric=True, normed=True)
    return {p: float(graycoprops(glcm, p).mean()) for p in ("contrast", "dissimilarity", "homogeneity", "energy", "correlation", "ASM")}


def texture(rgb, label_map, seed=0):
    g = gray_of(rgb)
    small = cv2.resize(g, None, fx=min(1.0, 512 / max(g.shape)), fy=min(1.0, 512 / max(g.shape)), interpolation=cv2.INTER_AREA)
    overall = _glcm_props((small // 8).astype(np.uint8))
    q = (g // 8).astype(np.uint8)
    rng = np.random.default_rng(seed)
    per_class = []
    P = 32
    for cls in range(4):
        m = (label_map == cls).astype(np.float32)
        full = cv2.boxFilter(m, -1, (P, P), normalize=True) > 0.92
        full[: P // 2] = False
        full[-P // 2:] = False
        full[:, : P // 2] = False
        full[:, -P // 2:] = False
        pos = np.argwhere(full)
        if len(pos) == 0:
            continue
        picks = pos[rng.choice(len(pos), size=min(6, len(pos)), replace=False)]
        props = [_glcm_props(q[y - P // 2: y + P // 2, x - P // 2: x + P // 2]) for y, x in picks]
        per_class.append({"class": CLASS_NAMES[cls], "patches": len(props), **{k: float(np.mean([p[k] for p in props])) for k in props[0]}})
    lbp = local_binary_pattern(g, 8, 1, method="uniform")
    hist = np.bincount(lbp.astype(int).ravel(), minlength=10) / lbp.size
    return {
        "overall": overall, "per_class": per_class,
        "lbp": {"hist": [{"pattern": i, "value": float(hist[i])} for i in range(10)], "image": encode((lbp * 25).astype(np.uint8), "png")},
    }


def shapes(rgb, label_map, gsd):
    rows, boxes = [], rgb.copy()
    hu = []
    for cls in (1, 2, 3):
        mask = label_map == cls
        comps = core.components(mask, gsd, top=6)
        for r in comps["rows"]:
            rows.append({"class": CLASS_NAMES[cls], **r})
        boxes = core.draw_boxes(boxes, comps["rows"], CLASS_COLORS[cls], CLASS_NAMES[cls][0])
    for cls in range(4):
        hu.append({"class": CLASS_NAMES[cls], "hu": hu_moments(label_map == cls)})
    return {"rows": rows, "hu": hu, "image": encode(boxes)}
