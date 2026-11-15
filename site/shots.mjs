#!/usr/bin/env node
// Screenshot dei giochi per il sito: 1280x720 -> WebP 960x540, in en e it, con il rullo finto collegato
// (niente scritta "DEMO: rullo non connesso"). Il tempo di gioco si fa avanzare a mano a passi di 1/30 s,
// perché nel cloud il browser disegna con la CPU (SwiftShader) e va a pochi fps.
//   node site/shots.mjs                       -> site/assets/shots/game-<gioco>-<lingua>.webp
//   SHOT_ONLY=strike,horde SHOT_LANG=en node site/shots.mjs
// Giochi: strike, racer, horde, gruppetto, planata, mattoni. Serve ImageMagick (`convert`).
// Cloud: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium (default se esiste).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, launchOptions } from './pw.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = join(here, 'assets/shots');
const tmp = mkdtempSync(join(tmpdir(), 'spindro-games-'));
const PORT = Number(process.env.SHOT_PORT) || 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const only = (process.env.SHOT_ONLY || 'strike,racer,horde,gruppetto,planata,mattoni').split(',');
// momento scelto per ogni gioco (nome della scena che finisce nel sito)
const PICK = { strike: 'combattimento', racer: 'salita', horde: 'ondata', gruppetto: 'fila', planata: 'volo', mattoni: 'gioco' };
const langs = (process.env.SHOT_LANG || 'en,it').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['tests/serve.mjs'], { cwd: root, env: { ...process.env, PORT }, stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${BASE}/index.html`)).ok) break; } catch { /* non è ancora su */ } await sleep(200); }

// ---- ogni gioco: come si apre e che momenti si fotografano (shot(nome) salva e converte)
const sim = (page, sec, fn) => page.evaluate(([sec, fn]) => { const g = window.__game; const f = fn ? new Function('g', fn) : null; for (let i = 0; i < sec * 30; i++) { g.update(1 / 30); if (f) f(g); } }, [sec, fn || '']);
// un fotogramma disegnato a mano (camera e HUD aggiornati) prima della foto
const frame = (page) => page.evaluate(() => { const g = window.__game; g.msgs?.clear?.(); if (g.hooks?.progress) g.hooks.progress.toasts.length = 0; g.stage.render(); if (g.drawHud) g.drawHud(1 / 30); });

// un passo dello stesso ciclo di Base3D.loop(), con il tempo dato da noi (il ciclo vero va fermato con active=false)
const TICK = 'g.t += dt; g.sense(dt); g.msgs.update(dt); g.stateT += dt; if (g.state === "play") g.step(dt); g.view(dt);';
const run = (page, sec, pre = '') => page.evaluate(([sec, pre, TICK]) => {
  const g = window.__game; const dt = 1 / 30; const f = new Function('g', 'dt', `${pre}\n${TICK}`);
  for (let i = 0; i < sec * 30; i++) f(g, dt);
}, [sec, pre, TICK]);

const GAMES = {
  strike: { card: 'shooter', dev: true, ready: 'menu', async scene(page, shot) {
    await page.evaluate(() => { window.__game.active = false; });
    await sim(page, 1.5);
    await page.evaluate(() => { const g = window.__game; g.stateT = 1; g.input(1); g.auto = true; });
    await sim(page, 1.2); await sim(page, 12);
    // nemici messi davanti al ciclista (robot, un bruto, un drone): il pilota automatico spara e il momento è vivo
    await page.evaluate(() => { const g = window.__game; g.spawnFoe('trooper', g.px + 9, 1); g.spawnFoe('trooper', g.px + 12.5, 0); g.spawnFoe('brute', g.px + 16, 1); g.spawnFoe('drone', g.px + 11, 2); });
    await sim(page, 1.4);
    await shot('combattimento');
    await page.evaluate(() => { window.__game.odMeter = 1; });
    await sim(page, 0.8); await shot('overdrive');
  } },
  racer: { card: 'racer', ready: 'select', async scene(page, shot) {
    await page.evaluate(() => { window.__game.selT = 1; window.__game.input(1); });
    await page.waitForFunction(() => window.__game.state === 'race', null, { timeout: 90000 });
    await page.evaluate(() => {
      const g = window.__game; const c = g.climbs; const s = c[Math.floor(c.length * 0.45)] - 18;
      g.s = s; g.x = 0; g.lane = 1; g.camInit = false;
      const offs = [-9, 6, 9, 15, 22, 30, -16];
      g.rivals.forEach((r, i) => { r.s = s + offs[i]; r.speed = 9; r.x = [0, -2.4, 2.4, 0, 2.4, -2.4, 0][i]; r.targetX = r.x; });
      g.state = 'race'; g.stateT = 5; g.time.slow = 0; g.raceT = 210; g.speed = 11; g.standing = g.ranking();
    });
    await page.waitForTimeout(2500);
    await page.evaluate(() => { window.__game.msgs.clear(); window.__game.pops.length = 0; });
    await page.waitForTimeout(400); await shot('salita');
  } },
  horde: { card: 'horde', ready: 'menu', async scene(page, shot) {
    await page.evaluate(() => { window.__game.stateT = 1; window.__game.input(1); });
    await page.waitForTimeout(2500);
    await sim(page, 12);
    await page.evaluate(() => {
      const g = window.__game; g.wave = 6; g.hp = g.maxHp;
      const types = ['zombie', 'zombie', 'runner', 'skeleton', 'brute', 'zombie'];
      for (let i = 0; i < 90; i++) g.spawnEnemy(types[i % types.length], (Math.random() * 2 - 1) * 8, g.z + 8 + Math.random() * 70);
    });
    await sim(page, 2.5); await page.waitForTimeout(1500); await shot('ondata');
  } },
  gruppetto: { stop: true, card: 'gruppetto', ready: 'menu', async scene(page, shot) {
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__game.stateT = 1; window.__game.input(1); window.__game.kmh = 30; });
    const play = (sec) => run(page, sec, `const lim = (g.half || 22) - 6;
      if (g.state === 'over') { g.stateT = 2; g.input(1); }
      const near = [...g.strays].sort((a, b) => Math.hypot(a.x - g.x, a.z - g.z) - Math.hypot(b.x - g.x, b.z - g.z))[0];
      if (near) g.hT = Math.atan2(near.x - g.x, near.z - g.z);
      if (Math.abs(g.x) > lim || Math.abs(g.z) > lim) g.hT = Math.atan2(-g.x, -g.z);`);
    await play(60); await page.waitForTimeout(1200); await shot('fila');
  } },
  planata: { stop: true, card: 'planata', ready: 'menu', async scene(page, shot) {
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__game.stateT = 1; window.__game.input(1); });
    const play = (sec) => run(page, sec, `if (g.state === 'over') { g.lives = 3; g.state = 'play'; }`);
    await play(40); await page.waitForTimeout(1200); await shot('volo');
  } },
  mattoni: { stop: true, card: 'mattoni', dev: true, ready: 'menu', async scene(page, shot) {
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__game.stateT = 1; window.__game.input(1); window.__game.kmh = 30; });
    const play = (sec) => run(page, sec, `if (g.state === 'over') { g.stateT = 2; g.input(1); }
      if (g.balls.find((x) => x.stuck)) g.press(1);
      const tgt = [...g.balls].filter((x) => !x.stuck).sort((p, q) => p.z - q.z)[0];
      if (tgt) g.px += Math.max(-0.5, Math.min(0.5, tgt.x - g.px));`);
    await play(45); await page.waitForTimeout(1200); await shot('gioco');
  } },
};

const browser = await chromium.launch({ ...launchOptions, args: [...launchOptions.args, '--ignore-gpu-blocklist'] });
let failed = 0;
for (const lang of langs) {
  for (const name of only) {
    const G = GAMES[name];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block', locale: lang });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.addInitScript((lang) => {
        localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '230'); localStorage.setItem('mass', '75');
        localStorage.setItem('lang', lang); localStorage.setItem('gameQuality', 'high');
      }, lang);
      await page.addInitScript({ path: join(root, 'tests/fake-ble.js') });
      await page.goto(`${BASE}/index.html`);
      await page.click('#connectTrainer');
      await page.waitForFunction(() => /FTMS/.test(document.querySelector('#trainerStatus')?.textContent || ''));
      await page.evaluate(() => { __fakeBle.state.cadence = 90; __fakeBle.state.speed = 32; __fakeBle.setPower(260); });
      await page.click('#openGame');
      if (G.dev) await page.evaluate(() => document.body.classList.add('dev'));
      await page.click(`[data-game=${G.card}]`);
      await page.waitForFunction((s) => window.__game?.state === s, G.ready, { timeout: 120000 });
      if (G.stop) await page.evaluate(() => { window.__game.active = false; });
      const shot = async (n) => {
        await frame(page);
        const png = join(tmp, `${name}-${n}-${lang}.png`);
        await page.screenshot({ path: png });
        const keep = process.env.SHOT_KEEP; // SHOT_KEEP=cartella: tiene tutti i momenti per sceglierli a occhio
        if (keep) spawnSync('cp', [png, keep]);
        console.log(`✓ ${name}/${n} ${lang}`);
        if (!process.env.SHOT_KEEP && n === PICK[name]) spawnSync('convert', [png, '-resize', '960x540', '-quality', '80', join(outDir, `game-${name}-${lang}.webp`)], { stdio: 'inherit' });
      };
      await G.scene(page, shot);
    } catch (e) { failed++; console.error(`ERR ${name} ${lang}: ${e.message}`); }
    if (errors.length) console.log('ERRORI JS:', [...new Set(errors)].join(' | '));
    await ctx.close();
  }
}
await browser.close(); server.kill(); rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
