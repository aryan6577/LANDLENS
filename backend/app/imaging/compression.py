"""Compression laboratory: JPEG, PNG, Run-Length Encoding and Huffman coding (RLE/Huffman written from scratch)."""
from __future__ import annotations

import heapq
import math

import cv2
import numpy as np

from ..util import encode
from .core import colorize, gray_of


# ----------------------------------------------------------------------------- metrics
def mse_psnr(a, b):
    mse = float(np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2))
    return mse, (None if mse == 0 else 10 * math.log10(255 ** 2 / mse))


# ----------------------------------------------------------------------------- Run Length Encoding
def rle_encode(flat):
    """(value, count) pairs; runs longer than 255 are split so every count fits in one byte."""
    if flat.size == 0:
        return np.array([], np.uint8), np.array([], np.int64)
    change = np.flatnonzero(np.diff(flat) != 0) + 1
    starts = np.concatenate([[0], change])
    counts = np.diff(np.concatenate([starts, [flat.size]]))
    return flat[starts], counts


def rle_decode(values, counts):
    return np.repeat(values, counts)


# ----------------------------------------------------------------------------- Huffman coding
def huffman_lengths(freq):
    items = [(int(f), s) for s, f in enumerate(freq) if f > 0]
    if len(items) == 1:
        return {items[0][1]: 1}
    heap = [(f, i, [s]) for i, (f, s) in enumerate(items)]
    heapq.heapify(heap)
    lengths = {s: 0 for _, s in items}
    uid = len(heap)
    while len(heap) > 1:
        f1, _, s1 = heapq.heappop(heap)
        f2, _, s2 = heapq.heappop(heap)
        for s in s1 + s2:               # every symbol under a merged node moves one level deeper
            lengths[s] += 1
        heapq.heappush(heap, (f1 + f2, uid, s1 + s2))
        uid += 1
    return lengths


def canonical_codes(lengths):
    code, prev, codes = 0, 0, {}
    for sym, l in sorted(lengths.items(), key=lambda x: (x[1], x[0])):
        code <<= (l - prev)
        codes[sym] = format(code, f"0{l}b")
        code += 1
        prev = l
    return codes


def huffman_info(flat):
    freq = np.bincount(flat, minlength=256)
    lengths = huffman_lengths(freq)
    codes = canonical_codes(lengths)
    total = int(freq.sum())
    p = freq[freq > 0] / total
    entropy = float(-(p * np.log2(p)).sum())
    bits = int(sum(int(freq[s]) * l for s, l in lengths.items()))
    avg = bits / total
    # round-trip proof on a small slice: encode to a bit-string, decode it, compare
    sample = flat[:4096]
    stream = "".join(codes[int(v)] for v in sample)
    rev = {c: s for s, c in codes.items()}
    out, cur = [], ""
    for ch in stream:
        cur += ch
        if cur in rev:
            out.append(rev[cur])
            cur = ""
    ok = bool(np.array_equal(np.array(out, dtype=np.uint8), sample))
    top = sorted(lengths, key=lambda s: -int(freq[s]))[:10]
    table = [{"symbol": int(s), "freq": int(freq[s]), "pct": float(freq[s] / total * 100), "code": codes[s], "length": lengths[s]} for s in top]
    return {"entropy": entropy, "avg_length": avg, "efficiency": entropy / avg * 100 if avg else 100.0, "bits": bits,
            "payload_bytes": math.ceil(bits / 8), "header_bytes": 256, "symbols": len(lengths), "roundtrip_ok": ok, "table": table}


# ----------------------------------------------------------------------------- JPEG / PNG helpers
def _jpeg(base, q):
    arr = base if base.ndim == 2 else cv2.cvtColor(base, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode(".jpg", arr, [cv2.IMWRITE_JPEG_QUALITY, int(q)])
    dec = cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE if base.ndim == 2 else cv2.IMREAD_COLOR)
    if base.ndim == 3:
        dec = cv2.cvtColor(dec, cv2.COLOR_BGR2RGB)
    return len(buf), dec


def _png(base, level=9):
    arr = base if base.ndim == 2 else cv2.cvtColor(base, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode(".png", arr, [cv2.IMWRITE_PNG_COMPRESSION, int(level)])
    return len(buf)


def run(rgb, mode="gray", quality=60):
    base = gray_of(rgb) if mode == "gray" else rgb
    raw = int(base.size)
    flat = np.ascontiguousarray(base).reshape(-1)
    rows = []

    jb, jdec = _jpeg(base, quality)
    mse, psnr = mse_psnr(base, jdec)
    rows.append({"method": f"JPEG (quality {quality})", "bytes": jb, "ratio": raw / jb, "saving_pct": (1 - jb / raw) * 100,
                 "mse": mse, "psnr": psnr, "lossless": False})

    pb = _png(base)
    rows.append({"method": "PNG (level 9)", "bytes": pb, "ratio": raw / pb, "saving_pct": (1 - pb / raw) * 100, "mse": 0.0, "psnr": None, "lossless": True})

    vals, counts = rle_encode(flat)
    pairs = int(np.ceil(counts / 255).sum())
    rb = pairs * 2
    rle_ok = bool(np.array_equal(rle_decode(vals, counts), flat))
    rows.append({"method": "Run-length encoding", "bytes": rb, "ratio": raw / rb, "saving_pct": (1 - rb / raw) * 100, "mse": 0.0, "psnr": None, "lossless": True})

    hi = huffman_info(flat)
    hb = hi["payload_bytes"] + hi["header_bytes"]
    rows.append({"method": "Huffman coding", "bytes": hb, "ratio": raw / hb, "saving_pct": (1 - hb / raw) * 100, "mse": 0.0, "psnr": None, "lossless": True})

    curve = []
    for q in range(10, 100, 5):
        b, d = _jpeg(base, q)
        curve.append({"quality": q, "bytes": b, "ratio": raw / b, "psnr": mse_psnr(base, d)[1]})

    err = np.abs(base.astype(np.int16) - jdec.astype(np.int16))
    err = err.max(axis=2) if err.ndim == 3 else err
    err_img = colorize(err.astype(np.float32), 0, max(float(np.percentile(err, 99.5)), 4), "inferno")
    return {
        "mode": mode, "raw_bytes": raw, "rows": rows, "curve": curve,
        "rle": {"runs": int(len(vals)), "stored_pairs": pairs, "roundtrip_ok": rle_ok,
                "avg_run": float(flat.size / max(len(vals), 1))},
        "huffman": hi,
        "images": {"original": encode(base, "jpg", 92), "jpeg": encode(jdec, "png"), "error": encode(err_img)},
    }
