// Frame strips of Horde Run (three lanes): start, a threat cue, a portal pair, a pickup, the Keeper, the results.
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/horde-strip.mjs [--out docs/design] [--lang en] [--seed 4]
// Writes <out>/h2-horde-phone.png (portrait 390×844) and <out>/h2-horde-desktop.png (1280×720), and the single frames to --frames <dir>.
// The game runs on a fixed 1/30 s step with the LANE policy (see scripts/horde-bot.mjs); a frame is rendered only when the scene asked for is on screen.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startServer } from './static-server.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'docs/design'); const FRAMES = opt('frames', ''); const LANG = opt('lang', 'en'); const SEED = Number(opt('seed', 4));
mkdirSync(OUT, { recursive: true }); if (FRAMES) mkdirSync(FRAMES, { recursive: true });

// scene → predicate run after every step; returns true when the scene is on screen
// (the same predicates run inside the page below)
const SCENES = [
  ['start', (g) => g.el > 3.2],
  ['threat', (g) => g.el > 20 && g.threatT.some((x, l) => x < 1.6 && l !== g.lane)],
  ['portals', (g) => g.el > 30 && g.gates.some((x) => !x.used && x.z - g.z > 9 && x.z - g.z < 26)],
  ['pickup', (g) => g.picks.some((x) => !x.used && x.z - g.z > 9 && x.z - g.z < 28)],
  ['boss', (g) => g.enemies.some((e) => e.def.boss && !e.dead && e.z - g.z < 30)],
  ['results', (g) => g.state === 'results'],
];

async function run(browser, url, vp, tag) {
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block', deviceScaleFactor: 1 });
  const page = await ctx.newPage(); page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.addInitScript(([lang]) => { try { localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'high'); localStorage.setItem('lang', lang); } catch { /* no storage */ } }, [LANG]);
  await page.goto(`${url}/index.html?game=horde&demo=1`);
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120_000 });
  await page.evaluate(([seed]) => {
    const g = window.__game; g.active = false; window.__spindroSeed = seed; g.durIdx = 0; g.lvlIdx = 1;
    g.hooks = { ...g.hooks, connected: () => true, ftp: () => 200, stats: () => ({ power: g.tgtW || 130, cadence: 88 }), speedKmh: () => 30, setGrade() {}, setTarget: (w) => w };
    document.getElementById('demoRider')?.remove();
    g.reset(); g.begin();
    window.__idle = false; window.__step = (n) => { for (let i = 0; i < n; i++) { const l = window.__idle ? -1 : g.threatLane(); if (l > g.lane) g.input(1); else if (l >= 0 && l < g.lane) g.input(-1); g.update(1 / 30); } };
    window.__shot = () => { g.stage.render(); g.drawHud(1 / 30); };
  }, [SEED]);
  const files = [];
  for (const [name, test] of SCENES) {
    const ok = await page.evaluate(([name]) => {
      const g = window.__game; const T = { start: (g) => g.el > 3.2, threat: (g) => g.el > 20 && g.threatT.some((x, l) => x < 1.6 && x > 0.5 && l !== g.lane), portals: (g) => g.el > 30 && g.gates.some((x) => !x.used && x.z - g.z > 9 && x.z - g.z < 26), pickup: (g) => g.picks.some((x) => !x.used && x.z - g.z > 9 && x.z - g.z < 28), boss: (g) => g.enemies.some((e) => e.def.boss && !e.dead && e.z - g.z < 44), results: (g) => g.state === 'results' }[name];
      window.__idle = name === 'threat'; let n = 0; while (!T(g) && n < 30 * 400 && !(g.state === 'results' && name !== 'results')) { window.__step(1); n++; }
      for (let i = 0; i < (name === 'boss' ? 1 : 8); i++) { g.stage.render(); g.drawHud(1 / 30); window.__step(1); }
      if (name === 'results') for (let i = 0; i < 60; i++) { g.update(1 / 30); }
      window.__idle = false; g.hp = 6; g.lost = 0; g.pops = []; window.__shot();
      return { ok: T(g), el: Math.round(g.el) };
    }, [name]);
    const f = `${FRAMES || OUT}/${tag}-${name}.png`; await page.screenshot({ path: f }); files.push(f); console.log(tag, name, JSON.stringify(ok));
  }
  await ctx.close(); return files;
}

const { server, url } = await startServer(0);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
const phone = await run(browser, url, { width: 390, height: 844 }, 'phone');
const desk = await run(browser, url, { width: 1280, height: 720 }, 'desktop');
await browser.close(); server.close();
import { execFileSync } from 'node:child_process';
execFileSync('python3', ['-c', `
from PIL import Image
import sys
phone, desk, out = sys.argv[1].split(','), sys.argv[2].split(','), sys.argv[3]
ims = [Image.open(f).convert('RGB') for f in phone]
w, h = ims[0].size; strip = Image.new('RGB', (w * len(ims) + 8 * (len(ims) - 1), h), '#101010')
for i, im in enumerate(ims): strip.paste(im, (i * (w + 8), 0))
strip.save(out + '/h2-horde-phone.png')
ims = [Image.open(f).convert('RGB').resize((640, 360)) for f in desk]
sheet = Image.new('RGB', (640 * 3 + 16, 360 * 2 + 8), '#101010')
for i, im in enumerate(ims): sheet.paste(im, ((i % 3) * 648, (i // 3) * 368))
sheet.save(out + '/h2-horde-desktop.png')
`, phone.join(','), desk.join(','), OUT]);
console.log('strips written to', OUT);
