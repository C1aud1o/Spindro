// Game SDK: the registry drives the games list, the direct ?game= URL opens a game with the demo rider,
// the template game ("Tempo") plays a full session, and `npm run game:check` prints its table.
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const registrySrc = readFileSync(join(ROOT, 'js/games/registry.js'), 'utf8');
const IDS = [...registrySrc.matchAll(/defineGame\(\{ id: '(\w+)'/g)].map((m) => m[1]);
const DEV_IDS = [...registrySrc.matchAll(/defineGame\(\{ id: '(\w+)'[^\n]*dev: true/g)].map((m) => m[1]);

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('analytics', '0'); localStorage.setItem('mode', 'gears'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); localStorage.setItem('lang', 'en'); } catch { /* no storage */ } });
});
test.afterEach(async ({ page }) => { expect(page.errors, 'unhandled JavaScript errors').toEqual([]); });

test('registry: the games list is rendered from the registry, dev games only in developer mode', async ({ page }) => {
  expect(IDS.length).toBeGreaterThanOrEqual(8); expect(DEV_IDS).toContain('tempo');
  await page.goto('/index.html');
  await page.click('#openGame');
  const shown = () => page.evaluate(() => [...document.querySelectorAll('#gameList .game-card')].filter((b) => b.offsetParent !== null).map((b) => b.dataset.game));
  expect(await shown()).toEqual(IDS.filter((i) => !DEV_IDS.includes(i)));
  expect(await page.evaluate(() => [...document.querySelectorAll('#gameList .game-card')].map((b) => b.dataset.game))).toEqual(IDS);
  for (const id of IDS) { // every card has its name and pitch from games.<id>.*
    const card = page.locator(`#gameList [data-game=${id}]`);
    expect((await card.locator('b').textContent()).length).toBeGreaterThan(0);
    expect((await card.locator('small').textContent()).length).toBeGreaterThan(10);
  }
  await page.evaluate(() => { localStorage.setItem('devMode', '1'); document.body.classList.add('dev'); });
  expect(await shown()).toEqual(IDS);
});

