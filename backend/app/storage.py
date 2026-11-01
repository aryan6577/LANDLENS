"""Disk storage: uploaded images, settings (API keys) and analysis history.

Everything lives in backend/data/ - no database needed.
"""
from __future__ import annotations

import io
import json
import os
import threading
import uuid
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import tifffile
from PIL import ExifTags, Image, ImageOps

from .util import clean

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    """Tiny .env reader so keys can live in backend/.env (no extra dependency)."""
    f = ROOT / ".env"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()
DATA = Path(os.environ.get("LANDLENS_DATA", ROOT / "data"))
UPLOADS = DATA / "uploads"
SAMPLES = DATA / "samples"
for _p in (UPLOADS, SAMPLES):
    _p.mkdir(parents=True, exist_ok=True)

SETTINGS_FILE = DATA / "settings.json"
HISTORY_FILE = DATA / "history.json"
LOCK = threading.RLock()

MAX_WORK = 1100                     # analysis is done on a copy no larger than this (px)
MAX_BYTES = 60 * 1024 * 1024        # upload limit
ALLOWED = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
Image.MAX_IMAGE_PIXELS = 400_000_000


# ----------------------------------------------------------------------------- settings
DEFAULT_SETTINGS = {
    "anthropic_api_key": "",
    "anthropic_model": "claude-sonnet-5-5",
    "mapbox_token": "",
    "gsd_m": 10.0,
}


def _read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def get_settings() -> dict:
    s = dict(DEFAULT_SETTINGS)
    s.update(_read_json(SETTINGS_FILE, {}))
    # .env / environment variables are used when nothing was pasted in the UI
    if not s["anthropic_api_key"]:
        s["anthropic_api_key"] = os.environ.get("ANTHROPIC_API_KEY", "")
    if not s["mapbox_token"]:
        s["mapbox_token"] = os.environ.get("MAPBOX_TOKEN", "")
    if os.environ.get("ANTHROPIC_MODEL") and "anthropic_model" not in _read_json(SETTINGS_FILE, {}):
        s["anthropic_model"] = os.environ["ANTHROPIC_MODEL"]
    return s


def save_settings(patch: dict) -> None:
    with LOCK:
        cur = _read_json(SETTINGS_FILE, {})
        for k, v in patch.items():
            if k in DEFAULT_SETTINGS and v is not None:
                cur[k] = v
        SETTINGS_FILE.write_text(json.dumps(cur, indent=2), encoding="utf-8")
        try:
            os.chmod(SETTINGS_FILE, 0o600)
        except Exception:
            pass


def mask_secret(s: str) -> str:
    if not s:
        return ""
    return s[:4] + "…" + s[-4:] if len(s) > 12 else "••••••"


def public_settings() -> dict:
    s = get_settings()
    return {
        "anthropic": {"configured": bool(s["anthropic_api_key"]), "masked": mask_secret(s["anthropic_api_key"]),
                      "model": s["anthropic_model"]},
        "mapbox": {"configured": bool(s["mapbox_token"]), "masked": mask_secret(s["mapbox_token"])},
        "gsd_m": s["gsd_m"],
    }


