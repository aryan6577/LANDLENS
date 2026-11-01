"""Full analysis pipeline + PDF / CSV report builders."""
from __future__ import annotations

import csv
import io
from datetime import datetime

import cv2
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.platypus import (BaseDocTemplate, Frame, Image as RLImage, PageBreak, PageTemplate,  # noqa: E402
                                Paragraph, Spacer, Table, TableStyle)

from .. import storage
from ..util import CLASS_COLORS, CLASS_NAMES
from . import change as change_mod
from . import core, enhance, features, landcover

NAVY, CYAN, GREEN = colors.HexColor("#0a1226"), colors.HexColor("#22d3ee"), colors.HexColor("#34d399")


def full_analysis(image_id, b_id=None, k=8, gsd=None):
    meta = storage.load_meta(image_id)
    rgb = storage.get_rgb(image_id)
    gsd = float(gsd or storage.get_settings()["gsd_m"])
    stretched, _ = enhance.apply(rgb, "stretch", {})
    enh, _ = enhance.apply(stretched, "clahe", {"clip": 2.5, "tiles": 8})
    lc = landcover.kmeans_landcover(rgb, k=k)
    lm = lc["label_map"]
    labs = {kind: landcover.run_mask_lab(rgb, kind, "threshold", gsd=gsd, images=False) for kind in ("vegetation", "water", "urban")}
    out = {
        "meta": meta, "rgb": rgb, "enhanced": enh, "gsd": gsd, "k": k, "label_map": lm, "clusters": lc["clusters"],
        "class_stats": core.class_stats(lm, gsd), "labs": labs, "stats": features.statistics(rgb),
        "components": {c: core.components(lm == c, gsd, top=5) for c in (1, 2, 3)},
        "change": None, "meta_b": None,
    }
    if b_id:
        out["meta_b"] = storage.load_meta(b_id)
        out["change"] = change_mod.run(rgb, storage.get_rgb(b_id), k=k, gsd=gsd)
    return out


def ai_summary(a):
    d = {"image": a["meta"]["name"], "size": f'{a["meta"]["width"]}x{a["meta"]["height"]}', "meters_per_pixel": a["gsd"],
         "land_cover_pct": {s["name"]: round(s["pct"], 1) for s in a["class_stats"]},
         "rule_based_pct": {k: round(v["coverage_pct"], 1) for k, v in a["labs"].items()},
         "mean_gray": round(a["stats"]["rows"][3]["mean"], 1), "std_gray": round(a["stats"]["rows"][3]["std"], 1)}
    if a["change"]:
        c = a["change"]
        d["change_detection"] = {"compared_with": a["meta_b"]["name"], "changed_pct": round(c["changed_pct"], 1),
                                 "class_shift_points": {x["name"]: round(x["delta"], 1) for x in c["classes"]},
                                 "top_transitions": [f'{m["from"]} -> {m["to"]}: {m["pct"]:.1f}%' for m in c["transitions"]["top"][:4]]}
    return d


