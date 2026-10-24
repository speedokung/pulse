#!/usr/bin/env python3
"""Adds a Thai voice-over and background music to a rendered Reel.

  python3 voice.py r01-bad-story            # out/r01-bad-story.mp4 -> out/r01-bad-story-vo.mp4

Reads clips/<name>.json:
  "voice": "th-TH-PremwadeeNeural"          (or th-TH-NiwatNeural)
  "vo":    [[0.15, "จองสนามไว้แล้ว เพื่อนเทอีกแล้ว", 2.8], ...]   start s, text, max seconds
  "music": {"file": "carefree", "from": 0}   music/<file>.mp3 (Kevin MacLeod, CC BY 4.0 — credit in the caption)

Voice: Microsoft Edge neural TTS (edge-tts, free). A line that runs longer than its slot is re-spoken faster.
Mix: ambient footage sound low, music ducked under the voice, whole thing normalised to -14 LUFS (Reels loudness).
"""
import asyncio, hashlib, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
# queue.py in this folder would shadow the standard library's queue module that edge-tts needs
sys.path[:] = [p for p in sys.path if os.path.abspath(p or ".") != HERE]
CA = "/root/.ccr/ca-bundle.crt"          # the cloud workspace's proxy CA; not needed elsewhere
if os.path.exists(CA):
    import certifi
    certifi.where = lambda: CA
import edge_tts

def credit(music_file):
    title = json.load(open(os.path.join(HERE, "music", "credits.json")))[music_file]
    return f"เพลง: “{title}” Kevin MacLeod (incompetech.com) CC BY 4.0"

def dur(p):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).decode())

def say(text, voice, slot):
    os.makedirs(os.path.join(HERE, "cache", "vo"), exist_ok=True)
    for rate in (5, 15, 25, 35):
        key = hashlib.md5(f"{voice}|{rate}|{text}".encode()).hexdigest()[:10]
        out = os.path.join(HERE, "cache", "vo", key + ".mp3")
        if not os.path.exists(out) or os.path.getsize(out) == 0:
            for attempt in range(3):
                try:
                    asyncio.run(edge_tts.Communicate(text, voice, rate=f"+{rate}%").save(out)); break
                except edge_tts.exceptions.NoAudioReceived:
                    pass   # the service occasionally returns nothing for a phrase; retry, then ask for a rewording
            else:
                if os.path.exists(out): os.remove(out)
                sys.exit(f"no audio for '{text}' ({voice}) — reword this line")
        trimmed = out[:-4] + ".wav"   # cut the silence edge-tts leaves around each phrase
        if not os.path.exists(trimmed):
            edge = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", out, "-af", f"{edge},areverse,{edge},areverse", "-ar", "48000", trimmed], check=True)
        out = trimmed
        d = dur(out)
        if d <= slot: return out, d
    print(f"  ! '{text}' is {d:.1f}s for a {slot:.1f}s slot", file=sys.stderr)
    return out, d

def main(name):
    spec = json.load(open(os.path.join(HERE, "clips", name + ".json")))
    src = os.path.join(HERE, "out", name + ".mp4")
    out = os.path.join(HERE, "out", name + "-vo.mp4")
    total = dur(src)
    voice = spec.get("voice", "th-TH-PremwadeeNeural")
    lines = [(t, *say(text, voice, slot)) for t, text, slot in spec.get("vo", [])]
    music = spec.get("music") or {}

    args = ["ffmpeg", "-v", "error", "-y", "-i", src]
    f, mix = [], []
    f.append("[0:a]volume=0.22[amb]"); mix.append("[amb]")
    for i, (t, path, _) in enumerate(lines):
        args += ["-i", path]
        ms = int(t * 1000)
        f.append(f"[{i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms},apad=whole_dur={total}[v{i}]")
    if lines:
        f.append("".join(f"[v{i}]" for i in range(len(lines))) + f"amix=inputs={len(lines)}:normalize=0,volume=1.6,asplit=2[vo][key]")
    if music:
        args += ["-ss", str(music.get("from", 0)), "-t", str(total), "-i", os.path.join(HERE, "music", music["file"] + ".mp3")]
        m = len(lines) + 1
        f.append(f"[{m}:a]aresample=48000,volume={music.get('vol', 0.32)},afade=t=in:d=0.4,afade=t=out:st={total - 1.4}:d=1.4[mus]")
        if lines:
            f.append("[mus][key]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=450[duck]"); mix.append("[duck]")
        else:
            mix.append("[mus]")
    if lines: mix.append("[vo]")
    f.append("".join(mix) + f"amix=inputs={len(mix)}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]")
    args += ["-filter_complex", ";".join(f), "-map", "0:v", "-map", "[a]", "-c:v", "copy",
             "-c:a", "aac", "-ar", "48000", "-b:a", "160k", "-t", str(total), "-movflags", "+faststart", out]
    subprocess.run(args, check=True)
    for t, p, d in lines: print(f"  {t:5.2f}s +{d:.1f}s")
    print(out)
    if music: print(credit(music["file"]))

if __name__ == "__main__":
    for n in sys.argv[1:]: main(n)
