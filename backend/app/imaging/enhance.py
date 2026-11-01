"""Image Enhancement Laboratory - 12 classic point / histogram / spatial-filter operations."""
from __future__ import annotations

import cv2
import numpy as np

from .core import gray_of

OPS = [
    {"key": "grayscale", "name": "Grayscale", "group": "Point", "desc": "Weighted RGB to intensity: 0.299R + 0.587G + 0.114B.", "params": []},
    {"key": "negative", "name": "Image negative", "group": "Point", "desc": "s = 255 - r. Reveals bright detail inside dark regions.", "params": []},
    {"key": "log", "name": "Log transform", "group": "Point", "desc": "s = c·log(1 + r). Expands dark values, compresses bright ones.",
     "params": [{"key": "strength", "label": "Log strength (c)", "min": 1, "max": 60, "step": 1, "default": 12}]},
    {"key": "gamma", "name": "Gamma correction", "group": "Point", "desc": "s = 255·(r/255)^γ. γ<1 brightens, γ>1 darkens.",
     "params": [{"key": "gamma", "label": "Gamma (γ)", "min": 0.2, "max": 3.0, "step": 0.05, "default": 0.7}]},
    {"key": "stretch", "name": "Contrast stretching", "group": "Point", "desc": "Linearly maps the chosen percentile range to 0-255.",
     "params": [{"key": "low", "label": "Low percentile", "min": 0, "max": 20, "step": 0.5, "default": 2},
                {"key": "high", "label": "High percentile", "min": 80, "max": 100, "step": 0.5, "default": 98}]},
    {"key": "hist_eq", "name": "Histogram equalization", "group": "Histogram", "desc": "Flattens the intensity histogram using the CDF (applied to luminance).", "params": []},
    {"key": "clahe", "name": "Adaptive histogram equalization", "group": "Histogram", "desc": "CLAHE: equalizes small tiles with a clip limit to avoid noise blow-up.",
     "params": [{"key": "clip", "label": "Clip limit", "min": 1, "max": 10, "step": 0.5, "default": 2.5},
                {"key": "tiles", "label": "Tile grid", "min": 2, "max": 16, "step": 1, "default": 8}]},
    {"key": "gaussian", "name": "Gaussian filter", "group": "Spatial", "desc": "Weighted smoothing. Best against Gaussian-like sensor noise.",
     "params": [{"key": "strength", "label": "Kernel radius", "min": 1, "max": 12, "step": 1, "default": 2}]},
    {"key": "median", "name": "Median filter", "group": "Spatial", "desc": "Replaces each pixel by its neighbourhood median. Removes salt-and-pepper noise.",
     "params": [{"key": "strength", "label": "Kernel radius", "min": 1, "max": 8, "step": 1, "default": 1}]},
    {"key": "mean", "name": "Mean filter", "group": "Spatial", "desc": "Box average. Fast smoothing that also blurs edges.",
     "params": [{"key": "strength", "label": "Kernel radius", "min": 1, "max": 12, "step": 1, "default": 2}]},
    {"key": "sobel", "name": "Sobel sharpening", "group": "Sharpen", "desc": "Adds the Sobel gradient magnitude back to the image to emphasise edges.",
     "params": [{"key": "amount", "label": "Sharpen amount", "min": 0, "max": 3, "step": 0.1, "default": 1.0}]},
    {"key": "laplacian", "name": "Laplacian sharpening", "group": "Sharpen", "desc": "g = f - ∇²f. Boosts fine detail using the second derivative.",
     "params": [{"key": "amount", "label": "Sharpen amount", "min": 0, "max": 3, "step": 0.1, "default": 1.0}]},
]
_OPS_BY_KEY = {o["key"]: o for o in OPS}


def _defaults(op):
    return {p["key"]: p["default"] for p in _OPS_BY_KEY[op]["params"]}


def _entropy(gray):
    h = np.bincount(gray.ravel(), minlength=256).astype(np.float64)
    p = h[h > 0] / h.sum()
    return float(-(p * np.log2(p)).sum())


