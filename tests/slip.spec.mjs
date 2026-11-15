// Slipstream (gruppetto): partita a piano di allenamento, bot a 4 livelli di potenza, ponti, corsie, pausa, grafica.
// Il gioco si fa avanzare a mano, a passi da 1/30 s, con un bot deterministico: i test sono rapidi e ripetibili.
// Nello script di prova a game.input() si passa solo +1 o −1.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(150_000);

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); } localStorage.setItem('lang', 'it'); } catch { /* niente storage */ }
    // caso fisso: stessi numeri a ogni prova
    let s = 12345; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
});

test.afterEach(async ({ page }) => {
  expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]);
});

async function openSlip(page) {
  await page.click('#openGame');
  await page.click('[data-game=gruppetto]');
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
}

// Il bot: tiene una potenza fissa (multiplo della FTP) e va nella corsia del corridore da prendere (solo input +1 / −1).
// Misure di docs/giochi-design.md §5: stelle, tempo al primo evento, intervallo più lungo senza eventi, eventi al minuto.
function botRun({ mult, durIdx, lvl, ftp }) {
  const g = window.__game; g.active = false; g.durIdx = durIdx; g.lvlIdx = lvl; g.reset(); g.begin();
  g.hooks = { ...g.hooks, connected: () => true, ftp: () => ftp, stats: () => ({ power: ftp * mult, cadence: 85 }), speedKmh: () => 30, setGrade() {} };
  let n = 0; const segs = new Set(); let maxGroup = 0; let maxRiders = 0; let passes = 0;
  while (g.state === 'play' && n < 1500 * 30) {
    const b = g.bridge;
    if (b && b.state === 'attack' && b.lane !== g.lane) g.input(b.lane > g.lane ? 1 : -1);
    g.update(1 / 30); n++;
    segs.add(g.seg.kind); maxGroup = Math.max(maxGroup, g.group.length);
    if (n % 30 === 0) maxRiders = Math.max(maxRiders, g.group.length + g.escapees.length + (g.bridge ? g.bridge.riders.length : 0));
  }
  const es = g.eventStats(); const kinds = {}; for (const e of g.evLog) kinds[e.k] = (kinds[e.k] || 0) + 1;
  return { state: g.state, secs: n / 30, res: g.result, es, kinds, segs: [...segs], maxGroup, N: g.plan.N, score: g.score };
}

async function runBot(page, mult, durIdx = 0, lvl = 1) {
  await openSlip(page);
  return page.evaluate(botRun, { mult, durIdx, lvl, ftp: 200 });
}

// atteso (docs/giochi-design.md §5): 0,6 × → 1 stella; 0,8 × → 1–2; 1,0 × → 2–3; 1,2 × → 3
const EXPECT = { 0.6: [1, 1], 0.8: [1, 2], 1.0: [2, 3], 1.2: [3, 3] };
for (const mult of [0.6, 0.8, 1.0, 1.2]) {
  test(`Slipstream: bot a ${mult} × FTP, 5 minuti, livello Normale`, async ({ page }) => {
    const r = await runBot(page, mult);
    console.log(`BOT ${mult}× → stelle ${r.res.stars}, ponti ${r.res.done}/${r.res.total}, corridori ${r.res.caught}/${r.res.riders}, persi ${r.res.dropped}, volata finale ${r.res.finalWon ? 'sì' : 'no'}, punti ${r.res.score}, primo evento ${r.es.first.toFixed(1)} s, max senza eventi ${r.es.maxGap.toFixed(1)} s, eventi/min ${Math.round(r.es.perMin)}, tipi ${JSON.stringify(r.kinds)}`);
    expect(r.state, 'la partita finisce da sola').toBe('over');
    expect(r.secs, 'durata: 5 minuti').toBeGreaterThanOrEqual(299);
    expect(r.secs).toBeLessThanOrEqual(301);
    expect(r.res.stars, 'stelle').toBeGreaterThanOrEqual(EXPECT[mult][0]);
    expect(r.res.stars, 'stelle').toBeLessThanOrEqual(EXPECT[mult][1]);
    expect(r.es.first, 'tempo al primo evento (s)').toBeLessThanOrEqual(8);
    expect(r.es.maxGap, 'intervallo più lungo senza eventi (s)').toBeLessThanOrEqual(5);
    expect(r.es.perMin, 'eventi al minuto').toBeGreaterThanOrEqual(20);
    expect(r.segs, 'tutti i tratti dell’allenamento').toEqual(expect.arrayContaining(['warm', 'pace', 'effort', 'sprint', 'rest', 'cool']));
    expect(r.res.total, 'ponti in 5 minuti (4 sforzi, l’ultimo con la volata)').toBe(5);
  });
}

test('Slipstream: la partita è deterministica (stesso bot, stessi numeri)', async ({ page }) => {
  await openSlip(page);
  const a = await page.evaluate(botRun, { mult: 0.9, durIdx: 0, lvl: 1, ftp: 200 });
  const b = await page.evaluate(botRun, { mult: 0.9, durIdx: 0, lvl: 1, ftp: 200 });
  const core = (r) => { const { newBest, prevStars, ...rest } = r.res; return rest; };
  expect(core(b)).toEqual(core(a)); expect(b.es).toEqual(a.es); expect(b.kinds).toEqual(a.kinds);
});

