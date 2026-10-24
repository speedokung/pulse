#!/usr/bin/env python3
"""Fill a Reel script's AI slots: python3 gen_ai.py clips/01-khad-2-khon.json [--video]

For each scene with an "ai" prompt and no image/video yet, asks Gemini for a 9:16 picture
(Nano Banana) or, with --video, a short clip (Veo), saves it in assets/, and points the scene at it.
Reads the key from GEMINI_API_KEY or the file .gemini_key next to this script (never commit that file).
"""
import base64, json, os, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://generativelanguage.googleapis.com/v1beta"
IMAGE_MODEL = "gemini-2.5-flash-image"
VIDEO_MODEL = "veo-3.0-fast-generate-001"

def key():
    k = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    p = os.path.join(HERE, ".gemini_key")
    if not k and os.path.exists(p): k = open(p).read().strip()
    if not k: sys.exit("No Gemini API key: set GEMINI_API_KEY or put it in reels/.gemini_key")
    return k

def call(url, body=None, k=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json", "x-goog-api-key": k})
    try:
        with urllib.request.urlopen(req, timeout=300) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Gemini error {e.code}: {e.read().decode()[:300]}")

def image(prompt, out, k):
    r = call(f"{API}/models/{IMAGE_MODEL}:generateContent", {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "9:16"}}}, k)
    for part in r["candidates"][0]["content"]["parts"]:
        if "inlineData" in part:
            open(out, "wb").write(base64.b64decode(part["inlineData"]["data"])); return out
    sys.exit("No image came back (the prompt may have been refused): " + json.dumps(r)[:300])

def video(prompt, out, k):
    op = call(f"{API}/models/{VIDEO_MODEL}:predictLongRunning",
              {"instances": [{"prompt": prompt}], "parameters": {"aspectRatio": "9:16"}}, k)
    while not op.get("done"):
        time.sleep(10); op = call(f"{API}/{op['name']}", None, k)
    uri = op["response"]["generateVideoResponse"]["generatedSamples"][0]["video"]["uri"]
    req = urllib.request.Request(uri, headers={"x-goog-api-key": k})
    with urllib.request.urlopen(req, timeout=300) as r: open(out + ".mp4", "wb").write(r.read())
    # Chromium (used to render) can't decode H.264, so keep a VP9 copy for the template
    os.system(f'ffmpeg -v error -y -i "{out}.mp4" -an -c:v libvpx-vp9 -b:v 0 -crf 32 "{out}.webm"')
    return out + ".webm"

def main():
    spec_path = sys.argv[1]; want_video = "--video" in sys.argv
    spec = json.load(open(spec_path)); k = key(); name = os.path.splitext(os.path.basename(spec_path))[0]
    os.makedirs(os.path.join(HERE, "assets"), exist_ok=True)
    for i, s in enumerate(spec["scenes"]):
        ai, bg = s.get("ai"), s.setdefault("bg", {})
        if not ai or bg.get("image") or bg.get("video"): continue
        base = os.path.join("assets", f"{name}-s{i}")
        if want_video or ai.get("kind") == "video":
            print(f"scene {i}: video…"); bg["video"] = os.path.relpath(video(ai["prompt"], os.path.join(HERE, base), k), HERE)
        else:
            print(f"scene {i}: image…"); bg["image"] = os.path.relpath(image(ai["prompt"], os.path.join(HERE, base + ".png"), k), HERE)
    json.dump(spec, open(spec_path, "w"), ensure_ascii=False, indent=2)
    print("updated", spec_path)

if __name__ == "__main__": main()
