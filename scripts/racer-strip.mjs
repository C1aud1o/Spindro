// Strisce di fotogrammi consecutivi di Breakaway (10 al secondo, 390×780) per cercare i difetti in movimento.
//   node tests/serve.mjs &
//   node scripts/racer-strip.mjs --at=40 [--min=5] [--n=12] [--pw=1] [--out=/percorso/cartella] [--tag=nome]
// Il gioco va avanti a mano (passi da 1/30 s); ogni 3 passi si disegna e si salva il fotogramma.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const AT = opt('at', '40') === 'end' ? 9999 : Number(opt('at', 40)); const MIN = Number(opt('min', 5)); const N = Number(opt('n', 12)); const PW = Number(opt('pw', 1)); const TAG = opt('tag', `t${AT}`);
const OUT = opt('out', '/tmp/claude-0/frames'); mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block', deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.error('ERRORE', e.message));
await page.addInitScript(() => { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('lang', 'it'); localStorage.setItem('gameQuality', 'medium'); });
await page.goto(`${BASE}/index.html`);
await page.click('#openGame'); await page.click('[data-game=racer]');
await page.waitForFunction(() => window.__game?.state === 'select', null, { timeout: 150000 });
await page.evaluate(({ MIN }) => { const g = window.__game; g.durIdx = [5, 10, 20].indexOf(MIN); g.level = 1; g.adaptMem = 0; g.selT = 1; g.begin(); }, { MIN });
await page.waitForFunction(() => window.__game.state === 'countdown', null, { timeout: 150000 });
await page.evaluate(({ PW, AT }) => {
  const g = window.__game;
    // "coach" (potenza 0): fa quello che chiede la scheda dell'obiettivo, 3 % sopra; altrimenti 75 % (recupero 62 %)
    const coach = () => { const r = g.race; const ob = r?.obj; if (ob && !ob.done && (ob.type === 'hold' || ob.type === 'kick')) return ob.pct * 1.03; if (ob && !ob.done && ob.type === 'close') return 1.05; return r?.moment()?.kind === 'recover' ? 0.62 : 0.78; };
  g.hooks = { ...g.hooks, connected: () => true, stats: () => ({ power: (PW === 0 ? coach() : PW) * 200, cadence: 88, gear: 12 }), ftp: () => 200, setGrade() {} };
  window.__step = (n) => { for (let i = 0; i < n; i++) { g.update(1 / 30, 1 / 30); g.frame = (g.frame || 0) + 1; if (i % 3 === 0 || i === n - 1) { g.draw(1 / 30, 1 / 30); } } };
  // si arriva al punto scelto senza disegnare (ogni mezzo secondo si disegna per tenere la camera e le istanze aggiornate)
  while (AT >= 9999 ? g.state !== 'results' : (g.race?.t < AT || g.state === 'countdown')) { g.update(1 / 30, 1 / 30); g.frame = (g.frame || 0) + 1; if (g.frame % 15 === 0) g.draw(1 / 30, 1 / 30); }
}, { PW, AT });
const info = [];
for (let i = 0; i < N; i++) {
  const d = await page.evaluate(() => { const g = window.__game; for (let k = 0; k < 3; k++) { g.update(1 / 30, 1 / 30); g.frame = (g.frame || 0) + 1; } g.draw(0.1, 0.1); g.drawHud(0.1); return { t: g.race?.t, s: g.s, place: g.place(), mom: g.race?.moment()?.kind }; });
  info.push(d);
  await page.screenshot({ path: `${OUT}/${TAG}-${String(i).padStart(2, "0")}.png`, timeout: 120000 });
}
console.log(JSON.stringify(info[0]), '→', JSON.stringify(info.at(-1)));
await browser.close();
