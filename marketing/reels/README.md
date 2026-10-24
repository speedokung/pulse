# Reels template

Each clip is a JSON script in `clips/`. `render.cjs` draws it frame by frame in Chromium and encodes a 1080×1920 H.264 MP4 ready for Instagram.

```bash
node capture.cjs screens http://localhost:4173/   # real app screens + tap positions (run the app with `npx vite preview` first)
python3 gen_ai.py clips/01-khad-2-khon.json        # optional: fill "ai" slots with Nano Banana images (add --video for Veo)
node render.cjs clips/01-khad-2-khon.json out/01.mp4
node render.cjs clips/01-khad-2-khon.json out/01.mp4 --stills 1,6,12   # quick preview frames
```

Scene types: `text` (kicker, big lines, highlight), `phone` (app screens in a phone frame, a tap before each change, a caption per step), `notify` (notification cards + a closing line), `end` (logo, line, url). Backgrounds: `{"paint":"court"|"dusk"}`, `{"image": …}` or `{"video": … .webm}` with a slow zoom. Words stay between y≈250 and y≈1480 so Instagram's buttons don't cover them.

`gen_ai.py` reads the Gemini key from `GEMINI_API_KEY` or `.gemini_key` (git-ignored). No music is baked in: add it in Instagram, so the track is licensed.
