"""Small helpers shared by every module: JSON cleaning, image -> data-URL, class constants."""
from __future__ import annotations

import base64
import io

import numpy as np
from PIL import Image

# Land-cover classes used everywhere (index = value stored in the label map)
CLASS_NAMES = ["Bare land", "Vegetation", "Water", "Built-up"]
CLASS_KEYS = ["bare", "vegetation", "water", "built_up"]
CLASS_COLORS = [(201, 168, 106), (52, 211, 153), (56, 160, 253), (249, 115, 22)]  # RGB


def clean(o):
    """Make numpy / NaN values JSON-safe."""
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    if isinstance(o, np.generic):
        return clean(o.item())
    if isinstance(o, float):
        return None if (o != o or o in (float("inf"), float("-inf"))) else o
    return o


def encode(arr, kind: str = "jpg", quality: int = 88) -> str:
    """numpy image (gray or RGB, uint8) -> data URL the browser can show directly."""
    a = np.asarray(arr)
    if a.dtype != np.uint8:
        a = np.clip(a, 0, 255).astype(np.uint8)
    img = Image.fromarray(a)
    buf = io.BytesIO()
    if kind == "png":
        img.save(buf, "PNG", compress_level=3)
        mime = "image/png"
    else:
        img.convert("RGB").save(buf, "JPEG", quality=quality)
        mime = "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode()


def hex_color(rgb) -> str:
    return "#%02x%02x%02x" % tuple(int(x) for x in rgb)
