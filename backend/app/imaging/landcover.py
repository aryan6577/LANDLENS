"""Land-cover classification, vegetation / water / urban labs and real NDVI.

Classical image processing only: colour spaces (RGB, HSV, Lab), K-means clustering, thresholding,
Otsu, morphology and connected components. Results are ESTIMATES from colour/texture, not a trained
semantic model.
"""
from __future__ import annotations

import cv2
import numpy as np
from skimage.filters import threshold_otsu
from sklearn.cluster import KMeans

from ..util import CLASS_COLORS, CLASS_NAMES, encode, hex_color
from . import core
from .core import chroma, clean_mask, gray_of, texture_norm


# ----------------------------------------------------------------------------- K-means land cover
def _assign_class(s: dict) -> int:
    """Rule-based naming of a colour cluster (0 bare, 1 vegetation, 2 water, 3 built-up)."""
    if s["wi"] > 0.03 and s["wi"] > s["exg"] and s["tex"] < 0.6:      # blue clearly dominates green and red
        return 2
    if s["exg"] > 0.06:                                                # green dominates
        return 1
    if s["sat"] < 0.30 and s["tex"] > 0.30:                            # grey + busy = buildings / roads
        return 3
    if s["sat"] < 0.22 and s["val"] > 0.55:                            # bright grey, e.g. concrete
        return 3
    return 0


def kmeans_landcover(rgb, k=6, min_area=40, morph=5, seed=42):
    h, w = rgb.shape[:2]
    gray = gray_of(rgb)
    texn = texture_norm(gray)
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    feat = np.dstack([lab[..., 0] / 255, lab[..., 1] / 255 * 1.3, lab[..., 2] / 255 * 1.3, texn * 0.5]).reshape(-1, 4)
    rng = np.random.default_rng(seed)
    idx = rng.choice(feat.shape[0], size=min(30000, feat.shape[0]), replace=False)
    km = KMeans(n_clusters=int(k), n_init=3, random_state=seed).fit(feat[idx])
    labels = km.predict(feat).reshape(h, w)

    r, g, b = chroma(rgb)
    exg, wi = 2 * g - r - b, b - r
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    sat, val = hsv[..., 1] / 255.0, hsv[..., 2] / 255.0

    cls_of = np.zeros(int(k), np.uint8)
    clusters = []
    total = h * w
    for c in range(int(k)):
        m = labels == c
        n = int(m.sum())
        if n == 0:
            continue
        st = {"exg": float(exg[m].mean()), "wi": float(wi[m].mean()), "sat": float(sat[m].mean()),
              "val": float(val[m].mean()), "tex": float(texn[m].mean())}
        cls = _assign_class(st)
        cls_of[c] = cls
        mean_rgb = rgb[m].mean(axis=0)
        clusters.append({"cluster": c, "label": CLASS_NAMES[cls], "class_index": cls, "color": hex_color(mean_rgb),
                         "pct": n / total * 100, "pixels": n, **st})
    lm = cls_of[labels]

    final = np.zeros_like(lm)
    for cls in (1, 2, 3):                                # opening + closing + small-region removal per class
        m = clean_mask(lm == cls, morph, min_area)
        final[m & (final == 0)] = cls
    return {"label_map": final, "clusters": sorted(clusters, key=lambda x: -x["pct"])}


# ----------------------------------------------------------------------------- vegetation / water / urban labs
LAB_CFG = {
    "vegetation": {"cls": 1, "vmin": -0.15, "vmax": 0.35, "default": 0.07, "cmap": "RdYlGn", "color": CLASS_COLORS[1],
                   "label": "Excess-Green index (2g - r - b)"},
    "water": {"cls": 2, "vmin": -0.20, "vmax": 0.30, "default": 0.03, "cmap": "Blues", "color": CLASS_COLORS[2],
              "label": "Blue-dominance index (b - r)"},
    "urban": {"cls": 3, "vmin": 0.0, "vmax": 1.0, "default": 0.45, "cmap": "inferno", "color": CLASS_COLORS[3],
              "label": "Built-up score (texture + edges + low saturation)"},
}


def _index(rgb, kind):
    if kind == "vegetation":
        return cv2.GaussianBlur(core.exg_index(rgb), (0, 0), 1.0)
    if kind == "water":
        return cv2.GaussianBlur(core.water_index(rgb), (0, 0), 1.0)
    return core.urban_score(rgb)


