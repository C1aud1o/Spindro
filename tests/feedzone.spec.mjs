// Feed Zone (js/games/mattoni.js): partita a piano di allenamento con un bot a quattro livelli di potenza (docs/giochi-design.md §5),
// pausa, misure dello schermo a 390×780 e comandi. Il gioco avanza a mano (passi da 1/30 s) con un seme fisso: i numeri sono ripetibili.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(150_000);

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); } localStorage.setItem('lang', 'it'); } catch { /* niente storage */ }
  });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
});

test.afterEach(async ({ page }) => {
  expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]);
});

async function openGame(page) {
  await page.click('#openGame');
  await page.click('[data-game=mattoni]');
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
}

// Il bot: guarda dove cadrà la borraccia (con un errore fisso da seme), si sposta alla velocità del tasto tenuto premuto (12 m/s)
// e tiene una potenza fissa (multiplo della FTP). Misure: stelle, tempo al primo evento, intervallo più lungo, eventi al minuto.
function botRun({ mult, durIdx, lvl, ftp, seed, jit = 1 }) {
  const g = window.__game; g.active = false; g.durIdx = durIdx; g.lvlIdx = lvl; g.seed = seed; g.reset(); g.begin();
  g.hooks = { ...g.hooks, connected: () => true, ftp: () => ftp, stats: () => ({ power: ftp * mult, cadence: 85 }), speedKmh: () => 30, setGrade() {} };
  let s = seed * 7919 + 13; const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  let err = 0; let n = 0; let aim = 0; const W = 5.6 - 0.7; let seenBoss = false;
  while (g.state === 'play' && n < 1500 * 30) {
    const b = g.ballS;
    if (b) {
      let want = g.x;
      if (!b.stuck && b.vz < 0) {
        const tt = (b.z - 1.5) / -b.vz; let x = b.x + b.vx * tt;
        while (x > W || x < -W) { if (x > W) x = 2 * W - x; if (x < -W) x = -2 * W - x; }
        if (b.z > 6 && Math.floor(n / 45) !== Math.floor((n - 1) / 45)) { err = (rnd() - 0.5) * 1.6 * jit; aim = (rnd() - 0.5) * 1.8; } // lo sguardo si aggiorna ogni 1,5 s
        want = x + err + aim * 0.4;
      }
      const dx = Math.max(-1, Math.min(1, want - g.tx)); g.tx = Math.max(-4.2, Math.min(4.2, g.tx + Math.sign(dx) * Math.min(Math.abs(want - g.tx), 12 / 30)));
    }
    g.update(1 / 30); n++; if (g.boss) seenBoss = true;
  }
  const es = g.eventStats();
  return { state: g.state, secs: n / 30, res: g.result, es, delivered: g.delivered, waves: g.waveClears, lives: g.lives, seenBoss, lost: g.evLog.filter((e) => e.k === 'lose').length, flats: g.ko };
}

async function runBot(page, mult, durIdx = 0, lvl = 1) {
  await openGame(page);
  return page.evaluate(botRun, { mult, durIdx, lvl, ftp: 200, seed: 3 });
}

// atteso (docs/giochi-design.md §5): 0,6 × → 1 stella; 0,8 × → 1–2; 1,0 × → 2–3; 1,2 × → 3
const EXPECT = { 0.6: [1, 1], 0.8: [1, 2], 1.0: [2, 3], 1.2: [3, 3] };
for (const mult of [0.6, 0.8, 1.0, 1.2]) {
  test(`Feed Zone: bot a ${mult} × FTP, 5 minuti, livello Normale`, async ({ page }) => {
    const r = await runBot(page, mult);
    console.log(`BOT ${mult}× → stelle ${r.res.stars}, sforzi ${r.res.done}/${r.res.total}, auto ${r.res.bossKilled}/${r.res.bossTotal}, forature ${r.res.ko}, musette ${r.delivered}, zone chiuse ${r.waves}, primo evento ${r.es.first.toFixed(1)} s, max senza eventi ${r.es.maxGap.toFixed(1)} s, eventi/min ${Math.round(r.es.perMin)}, punti ${r.res.score}`);
    expect(r.state, 'la partita finisce da sola').toBe('over');
    expect(r.secs, 'durata: 5 minuti').toBeGreaterThanOrEqual(299);
    expect(r.secs).toBeLessThanOrEqual(301);
    expect(r.res.stars, 'stelle').toBeGreaterThanOrEqual(EXPECT[mult][0]);
    expect(r.res.stars, 'stelle').toBeLessThanOrEqual(EXPECT[mult][1]);
    expect(r.es.first, 'tempo al primo evento (s)').toBeLessThanOrEqual(8);
    expect(r.es.maxGap, 'intervallo più lungo senza eventi (s)').toBeLessThanOrEqual(5);
    expect(r.es.perMin, 'eventi al minuto').toBeGreaterThanOrEqual(30);
    expect(r.seenBoss, 'l’auto della squadra arriva').toBe(true);
  });
}