test('registry: every file a shipped game imports is in the service worker ASSETS (naming rule)', () => {
  // dev-only games (work in progress) are cached at first use by sw.js; a game that ships must be precached
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const assets = new Set([...sw.match(/const ASSETS = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  const seen = new Set(); const missing = [];
  const walk = (file) => {
    const rel = normalize(file).replace(`${ROOT}`, '');
    if (seen.has(rel) || !rel.startsWith('js/') || !existsSync(join(ROOT, rel))) return; seen.add(rel); // vendor/ (three.js) is cached at first use
    if (!assets.has(rel)) missing.push(rel);
    const src = readFileSync(join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/(?:from\s+|import\()\s*'(\.[^']+\.js)'/g)) walk(join(dirname(rel), m[1]));
  };
  const shipped = registrySrc.split('\n').filter((l) => l.includes('defineGame({ id:') && !l.includes('dev: true'));
  expect(shipped.length).toBeGreaterThanOrEqual(7);
  for (const l of shipped) walk(join('js/games', l.match(/import\('([^']+)'\)/)[1]));
  walk('js/games/registry.js'); walk('js/games/list.js');
  expect(missing, 'files imported by shipped games but missing from ASSETS in sw.js').toEqual([]);
});

test('?game=<id>&demo=1 opens the game straight away, driven by the demo rider', async ({ page }) => {
  await page.goto('/index.html?game=tempo&demo=1');
  await expect(page.locator('#gamePanel')).toBeVisible();
  await expect(page.locator('#gameTitle')).toHaveText('Tempo');
  await expect(page.locator('#demoRider')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__game?.state)).toBe('menu');
  // the sliders drive the power the game reads
  await page.locator('#demoPower').fill('240');
  expect(await page.evaluate(() => window.__game.hooks.stats().power)).toBe(240);
  expect(await page.evaluate(() => window.__game.hooks.connected())).toBe(true);
  // + / − buttons reach the game
  await page.evaluate(() => { window.__game.menu.age = 1; });
  const lvl = await page.evaluate(() => window.__game.menu.level);
  await page.click('#demoPlus');
  await expect.poll(() => page.evaluate(() => window.__game.menu.level)).toBe((lvl + 1) % 3);
  await page.goto('/index.html?game=nonexistent&demo=1'); // unknown id: the app just opens normally
  await expect(page.locator('#gamePanel')).toBeHidden();
});

// Tempo, one full session with a bot that holds a fixed % of FTP (same bot levels as docs/games/DESIGN-RULES.md §5)
const run = (mult) => async ({ page }) => {
  await page.goto('/index.html?game=tempo&demo=1');
  await expect.poll(() => page.evaluate(() => window.__game?.state)).toBe('menu');
  const r = await page.evaluate(async (m) => {
    const g = window.__game; window.__demo.set({ power: 200 * m, cadence: 90 }); g.active = false; // we drive the frames by hand
    g.menu.age = 1; g.menu.durIdx = 0; g.menu.level = 1; g.menu.start();
    let n = 0; while (g.state === 'play' && n < 30 * 120) { g.update(1 / 30); n++; }
    return { state: g.state, secs: n / 30, stars: g.result.stars, ev: g.eventStats(), score: g.result.score };
  }, mult);
  expect(r.state).toBe('results'); expect(r.secs).toBeGreaterThanOrEqual(59); expect(r.secs).toBeLessThanOrEqual(61);
  expect(r.ev.first).toBeLessThanOrEqual(8); expect(r.ev.maxGap).toBeLessThanOrEqual(5);
  return r;
};
const EXPECT = { 0.6: [1, 1], 0.8: [1, 2], 1: [2, 3], 1.2: [3, 3] };
for (const mult of [0.6, 0.8, 1, 1.2]) {
  test(`template game Tempo: full session with a bot at ${mult} × FTP`, async ({ page }) => {
    const r = await run(mult)({ page });
    expect(r.stars).toBeGreaterThanOrEqual(EXPECT[mult][0]); expect(r.stars).toBeLessThanOrEqual(EXPECT[mult][1]);
  });
}

test('template game Tempo: the shared results screen offers again (+) and back (−)', async ({ page }) => {
  await page.goto('/index.html?game=tempo&demo=1');
  await expect.poll(() => page.evaluate(() => window.__game?.state)).toBe('menu');
  await page.evaluate(() => { const g = window.__game; window.__demo.set({ power: 200 }); g.menu.age = 1; g.menu.start(); });
  await expect.poll(() => page.evaluate(() => window.__game.state)).toBe('play');
  await page.evaluate(() => window.__game.end());
  await expect.poll(() => page.evaluate(() => window.__game.state)).toBe('results');
  await page.evaluate(() => { window.__game.results.age = 2; window.__game.input(1); });
  await expect.poll(() => page.evaluate(() => window.__game.state)).toBe('play'); // again
  await page.evaluate(() => window.__game.end());
  await page.evaluate(() => { window.__game.results.age = 2; window.__game.input(-1); });
  await expect(page.locator('#gameMenu')).toBeVisible(); // back to the games list
});

test('npm run game:check prints the bot table for a real game and passes', async () => {
  test.setTimeout(140_000);
  const out = await new Promise((resolve, reject) => execFile('node', ['scripts/game-check.mjs', 'gruppetto', '--levels', '1', '--seconds', '30'], { cwd: ROOT, timeout: 130_000, env: process.env }, (err, stdout, stderr) => (err ? reject(new Error(`${stdout}\n${stderr}`)) : resolve(stdout))));
  expect(out).toContain('| × FTP | stars | expected | first event (s) | longest gap (s) | events/min |');
  expect(out).toMatch(/\| 1 \| — \| 2-3 \| [\d.]+ \| [\d.]+ \| [\d.]+ \|/);
  expect(out).toContain('all rules respected');
});

test('3D skeleton: loads the shared stage and cyclist, plays a run and ends on the results screen', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/index.html?game=skeleton&demo=1');
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 90_000 }).toBe('menu');
  await page.evaluate(() => { window.__game.menu.age = 1; window.__game.menu.start(); });
  await expect.poll(() => page.evaluate(() => window.__game.state)).toBe('play');
  await page.evaluate(() => window.__game.end());
  await expect.poll(() => page.evaluate(() => window.__game.state)).toBe('results');
});

test('template game Tempo: workout mode follows the workout under the game (targets, length, stars)', async ({ page }) => {
  await page.goto('/index.html?game=tempo&demo=1');
  await expect.poll(() => page.evaluate(() => window.__game?.state)).toBe('menu');
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; window.__demo.set({ power: 170 });
    const steps = [{ t0: 0, dur: 45, pct: 0.8, watts: 160, kind: 'pace', w0: 160, w1: 160, label: 'Steady' }, { t0: 45, dur: 45, pct: 0.9, watts: 180, kind: 'effort', w0: 180, w1: 180, label: 'Push' }];
    g.hooks.workout = () => ({ name: 'Test', total: 90, elapsed: g.clock.el, steps }); // the app reports the elapsed time; here the game's own clock does
    g.menu.age = 1; g.menu.start();
    const targets = new Set(); let n = 0;
    while (g.state === 'play' && n < 30 * 200) { g.update(1 / 30); targets.add(g.target().w); n++; }
    return { state: g.state, secs: n / 30, stars: g.result.stars, wk: g.result.wk, targets: [...targets] };
  });
  expect(r.state).toBe('results'); expect(r.wk).toBe(true); expect(r.secs).toBeGreaterThan(88); expect(r.secs).toBeLessThan(92);
  expect(r.targets).toEqual([160, 180]); expect(r.stars).toBe(3);
});