# ----------------------------------------------------------------------------- decoding uploads
def _to_u8(arr: np.ndarray) -> np.ndarray:
    if arr.dtype == np.uint8:
        return arr
    a = arr.astype(np.float32)
    lo, hi = np.percentile(a, (2, 98))
    if hi <= lo:
        hi = lo + 1
    return (np.clip((a - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)


def decode_upload(data: bytes, filename: str):
    """bytes -> (rgb_uint8, bands_float32_or_None, format_name, extra_metadata)."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED:
        raise ValueError("Unsupported file type. Use JPG, JPEG, PNG or TIFF/GeoTIFF.")
    if len(data) > MAX_BYTES:
        raise ValueError(f"File is larger than {MAX_BYTES // (1024 * 1024)} MB.")
    meta: dict = {}
    bands = None

    if ext in (".tif", ".tiff"):
        with tifffile.TiffFile(io.BytesIO(data)) as tf:
            page = tf.pages[0]
            arr = page.asarray()
            try:
                for t in page.tags.values():
                    if t.name == "ModelPixelScaleTag":
                        meta["geo_pixel_scale"] = [float(x) for x in t.value]
                    elif t.name == "ModelTiepointTag":
                        meta["geo_tiepoint"] = [float(x) for x in t.value][:6]
                    elif t.name in ("ImageDescription", "Software", "DateTime"):
                        meta[t.name] = str(t.value)[:160]
            except Exception:
                pass
        if arr.ndim == 2:
            arr = arr[..., None]
        if arr.ndim > 3:
            arr = arr.reshape(arr.shape[-3:])
        if arr.shape[0] <= 16 and arr.shape[0] < arr.shape[2]:      # (bands, H, W) -> (H, W, bands)
            arr = np.transpose(arr, (1, 2, 0))
        c = arr.shape[2]
        if c >= 3:
            if arr.dtype == np.uint8:
                rgb = arr[..., :3].copy()
            else:                       # one shared stretch keeps the colour balance of the three display bands
                a3 = arr[..., :3].astype(np.float32)
                lo, hi = np.percentile(a3, (1, 99))
                hi = hi if hi > lo else lo + 1
                rgb = (np.clip((a3 - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
        elif c == 2:
            b0, b1 = _to_u8(arr[..., 0]), _to_u8(arr[..., 1])
            rgb = np.dstack([b0, b1, b0])
        else:
            rgb = np.dstack([_to_u8(arr[..., 0])] * 3)
        if c >= 4:
            bands = arr.astype(np.float32)
        meta["bands"] = int(c)
        meta["dtype"] = str(arr.dtype)
        return rgb, bands, "TIFF", meta

    img = Image.open(io.BytesIO(data))
    fmt = (img.format or ext.strip(".")).upper().replace("MPO", "JPEG")
    try:
        exif = img.getexif()
        for tag, val in exif.items():
            name = ExifTags.TAGS.get(tag, str(tag))
            if name in ("Make", "Model", "DateTime", "Software"):
                meta[name] = str(val)[:100]
    except Exception:
        pass
    if img.info.get("dpi"):
        try:
            meta["dpi"] = [float(x) for x in img.info["dpi"]]
        except Exception:
            pass
    img = ImageOps.exif_transpose(img)
    meta["mode"] = img.mode
    if img.mode in ("I;16", "I", "F"):
        rgb = np.dstack([_to_u8(np.array(img))] * 3)
    else:
        rgb = np.array(img.convert("RGB"))
    return rgb, None, fmt, meta


# ----------------------------------------------------------------------------- image library
def _fit(arr: np.ndarray, max_side: int = MAX_WORK) -> np.ndarray:
    h, w = arr.shape[:2]
    s = max_side / max(h, w)
    if s >= 1:
        return arr
    return cv2.resize(arr, (max(1, round(w * s)), max(1, round(h * s))), interpolation=cv2.INTER_AREA)


def save_image(rgb, name, fmt, size_bytes, source="upload", bands=None, extra=None, sample_key=None) -> dict:
    iid = uuid.uuid4().hex[:10]
    h, w = rgb.shape[:2]
    Image.fromarray(rgb).save(UPLOADS / f"{iid}.png", compress_level=3)
    if bands is not None:
        np.save(UPLOADS / f"{iid}.npy", bands.astype(np.float32))
    work = _fit(rgb)
    ch = []
    for i, nm in enumerate(("Red", "Green", "Blue")):
        c = work[..., i]
        ch.append({"name": nm, "mean": float(c.mean()), "std": float(c.std()), "min": int(c.min()), "max": int(c.max())})
    meta = {
        "id": iid, "name": name, "format": fmt, "width": int(w), "height": int(h),
        "channels": int(bands.shape[2]) if bands is not None else 3,
        "size_bytes": int(size_bytes), "pixel_count": int(w * h),
        "has_bands": bands is not None, "source": source, "sample_key": sample_key,
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "channel_stats": ch, "metadata": extra or {},
    }
    (UPLOADS / f"{iid}.json").write_text(json.dumps(clean(meta)), encoding="utf-8")
    return meta


def load_meta(iid: str) -> dict:
    p = UPLOADS / f"{iid}.json"
    if not iid.isalnum() or not p.exists():
        raise KeyError(iid)
    return json.loads(p.read_text(encoding="utf-8"))


def list_images() -> list:
    out = []
    for p in UPLOADS.glob("*.json"):
        try:
            out.append(json.loads(p.read_text(encoding="utf-8")))
        except Exception:
            continue
    return sorted(out, key=lambda m: m["created"], reverse=True)


def find_sample(key: str):
    for m in list_images():
        if m.get("sample_key") == key:
            return m
    return None


def delete_image(iid: str) -> None:
    load_meta(iid)
    for ext in (".png", ".npy", ".json"):
        (UPLOADS / f"{iid}{ext}").unlink(missing_ok=True)
    with LOCK:
        _CACHE.pop(iid, None)


_CACHE: "OrderedDict[str, np.ndarray]" = OrderedDict()


def get_rgb(iid: str) -> np.ndarray:
    """Working-size RGB copy (<= MAX_WORK px). Always returns a fresh copy."""
    with LOCK:
        if iid in _CACHE:
            _CACHE.move_to_end(iid)
            return _CACHE[iid].copy()
    load_meta(iid)
    full = np.array(Image.open(UPLOADS / f"{iid}.png").convert("RGB"))
    work = _fit(full)
    with LOCK:
        _CACHE[iid] = work
        while len(_CACHE) > 8:
            _CACHE.popitem(last=False)
    return work.copy()


def get_bands(iid: str):
    p = UPLOADS / f"{iid}.npy"
    if not p.exists():
        return None
    b = np.load(p)
    return _fit(b)


# ----------------------------------------------------------------------------- history
def log_session(kind: str, image_id: str, summary: dict, params: dict | None = None, image_b_id: str | None = None):
    try:
        name = load_meta(image_id)["name"]
    except KeyError:
        name = image_id
    rec = {
        "id": uuid.uuid4().hex[:8], "kind": kind, "image_id": image_id, "image_name": name,
        "image_b_id": image_b_id, "when": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "summary": clean(summary), "params": clean(params or {}),
    }
    with LOCK:
        hist = _read_json(HISTORY_FILE, [])
        hist.append(rec)
        HISTORY_FILE.write_text(json.dumps(hist[-500:]), encoding="utf-8")
    return rec


def read_history() -> list:
    return _read_json(HISTORY_FILE, [])


def clear_history() -> None:
    with LOCK:
        HISTORY_FILE.write_text("[]", encoding="utf-8")
