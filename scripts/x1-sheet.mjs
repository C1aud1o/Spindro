// Contact sheet docs/design/x1-remote.png: mini window in three states, the extension popup, the Click-menu Remote section (desktop and narrow).
// Everything is rendered from the real code (mini-view.js + css/mini.css, the app with a FAKE extension and a FAKE Click, the real popup).
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/x1-sheet.mjs
import { chromium } from '@playwright/test';
import { startServer } from './static-server.mjs';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const exe = process.env.PW_CHROMIUM_PATH || undefined;
const { server, url } = await startServer(0);
const shots = {};
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const png = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

// --- mini window, three states ---
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 430 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/_mini.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/css/mini.css"></head><body></body></html>' }));
  await page.goto(`${url}/_mini.html`);
  const base = { remoteAvailable: true, power: 187, target: 190, pct: 95, workout: true, adjust: 'bias', step: 'Sweet spot 2/3', left: '4:12', next: 'Next: Recovery · 120 W', elapsed: '12:30', total: '45:00', progress: 0.28, cadence: '88', hr: '141', bias: '100%', paused: false, mode: 'spindro', last: '' };
  const states = {
    spindro: base,
    remote: { ...base, mode: 'remote', power: 192, last: 'Volume up' },
    paused: { ...base, workout: false, adjust: 'watts', step: '', left: '', next: '', total: '', progress: 0, elapsed: '23:05', target: 150, pct: 75, power: 0, cadence: '0', hr: '--', bias: '--', paused: true },
  };
  for (const [k, model] of Object.entries(states)) {
    await page.evaluate(async (m) => {
      document.body.innerHTML = '';
      const { buildMini } = await import('/js/mini-view.js'); const { t } = await import('/js/i18n.js');
      buildMini(document, t, () => {}).paint(m);
      await document.fonts.ready;
    }, model);
    await page.waitForTimeout(300);
    shots[`mini-${k}`] = await page.screenshot();
  }
  await ctx.close();
}

// --- Click menu with the Remote section, desktop and narrow (app + fake extension + fake Click v1) ---
async function menuShot(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, storageState: { cookies: [], origins: [{ origin: url, localStorage: [{ name: 'safetyAck', value: '1' }, { name: 'analytics', value: '0' }, { name: 'lang', value: 'en' }, { name: 'ftp', value: '200' }, { name: 'clickCheckSeen', value: 'v1,v2,play,ride' }] }] } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.addEventListener('message', (e) => {
      const d = e.data; if (e.source !== window || !d || d.ns !== 'spindro-remote' || d.from !== 'app') return;
      const reply = (m) => window.postMessage({ ns: 'spindro-remote', v: 1, from: 'ext', ...m }, location.origin);
      if (d.type === 'hello') reply({ type: 'hello', version: '0.1.0', strong: false, commands: [] });
    });
  });
  await page.addInitScript({ path: join(root, 'tests/fake-ble.js') });
  await page.goto(`${url}/index.html`);
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await page.evaluate(async () => { window.__fakeBle.clickProto = 'v1'; window.__fakeBle.next = 'click'; return window.rfDevices.add(); });
  await page.waitForTimeout(500);
  await page.locator('#openWorkouts').click(); await page.locator('[data-wk]').nth(2).click(); await page.waitForTimeout(600);
  await page.keyboard.press('r'); await page.waitForTimeout(200);
  await page.keyboard.press('m'); await page.waitForTimeout(500);
  // scroll the menu so that the Remote heading is at the top of the box
  await page.evaluate(() => { const h = document.querySelector('.cm-head'); h?.scrollIntoView({ block: 'start' }); });
  await page.waitForTimeout(300);
  const buf = await page.screenshot();
  await ctx.close();
  return buf;
}
shots['menu-desktop'] = await menuShot({ width: 1100, height: 760 });
shots['menu-narrow'] = await menuShot({ width: 390, height: 760 });

// --- popup of the extension (real popup page inside the loaded extension) ---
if (existsSync(join(root, 'extension/manifest.json'))) {
  const dir = mkdtempSync(join(tmpdir(), 'x1-popup-'));
  const ext = join(root, 'extension');
  const pctx = await chromium.launchPersistentContext(dir, { executablePath: exe, headless: false, viewport: { width: 380, height: 640 }, deviceScaleFactor: 2,
    args: ['--no-sandbox', '--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  try {
    let [sw] = pctx.serviceWorkers(); if (!sw) sw = await pctx.waitForEvent('serviceworker', { timeout: 15000 });
    const id = new URL(sw.url()).host;
    const demo = await pctx.newPage(); await demo.goto(`${url}/index.html`); // a Spindro tab (registers itself with the extension)
    await demo.waitForTimeout(500);
    await pctx.route('**/_video.html', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Demo video: 45 min endurance ride</title><video controls></video>' }));
    const vid = await pctx.newPage(); await vid.goto(`${url}/_video.html`); await vid.waitForTimeout(500); // the tab the rider is watching
    const popup = await pctx.newPage(); await popup.setViewportSize({ width: 380, height: 640 });
    await popup.goto(`chrome-extension://${id}/popup/popup.html`); await popup.waitForTimeout(800);
    shots.popup = await popup.screenshot({ fullPage: true });
  } catch (e) { console.log('popup shot skipped:', e.message); }
  await pctx.close();
}
await browser.close(); server.close();

// --- compose ---
const cap = (s) => `<figcaption>${s}</figcaption>`;
const fig = (k, label, h) => (shots[k] ? `<figure><img src="${png(shots[k])}" style="height:${h}px">${cap(label)}</figure>` : '');
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:28px;background:#0f0f0d;color:#f2f2ec;font:500 15px system-ui,sans-serif;width:1500px}
h1{font:700 30px system-ui;margin:0 0 4px;color:#d9ff3d}p{margin:0 0 22px;color:#9a9a8f}
h2{font:700 13px system-ui;letter-spacing:.14em;text-transform:uppercase;color:#d9ff3d;margin:26px 0 10px}
.row{display:flex;gap:22px;align-items:flex-start}figure{margin:0}img{display:block;border:1px solid #2a2a26;border-radius:10px}
figcaption{margin-top:8px;color:#9a9a8f;font-size:13px}</style>
<h1>X1 · Spindro mini window and Remote</h1><p>Rendered from the real code with a fake Click and a fake extension. Not a photo of real hardware, YouTube or Netflix.</p>
<h2>Mini window (360 × 430)</h2><div class="row">${fig('mini-spindro', 'Workout, Spindro mode', 430)}${fig('mini-remote', 'Remote mode, last command shown', 430)}${fig('mini-paused', 'Free ride, paused', 430)}${fig('popup', 'Extension popup', 430)}</div>
<h2>Click menu, Remote section</h2><div class="row">${fig('menu-desktop', 'Desktop (1100 px)', 560)}${fig('menu-narrow', 'Narrow (390 px)', 560)}</div>`;
const b2 = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const p2 = await b2.newPage({ viewport: { width: 1556, height: 900 }, deviceScaleFactor: 1 });
await p2.setContent(html); await p2.waitForTimeout(500);
writeFileSync(join(root, 'docs/design/x1-remote.png'), await p2.screenshot({ fullPage: true }));
await b2.close();
console.log('docs/design/x1-remote.png written');
