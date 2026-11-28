// In the Android app the file pickers must not filter by type: Android does not know .zwo or .gpx, so a downloaded workout or route
// was greyed out in the picker. In the browser the filter stays (desktop pickers understand extensions).
import { test, expect } from '@playwright/test';

const seed = (page) => page.addInitScript(() => { try { localStorage.setItem('analytics', '0'); localStorage.setItem('lang', 'en'); localStorage.setItem('autoPause', '0'); } catch { /* */ } });
// the app loads vendor/capacitor/capacitor.js, which defines window.capacitorExports: serve a fake that says "Android"
const fakeAndroid = (page) => page.route('**/vendor/capacitor/capacitor.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `
  const plugin = () => new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : async () => ({})) });
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: plugin };
  window.capacitorExports = { Capacitor: window.Capacitor, registerPlugin: plugin };` }));

test('Android app: the workout, route and backup pickers accept any file', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await seed(page); await fakeAndroid(page);
  await page.goto('/index.html');
  await page.click('#openWorkouts');
  await expect(page.locator('#zwoFile')).toHaveCount(1);
  for (const id of ['zwoFile', 'gpxFile', 'backupIn']) expect(await page.locator(`#${id}`).getAttribute('accept'), id).toBeNull();
  expect(errors).toEqual([]);
});

test('browser: the pickers keep their file types', async ({ page }) => {
  await seed(page);
  await page.goto('/index.html');
  await page.click('#openWorkouts');
  expect(await page.locator('#zwoFile').getAttribute('accept')).toContain('.zwo');
  expect(await page.locator('#gpxFile').getAttribute('accept')).toContain('.gpx');
  expect(await page.locator('#backupIn').getAttribute('accept')).toContain('.json');
});
