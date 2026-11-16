#!/usr/bin/env node
// Screenshots of the CURRENT app for the showcase site, README and blog. Re-runnable: run it again whenever the UI changes.
//   node scripts/site-shots.mjs                      all screens, en + it
//   SHOT_ONLY=home,ride SHOT_LANG=en node scripts/site-shots.mjs
//   SHOT_OUT=/some/dir node scripts/site-shots.mjs   write somewhere else (default site/assets/shots)
// Only fake devices (tests/fake-ble.js) are used: a simulated FTMS trainer connected, at realistic values. Phone viewport 390x780,
// device pixel ratio 2, WebP under 120 KB each (quality is lowered until it fits). Needs ImageMagick (`convert`) and Chromium
// (PW_CHROMIUM_PATH, default /opt/pw-browsers/chromium if present).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = (() => { for (const n of ['playwright', '@playwright/test']) { try { return require(n); } catch { /* next */ } } throw new Error('Playwright not found: run npm ci'); })();
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(process.env.SHOT_OUT || join(ROOT, 'site/assets/shots'));
const PORT = Number(process.env.SHOT_PORT) || 4192;
const BASE = `http://127.0.0.1:${PORT}`;
const LANGS = (process.env.SHOT_LANG || 'en,it').split(',');
const CHROMIUM = process.env.PW_CHROMIUM_PATH || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const MAX_BYTES = 120 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = mkdtempSync(join(tmpdir(), 'spindro-site-'));
mkdirSync(OUT, { recursive: true });

// ---- deterministic sample data (no personal data) ----
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function makeRide(rand, mins, base, blocks) {
  const p = []; const hr = []; const total = mins * 60;
  for (let s = 0; s < total; s++) {
    let target = base;
    if (s < 300) target = base * (0.55 + 0.45 * (s / 300)); else if (s > total - 240) target = base * 0.6;
    else for (const b of blocks) if (s - 300 >= b.at * 60 && s - 300 < (b.at + b.len) * 60) target = b.w;
    const w = Math.max(0, Math.round(target + (rand() - 0.5) * 22 + Math.sin(s / 17) * 6));
    p.push(w); hr.push(Math.round(96 + (w / 220) * 62 + (rand() - 0.5) * 4));
  }
  return { p, hr };
}
function todayRide() {
  const { p, hr } = makeRide(rng(99), 28, 168, [{ at: 4, len: 3, w: 262 }, { at: 12, len: 7, w: 232 }]);
  const log = p.map((w, i) => ({ t: Date.now() - (p.length - i) * 1000, power: w, cadence: 80 + Math.round(Math.sin(i / 30) * 7), hr: hr[i], speed: +(7 + (w / 220) * 2.6).toFixed(3), distance: 0 }));
  let d = 0; log.forEach((x) => { d += x.speed; x.distance = +d.toFixed(1); });
  const sum = p.reduce((a, b) => a + b, 0);
  return { elapsed: p.length, distance: d, energy: sum / 1000, powerSum: sum, samples: p.length, log, saved: false, stravaUrl: null, historySaved: false };
}
function history() {
  const rand = rng(7); const out = [];
  [[49, 30, 122], [44, 40, 126], [40, 45, 128], [34, 38, 132], [30, 50, 136], [27, 32, 138], [22, 45, 140], [18, 50, 142], [13, 36, 146], [8, 45, 150], [4, 52, 152], [2, 38, 154]].forEach(([ago, mins, base], i) => {
    const { p, hr } = makeRide(rand, mins, base, [{ at: 6, len: 10, w: base + 55 }]);
    const avg = Math.round(p.reduce((a, b) => a + b, 0) / p.length);
    const best = {}; for (const dd of [5, 60, 300, 1200]) { if (p.length < dd) continue; let s = p.slice(0, dd).reduce((a, b) => a + b, 0); let m = s; for (let k = dd; k < p.length; k++) { s += p[k] - p[k - dd]; if (s > m) m = s; } best[dd] = Math.round(m / dd); }
    const series = []; for (let k = 0; k < p.length; k += 10) { const c = p.slice(k, k + 10); series.push(Math.round(c.reduce((a, b) => a + b, 0) / c.length)); }
    const d = new Date(Date.now() - ago * 864e5); d.setHours(i % 2 ? 18 : 7, 10 + i * 7, 0, 0);
    out.push({ t: d.getTime(), dur: mins * 60, km: +(avg / 220 * 31 * mins / 60).toFixed(1), avgW: avg, kj: Math.round(avg * mins * 60 / 1000), np: avg + 8, maxW: Math.max(...p), best, maxHr: Math.max(...hr), avgHr: Math.round(hr.reduce((a, b) => a + b, 0) / hr.length), series });
  });
  return out;
}
const HISTORY = history();
const seed = (lang, extra = {}) => ({
  lang, analytics: '0', safetyAck: '1', autoPause: '0', ftp: '220', mass: '72', hrMax: '188', weekGoal: '150', gameQuality: 'high', mode: 'erg',
  rideHistory: JSON.stringify(HISTORY), seenTrainers: JSON.stringify(['Van Rysel D100']), ...extra,
});

