// Bot di Breakaway: potenza fissa in % della FTP, tappa da 5 min a livello Normale (o --min=10/20, --level=0/1/2).
//   node tests/serve.mjs &
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/racer-bot.mjs [--min=5] [--level=1] [--powers=0.6,0.8,1,1.2]
// Il tempo di gioco avanza a mano (passi da 1/30 s, senza disegnare): il browser di prova disegna lento, ma la logica no.
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const MIN = Number(opt('min', 5)); const LEVEL = Number(opt('level', 1)); const POWERS = String(opt('powers', '0.6,0.8,1,1.2')).split(',').map(Number);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' })).newPage();
page.on('pageerror', (e) => console.error('ERRORE', e.message));
await page.addInitScript(() => { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('ftp', '200'); localStorage.setItem('lang', 'it'); localStorage.setItem('gameQuality', 'low'); });
await page.goto(`${BASE}/index.html`);
await page.click('#openGame'); await page.click('[data-game=racer]');
await page.waitForFunction(() => window.__game?.state === 'select', null, { timeout: 150000 });

const rows = [];
for (const pw of POWERS) {
  await page.evaluate(({ MIN, LEVEL }) => { const g = window.__game; g.durIdx = [5, 10, 20].indexOf(MIN); g.level = LEVEL; g.selT = 1; g.begin(); }, { MIN, LEVEL });
  await page.waitForFunction(() => window.__game.state === 'countdown', null, { timeout: 150000 });
  const res = await page.evaluate(({ pw }) => {
    const g = window.__game;
    // "coach" (potenza 0): fa quello che chiede la scheda dell'obiettivo, 3 % sopra; altrimenti 75 % (recupero 62 %)
    const coach = () => { const r = g.race; const ob = r?.obj; if (ob && !ob.done && (ob.type === 'hold' || ob.type === 'kick')) return ob.pct * 1.03; if (ob && !ob.done && ob.type === 'close') return 1.05; return r?.moment()?.kind === 'recover' ? 0.62 : 0.78; };
    g.hooks = { ...g.hooks, connected: () => true, stats: () => ({ power: (pw === 0 ? coach() : pw) * 200, cadence: 85 }), ftp: () => 200, setGrade() {}, runEnd() {} };
    const ev = []; const orig = g.onEvent.bind(g);
    g.onEvent = (e) => { ev.push({ t: g.race.t, key: e.key.replace('games.racer.say.', '') }); orig(e); };
    let guard = 0; while (g.state !== 'results' && guard++ < 30 * 60 * 40) g.update(1 / 30, 1 / 30);
    const r = g.result; const t = g.race.t;
    const ts = ev.map((e) => e.t); const gaps = ts.map((x, i) => x - (i ? ts[i - 1] : 0));
    gaps.push(t - (ts.at(-1) ?? 0));
    const first = ts[0] ?? null;
    return { place: r.place, stars: r.stars, obj: `${r.objDone}/${r.objTotal}`, tFinish: g.finishT, raceT: t, first, maxGap: Math.max(...gaps), perMin: ev.length / (t / 60), n: ev.length, hist: g.race.objHist.map((h) => `${h.kind}${h.ok ? '+' : '-'}`).join(' '), keys: [...new Set(ev.map((e) => e.key))].length };
  }, { pw });
  rows.push({ pw, ...res });
}
console.log(`\nBreakaway · bot a potenza fissa · tappa ${MIN} min · livello ${['Facile', 'Normale', 'Difficile'][LEVEL]} · FTP 200 W`);
console.log('FTP×  piazz.  stelle  obiettivi  fine gara  primo evento (da VIA)  max senza eventi  eventi/min');
for (const r of rows) console.log(`${r.pw ? r.pw.toFixed(1) : 'coach'}  ${String(r.place).padStart(3)}°   ${'★'.repeat(r.stars).padEnd(3)}    ${r.obj.padEnd(6)}     ${(r.raceT).toFixed(0).padStart(4)} s     ${r.first?.toFixed(1)} s                 ${r.maxGap.toFixed(1)} s            ${r.perMin.toFixed(1)}   [${r.hist}]`);
await browser.close();
