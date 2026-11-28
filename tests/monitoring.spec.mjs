// D1 (consenso e statistiche anonime) e B4 (Segnala il tuo rullo).
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
const CONFIG = fileURLToPath(new URL('../js/config.js', import.meta.url));

// Per il test, config.js ha un indirizzo GoatCounter; count.js è sostituito da un finto che registra gli eventi.
async function setup(page, { analytics, list = '2' } = {}) {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.gcRequests = [];
  await page.route('**/js/config.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `${readFileSync(CONFIG, 'utf8')}\n`.replace("GOATCOUNTER_URL = ''", "GOATCOUNTER_URL = 'https://test.goatcounter.example/count'"),
  }));
  await page.route('https://gc.zgo.at/**', (route) => {
    page.gcRequests.push(route.request().url());
    route.fulfill({ contentType: 'text/javascript', body: 'window.__gcEvents = []; window.goatcounter.count = (e) => window.__gcEvents.push(e.path);' });
  });
  await page.addInitScript((a) => {
    try { localStorage.setItem('lang', 'it'); localStorage.setItem('autoPause', '0'); if (a.analytics != null && !localStorage.getItem('analytics')) { localStorage.setItem('analytics', a.analytics); if (a.list) localStorage.setItem('analyticsList', a.list); } } catch { /* */ }
  }, { analytics: analytics ?? null, list });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
}

test('primo avvio: la scheda del consenso appare; "No" non carica GoatCounter', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#consentSheet')).toBeVisible();
  await expect(page.locator('#consentSheet')).toContainText('Aiutaci a migliorare Spindro');
  await page.click('#consentNo');
  await expect(page.locator('#consentSheet')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('analytics'))).toBe('0');
  await page.waitForTimeout(500);
  expect(page.gcRequests).toEqual([]);
  expect(await page.locator('script[src*="goatcounter"], script[src*="gc.zgo.at"]').count()).toBe(0);
  // riaprendo l'app la domanda non si ripete e GoatCounter resta spento
  await page.reload();
  await expect(page.locator('#consentSheet')).toBeHidden();
  expect(page.gcRequests).toEqual([]);
  expect(page.errors).toEqual([]);
});

test('"Sì" carica GoatCounter e invia gli eventi anonimi; modificabile nelle Impostazioni', async ({ page }) => {
  await setup(page);
  await page.click('#consentYes');
  await expect.poll(() => page.gcRequests.length).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__gcEvents)).toEqual(expect.arrayContaining(['app-open/web', 'lang/it']));
  // dalle Impostazioni si può togliere il consenso: l'impostazione è salvata
  await page.click('#openSettings');
  await expect(page.locator('#analyticsOn')).toBeChecked();
  await page.locator('#analyticsOn').evaluate((el) => el.click());
  expect(await page.evaluate(() => localStorage.getItem('analytics'))).toBe('0');
  expect(page.errors).toEqual([]);
});

test('con consenso già dato GoatCounter parte all\'apertura; con rullo collegato invia il protocollo', async ({ page }) => {
  await setup(page, { analytics: '1' });
  await expect(page.locator('#consentSheet')).toBeHidden();
  await expect.poll(() => page.gcRequests.length).toBe(1);
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
  await expect.poll(() => page.evaluate(() => window.__gcEvents)).toContain('trainer/FTMS');
});

test('a "yes" given to the older, shorter list counts nothing: the question comes back once with the new list; a "no" is never asked again', async ({ page }) => {
  await setup(page, { analytics: '1', list: null }); // consent from before the list grew
  await expect(page.locator('#consentSheet')).toBeVisible();
  await expect(page.locator('#consentSheet')).toContainText('durata a fasce');
  await page.waitForTimeout(400);
  expect(page.gcRequests, 'nothing is loaded before the new answer').toEqual([]);
  await page.click('#consentYes');
  await expect.poll(() => page.evaluate(() => window.__gcEvents)).toEqual(expect.arrayContaining(['app-open/web']));
  expect(await page.evaluate(() => localStorage.getItem('analyticsList'))).toBe('2');
  await page.reload();
  await expect(page.locator('#consentSheet')).toBeHidden();
});

