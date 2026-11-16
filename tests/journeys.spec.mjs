// Cinque persone, un percorso ciascuna, dall'inizio alla fine (QA q1, giro 3). Con QA_SHOTS=<cartella> salva uno screenshot a ogni passo.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
const SHOTS = process.env.QA_SHOTS;
test.setTimeout(120_000);
test.use({ storageState: { cookies: [], origins: [] } }); // si parte da zero, come un utente nuovo

async function shot(page, journey, step) { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${journey}-${step}.png` }); } }
async function boot(page, { lang, seed = {}, clock = false, path = '/index.html' }) {
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.errs = errs;
  await page.addInitScript(({ lang, seed }) => { try { if (!localStorage.getItem('__j')) { localStorage.setItem('__j', '1'); if (lang) localStorage.setItem('lang', lang); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } } catch { /* */ } }, { lang, seed });
  await page.addInitScript({ path: FAKE_BLE });
  if (clock) await page.clock.install();
  await page.goto(path);
}
const addTrainer = (page) => page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); await window.rfDevices.add(); });
const SEED_OK = { analytics: '0', safetyAck: '1' };

test('(a) nuovo utente, telefono, italiano, solo rullo: consenso → avviso → collega → ERG 3 min → pausa → riprendi → fine → FIT → immagine', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await boot(page, { lang: 'it', clock: true });
  await shot(page, 'a', '1-open');
  await expect(page.locator('#consentSheet')).toBeVisible();
  await page.click('#consentNo');
  await expect(page.locator('#consentSheet')).toBeHidden();
  await shot(page, 'a', '2-welcome');
  await expect(page.locator('#welcomeConnect')).toBeVisible();
  await page.click('#welcomeConnect'); // un solo tocco: parte la scelta Bluetooth
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
  await shot(page, 'a', '3-connected');
  await page.click('#startStop');
  await expect(page.locator('#safetySheet')).toBeVisible(); await shot(page, 'a', '4-safety');
  await page.click('#safetyOk');
  await expect(page.locator('body')).toHaveClass(/riding/);
  await page.clock.runFor(180_000); await shot(page, 'a', '5-riding');
  await expect(page.locator('#time')).toHaveText('3:00');
  await page.click('#startStop'); await expect(page.locator('body')).toHaveClass(/paused/); await shot(page, 'a', '6-paused');
  await page.click('#startStop'); await page.clock.runFor(5000); await expect(page.locator('#time')).toHaveText('3:05');
  await page.click('#finishRide'); await expect(page.locator('#finishSheet')).toBeVisible(); await page.clock.runFor(2000); await shot(page, 'a', '7-finish');
  const dl = page.waitForEvent('download'); await page.click('#saveFit'); const d = await dl;
  expect(d.suggestedFilename()).toMatch(/\.fit$/); const bytes = readFileSync(await d.path()); expect(bytes.length).toBeGreaterThan(200);
  await expect(page.locator('#toast')).toContainText(/Download|salvat/i); await shot(page, 'a', '8-saved');
  const dl2 = page.waitForEvent('download'); await page.click('#shareImg'); expect((await dl2).suggestedFilename()).toMatch(/\.png$/);
  expect(page.errs).toEqual([]);
});
