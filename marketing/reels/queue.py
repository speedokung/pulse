#!/usr/bin/env python3
"""Add rendered posts to the website's Instagram queue (pulse/public/ig/queue.json).

  python3 queue.py ../../public/ig 2026-11-23T18:30:00+07:00=r09-something 2026-11-25T19:00:00+07:00=k05-something …

A name starting with "r" is a Reel (out/<name>.mp4 + clips/<name>.json for the caption);
anything else is a carousel (out/<name>/*.jpg + carousels/<name>.json). Media is copied and compressed
for the web; posts already in the queue are left as they are.
"""
import glob, json, os, shutil, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))

def main():
    pub = os.path.abspath(sys.argv[1]); qpath = os.path.join(pub, "queue.json")
    q = json.load(open(qpath)) if os.path.exists(qpath) else {"posts": []}
    have = {p["id"] for p in q["posts"]}
    for arg in sys.argv[2:]:
        when, name = arg.split("=", 1)
        if name in have: print("already queued", name); continue
        if name.startswith("r"):
            src = os.path.join(HERE, "out", name + ".mp4")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-maxrate", "4M", "-bufsize", "8M",
                            "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", os.path.join(pub, name + ".mp4")], check=True)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "1.6", "-i", src, "-frames:v", "1", "-q:v", "3", os.path.join(pub, name + "-cover.jpg")], check=True)
            cap = json.load(open(os.path.join(HERE, "clips", name + ".json")))["caption"]
            q["posts"].append({"id": name, "type": "reel", "publish_at": when, "caption": cap, "video": f"ig/{name}.mp4", "cover": f"ig/{name}-cover.jpg"})
        else:
            os.makedirs(os.path.join(pub, name), exist_ok=True); imgs = []
            for f in sorted(glob.glob(os.path.join(HERE, "out", name, "*.jpg"))):
                dst = os.path.join(pub, name, os.path.basename(f)); Image.open(f).save(dst, quality=84, optimize=True)
                imgs.append(f"ig/{name}/{os.path.basename(f)}")
            cap = json.load(open(os.path.join(HERE, "carousels", name + ".json")))["caption"]
            q["posts"].append({"id": name, "type": "carousel", "publish_at": when, "caption": cap, "images": imgs})
        print("queued", name, when)
    q["posts"].sort(key=lambda p: p["publish_at"])
    json.dump(q, open(qpath, "w"), ensure_ascii=False, indent=2)

if __name__ == "__main__": main()
