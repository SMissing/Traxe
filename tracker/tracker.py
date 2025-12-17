import time
import numpy as np
import cv2
import sys

import pyrealsense2 as rs
from screeninfo import get_monitors

# ----------------------------
# CONFIG YOU WILL TUNE
# ----------------------------

PROJECTOR_MONITOR_INDEX = 0

STABLE_SECONDS = 0.5

MIN_DEPTH_M = 0.4
MAX_DEPTH_M = 4.0

DEPTH_DELTA_M = 0.08
MAX_STABLE_MOVE_PX = 8

CIRCLE_RADIUS = 35

ROI = None  # (x, y, w, h) if you want later

# Target square on the projector (ratio of the smaller screen dimension)
TARGET_SIZE_RATIO = 0.75  # 75% of min(screen_w, screen_h)

# Marker lifetime on screen
MARKER_LIFETIME_S = 3.0

# Miss flash time
MISS_FLASH_S = 0.6


# ----------------------------
# Helper: projector geometry
# ----------------------------
monitors = get_monitors()
if PROJECTOR_MONITOR_INDEX >= len(monitors):
    raise RuntimeError(
        f"Projector monitor index {PROJECTOR_MONITOR_INDEX} not found. Detected: {len(monitors)} monitors."
    )

proj = monitors[PROJECTOR_MONITOR_INDEX]
PROJ_X, PROJ_Y = proj.x, proj.y
PROJ_W, PROJ_H = proj.width, proj.height
print(f"Projector monitor: {proj}")


# ----------------------------
# RealSense setup
# ----------------------------
pipeline = rs.pipeline()
config = rs.config()
config.enable_stream(rs.stream.depth, 640, 480, rs.format.z16, 30)

try:
    profile = pipeline.start(config)
except RuntimeError as e:
    if "No device connected" in str(e):
        print("❌ No RealSense camera detected!")
        print("Please connect your Intel RealSense camera (D435/D455) and try again.")
        print("The system requires depth sensing capabilities for axe tracking.")
        exit(1)
    else:
        raise
depth_sensor = profile.get_device().first_depth_sensor()
depth_scale = depth_sensor.get_depth_scale()
print("Depth scale:", depth_scale)

# warm up
for _ in range(30):
    pipeline.wait_for_frames()


def capture_background():
    print("Capturing background... (keep the board empty for ~1s)")
    bg_frames = []
    t0 = time.time()
    while time.time() - t0 < 1.0:
        frames = pipeline.wait_for_frames()
        depth_frame = frames.get_depth_frame()
        depth = np.asanyarray(depth_frame.get_data()).astype(np.float32) * depth_scale
        bg_frames.append(depth)
    bg_local = np.median(np.stack(bg_frames, axis=0), axis=0)
    print("Background captured.")
    return bg_local


bg = capture_background()


# ----------------------------
# OpenCV fullscreen window
# ----------------------------
WIN = "TRAXE_POC"
cv2.namedWindow(WIN, cv2.WINDOW_NORMAL)
cv2.moveWindow(WIN, PROJ_X, PROJ_Y)
cv2.setWindowProperty(WIN, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)


# ----------------------------
# Target square definition (projector space)
# ----------------------------
def get_target_points_proj():
    s = int(min(PROJ_W, PROJ_H) * TARGET_SIZE_RATIO)
    cx, cy = PROJ_W // 2, PROJ_H // 2
    half = s // 2

    tl = (cx - half, cy - half)
    bl = (cx - half, cy + half)
    br = (cx + half, cy + half)
    tr = (cx + half, cy - half)
    c  = (cx, cy)

    return {
        "TL": tl, "BL": bl, "BR": br, "TR": tr, "C": c,
        "POLY": np.array([tl, bl, br, tr], dtype=np.int32)
    }


target_proj = get_target_points_proj()

# Calibration order you requested
CALIB_ORDER = [
    ("Top Left",     "TL"),
    ("Bottom Left",  "BL"),
    ("Bottom Right", "BR"),
    ("Top Right",    "TR"),
    ("Centre",       "C")
]

calib_index = 0
calib_cam_points = []   # list of (x,y) in camera pixel coords
calib_proj_points = []  # list of (x,y) in projector pixel coords
H = None                # homography cam->proj
calibrated = False

# Tracking state for stability
candidate_start = None
last_centroid = None

# Markers are stored in projector pixel coords after calibration
markers = []  # list of (px, py, birth_time, kind) where kind: "hit"|"miss"
last_miss_time = None


