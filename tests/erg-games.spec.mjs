// ERG sempre comandato in ogni gioco, con e senza allenamento: per tutta la partita il rullo sta in ERG sul bersaglio del gioco
// (ultimo comando FTMS 0x05 = bersaglio mostrato nella striscia comune), il comando viene rinviato come nel cruscotto e non esce
// mai in modalità pendenza (0x11) o resistenza (0x04). Intensità a mano con [ e ]. Rullo finto: tests/fake-ble.js.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
const GAMES = ['horde', 'mattoni', 'gruppetto', 'planata', 'racer', 'shooter'];
test.setTimeout(240_000);
test.use({ actionTimeout: 20_000 });

async function boot(page) {
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => {
    try {
      if (!localStorage.getItem('__eg')) { localStorage.setItem('__eg', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('lang', 'it'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); localStorage.setItem('ergW', '120'); }
    } catch { /* niente storage */ }
  });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); await window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
  await page.evaluate(() => { __fakeBle.state.cadence = 90; __fakeBle.state.speed = 32; __fakeBle.setPower(190); });
}
const ctl = (page) => page.evaluate(() => window.__fakeBle.state.controlLog.map((c) => ({ op: c[0], w: c[0] === 0x05 ? c[1] | (c[2] << 8) : null })));
const lastErg = async (page) => (await ctl(page)).filter((c) => c.op === 0x05).pop()?.w ?? null;
const strip = (page) => page.evaluate(() => { const i = window.__game?.stripInfo?.(); return i ? { target: i.target, bias: i.bias, kind: i.kind, left: i.left, total: i.total, hasNext: !!i.next } : null; });
async function openAndStart(page, game) {
  await expect(page.locator('#gamePanel')).toBeVisible();
  await page.click(`[data-game=${game}]`);
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
  await page.evaluate(() => {
    const g = window.__game;
    if (g.menu?.start) { g.menu.age = 1; g.menu.start(); } else { g.stateT = 5; g.selT = 1; if (typeof g.begin === 'function') g.begin(); else g.input(1); }
  });
  await expect.poll(() => strip(page), { timeout: 60_000, message: `${game}: la striscia compare in partita` }).not.toBeNull();
}
/** Dopo un attimo l'ultimo comando ERG deve essere il bersaglio mostrato (un cambio di passo si assesta in meno di un ciclo di rinvio). */
async function expectErgIsTarget(page, what) {
  await expect.poll(async () => { const e = await lastErg(page); const s = await strip(page); return e === s?.target; }, { timeout: 8000, message: `ultimo ERG = bersaglio mostrato: ${what}` }).toBe(true);
}

for (const game of GAMES) {
  test(`${game}: senza allenamento il rullo sta in ERG sul bersaglio del gioco`, async ({ page }) => {
    await boot(page);
    await page.click('#openGame');
    const n0 = (await ctl(page)).length;
    await openAndStart(page, game);
    await page.waitForTimeout(6500);
    const log = (await ctl(page)).slice(n0);
    expect(log.filter((c) => c.op === 0x05).length, 'il comando ERG viene rinviato').toBeGreaterThanOrEqual(2);
    expect(log.filter((c) => c.op === 0x11 || c.op === 0x04), 'mai pendenza né resistenza').toEqual([]);
    await expectErgIsTarget(page, 'dopo 6 s di partita');
    const s1 = await strip(page);
    expect(s1.target).toBeGreaterThan(0); expect(s1.total).toBeGreaterThan(0);
    // ancora dopo qualche secondo (cambi di passo compresi) e dopo l'intensità a mano
    await page.waitForTimeout(4000);
    await expectErgIsTarget(page, 'dopo 10 s di partita');
    await page.keyboard.press(']');
    await expect.poll(async () => (await strip(page))?.bias, { timeout: 5000, message: 'intensità a mano mostrata' }).toBe(1.05);
    await expectErgIsTarget(page, 'dopo + 5 % a mano');
    await page.keyboard.press('[');
    await expect.poll(async () => (await strip(page))?.bias, { timeout: 5000 }).toBe(1);
    expect(page.errors, 'errori JavaScript').toEqual([]);
  });

  test(`${game}: con un allenamento il rullo sta in ERG sui watt dell'allenamento`, async ({ page }) => {
    await boot(page);
    await page.click('#openWorkouts');
    await page.locator('#workoutList [data-wk]').first().click();
    await expect(page.locator('#workoutCard')).toBeVisible();
    await page.click('#rideGames');
    await openAndStart(page, game);
    await page.waitForTimeout(4000);
    const wkTarget = () => page.textContent('#wkTarget').then(Number);
    await expect.poll(async () => { const erg = await lastErg(page); const wk = await wkTarget(); const shown = (await strip(page))?.target; return erg === wk && shown === wk; }, { timeout: 10_000, message: 'ERG = watt del passo = bersaglio mostrato' }).toBe(true);
    expect((await strip(page)).hasNext).toBe(true);
    // intensità a mano: la regola dell'allenamento (5 % a passo), il rullo e la striscia la seguono
    await page.keyboard.press(']');
    await expect.poll(async () => { const s = await strip(page); return (await lastErg(page)) === s?.target && s?.bias === 1.05; }, { timeout: 10_000, message: 'intensità del 105 % mostrata e applicata' }).toBe(true);
    const log = await ctl(page);
    expect(log.filter((c) => c.op === 0x11 || c.op === 0x04), 'mai pendenza né resistenza').toEqual([]);
    expect(page.errors, 'errori JavaScript').toEqual([]);
  });
}
