// Invito a passare parola: una sola volta, dopo la terza uscita completata, chiudibile; testi nelle cinque lingue.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
const at = (day) => new Date(2026, 10, day, 8).getTime();
const hist = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ t: at(i + 1), dur: 1800, km: 10, avgW: 130, kj: 240 })));

async function open(page, { rides = 0, consent = false, lang = 'en' } = {}) {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  // il contatore vero non si carica mai: lo script è sostituito da uno che registra gli eventi
  await page.route('https://gc.zgo.at/count.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.goatcounter.count = (o) => { (window.__gc = window.__gc || []).push(o.path); };' }));
  await page.clock.install({ time: new Date(2026, 10, 12, 18, 0) });
  await page.addInitScript(({ rides, consent, lang }) => {
    try {
      if (!localStorage.getItem('__init')) {
        localStorage.setItem('__init', '1'); localStorage.setItem('lang', lang); localStorage.setItem('analytics', consent ? '1' : '0'); localStorage.setItem('ftp', '200');
        if (rides) localStorage.setItem('rideHistory', rides);
      }
    } catch { /* */ }
    window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; };
    window.__shared = []; navigator.share = (d) => { window.__shared.push(d); return Promise.resolve(); };
  }, { rides: rides ? hist(rides) : '', consent, lang });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
}
const rideAndFinish = async (page, secs = 65) => {
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
  await page.click('#startStop');
  await page.clock.runFor(secs * 1000);
  await page.click('#finishRide');
  await expect(page.locator('#finishSheet')).toBeVisible();
};
// gli altri eventi (app-open, ride-complete…) esistono già: qui interessano solo quelli dell'invito
const gc = (page) => page.evaluate(() => (window.__gc || []).filter((p) => p.startsWith('share-prompt')));
test.afterEach(async ({ page }) => { expect(page.errors || [], 'errori JavaScript non gestiti').toEqual([]); });

test('non compare alla seconda uscita', async ({ page }) => {
  await open(page, { rides: 1 });
  await rideAndFinish(page);
  await expect(page.locator('#sharePrompt')).toBeHidden();
});

test('non compare se la terza uscita dura meno di un minuto', async ({ page }) => {
  await open(page, { rides: 2 });
  await rideAndFinish(page, 20);
  await expect(page.locator('#sharePrompt')).toBeHidden();
});

test('compare alla terza uscita; «Non ora» la chiude per sempre', async ({ page }) => {
  await open(page, { rides: 2 });
  await rideAndFinish(page);
  await expect(page.locator('#sharePrompt')).toBeVisible();
  await expect(page.locator('#sharePrompt')).toContainText('Enjoying Spindro? Tell a friend or leave a star on GitHub');
  await expect(page.locator('#sharePrompt button')).toHaveCount(3);
  await page.click('#sharePromptLater');
  await expect(page.locator('#sharePrompt')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('sharePromptDone'))).toBe('1');
  // di nuovo la schermata di fine, e dopo un ricaricamento: non torna
  await page.keyboard.press('Escape'); await expect(page.locator('#finishSheet')).toBeHidden();
  await page.click('#finishRide');
  await expect(page.locator('#sharePrompt')).toBeHidden();
  await page.reload();
  await rideAndFinish(page);
  await expect(page.locator('#sharePrompt')).toBeHidden();
  expect(await gc(page), 'senza consenso nessun evento').toEqual([]);
});

test('«Dillo a un amico» apre il pannello di condivisione con l\'indirizzo del sito e non torna', async ({ page }) => {
  await open(page, { rides: 2, consent: true });
  await rideAndFinish(page);
  await page.click('#sharePromptShare');
  await expect(page.locator('#sharePrompt')).toBeHidden();
  const shared = await page.evaluate(() => window.__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0].url).toBe('https://spindro.fit');
  expect(await page.evaluate(() => localStorage.getItem('sharePromptDone'))).toBe('1');
  await expect.poll(() => gc(page)).toEqual(['share-prompt/share']);
});

test('«Stella su GitHub» apre il repository e conta solo con il consenso', async ({ page }) => {
  await open(page, { rides: 5, consent: true });
  await rideAndFinish(page);
  await expect(page.locator('#sharePrompt')).toBeVisible(); // dalla terza in poi, se non è mai stato chiuso
  await page.click('#sharePromptStar');
  expect(await page.evaluate(() => window.__opened)).toEqual(['https://github.com/C1aud1o/Spindro']);
  await expect(page.locator('#sharePrompt')).toBeHidden();
  await expect.poll(() => gc(page)).toEqual(['share-prompt/star']);
});

test('i testi esistono nelle cinque lingue', () => {
  for (const l of ['en', 'it', 'fr', 'es', 'de']) {
    const d = JSON.parse(readFileSync(fileURLToPath(new URL(`../locales/${l}.json`, import.meta.url)), 'utf8'));
    for (const k of ['promptText', 'promptShare', 'promptStar', 'promptLater', 'promptTitle', 'promptShareText', 'promptCopied']) expect(d[`share.${k}`], `${l} share.${k}`).toBeTruthy();
  }
});
