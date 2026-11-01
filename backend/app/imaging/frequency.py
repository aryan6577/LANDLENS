"""Frequency-domain laboratory: 2-D DFT/FFT, spectrum, ideal / Butterworth / Gaussian low- and high-pass filters."""
from __future__ import annotations

import time

import cv2
import numpy as np

from ..util import encode
from .core import gray_of

FORMULAS = {
    ("ideal", "lowpass"): "H(u,v) = 1 if D(u,v) ≤ D0, else 0",
    ("butterworth", "lowpass"): "H(u,v) = 1 / (1 + [D(u,v)/D0]^(2n))",
    ("gaussian", "lowpass"): "H(u,v) = exp(−D(u,v)² / (2·D0²))",
    ("ideal", "highpass"): "H(u,v) = 0 if D(u,v) ≤ D0, else 1",
    ("butterworth", "highpass"): "H(u,v) = 1 / (1 + [D0/D(u,v)]^(2n))",
    ("gaussian", "highpass"): "H(u,v) = 1 − exp(−D(u,v)² / (2·D0²))",
}


def _spec_img(F, ref_max):
    mag = np.log1p(np.abs(F))
    return (np.clip(mag / ref_max, 0, 1) * 255).astype(np.uint8)


def dft_vs_fft(g, n=128):
    """Direct matrix DFT (O(N^3) for 2-D, via separability) against the FFT: same answer, very different speed."""
    f = cv2.resize(g, (n, n), interpolation=cv2.INTER_AREA).astype(np.float64)
    k = np.arange(n)
    W = np.exp(-2j * np.pi * np.outer(k, k) / n)
    t0 = time.perf_counter()
    F1 = W @ f @ W
    t_dft = (time.perf_counter() - t0) * 1000
    t0 = time.perf_counter()
    for _ in range(20):
        F2 = np.fft.fft2(f)
    t_fft = (time.perf_counter() - t0) * 1000 / 20
    return {"size": n, "dft_ms": t_dft, "fft_ms": t_fft, "speedup": t_dft / max(t_fft, 1e-6),
            "max_error": float(np.abs(F1 - F2).max())}


def run(rgb, ftype="lowpass", shape="gaussian", d0=30.0, order=2, size=256):
    g = gray_of(rgb)
    h, w = g.shape
    s = min(h, w)
    y0, x0 = (h - s) // 2, (w - s) // 2
    g = cv2.resize(g[y0:y0 + s, x0:x0 + s], (size, size), interpolation=cv2.INTER_AREA).astype(np.float64)
    n = size
    F = np.fft.fftshift(np.fft.fft2(g))
    u = np.arange(n) - n / 2
    D = np.sqrt(u[None, :] ** 2 + u[:, None] ** 2)
    d0 = max(float(d0), 1.0)
    if shape == "ideal":
        LP = (D <= d0).astype(np.float64)
    elif shape == "butterworth":
        LP = 1.0 / (1.0 + (D / d0) ** (2 * int(order)))
    else:
        LP = np.exp(-(D ** 2) / (2 * d0 ** 2))
    H = LP if ftype == "lowpass" else 1.0 - LP
    Ff = F * H
    rec = np.real(np.fft.ifft2(np.fft.ifftshift(Ff)))
    if ftype == "highpass":
        rec = (rec - rec.min()) / (rec.max() - rec.min() + 1e-9) * 255
    rec = np.clip(rec, 0, 255)

    ref = np.log1p(np.abs(F)).max()
    ri = D.astype(int)
    prof_o = np.bincount(ri.ravel(), np.log1p(np.abs(F)).ravel()) / np.maximum(np.bincount(ri.ravel()), 1)
    prof_f = np.bincount(ri.ravel(), np.log1p(np.abs(Ff)).ravel()) / np.maximum(np.bincount(ri.ravel()), 1)
    prof_h = np.bincount(ri.ravel(), H.ravel()) / np.maximum(np.bincount(ri.ravel()), 1)
    prof = [{"r": int(r), "original": float(prof_o[r]), "filtered": float(prof_f[r]), "filter": float(prof_h[r])}
            for r in range(0, n // 2)]
    energy = float((np.abs(Ff) ** 2).sum() / (np.abs(F) ** 2).sum() * 100)
    mse = float(np.mean((g - rec) ** 2))
    return {
        "size": n, "formula": FORMULAS[(shape, ftype)], "energy_retained_pct": energy, "mse_vs_original": mse,
        "profile": prof, "dft_vs_fft": dft_vs_fft(gray_of(rgb)),
        "images": {"original": encode(g, "png"), "spectrum": encode(_spec_img(F, ref), "png"),
                   "mask": encode((H * 255).astype(np.uint8), "png"), "filtered_spectrum": encode(_spec_img(Ff, ref), "png"),
                   "reconstructed": encode(rec, "png")},
    }
