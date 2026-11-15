// Filmati di Pedal Strike per cercare i difetti in movimento (docs/giochi-design.md, verifica 2).
// Fotogrammi a 10 al secondo a 390×780 (il tempo di gioco avanza a passi di 1/30 s), poi strisce di 12 fotogrammi consecutivi.
//   node tests/serve.mjs &
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/strike-film.mjs [--scenes=avvio,sforzo,miniboss,overdrive,boss,fine]
//        [--sec=20] [--out=docs/giochi-shots] [--frames=cartella]   (con --frames salva anche tutti i fotogrammi)
// Strisce: <out>/strike-striscia-<scena>.png (2 righe × 6 fotogrammi, 0,1 s l'uno dall'altro).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const OUT = opt('out', 'docs/giochi-shots'); const FR = opt('frames', ''); const SEC = Number(opt('sec', 20));
const W = Number(opt('w', 390)); const H = Number(opt('h', 780));
const SCENES = {
  avvio: { world: 0, setup: '', strip: 2.5 }, // dall'avvio: intro, primi nemici
  sforzo: { world: 1, setup: "g.skip('effort');", strip: 6 },
  miniboss: { world: 0, setup: "g.skip('mini');", strip: 4 },
  overdrive: { world: 2, setup: "g.skip('rec'); for (let i = 0; i < 90; i++) g.update(1/30); g.odMeter = 1;", strip: 0 },
  boss: { world: 2, setup: "g.skip('boss');", strip: 9 },
  fine: { world: 1, setup: "g.skip('cool');", strip: 1 },
};
const want = opt('scenes', Object.keys(SCENES).join(',')).split(',');
mkdirSync(OUT, { recursive: true }); if (FR) mkdirSync(FR, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const name of want) {
  const sc = SCENES[name];
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((w) => { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('ftp', '200'); localStorage.setItem('lang', 'it'); localStorage.setItem('gameQuality', 'medium'); localStorage.setItem('strikeWorld', String(w)); localStorage.setItem('strikeMin', '5'); }, sc.world);
  await page.goto(`${BASE}/index.html`);
  await page.click('#openGame'); await page.evaluate(() => document.body.classList.add('dev'));
  await page.click('[data-game=shooter]');
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120000 });
  // demo senza rullo, pilota automatico: è quello che vede chi guarda il gioco
  await page.evaluate((setup) => { const g = window.__game; g.active = false; g.row = 0; g.stateT = 1; g.input(1); g.auto = true; new Function('g', setup)(g); }, sc.setup);
  const frames = [];
  for (let i = 0; i < SEC * 10; i++) {
    await page.evaluate(() => { const g = window.__game; for (let k = 0; k < 3; k++) g.update(1 / 30); if (g.hooks.progress) g.hooks.progress.toasts.length = 0; g.stage.render(); g.drawHud(1 / 30); });
    const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
    frames.push(buf);
    if (FR) writeFileSync(`${FR}/${name}-${String(i).padStart(3, '0')}.jpg`, buf);
  }
  // striscia: 12 fotogrammi consecutivi da `strip` secondi
  const from = Math.min(frames.length - 12, Math.round(sc.strip * 10));
  const pick = frames.slice(from, from + 12).map((b) => `data:image/jpeg;base64,${b.toString('base64')}`);
  const png = await page.evaluate(async ({ pick, W, H }) => {
    const c = document.createElement('canvas'); const w = W / 2; const h = H / 2; c.width = w * 6; c.height = h * 2; const g = c.getContext('2d');
    for (let i = 0; i < pick.length; i++) { const im = new Image(); im.src = pick[i]; await im.decode(); g.drawImage(im, (i % 6) * w, Math.floor(i / 6) * h, w, h); g.fillStyle = '#000'; g.fillRect((i % 6) * w, Math.floor(i / 6) * h, 34, 16); g.fillStyle = '#fff'; g.font = '12px sans-serif'; g.fillText(`+${(i / 10).toFixed(1)}`, (i % 6) * w + 3, Math.floor(i / 6) * h + 12); }
    return c.toDataURL('image/png');
  }, { pick, W, H });
  writeFileSync(`${OUT}/strike-striscia-${name}.png`, Buffer.from(png.split(',')[1], 'base64'));
  console.log(`✓ ${name}: ${frames.length} fotogrammi, striscia da ${(from / 10).toFixed(1)} s${errors.length ? ` · ERRORI: ${[...new Set(errors)].join(' | ')}` : ''}`);
  await ctx.close();
}
await browser.close();
