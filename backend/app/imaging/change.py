"""Change detection: registration -> resampling -> normalisation -> difference -> threshold -> morphology."""
from __future__ import annotations

import math

import cv2
import numpy as np
from skimage.exposure import match_histograms
from skimage.filters import threshold_otsu

from ..util import CLASS_NAMES, encode
from . import core, landcover

INTERP = {"nearest": cv2.INTER_NEAREST, "bilinear": cv2.INTER_LINEAR, "bicubic": cv2.INTER_CUBIC}


def register(a_gray, b_gray):
    """ECC image registration (Euclidean motion = translation + rotation). Returns (warp 2x3, correlation)."""
    s = min(1.0, 450 / max(a_gray.shape))
    a = cv2.GaussianBlur(cv2.resize(a_gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA), (5, 5), 0)
    b = cv2.GaussianBlur(cv2.resize(b_gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA), (5, 5), 0)
    a, b = cv2.equalizeHist(a), cv2.equalizeHist(b)
    warp = np.eye(2, 3, dtype=np.float32)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
    cc, warp = cv2.findTransformECC(a, b, warp, cv2.MOTION_EUCLIDEAN, crit, None, 5)
    warp[:, 2] /= s
    return warp, float(cc)


def run(a_rgb, b_rgb, interp="bilinear", do_register=True, do_match=True, threshold_mode="otsu", threshold=25.0,
        morph=5, min_area=60, k=8, gsd=10.0):
    warnings = []
    h, w = a_rgb.shape[:2]
    flag = INTERP.get(interp, cv2.INTER_LINEAR)
    if b_rgb.shape[:2] != (h, w):
        b_rgb = cv2.resize(b_rgb, (w, h), interpolation=flag)
        warnings.append("Image B had a different size and was resampled to image A using " + interp + " interpolation.")

    reg = {"applied": False, "dx": 0.0, "dy": 0.0, "rotation_deg": 0.0, "correlation": None}
    valid = np.ones((h, w), np.uint8)
    if do_register:
        try:
            warp, cc = register(core.gray_of(a_rgb), core.gray_of(b_rgb))
            dx, dy = float(warp[0, 2]), float(warp[1, 2])
            if abs(dx) > 0.25 * w or abs(dy) > 0.25 * h or cc < 0.2:
                warnings.append("Registration result looked unreliable, so images were compared without alignment.")
                reg["correlation"] = cc
            else:
                fl = flag | cv2.WARP_INVERSE_MAP
                b_rgb = cv2.warpAffine(b_rgb, warp, (w, h), flags=fl, borderMode=cv2.BORDER_REPLICATE)
                valid = cv2.warpAffine(np.ones((h, w), np.uint8), warp, (w, h), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP,
                                       borderMode=cv2.BORDER_CONSTANT, borderValue=0)
                reg = {"applied": True, "dx": dx, "dy": dy, "rotation_deg": math.degrees(math.atan2(warp[1, 0], warp[0, 0])),
                       "correlation": cc}
        except cv2.error:
            warnings.append("Registration did not converge, so images were compared without alignment.")
    valid = cv2.erode(valid, np.ones((9, 9), np.uint8)).astype(bool)      # ignore the warped border

    b_cmp = match_histograms(b_rgb, a_rgb, channel_axis=-1).astype(np.uint8) if do_match else b_rgb
    la = cv2.cvtColor(cv2.GaussianBlur(a_rgb, (5, 5), 0), cv2.COLOR_RGB2LAB).astype(np.float32)
    lb = cv2.cvtColor(cv2.GaussianBlur(b_cmp, (5, 5), 0), cv2.COLOR_RGB2LAB).astype(np.float32)
    diff = np.linalg.norm(la - lb, axis=2)                                # absolute colour difference (Lab distance)
    diff[~valid] = 0
    if threshold_mode == "otsu":
        t = float(threshold_otsu(np.clip(diff[valid], 0, 255).astype(np.uint8))) if valid.any() else float(threshold)
        t = max(t, 8.0)
    else:
        t = float(threshold)
    mask = core.clean_mask((diff > t) & valid, morph, min_area)

    n_valid = max(int(valid.sum()), 1)
    px = int(mask.sum())
    comps = core.components(mask, gsd, top=12)

    # cluster both dates together so "cluster 3" means the same thing in A and B
    lm = landcover.kmeans_landcover(np.hstack([a_rgb, b_cmp]), k=k)["label_map"]
    ca, cb = lm[:, :w], lm[:, w:]
    pa = [float((ca[valid] == i).mean() * 100) for i in range(4)]
    pb = [float((cb[valid] == i).mean() * 100) for i in range(4)]
    classes = [{"name": CLASS_NAMES[i], "a": pa[i], "b": pb[i], "delta": pb[i] - pa[i]} for i in range(4)]
    trans = np.zeros((4, 4))
    for i in range(4):
        for j in range(4):
            trans[i, j] = float(((ca == i) & (cb == j) & valid).sum()) / n_valid * 100
    moves = sorted([{"from": CLASS_NAMES[i], "to": CLASS_NAMES[j], "pct": trans[i, j]}
                    for i in range(4) for j in range(4) if i != j and trans[i, j] > 0.01], key=lambda m: -m["pct"])[:8]

    red = core.overlay_mask(b_rgb, mask, (255, 59, 92), 0.5)
    heat = core.colorize(diff, 0, max(float(np.percentile(diff[valid], 99.5)), 10) if valid.any() else 50, "inferno")
    return {
        "threshold": t, "threshold_mode": threshold_mode, "changed_pct": px / n_valid * 100, "changed_pixels": px,
        "area_ha": px * gsd * gsd / 10000, "regions": comps, "registration": reg, "classes": classes,
        "transitions": {"names": CLASS_NAMES, "matrix": trans.tolist(), "top": moves},
        "warnings": warnings,
        "images": {"a": encode(a_rgb), "b": encode(b_rgb), "diff": encode(heat), "overlay": encode(red),
                   "mask": encode(mask.astype(np.uint8) * 255, "png"),
                   "boxes": encode(core.draw_boxes(red, comps["rows"][:8], (255, 255, 255)))},
        "_mask": mask,
    }
