// Foto e misure di Planata in demo (senza rullo): l'aereo vola da solo verso il prossimo obiettivo.
//   node tests/serve.mjs &   (porta 4173)
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/planata-shots.mjs [--fps] [--prefix=planata] [--secs=30]
// Salva in docs/giochi-shots/: <prefix>-<scena>-<larghezza>x<altezza>.png
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const OUT = fileURLToPath(new URL('../docs/giochi-shots/', import.meta.url));
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const prefix = opt('prefix', 'planata'); const secs = Number(opt('secs', 30));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'],
});
for (const [w, h] of [[390, 780], [1280, 720]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.addInitScript(() => { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('lang', 'it'); localStorage.setItem('gameQuality', 'high'); });
  await page.goto(`${BASE}/index.html`);
  await page.click('#openGame'); await page.click('[data-game=planata]');
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 90000 });
  const shot = async (n) => { await page.screenshot({ path: `${OUT}${prefix}-${n}-${w}x${h}.png` }); console.log(`✓ ${n} ${w}x${h}`); };
  await page.waitForTimeout(800); await shot('menu');
  await page.evaluate(() => { window.__game.stateT = 1; window.__game.input(1); });
  // il browser di prova disegna con la CPU (pochi fps): il gioco avanza a passi fissi di 1/30 s
  const sim = (sec) => page.evaluate((sec) => {
    const g = window.__game;
    for (let i = 0; i < sec * 30; i++) {
      if (g.state === 'over') { g.lives = 3; g.state = 'play'; }
      g.t += 1 / 30; g.sense(1 / 30); g.texts.forEach((x) => { x.t -= 1 / 30; }); g.pops.forEach((x) => { x.t -= 1 / 30; }); g.step(1 / 30); if (i % 3 === 0) g.view(0.1);
    }
  }, sec);
  for (const k of [1, 2, 3]) { await sim(secs / 3); await page.waitForTimeout(1200); await shot(`volo${k}`); }
  console.log('stato', await page.evaluate(() => { const g = window.__game; return { state: g.state, metri: Math.round(g.z), punti: Math.round(g.score), vite: g.lives }; }));
  if (args.includes('--fps')) {
    const cdp = await ctx.newCDPSession(page);
    for (const level of ['high', 'medium', 'low']) {
      await page.evaluate((level) => { const g = window.__game; g.stage.quality.auto = false; g.stage.quality.decided = true; g.stage.quality.set(level); }, level);
      await page.waitForTimeout(800);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const m = await page.evaluate(() => new Promise((res) => {
        const g = window.__game; const st = g.stage; const r = st.renderer;
        const T = { cpu: 0, frames: 0, calls: 0, tris: 0 }; const saved = {};
        const wrap = (obj, name, fn) => { saved[name] = obj[name]; const o = obj[name].bind(obj); obj[name] = (...x) => fn(o, ...x); };
        wrap(g, 'step', (o, ...x) => { const t = performance.now(); o(...x); T.cpu += performance.now() - t; });
        wrap(g, 'view', (o, ...x) => { const t = performance.now(); o(...x); T.cpu += performance.now() - t; });
        wrap(g, 'drawHud', (o, ...x) => { const t = performance.now(); o(...x); T.cpu += performance.now() - t; T.frames++; });
        const sr = st.render.bind(st);
        st.render = () => {
          const a = performance.now(); r.info.autoReset = false; r.info.reset(); sr(); const b = performance.now();
          T.calls += r.info.render.calls; T.tris += r.info.render.triangles; r.info.autoReset = true;
          if (st.composer) st.composer.render(); else r.render(st.scene, st.camera);
          T.cpu += performance.now() - b;
        };
        const t0 = performance.now();
        setTimeout(() => { for (const k of Object.keys(saved)) g[k] = saved[k]; st.render = sr; res({ fps: T.frames / ((performance.now() - t0) / 1000), js: T.cpu / T.frames, calls: T.calls / T.frames, tris: T.tris / T.frames }); }, 7000);
      }));
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      console.log(`${w}x${h} qualità ${level}: fps browser(GPU sw) ${m.fps.toFixed(1)} · CPU ${m.js.toFixed(1)} ms/fotogramma (4x) ≈ ${Math.min(60, 1000 / m.js).toFixed(0)} fps · draw call ${Math.round(m.calls)} · triangoli ${Math.round(m.tris / 1000)}k`);
    }
  }
  if (errors.length) console.log('MESSAGGI:', [...new Set(errors)].join('\n'));
  await ctx.close();
}
await browser.close();
