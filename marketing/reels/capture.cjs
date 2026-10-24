// Captures real app screens (phone size, 3x) and where the taps land, for the phone-mockup scenes.
const { chromium, devices } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
(async () => {
  const out = process.argv[2] || 'screens';
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 3, colorScheme: 'dark', locale: 'th-TH',
    geolocation: { latitude: 13.7307, longitude: 100.5418 }, permissions: ['geolocation'] });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('pulse.installDismissed', 'true'); } catch {} });
  await p.goto(process.argv[3] || 'http://localhost:4173/'); await p.waitForTimeout(4000);
  await p.addStyleTag({ content: '.brand-sub{display:none!important} .maplibregl-ctrl-attrib{opacity:.5}' });
  const taps = {}; const SUB = +(process.argv[4] || 0);
  const box = async (sel) => { const r = await (await p.$(sel)).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  await p.screenshot({ path: `${out}/01-map.png` });
  taps.fab = await box('.fab');
  await p.click('.fab'); await p.waitForTimeout(900);
  await p.$eval('#f-title', (e) => e.blur());
  await p.screenshot({ path: `${out}/02-form.png` });
  taps.sub = await box(`.scrollrow .chip >> nth=${SUB}`);
  await p.click(`.scrollrow .chip >> nth=${SUB}`); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/03-form-sub.png` });
  taps.go = await box('.btns.sticky .go');
  await p.click('.btns.sticky .go'); await p.waitForTimeout(5000);
  await p.screenshot({ path: `${out}/04-live.png` });
  fs.writeFileSync(`${out}/taps.json`, JSON.stringify({ viewport: p.viewportSize(), taps }, null, 2));
  console.log(JSON.stringify(taps));
  await b.close();
})();
