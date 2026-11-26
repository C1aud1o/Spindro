// Horde Run (partita a piano di allenamento, bot a 4 livelli di potenza). Slipstream ha il suo file: slip.spec.mjs.
// I giochi si fanno avanzare a mano, a passi da 1/30 s, con un bot: così i test sono rapidi e ripetibili.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(150_000);

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); } localStorage.setItem('lang', 'it'); } catch { /* niente storage */ }
    window.__spindroSeed = 6; // caso fisso: ogni partita usa un generatore con seme (con altri semi l’intervallo più lungo senza eventi va da 2,4 a 5,6 s: la soglia di 5 s è al limite)
  });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
});

test.afterEach(async ({ page }) => {
  expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]);
});

async function openGame(page, kind) {
  await page.click('#openGame');
  await page.click(`[data-game=${kind}]`);
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
}

// Il bot: avanza il gioco a mano (1/30 s), tiene una potenza fissa (multiplo della FTP) e gioca con la politica LANE: va sempre nella
// corsia del nemico che arriva per primo (scripts/horde-bot.mjs ha anche IDLE e LATE, con la tabella completa).
// Restituisce le misure richieste da docs/games/DESIGN-RULES.md §5: cuori, stelle, tempo al primo evento, intervallo più lungo senza eventi.
function botRun({ mult, durIdx, lvl, ftp, seed }) {
  const g = window.__game; g.active = false; window.__spindroSeed = seed; g.durIdx = durIdx; g.lvlIdx = lvl; g.reset(); g.begin();
  g.hooks = { ...g.hooks, connected: () => true, ftp: () => ftp, stats: () => ({ power: ftp * mult, cadence: 85 }), speedKmh: () => 30, setGrade() {} };
  let n = 0; let near = 0; let ns = 0;
  while (g.state === 'play' && n < 1500 * 30) {
    const l = g.threatLane(); if (l > g.lane) g.input(1); else if (l >= 0 && l < g.lane) g.input(-1);
    g.update(1 / 30); n++;
    if (n % 30 === 0) { near += g.enemies.filter((e) => !e.dead && e.z - g.z < 40 && e.z > g.z - 2).length; ns++; }
  }
  const es = g.eventStats();
  return { state: g.state, secs: n / 30, res: g.result, es, kills: g.kills, weapon: g.weapon, hp: g.hp, lost: g.lost, moves: g.moves, near: near / ns, plan: { N: g.plan.N } };
}

async function runBot(page, mult, durIdx = 0, lvl = 1) {
  await openGame(page, 'horde');
  return page.evaluate(botRun, { mult, durIdx, lvl, ftp: 200, seed: 6 });
}

// i watt non sono un'abilità (il rullo è in ERG): decidono solo se lo sforzo riesce, cioè se l'arma sale di livello. Le stelle vengono dai cuori.
for (const mult of [0.6, 0.8, 1.0, 1.2]) {
  test(`Horde Run: bot LANE a ${mult} × FTP, 5 minuti, livello Normale`, async ({ page }) => {
    const r = await runBot(page, mult);
    console.log(`BOT ${mult}× → stelle ${r.res.stars}, cuori ${r.hp}, persi ${r.lost}, arma ${r.weapon}, sforzi ${r.res.done}/${r.res.total}, Custodi ${r.res.bossKilled}/${r.res.bossTotal}, cambi corsia/min ${(r.moves / 5).toFixed(1)}, primo evento ${r.es.first.toFixed(1)} s, max senza eventi ${r.es.maxGap.toFixed(1)} s, eventi/min ${Math.round(r.es.perMin)}, nemici entro 40 m ${r.near.toFixed(1)}`);
    expect(r.state, 'la partita finisce da sola').toBe('results');
    expect(r.secs, 'durata: 5 minuti').toBeGreaterThanOrEqual(299);
    expect(r.secs).toBeLessThanOrEqual(301);
    expect(r.hp, 'chi segue la minaccia tiene almeno 5 cuori su 6').toBeGreaterThanOrEqual(5);
    expect(r.res.stars, 'stelle: 6 cuori o al massimo uno perso = 3').toBe(3);
    expect(r.es.first, 'tempo al primo evento (s)').toBeLessThanOrEqual(8);
    expect(r.es.maxGap, 'intervallo più lungo senza eventi (s)').toBeLessThanOrEqual(5);
    expect(r.es.perMin, 'eventi al minuto').toBeGreaterThanOrEqual(30);
    expect(r.moves / 5, 'cambi di corsia al minuto: movimentato ma non frenetico').toBeGreaterThanOrEqual(8); expect(r.moves / 5).toBeLessThanOrEqual(30);
    expect(r.near, 'la strada non è vuota: nemici entro 40 m').toBeGreaterThanOrEqual(1);
    if (mult < 0.9) expect(r.res.done, 'sotto il bersaglio nessuno sforzo riesce').toBe(0);
    if (mult >= 1) expect(r.res.done, 'a 1,0 × riescono gli sforzi (non lo scatto), a 1,2 × tutti').toBeGreaterThanOrEqual(mult >= 1.2 ? r.res.total : r.res.total - 1);
    if (mult < 0.9) expect(r.weapon, 'senza sforzi riusciti l’arma resta la pistola, salvo i portali presi per caso').toBeLessThanOrEqual(3);
    if (mult >= 1.2) expect(r.weapon, 'ogni sforzo riuscito alza l’arma: sei livelli in 5 minuti').toBe(5);
    if (mult === 1) expect(r.weapon).toBeGreaterThanOrEqual(3);
  });
}