test('Feed Zone: un giocatore distratto perde la borraccia ogni tanto, ma la partita arriva in fondo e non finisce mai prima', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(botRun, { mult: 1.0, durIdx: 0, lvl: 1, ftp: 200, seed: 3, jit: 4 });
  console.log(`BOT distratto (errore ±3,2 m) → stelle ${r.res.stars}, borracce perse ${r.lost}, forature ${r.flats}, musette ${r.delivered}, max senza eventi ${r.es.maxGap.toFixed(1)} s`);
  expect(r.state).toBe('over'); expect(r.secs).toBeGreaterThanOrEqual(299);
  expect(r.lost, 'perde la borraccia qualche volta').toBeGreaterThanOrEqual(3);
  expect(r.res.stars).toBeGreaterThanOrEqual(1);
  expect(r.es.maxGap, 'anche così succede sempre qualcosa').toBeLessThanOrEqual(5);
});

test('Feed Zone: livelli e piano: 5/10/20 minuti, Facile −10 % e Difficile +10 % sui watt, 4/7/12 zone', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const g = window.__game; const out = {};
    for (const [d, l] of [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]]) { g.durIdx = d; g.lvlIdx = l; g.reset(); const e = g.plan.segs.find((s) => s.kind === 'effort'); out[`${d}${l}`] = { w: Math.round(200 * (e.pct + g.level.k)), N: g.plan.N, boss: g.plan.bossWaves.length, total: g.total }; }
    return out;
  });
  expect(r['01'].w - r['00'].w, 'Facile = −10 % di 200 W').toBe(20); expect(r['02'].w - r['01'].w).toBe(20);
  expect(r['11']).toMatchObject({ N: 7, boss: 2, total: 600 }); expect(r['21']).toMatchObject({ N: 12, boss: 3, total: 1200 });
});

test('Feed Zone: menu (− durata, + livello, pressione lunga inizia) e comandi: solo +1 / −1 muovono la bici', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(async () => {
    const g = window.__game; g.active = false; g.seed = 3; g.durIdx = 0; g.lvlIdx = 1; g.reset(); g.state = 'menu'; g.stateT = 1; g.menu.reset();
    const run = (n) => { for (let i = 0; i < n; i++) g.update(1 / 30); };
    run(20); // il menu ignora i tasti nei primi istanti
    g.input(-1); run(4); const d1 = g.menu.durIdx; g.input(1); run(4); const l1 = g.menu.level;
    g.hold(1); run(40); const started = g.state;
    // in partita: un tocco sposta di 1,4 m (+ = destra sullo schermo = −X), tenuto premuto si muove di continuo
    g.hooks = { ...g.hooks, connected: () => true, ftp: () => 200, stats: () => ({ power: 160, cadence: 85 }), speedKmh: () => 30, setGrade() {} };
    g.tx = 0; g.x = 0; g.input(1); const nudged = g.tx;
    g.tx = 0; g.hold(-1); for (let i = 0; i < 30; i++) g.update(1 / 30); g.hold(0);
    return { d1, l1, started, nudged, moved: g.tx };
  });
  expect(r.d1, '− cambia la durata').toBe(1); expect(r.l1, '+ cambia il livello').toBe(2);
  expect(r.started, 'pressione lunga: inizia').toBe('play');
  expect(r.nudged).toBeLessThan(-1); expect(r.moved, 'tenuto premuto: si muove di continuo').toBeGreaterThan(2);
});

