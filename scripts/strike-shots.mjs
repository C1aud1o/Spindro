// Foto e misure di Pedal Strike 3D in modalità demo (senza rullo).
//   node tests/serve.mjs &   (server statico, porta 4173)
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/strike-shots.mjs [--fps] [--only=390x780] [--prefix=strike] [--scenes=menu,inizio,...]
// Salva in docs/giochi-shots/: <prefix>-<scena>-<larghezza>x<altezza>.png
// Il browser di prova disegna con la CPU (SwiftShader, pochi fps): il tempo di gioco si fa avanzare a mano a passi di 1/30 s
// e si disegna solo prima di ogni foto.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const OUT = fileURLToPath(new URL('../docs/giochi-shots/', import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const BASE = opt('base', process.env.BASE_URL || 'http://127.0.0.1:4173');
const only = opt('only', '');
const prefix = opt('prefix', 'strike');
const quality = opt('quality', 'high');
const want = opt('scenes', '').split(',').filter(Boolean);
const sizes = [[390, 780], [1280, 720]].filter(([w, h]) => !only || only === `${w}x${h}`);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'],
});

async function open(page, q) {
  await page.addInitScript((q) => {
    localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('mass', '75');
    localStorage.setItem('lang', 'it'); localStorage.setItem('gameQuality', q);
  }, q);
  await page.goto(`${BASE}/index.html`);
  await page.click('#openGame');
  await page.evaluate(() => document.body.classList.add('dev'));
  await page.click('[data-game=shooter]');
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120000 });
}

let taken = 0; // con --scenes ci si ferma dopo l'ultima foto chiesta
const enough = () => want.length && taken >= want.length;
const sim = (page, sec, fn = '') => enough() ? null : page.evaluate(([sec, fn]) => { const g = window.__game; const f = fn ? new Function('g', fn) : null; for (let i = 0; i < sec * 30; i++) { g.update(1 / 30); if (f) f(g); } }, [sec, fn]);
// un fotogramma disegnato a mano (camera e HUD aggiornati) prima della foto
const frame = (page) => page.evaluate(() => { const g = window.__game; if (g.hooks.progress) g.hooks.progress.toasts.length = 0; g.stage.render(); g.drawHud(1 / 30); }); // (gli avvisi dei progressi non scadono nella simulazione: si tolgono)