# ----------------------------------------------------------------------------- CSV
def build_csv(a) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["section", "metric", "value"])
    m = a["meta"]
    for k in ("name", "format", "width", "height", "pixel_count", "size_bytes"):
        w.writerow(["image", k, m[k]])
    w.writerow(["image", "meters_per_pixel", a["gsd"]])
    for r in a["stats"]["rows"]:
        for k in ("mean", "std", "variance", "min", "max", "median", "skewness", "entropy"):
            w.writerow(["statistics", f'{r["channel"]}_{k}', round(r[k], 4)])
    for s in a["class_stats"]:
        w.writerow(["land_cover", f'{s["name"]}_pct', round(s["pct"], 3)])
        w.writerow(["land_cover", f'{s["name"]}_pixels', s["pixels"]])
        w.writerow(["land_cover", f'{s["name"]}_area_ha', round(s["area_ha"], 3)])
    for kind, r in a["labs"].items():
        w.writerow([kind, "coverage_pct", round(r["coverage_pct"], 3)])
        w.writerow([kind, "pixels", r["pixels"]])
        w.writerow([kind, "area_ha", round(r["area_ha"], 3)])
        w.writerow([kind, "components", r["components"]["count"]])
    for c, comp in a["components"].items():
        for r in comp["rows"]:
            w.writerow(["components", f'{CLASS_NAMES[c]}_{r["rank"]}', f'area_px={r["area_px"]}; perimeter={r["perimeter_px"]:.1f}; circularity={r["circularity"]:.3f}'])
    if a["change"]:
        c = a["change"]
        w.writerow(["change", "compared_with", a["meta_b"]["name"]])
        w.writerow(["change", "changed_pct", round(c["changed_pct"], 3)])
        w.writerow(["change", "threshold", round(c["threshold"], 2)])
        for x in c["classes"]:
            w.writerow(["change", f'{x["name"]}_A_to_B_pct', f'{x["a"]:.2f} -> {x["b"]:.2f}'])
    return buf.getvalue()


# ----------------------------------------------------------------------------- PDF helpers
def _img(arr, width_mm, kind="jpg"):
    ok, buf = cv2.imencode(".jpg" if kind == "jpg" else ".png", cv2.cvtColor(arr, cv2.COLOR_RGB2BGR) if arr.ndim == 3 else arr,
                           [cv2.IMWRITE_JPEG_QUALITY, 88])
    h, w = arr.shape[:2]
    return RLImage(io.BytesIO(buf.tobytes()), width=width_mm * mm, height=width_mm * mm * h / w)