def run_mask_lab(rgb, kind, method="threshold", threshold=None, morph=5, min_area=40, tex_filter=0.65,
                 k=6, gsd=10.0, images=True):
    cfg = LAB_CFG[kind]
    idx = _index(rgb, kind)
    texn = texture_norm(gray_of(rgb))
    exg = cv2.GaussianBlur(core.exg_index(rgb), (0, 0), 1.0)
    wi = cv2.GaussianBlur(core.water_index(rgb), (0, 0), 1.0)
    t = None
    if method == "kmeans":
        lc = kmeans_landcover(rgb, k=k, min_area=min_area, morph=morph)
        mask = lc["label_map"] == cfg["cls"]
    else:
        if method == "otsu":
            t = float(threshold_otsu(idx[::2, ::2]))
            if kind != "urban":
                t = max(t, cfg["default"] * 0.5)         # Otsu always splits something - keep it from chasing noise
        else:
            t = float(cfg["default"] if threshold is None else threshold)
        raw = idx > t
        if kind == "water":
            raw &= (exg < wi) & (texn < float(tex_filter))      # blue must beat green; water is smooth
        elif kind == "urban":
            raw &= ~(exg > 0.07) & ~((wi > 0.04) & (exg < wi))
        mask = clean_mask(raw, morph, min_area)

    total = mask.size
    px = int(mask.sum())
    comps = core.components(mask, gsd, top=12)
    res = {
        "kind": kind, "method": method, "threshold": t,
        "index": {"label": cfg["label"], "min": cfg["vmin"], "max": cfg["vmax"], "default": cfg["default"]},
        "pixels": px, "total_pixels": total, "coverage_pct": px / total * 100,
        "area_ha": px * gsd * gsd / 10000, "area_km2": px * gsd * gsd / 1e6,
        "components": comps,
        "histogram": core.hist_curve(idx, cfg["vmin"], cfg["vmax"]),
        "grid": core.grid_pct(mask, 6),
    }
    if images:
        res["images"] = {
            "overlay": encode(core.overlay_mask(rgb, mask, cfg["color"])),
            "mask": encode(mask.astype(np.uint8) * 255, "png"),
            "heatmap": encode(core.colorize(idx, cfg["vmin"], cfg["vmax"], cfg["cmap"])),
            "boxes": encode(core.draw_boxes(core.overlay_mask(rgb, mask, cfg["color"], 0.35, False),
                                            comps["rows"][:8], cfg["color"])),
        }
    res["_mask"] = mask
    return res


# ----------------------------------------------------------------------------- NDVI (real, multispectral only)
def ndvi_analysis(bands, red_band, nir_band, gsd=10.0, rgb=None):
    c = bands.shape[2]
    if not (1 <= red_band <= c and 1 <= nir_band <= c) or red_band == nir_band:
        raise ValueError(f"Choose two different bands between 1 and {c}.")
    red = bands[..., red_band - 1].astype(np.float32)
    nir = bands[..., nir_band - 1].astype(np.float32)
    ndvi = np.where((nir + red) > 0, (nir - red) / (nir + red + 1e-9), 0).astype(np.float32)   # NDVI = (NIR-Red)/(NIR+Red)
    edges = [-1.0, 0.0, 0.2, 0.4, 0.6, 1.01]
    names = ["Water / cloud / snow", "Bare soil / built-up", "Sparse vegetation", "Moderate vegetation", "Dense vegetation"]
    colors = ["#38a0fd", "#c9a86a", "#bfe36b", "#4cc26a", "#0f7a3a"]
    classes = []
    for i, nm in enumerate(names):
        m = (ndvi >= edges[i]) & (ndvi < edges[i + 1])
        px = int(m.sum())
        classes.append({"name": nm, "color": colors[i], "range": f"{max(edges[i], -1):.1f} to {min(edges[i + 1], 1):.1f}",
                        "pixels": px, "pct": px / ndvi.size * 100, "area_ha": px * gsd * gsd / 10000})
    return {
        "stats": {"mean": float(ndvi.mean()), "std": float(ndvi.std()), "min": float(ndvi.min()), "max": float(ndvi.max()),
                  "median": float(np.median(ndvi))},
        "classes": classes, "histogram": core.hist_curve(ndvi, -1, 1),
        "images": {"ndvi": encode(core.colorize(ndvi, -0.2, 0.9, "RdYlGn")),
                   "rgb": encode(rgb) if rgb is not None else None},
    }
