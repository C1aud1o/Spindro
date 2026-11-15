// Tutti e sei i giochi si avviano con la stessa sequenza e SOLO con eventi + / − del Click (finto):
// pressione breve − = durata, pressione breve + = livello, pressione lunga + = via.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(150_000);
const GAMES = ['racer', 'horde', 'shooter', 'gruppetto', 'planata', 'mattoni'];

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); } localStorage.setItem('lang', 'en'); } catch { /* niente storage */ }
  });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); window.__fakeBle.next = 'click'; return window.rfDevices.add(); });
  await expect(page.locator('#clickStatus')).toContainText('Zwift');
});
test.afterEach(async ({ page }) => { expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]); });

for (const kind of GAMES) {
  test(`${kind}: menu comune solo con + / − (− durata, + livello, + lungo = via)`, async ({ page }) => {
    await page.click('#openGame');
    await page.click(`[data-game=${kind}]`);
    await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
    await expect.poll(() => page.evaluate(() => window.__game?.menu?.age ?? 0), { timeout: 20_000 }).toBeGreaterThan(0.6);
    const read = () => page.evaluate(() => ({ d: window.__game.menu.durIdx, l: window.__game.menu.level, s: window.__game.state }));
    const a = await read();
    await page.evaluate(() => window.__fakeBle.press(-1));
    await expect.poll(async () => (await read()).d).toBe((a.d + 1) % 3);
    expect((await read()).l, 'il − non cambia il livello').toBe(a.l);
    await page.evaluate(() => window.__fakeBle.press(+1));
    await expect.poll(async () => (await read()).l).toBe((a.l + 1) % 3);
    expect((await read()).s, 'una pressione breve non avvia').toBe('menu');
    // la scelta si ricorda
    expect(await page.evaluate(() => JSON.stringify([window.__game.menu.durIdx, window.__game.menu.level]))).toBe(JSON.stringify([(a.d + 1) % 3, (a.l + 1) % 3]));
    await page.evaluate(() => window.__fakeBle.hold(+1, 1000));
    await expect.poll(() => page.evaluate(() => window.__game.state), { timeout: 60_000 }).not.toBe('menu');
    expect(await page.evaluate(() => window.__game.menu.started)).toBe(true);
  });
}