def _fig_png(fig):
    b = io.BytesIO()
    fig.savefig(b, format="png", dpi=170, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    b.seek(0)
    return b


def _chart_pie(stats):
    fig, ax = plt.subplots(figsize=(3.6, 3.2))
    vals = [s["pct"] for s in stats]
    ax.pie(vals, labels=[f'{s["name"]}\n{s["pct"]:.1f}%' for s in stats], colors=[np.array(c) / 255 for c in CLASS_COLORS],
           startangle=90, wedgeprops={"width": 0.42, "edgecolor": "white"}, textprops={"fontsize": 7})
    return _fig_png(fig)


def _chart_bars(classes):
    fig, ax = plt.subplots(figsize=(4.4, 3.0))
    x = np.arange(4)
    ax.bar(x - 0.2, [c["a"] for c in classes], 0.4, label="Image A", color="#0ea5e9")
    ax.bar(x + 0.2, [c["b"] for c in classes], 0.4, label="Image B", color="#34d399")
    ax.set_xticks(x)
    ax.set_xticklabels([c["name"] for c in classes], fontsize=7)
    ax.set_ylabel("% of image", fontsize=8)
    ax.legend(fontsize=7, frameon=False)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    return _fig_png(fig)


def _chart_hist(stats):
    fig, ax = plt.subplots(figsize=(4.4, 2.6))
    xs = [h["bin"] for h in stats["histogram"]]
    for key, col in (("r", "#ef4444"), ("g", "#22c55e"), ("b", "#3b82f6")):
        ax.plot(xs, [h[key] for h in stats["histogram"]], color=col, lw=1.2)
    ax.set_xlabel("Intensity", fontsize=8)
    ax.set_ylabel("Fraction", fontsize=8)
    ax.tick_params(labelsize=7)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    return _fig_png(fig)


def build_pdf(a, ai_text: str | None = None) -> bytes:
    ss = getSampleStyleSheet()
    H1 = ParagraphStyle("h1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=15, textColor=NAVY, spaceBefore=10, spaceAfter=6, keepWithNext=1)
    H2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=11, textColor=NAVY, spaceBefore=8, spaceAfter=4, keepWithNext=1)
    BODY = ParagraphStyle("b", parent=ss["BodyText"], fontName="Helvetica", fontSize=9, leading=13, textColor=colors.HexColor("#1f2937"))
    SMALL = ParagraphStyle("s", parent=BODY, fontSize=7.5, textColor=colors.HexColor("#6b7280"), leading=10)
    TITLE = ParagraphStyle("t", parent=BODY, fontName="Helvetica-Bold", fontSize=26, textColor=colors.white, leading=30)
    SUB = ParagraphStyle("st", parent=BODY, fontSize=10, textColor=colors.HexColor("#a5f3fc"), leading=14)

    def table(rows, widths=None, head=True):
        t = Table(rows, colWidths=widths, repeatRows=1 if head else 0)
        st = [("FONT", (0, 0), (-1, -1), "Helvetica", 8), ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#1f2937")),
              ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
              ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
        if head:
            st += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8)]
        t.setStyle(TableStyle(st))
        return t

    m = a["meta"]
    story = []
    cover = Table([[Paragraph("LandLens", TITLE)], [Paragraph("Satellite image analysis report", SUB)],
                   [Paragraph(f'{m["name"]} &nbsp;|&nbsp; generated {datetime.now().strftime("%d %b %Y, %H:%M")}', SUB)]], colWidths=[174 * mm])
    cover.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("TOPPADDING", (0, 0), (0, 0), 18),
                               ("BOTTOMPADDING", (0, -1), (-1, -1), 16), ("LINEBELOW", (0, -1), (-1, -1), 3, CYAN)]))
    story += [cover, Spacer(1, 8)]
    story.append(Paragraph("Estimates, not ground truth: every percentage in this report is computed with classical image processing "
                           "(colour, intensity and texture rules, K-means clustering, thresholding and morphology). No trained model or "
                           "field survey is involved, so treat the numbers as indicative.", SMALL))

    story.append(Paragraph("1. Uploaded image", H1))
    story.append(table([["Property", "Value"], ["File name", m["name"]], ["Format", m["format"]], ["Dimensions", f'{m["width"]} x {m["height"]} px'],
                        ["Pixel count", f'{m["pixel_count"]:,}'], ["File size", f'{m["size_bytes"] / 1024:.1f} KB'],
                        ["Channels / bands", str(m["channels"])], ["Assumed ground resolution", f'{a["gsd"]:g} m per pixel']], [55 * mm, 119 * mm]))
    story.append(Spacer(1, 6))
    story.append(table([["Channel", "Mean", "Std dev", "Min", "Max", "Entropy"]] + [[r["channel"], f'{r["mean"]:.1f}', f'{r["std"]:.1f}', r["min"], r["max"], f'{r["entropy"]:.2f}'] for r in a["stats"]["rows"]],
                        [30 * mm, 28 * mm, 28 * mm, 28 * mm, 28 * mm, 32 * mm]))

    story.append(Paragraph("2. Original and enhanced image", H1))
    story.append(Table([[_img(a["rgb"], 84), _img(a["enhanced"], 84)], [Paragraph("Original", SMALL), Paragraph("Enhanced (contrast stretch + CLAHE)", SMALL)]], colWidths=[87 * mm, 87 * mm]))

    story.append(Paragraph("3. Land-cover segmentation", H1))
    seg = core.blend_label(a["rgb"], a["label_map"], 0.65)
    story.append(Table([[_img(seg, 84), RLImage(_chart_pie(a["class_stats"]), width=78 * mm, height=70 * mm)]], colWidths=[87 * mm, 87 * mm]))
    story.append(Paragraph(f'Method: K-means clustering (k = {a["k"]}) on Lab colour + texture, clusters named by colour/texture rules, then morphological opening/closing and small-region removal.', SMALL))
    story.append(Spacer(1, 4))
    story.append(table([["Class", "Pixels", "Coverage", "Area (ha)", "Area (km2)"]] + [[s["name"], f'{s["pixels"]:,}', f'{s["pct"]:.2f}%', f'{s["area_ha"]:,.1f}', f'{s["area_km2"]:.3f}'] for s in a["class_stats"]],
                        [44 * mm, 34 * mm, 32 * mm, 32 * mm, 32 * mm]))

    story.append(Paragraph("4. Vegetation, water and built-up statistics", H1))
    lab_rows = [["Lab", "Method", "Coverage", "Pixels", "Area (ha)", "Regions"]]
    for kind, r in a["labs"].items():
        lab_rows.append([kind.capitalize(), f'index threshold {r["threshold"]:.3f}', f'{r["coverage_pct"]:.2f}%', f'{r["pixels"]:,}', f'{r["area_ha"]:,.1f}', r["components"]["count"]])
    story.append(table(lab_rows, [26 * mm, 52 * mm, 24 * mm, 26 * mm, 24 * mm, 22 * mm]))
    story.append(Paragraph("Vegetation uses the Excess-Green index (2g - r - b) from RGB. This is not NDVI: a true NDVI needs a near-infrared band.", SMALL))
    for c in (1, 2, 3):
        rows = a["components"][c]["rows"]
        if rows:
            story.append(Paragraph(f"Largest {CLASS_NAMES[c].lower()} regions", H2))
            story.append(table([["#", "Area (px)", "Perimeter", "Circularity", "Eccentricity", "Aspect"]] + [[r["rank"], f'{r["area_px"]:,}', f'{r["perimeter_px"]:.0f}', f'{r["circularity"]:.2f}', f'{r["eccentricity"]:.2f}', f'{r["aspect_ratio"]:.2f}'] for r in rows],
                                [12 * mm, 34 * mm, 30 * mm, 30 * mm, 34 * mm, 30 * mm]))

    if a["change"]:
        c = a["change"]
        story.append(PageBreak())
        story.append(Paragraph("5. Change detection", H1))
        story.append(Paragraph(f'Image A: {m["name"]} &nbsp;&nbsp; Image B: {a["meta_b"]["name"]}. Image B was registered to A with ECC, histogram-matched, differenced in Lab colour, '
                               f'thresholded ({c["threshold_mode"]}, T = {c["threshold"]:.1f}) and cleaned with morphology.', BODY))
        rgb_b = storage.get_rgb(a["meta_b"]["id"])
        ov = core.overlay_mask(cv2.resize(rgb_b, (a["rgb"].shape[1], a["rgb"].shape[0])), c["_mask"], (255, 59, 92), 0.5)
        story.append(Spacer(1, 4))
        story.append(Table([[_img(a["rgb"], 56), _img(rgb_b, 56), _img(ov, 56)], [Paragraph("Image A", SMALL), Paragraph("Image B", SMALL), Paragraph("Changed regions (red)", SMALL)]], colWidths=[58 * mm] * 3))
        story.append(Spacer(1, 4))
        story.append(table([["Metric", "Value"], ["Changed pixels", f'{c["changed_pct"]:.2f}%  ({c["changed_pixels"]:,} px)'], ["Changed area", f'{c["area_ha"]:,.1f} ha'],
                            ["Changed regions", str(c["regions"]["count"])],
                            ["Registration", f'dx {c["registration"]["dx"]:.1f}px, dy {c["registration"]["dy"]:.1f}px, rotation {c["registration"]["rotation_deg"]:.2f} deg' if c["registration"]["applied"] else "not applied"]],
                            [50 * mm, 124 * mm]))
        story.append(Spacer(1, 4))
        story.append(Table([[RLImage(_chart_bars(c["classes"]), width=100 * mm, height=68 * mm),
                             table([["Class", "A %", "B %", "Change"]] + [[x["name"], f'{x["a"]:.1f}', f'{x["b"]:.1f}', f'{x["delta"]:+.1f}'] for x in c["classes"]], [28 * mm, 14 * mm, 14 * mm, 18 * mm])]],
                           colWidths=[102 * mm, 72 * mm]))
        if c["transitions"]["top"]:
            story.append(Paragraph("Largest class transitions", H2))
            story.append(table([["From", "To", "% of area"]] + [[t["from"], t["to"], f'{t["pct"]:.2f}'] for t in c["transitions"]["top"][:6]], [50 * mm, 50 * mm, 34 * mm]))
        story.append(Paragraph("A changed pixel is not automatically a real land-use change: seasons, lighting, sensor differences and clouds all alter pixel values.", SMALL))

    story.append(Paragraph("6. Image statistics and histogram", H1))
    story.append(RLImage(_chart_hist(a["stats"]), width=110 * mm, height=65 * mm))

    story.append(Paragraph("7. Algorithms and parameters", H1))
    story.append(table([["Step", "Algorithm", "Parameters"],
                        ["Enhancement", "Percentile contrast stretch, CLAHE", "clip 2.5, tiles 8x8"],
                        ["Segmentation", "K-means (Lab + texture), rule-based cluster naming", f'k = {a["k"]}, morphology 5 px, min region 40 px'],
                        ["Vegetation", "Excess-Green index threshold", f'T = {a["labs"]["vegetation"]["threshold"]:.3f}'],
                        ["Water", "Blue-dominance index + smoothness filter", f'T = {a["labs"]["water"]["threshold"]:.3f}'],
                        ["Built-up", "Texture + edge density + low saturation score", f'T = {a["labs"]["urban"]["threshold"]:.3f}'],
                        ["Regions", "Connected components (8-connectivity), shape descriptors", "area, perimeter, circularity, eccentricity"]],
                       [32 * mm, 80 * mm, 62 * mm]))

    if ai_text:
        story.append(Paragraph("8. AI-assisted interpretation", H1))
        for para in ai_text.split("\n\n"):
            story.append(Paragraph(para.replace("\n", " "), BODY))
            story.append(Spacer(1, 4))
        story.append(Paragraph("Generated by a language model from the numbers above. Verify before relying on it.", SMALL))

    story.append(Paragraph("Conclusion and limitations" if not ai_text else "9. Conclusion and limitations", H1))
    top = max(a["class_stats"], key=lambda s: s["pct"])
    story.append(Paragraph(f'The scene is dominated by <b>{top["name"].lower()}</b> ({top["pct"]:.1f}% of pixels). Vegetation covers about {a["labs"]["vegetation"]["coverage_pct"]:.1f}%, '
                           f'water {a["labs"]["water"]["coverage_pct"]:.1f}% and built-up area {a["labs"]["urban"]["coverage_pct"]:.1f}% according to the rule-based labs.', BODY))
    story.append(Spacer(1, 4))
    for t in ("Classification uses colour and texture only. Shadows, dark forests, wet soil and rooftops can be confused with other classes.",
              "Percentages depend on the thresholds and on the assumed ground resolution (area in hectares scales with it).",
              "RGB vegetation indices are approximations. True NDVI requires red and near-infrared bands.",
              "Results should be validated against reference data before any real-world decision."):
        story.append(Paragraph("&bull; " + t, BODY))

    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                          title="LandLens report - " + m["name"], author="LandLens")

    def deco(canv, d):
        canv.saveState()
        canv.setFillColor(CYAN)
        canv.rect(0, A4[1] - 3 * mm, A4[0], 3 * mm, stroke=0, fill=1)
        canv.setFont("Helvetica", 7.5)
        canv.setFillColor(colors.HexColor("#6b7280"))
        canv.drawString(18 * mm, 9 * mm, "LandLens  |  Digital Image Processing")
        canv.drawRightString(A4[0] - 18 * mm, 9 * mm, f"Page {d.page}")
        canv.restoreState()

    doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")], onPage=deco)])
    doc.build(story)
    return buf.getvalue()
