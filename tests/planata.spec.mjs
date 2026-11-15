// Updraft: partita a piano di allenamento (quota = % FTP), bot a 4 livelli di potenza, pausa, comandi, misure a schermo.
// Il gioco si fa avanzare a mano, a passi da 1/30 s, con un bot deterministico (caso con seme fisso): i test sono rapidi e ripetibili.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(150_000);

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); } localStorage.setItem('lang', 'en'); } catch { /* niente storage */ }
    window.__spindroSeed = 12345; // caso fisso: stessi numeri a ogni prova
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
  await page.click('[data-game=planata]');
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
}

// Il bot tiene una potenza fissa (multiplo della FTP) e lascia fare al pilota automatico.
function botRun({ mult, durIdx, lvl, ftp }) {
  const g = window.__game; g.active = false; g.durIdx = durIdx; g.lvlIdx = lvl; g.reset(); g.t = 0; g.power = ftp * mult; g.begin(); // t e potenza fissati: il menu girava in tempo reale
  g.hooks = { ...g.hooks, connected: () => true, ftp: () => ftp, stats: () => ({ power: ftp * mult, cadence: 85 }), speedKmh: () => 30, setGrade() {} };
  let n = 0; let minute1Over = false; const dt = 1 / 30;
  while (g.state === 'play' && n < 1500 * 30) { g.update(dt); n++; if (n === 60 * 30 && g.state !== 'play') minute1Over = true; }
  const es = g.eventStats();
  return { state: g.state, secs: n * dt, res: g.result, es, minute1Over, rings: g.rings, ringsTotal: g.ringsTotal, coins: g.coins, hits: g.hits, bestCombo: g.bestCombo, score: Math.round(g.score), N: g.plan.N, y: g.y, landed: g.landing };
}

async function runBot(page, mult, durIdx = 0, lvl = 1) {
  await openGame(page);
  return page.evaluate(botRun, { mult, durIdx, lvl, ftp: 200 });
}

// atteso (docs/giochi-design.md §5): 0,6 × → 1 stella; 0,8 × → 1–2; 1,0 × → 2–3; 1,2 × → 3
const EXPECT = { 0.6: [1, 1], 0.8: [1, 2], 1.0: [2, 3], 1.2: [3, 3] };
for (const mult of [0.6, 0.8, 1.0, 1.2]) {
  test(`Updraft: bot a ${mult} × FTP, 5 minuti, livello Normale`, async ({ page }) => {
    const r = await runBot(page, mult);
    console.log(`BOT ${mult}× → stelle ${r.res.stars}, sforzi ${r.res.done}/${r.res.total}, anelli ${r.rings}/${r.ringsTotal}, tempeste prese ${r.hits}, stelle raccolte ${r.coins}, combo max ${r.bestCombo}, primo evento ${r.es.first.toFixed(1)} s, max senza eventi ${r.es.maxGap.toFixed(1)} s, eventi/min ${Math.round(r.es.perMin)}`);
    expect(r.state, 'la partita finisce da sola').toBe('over');
    expect(r.secs, 'durata: 5 minuti').toBeGreaterThanOrEqual(299);
    expect(r.secs).toBeLessThanOrEqual(301);
    expect(r.minute1Over, 'nessun game over nel primo minuto').toBe(false);
    expect(r.res.stars, 'stelle').toBeGreaterThanOrEqual(EXPECT[mult][0]);
    expect(r.res.stars, 'stelle').toBeLessThanOrEqual(EXPECT[mult][1]);
    expect(r.es.first, 'tempo al primo evento (s)').toBeLessThanOrEqual(8);
    expect(r.es.maxGap, 'intervallo più lungo senza eventi (s)').toBeLessThanOrEqual(5);
    expect(r.es.perMin, 'eventi al minuto').toBeGreaterThanOrEqual(20);
    expect(r.ringsTotal, 'anelli in 5 minuti').toBeGreaterThanOrEqual(70);
    expect(r.res.ringsTotal, 'il riepilogo ha i numeri definitivi').toBe(r.ringsTotal);
    expect(r.y, 'a fine partita l’aereo è sulla pista (atterrato)').toBeLessThan(3);
  });
}

