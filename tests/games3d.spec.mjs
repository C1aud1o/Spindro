// Giochi 3D con il rullo finto: si caricano, partono e + / − in Breakaway cambiano marcia.
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

test('Breakaway: si carica, parte, il direttore annuncia, + / − cambiano marcia', async ({ page }) => {
  await page.click('#openGame');
  await page.click('[data-game=racer]');
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('select');
  await page.evaluate(() => { window.__game.selT = 1; window.__game.input(1); });
  await expect.poll(() => page.evaluate(() => window.__game.state), { timeout: 60_000 }).toMatch(/countdown|race/);
  const gear0 = await page.locator('#gearNum').textContent();
  await page.evaluate(() => window.__game.input(1));
  await expect(page.locator('#gearNum')).not.toHaveText(gear0);
  await expect.poll(() => page.evaluate(() => window.__game.state), { timeout: 60_000 }).toBe('race');
  // la tappa è a tempo e ha momenti con un obiettivo; il primo evento arriva subito
  await expect.poll(() => page.evaluate(() => window.__game.race.log.length), { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__game.race.tl.moments.map((m) => m.kind))).toEqual(expect.arrayContaining(['start', 'break', 'sprint', 'climb', 'final']));
  // la pendenza della tappa arriva al rullo: in salita il gioco imposta un grado positivo
  await page.evaluate(() => { const g = window.__game; g.s = g.climbs[Math.floor(g.climbs.length / 2)]; });
  await expect.poll(() => page.evaluate(() => window.__game.sentGrade), { timeout: 30_000 }).toBeGreaterThan(2);
  // arrivo, stelle e podio
  await page.evaluate(() => { const g = window.__game; g.s = g.length - 1; });
  await expect.poll(() => page.evaluate(() => window.__game.state), { timeout: 60_000 }).toBe('finishCam');
  await expect.poll(() => page.evaluate(() => window.__game.state), { timeout: 90_000 }).toBe('results');
  const stars = await page.evaluate(() => window.__game.result.stars);
  expect(stars).toBeGreaterThanOrEqual(1); expect(stars).toBeLessThanOrEqual(3);
});

test('Breakaway: − cambia durata, la tappa lunga si costruisce e parte con il primo evento entro 8 s', async ({ page }) => {
  await page.click('#openGame');
  await page.click('[data-game=racer]');
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('select');
  await page.evaluate(() => { const g = window.__game; g.selT = 1; g.input(-1); g.input(-1); });
  expect(await page.evaluate(() => window.__game.dur)).toBe(1200);
  await page.evaluate(() => window.__game.input(1));
  await expect.poll(() => page.evaluate(() => window.__game.state), { timeout: 120_000 }).toBe('countdown');
  // si fa correre la logica a mano: 8 s di gara
  const first = await page.evaluate(() => {
    const g = window.__game; g.hooks = { ...g.hooks, connected: () => true, stats: () => ({ power: 160, cadence: 85 }), ftp: () => 200, setGrade() {} };
    for (let i = 0; i < 30 * 12 && g.race.log.length === 0; i++) g.update(1 / 30, 1 / 30);
    return { t: g.race.t, n: g.race.log.length, race: g.race.tl.race };
  });
  expect(first.n).toBeGreaterThan(0); expect(first.t).toBeLessThan(8); expect(first.race).toBe(1170);
});

test('Pedal Strike: allenamento a tempo, + / − cambiano corsia, scudo del boss legato alla potenza, stelle a fine partita', async ({ page }) => {
  await page.click('#openGame');
  await page.evaluate(() => document.body.classList.add('dev'));
  await page.click('[data-game=shooter]');
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
  // menu: − passa alla riga dopo (durata), + cambia la durata; poi di nuovo su «Parti»
  await page.evaluate(() => { const g = window.__game; g.stateT = 1; g.minutes = 5; g.input(-1); g.input(1); });
  expect(await page.evaluate(() => window.__game.minutes)).toBe(10);
  await page.evaluate(() => { const g = window.__game; g.minutes = 5; g.row = 0; g.input(1); });
  await expect.poll(() => page.evaluate(() => window.__game.state), { timeout: 30_000 }).toBe('intro');
  // la partita è un allenamento: avvio, sforzi, mini-boss a metà, boss, defaticamento di 30 s
  const plan = await page.evaluate(() => window.__game.blocks.map((b) => b.kind));
  expect(plan[0]).toBe('warm'); expect(plan).toContain('mini'); expect(plan.at(-2)).toBe('boss'); expect(plan.at(-1)).toBe('cool');
  expect(await page.evaluate(() => window.__game.blocks.total)).toBe(300);
  await page.evaluate(() => { window.__game.stateT = 99; });
  await expect.poll(() => page.evaluate(() => window.__game.state), { timeout: 30_000 }).toBe('play');
  // + porta sulla corsia a destra, − su quella a sinistra
  await page.evaluate(() => window.__game.input(1));
  expect(await page.evaluate(() => window.__game.lane)).toBe(0);
  await page.evaluate(() => { window.__game.input(-1); window.__game.input(-1); });
  expect(await page.evaluate(() => window.__game.lane)).toBe(2);
  // negli sforzi il rullo riceve una pendenza più dura
  await page.evaluate(() => window.__game.skip('effort'));
  await expect.poll(() => page.evaluate(() => window.__game.sentGrade), { timeout: 30_000 }).toBeGreaterThan(2);
  // boss finale: lo scudo cede solo tenendo la potenza; poi si abbatte
  await page.evaluate(() => { const g = window.__game; g.god = true; g.skip('boss'); });
  await expect.poll(() => page.evaluate(() => window.__game.boss?.ready === true), { timeout: 60_000 }).toBe(true);
  expect(await page.evaluate(() => { const g = window.__game; g.damageBoss(9999); return g.boss.hp === g.boss.maxHp; })).toBe(true);
  await page.evaluate(() => { const g = window.__game; g.breakShield(g.boss); g.damageBoss(g.boss.hp + 1); });
  expect(await page.evaluate(() => window.__game.bossDown)).toBe(true);
  // defaticamento con il riepilogo, poi le stelle
  await page.evaluate(() => window.__game.skip('cool'));
  await expect.poll(() => page.evaluate(() => window.__game.state), { timeout: 30_000 }).toBe('cool');
  const stars = await page.evaluate(() => window.__game.result.stars);
  expect(stars).toBeGreaterThanOrEqual(1); expect(stars).toBeLessThanOrEqual(3);
});

for (const kind of ['horde', 'shooter']) {
  test(`${kind}: il gioco 3D si carica con la nuova base`, async ({ page }) => {
    await page.click('#openGame');
    await page.evaluate(() => document.body.classList.add('dev'));
    await page.click(`[data-game=${kind}]`);
    await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toMatch(/menu|select|play|intro|hero/);
    await page.waitForTimeout(1500);
  });
}
