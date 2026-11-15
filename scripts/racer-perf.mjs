// Prestazioni di Breakaway: tempo medio per fotogramma con la CPU rallentata 4× (qualità media), a gara avviata.
//   node tests/serve.mjs &
//   node scripts/racer-perf.mjs [--sec=20] [--throttle=4] [--quality=medium]
// Attenzione: nel cloud il disegno è software (SwiftShader, nessuna GPU), quindi i numeri sono molto peggiori di un telefono.
// Si riporta anche il tempo di JavaScript per fotogramma (aggiornamento + preparazione della scena), che non dipende dalla GPU.
import { chromium } from '@playwright/test';
const args = process.argv.slice(2); const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const SEC = Number(opt('sec', 20)); const THR = Number(opt('throttle', 4)); const Q = opt('quality', 'medium');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' })).newPage();
await page.addInitScript((Q) => { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('lang', 'it'); localStorage.setItem('gameQuality', Q); }, Q);
await page.goto(`${BASE}/index.html`);
await page.click('#openGame'); await page.click('[data-game=racer]');
await page.waitForFunction(() => window.__game?.state === 'select', null, { timeout: 150000 });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR });
await page.evaluate(() => { const g = window.__game; g.hooks = { ...g.hooks, connected: () => true, stats: () => ({ power: 190, cadence: 88, gear: 12 }), ftp: () => 200, setGrade() {} }; g.selT = 1; g.input(1); });
await page.waitForFunction(() => window.__game.state === 'race', null, { timeout: 150000 });
// strumenti: tempo speso in update+draw (JavaScript) e intervallo fra i fotogrammi veri
const res = await page.evaluate(async (SEC) => {
  const g = window.__game; const js = []; const dts = []; let last = performance.now(); const t0 = last;
  const ou = g.update.bind(g); const od = g.draw.bind(g); const oh = g.drawHud.bind(g); let acc = 0;
  g.update = (...a) => { const t = performance.now(); ou(...a); acc += performance.now() - t; };
  g.draw = (...a) => { const t = performance.now(); od(...a); acc += performance.now() - t; };
  g.drawHud = (...a) => { const t = performance.now(); oh(...a); acc += performance.now() - t; };
  await new Promise((resolve) => { const tick = (now) => { dts.push(now - last); last = now; js.push(acc); acc = 0; if (now - t0 < SEC * 1000) requestAnimationFrame(tick); else resolve(); }; requestAnimationFrame(tick); });
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length; const sorted = [...dts].sort((a, b) => a - b);
  return { frames: dts.length, msFrame: avg(dts), p95: sorted[Math.floor(sorted.length * 0.95)], msJs: avg(js.slice(1)), quality: g.quality?.level ?? null, fps: 1000 / avg(dts) };
}, SEC);
console.log(JSON.stringify({ throttle: THR, quality: Q, ...res }));
await browser.close();