test('Updraft: livelli, durate, profilo dolce e quota = % FTP', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(async () => {
    const g = window.__game; const out = {};
    const P = await import('./js/games/planata-plan.js');
    for (const [d, l] of [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]]) { g.durIdx = d; g.lvlIdx = l; g.reset(); const e = g.plan.segs.find((s) => s.kind === 'effort'); out[`${d}${l}`] = { w: Math.round(200 * (e.pct + g.level.k)), N: g.plan.N, climbs: g.plan.climbWaves.length, total: g.total }; }
    const plan = P.buildPlan(300);
    // mai più di 90 s di sforzo sopra soglia senza un recupero di almeno 40 s (in tutte e tre le durate)
    const maxRun = {};
    for (const tot of [300, 600, 1200]) { const pl = P.buildPlan(tot); let run = 0; let worst = 0; let restLen = 99; for (const s of pl.segs) { const len = s.t1 - s.t0; if (s.kind === 'effort' || s.kind === 'climb') { run += len; worst = Math.max(worst, run); } else if (s.kind === 'rest') { run = 0; } } maxRun[tot] = { worst: Math.round(worst), rest: Math.round(pl.segs.find((s) => s.kind === 'rest').t1 - pl.segs.find((s) => s.kind === 'rest').t0), warm: pl.segs[0].t1, cool: pl.segs.at(-1).t1 - pl.segs.at(-1).t0 }; }
    // il profilo è continuo: nessun salto più grande di 0,15 di FTP in un decimo di secondo
    let jump = 0; let prev = P.profilePct(plan, 0, 0, 0); for (let t = 0.1; t < 300; t += 0.1) { const v = P.profilePct(plan, t, 0, 0); jump = Math.max(jump, Math.abs(v - prev)); prev = v; }
    return { out, maxRun, jump, alt50: P.altOf(0.5), alt130: P.altOf(1.3), alt100: P.altOf(1.0) };
  });
  expect(r.out['00'].w).toBeLessThan(r.out['01'].w); expect(r.out['02'].w).toBeGreaterThan(r.out['01'].w);
  expect(r.out['01'].w - r.out['00'].w, 'Facile = −10 % di 200 W').toBe(20);
  expect(r.out['11']).toMatchObject({ N: 7, total: 600 }); expect(r.out['21']).toMatchObject({ N: 12, total: 1200 });
  for (const v of Object.values(r.maxRun)) { expect(v.worst, 'sforzo continuo (s)').toBeLessThanOrEqual(90); expect(v.rest, 'recupero (s)').toBeGreaterThanOrEqual(15); expect(v.warm).toBeGreaterThanOrEqual(45); expect(v.warm).toBeLessThanOrEqual(60); expect(v.cool).toBeCloseTo(30, 3); }
  expect(r.jump, 'profilo dolce').toBeLessThan(0.15);
  expect(r.alt50).toBeCloseTo(4.2); expect(r.alt130).toBeCloseTo(16.2); expect(r.alt100).toBeGreaterThan(r.alt50);
});

test('Updraft: comandi del menu (− durata, + livello, + lungo avvia) e + / − cambiano corsia in volo', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; g.durIdx = 0; g.lvlIdx = 1; g.reset(); g.menu.reset();
    const o = {}; const step = (n) => { for (let i = 0; i < n; i++) g.update(1 / 30); };
    step(15); g.input(-1); g.hold(-1); g.hold(0); step(3); o.dur = g.menu.durIdx; g.input(1); g.hold(1); g.hold(0); step(3); o.lvl = g.menu.level;
    g.hold(1); for (let i = 0; i < 40; i++) g.update(1 / 30); o.state = g.state;
    g.hooks = { ...g.hooks, connected: () => true, ftp: () => 200, stats: () => ({ power: 160, cadence: 85 }), speedKmh: () => 30, setGrade() {} };
    for (let i = 0; i < 5 * 30; i++) g.update(1 / 30);
    o.x0 = g.x; g.input(1); for (let i = 0; i < 20; i++) g.update(1 / 30); o.xRight = g.x; g.input(-1); g.input(-1); for (let i = 0; i < 20; i++) g.update(1 / 30); o.xLeft = g.x;
    for (let i = 0; i < 4 * 30; i++) g.update(1 / 30); o.xAuto = g.x;
    return o;
  });
  expect(r.dur).toBe(1); expect(r.lvl).toBe(2); expect(r.state).toBe('play');
  expect(r.xRight, '+ = destra sullo schermo (x negativo nel mondo)').toBeLessThan(-3);
  expect(r.xLeft, '− = sinistra').toBeGreaterThan(3);
});

test('Updraft: chi smette di pedalare va in pausa e non perde; il ciclista è ≥ 14 % dello schermo, gli anelli ≥ 8 %', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openGame(page);
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; g.reset(); g.begin();
    let p = 160; g.hooks = { ...g.hooks, connected: () => true, ftp: () => 200, stats: () => ({ power: p, cadence: p ? 85 : 0 }), speedKmh: () => 30, setGrade() {} };
    for (let i = 0; i < 12 * 30; i++) g.update(1 / 30);
    // altezza a schermo del ciclista (sella e casco, dalle ruote al casco) e dell'anello più vicino davanti a noi
    const cam = g.stage.camera; const H = g.stage.H; const V = g.plane.position.constructor;
    const proj = (v) => (1 - v.clone().project(cam).y) / 2 * H;
    const rb = new g.plane.position.constructor().setFromMatrixPosition(g.rider.root.matrixWorld);
    const ys = [proj(rb), proj(rb.clone().add(new V(0, 1.75 * 1.4, 0)))];
    const riderFrac = Math.abs(ys[1] - ys[0]) / H;
    // anello (diametro 7,4 m) e tempesta (altezza 4,8 m): quanto è alto a schermo quando è a 40 m dalla camera (distanza in cui si decide di sterzare)
    const fovT = 2 * Math.tan(cam.fov * Math.PI / 360);
    const ringFrac = 7.4 / (fovT * 40); const stormFrac = 4.8 / (fovT * 40); const ringDist = 40; const stormDist = 40;
    const t0 = g.el; p = 0; for (let i = 0; i < 8 * 30; i++) g.update(1 / 30);
    const paused = g.paused; const t1 = g.el; const st = g.state;
    p = 150; for (let i = 0; i < 2 * 30; i++) g.update(1 / 30);
    return { riderFrac, ringFrac, ringDist, stormFrac, stormDist, paused, still: Math.abs(t1 - t0) < 3, st, resumed: !g.paused && g.el > t1 };
  });
  expect(r.riderFrac, 'ciclista / altezza schermo').toBeGreaterThanOrEqual(0.14);
  expect(r.ringFrac * 1, `anello / altezza schermo a ${r.ringDist.toFixed(0)} m`).toBeGreaterThanOrEqual(0.08);
  expect(r.stormFrac, `tempesta / altezza schermo a ${r.stormDist.toFixed(0)} m`).toBeGreaterThanOrEqual(0.08);
  expect(r.paused).toBe(true); expect(r.still, 'il tempo di gioco si ferma').toBe(true);
  expect(r.st).toBe('play'); expect(r.resumed, 'riprende appena si pedala').toBe(true);
});

