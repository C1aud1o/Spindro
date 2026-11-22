// Bot di Pedal Strike (docs/games/DESIGN-RULES.md, verifica 1): partita da 5 minuti a livello Normale, FTP 200,
// potenza fissa a 0,6 / 0,8 / 1,0 / 1,2 × FTP. Per ognuno: stelle, tempo al primo evento, intervallo più lungo senza
// eventi, eventi al minuto (e sforzi riusciti, boss, colpi presi).
//   node tests/serve.mjs &
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/strike-bot.mjs [--min=5] [--levels=0.6,0.8,1,1.2] [--diff=1]
// Il tempo di gioco avanza a mano (passi da 1/30 s): il browser di prova disegna lento, ma il gioco no.
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const MIN = Number(opt('min', 5)); const DIFF = Number(opt('diff', 1)); const FTP = 200;
const LEVELS = opt('levels', '0.6,0.8,1,1.2').split(',').map(Number);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(({ FTP, MIN, DIFF }) => { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('ftp', String(FTP)); localStorage.setItem('lang', 'it'); localStorage.setItem('gameQuality', 'low'); localStorage.setItem('strikeMin', String(MIN)); localStorage.setItem('strikeDiff', String(DIFF)); }, { FTP, MIN, DIFF });
await page.goto(`${BASE}/index.html`);
await page.click('#openGame'); await page.evaluate(() => document.body.classList.add('dev'));
await page.click('[data-game=shooter]');
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120000 });
await page.evaluate(() => { window.__game.active = false; }); // il ciclo lo guidiamo noi

const rows = [];
for (const k of LEVELS) {
  const r = await page.evaluate(({ W }) => {
    const g = window.__game;
    g.hooks = { ...g.hooks, connected: () => true, stats: () => ({ power: W, cadence: 85 }), speedKmh: () => 18 + W / 10, setGrade() {}, runEnd() {}, runStart() {} };
    g.row = 0; g.stateT = 1; g.input(1); g.auto = true;
    const end = g.blocks.total; let n = 0;
    while (g.state !== 'results' && n < end * 30 + 600) { g.update(1 / 30); n++; }
    const ev = g.ev.filter((e) => e.k !== 'start').map((e) => e.t);
    let gap = ev[0] || 0; const gaps = []; for (let i = 1; i < ev.length; i++) { gap = Math.max(gap, ev[i] - ev[i - 1]); if (ev[i] - ev[i - 1] > 4) gaps.push(`${ev[i - 1].toFixed(0)}+${(ev[i] - ev[i - 1]).toFixed(1)}`); } gap = Math.max(gap, end - ev[ev.length - 1]);
    const coolT = g.blocks[g.blocks.length - 1].t0; const play = ev.filter((t) => t < coolT);
    return { stars: g.result?.stars ?? 0, first: ev[0], gap, perMin: play.length / (coolT / 60), ok: g.result?.ok, n: g.result?.n, boss: g.bossDown, mini: g.miniDown, hits: g.hitsTaken, kos: g.kos, score: Math.round(g.score), kills: g.kills, st: g.st, endT: end, nn: n, res: g.coach.results.map((x) => `${x.kind[0]}${x.target}${x.ok ? '✓' : '✗'}`).join(' '), state: g.state, gaps: gaps.join(' ') };
  }, { W: Math.round(k * FTP) });
  rows.push({ k, ...r });
  console.log(`${k.toFixed(1)}×FTP: ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)} · primo evento ${r.first.toFixed(1)} s · max senza eventi ${r.gap.toFixed(1)} s · ${r.perMin.toFixed(0)} eventi/min · sforzi ${r.ok}/${r.n} · mini ${r.mini ? 'sì' : 'no'} · boss ${r.boss ? 'sì' : 'no'} · colpi presi ${r.hits} (KO ${r.kos}) · uccisioni ${r.kills} · punti ${r.score} · ${r.state} ${r.st?.toFixed(0)}/${r.endT} n${r.nn} · ${r.res}${args.includes('--gaps') ? ` · buchi ${r.gaps}` : ''}`);
  await page.evaluate(() => { const g = window.__game; g.stateT = 5; g.input(-1); }); // torna al menu
}
console.log('\n| Potenza | Stelle | Primo evento | Max senza eventi | Eventi/min | Sforzi riusciti | Boss |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.k.toFixed(1)} × FTP | ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)} | ${r.first.toFixed(1)} s | ${r.gap.toFixed(1)} s | ${r.perMin.toFixed(0)} | ${r.ok}/${r.n} | ${r.boss ? 'abbattuto' : 'scappato'} |`);
if (errors.length) console.log('ERRORI:', [...new Set(errors)].join('\n'));
await browser.close();
