# server.py — Face Droop Simulation API (FastAPI) with printlayout.jpg background
import os, base64, uvicorn
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware

import cv2
import numpy as np
import mediapipe as mp
from scipy.spatial import Delaunay

# ---------------- Paths ----------------
ROOT = Path(__file__).resolve().parent
# Always use printlayout.jpg next to this file (overrideable via env)
BG_PATH = Path(os.getenv("FACE_SIM_BG", ROOT / "printlayout.jpg")).resolve()

EXPECTED_BG_W = 2100
EXPECTED_BG_H = 1500  # landscape A4-ish; your layout is 2100x1500 in app.py

# ---------------- Landmark groups ----------------
LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291]
LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308]
LIPS_REGION = sorted(set(LIPS_OUTER + LIPS_INNER))
LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133]
RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263]
LEFT_BROW = [70, 63, 105, 66, 107, 55, 65]
RIGHT_BROW = [336, 296, 334, 293, 300, 285, 295]
LEFT_MOUTH_CORNER, RIGHT_MOUTH_CORNER = 61, 291
STABLE_ANCHORS = [33, 263, 61, 291]
CHIN_REGION = [
    152, 377, 400, 378, 379, 365, 397, 288, 361, 172, 58, 132, 93, 168, 417, 200, 428, 199, 175, 152
]

# ---------------- MediaPipe FaceMesh ----------------
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=True,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
)

# ---------------- Utils ----------------
def _ensure_bg_loaded() -> np.ndarray:
    """Load printlayout.jpg and ensure it is EXACT size (2100x1500)."""
    if not BG_PATH.exists():
        raise FileNotFoundError(f"Background not found at {BG_PATH}")
    bg = cv2.imread(str(BG_PATH))
    if bg is None:
        raise RuntimeError(f"Failed to read background: {BG_PATH}")
    h, w = bg.shape[:2]
    if (w, h) != (EXPECTED_BG_W, EXPECTED_BG_H):
        # Resize to expected canvas to match your hard-coded boxes
        bg = cv2.resize(bg, (EXPECTED_BG_W, EXPECTED_BG_H), interpolation=cv2.INTER_AREA)
    return bg

def landmarks_from_image_rgb(img_rgb: np.ndarray) -> Optional[np.ndarray]:
    h, w = img_rgb.shape[:2]
    res = face_mesh.process(img_rgb)
    if not res.multi_face_landmarks:
        return None
    lm = res.multi_face_landmarks[0].landmark
    return np.array([[int(p.x * w + 0.5), int(p.y * h + 0.5)] for p in lm], dtype=np.int32)

