// Frame times of the ride dashboard (workout running) and of one game at quality "low", software renderer (SwiftShader).
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/glass-perf.mjs [--runs=3] [--sec=10] [--label=after] [--out=file.json]
// Both scenes are measured with requestAnimationFrame intervals (mean, p95) and the main-thread busy time per frame;
// the median of the runs is reported. Run it on two checkouts (before/after) and compare: the game must not regress by more than 10 %.
import { chromium } from '@playwright/test';
import { startServer } from './static-server.mjs';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2); const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const RUNS = Number(opt('runs', 3)); const SEC = Number(opt('sec', 10)); const LABEL = opt('label', 'run'); const OUT = opt('out', '');
const { server, url } = await startServer(0);
const exe = process.env.PW_CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

const seed = () => { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('ftp', '200'); localStorage.setItem('lang', 'en'); localStorage.setItem('gameQuality', 'low'); };
const measure = (SEC) => new Promise((resolve) => {
  const dts = []; let last = performance.now(); const t0 = last; let long = 0;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) long += e.duration; }).observe({ entryTypes: ['longtask'] }); } catch { /* */ }
  const tick = (now) => { dts.push(now - last); last = now; if (now - t0 < SEC * 1000) requestAnimationFrame(tick); else {
    const a = dts.slice(2); const avg = a.reduce((x, y) => x + y, 0) / a.length; const s = [...a].sort((x, y) => x - y);
    resolve({ frames: a.length, msFrame: +avg.toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), fps: +(1000 / avg).toFixed(1), longTaskMs: Math.round(long) }); } };
  requestAnimationFrame(tick);
});

async function dashboard() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(seed);
  await page.addInitScript({ path: new URL('../tests/fake-ble.js', import.meta.url).pathname });
  await page.goto(`${url}/index.html`);
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await page.waitForTimeout(400);
  await page.locator('#openWorkouts').click(); await page.locator('[data-wk]').nth(2).click(); await page.waitForTimeout(500);
  if (await page.locator('#startStop').isVisible()) await page.locator('#startStop').click();
  await page.waitForTimeout(2500);
  const r = await timed(page);
  await ctx.close(); return r;
}
async function homeScroll() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(seed);
  await page.addInitScript(() => localStorage.setItem('rideHistory', JSON.stringify([{ t: Date.now() - 864e5, dur: 1800, km: 15, avgW: 150, kj: 270, best: {} }])));
  await page.addInitScript({ path: new URL('../tests/fake-ble.js', import.meta.url).pathname });
  await page.goto(`${url}/index.html`);
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await page.waitForTimeout(800);
  await page.locator('#openSettings').click(); await page.waitForTimeout(600); // the long settings sheet: scrolls over the blurred header/backdrop
  const sc = () => page.evaluate(() => new Promise((res) => { const el = document.querySelector('#settingsSheet .sheet-body'); let d = 1; const t0 = performance.now(); const f = (n) => { if (el) { el.scrollTop += d * 14; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) d = -1; if (el.scrollTop <= 0) d = 1; } if (n - t0 < 1e4) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }));
  const cdp = await page.context().newCDPSession(page);
  const c0 = await cpu(); const mp = page.evaluate(measure, SEC); const sp = sc(); const r = await mp; await sp; const c1 = await cpu();
  await ctx.close(); return { ...r, taskMsPerFrame: 0, cpuMsPerSec: Math.round(((c1 - c0) * 1000) / SEC) };
}
async function game() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(seed);
  await page.addInitScript({ path: new URL('../tests/fake-ble.js', import.meta.url).pathname });
  await page.goto(`${url}/index.html`);
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await page.click('#openGame'); await page.click('[data-game=horde]');
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 150000 });
  await page.evaluate(() => { const g = window.__game; g.menu.age = 1; g.menu.start(); });
  await page.waitForFunction(() => window.__game?.stripInfo?.(), null, { timeout: 150000 });
  await page.waitForTimeout(3000); // shader compilation and the first frames do not count
  const r = await timed(page);
  await ctx.close(); return r;
}
// CPU time of every browser process (renderer, GPU/raster, viz) during the window: the software renderer pays for blur and compositing there
let bcdp;
const cpu = async () => (await bcdp.send('SystemInfo.getProcessInfo')).processInfo.reduce((a, p) => a + p.cpuTime, 0);
async function timed(page) {
  const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
  const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const a = await get(); const c0 = await cpu(); const r = await page.evaluate(measure, SEC); const b = await get(); const c1 = await cpu();
  const per = (k) => +(((b[k] - a[k]) * 1000) / r.frames).toFixed(2);
  return { ...r, taskMsPerFrame: per('TaskDuration'), cpuMsPerSec: Math.round(((c1 - c0) * 1000) / SEC) };
}
bcdp = await browser.newBrowserCDPSession();
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const sum = (a) => ({ msFrame: median(a.map((x) => x.msFrame)), p95: median(a.map((x) => x.p95)), taskMsPerFrame: median(a.map((x) => x.taskMsPerFrame)), cpuMsPerSec: median(a.map((x) => x.cpuMsPerSec)) });
const out = { label: LABEL, sec: SEC, runs: RUNS, dashboard: [], scroll: [], game: [] };
for (let i = 0; i < RUNS; i++) { out.dashboard.push(await dashboard()); out.scroll.push(await homeScroll()); out.game.push(await game()); }
out.summary = { dashboard: sum(out.dashboard), scroll: sum(out.scroll), game: sum(out.game) };
console.log(JSON.stringify(out, null, 1));
if (OUT) writeFileSync(OUT, JSON.stringify(out, null, 1));
await browser.close(); server.close();