// ---- server and pages ----
function startServer() {
  const child = spawn(process.execPath, [join(ROOT, 'tests/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((ok, ko) => { child.stdout.on('data', (d) => { if (/(Server di test|Test server at)/.test(String(d))) ok(child); }); child.on('exit', (c) => ko(new Error(`server exited ${c}`))); setTimeout(() => ko(new Error('server did not start')), 8000); });
}
async function newPage(browser, lang, { extra = {}, size = { width: 390, height: 780 }, keepClickCheck = false } = {}) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: lang, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  // guard: a Content-Security-Policy violation or a texture that did not load makes models render white or black: fail the shot
  page.violations = [];
  page.on('console', (m) => { const t = m.text(); if (/Content[- ]Security[- ]Policy|Refused to|Couldn't load texture|Could not load texture|THREE\.GLTFLoader: Couldn't/i.test(t)) page.violations.push(t.slice(0, 200)); });
  await page.addInitScript((s) => { try { if (localStorage.getItem('__shots')) return; localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); localStorage.setItem('__shots', '1'); } catch { /* no storage */ } }, seed(lang, extra));
  await page.addInitScript({ path: join(ROOT, 'tests/fake-ble.js') });
  await page.addInitScript((keep) => {
    if (keep) try { localStorage.removeItem('clickCheckSeen'); } catch { /* no storage */ }
    // the fake trainer presents itself with a plain model name, without the "(finto)" suffix
    const orig = navigator.bluetooth.requestDevice.bind(navigator.bluetooth);
    navigator.bluetooth.requestDevice = async (o) => { const d = await orig(o); if (/finto/.test(d.name)) Object.defineProperty(d, 'name', { value: 'Van Rysel D100' }); else if (/Fake HRM/.test(d.name)) Object.defineProperty(d, 'name', { value: 'Heart rate strap' }); return d; };
  }, keepClickCheck);
  await page.goto(`${BASE}/index.html`);
  await page.waitForFunction(() => document.getElementById('startStop')?.textContent.trim().length > 0);
  await sleep(500);
  return page;
}
const connectTrainer = async (page) => {
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await page.waitForFunction(() => /FTMS/.test(document.getElementById('trainerStatus')?.textContent || ''));
  await sleep(300);
};
const ride = (page, w, cad, kmh) => page.evaluate(([w, c, s]) => { __fakeBle.state.cadence = c; __fakeBle.state.speed = s; __fakeBle.setPower(w); }, [w, cad, kmh]);

// ---- saving: PNG -> WebP under the size limit ----
function save(png, name, lang, { resize = null } = {}) {
  const dest = join(OUT, `${name}-${lang}.webp`);
  for (const q of [88, 82, 76, 70, 64, 58, 52, 46]) {
    const args = [png, ...(resize ? ['-resize', resize] : []), '-quality', String(q), '-define', 'webp:method=6', dest];
    if (spawnSync('convert', args).status) throw new Error('ImageMagick convert failed');
    if (statSync(dest).size <= MAX_BYTES) { console.log(`  ${name}-${lang}.webp  ${Math.round(statSync(dest).size / 1024)} KB (q${q})`); return; }
  }
  throw new Error(`${name}-${lang}.webp does not fit in 120 KB`);
}

// ---- screens ----
const openSheet = async (page, id) => { await page.evaluate((i) => document.getElementById(i).click(), id); await sleep(900); };
const connectedPage = async (browser, lang, opts) => { const page = await newPage(browser, lang, opts); await connectTrainer(page); return page; };
const SCREENS = {
  // the home: ERG-first "Today" card, trainer connected, a steady 130 W ride waiting for Start
  async home(browser, lang) {
    const page = await connectedPage(browser, lang); await ride(page, 128, 84, 29.4); await sleep(2600);
    await page.evaluate(() => window.scrollTo(0, 0)); return page;
  },
  // the ride cockpit: a free ride in ERG, running
  async ride(browser, lang) {
    const page = await connectedPage(browser, lang, { extra: { 'ride-freedom-session': JSON.stringify(sessionSoFar(14 * 60)) } });
    await ride(page, 132, 86, 30.1);
    await page.evaluate(() => document.getElementById('startStop').click()); await sleep(500);
    await page.evaluate(() => { for (let i = 0; i < 2; i++) document.getElementById('up').click(); });
    await ride(page, 139, 87, 30.8); await sleep(3600); return page;
  },
  // a structured workout running (sweet spot), with the profile and the current step
  async workout(browser, lang) {
    const page = await connectedPage(browser, lang); await ride(page, 188, 88, 33);
    await openSheet(page, 'chooseWorkout'); await page.evaluate(() => document.querySelector('[data-wk="sweet"]').click()); await sleep(1500);
    await ride(page, 196, 89, 34); await sleep(3600); return page;
  },
  async workouts(browser, lang) {
    const page = await newPage(browser, lang); await openSheet(page, 'openWorkouts');
    await page.evaluate(() => { const b = document.querySelector('#workoutSheet .sheet-body'); b.scrollTop = document.querySelector('.wk-h3').offsetTop - 12; }); await sleep(500); return page;
  },
  async devices(browser, lang) {
    const page = await connectedPage(browser, lang); await page.evaluate(() => { __fakeBle.next = 'hr'; return window.rfDevices.add(); }); await sleep(600);
    await page.evaluate(() => __fakeBle.setHr(124)); await ride(page, 130, 84, 29); await sleep(500);
    await page.evaluate(() => document.getElementById('deviceBar').click()); await sleep(900); await page.evaluate(() => document.querySelectorAll('.toast').forEach((x) => x.remove())); return page;
  },
  // the key check, opened by a controller's first connection (the fake Click v2 = a Zwift Click)
  async keycheck(browser, lang) {
    const page = await newPage(browser, lang, { keepClickCheck: true });
    await page.evaluate(() => { __fakeBle.next = 'click'; return window.rfDevices.add(); }); await sleep(1500);
    await page.evaluate(() => __fakeBle.press(1)); await sleep(150); return page;
  },
  async finish(browser, lang) {
    const page = await newPage(browser, lang, { extra: { 'ride-freedom-session': JSON.stringify(todayRide()) } });
    await page.evaluate(() => document.getElementById('finishRide').click()); await sleep(4200); return page;
  },
  async history(browser, lang) { const page = await newPage(browser, lang); await openSheet(page, 'openHistory'); await sleep(500); return page; },
};

function sessionSoFar(sec) {
  const { p, hr } = makeRide(rng(21), 20, 140, []);
  const log = p.slice(0, sec).map((w, i) => ({ t: Date.now() - (sec - i) * 1000, power: w, cadence: 85, hr: hr[i], speed: 8.3, distance: +(i * 8.3).toFixed(1) }));
  const sum = log.reduce((a, b) => a + b.power, 0);
  return { elapsed: sec, distance: sec * 8.3, energy: sum / 1000, powerSum: sum, samples: log.length, log, saved: false, stravaUrl: null, historySaved: false };
}


// ---- games: one portrait phone shot of each, taken mid-action. Game time is stepped by hand (1/30 s) because the software
// renderer in a container runs at a few fps; the real loop is stopped with active=false (same approach as the old site/shots.mjs).
// Some games extend Base3D (sense/step/view), the others have their own update(dt): use whichever exists.
const TICK = 'if (typeof g.sense === "function" && typeof g.step === "function" && typeof g.view === "function") { g.t += dt; g.sense(dt); g.msgs.update(dt); g.stateT += dt; if (g.state === "play") g.step(dt); g.view(dt); } else g.update(dt, dt);';
const run = (page, sec, pre = '') => page.evaluate(([sec, pre, TICK]) => { const g = window.__game; const dt = 1 / 30; const f = new Function('g', 'dt', `${pre}\n${TICK}`); for (let i = 0; i < sec * 30; i++) f(g, dt); }, [sec, pre, TICK]);
const sim = (page, sec) => run(page, sec);
const frame = (page) => page.evaluate(() => { const g = window.__game; g.msgs?.clear?.(); if (g.hooks?.progress) g.hooks.progress.toasts.length = 0; g.stage.render(); if (g.drawHud) g.drawHud(1 / 30); });
// Every game is a workout: it plays itself while the (fake) rider holds a steady, realistic effort. Per game: how long to
// play (game seconds) and an optional hand on the keys (only +1 / −1 are ever passed to input()).
const startGame = async (page) => {
  await run(page, 0.8);
  await page.evaluate(() => { const g = window.__game; if (g.menu?.start) { g.menu.age = 1; g.menu.start(); } else { g.stateT = 1; g.input(1); } });
};
const T = (d) => Number(process.env.SHOT_T) || d; // SHOT_T=<seconds> overrides the play time, to look for a good moment
const GAMES = {
  racer: { card: 'racer', async scene(page) {
    await startGame(page);
    for (let i = 0; i < 40 && (await page.evaluate(() => window.__game.state)) !== 'race'; i++) await run(page, 0.5);
    await run(page, 150);
  } },
  horde: { card: 'horde', async scene(page) { await startGame(page); await run(page, T(52)); } },
  gruppetto: { card: 'gruppetto', async scene(page) { await startGame(page); await run(page, T(135)); } },
  planata: { card: 'planata', async scene(page) { await startGame(page); await run(page, T(135)); } },
  mattoni: { card: 'mattoni', async scene(page) { await startGame(page); await run(page, T(135)); } },
  strike: { card: 'shooter', async scene(page) { await startGame(page); await run(page, T(135)); } },
  menu: { card: 'racer', async scene(page) { await run(page, 2.5); } },
};
for (const [id, G] of Object.entries(GAMES)) {
  SCREENS[id === 'menu' ? 'gamemenu' : `game-${id}`] = async (browser, lang) => {
    const page = await connectedPage(browser, lang, { extra: G.extra || {} });
    await ride(page, 252, 90, 32); await page.evaluate(() => { document.getElementById('openGame').click(); }); await sleep(500);
    await page.evaluate((c) => document.querySelector(`[data-game="${c}"]`).click(), G.card);
    await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120000 });
    await page.evaluate(() => { window.__game.active = false; });
    await G.scene(page); await frame(page); return page;
  };
}

const only = process.env.SHOT_ONLY ? process.env.SHOT_ONLY.split(',') : Object.keys(SCREENS);
const server = await startServer();
const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
let failed = 0;
try {
  for (const lang of LANGS) for (const name of only) {
    let page;
    try {
      page = await SCREENS[name](browser, lang);
      await page.evaluate(() => document.getElementById('toast')?.classList.remove('show')); await sleep(400); // no transient toasts in a screenshot
      const png = join(tmp, `${name}-${lang}.png`);
      await page.screenshot({ path: png });
      if (page.violations.length) throw new Error(`CSP / texture problems while shooting: ${[...new Set(page.violations)].join(' | ')}`);
      if (page.errors.length) console.warn(`  ! ${name}/${lang} JS errors: ${page.errors.join(' | ')}`);
      save(png, name, lang);
    } catch (e) { failed++; console.error(`ERR ${name}/${lang}: ${e.message}`); } finally { await page?.context().close(); }
  }
} finally { await browser.close(); server.kill(); rmSync(tmp, { recursive: true, force: true }); }
process.exit(failed ? 1 : 0);