def apply(rgb, op, params=None):
    """Return (processed_rgb, aux_image_or_None)."""
    if op not in _OPS_BY_KEY and op != "none":
        raise ValueError(f"Unknown operation '{op}'")
    p = _defaults(op) if op != "none" else {}
    p.update({k: v for k, v in (params or {}).items() if v is not None})
    aux = None
    if op == "none":
        out = rgb.copy()
    elif op == "grayscale":
        out = np.dstack([gray_of(rgb)] * 3)
    elif op == "negative":
        out = 255 - rgb
    elif op == "log":
        c = float(p["strength"])
        out = 255 * np.log1p(c * rgb.astype(np.float32) / 255) / np.log1p(c)
    elif op == "gamma":
        out = 255 * np.power(rgb.astype(np.float32) / 255, float(p["gamma"]))
    elif op == "stretch":
        lo, hi = np.percentile(rgb, (float(p["low"]), float(p["high"])))
        hi = max(hi, lo + 1)
        out = (rgb.astype(np.float32) - lo) / (hi - lo) * 255
    elif op == "hist_eq":
        ycc = cv2.cvtColor(rgb, cv2.COLOR_RGB2YCrCb)
        ycc[..., 0] = cv2.equalizeHist(ycc[..., 0])
        out = cv2.cvtColor(ycc, cv2.COLOR_YCrCb2RGB)
    elif op == "clahe":
        lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
        t = int(p["tiles"])
        cl = cv2.createCLAHE(clipLimit=float(p["clip"]), tileGridSize=(t, t))
        lab[..., 0] = cl.apply(lab[..., 0])
        out = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)
    elif op == "gaussian":
        k = 2 * int(p["strength"]) + 1
        out = cv2.GaussianBlur(rgb, (k, k), 0)
    elif op == "median":
        out = cv2.medianBlur(rgb, 2 * int(p["strength"]) + 1)
    elif op == "mean":
        k = 2 * int(p["strength"]) + 1
        out = cv2.blur(rgb, (k, k))
    elif op == "sobel":
        g = cv2.GaussianBlur(gray_of(rgb), (3, 3), 0).astype(np.float32)
        gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
        mag = np.hypot(gx, gy)
        mag = mag / (mag.max() + 1e-6) * 255
        out = rgb.astype(np.float32) + float(p["amount"]) * mag[..., None] * 0.9
        aux = np.clip(mag * 2.5, 0, 255).astype(np.uint8)
    elif op == "laplacian":
        g = cv2.GaussianBlur(gray_of(rgb), (3, 3), 0).astype(np.float32)
        lap = cv2.Laplacian(g, cv2.CV_32F, ksize=3)
        out = rgb.astype(np.float32) - float(p["amount"]) * lap[..., None]
        aux = np.clip(np.abs(lap) * 6, 0, 255).astype(np.uint8)
    out = np.clip(out, 0, 255).astype(np.uint8)

    alpha, beta = float(p.get("contrast", 1.0)), float(p.get("brightness", 0.0))
    if alpha != 1.0 or beta != 0.0:                     # global contrast / brightness sliders
        out = np.clip(alpha * (out.astype(np.float32) - 128) + 128 + beta, 0, 255).astype(np.uint8)
    return out, aux


def run(rgb, op, params):
    out, aux = apply(rgb, op, params)
    g0, g1 = gray_of(rgb), gray_of(out)
    hist = []
    h0 = np.bincount(g0.ravel() // 4, minlength=64) / g0.size
    h1 = np.bincount(g1.ravel() // 4, minlength=64) / g1.size
    for i in range(64):
        hist.append({"bin": i * 4, "original": float(h0[i]), "processed": float(h1[i])})
    stats = {
        "original": {"mean": float(g0.mean()), "std": float(g0.std()), "entropy": _entropy(g0)},
        "processed": {"mean": float(g1.mean()), "std": float(g1.std()), "entropy": _entropy(g1)},
    }
    return out, aux, hist, stats
