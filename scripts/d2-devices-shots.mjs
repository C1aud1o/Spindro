// Immagini del pannello Dispositivi, prima e dopo (docs/design/d2-devices.png). Uso:
//   git worktree add /tmp/before beta          # la versione "prima"
//   (cd /tmp/before && PORT=4191 node tests/serve.mjs &)   PORT=4192 node tests/serve.mjs &
//   TAG=before PORT=4191 OUT=/tmp/d2 node scripts/d2-devices-shots.mjs ; TAG=after PORT=4192 OUT=/tmp/d2 node scripts/d2-devices-shots.mjs
//   python3 scripts/d2-devices-sheet.py /tmp/d2 docs/design/d2-devices.png
// Sei stati x telefono (390x660) e scrivania (1280x720). I dispositivi sono quelli finti di tests/fake-ble.js.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const FAKE = fileURLToPath(new URL('../tests/fake-ble.js', import.meta.url));
const PORT = process.env.PORT || 4192; const OUT = process.env.OUT || './shots'; const TAG = process.env.TAG || 'after';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const base = `http://127.0.0.1:${PORT}/index.html`;
const KNOWN = JSON.stringify([{ id: 'fake-trainer', name: 'Van Rysel D100 (finto)', roles: ['trainer'] }, { id: 'fake-hr', name: 'Fake HRM', roles: ['hr'] }]);
const SIZES = { phone: { width: 390, height: 660 }, desktop: { width: 1280, height: 720 } };

async function open(size, { seed = {}, init } = {}) {
  const ctx = await browser.newContext({ viewport: SIZES[size], deviceScaleFactor: size === 'phone' ? 2 : 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript((s) => { localStorage.setItem('analytics', '0'); localStorage.setItem('lang', 'en'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('ftp', '200'); localStorage.setItem('ergW', '180'); localStorage.setItem('autoPause', '0'); localStorage.setItem('reduceGlass', '0'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed);
  await page.addInitScript({ path: FAKE });
  await page.addInitScript(() => { localStorage.setItem('clickCheckSeen', 'click,play,ride'); });
  if (init) await page.addInitScript(init);
  await page.goto(base); await page.waitForFunction(() => window.rfDevices);
  await page.evaluate(() => { window.rfDevices.hub.backoffMs = [60000]; });
  return { page, ctx };
}
const add = async (page, kind) => { await page.evaluate((k) => { window.__fakeBle.next = k; }, kind); await page.evaluate(() => window.rfDevices.add()); };
const panel = async (page) => { await page.click('#deviceBar'); await page.waitForTimeout(500); };
const shot = async (page, size, name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${TAG}-${size}-${name}.png` }); };
const advanced = async (page) => { // dopo: si apre la sezione; prima: non c'era, si scende in fondo al pannello (le fonti)
  if (await page.locator('#devAdvanced').count()) await page.click('#devAdvanced > summary');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const b = document.querySelector('#devicesSheet .sheet-body'); b.scrollTop = b.scrollHeight; });
};

for (const size of Object.keys(SIZES)) {
  let c = await open(size); await panel(c.page); await shot(c.page, size, '1-empty'); await c.ctx.close();
  c = await open(size); await add(c.page, 'trainer'); await panel(c.page); await shot(c.page, size, '2-trainer'); await c.ctx.close();
  c = await open(size); await add(c.page, 'trainer'); await add(c.page, 'hr'); await add(c.page, 'click'); await c.page.evaluate(() => window.__fakeBle.setHr(128)); await panel(c.page); await shot(c.page, size, '3-trainer-hr-click');
  await advanced(c.page); await shot(c.page, size, '6-advanced-open'); await c.ctx.close();
  c = await open(size, { seed: { devKnown: KNOWN }, init: () => { window.__fakeBle.known = [window.__fakeBle.make('trainer'), window.__fakeBle.make('hr')]; window.__fakeBle.failConnect = 1000; } });
  await panel(c.page); await shot(c.page, size, '4-searching'); await c.ctx.close();
  c = await open(size, { seed: { devKnown: KNOWN }, init: () => { window.__fakeBle.known = []; } });
  await c.page.waitForTimeout(1500); await panel(c.page); await shot(c.page, size, '5-needs-a-tap'); await c.ctx.close();
}
await browser.close();
console.log('ok', TAG);
