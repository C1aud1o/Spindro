// Liquid glass: "Reduce transparency". Automatic = solid panels without a graphics chip (as in this test browser) or on a low-end device;
// the person's choice always wins; glass panels really get a backdrop blur and solid ones do not.
import { test, expect } from '@playwright/test';

const seed = (page, extra = {}) => page.addInitScript((x) => {
  try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('lang', 'en'); localStorage.removeItem('reduceGlass'); for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v); } } catch { /* no storage */ }
}, extra);
const isSolid = (page) => page.evaluate(() => document.documentElement.classList.contains('solid'));
const blurOf = (page, sel) => page.evaluate((s) => { const c = getComputedStyle(document.querySelector(s)); return c.backdropFilter || c.webkitBackdropFilter || 'none'; }, sel);

test('automatic: a browser that draws on the CPU gets solid panels; the switch shows it and the person can turn glass on', async ({ page }) => {
  await seed(page); await page.goto('/index.html');
  const soft = await page.evaluate(async () => (await import('./js/glass.js')).softwareRenderer());
  test.skip(!soft, 'this browser has a real GPU: the automatic choice is glass');
  expect(await isSolid(page)).toBe(true);
  await page.click('#openSettings');
  await expect(page.locator('#reduceGlass')).toBeChecked();
  await page.locator('#reduceGlass').uncheck();
  expect(await isSolid(page)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('reduceGlass'))).toBe('0');
  await page.reload();
  expect(await isSolid(page), 'the choice survives a reload').toBe(false);
});

test('glass on: panels are blurred glass; glass off: no backdrop blur anywhere on the home page', async ({ page }) => {
  await seed(page, { reduceGlass: '0' }); await page.goto('/index.html');
  expect(await isSolid(page)).toBe(false);
  expect(await blurOf(page, 'header.top'), 'the floating header is blurred glass').toContain('blur');
  await page.click('#openSettings'); await page.locator('#reduceGlass').check();
  expect(await isSolid(page)).toBe(true);
  const blurred = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { const c = getComputedStyle(e); return (c.backdropFilter && c.backdropFilter !== 'none') && e.getClientRects().length; }).map((e) => e.id || e.className).slice(0, 5));
  expect(blurred, 'no blurred element is left with solid panels').toEqual([]);
});
