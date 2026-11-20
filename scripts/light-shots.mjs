#!/usr/bin/env node
// Frames of every game at 390x780 for judging light and glow (docs/design/u3-light.png).
//   node scripts/light-shots.mjs <outdir> [game,game] [high,medium]
// Game time is stepped by hand (1/30 s) like scripts/site-shots.mjs; frames at the start, in an effort phase and late.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(process.argv[2] || 'light-out'); mkdirSync(OUT, { recursive: true });
const GAMES = (process.argv[3] || 'shooter,horde,gruppetto,racer,planata,mattoni').split(',');
const QUALITIES = (process.argv[4] || 'high,medium').split(',');
const MOMENTS = (process.env.MOMENTS || '4,60,150').split(',').map(Number);
const PORT = 4195;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [join(ROOT, 'tests/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await sleep(1000);
const TICK = 'if (typeof g.sense === "function" && typeof g.step === "function" && typeof g.view === "function") { g.t += dt; g.sense(dt); g.msgs.update(dt); g.stateT += dt; if (g.state === "play") g.step(dt); g.view(dt); } else g.update(dt, dt);';
const run = (page, sec) => page.evaluate(([sec, TICK]) => { const g = window.__game; const dt = 1 / 30; const f = new Function('g', 'dt', TICK); for (let i = 0; i < sec * 30; i++) f(g, dt); }, [sec, TICK]);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
for (const q of QUALITIES) for (const game of GAMES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en', serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', (e) => console.warn(game, e.message));
  await page.addInitScript((q) => { localStorage.clear(); Object.entries({ analytics: '0', safetyAck: '1', ftp: '220', lang: 'en', gameQuality: q, gameGlow: '1' }).forEach(([k, v]) => localStorage.setItem(k, v)); }, q);
  await page.addInitScript({ path: join(ROOT, 'tests/fake-ble.js') });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await page.waitForFunction(() => /FTMS/.test(document.getElementById('trainerStatus')?.textContent || ''));
  await page.evaluate(() => { __fakeBle.state.cadence = 90; __fakeBle.state.speed = 32; __fakeBle.setPower(252); });
  await page.evaluate(() => document.getElementById('openGame').click()); await sleep(500);
  await page.evaluate((c) => document.querySelector(`[data-game="${c}"]`).click(), game);
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120000 });
  await page.evaluate(() => { window.__game.active = false; });
  await run(page, 0.8);
  await page.evaluate(() => { const g = window.__game; if (g.menu?.start) { g.menu.age = 1; g.menu.start(); } else { g.stateT = 1; g.input(1); } });
  let at = 0;
  for (const m of MOMENTS) {
    await run(page, m - at); at = m;
    await page.evaluate(() => { const g = window.__game; g.msgs?.clear?.(); g.stage.render(); if (g.drawHud) g.drawHud(1 / 30); });
    await page.screenshot({ path: join(OUT, `${game}-${q}-${m}.png`) });
  }
  console.log(game, q, 'done'); await ctx.close();
}
await browser.close(); srv.kill();
