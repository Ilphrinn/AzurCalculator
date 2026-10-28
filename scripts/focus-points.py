# Writes data/focus.js: where the character's face is in each ship painting, so the modal and the
# cards can centre on her instead of on the image. Run by hand after adding paintings:
#   python3 -m venv .venv && .venv/bin/pip install "opencv-python-headless<5" numpy
#   .venv/bin/python scripts/focus-points.py
# OpenCV 5 dropped CascadeClassifier, hence the <5 pin.
import json
import os
import sys
import urllib.request

import cv2
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CASCADE_URL = "https://raw.githubusercontent.com/nagadomi/lbpcascade_animeface/master/lbpcascade_animeface.xml"

# Measured on the full set (2026-10-28): an icon found at 0.7 or more is the right spot every time
# checked; below it, tiny matches land on shoes or scenery. A face detected straight on a painting
# needs weight 2+ and the upper part of the silhouette, since the cascade also fires on turrets,
# gears and belts.
MATCH_MIN = 0.7
# At the bottom of the scale range the icon is a few pixels wide and correlates by chance (A2 at
# 0.76); the true small matches checked all scored 0.85+.
SMALL_ICON = 0.05
SMALL_MATCH_MIN = 0.85
PAINTING_FACE_MIN_WEIGHT = 2.0
FACE_MAX_DEPTH = 0.6
# Icons are portrait crops; wider ones are the painting itself scaled down (every retrofit icon).
WIDE_ICON = 0.8


def load_gray(path):
    src = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if src is None:
        return None, None
    img = src[:, :, :3].astype(np.float32)
    alpha = src[:, :, 3] if src.ndim == 3 and src.shape[2] == 4 else None
    if alpha is not None:
        a = alpha[:, :, None].astype(np.float32) / 255
        img = img * a + 128 * (1 - a)
    return cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_BGR2GRAY), alpha


def faces(cascade, gray):
    side = min(gray.shape)
    boxes, _, weights = cascade.detectMultiScale3(
        cv2.equalizeHist(gray), scaleFactor=1.05, minNeighbors=5,
        minSize=(max(24, side // 14),) * 2, outputRejectLevels=True)
    return [(*map(int, b), float(weights[i])) for i, b in enumerate(boxes)] if len(boxes) else []


def largest(found):
    return max(found, key=lambda f: f[2] * f[3]) if found else None


# The icon's position in the painting, by normalised cross-correlation over 48 icon widths from 4%
# to 95% of the painting's: in busy compositions the character is small.
def locate_icon(painting, icon):
    ph, pw = painting.shape
    th, tw = icon.shape
    k = 640.0 / pw
    scaled = cv2.resize(painting, (int(pw * k), int(ph * k)), interpolation=cv2.INTER_AREA)
    best = (-1.0, None)
    for frac in np.geomspace(0.04, 0.95, 48):
        w = int(scaled.shape[1] * frac)
        h = int(w * th / tw)
        if h >= scaled.shape[0] or w < 12:
            continue
        result = cv2.matchTemplate(scaled, cv2.resize(icon, (w, h), interpolation=cv2.INTER_AREA), cv2.TM_CCOEFF_NORMED)
        _, score, _, loc = cv2.minMaxLoc(result)
        if score > best[0]:
            best = (score, (loc[0] / k, loc[1] / k, w / k, h / k))
    return best


def painting_focus(cascade, name):
    painting, alpha = load_gray(os.path.join(ROOT, "assets/paintings", name))
    ph, pw = painting.shape
    icon_path = os.path.join(ROOT, "assets/thumbnails", name)
    icon, _ = load_gray(icon_path) if os.path.exists(icon_path) else (None, None)
    if icon is not None and icon.shape[1] / icon.shape[0] <= WIDE_ICON:
        score, rect = locate_icon(painting, icon)
        if score >= (SMALL_MATCH_MIN if rect[2] / pw < SMALL_ICON else MATCH_MIN):
            x, y, w, h = rect
            face = largest(faces(cascade, icon))
            if face:
                th, tw = icon.shape
                fx, fy, fw, fh, _ = face
                return "icon", ((x + (fx + fw / 2) / tw * w) / pw, (y + (fy + fh / 2) / th * h) / ph, fh / th * h / ph)
            return "icon", ((x + w / 2) / pw, (y + h * 0.3) / ph, h * 0.3 / ph)
    face = largest(faces(cascade, painting))
    if face and face[4] >= PAINTING_FACE_MIN_WEIGHT:
        fx, fy, fw, fh, _ = face
        cy = fy + fh / 2
        if alpha is not None:
            ys = np.nonzero((alpha > 32).any(axis=1))[0]
            top, bottom = (ys.min(), ys.max()) if len(ys) else (0, ph)
            if (cy - top) / max(1, bottom - top) > FACE_MAX_DEPTH:
                return None, None
        return "face", ((fx + fw / 2) / pw, cy / ph, fh / ph)
    return None, None


def main():
    cascade_path = os.path.join(ROOT, ".venv", "lbpcascade_animeface.xml")
    if not os.path.exists(cascade_path):
        os.makedirs(os.path.dirname(cascade_path), exist_ok=True)
        urllib.request.urlretrieve(CASCADE_URL, cascade_path)
    cascade = cv2.CascadeClassifier(cascade_path)

    focus = {}
    sources = {"icon": 0, "face": 0, None: 0}
    for name in sorted(os.listdir(os.path.join(ROOT, "assets/paintings"))):
        source, point = painting_focus(cascade, name)
        sources[source] += 1
        if not point:
            continue
        rounded = [round(v, 3) for v in point]
        focus[f"assets/paintings/{name}"] = rounded
        icon_path = os.path.join(ROOT, "assets/thumbnails", name)
        if os.path.exists(icon_path):
            ih, iw = cv2.imread(icon_path, cv2.IMREAD_UNCHANGED).shape[:2]
            if iw / ih > WIDE_ICON:
                focus[f"assets/thumbnails/{name}"] = rounded

    target = os.path.join(ROOT, "data", "focus.js")
    with open(target, "w", encoding="utf-8") as out:
        out.write("const FOCUS_DATA = " + json.dumps(focus, indent=2) + ";\n")
    print(f"{len(focus)} focus points: {sources['icon']} from the icon, {sources['face']} from a face, {sources[None]} paintings left as they are.", file=sys.stderr)


main()
