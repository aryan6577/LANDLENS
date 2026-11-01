"""LandLens API - FastAPI application.

Run:  uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""
from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Any, Optional

import cv2
import httpx
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import ai, samples, storage
from .imaging import change as change_mod
from .imaging import compression, core, enhance, features, frequency, landcover, report
from .util import CLASS_NAMES, clean, encode

app = FastAPI(title="LandLens API", version="1.0.0",
              description="Classical digital-image-processing backend for satellite image analysis.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def ok(payload: Any) -> JSONResponse:
    return JSONResponse(clean(payload))


def rgb_of(image_id: str) -> np.ndarray:
    try:
        return storage.get_rgb(image_id)
    except KeyError:
        raise HTTPException(404, "Image not found. It may have been deleted - upload it again or load a sample.")


def gsd_of(v: Optional[float]) -> float:
    return float(v) if v else float(storage.get_settings()["gsd_m"])


# ----------------------------------------------------------------------------- health + dashboard
@app.get("/api/health")
def health():
    return {"status": "ok", "app": "LandLens", "version": app.version}


@app.get("/api/dashboard")
def dashboard():
    hist = storage.read_history()
    latest: dict = {}
    key_map = {"vegetation": "vegetation", "water": "water", "urban": "built_up"}
    for s in reversed(hist):
        sm = s["summary"]
        if s["kind"] == "landcover":
            for k in ("vegetation", "water", "built_up", "bare"):
                latest.setdefault(k, sm.get(k + "_pct"))
            latest.setdefault("image_name", s["image_name"])
            latest.setdefault("when", s["when"])
        elif s["kind"] in key_map:
            latest.setdefault(key_map[s["kind"]], sm.get("coverage_pct"))
    kinds: dict = {}
    for s in hist:
        kinds[s["kind"]] = kinds.get(s["kind"], 0) + 1
    return ok({"images": len(storage.list_images()), "sessions": len(hist), "latest": latest or None,
               "recent": list(reversed(hist[-8:])), "by_kind": kinds})


# ----------------------------------------------------------------------------- settings (API keys)
class SettingsIn(BaseModel):
    anthropic_api_key: Optional[str] = None
    anthropic_model: Optional[str] = None
    mapbox_token: Optional[str] = None
    gsd_m: Optional[float] = None


@app.get("/api/settings")
def get_settings():
    return storage.public_settings()


@app.post("/api/settings")
def set_settings(body: SettingsIn):
    patch = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump().items() if v is not None}
    if "gsd_m" in patch and not (0.01 <= patch["gsd_m"] <= 5000):
        raise HTTPException(400, "Ground resolution must be between 0.01 and 5000 metres per pixel.")
    storage.save_settings(patch)
    return storage.public_settings()


class TestIn(BaseModel):
    which: str


@app.post("/api/settings/test")
def test_key(body: TestIn):
    s = storage.get_settings()
    try:
        if body.which == "anthropic":
            if not s["anthropic_api_key"]:
                raise RuntimeError("No Anthropic key saved yet.")
            ai.call_claude(s["anthropic_api_key"], s["anthropic_model"], "Reply with the single word: ready", system="Reply briefly.", max_tokens=12)
            return {"ok": True, "message": "Anthropic key works."}
        if body.which == "mapbox":
            if not s["mapbox_token"]:
                raise RuntimeError("No Mapbox token saved yet.")
            r = httpx.get("https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/0,0,1/64x64",
                          params={"access_token": s["mapbox_token"]}, timeout=20)
            if r.status_code != 200:
                raise RuntimeError(f"Mapbox answered {r.status_code}. Check that the token is valid and has the styles:tiles scope.")
            return {"ok": True, "message": "Mapbox token works."}
    except RuntimeError as e:
        return {"ok": False, "message": str(e)}
    except httpx.HTTPError as e:
        return {"ok": False, "message": f"Network problem: {e.__class__.__name__}. Check your internet connection."}
    raise HTTPException(400, "Unknown key type.")


# ----------------------------------------------------------------------------- image library
@app.get("/api/images")
def images():
    return ok(storage.list_images())


@app.post("/api/images/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    try:
        rgb, bands, fmt, extra = storage.decode_upload(data, file.filename or "image.png")
        if min(rgb.shape[:2]) < 32:
            raise ValueError("Image is too small (minimum 32 x 32 pixels).")
        meta = storage.save_image(rgb, file.filename or "image", fmt, len(data), "upload", bands, extra)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"Could not read this file as an image ({e.__class__.__name__}).")
    return ok(meta)


@app.get("/api/images/{iid}")
def image_meta(iid: str):
    try:
        return ok(storage.load_meta(iid))
    except KeyError:
        raise HTTPException(404, "Image not found.")


@app.get("/api/images/{iid}/file")
def image_file(iid: str, thumb: int = 0, download: int = 0):
    try:
        meta = storage.load_meta(iid)
    except KeyError:
        raise HTTPException(404, "Image not found.")
    path = storage.UPLOADS / f"{iid}.png"
    headers = {"Cache-Control": "public, max-age=3600"}
    if thumb:
        img = cv2.imread(str(path))
        s = 360 / max(img.shape[:2])
        if s < 1:
            img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        ok_, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 82])
        return Response(buf.tobytes(), media_type="image/jpeg", headers=headers)
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{Path(meta["name"]).stem}.png"'
    return FileResponse(path, media_type="image/png", headers=headers)


@app.delete("/api/images/{iid}")
def image_delete(iid: str):
    try:
        storage.delete_image(iid)
    except KeyError:
        raise HTTPException(404, "Image not found.")
    return {"deleted": iid}


@app.get("/api/samples")
def sample_list():
    return ok(samples.list_samples())


@app.post("/api/samples/{key}/load")
def sample_load(key: str):
    try:
        return ok(samples.load_sample(key))
    except KeyError:
        raise HTTPException(404, "Unknown sample.")


class SatIn(BaseModel):
    lat: float = Field(ge=-85, le=85)
    lon: float = Field(ge=-180, le=180)
    zoom: float = Field(default=15, ge=1, le=20)
    size: int = Field(default=1024, ge=256, le=1280)


@app.post("/api/fetch-satellite")
def fetch_satellite(body: SatIn):
    token = storage.get_settings()["mapbox_token"]
    if not token:
        raise HTTPException(400, "Add a Mapbox access token in Settings to fetch satellite imagery by coordinates.")
    url = f"https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/{body.lon},{body.lat},{body.zoom}/{body.size}x{body.size}"
    try:
        r = httpx.get(url, params={"access_token": token}, timeout=40)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Could not reach Mapbox ({e.__class__.__name__}).")
    if r.status_code == 401:
        raise HTTPException(400, "Mapbox rejected the token. Re-paste it in Settings.")
    if r.status_code != 200:
        raise HTTPException(502, f"Mapbox answered {r.status_code}.")
    name = f"mapbox_{body.lat:.4f}_{body.lon:.4f}_z{body.zoom:g}.jpg"
    rgb, bands, fmt, extra = storage.decode_upload(r.content, name)
    extra.update({"source_provider": "Mapbox Satellite", "lat": body.lat, "lon": body.lon, "zoom": body.zoom})
    return ok(storage.save_image(rgb, name, fmt, len(r.content), "mapbox", None, extra))


# ----------------------------------------------------------------------------- enhancement
@app.get("/api/enhance/ops")
def enhance_ops():
    return ok(enhance.OPS)


class EnhanceIn(BaseModel):
    image_id: str
    op: str = "clahe"
    params: dict = {}


@app.post("/api/enhance")
def do_enhance(body: EnhanceIn):
    rgb = rgb_of(body.image_id)
    try:
        out, aux, hist, stats = enhance.run(rgb, body.op, body.params)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ok({"op": body.op, "images": {"original": encode(rgb), "processed": encode(out, "png" if body.op in ("grayscale",) else "jpg", 92),
                                         "aux": encode(aux) if aux is not None else None},
               "histogram": hist, "stats": stats})


# ----------------------------------------------------------------------------- land cover + labs
class LandIn(BaseModel):
    image_id: str
    k: int = Field(default=8, ge=3, le=12)
    min_area: int = Field(default=40, ge=0, le=5000)
    morph: int = Field(default=5, ge=1, le=21)
    gsd: Optional[float] = None


@app.post("/api/landcover")
def landcover_run(body: LandIn):
    rgb = rgb_of(body.image_id)
    gsd = gsd_of(body.gsd)
    res = landcover.kmeans_landcover(rgb, body.k, body.min_area, body.morph)
    lm = res["label_map"]
    stats = core.class_stats(lm, gsd)
    comps = {}
    boxes = rgb.copy()
    for c in (1, 2, 3):
        comps[CLASS_NAMES[c]] = core.components(lm == c, gsd, top=6)
        boxes = core.draw_boxes(boxes, comps[CLASS_NAMES[c]]["rows"], tuple(int(x) for x in np.array(core.CLASS_COLORS[c])), CLASS_NAMES[c][0])
    masks = {core.CLASS_KEYS[c]: encode((lm == c).astype(np.uint8) * 255, "png") for c in range(4)}
    summary = {s["key"] + "_pct": round(s["pct"], 2) for s in stats}
    summary.update({"k": body.k, "gsd": gsd})
    storage.log_session("landcover", body.image_id, summary, body.model_dump())
    return ok({"stats": stats, "clusters": res["clusters"], "components": comps, "k": body.k, "gsd": gsd,
               "images": {"original": encode(rgb), "segmentation": encode(core.label_to_rgb(lm), "png"),
                          "overlay": encode(core.blend_label(rgb, lm, 0.55)), "boxes": encode(boxes), "masks": masks}})


class MaskIn(BaseModel):
    image_id: str
    method: str = "threshold"
    threshold: Optional[float] = None
    morph: int = Field(default=5, ge=1, le=21)
    min_area: int = Field(default=40, ge=0, le=5000)
    tex_filter: float = Field(default=0.65, ge=0.05, le=1.0)
    k: int = Field(default=8, ge=3, le=12)
    gsd: Optional[float] = None
    image_b_id: Optional[str] = None


@app.post("/api/mask/{kind}")
def mask_lab(kind: str, body: MaskIn):
    if kind not in landcover.LAB_CFG:
        raise HTTPException(404, "Unknown lab.")
    if body.method not in ("threshold", "otsu", "kmeans"):
        raise HTTPException(400, "Method must be threshold, otsu or kmeans.")
    gsd = gsd_of(body.gsd)
    args = dict(method=body.method, threshold=body.threshold, morph=body.morph, min_area=body.min_area,
                tex_filter=body.tex_filter, k=body.k, gsd=gsd)
    res = landcover.run_mask_lab(rgb_of(body.image_id), kind, **args)
    res.pop("_mask")
    if body.image_b_id:
        rb = landcover.run_mask_lab(rgb_of(body.image_b_id), kind, **args)
        rb.pop("_mask")
        res["compare"] = {"b_coverage_pct": rb["coverage_pct"], "b_area_ha": rb["area_ha"], "delta_pct_points": rb["coverage_pct"] - res["coverage_pct"],
                          "b_overlay": rb["images"]["overlay"], "b_name": storage.load_meta(body.image_b_id)["name"]}
    storage.log_session(kind, body.image_id, {"coverage_pct": round(res["coverage_pct"], 2), "area_ha": round(res["area_ha"], 2),
                                              "regions": res["components"]["count"], "method": body.method}, body.model_dump(), body.image_b_id)
    return ok(res)


class NdviIn(BaseModel):
    image_id: str
    red_band: int = 1
    nir_band: int = 4
    gsd: Optional[float] = None


@app.post("/api/ndvi")
def ndvi(body: NdviIn):
    meta = storage.load_meta(body.image_id) if (storage.UPLOADS / f"{body.image_id}.json").exists() else None
    if meta is None:
        raise HTTPException(404, "Image not found.")
    bands = storage.get_bands(body.image_id)
    if bands is None:
        raise HTTPException(400, "This image has no near-infrared band. NDVI needs a multispectral TIFF with at least 4 bands "
                                 "(for example R, G, B, NIR). Load the multispectral sample to try it.")
    try:
        res = landcover.ndvi_analysis(bands, body.red_band, body.nir_band, gsd_of(body.gsd), storage.get_rgb(body.image_id))
    except ValueError as e:
        raise HTTPException(400, str(e))
    storage.log_session("ndvi", body.image_id, {"mean_ndvi": round(res["stats"]["mean"], 3), "dense_pct": round(res["classes"][-1]["pct"], 2)}, body.model_dump())
    return ok(res)


# ----------------------------------------------------------------------------- change detection
class ChangeIn(BaseModel):
    image_a_id: str
    image_b_id: str
    interpolation: str = "bilinear"
    register: bool = True
    match_histograms: bool = True
    threshold_mode: str = "otsu"
    threshold: float = Field(default=25.0, ge=1, le=200)
    morph: int = Field(default=5, ge=1, le=21)
    min_area: int = Field(default=60, ge=0, le=5000)
    k: int = Field(default=8, ge=3, le=12)
    gsd: Optional[float] = None


@app.post("/api/change")
def change(body: ChangeIn):
    if body.image_a_id == body.image_b_id:
        raise HTTPException(400, "Pick two different images to compare.")
    a, b = rgb_of(body.image_a_id), rgb_of(body.image_b_id)
    res = change_mod.run(a, b, body.interpolation, body.register, body.match_histograms, body.threshold_mode, body.threshold,
                         body.morph, body.min_area, body.k, gsd_of(body.gsd))
    res.pop("_mask")
    storage.log_session("change", body.image_a_id, {"changed_pct": round(res["changed_pct"], 2), "regions": res["regions"]["count"],
                                                    "threshold": round(res["threshold"], 1)}, body.model_dump(), body.image_b_id)
    return ok(res)


# ----------------------------------------------------------------------------- frequency / compression / features
class FreqIn(BaseModel):
    image_id: str
    ftype: str = "lowpass"
    shape: str = "gaussian"
    d0: float = Field(default=30, ge=1, le=400)
    order: int = Field(default=2, ge=1, le=10)
    size: int = Field(default=256, ge=64, le=512)


@app.post("/api/frequency")
def freq(body: FreqIn):
    if body.ftype not in ("lowpass", "highpass") or body.shape not in ("ideal", "butterworth", "gaussian"):
        raise HTTPException(400, "Invalid filter selection.")
    res = frequency.run(rgb_of(body.image_id), body.ftype, body.shape, body.d0, body.order, body.size)
    return ok(res)


class CompIn(BaseModel):
    image_id: str
    mode: str = "gray"
    quality: int = Field(default=60, ge=1, le=100)


@app.post("/api/compression")
def comp(body: CompIn):
    if body.mode not in ("gray", "rgb"):
        raise HTTPException(400, "Mode must be gray or rgb.")
    res = compression.run(rgb_of(body.image_id), body.mode, body.quality)
    storage.log_session("compression", body.image_id, {"jpeg_ratio": round(res["rows"][0]["ratio"], 2), "psnr": round(res["rows"][0]["psnr"] or 0, 2)}, body.model_dump())
    return ok(res)


class FeatIn(BaseModel):
    image_id: str
    k: int = Field(default=8, ge=3, le=12)
    gsd: Optional[float] = None


@app.post("/api/features")
def feat(body: FeatIn):
    rgb = rgb_of(body.image_id)
    gsd = gsd_of(body.gsd)
    lm = landcover.kmeans_landcover(rgb, body.k)["label_map"]
    res = {"statistics": features.statistics(rgb), "shapes": features.shapes(rgb, lm, gsd), "texture": features.texture(rgb, lm)}
    storage.log_session("features", body.image_id, {"components": len(res["shapes"]["rows"]), "glcm_contrast": round(res["texture"]["overall"]["contrast"], 3)}, body.model_dump())
    return ok(res)


# ----------------------------------------------------------------------------- reports, export, AI, history
class AiIn(BaseModel):
    image_id: str
    image_b_id: Optional[str] = None
    k: int = 8
    gsd: Optional[float] = None


def _ai_text(a):
    s = storage.get_settings()
    if not s["anthropic_api_key"]:
        raise HTTPException(400, "Add your Anthropic API key in Settings to use AI insights. The rest of LandLens works without it.")
    try:
        return ai.insight(report.ai_summary(a), s["anthropic_api_key"], s["anthropic_model"])
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Could not reach Anthropic ({e.__class__.__name__}).")


@app.post("/api/insights")
def insights(body: AiIn):
    rgb_of(body.image_id)
    a = report.full_analysis(body.image_id, body.image_b_id, body.k, body.gsd)
    return {"text": _ai_text(a)}


@app.get("/api/report/{image_id}")
def make_report(image_id: str, image_b_id: Optional[str] = None, k: int = 8, gsd: Optional[float] = None, ai_insight: int = 0):
    rgb_of(image_id)
    a = report.full_analysis(image_id, image_b_id or None, k, gsd)
    text = _ai_text(a) if ai_insight else None
    pdf = report.build_pdf(a, text)
    storage.log_session("report", image_id, {"pages": "pdf", "with_change": bool(image_b_id), "with_ai": bool(text)}, {"k": k}, image_b_id)
    name = Path(a["meta"]["name"]).stem
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="landlens_{name}.pdf"'})


@app.get("/api/export/csv/{image_id}")
def export_csv(image_id: str, image_b_id: Optional[str] = None, k: int = 8, gsd: Optional[float] = None):
    rgb_of(image_id)
    a = report.full_analysis(image_id, image_b_id or None, k, gsd)
    name = Path(a["meta"]["name"]).stem
    return Response(report.build_csv(a), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="landlens_{name}.csv"'})


@app.get("/api/history")
def history():
    return ok(list(reversed(storage.read_history())))


@app.delete("/api/history")
def history_clear():
    storage.clear_history()
    return {"cleared": True}


@app.get("/api/history/csv")
def history_csv():
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["when", "analysis", "image", "summary"])
    for s in storage.read_history():
        w.writerow([s["when"], s["kind"], s["image_name"], "; ".join(f"{k}={v}" for k, v in s["summary"].items())])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="landlens_history.csv"'})


# ----------------------------------------------------------------------------- serve the built frontend (optional)
_DIST = [storage.ROOT.parent / "frontend" / "dist", storage.ROOT / "static"]
for _d in _DIST:
    if (_d / "index.html").exists():
        app.mount("/", StaticFiles(directory=_d, html=True), name="frontend")
        break