test('an old "no" stays a no: no question, nothing sent', async ({ page }) => {
  await setup(page, { analytics: '0', list: null });
  await expect(page.locator('#startStop')).toBeVisible();
  await expect(page.locator('#consentSheet')).toBeHidden();
  await page.waitForTimeout(400);
  expect(page.gcRequests).toEqual([]);
});

test('with consent: the kind of device, a ride started and its length as a range, a workout started; never a device name or a number of watts', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 12, 18, 0) });
  await setup(page, { analytics: '1' });
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
  await page.click('#startStop');
  await page.clock.runFor(70 * 1000);
  await page.click('#finishRide');
  await expect(page.locator('#finishSheet')).toBeVisible();
  const ev = await page.evaluate(() => window.__gcEvents);
  expect(ev).toEqual(expect.arrayContaining(['app-open/web', 'trainer/FTMS', 'ride-start', 'ride-complete/1-5m', 'stay/1m']));
  for (const e of ev) { expect(e, e).not.toMatch(/rysel|d100|kickr|\d{3}\s*w/i); expect(e.length, e).toBeLessThanOrEqual(60); }
  expect(page.errors).toEqual([]);
});

test('"Segnala il tuo rullo": apre un\'email già compilata con i dettagli del rullo, e offre di copiarla', async ({ page }) => {
  await setup(page, { analytics: '0' });
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
  // prima connessione: compare l'invito
  await expect(page.locator('#reportHint')).toBeVisible();
  await page.click('#reportHintGo');
  await page.locator('.dlg [data-cancel]').click();
  await page.click('#openSettings');
  await page.click('#reportTrainer');
  const urls = await page.evaluate(() => window.__opened);
  expect(urls).toHaveLength(2);
  for (const raw of urls) {
    // an e-mail ready in the person's own mail program: nobody needs a GitHub account, and nothing is sent until they press send
    expect(raw.startsWith('mailto:report@spindro.fit?subject=')).toBe(true);
    expect(raw.length, 'short enough for every mail program').toBeLessThanOrEqual(1900);
    const u = new URL(raw); const d = u.searchParams.get('body');
    expect(u.searchParams.get('subject')).toMatch(/^\[Trainer\] /);
    expect(d.startsWith('Scrivi qui cosa è successo')).toBe(true);
    expect(d).toContain('BLE name: ');
    expect(d).toContain('BLE services: Fitness Machine (FTMS)');
    expect(d).toContain('Protocol used: FTMS');
    expect(d).toMatch(/ERG \(target power\) available: (yes|no)/);
    expect(d).toContain('App version: ');
    expect(d).toContain('Platform: Web');
    expect(d).toContain('Device: ');
  }
  // the way out when no mail program opens: the same text can be copied
  await expect(page.locator('.dlg')).toContainText('report@spindro.fit');
  await page.locator('.dlg [data-cancel]').click();
  // la seconda volta lo stesso rullo non rifà l'invito
  await page.click('.close[data-close="settingsSheet"]');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); }); // scollega
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); }); // ricollega
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
  await expect(page.locator('#reportHint')).toBeHidden();
});

test('guide orologi: il selettore mostra i passi di ogni marca, senza dire "verificato"', async ({ page }) => {
  await setup(page, { analytics: '0' });
  await page.click('#openSettings');
  for (const b of ['wahoo', 'coros', 'suunto', 'polar', 'apple']) {
    await page.selectOption('#watchBrand', b);
    await expect(page.locator('#watchBrandGuide li')).toHaveCount(3);
    await expect(page.locator('#watchBrandGuide')).toContainText('Dovrebbe funzionare');
    await expect(page.locator('#watchBrandGuide')).not.toContainText(/verificat/i);
  }
  await page.selectOption('#watchBrand', 'garmin');
  await expect(page.locator('#watchBrandGuide .wg-steps li')).toHaveCount(3);
});
