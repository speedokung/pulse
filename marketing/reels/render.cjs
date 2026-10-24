// node render.cjs clips/<name>.json out/<name>.mp4 [--stills 1.5,6,12]
// Renders a Reel script frame by frame in Chromium and encodes it with ffmpeg (H.264, 1080x1920, IG-ready).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const [specPath, outPath] = process.argv.slice(2);
  const stillsArg = process.argv.indexOf('--stills');
  const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(',').map(Number) : null;
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const tapsFile = path.join(__dirname, spec.screens, 'taps.json');
  if (fs.existsSync(tapsFile)) Object.assign(spec, JSON.parse(fs.readFileSync(tapsFile, 'utf8')));
  const fps = spec.fps || 30;
  // footage: cut (or key) each scene's clip into a 30 fps frame folder, and remember its audio
  const { execFileSync } = require('child_process');
  const audio = []; let at = 0;
  for (const sc of spec.scenes) {
    const b = sc.bg || {};
    if (b.clip || b.green) {
      const g = b.green;
      const args = g ? ['green', g.clip, String(g.from), String(sc.dur + 0.1), JSON.stringify(g.screens)] : ['cut', b.clip, String(b.from || 0), String(sc.dur + 0.1)];
      const dir = execFileSync('python3', [path.join(__dirname, 'prep.py'), ...args]).toString().trim();
      b.frames = dir; b.count = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).length; sc.bg = b;
      if (b.kenburns === undefined) b.kenburns = 0.04;
      if (fs.existsSync(path.join(dir, 'audio.wav')) && b.sound !== false) audio.push({ file: path.join(dir, 'audio.wav'), at, dur: sc.dur, vol: b.volume ?? 0.55 });
    }
    at += sc.dur;
  }
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.addInitScript((s) => { window.SPEC = s; }, spec);
  await p.goto('file://' + path.join(__dirname, 'template.html'));
  await p.evaluate(() => window.ready);
  const dur = await p.evaluate(() => window.DURATION);
  if (stills) {
    for (const t of stills) { await p.evaluate((t) => window.frame(t), t); await p.screenshot({ path: outPath.replace(/\.mp4$/, `-${t}s.jpg`), type: 'jpeg', quality: 85 }); }
    await b.close(); console.log('stills done'); return;
  }
  const n = Math.round(dur * fps);
  // ambient sound from the footage, each piece placed at its scene's start with short fades
  const aIn = [], aF = [];
  audio.forEach((a, k) => { aIn.push('-i', a.file); aF.push(`[${k + 2}:a]atrim=0:${a.dur},afade=t=in:d=0.15,afade=t=out:st=${Math.max(0, a.dur - 0.25)}:d=0.25,volume=${a.vol},adelay=${Math.round(a.at * 1000)}|${Math.round(a.at * 1000)}[a${k}]`); });
  const mix = audio.length ? ['-filter_complex', `${aF.join(';')};[1:a]${audio.map((_, k) => `[a${k}]`).join('')}amix=inputs=${audio.length + 1}:normalize=0:duration=first[aout]`, '-map', '0:v', '-map', '[aout]'] : ['-map', '0:v', '-map', '1:a'];
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', ...aIn, ...mix,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
    '-c:a', 'aac', '-ar', '48000', '-b:a', '128k', '-t', String(dur), outPath], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.frame(t), i / fps);
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`frame ${i}/${n}\n`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await b.close();
  console.log(`done ${outPath} · ${dur.toFixed(1)} s · ${n} frames · ${((Date.now() - t0) / 1000).toFixed(0)} s to render`);
})();