test('Slipstream: livelli, durate e adattamento', async ({ page }) => {
  await openSlip(page);
  const r = await page.evaluate(() => {
    const g = window.__game; const out = {};
    for (const [d, l] of [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]]) { g.durIdx = d; g.lvlIdx = l; g.reset(); const e = g.plan.segs.find((s) => s.kind === 'effort'); out[`${d}${l}`] = { w: Math.round(200 * (e.pct + g.level.k)), N: g.plan.N, total: g.total, sprints: g.plan.segs.filter((s) => s.kind === 'sprint').length, kinds: [...new Set(g.plan.segs.map((s) => s.kind))].join() }; }
    // nessuno sforzo sopra soglia per più di 90 s di fila, recuperi di almeno 40 s dopo i blocchi (20 min)
    g.durIdx = 2; g.reset(); let run = 0; let maxRun = 0; for (const s of g.plan.segs) { if (s.pct >= 0.95) { run += s.t1 - s.t0; maxRun = Math.max(maxRun, run); } else run = 0; }
    out.maxRun = maxRun;
    return out;
  });
  expect(r['00'].w).toBeLessThan(r['01'].w); expect(r['02'].w).toBeGreaterThan(r['01'].w);
  expect(r['01'].w - r['00'].w, 'Facile = −10 % di 200 W').toBe(20);
  expect(r['11']).toMatchObject({ N: 7, total: 600, sprints: 2 }); expect(r['21']).toMatchObject({ N: 12, total: 1200, sprints: 3 });
  expect(r['01'].kinds.split(',').sort()).toEqual(['cool', 'effort', 'pace', 'rest', 'sprint', 'warm']);
  expect(r.maxRun, 'sforzo continuo sopra soglia (s)').toBeLessThanOrEqual(90);
});

test('Slipstream: il corridore davanti si prende solo nella sua corsia; + / − cambiano corsia', async ({ page }) => {
  await openSlip(page);
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; g.reset(); g.begin();
    g.hooks = { ...g.hooks, connected: () => true, ftp: () => 200, stats: () => ({ power: 200, cadence: 85 }), speedKmh: () => 30, setGrade() {} };
    // porta il gioco al primo ponte (tratto sforzo) senza muovere la corsia
    let n = 0; while (!(g.bridge?.state === 'attack' && g.seg.kind === 'effort') && n < 3000) { g.update(1 / 30); n++; }
    const lane0 = g.lane; g.bridge.lane = lane0 === 1 ? 0 : lane0 + 1; // il corridore sta in una corsia diversa
    let m = 0; while (g.bridge && !g.blocked && m < 900) { g.update(1 / 30); m++; if (g.bridge) g.bridge.lane = lane0 === 1 ? 0 : lane0 + 1; }
    const blocked = g.blocked; const gapStuck = g.bridge ? g.bridge.gap : null; const caught0 = g.caught;
    const want = g.bridge.lane; const dir = want > g.lane ? 1 : -1; g.input(dir); if (g.lane !== want) g.input(dir);
    let k = 0; while (g.bridge && k < 200) { g.update(1 / 30); k++; }
    return { blocked, gapStuck, caught0, caught1: g.caught, lane: g.lane, want, group: g.group.length };
  });
  expect(r.blocked, 'in un’altra corsia il gap si ferma a 1,6 m').toBe(true);
  expect(r.gapStuck).toBeCloseTo(1.6, 1); expect(r.caught0).toBe(0);
  expect(r.lane).toBe(r.want); expect(r.caught1, 'cambiata la corsia, lo prende').toBeGreaterThanOrEqual(1); expect(r.group).toBeGreaterThanOrEqual(1);
});

test('Slipstream: chi smette di pedalare va in pausa e non perde; ciclista ≥ 14 % e corridore davanti ≥ 8 % dello schermo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openSlip(page);
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; g.reset(); g.begin();
    let p = 150; g.hooks = { ...g.hooks, connected: () => true, ftp: () => 200, stats: () => ({ power: p, cadence: p ? 85 : 0 }), speedKmh: () => 30, setGrade() {} };
    const frac = (x, z, h = 2.4) => {
      const V = g.player.root.position.constructor; const ys = [];
      for (const dy of [0, h]) ys.push((1 - new V(x, dy, z).project(g.stage.camera).y) / 2 * g.stage.H);
      return Math.abs(ys[1] - ys[0]) / g.stage.H;
    };
    const b = g.bridge; const target = frac(b.riders[0].x, b.riders[0].z); const gap = b.gap; // il primo corridore, a 18 m
    for (let i = 0; i < 4 * 30; i++) g.update(1 / 30);
    const player = frac(g.x, g.z);
    for (let i = 0; i < 12 * 30; i++) g.update(1 / 30);
    const t0 = g.el; p = 0;
    for (let i = 0; i < 8 * 30; i++) g.update(1 / 30);
    const paused = g.paused; const t1 = g.el; const st = g.state; const score = g.score;
    p = 150; for (let i = 0; i < 2 * 30; i++) g.update(1 / 30);
    return { player, target, gap, paused, still: Math.abs(t1 - t0) < 3, st, resumed: !g.paused && g.el > t1, score };
  });
  expect(r.player, 'ciclista / altezza schermo').toBeGreaterThanOrEqual(0.14);
  expect(r.target, `corridore a ${Math.round(r.gap)} m / altezza schermo`).toBeGreaterThanOrEqual(0.08);
  expect(r.paused).toBe(true); expect(r.still, 'il tempo di gioco si ferma').toBe(true);
  expect(r.st).toBe('play'); expect(r.resumed, 'riprende appena si pedala').toBe(true);
});
