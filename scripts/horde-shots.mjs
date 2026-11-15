// Foto e misure de L'Orda in modalità demo (senza rullo).
//   node tests/serve.mjs &   (server statico, porta 4173)
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/horde-shots.mjs [--fps] [--only=390x780] [--play=40] [--base=http://127.0.0.1:4174]
// Salva in docs/giochi-shots/: horde-<scena>-<larghezza>x<altezza>.png
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const OUT = fileURLToPath(new URL('../docs/giochi-shots/', import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const BASE = opt('base', process.env.BASE_URL || 'http://127.0.0.1:4173');
const only = opt('only', '');
const playSec = Number(opt('play', 40));
const sizes = [[390, 780], [1280, 720]].filter(([w, h]) => !only || only === `${w}x${h}`);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'],
});

async function openHorde(page, quality) {
  await page.addInitScript((q) => {
    localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('ftp', '200'); localStorage.setItem('mass', '75');
    localStorage.setItem('lang', 'it'); localStorage.setItem('gameQuality', q);
  }, quality);
  await page.goto(`${BASE}/index.html`);
  await page.click('#openGame');
  await page.click('[data-game=horde]');
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120000 });
}

// una piena di nemici davanti al giocatore
const crowd = (page, wave = 6) => page.evaluate((wave) => {
  const g = window.__game; g.wave = wave; g.hp = g.maxHp;
  const types = g.kits ? ['zombie', 'zombie', 'runner', 'skeleton', 'brute', 'zombie'] : ['zombie', 'zombie', 'skeleton', 'vampire', 'ghost', 'zombie']; // (la versione vecchia ha altri tipi)
  for (let i = 0; i < 90; i++) g.spawnEnemy(types[i % types.length], (Math.random() * 2 - 1) * 8, g.z + 8 + Math.random() * 70);
}, wave);

for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await openHorde(page, args.includes('--fps') ? 'high' : 'high');
  const shot = async (name) => { await page.screenshot({ path: `${OUT}horde-${name}-${w}x${h}.png` }); console.log(`✓ ${name} ${w}x${h}`); };
  if (!args.includes('--fps')) {
    await page.waitForTimeout(1500); await shot('menu');
    await page.evaluate(() => { window.__game.stateT = 1; window.__game.input(1); });
    await page.waitForTimeout(3500); await shot('inizio');
    // gioco in demo: il browser di prova disegna a pochi fps (GPU software), quindi il tempo di gioco si fa avanzare a mano,
    // a passi da 1/30 s, con il disegno solo alla fine di ogni tratto
    const sim = (sec) => page.evaluate((sec) => { const g = window.__game; for (let i = 0; i < sec * 30; i++) g.update(1 / 30); }, sec);
    await sim(playSec * 0.6); await page.waitForTimeout(1500); await shot('gioco');
    await crowd(page); await sim(2.5); await page.waitForTimeout(1500); await shot('ondata');
    await sim(playSec * 0.4 - 2.5);
    await page.evaluate(() => { const g = window.__game; g.reset(); g.begin(); g.wave = 5; });
    await sim(4);
    await page.evaluate(() => { const g = window.__game; g.spawnEnemy('keeper', 0, g.z + 34); g.bossAlive = true; for (let i = 0; i < 14; i++) g.spawnEnemy(i % 3 ? 'zombie' : 'runner', (Math.random() * 2 - 1) * 6, g.z + 15 + Math.random() * 45); });
    await sim(3); await page.waitForTimeout(1500); await shot('boss');
    console.log('stato', await page.evaluate(() => { const g = window.__game; return { wave: g.wave, kills: g.kills, hp: g.hp, weapon: g.weapon, allies: g.allies.length, q: (g.quality || g.stage.quality).level }; }));
  } else {
    // misura con la CPU rallentata 4x: il disegno nel cloud è software (SwiftShader), quindi si guarda il costo CPU per fotogramma
    const cdp = await ctx.newCDPSession(page);
    await page.evaluate(() => { window.__game.stateT = 1; window.__game.input(1); });
    await page.waitForTimeout(1500);
    for (const level of (opt('levels', 'high,medium,low')).split(',')) {
      await page.evaluate((level) => { const g = window.__game; const qq = g.quality || g.stage.quality; qq.auto = false; qq.decided = true; qq.set(level); g.reset(); g.begin(); g.hp = 99; g.maxHp = 99; }, level);
      await crowd(page, 7);
      await page.waitForTimeout(2500);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const m = await page.evaluate(() => new Promise((res) => {
        const g = window.__game; const st = g.stage; const r = st.renderer;
        const T = { cpu: 0, frames: 0, calls: 0, tris: 0 }; const saved = {};
        const wrap = (obj, name, fn) => { saved[name] = obj[name]; const o = obj[name].bind(obj); obj[name] = (...x) => fn(o, ...x); };
        wrap(g, 'update', (o, ...x) => { const t = performance.now(); o(...x); T.cpu += performance.now() - t; T.frames++; });
        wrap(g, 'drawHud', (o, ...x) => { const t = performance.now(); o(...x); T.cpu += performance.now() - t; });
        const sr = st.render.bind(st);
        st.render = () => {
          r.info.autoReset = false; r.info.reset(); sr(); // primo render: aspetta la GPU emulata
          T.calls += r.info.render.calls; T.tris += r.info.render.triangles; r.info.autoReset = true;
          const b = performance.now(); if (st.composer) st.composer.render(); else r.render(st.scene, st.camera); T.cpu += performance.now() - b; // secondo render: costo CPU
        };
        const t0 = performance.now();
        setTimeout(() => { for (const k of Object.keys(saved)) g[k] = saved[k]; st.render = sr; res({ fps: T.frames / ((performance.now() - t0) / 1000), js: T.cpu / T.frames, calls: T.calls / T.frames, tris: T.tris / T.frames, alive: g.enemies.filter((e) => !e.dead).length, anim: g.enemies.filter((e) => e.w || e.c).length }); }, 8000);
      }));
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      console.log(`${w}x${h} ${level}: CPU ${m.js.toFixed(1)} ms/fotogramma (4x) ≈ ${Math.min(60, 1000 / m.js).toFixed(0)} fps · browser ${m.fps.toFixed(1)} fps (GPU software) · draw call ${Math.round(m.calls)} · triangoli ${Math.round(m.tris / 1000)}k · nemici vivi ${m.alive}, animati ${m.anim}`);
    }
  }
  if (errors.length) console.log('ERRORI:', [...new Set(errors)].join('\n'));
  await ctx.close();
}
await browser.close();
