// While a game loads its models the menu is visible (progress bar, START disabled), length and level can be chosen,
// and a START pressed meanwhile is remembered and runs as soon as the game is ready (no tap is swallowed).
import { test, expect } from '@playwright/test';
test.setTimeout(120_000);

for (const id of ['mattoni', 'racer']) {
  test(`${id}: START pressed while loading starts the run when ready`, async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('analytics', '0'); localStorage.setItem('mode', 'gears'); localStorage.setItem('gameQuality', 'low'); });
    await page.route('**/*.glb', async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.continue(); });
    await page.goto(`/index.html?game=${id}&demo=1`);
    await page.waitForFunction(() => window.__game?.state === 'loading', null, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__game.menu.loading)).toBe(true);
    await page.evaluate(() => { const g = window.__game; g.menu.age = 1; g.input(-1); g.hold(-1); g.hold(0); });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__game.menu.durIdx)).toBe(1); // length chosen while loading
    await page.evaluate(() => window.__game.menu.start());                // START during loading: queued, not lost, no crash
    expect(await page.evaluate(() => window.__game.menu.queued)).toBe(true);
    await page.waitForFunction(() => !['loading', 'menu'].includes(window.__game.state), null, { timeout: 90_000 });
    expect(await page.evaluate(() => window.__game.state)).toMatch(/play|countdown|intro/);
  });
}