def draw_text(frame, text, y, scale=0.9, thickness=2):
    cv2.putText(frame, text, (30, y), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), thickness, cv2.LINE_AA)


def detect_stable_centroid(depth, bg_depth):
    """
    Returns:
        centroid (x,y) in camera pixel coords if a large stable blob exists (instantaneous centroid),
        plus mask_u8 for debugging if needed.
    """
    cam_h, cam_w = depth.shape

    if ROI is not None:
        rx, ry, rw, rh = ROI
        depth_roi = depth[ry:ry+rh, rx:rx+rw]
        bg_roi = bg_depth[ry:ry+rh, rx:rx+rw]
    else:
        rx, ry = 0, 0
        depth_roi = depth
        bg_roi = bg_depth

    valid = (depth_roi > MIN_DEPTH_M) & (depth_roi < MAX_DEPTH_M)
    closer = (bg_roi - depth_roi) > DEPTH_DELTA_M
    mask = valid & closer

    mask_u8 = (mask.astype(np.uint8) * 255)
    mask_u8 = cv2.medianBlur(mask_u8, 5)
    mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))

    contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    centroid = None
    if contours:
        c = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(c)
        if area > 300:
            M = cv2.moments(c)
            if M["m00"] != 0:
                cx = int(M["m10"] / M["m00"]) + rx
                cy = int(M["m01"] / M["m00"]) + ry
                centroid = (cx, cy)

    return centroid


def update_stability(centroid, now):
    """
    Uses global stability state.
    Returns: triggered (bool) -> "this is a stable stuck event"
    """
    global candidate_start, last_centroid

    if centroid is None:
        candidate_start = None
        last_centroid = None
        return False

    if last_centroid is None:
        last_centroid = centroid
        candidate_start = now
        return False

    dx = centroid[0] - last_centroid[0]
    dy = centroid[1] - last_centroid[1]
    dist = (dx*dx + dy*dy) ** 0.5

    if dist <= MAX_STABLE_MOVE_PX:
        if candidate_start is not None and (now - candidate_start) >= STABLE_SECONDS:
            # Trigger once, then lock out until it moves away
            candidate_start = None
            return True
        return False
    else:
        last_centroid = centroid
        candidate_start = now
        return False


def compute_homography():
    """
    Uses 5 points (corners + center). findHomography will do least-squares fit.
    """
    global H, calibrated
    src = np.array(calib_cam_points, dtype=np.float32)   # camera pixels
    dst = np.array(calib_proj_points, dtype=np.float32)  # projector pixels
    H, status = cv2.findHomography(src, dst, method=0)
    calibrated = H is not None
    print("Homography computed:", calibrated)
    if calibrated:
        print("H=\n", H)


def project_cam_to_proj(pt_cam):
    """
    Apply homography to a camera pixel point => projector pixel point.
    """
    if H is None:
        return None
    src = np.array([[pt_cam]], dtype=np.float32)  # shape (1,1,2)
    dst = cv2.perspectiveTransform(src, H)        # shape (1,1,2)
    x, y = dst[0, 0]
    return int(x), int(y)


def point_in_target(px, py):
    poly = target_proj["POLY"].astype(np.float32)
    # pointPolygonTest expects contour shape (N,1,2)
    contour = poly.reshape((-1, 1, 2))
    return cv2.pointPolygonTest(contour, (float(px), float(py)), measureDist=False) >= 0


