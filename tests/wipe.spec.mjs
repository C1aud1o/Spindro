// "Cancella tutti i dati" nelle Impostazioni: conferma esplicita, cancella tutto, funziona anche col solo Click.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(90_000);

async function seed(page) {
  await page.addInitScript(() => {
    try {
      if (!localStorage.getItem('__seeded')) {
        localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '233'); localStorage.setItem('lang', 'it');
        localStorage.setItem('rideHistory', JSON.stringify([{ t: 1, mins: 30 }])); localStorage.setItem('customWorkouts', '[{"n":"x"}]');
        localStorage.setItem('stravaConfig', JSON.stringify({ accessToken: 'tok', refreshToken: 'r' }));
      }
    } catch { /* niente storage */ }
  });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
}

test('Cancella tutti i dati: annullare non cancella, confermare sì', async ({ page }) => {
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await seed(page);
  await page.click('#openSettings');
  const btn = page.locator('#wipeData'); await btn.scrollIntoViewIfNeeded(); await expect(btn).toContainText('Cancella tutti i dati');
  await btn.click();
  await expect(page.locator('.dlg')).toContainText('Non si può annullare');
  await page.locator('.dlg [data-cancel]').click();
  expect(await page.evaluate(() => localStorage.getItem('ftp'))).toBe('233');
  await btn.click(); await page.locator('.dlg [data-ok]').click();
  await page.waitForLoadState('load');
  await expect.poll(() => page.evaluate(() => ['ftp', 'rideHistory', 'customWorkouts', 'stravaConfig'].map((k) => localStorage.getItem(k)))).toEqual([null, null, null, null]);
  expect(errs).toEqual([]);
});

test('Cancella tutti i dati: raggiungibile col solo Click; la selezione parte da "Annulla"', async ({ page }) => {
  await seed(page);
  // i dispositivi si aggiungono dal pannello Dispositivi: qui direttamente, come negli altri test
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await page.evaluate(async () => { window.__fakeBle.next = 'click'; return window.rfDevices.add(); });
  await expect(page.locator('#clickStatus')).toContainText('Zwift');
  const press = async (d) => { await page.evaluate((x) => window.__fakeBle.press(x), d); await page.waitForTimeout(80); };
  const hold = (d) => page.evaluate((x) => window.__fakeBle.hold(x, 900), d);
  const at = (sel) => page.evaluate((s) => !!document.querySelector('.cn-focus')?.matches(s), sel);
  const goTo = async (sel) => { for (let i = 0; i < 150; i++) { if (await at(sel)) return; await press(+1); } throw new Error('selezione non arrivata su ' + sel); };
  await goTo('#openSettings'); await hold(+1);
  await expect(page.locator('#settingsSheet')).toBeVisible();
  await goTo('#wipeData'); await hold(+1);
  await expect(page.locator('.dlg')).toBeVisible();
  expect(await at('.dlg [data-cancel]')).toBe(true);
  await press(+1); expect(await at('.dlg [data-ok]')).toBe(true);
  await hold(+1);
  await page.waitForLoadState('load');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('rideHistory'))).toBeNull();
});
