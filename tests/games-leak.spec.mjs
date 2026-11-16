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