try:
    while True:
        frames = pipeline.wait_for_frames()
        depth_frame = frames.get_depth_frame()
        if not depth_frame:
            continue

        depth = np.asanyarray(depth_frame.get_data()).astype(np.float32) * depth_scale
        now = time.time()

        centroid = detect_stable_centroid(depth, bg)
        stable_trigger = update_stability(centroid, now)

        # ---- Handle calibration confirm ----
        key = cv2.waitKey(1) & 0xFF

        if key == 27:  # ESC
            break

        if key in (ord('b'), ord('B')):
            bg = capture_background()

        if key in (ord('r'), ord('R')):
            calib_index = 0
            calib_cam_points.clear()
            calib_proj_points.clear()
            H = None
            calibrated = False
            markers.clear()
            print("Calibration reset.")

        # During calibration, SPACE confirms the current stable centroid
        if not calibrated and key == 32:  # SPACE
            if centroid is None:
                print("No centroid detected - put axe in position and ensure it is visible.")
            else:
                # Require it to be stable *right now* (you asked "press confirm when it's there")
                # We'll accept if it has stabilized at least once OR is currently stable.
                # Best UX: accept immediately if centroid exists.
                step_name, step_key = CALIB_ORDER[calib_index]
                cam_pt = centroid
                proj_pt = target_proj[step_key]

                calib_cam_points.append(cam_pt)
                calib_proj_points.append(proj_pt)

                print(f"Captured {step_name}: cam={cam_pt} -> proj={proj_pt}")

                calib_index += 1
                if calib_index >= len(CALIB_ORDER):
                    compute_homography()
                else:
                    print(f"Next: {CALIB_ORDER[calib_index][0]}")

        # ---- After calibration: when a stable stuck event triggers, place marker ----
        if calibrated and stable_trigger and centroid is not None:
            proj_pt = project_cam_to_proj(centroid)
            if proj_pt is not None:
                px, py = proj_pt
                if point_in_target(px, py):
                    markers.append((px, py, now, "hit"))
                else:
                    last_miss_time = now
                    markers.append((px, py, now, "miss"))

        # ---- Render frame ----
        frame = np.zeros((PROJ_H, PROJ_W, 3), dtype=np.uint8)

        # Draw 8x8 grid target (64 squares)
        poly = target_proj["POLY"]
        cv2.polylines(frame, [poly], isClosed=True, color=(80, 80, 80), thickness=3)

        # Get target bounds
        tl = target_proj["TL"]
        br = target_proj["BR"]
        target_width = br[0] - tl[0]
        target_height = br[1] - tl[1]

        # Draw 8x8 grid lines
        grid_size = 8
        for i in range(1, grid_size):
            # Vertical lines
            x = tl[0] + (i * target_width // grid_size)
            cv2.line(frame, (x, tl[1]), (x, br[1]), (60, 60, 60), 2)
            # Horizontal lines
            y = tl[1] + (i * target_height // grid_size)
            cv2.line(frame, (tl[0], y), (br[0], y), (60, 60, 60), 2)

        # Draw center dot
        center = target_proj["C"]
        cv2.circle(frame, center, 10, (80, 80, 80), -1)

        # Calibration UI
        if not calibrated:
            step_name, step_key = CALIB_ORDER[calib_index]
            guide_pt = target_proj[step_key]
            cv2.circle(frame, guide_pt, 14, (255, 255, 255), -1)
            cv2.circle(frame, guide_pt, 26, (255, 255, 255), 2)

            draw_text(frame, "TRAXE CALIBRATION", 50, scale=1.1, thickness=2)
            draw_text(frame, f"Step {calib_index+1}/5: Put axe at {step_name}", 95)
            draw_text(frame, "Press SPACE to confirm when it's in and stable", 135)
            draw_text(frame, "R = reset calibration   B = recapture background   ESC = quit", 175)

            # Status: do we currently see a centroid?
            if centroid is None:
                draw_text(frame, "Status: NO DETECTION", 225, scale=0.8, thickness=2)
            else:
                draw_text(frame, "Status: DETECTED (centroid found)", 225, scale=0.8, thickness=2)
        else:
            draw_text(frame, "CALIBRATED", 50, scale=1.1, thickness=2)
            draw_text(frame, "Throw axe - when it sticks for 0.5s a marker will appear", 95, scale=0.85)
            draw_text(frame, "R = recalibrate   B = recapture background   ESC = quit", 135, scale=0.85)

        # Miss flash overlay (subtle)
        if last_miss_time is not None and (now - last_miss_time) < MISS_FLASH_S:
            # very light flash by drawing a border
            cv2.rectangle(frame, (10, 10), (PROJ_W - 10, PROJ_H - 10), (255, 255, 255), 6)

        # Draw markers (fade out)
        new_markers = []
        for px, py, born, kind in markers:
            age = now - born
            if age < MARKER_LIFETIME_S:
                thickness = max(1, int(6 - age * 2))

                if kind == "hit":
                    cv2.circle(frame, (px, py), CIRCLE_RADIUS, (255, 255, 255), thickness)
                else:
                    # miss marker (X) at projected position (still useful debug)
                    size = 30
                    cv2.line(frame, (px - size, py - size), (px + size, py + size), (255, 255, 255), thickness)
                    cv2.line(frame, (px - size, py + size), (px + size, py - size), (255, 255, 255), thickness)

                new_markers.append((px, py, born, kind))
        markers = new_markers

        cv2.imshow(WIN, frame)

finally:
    pipeline.stop()
    cv2.destroyAllWindows()
