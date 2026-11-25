// Mini window (three states) and extension popup, rendered from the real code of one checkout. Used for the before/after sheet of U4.
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/u4-mini-shots.mjs --base=http://127.0.0.1:4173 --ext=/path/to/extension --out=/some/dir
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2); const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const BASE = opt('base', 'http://127.0.0.1:4173'); const EXT = opt('ext', new URL('../extension', import.meta.url).pathname); const OUT = opt('out', '/tmp/u4-mini');
mkdirSync(OUT, { recursive: true });
const exe = process.env.PW_CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 360, height: 430 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.route('**/_mini.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/css/mini.css"></head><body></body></html>' }));
await page.goto(`${BASE}/_mini.html`);
const base = { remoteAvailable: true, power: 187, target: 190, pct: 95, workout: true, adjust: 'bias', step: 'Sweet spot 2/3', left: '4:12', next: 'Next: Recovery · 120 W', elapsed: '12:30', total: '45:00', progress: 0.28, cadence: '88', hr: '142', bias: '100%', mode: 'spindro', paused: false, last: '' };
const states = { spindro: base, remote: { ...base, mode: 'remote', power: 192, last: 'Volume up' }, paused: { ...base, workout: false, adjust: 'watts', step: '', left: '', next: '', total: '', progress: 0, elapsed: '23:05', target: 150, pct: 75, power: 0, cadence: '0', hr: '--', bias: '--', paused: true } };
for (const [k, model] of Object.entries(states)) {
  await page.evaluate(async (m) => { document.body.innerHTML = ''; const { buildMini } = await import('/js/mini-view.js'); const { t } = await import('/js/i18n.js'); buildMini(document, t, () => {}).paint(m); await document.fonts.ready; }, model);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `mini-${k}.png`) });
}
await ctx.close();
if (existsSync(join(EXT, 'manifest.json'))) {
  const dir = mkdtempSync(join(tmpdir(), 'u4-popup-'));
  const pctx = await chromium.launchPersistentContext(dir, { executablePath: exe, headless: false, viewport: { width: 380, height: 640 }, deviceScaleFactor: 2,
    args: ['--no-sandbox', '--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  try {
    let [sw] = pctx.serviceWorkers(); if (!sw) sw = await pctx.waitForEvent('serviceworker', { timeout: 15000 });
    const id = new URL(sw.url()).host;
    const demo = await pctx.newPage(); await demo.goto(`${BASE}/index.html`); await demo.waitForTimeout(500);
    await pctx.route('**/_video.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Demo video: 45 min endurance ride</title><video controls></video>' }));
    const vid = await pctx.newPage(); await vid.goto(`${BASE}/_video.html`); await vid.waitForTimeout(500);
    const popup = await pctx.newPage(); await popup.setViewportSize({ width: 380, height: 640 });
    await popup.goto(`chrome-extension://${id}/popup/popup.html`); await popup.waitForTimeout(900);
    writeFileSync(join(OUT, 'popup.png'), await popup.screenshot({ fullPage: true }));
  } catch (e) { console.log('popup shot skipped:', e.message); }
  await pctx.close();
}
await browser.close();
console.log('done', OUT);
