// Immagini di ogni stato del collegamento dispositivi (docs/design/d1-connect.png). Uso:
//   PORT=4190 node tests/serve.mjs &   poi   PORT=4190 OUT=/percorso node scripts/d1-connect-shots.mjs
// Salva una immagine per stato in OUT; la contact sheet si compone con scripts/d1-connect-sheet.py.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const FAKE = fileURLToPath(new URL('../tests/fake-ble.js', import.meta.url));
const PORT = process.env.PORT || 4190; const OUT = process.env.OUT || './shots';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const base = `http://127.0.0.1:${PORT}/index.html`;

async function open({ w = 390, h = 780, ua, seed = {}, init, noBt = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, userAgent: ua, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript((s) => { localStorage.setItem('analytics', '0'); localStorage.setItem('lang', 'en'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('ftp', '200'); localStorage.setItem('ergW', '180'); localStorage.setItem('autoPause', '0'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, seed);
  if (noBt) await page.addInitScript(() => { delete Navigator.prototype.bluetooth; });
  else await page.addInitScript({ path: FAKE });
  if (init) await page.addInitScript(init);
  await page.goto(base); await page.waitForFunction(() => window.rfDevices);
  if (!noBt) await page.evaluate(() => { window.rfDevices.hub.backoffMs = [60000]; });
  return { page, ctx };
}
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }); };
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';
const next = (page, k) => page.evaluate((x) => { window.__fakeBle.next = x; }, k);
const connect = async (page) => { await page.click('#welcomeConnect'); await page.waitForFunction(() => document.getElementById('trainerStatus').textContent.includes('Van Rysel')); };

let c;
c = await open(); await shot(c.page, '01-first-run'); await c.ctx.close();
c = await open({ ua: IOS, noBt: true }); await c.page.click('#welcomeConnect'); await shot(c.page, '02-ios'); await c.ctx.close();
c = await open(); await c.page.evaluate(() => { navigator.bluetooth.getAvailability = async () => false; }); await c.page.click('#welcomeConnect'); await shot(c.page, '03-bluetooth-off'); await c.ctx.close();
c = await open(); await c.page.evaluate(() => { navigator.bluetooth.requestDevice = () => Promise.reject(Object.assign(new Error('Bluetooth permission has been blocked.'), { name: 'NotAllowedError' })); }); await c.page.click('#welcomeConnect'); await shot(c.page, '04-permission'); await c.ctx.close();
c = await open(); await c.page.evaluate(() => { window.__fakeBle.failConnect = 1; }); await c.page.click('#welcomeConnect'); await shot(c.page, '05-busy'); await c.ctx.close();
c = await open(); await next(c.page, 'weird'); await c.page.click('#welcomeConnect'); await shot(c.page, '06-unsupported-device'); await c.ctx.close();
c = await open(); await connect(c.page); await shot(c.page, '07-watts-suggest-controller'); 
await c.page.click('#suggestAdd'); await c.page.waitForFunction(() => document.getElementById('clickStatus').textContent.includes('Click')); await shot(c.page, '08-suggest-hr');
await next(c.page, 'hr'); await c.page.click('#suggestAdd'); await c.page.waitForFunction(() => document.getElementById('hrStatus').textContent.includes('HRM')); await c.page.evaluate(() => window.__fakeBle.setHr(128));
await c.page.click('#deviceBar'); await c.page.waitForTimeout(500); await shot(c.page, '09-devices-sheet'); await c.ctx.close();
c = await open({ seed: { devKnown: JSON.stringify([{ id: 'fake-trainer', name: 'Van Rysel D100 (finto)', roles: ['trainer'] }, { id: 'fake-hr', name: 'Fake HRM', roles: ['hr'] }]) }, init: () => { window.__fakeBle.known = [window.__fakeBle.make('trainer'), window.__fakeBle.make('hr')]; window.__fakeBle.connectDelay = 60000; } });
await shot(c.page, '10-reconnecting'); await c.ctx.close();
c = await open({ seed: { devKnown: JSON.stringify([{ id: 'fake-trainer', name: 'Van Rysel D100 (finto)', roles: ['trainer'] }, { id: 'fake-hr', name: 'Fake HRM', roles: ['hr'] }]) }, init: () => { window.__fakeBle.known = []; } });
await c.page.waitForTimeout(800); await shot(c.page, '11-reconnect-button'); await c.ctx.close();
c = await open(); await connect(c.page); await c.page.evaluate(() => document.getElementById('startStop').click()); await c.page.waitForTimeout(2500);
await c.page.evaluate(() => window.__fakeBle.disconnectTrainer()); await c.page.waitForTimeout(600); await shot(c.page, '12-dropout-banner');
await c.page.evaluate(() => { window.rfDevices.hub.entries[0].state = 'lost'; window.rfDevices.hub.dispatchEvent(new Event('change')); }); await shot(c.page, '13-lost-try-now'); await c.ctx.close();
c = await open(); await connect(c.page); await c.page.click('#deviceBar'); await c.page.click('[data-test]'); await c.page.waitForTimeout(1500); await shot(c.page, '14-test-resistance'); await c.ctx.close();
c = await open(); await next(c.page, 'cps-csc'); await c.page.click('#welcomeConnect'); await c.page.waitForTimeout(500); await c.page.click('#deviceBar'); await c.page.waitForTimeout(500);
await c.page.evaluate(() => document.querySelector('#sourcesGroup').scrollIntoView()); await shot(c.page, '15-power-meter-sources'); await c.ctx.close();
c = await open({ w: 360, h: 640 }); await connect(c.page); await next(c.page, 'click'); await c.page.click('#deviceBar'); await c.page.click('#addDevice'); await c.page.click('#devicesSheet .close');
await c.page.evaluate(() => window.__fakeBle.drop('click')); await c.page.waitForTimeout(600); await shot(c.page, '16-small-banner-suggest'); await c.ctx.close();
await browser.close();
console.log('ok');