for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await open(page, quality);
  await page.evaluate(() => { window.__game.active = false; }); // ferma il ciclo del gioco: i passi li diamo noi
  taken = 0;
  const shot = async (name) => { if (want.length && !want.includes(name)) return; taken++; await frame(page); await page.screenshot({ path: `${OUT}${prefix}-${name}-${w}x${h}.png` }); console.log(`✓ ${name} ${w}x${h}`); };
  const go = (lv) => page.evaluate((lv) => { const g = window.__game; g.worldIx = lv; g.setupWorld(lv, true); g.row = 0; g.stateT = 1; g.input(1); g.auto = true; }, lv);
  if (opt('level', '')) {
    // prova veloce di un mondo: --level=0|1|2
    const lv = Number(opt('level', '0'));
    await go(lv); await page.evaluate(() => { window.__game.god = true; });
    await sim(page, 1.5); await shot(`q${lv}-inizio`);
    await sim(page, 12); await shot(`q${lv}-gioco`);
    await page.evaluate(() => window.__game.skip('effort'));
    await sim(page, 8); await shot(`q${lv}-sforzo`);
    await page.evaluate(() => window.__game.skip('boss'));
    await sim(page, 9); await shot(`q${lv}-boss`);
  } else if (!args.includes('--fps')) {
    await sim(page, 1.5); await shot('menu');
    await go(0);
    await sim(page, 1.2); await shot('inizio');
    await sim(page, 10); await shot('gioco');
    await page.evaluate(() => window.__game.skip('effort'));
    await sim(page, 7); await shot('sforzo');
    await page.evaluate(() => { const g = window.__game; g.odMeter = 1; });
    await sim(page, 0.5); await shot('overdrive');
    await page.evaluate(() => { const g = window.__game; g.god = true; g.skip('mini'); });
    await sim(page, 5); await shot('miniboss');
    await page.evaluate(() => window.__game.skip('boss'));
    await sim(page, 1.5); await shot('boss-arrivo');
    await sim(page, 6); await shot('boss');
    await page.evaluate(() => { const g = window.__game; if (g.boss?.ready) { g.breakShield(g.boss); g.damageBoss(g.boss.hp * 0.6); } });
    await sim(page, 3); await shot('boss2');
    await page.evaluate(() => { const g = window.__game; if (g.boss) g.damageBoss(g.boss.hp + 1); });
    await sim(page, 1.2); await shot('boss-esplode');
    await page.evaluate(() => window.__game.skip('cool'));
    await sim(page, 5); await shot('fine');
    for (const lv of [1, 2]) {
      await go(lv); await page.evaluate(() => { window.__game.god = true; });
      await sim(page, 1.5); await shot(`livello${lv + 1}`);
      await page.evaluate(() => window.__game.skip('effort'));
      await sim(page, 8); await shot(`livello${lv + 1}-gioco`);
      await page.evaluate(() => window.__game.skip('boss'));
      await sim(page, 9); await shot(`livello${lv + 1}-boss`);
    }
    console.log('stato', await page.evaluate(() => { const g = window.__game; return { state: g.state, score: g.score, kills: g.kills, rescued: g.rescued, q: g.quality.level }; }));
  } else {
    const cdp = await ctx.newCDPSession(page);
    await page.evaluate(() => { const g = window.__game; g.active = true; g.last = performance.now(); requestAnimationFrame(g.loop); });
    for (const level of (opt('levels', 'high,medium,low')).split(',')) {
      await page.evaluate((level) => { const g = window.__game; const q = g.quality; q.auto = false; q.decided = true; q.set(level); g.worldIx = 2; g.setupWorld(2, true); g.row = 0; g.stateT = 1; g.input(1); g.auto = true; g.god = true; g.skip('effort'); }, level);
      await page.waitForTimeout(6000); // shader compilati e blocchi di scenografia già creati
      await page.evaluate(() => { const g = window.__game; g.spawnPattern('squad'); g.spawnPattern('mix'); g.spawnPattern('shieldPair'); g.spawnCage(g.px + 30, 2); });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const m = await page.evaluate(() => new Promise((res) => {
        const g = window.__game; const st = g.stage; const r = st.renderer;
        const T = { cpu: 0, frames: 0, calls: 0, tris: 0 }; const saved = {};
        const wrap = (obj, name, fn) => { saved[name] = obj[name]; const o = obj[name].bind(obj); obj[name] = (...x) => fn(o, ...x); };
        wrap(g, 'update', (o, ...x) => { const t = performance.now(); o(...x); T.cpu += performance.now() - t; T.frames++; });
        wrap(g, 'drawHud', (o, ...x) => { const t = performance.now(); o(...x); T.cpu += performance.now() - t; });
        const sr = st.render.bind(st);
        st.render = () => {
          r.info.autoReset = false; r.info.reset(); sr();
          T.calls += r.info.render.calls; T.tris += r.info.render.triangles; r.info.autoReset = true;
          const b = performance.now(); if (st.composer) st.composer.render(); else r.render(st.scene, st.camera); T.cpu += performance.now() - b;
        };
        const t0 = performance.now();
        setTimeout(() => { for (const k of Object.keys(saved)) g[k] = saved[k]; st.render = sr; res({ fps: T.frames / ((performance.now() - t0) / 1000), js: T.cpu / T.frames, calls: T.calls / T.frames, tris: T.tris / T.frames, foes: g.foes.filter((e) => !e.dead).length }); }, 8000);
      }));
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      console.log(`${w}x${h} ${level}: CPU ${m.js.toFixed(1)} ms/fotogramma (4x) ≈ ${Math.min(60, 1000 / m.js).toFixed(0)} fps · browser ${m.fps.toFixed(1)} fps (GPU software) · draw call ${Math.round(m.calls)} · triangoli ${Math.round(m.tris / 1000)}k · nemici ${m.foes}`);
    }
  }
  if (errors.length) console.log('ERRORI:', [...new Set(errors)].join('\n'));
  await ctx.close();
}
await browser.close();