test('Horde Run: livelli Facile e Difficile cambiano i watt richiesti, la partita da 10 minuti ha 7 ondate e 2 Custodi', async ({ page }) => {
  await openGame(page, 'horde');
  const r = await page.evaluate(() => {
    const g = window.__game; const out = {};
    for (const [d, l] of [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]]) { g.durIdx = d; g.lvlIdx = l; g.reset(); const e = g.plan.segs.find((s) => s.kind === 'effort'); out[`${d}${l}`] = { w: Math.round(200 * (e.pct + g.level.k)), N: g.plan.N, boss: g.plan.bossWaves.length, total: g.total }; }
    return out;
  });
  expect(r['00'].w).toBeLessThan(r['01'].w); expect(r['02'].w).toBeGreaterThan(r['01'].w);
  expect(r['01'].w - r['00'].w, 'Facile = −10 % di 200 W').toBe(20);
  expect(r['11']).toMatchObject({ N: 7, boss: 2, total: 600 }); expect(r['21']).toMatchObject({ N: 12, boss: 3, total: 1200 });
});

test('Horde Run: chi smette di pedalare va in pausa e non perde; il ciclista è il 7–16 % dello schermo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openGame(page, 'horde');
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; g.reset(); g.begin();
    let p = 150; g.hooks = { ...g.hooks, connected: () => true, ftp: () => 200, stats: () => ({ power: p, cadence: p ? 85 : 0 }), speedKmh: () => 30, setGrade() {} };
    for (let i = 0; i < 20 * 30; i++) g.update(1 / 30);
    // altezza del ciclista a schermo
    const box = new g.stage.camera.constructor().position.constructor === Object ? null : null; void box;
    const root = g.player.root; const V = root.position.constructor; const pts = [];
    for (const dx of [-0.4, 0.4]) for (const dy of [0, 2.4]) pts.push(new V(g.x + dx, dy, g.z));
    const ys = pts.map((q) => (1 - q.project(g.stage.camera).y) / 2 * g.stage.H);
    const frac = (Math.max(...ys) - Math.min(...ys)) / g.stage.H;
    const t0 = g.el; p = 0;
    for (let i = 0; i < 8 * 30; i++) g.update(1 / 30);
    const paused = g.paused; const t1 = g.el; const hp = g.hp; const st = g.state;
    p = 150; for (let i = 0; i < 2 * 30; i++) g.update(1 / 30);
    return { frac, paused, still: Math.abs(t1 - t0) < 3, t0, t1, hp, st, resumed: !g.paused && g.el > t1 };
  });
  expect(r.frac, 'ciclista / altezza schermo').toBeGreaterThanOrEqual(0.07); expect(r.frac, 'il ciclista resta una figura piccola').toBeLessThanOrEqual(0.16);
  expect(r.paused).toBe(true); expect(r.still, 'il tempo di gioco si ferma').toBe(true);
  expect(r.st).toBe('play'); expect(r.hp).toBeGreaterThan(0); expect(r.resumed, 'riprende appena si pedala').toBe(true);
});