def convex_mask_from_indices(shape_hw, points, indices, feather_px=25):
    h, w = shape_hw
    mask = np.zeros((h, w), dtype=np.uint8)
    if not indices:
        return mask
    pts = points[indices].astype(np.int32)
    hull = cv2.convexHull(pts.reshape(-1, 1, 2))
    cv2.fillConvexPoly(mask, hull, 255)
    k = max(1, (feather_px // 2) * 2 + 1)
    return cv2.GaussianBlur(mask, (k, k), 0)

def triangulate_region(points, region_indices):
    if len(region_indices) < 3:
        return np.array([], dtype=np.int32)
    region_pts = points[region_indices].astype(np.float64)
    try:
        tri = Delaunay(region_pts)
    except Exception:
        return np.array([], dtype=np.int32)
    return np.array(
        [[region_indices[int(a)], region_indices[int(b)], region_indices[int(c)]] for a, b, c in tri.simplices],
        dtype=np.int32,
    )

def warp_triangle(src_img, src_tri, dst_tri):
    x, y, w, h = cv2.boundingRect(np.array(dst_tri, dtype=np.int32))
    if w <= 0 or h <= 0:
        return None, None, (x, y, w, h)
    sx, sy, sw, sh = cv2.boundingRect(np.array(src_tri, dtype=np.int32))
    src_crop = src_img[sy : sy + sh, sx : sx + sw]
    if src_crop.size == 0:
        return None, None, (x, y, w, h)
    src_shift = np.float32([[src_tri[i][0] - sx, src_tri[i][1] - sy] for i in range(3)])
    dst_shift = np.float32([[dst_tri[i][0] - x, dst_tri[i][1] - y] for i in range(3)])
    M = cv2.getAffineTransform(src_shift, dst_shift)
    warped = cv2.warpAffine(src_crop, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT_101)
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillConvexPoly(mask, np.int32(dst_shift), 255)
    return warped, mask, (x, y, w, h)

def piecewise_warp(src_img, src_pts, dst_pts, triangles, region_mask):
    h, w = src_img.shape[:2]
    accum = np.zeros((h, w, 3), dtype=np.float32)
    counts = np.zeros((h, w, 1), dtype=np.float32)
    for tri in triangles:
        wp, mk, (x, y, ww, hh) = warp_triangle(src_img, src_pts[tri], dst_pts[tri])
        if wp is None:
            continue
        m = mk[:, :, None].astype(np.float32) / 255.0
        accum[y : y + hh, x : x + ww] += wp.astype(np.float32) * m
        counts[y : y + hh, x : x + ww] += m[:, :, :1]
    tri_mask = counts > 0
    counts[counts == 0] = 1.0
    averaged = accum / counts
    final_warped = src_img.astype(np.float32)
    np.copyto(final_warped, averaged, where=tri_mask)
    alpha = (region_mask.astype(np.float32) / 255.0)[:, :, None]
    blended = final_warped * alpha + src_img.astype(np.float32) * (1.0 - alpha)
    return np.clip(blended, 0, 255).astype(np.uint8)

def compute_droop(pts, side="left", severity=0.58, lateral=0.05):
    dst = pts.astype(np.float32).copy()
    cx = np.mean(pts[:, 0])
    face_h = np.max(pts[:, 1]) - np.min(pts[:, 1])
    base = severity * (face_h * 0.18)
    lateral_px = lateral * (face_h * 0.08)
    if side.lower().startswith("l"):
        sel = pts[:, 0] < cx; sign = 1.0; eyes, brows, mouth_corner = LEFT_EYE, LEFT_BROW, LEFT_MOUTH_CORNER
    else:
        sel = pts[:, 0] > cx; sign = -1.0; eyes, brows, mouth_corner = RIGHT_EYE, RIGHT_BROW, RIGHT_MOUTH_CORNER
    lips = np.array(LIPS_REGION)
    mcx = np.mean(pts[lips, 0])
    maxdx = np.max(np.abs(pts[lips, 0] - mcx)) + 1e-6

    lips_no_corner = [p for p in lips if p != mouth_corner]
    for i in lips_no_corner:
        if sel[i]:
            dx = abs(pts[i, 0] - mcx)
            w = 0.25 + 0.75 * ((dx / maxdx) ** 1.5)
            dst[i, 1] += base * (0.8 + 0.2 * w) * w
            dst[i, 0] += sign * lateral_px * w

    if sel[mouth_corner]:
        dst[mouth_corner, 1] += base * 1.1
        dst[mouth_corner, 0] += sign * lateral_px * 0.8

    ecx = np.mean(pts[eyes, 0]); ecy = np.mean(pts[eyes, 1])
    span = max(1e-6, np.max(pts[eyes, 0]) - np.min(pts[eyes, 0]))
    for i in eyes:
        if not sel[i]: continue
        lateralness = (((pts[i, 0] - np.min(pts[eyes, 0])) / span) if sign > 0
                       else ((np.max(pts[eyes, 0]) - pts[i, 0]) / span))
        lateralness = float(np.clip(lateralness, 0.0, 1.0))
        center_w = 0.4 + 0.6 * (1 - abs(pts[i, 0] - ecx) / span)
        w = 0.45 * center_w + 0.55 * lateralness
        if pts[i, 1] < ecy: dst[i, 1] += base * 0.40 * w
        else:               dst[i, 1] -= base * 0.14 * w

    mid_x = cx
    max_side = max(1e-6, np.max(np.abs(pts[brows, 0] - mid_x)))
    for i in brows:
        if sel[i]:
            side_w = np.clip(abs(pts[i, 0] - mid_x) / max_side, 0.0, 1.0)
            bw = 0.18 + 0.82 * side_w
            dst[i, 1] += base * 0.24 * bw
            dst[i, 0] += sign * lateral_px * 0.07 * bw

    for i in CHIN_REGION:
        if sel[i]:
            dst[i, 1] += base * 0.18
            dst[i, 0] += sign * lateral_px * 0.11

    return dst

def simulate(img_bgr, side="left", severity=0.58, lateral=0.05):
    if img_bgr is None:
        return None
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    pts = landmarks_from_image_rgb(rgb)
    if pts is None:
        return img_bgr
    dst_pts = compute_droop(pts, side, severity, lateral)
    region = sorted(set(LIPS_REGION + LEFT_EYE + RIGHT_EYE + LEFT_BROW + RIGHT_BROW + STABLE_ANCHORS + CHIN_REGION))
    tris = triangulate_region(pts, region)
    if tris.size == 0:
        return img_bgr
    mask = convex_mask_from_indices(img_bgr.shape[:2], pts, region, feather_px=35)
    result = piecewise_warp(img_bgr, pts, dst_pts, tris, mask)
    result = cv2.bilateralFilter(result, d=4, sigmaColor=40, sigmaSpace=40)
    return result

def _place_on_bg(bg_bgr: np.ndarray, img_rgb: np.ndarray, box: dict, scale=0.93):
    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    ih, iw = img_bgr.shape[:2]
    aspect_img = iw / ih
    aspect_box = box["w"] / box["h"]
    if aspect_img > aspect_box:
        new_w = int(ih * aspect_box)
        x0 = (iw - new_w) // 2
        img_bgr = img_bgr[:, x0 : x0 + new_w]
    else:
        pad = int(((iw / aspect_box) - ih) / 2)
        if pad > 0:
            img_bgr = cv2.copyMakeBorder(img_bgr, pad, pad, 0, 0, cv2.BORDER_CONSTANT, value=[0, 0, 0])
    new_w = int(box["w"] * scale)
    new_h = int(box["h"] * scale)
    resized = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
    x_offset = box["x"] + (box["w"] - new_w) // 2
    y_offset = box["y"] + (box["h"] - new_h) // 2
    bg_bgr[y_offset : y_offset + new_h, x_offset : x_offset + new_w] = resized

def generate_report(original_img_rgb, simulated_img_rgb):
    bg_bgr = _ensure_bg_loaded()  # will raise if not present
    # Boxes match your app.py layout at 2100x1500
    frame_boxes = {
        "left":  {"x": 300,  "y": 325, "w": 690, "h": 890},
        "right": {"x": 1115, "y": 325, "w": 690, "h": 890},
    }
    _place_on_bg(bg_bgr, original_img_rgb,  frame_boxes["left"],  scale=0.93)
    _place_on_bg(bg_bgr, simulated_img_rgb, frame_boxes["right"], scale=0.93)
    return cv2.cvtColor(bg_bgr, cv2.COLOR_BGR2RGB)

def to_base64_png(img_rgb):
    bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode(".png", bgr)
    if not ok:
        raise RuntimeError("PNG encode failed")
    return base64.b64encode(buf.tobytes()).decode("ascii")

# ---------------- FastAPI ----------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

@app.get("/health", response_class=PlainTextResponse)
def health():
    try:
        _ = _ensure_bg_loaded()
        return "ok"
    except Exception as e:
        return f"bg-error: {e}"

@app.post("/simulate")
async def simulate_api(
    file: UploadFile = File(...),
    side: str = Query("right"),
    severity: float = Query(0.62),
    lateral: float = Query(0.06),
):
    try:
        data = await file.read()
        arr = np.frombuffer(data, np.uint8)
        img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            raise HTTPException(400, "Cannot decode image")

        # Will raise if bg missing — fail fast so client knows to fix file
        _ = _ensure_bg_loaded()

        sim_bgr = simulate(img_bgr, side=side, severity=severity, lateral=lateral)
        sim_rgb = cv2.cvtColor(sim_bgr, cv2.COLOR_BGR2RGB)
        orig_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        report_rgb = generate_report(orig_rgb, sim_rgb)
        return JSONResponse({"image_base64": to_base64_png(report_rgb)})

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e)) from e

if __name__ == "__main__":
    # 0.0.0.0 so your phone can reach it on LAN
    uvicorn.run(app, host="0.0.0.0", port=7865)