test('Updraft: i messaggi stanno nello schermo a 390×780 (menu, gioco, risultato)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openGame(page);
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; g.reset(); g.begin();
    g.hooks = { ...g.hooks, connected: () => true, ftp: () => 200, stats: () => ({ power: 150, cadence: 85 }), speedKmh: () => 30, setGrade() {} };
    const ctx = g.stage.ctx; const W = g.stage.W; const bad = []; const orig = ctx.fillText.bind(ctx);
    ctx.fillText = (text, x, y, ...rest) => { const w = ctx.measureText(text).width; const a = ctx.textAlign; const l = a === 'center' ? x - w / 2 : a === 'right' ? x - w : x; const rr = l + w; if (l < -1 || rr > W + 1 || y < 0 || y > g.stage.H + 4) bad.push(`${text}@${Math.round(l)}-${Math.round(rr)},${Math.round(y)}`); return orig(text, x, y, ...rest); };
    for (let i = 0; i < 100 * 30; i++) { g.update(1 / 30); if (i % 15 === 0) g.drawHud(1 / 30); }
    g.el = g.total - 20; g.update(1 / 30); g.drawHud(0);
    for (let i = 0; i < 25 * 30; i++) { g.update(1 / 30); if (i % 15 === 0) g.drawHud(1 / 30); }
    g.stateT = 3; for (let i = 0; i < 3; i++) g.drawHud(1 / 30);
    return { bad: [...new Set(bad)], state: g.state };
  });
  expect(r.bad, 'testo fuori schermo').toEqual([]);
});

test('Updraft: prendere il pallone in corsia e restare lì costa solo la combo (tempesta), mai la partita', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; g.durIdx = 0; g.lvlIdx = 1; g.reset(); g.begin();
    g.hooks = { ...g.hooks, connected: () => true, ftp: () => 200, stats: () => ({ power: 170, cadence: 85 }), speedKmh: () => 30, setGrade() {} };
    const dt = 1 / 30; let pressed = false; let podX = null; let sawStorm = false; let comboBefore = 0;
    for (let i = 0; i < 120 * 30 && g.state === 'play'; i++) {
      g.update(dt);
      const pod = g.items.find((it) => it.kind === 'pod' && !it.done && g.items.some((st) => st.kind === 'storm' && st.x === it.x && st.z > it.z)); // un pallone con la tempesta dietro (la tempesta c'è nel 65 % dei casi)
      if (pod && !pressed && pod.z - g.z < 12 && pod.z - g.z > 8) { podX = pod.x; g.input(pod.x < 0 ? 1 : -1); pressed = true; comboBefore = g.combo; }
      if (pressed && g.hits > 0) { sawStorm = true; break; }
    }
    return { pressed, podX, sawStorm, hits: g.hits, combo: g.combo, state: g.state, pods: g.pods, hurtT: g.hurtT, comboBefore };
  });
  expect(r.pressed, 'c’è un pallone nei primi 2 minuti').toBe(true);
  expect(r.pods, 'il pallone è stato preso').toBeGreaterThanOrEqual(1);
  expect(r.sawStorm, 'la tempesta dietro al pallone colpisce chi resta in corsia').toBe(true);
  expect(r.combo).toBe(0); expect(r.state).toBe('play');
});

test('Updraft: 20 minuti a livello Facile arrivano in fondo con l’atterraggio, 3 livelli cambiano le quote', async ({ page }) => {
  const r = await runBot(page, 0.8, 2, 0);
  expect(r.state).toBe('over'); expect(r.secs).toBeGreaterThanOrEqual(1199); expect(r.N).toBe(12);
  expect(r.res.stars).toBeGreaterThanOrEqual(1); expect(r.es.maxGap).toBeLessThanOrEqual(5);
  console.log(`20 min Facile 0.8× → stelle ${r.res.stars}, sforzi ${r.res.done}/${r.res.total}, anelli ${r.rings}/${r.ringsTotal}, eventi/min ${Math.round(r.es.perMin)}`);
});
