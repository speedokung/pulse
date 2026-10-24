# แถว · Instagram content kit

Everything that makes and posts the Instagram content. Nothing here costs money.

## Make posts

```bash
cd marketing/reels
node render.cjs clips/r01-bad-story.json out/r01-bad-story.mp4            # a Reel (1080x1920, ~16 s, ambient sound)
node render.cjs clips/r01-bad-story.json out/r01.mp4 --stills 2,6,10      # quick preview frames
node render-carousel.cjs carousels/k01-what-is-thaew.json out/k01-what-is-thaew   # carousel slides (1080x1350 JPEG)
python3 queue.py ../../public/ig 2026-11-23T18:30:00+07:00=r01-bad-story   # add to the posting plan
```

- **Reel scripts** (`clips/*.json`): scenes of type `text` (kicker, big lines, caption pill, label), `phone` (app screens in a phone frame with taps), `notify`, `end`. A scene's background is `{"clip": "C1", "from": 4.0}` (footage, `footage/<id>.mp4`), `{"green": {"clip": "D2", "from": 0, "screens": [[0, "screens-tall/01-map.png"]]}}` (app screens keyed into the green phone), or a painted fallback. `"enter": "cut"` cuts instead of sliding.
- **Footage** (`footage/`, 720p copies of the Google Flow clips; originals on the Mac in Desktop/Work/Pulse/content). Usable seconds, judged frame by frame: A1 2.5–7.5 · A2 0.3–4.5 · A3 0–4 / 4.2–8 · A4 0–3.2 · A5 1.5–6 · B1 0.3–6 · B2 3.5–7.5 · B2b 0–3.5 · B3a 1.5–4.5 · B4 0–6 · B5 0.8–8 · C1 4–7.5 (not 0–3, the racket passes through his face) · C2 0–4.5 · C3 all · C4 all · C5 0–4.5 · C7 5.5–8 · C8 2–4.5 · D1 0.5–6.5 (green phone, handheld) · D2 0–6 (green phone, table) · D3 all · D4 3–8. B3b has a stray hand; C7/C8 players don't look Thai, use briefly.
- **App screens**: `node capture.cjs screens` / `node capture-tall.cjs screens-tall` with the app running (`npx vite preview` in the repo root). Add a sub-type index as the 4th argument (1 = football).

## Posting (automatic)

`public/ig/queue.json` is the plan; `thaew.com/ig/` shows it. The Worker's cron (`worker/instagram.ts`, every 20 min) posts each item once at or after its time, never two within 20 hours, and records what happened in Supabase (`ig_posts`). It needs `IG_USER_ID` and `IG_ACCESS_TOKEN` in Cloudflare; `IG_PAUSED=1` stops it. The same queue also goes to the Facebook Page (`worker/facebook.ts`: Reels via `video_reels`, carousels as one multi-photo post, "(ลิงก์ใน bio)" dropped from captions; optional `fb_caption` per item). It needs `FB_PAGE_ID` and `FB_PAGE_TOKEN`; `FB_PAUSED=1` stops it. Its rows in `ig_posts` are `fb:<id>`. Test both by hand: `POST /api/ig/tick?dry=1` with header `x-webhook-secret`. Reels are encoded with 48 kHz audio and 2 s keyframes (Facebook Reels spec).
