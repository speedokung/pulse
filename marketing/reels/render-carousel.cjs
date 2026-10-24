// node render-carousel.cjs carousels/<name>.json out/<name>/   -> 01.jpg … (1080x1350 JPEG, what Instagram's API accepts)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [specPath, outDir] = process.argv.slice(2);
  const deck = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  await p.addInitScript((d) => { window.DECK = d; }, deck);
  await p.goto('file://' + path.join(__dirname, 'carousel.html')); await p.evaluate(() => window.ready);
  const n = await p.evaluate(() => window.COUNT);
  for (let i = 0; i < n; i++) { await p.evaluate((i) => window.show(i), i); await p.screenshot({ path: path.join(outDir, String(i + 1).padStart(2, '0') + '.jpg'), type: 'jpeg', quality: 90 }); }
  await b.close(); console.log(`done ${outDir} · ${n} slides`);
})();
