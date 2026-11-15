// I giochi seguono l'allenamento in corso (kit/workout-plan.js): bot deterministici con un allenamento finto di 6 minuti.
// Per ogni gioco: a ogni secondo il bersaglio chiesto dal gioco = quello del passo dell'allenamento; il gioco finisce con
// l'allenamento; aperto a elapsed = 150 s parte nel passo giusto; setGrade non viene mai chiamato.
// Il gioco si fa avanzare a mano, a passi da 1/30 s (caso con seme fisso). A game.input() solo +1 / −1.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(180_000);

// 2 min facili 55 % · 1 min sforzo 105 % · 1 min recupero 50 % · 30 s scatto 130 % · 1,5 min defaticamento 50 %  (FTP 200)
const FTP = 200;
const STEPS = [[120, 0.55, 'Easy'], [60, 1.05, 'Effort'], [60, 0.5, 'Recovery'], [30, 1.3, 'Sprint'], [90, 0.5, 'Cool']];

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); } localStorage.setItem('lang', 'en'); } catch { /* niente storage */ }
    window.__spindroSeed = 12345;
  });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
});
test.afterEach(async ({ page }) => { expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]); });

// Bot: dentro la pagina. `reqW(g)` = watt che il gioco chiede in questo istante.
async function botRun({ id, startAt, steps, ftp }) {
  const g = window.__game; const stopLoop = () => { g.active = false; };
  let t0 = 0; const list = steps.map(([dur, pct, label]) => { const o = { t0, dur, pct, watts: Math.round(ftp * pct / 5) * 5, kind: 'pace', label }; t0 += dur; return o; });
  const total = t0; let clock = startAt; let grade = 0;
  const wk = () => ({ name: 'Test 6', total, elapsed: Math.round(clock), steps: list });
  const stepAt = (t) => list.find((s) => t >= s.t0 && t < s.t0 + s.dur) || list.at(-1);
  g.hooks = { ...g.hooks, connected: () => true, ftp: () => ftp, workout: wk, speedKmh: () => 30, setGrade() { grade++; } };
  // il rullo è in ERG: la potenza è il bersaglio del passo
  g.hooks.stats = () => ({ power: stepAt(clock).watts, cadence: 88 });
  g.durIdx = 0; g.lvlIdx = 1; if (g.reset) { stopLoop(); g.reset(); } g.begin();
  while (g.state === 'loading') await new Promise((r) => setTimeout(r, 50)); // Breakaway costruisce la tappa un attimo dopo (serve il ciclo attivo)
  stopLoop();
  const reqW = window.__wkReq; const timeOf = (x) => (x.st != null && x.block !== undefined ? x.st : (x.el ?? x.wc?.el));
  const bad = []; const seen = new Set(); let n = 0; let first = null; const dt = 1 / 30; let played = 0;
  while (g.state !== 'over' && g.state !== 'results' && n < 600 * 30) {
    const b = window.__wkBot?.(g); if (b) g.input(b);
    clock += dt; g.update(dt, dt); n++;
    const got0 = reqW(g);
    if (!first && got0 != null) first = { el: timeOf(g), w: got0 };
    if (got0 != null) played++;
    if (n % 30 === 15 && got0 != null) {
      const want = stepAt(clock).watts; const got = got0; seen.add(`${stepAt(clock).label}:${got}`);
      if (got !== want) bad.push({ t: Math.round(clock), want, got });
    }
  }
  return { state: g.state, secs: n / 30, played: played / 30, first, bad: bad.slice(0, 8), nBad: bad.length, seen: [...seen], grade, stars: g.result?.stars, band: g.result?.band ?? null, wkFlag: !!g.wk, rings: g.rings, ringsTotal: g.ringsTotal, hits: g.hits };
}

// req: watt chiesti dal gioco adesso · bot: l'unico input del bot (+1 / −1) o 0
const GAMES = [
  { id: 'horde', req: (g) => (g.state === 'play' ? g.tgtW : null), bot: () => 0 },
  { id: 'racer', req: (g) => ((g.state === 'race' || g.state === 'countdown') && g.tgtW ? g.tgtW : null), bot: () => 0 },
  { id: 'shooter', req: (g) => (g.block ? g.tgW() : null), bot: () => 0 },
  { id: 'mattoni', req: (g) => (g.state === 'play' ? g.tgtW : null), bot: () => 0 },
  { id: 'planata', req: (g) => (g.state === 'play' ? g.tgtW : null), bot: () => 0 },
  { id: 'gruppetto', req: (g) => (g.state === 'play' ? g.tgtW : null), bot: (g) => { const b = g.bridge; return b && b.state === 'attack' && b.lane !== g.lane ? (b.lane > g.lane ? 1 : -1) : 0; } },
];

async function openGame(page, id, req, bot) {
  await page.click('#openGame');
  await page.click(`[data-game=${id}]`);
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
  await page.evaluate(([a, b]) => { window.__wkReq = new Function('g', `return (${a})(g)`); window.__wkBot = new Function('g', `return (${b})(g)`); }, [req.toString(), bot.toString()]);
}

for (const G of GAMES) {
  test(`${G.id}: l'allenamento è la partita (bersaglio per secondo, fine con l'allenamento, setGrade mai)`, async ({ page }) => {
    await openGame(page, G.id, G.req, G.bot);
    const r = await page.evaluate(botRun, { id: G.id, startAt: 0, steps: STEPS, ftp: FTP });
    console.log(`${G.id} wk: ${JSON.stringify({ ...r, bad: r.bad.slice(0, 3) })}`);
    expect(r.wkFlag).toBe(true);
    expect(r.nBad, JSON.stringify(r.bad)).toBe(0);
    expect(['over', 'results']).toContain(r.state);
    expect(r.secs, 'finisce con l’allenamento (360 s, il riepilogo di qualcuno compare dopo)').toBeGreaterThanOrEqual(359); expect(r.secs).toBeLessThanOrEqual(366);
    expect(r.played, 'il bersaglio è stato chiesto per quasi tutta la partita').toBeGreaterThanOrEqual(350);
    expect(r.grade, 'setGrade mai chiamato').toBe(0);
    expect(r.stars).toBeGreaterThanOrEqual(1);
    if (G.id === 'planata') { expect(r.rings / r.ringsTotal, 'chi segue l’allenamento passa gli anelli').toBeGreaterThanOrEqual(0.85); expect(r.hits).toBeLessThanOrEqual(3); }
  });

  test(`${G.id}: aperto a metà (elapsed 150 s) parte nello sforzo giusto e finisce a 360 s`, async ({ page }) => {
    await openGame(page, G.id, G.req, G.bot);
    const r = await page.evaluate(botRun, { id: G.id, startAt: 150, steps: STEPS, ftp: FTP });
    expect(r.first.el).toBeGreaterThanOrEqual(150); expect(r.first.el).toBeLessThan(154);
    expect(r.first.w, 'primo bersaglio = sforzo 105 %').toBe(210);
    expect(r.nBad, JSON.stringify(r.bad)).toBe(0);
    expect(r.secs, 'restano 210 s').toBeGreaterThanOrEqual(209); expect(r.secs).toBeLessThanOrEqual(216);
    expect(['over', 'results']).toContain(r.state); expect(r.grade).toBe(0);
  });
}
