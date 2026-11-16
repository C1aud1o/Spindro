// Opening and closing a 3D game must release its WebGL context (browsers keep at most 16 alive and warn "Too many active WebGL contexts").
import { test, expect } from '@playwright/test';
test.setTimeout(120_000);

test('3D games release their WebGL context when closed', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (/Too many active WebGL contexts/.test(m.text())) warnings.push(m.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('analytics', '0'); localStorage.setItem('mode', 'gears'); localStorage.setItem('gameQuality', 'low');
    window.__ctxs = []; const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...r) { const c = gc.call(this, t, ...r); if (c && /webgl/.test(t)) window.__ctxs.push(c); return c; };
  });
  await page.goto('/index.html');
  for (const id of ['planata', 'gruppetto']) {
    for (let i = 0; i < 3; i++) {
      await page.click('#openGame'); await page.click(`[data-game=${id}]`);
      await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 90_000 });
      await page.click('#closeGame'); await page.click('#closeGame');
    }
  }
  const alive = await page.evaluate(() => window.__ctxs.filter((c) => !c.isContextLost()).length);
  expect(alive, 'live WebGL contexts after closing every game').toBe(0);
  expect(warnings).toEqual([]);
});

test('a trainer that drops mid-run reads as power 0 (the game pauses), not as the demo rider', async ({ page }) => {
  await page.goto('/index.html');
  const r = await page.evaluate(async () => {
    const { guardTrainer } = await import('/js/games/kit/hud.js');
    let conn = false; const base = { connected: () => conn, stats: () => ({ power: 180, cadence: 90 }), speedKmh: () => 30 };
    const h = guardTrainer(base); const out = {};
    out.demo = [h.connected(), h.stats().power, h.lost];           // never connected: demo rider, unchanged
    conn = true; out.on = [h.connected(), h.stats().power, h.lost];
    conn = false; out.drop = [h.connected(), h.stats().power, h.stats().cadence, h.speedKmh(), h.lost];
    conn = true; out.back = [h.connected(), h.stats().power, h.lost];
    conn = false; h.reset(); out.reset = [h.connected(), h.lost];
    return out;
  });
  expect(r.demo).toEqual([false, 180, false]);
  expect(r.on).toEqual([true, 180, false]);
  expect(r.drop).toEqual([true, 0, 0, 0, true]);
  expect(r.back).toEqual([true, 180, false]);
  expect(r.reset).toEqual([false, false]);
});
