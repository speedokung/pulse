#!/usr/bin/env python3
"""Footage helpers for the Reel template.

  python3 prep.py cut   C1 4.0 3.5            -> cache/C1_4.0_3.5/0000.jpg… + audio.wav   (prints the folder)
  python3 prep.py green D2 0.0 6.0 '[[0,"screens-tall/01-map.png"],[3.2,"screens-tall/04-live.png"]]'
                                              -> the phone's green screen replaced by app screens, frame by frame

Frames are 1080x1920 JPEGs at 30 fps (the template shows them as an image sequence, which renders exactly).
"""
import json, os, subprocess, sys, hashlib
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
FPS = 30

def src(clip):
    p = os.path.join(HERE, "footage", clip + ".mp4")
    if not os.path.exists(p): sys.exit(f"no footage {clip}")
    return p

def cut(clip, start, dur, tag=None):
    out = os.path.join(HERE, "cache", tag or f"{clip}_{start}_{dur}")
    if os.path.exists(os.path.join(out, "done")): return out
    os.makedirs(out, exist_ok=True)
    vf = f"fps={FPS},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(dur), "-i", src(clip),
                    "-vf", vf, "-q:v", "3", "-start_number", "0", os.path.join(out, "%04d.jpg")], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(dur), "-i", src(clip),
                    "-vn", "-ac", "2", "-ar", "44100", os.path.join(out, "audio.wav")], check=False)
    open(os.path.join(out, "done"), "w").write(str(len([f for f in os.listdir(out) if f.endswith(".jpg")])))
    return out

def green(clip, start, dur, screens):
    """Replace a bright-green phone screen with app screenshots. screens = [[t, path], …] (t from the cut's start)."""
    key = hashlib.md5(json.dumps([clip, start, dur, screens]).encode()).hexdigest()[:8]
    out = cut(clip, start, dur, tag=f"{clip}_{start}_{dur}_g{key}")
    if os.path.exists(os.path.join(out, "keyed")): return out
    shots = [(t, Image.open(os.path.join(HERE, p)).convert("RGB")) for t, p in screens]
    frames = sorted(f for f in os.listdir(out) if f.endswith(".jpg"))
    for i, f in enumerate(frames):
        t = i / FPS
        shot = [s for (st, s) in shots if st <= t][-1] if any(st <= t for st, _ in shots) else shots[0][1]
        im = Image.open(os.path.join(out, f)).convert("RGB")
        a = np.asarray(im).astype(np.int16)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        m = (g > 120) & (g > r * 1.3) & (g > b * 1.3)
        if m.sum() < 5000: continue
        ys, xs = np.nonzero(m)
        # trim stray green: keep the dense middle of the screen
        x0, x1 = np.percentile(xs, [0.5, 99.5]).astype(int); y0, y1 = np.percentile(ys, [0.5, 99.5]).astype(int)
        w, h = x1 - x0 + 1, y1 - y0 + 1
        sw, sh = shot.size; sc = max(w / sw, h / sh)
        fit = shot.resize((int(sw * sc) + 1, int(sh * sc) + 1), Image.LANCZOS)
        fx, fy = (fit.width - w) // 2, 0   # keep the top of the app (status bar) in view
        fit = fit.crop((fx, fy, fx + w, fy + h))
        layer = Image.new("RGB", im.size); layer.paste(fit, (x0, y0))
        alpha = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
        comp = Image.composite(layer, im, alpha)
        # despill: pull leftover green fringes back to neutral near the screen
        c = np.asarray(comp).astype(np.int16)
        near = np.zeros(m.shape, bool); near[max(0, y0 - 25):y1 + 25, max(0, x0 - 25):x1 + 25] = True
        spill = near & (c[..., 1] > np.maximum(c[..., 0], c[..., 2]) + 30)
        c[..., 1][spill] = np.maximum(c[..., 0], c[..., 2])[spill] + 10
        Image.fromarray(np.clip(c, 0, 255).astype(np.uint8)).save(os.path.join(out, f), quality=92)
    open(os.path.join(out, "keyed"), "w").write("1")
    return out

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "cut": print(cut(sys.argv[2], float(sys.argv[3]), float(sys.argv[4])))
    elif cmd == "green": print(green(sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), json.loads(sys.argv[5])))
