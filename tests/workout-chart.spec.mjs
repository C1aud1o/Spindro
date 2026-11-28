// The whole-workout chart must stay on screen while riding, also on a short phone screen (a browser with its bars): it is how the
// rider sees where they are in the workout. It used to be hidden under 740 px of height.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));

for (const h of [844, 730, 680, 620]) test(`riding a workout at 390×${h}: the chart is visible and nothing scrolls`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: h });
  await page.addInitScript(() => { try { localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('lang', 'en'); localStorage.setItem('autoPause', '0'); } catch { /* */ } });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await page.click('#openWorkouts'); await page.locator('#workoutList [data-wk]').first().click();
  await expect(page.locator('body')).toHaveClass(/riding/);
  const chart = page.locator('#wkProfile');
  await expect(chart).toBeVisible();
  const box = await chart.boundingBox();
  expect(box.height, 'chart height').toBeGreaterThanOrEqual(24);
  expect(box.y + box.height, 'chart inside the screen').toBeLessThanOrEqual(h);
  expect(await page.evaluate(() => document.documentElement.scrollHeight), 'no vertical scroll').toBeLessThanOrEqual(h + 1);
  await expect(page.locator('#rideActions')).toBeInViewport();
});
