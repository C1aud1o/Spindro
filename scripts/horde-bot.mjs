// Bot de L'Orda: tiene la potenza fissa, sterza verso i portali blu e misura la comparsa dei portali.
//   node tests/serve.mjs &
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/horde-bot.mjs [--watts=200] [--kmh=30] [--sec=300] [--runs=3]
// Il tempo di gioco avanza a mano (passi da 1/30 s): il browser di prova disegna lento, ma il gioco no.
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => Number(args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const WATTS = opt('watts', 200); const KMH = opt('kmh', 30); const SEC = opt('sec', 300); const RUNS = opt('runs', 3);
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' })).newPage();
page.on('pageerror', (e) => console.error('ERRORE', e.message));
await page.addInitScript(() => { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('lang', 'it'); localStorage.setItem('gameQuality', 'low'); });
await page.goto(`${BASE}/index.html`);
await page.click('#openGame'); await page.click('[data-game=horde]');
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 120000 });

const runs = [];
for (let r = 0; r < RUNS; r++) {
  const res = await page.evaluate(({ WATTS, KMH, SEC }) => {
    const g = window.__game;
    g.reset(); g.begin();
    g.hooks = { ...g.hooks, connected: () => true, stats: () => ({ power: WATTS, cadence: 85 }), speedKmh: () => KMH, setGrade() {} };
    const out = { spawned: [], taken: [], waves: [], dieAt: null, line: [] };
    const origSpawn = g.spawnGates.bind(g);
    g.spawnGates = (z) => { const n = g.gates.length; origSpawn(z); out.spawned.push({ t: g.t0, defs: g.gates.slice(n).map((x) => x.def.text.split('.').pop() + (x.def.good ? '+' : '-')) }); };
    g.t0 = 0; let lastWave = 1;
    for (let i = 0; i < SEC * 30; i++) {
      g.t0 += 1 / 30;
      // sterza: verso il portale blu più vicino davanti, altrimenti lontano dai nemici vicini
      const ahead = g.gates.filter((x) => !x.used && x.z - g.z > -1 && x.z - g.z < 45);
      const good = ahead.filter((x) => x.def.good).sort((a, b) => a.z - b.z)[0];
      const bad = ahead.filter((x) => !x.def.good).sort((a, b) => a.z - b.z)[0];
      if (good) g.tx = good.x; else if (bad) g.tx = -bad.x;
      const before = g.gates.filter((x) => !x.used);
      g.update(1 / 30);
      for (const x of before) if (x.used && !x.group.visible) out.taken.push({ t: g.t0, d: x.def.text.split('.').pop() + (x.def.good ? '+' : '-') });
      if (i % 300 === 299) out.line.push(`${Math.round(g.t0)}s ond${g.wave} hp${g.hp} vivi${g.enemies.filter((e) => !e.dead).length} arma${g.weapon} all${g.allies.length} press${g.pressure.toFixed(2)}`);
      if (g.wave !== lastWave) { lastWave = g.wave; out.waves.push({ wave: g.wave, t: g.t0 }); }
      if (g.state === 'over') { out.dieAt = g.t0; break; }
    }
    out.wave = g.wave; out.kills = g.kills; out.weapon = g.weapon; out.allies = g.allies.length; out.hp = g.hp; out.z = Math.round(g.z);
    return out;
  }, { WATTS, KMH, SEC });
  runs.push(res);
  const gaps = res.spawned.slice(1).map((s, i) => s.t - res.spawned[i].t);
  console.log(`corsa ${r + 1}: portali comparsi ${res.spawned.length} (ogni ${(gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length)).toFixed(1)} s), presi ${res.taken.length}, ondata ${res.wave}, uccisioni ${res.kills}, arma ${res.weapon}, alleati ${res.allies}, ${res.dieAt ? `morto a ${res.dieAt.toFixed(0)} s` : 'vivo a fine prova'}`);
  const types = {}; for (const s of res.spawned) for (const d of s.defs) types[d] = (types[d] || 0) + 1;
  if (args.includes('--line')) console.log('  ' + res.line.join('\n  '));
  console.log('  tipi comparsi:', JSON.stringify(types)); console.log('  ondate:', res.waves.map((w) => `${w.wave}@${w.t.toFixed(0)}s`).join(' '));
}
await browser.close();
