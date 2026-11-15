// Foto delle scene con i modelli Meshy di Turbo Pedali (rullo finto). Salva in docs/giochi-shots/meshy-<scena>-<WxH>.png
//   node tests/serve.mjs &   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/meshy-shots.mjs [--out=cartella] [--only=salita,arrivo]
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const FAKE_BLE = fileURLToPath(new URL('../tests/fake-ble.js', import.meta.url));
const args = process.argv.slice(2);
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6) || fileURLToPath(new URL('../docs/giochi-shots/', import.meta.url));
const only = args.find((a) => a.startsWith('--only='))?.slice(7)?.split(',');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const SIZES = [[390, 780], [1280, 720]];
mkdirSync(OUT, { recursive: true });
// scena: tappa, oggetto (chiave di meshyPlan) e quanti metri prima dell'oggetto si mette il giocatore; oppure un punto speciale
const SCENES = [
  { name: 'salita', stage: 1, plan: 'mHut', i: 1, back: 38 },
  { name: 'cipressi', stage: 2, plan: 'mCypress', i: 0, back: 26 },
  { name: 'fienili', stage: 2, plan: 'mHay', i: 3, back: 30 },
  { name: 'paese', stage: 0, plan: 'mChurch', i: 1, back: 44 },
  { name: 'ristoro', stage: 0, plan: 'mFeed', i: 0, back: 26 },
  { name: 'arrivo', stage: 1, at: 'finish' },
  { name: 'ammiraglia', stage: 1, at: 'finishCam' },
  { name: 'podio', stage: 1, at: 'results' },
].filter((s) => !only || only.includes(s.name));

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
for (const [w, h] of SIZES) for (const sc of SCENES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 300)); });
  await page.addInitScript((st) => { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('mass', '75'); localStorage.setItem('lang', 'it'); localStorage.setItem('gameQuality', 'high'); localStorage.setItem('racer3dStage', String(st)); }, sc.stage);
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto(`${BASE}/index.html`);
  await page.click('#connectTrainer');
  await page.waitForFunction(() => /FTMS/.test(document.querySelector('#trainerStatus')?.textContent || ''));
  await page.evaluate(() => window.__fakeBle.setPower(240));
  await page.click('#openGame'); await page.click('[data-game=racer]');
  await page.waitForFunction(() => window.__game?.state === 'select', null, { timeout: 60000 });
  await page.evaluate(() => { window.__game.selT = 1; window.__game.input(1); });
  await page.waitForFunction(() => window.__game.state === 'race', null, { timeout: 90000 });
  const info = await page.evaluate((sc) => {
    const g = window.__game; let s = 20;
    if (sc.plan) { const l = g.meshyPlan[sc.plan]; s = l[Math.min(sc.i, l.length - 1)].d - sc.back; }
    if (sc.at) s = g.length - (sc.name === 'arrivo' ? 38 : 14);
    g.s = s; g.x = 0; g.lane = 1; g.camInit = false;
    g.rivals.forEach((r, i) => { r.s = s + [9, 14, 20, -9, 27, 33, -14][i]; r.speed = 9; r.x = [0, -2.4, 2.4, 0, 2.4, -2.4, 0][i]; r.targetX = r.x; });
    g.state = 'race'; g.stateT = 5; g.time.slow = 0; g.raceT = 200; g.standing = g.ranking();
    return { s, len: g.length, n: Object.fromEntries(Object.entries(g.meshyPlan).map(([k, v]) => [k, v.length])) };
  }, sc);
  if (sc.at === 'finishCam' || sc.at === 'results') {
    await page.evaluate(() => { window.__fakeBle.setPower(400); const g = window.__game; g.s = g.length - 6; });
    await page.waitForFunction(() => window.__game.state === 'finishCam', null, { timeout: 90000 });
    if (sc.at === 'results') { await page.waitForFunction(() => window.__game.state === 'results', null, { timeout: 90000 }); await page.waitForTimeout(2600); }
    else await page.waitForTimeout(1200);
  } else await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/meshy-${sc.name}-${w}x${h}.png` });
  console.log(`✓ ${sc.name} ${w}x${h}`, sc.name === 'salita' ? JSON.stringify(info.n) : '', errors.length ? 'ERRORI: ' + errors.join(' | ') : '');
  await ctx.close();
}
await browser.close();