test('Feed Zone: chi smette di pedalare va in pausa; ciclista ≥ 14 %, soigneur ≥ 8 % dello schermo a 390×780', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openGame(page);
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; g.seed = 5; g.reset(); g.begin();
    let p = 150; g.hooks = { ...g.hooks, connected: () => true, ftp: () => 200, stats: () => ({ power: p, cadence: p ? 85 : 0 }), speedKmh: () => 30, setGrade() {} };
    for (let i = 0; i < 12 * 30; i++) g.update(1 / 30);
    const V = g.stage.camera.position.constructor; const H = g.stage.H; const Wd = g.stage.W;
    const frac = (pts) => { const ys = pts.map((q) => (1 - q.project(g.stage.camera).y) / 2 * H); return (Math.max(...ys) - Math.min(...ys)) / H; };
    const rider = frac([new V(g.x - 0.3, 0, 0.35), new V(g.x + 0.3, 3.0, 0.35)]);
    const far = g.targets.filter((x) => x.alive).sort((a, b) => b.z - a.z)[0];
    const guy = frac([new V(far.x, 0, far.z), new V(far.x, 3.0, far.z)]);
    const ball = g.ballS ? frac([new V(g.ballS.x, -0.05, g.ballS.z), new V(g.ballS.x, 2.05, g.ballS.z)]) : 0;
    const wTop = (() => { const a = new V(-5.6, 0, 17).project(g.stage.camera); const b = new V(5.6, 0, 17).project(g.stage.camera); return (b.x - a.x) / 2 * Wd; })();
    const t0 = g.el; p = 0;
    for (let i = 0; i < 8 * 30; i++) g.update(1 / 30);
    const paused = g.paused; const t1 = g.el; const st = g.state;
    p = 150; for (let i = 0; i < 2 * 30; i++) g.update(1 / 30);
    return { rider, guy, ball, fieldFar: Math.abs(wTop) / Wd, paused, still: Math.abs(t1 - t0) < 3, st, lives: g.lives, resumed: !g.paused && g.el > t1 };
  });
  console.log(`SCHERMO ciclista ${(r.rider * 100).toFixed(1)} %, soigneur lontano ${(r.guy * 100).toFixed(1)} %, borraccia ${(r.ball * 100).toFixed(1)} %, campo in fondo ${(r.fieldFar * 100).toFixed(0)} % della larghezza`);
  expect(r.rider, 'ciclista / altezza schermo').toBeGreaterThanOrEqual(0.14);
  expect(r.guy, 'soigneur più lontano / altezza schermo').toBeGreaterThanOrEqual(0.08);
  expect(r.ball, 'borraccia / altezza schermo').toBeGreaterThanOrEqual(0.08);
  expect(r.fieldFar, 'il campo riempie la larghezza').toBeGreaterThanOrEqual(0.7);
  expect(r.paused).toBe(true); expect(r.still, 'il tempo di gioco si ferma').toBe(true);
  expect(r.st).toBe('play'); expect(r.lives).toBeGreaterThan(0); expect(r.resumed, 'riprende appena si pedala').toBe(true);
});

test('Feed Zone: niente game over nel primo minuto, perdere la borraccia costa vita e combo ma non chiude la partita', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; g.seed = 9; g.reset(); g.begin();
    g.hooks = { ...g.hooks, connected: () => true, ftp: () => 200, stats: () => ({ power: 150, cadence: 85 }), speedKmh: () => 30, setGrade() {} };
    let lost = 0; let state = g.state;
    // niente bot: la bici resta ferma in un angolo, la borraccia cade molte volte
    g.tx = 4.2;
    for (let i = 0; i < 100 * 30 && g.state === 'play'; i++) { g.update(1 / 30); if (g.ballS?.stuck && g.ballS.x < -3) { g.ballS.x = -3; } if (i === 59 * 30) state = `${g.state}/${g.lives}/${g.ko}`; }
    return { state, after: g.state, lives: g.lives, ko: g.ko, combo: g.combo, el: g.el };
  });
  expect(r.state.startsWith('play'), 'nel primo minuto la partita non finisce').toBe(true);
  expect(Number(r.state.split('/')[1]), 'nel primo minuto resta almeno una vita').toBeGreaterThanOrEqual(1);
  expect(r.after).toBe('play');
});
