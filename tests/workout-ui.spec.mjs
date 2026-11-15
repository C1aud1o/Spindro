// Allenamento → "Gioca" → Horde Run, solo col tocco: il menu mostra «Il tuo allenamento», si parte e il rullo (ERG) segue l'allenamento mentre il gioco gira.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(150_000);

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('lang', 'en'); localStorage.setItem('gameQuality', 'low'); } } catch { /* niente storage */ } });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
});
test.afterEach(async ({ page }) => { expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]); });

const lastErgW = (page) => page.evaluate(() => { const l = window.__fakeBle.state.controlLog.filter((c) => c[0] === 0x05).pop(); return l ? l[1] | (l[2] << 8) : null; });
// watt del passo in corso secondo l'hook dell'app (dato di riferimento)
const stepW = (page) => page.evaluate(() => { const w = window.__game.hooks.workout(); const s = w.steps.find((x) => w.elapsed >= x.t0 && w.elapsed < x.t0 + x.dur) || w.steps.at(-1); return { w: s.watts, w0: s.w0, w1: s.w1 }; });

test('allenamento → Gioca → Horde Run: il menu mostra l\'allenamento e il rullo segue l\'allenamento mentre il gioco gira', async ({ page }) => {
  await page.click('#openWorkouts');
  await page.locator('#workoutList .wk-wrap').first().locator('[data-wk-play]').click();
  await expect(page.locator('#gameMenu')).toBeVisible();
  await page.click('[data-game=horde]');
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
  // il menu: riga «Il tuo allenamento», niente scelta della durata
  const menu = await page.evaluate(() => { const m = window.__game.menu; return { wk: m.wk && m.wk.name, hasLen: m.zones.some((z) => z.kind === 'len') }; });
  expect(menu.wk).toBeTruthy(); expect(menu.hasLen).toBe(false);
  // la striscia dell'app è nascosta: il passo sta nell'HUD del gioco
  await expect(page.locator('#gameStrip')).toBeHidden();
  await page.waitForFunction(() => window.__game.menu.age > 1, null, { timeout: 30_000 }); // il menu ignora i tocchi nei primi istanti
  // VIA col tocco (tasto disegnato sul canvas)
  const pt = await page.evaluate(() => { const g = window.__game; const z = g.menu.zones.find((q) => q.kind === 'start'); const r = g.hudCanvas.getBoundingClientRect(); return { x: r.left + (z.x + z.w / 2) * (r.width / g.stage.W), y: r.top + (z.y + z.h / 2) * (r.height / g.stage.H) }; });
  await page.mouse.click(pt.x, pt.y);
  await expect.poll(() => page.evaluate(() => window.__game.state), { timeout: 15_000 }).toBe('play');
  // il gioco usa l'allenamento: durata, passo e bersaglio
  const info = await page.evaluate(() => { const g = window.__game; return { wk: !!g.wk, total: g.total, want: g.hooks.workout().total }; });
  expect(info.wk).toBe(true); expect(info.total).toBe(info.want);
  // per qualche secondo il bersaglio del gioco e l'ERG del rullo coincidono con il passo dell'allenamento
  const before = await page.evaluate(() => window.__fakeBle.state.controlLog.length);
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(1500);
    const s = await stepW(page); const erg = await lastErgW(page); const tgt = await page.evaluate(() => window.__game.tgtW);
    const lo = Math.min(s.w0, s.w1) - 10; const hi = Math.max(s.w0, s.w1) + 10;
    expect(erg, 'ERG del rullo').toBeGreaterThanOrEqual(lo); expect(erg).toBeLessThanOrEqual(hi);
    expect(tgt, 'bersaglio del gioco').toBeGreaterThanOrEqual(lo); expect(tgt).toBeLessThanOrEqual(hi);
  }
  const ops = await page.evaluate((n) => window.__fakeBle.state.controlLog.slice(n).map((c) => c[0]), before);
  expect(ops, 'nessun comando di pendenza (0x11) dal gioco').not.toContain(0x11);
  // uscire dal gioco non ferma l'allenamento
  await page.click('#closeGame');
  await expect(page.locator('#workoutCard')).toBeVisible();
});
