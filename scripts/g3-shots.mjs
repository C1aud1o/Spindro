#!/usr/bin/env node
// Frames of the games (and the video ride) for the contact sheets in docs/design (g3-*.png), recorded with Playwright and the
// simulated trainer (tests/fake-ble.js). Game time is stepped by hand (1/30 s) like scripts/light-shots.mjs.
//   node scripts/g3-shots.mjs <outdir> [games] [options]
//     games      comma list, default shooter,horde,gruppetto,racer,planata,mattoni (add `video` with --wk)
//     --size WxH viewport, default 390x844 (phone); 1280x720 = desktop
//     --wk       start the first workout of the app first and open the game on top of it (the strip is fed by the workout)
//     --skip N   with --wk: skip N workout steps before opening the game (default 2, so the frame is in an effort)
//     --at S     seconds of game time before the frame (default 25)
//     --quality  low | medium | high (default low)
//     --tag T    file name suffix
// Output: <outdir>/<game>-<wk|plan>-<WxH>.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['--wk'].includes(argv[i - 1])));
const OUT = resolve(pos[0] || 'g3-out'); mkdirSync(OUT, { recursive: true });
const GAMES = (pos[1] || 'shooter,horde,gruppetto,racer,planata,mattoni').split(',');
const [VW, VH] = String(opt('size', '390x844')).split('x').map(Number);
const WK = flag('wk'); const SKIP = Number(opt('skip', 2)); const AT = Number(opt('at', 25)); const Q = opt('quality', 'low'); const TAG = opt('tag', '');
const PORT = Number(process.env.SHOT_PORT || 4520);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [join(ROOT, 'tests/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await sleep(1000);
const TICK = 'if (typeof g.sense === "function" && typeof g.step === "function" && typeof g.view === "function") { g.t += dt; g.sense(dt); g.msgs.update(dt); g.stateT += dt; if (g.state === "play") g.step(dt); g.view(dt); } else g.update(dt, dt);';
const run = (page, sec) => page.evaluate(([sec, TICK]) => { const g = window.__game; const dt = 1 / 30; const f = new Function('g', 'dt', TICK); for (let i = 0; i < sec * 30; i++) f(g, dt); }, [sec, TICK]);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
for (const game of GAMES) {
  if (game === 'video' && !WK) continue;
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: VW < 600, hasTouch: VW < 600, locale: 'en', serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', (e) => console.warn(game, 'pageerror', e.message));
  await page.addInitScript((q) => { localStorage.clear(); Object.entries({ analytics: '0', safetyAck: '1', ftp: '220', lang: 'en', gameQuality: q, gameGlow: '1' }).forEach(([k, v]) => localStorage.setItem(k, v)); }, Q);
  await page.addInitScript({ path: join(ROOT, 'tests/fake-ble.js') });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await page.waitForFunction(() => /FTMS/.test(document.getElementById('trainerStatus')?.textContent || ''));
  await page.evaluate(() => { __fakeBle.state.cadence = 90; __fakeBle.state.speed = 32; __fakeBle.setPower(215); });
  if (WK) {
    await page.click('#openWorkouts'); await page.locator('#workoutList [data-wk]').first().click();
    await page.waitForSelector('#workoutCard:not([hidden])');
    for (let i = 0; i < SKIP; i++) { await page.click('#wkSkip'); await sleep(150); }
    await page.evaluate(() => document.getElementById('rideGames').click());
  } else await page.evaluate(() => document.getElementById('openGame').click());
  await sleep(500);
  await page.evaluate((c) => document.querySelector(`[data-game="${c}"]`).click(), game);
  if (game === 'video') { await sleep(2500); await page.screenshot({ path: join(OUT, `video-wk-${VW}x${VH}${TAG}.png`) }); console.log(game, 'done'); await ctx.close(); continue; }
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120000 });
  await page.evaluate(() => { window.__game.active = false; });
  await run(page, 0.8);
  await page.evaluate(() => { const g = window.__game; if (g.menu?.start) { g.menu.age = 1; g.menu.start(); } else { g.stateT = 5; g.selT = 1; if (typeof g.begin === 'function') g.begin(); else g.input(1); } });
  await run(page, AT);
  await page.evaluate(() => { const g = window.__game; g.msgs?.clear?.(); g.stage.render(); if (g.drawHud) g.drawHud(1 / 30); });
  await page.screenshot({ path: join(OUT, `${game}-${WK ? 'wk' : 'plan'}-${VW}x${VH}${TAG}.png`) });
  console.log(game, 'done'); await ctx.close();
}
await browser.close(); srv.kill();
