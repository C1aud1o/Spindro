// Click v1 (due tasti, protocollo 0x37) finto: è il modello a DUE TASTI. I controller con le frecce sono in click-roles.spec.mjs.
// Tutto col solo Zwift Click (finto): navigazione automatica da fermi, menu Click pedalando, impostazioni, allenamenti, giochi.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(150_000);

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('mass', '80'); localStorage.setItem('gameQuality', 'low'); } localStorage.setItem('lang', localStorage.getItem('lang') || 'it'); } catch { /* niente storage */ }
  });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); window.__fakeBle.clickProto = 'v1'; window.__fakeBle.next = 'click'; return window.rfDevices.add(); });
  await expect(page.locator('#clickStatus')).toContainText('Zwift');
});
test.afterEach(async ({ page }) => { expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]); });

const press = async (page, d) => { await page.evaluate((x) => window.__fakeBle.press(x), d); await page.waitForTimeout(80); };
const hold = (page, d, ms = 900) => page.evaluate(([x, m]) => window.__fakeBle.hold(x, m), [d, ms]);
const focusInfo = (page) => page.evaluate(() => { const e = document.querySelector('.cn-focus'); return e ? { id: e.id, text: (e.textContent || '').trim(), cls: e.className, attrs: [...e.attributes].map((a) => `${a.name}=${a.value}`).join(' ') } : null; });
// avanti con + finché la selezione arriva sull'elemento voluto (selettore CSS o testo)
async function goTo(page, target) {
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate((tg) => { const e = document.querySelector('.cn-focus'); if (!e) return false; return tg.re ? new RegExp(tg.re, 'i').test(e.textContent) : e.matches(tg.sel); }, typeof target === 'string' ? { sel: target } : { re: target.source });
    if (ok) return;
    await press(page, +1);
  }
  throw new Error(`selezione non arrivata su ${target}: ${JSON.stringify(await focusInfo(page))}`);
}

test('fermo: la navigazione è attiva da sola e parte da "Avvia" (rullo collegato)', async ({ page }) => {
  await expect(page.locator('.cn-focus')).toBeVisible();
  expect((await focusInfo(page)).id).toBe('startStop');
  await expect(page.locator('.click-bar')).toContainText('tieni');
  // + / − non cambiano marcia: spostano la selezione
  await press(page, +1); await press(page, -1);
  await expect(page.locator('#gearNum')).toHaveText('12');
});

test('impostazioni: si apre e si cambia la lingua solo col Click, poi si torna indietro', async ({ page }) => {
  await goTo(page, '#openSettings');
  await hold(page, +1);
  await expect(page.locator('#settingsSheet')).toBeVisible();
  await goTo(page, '#langSelect');
  await hold(page, +1); // "prende" l'elenco
  await expect(page.locator('.click-bar')).toContainText('fatto');
  await press(page, +1); // lingua successiva
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lang'))).not.toBe('it');
  await hold(page, +1); // lascia l'elenco
  await hold(page, -1); // indietro: chiude le impostazioni
  await expect(page.locator('#settingsSheet')).toBeHidden();
});

test('impostazioni: un interruttore e un campo numerico si cambiano col Click', async ({ page }) => {
  await goTo(page, '#openSettings'); await hold(page, +1);
  await goTo(page, '#coachOn'.replace('#coachOn', 'label.switch'));
  const before = await page.evaluate(() => document.querySelector('.cn-focus input').checked);
  await hold(page, +1);
  await expect.poll(() => page.evaluate(() => { const l = document.querySelector('.cn-focus'); return l?.querySelector('input')?.checked; })).toBe(!before);
  await goTo(page, '#ftp'); await hold(page, +1);
  const f0 = await page.inputValue('#ftp');
  await press(page, +1);
  expect(+(await page.inputValue('#ftp'))).toBeGreaterThan(+f0);
  await hold(page, -1); // lascia il campo
  await expect(page.locator('#settingsSheet')).toBeVisible(); // il primo "tieni −" lascia il campo, non chiude
  await hold(page, -1);
  await expect(page.locator('#settingsSheet')).toBeHidden();
});

test('allenamenti: si apre, si avvia, menu Click pedalando e termina', async ({ page }) => {
  await goTo(page, '#openWorkouts'); await hold(page, +1);
  await expect(page.locator('#workoutSheet')).toBeVisible();
  await goTo(page, '[data-wk]'); await hold(page, +1);
  await expect(page.locator('body')).toHaveClass(/in-workout/);
  await expect(page.locator('#workoutSheet')).toBeHidden();
  // in allenamento + / − regolano l'intensità, non la selezione
  await page.waitForTimeout(400);
  await expect(page.locator('.cn-focus')).toHaveCount(0);
  await press(page, +1);
  await expect(page.locator('#wkBias')).toContainText('105');
  // tieni − → menu Click
  await hold(page, -1);
  await expect(page.locator('#clickMenu')).toBeVisible();
  await goTo(page, /Termina allenamento/);
  await hold(page, +1);
  await expect(page.locator('.dlg')).toBeVisible();
  await hold(page, +1); // "Sì" è preselezionato
  await expect(page.locator('#workoutCard')).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/in-workout/);
});

test('giochi: menu giochi, avvio e chiusura di Turbo Pedali, ritorno alla home', async ({ page }) => {
  await goTo(page, '#openGame'); await hold(page, +1);
  await expect(page.locator('#gameMenu')).toBeVisible();
  expect((await focusInfo(page)).attrs).toContain('data-game=shooter'); // parte dal primo gioco
  await hold(page, +1);
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
  // nel gioco i tasti sono del gioco; tieni − apre il menu
  await expect(page.locator('.cn-focus')).toHaveCount(0);
  await hold(page, -1);
  await expect(page.locator('#clickMenu')).toBeVisible();
  await goTo(page, /Esci dal gioco/);
  await hold(page, +1);
  await expect(page.locator('#gameMenu')).toBeVisible();
  await goTo(page, '#closeGame'); await hold(page, +1);
  await expect(page.locator('#gamePanel')).toBeHidden();
  // di nuovo in home; il gioco ha avviato l'uscita, quindi + / − tornano a cambiare marcia e la barra lo dice
  await expect(page.locator('.click-bar')).toContainText('menu');
  await expect(page.locator('.cn-focus')).toHaveCount(0);
});

test('storico e fine uscita sono raggiungibili; il menu Click torna alla home', async ({ page }) => {
  await goTo(page, '#startStop'); await hold(page, +1); // avvia
  await expect(page.locator('#startStop')).toHaveText('Pausa');
  await hold(page, -1);
  await expect(page.locator('#clickMenu')).toBeVisible();
  await goTo(page, /Storico/); await hold(page, +1);
  await expect(page.locator('#historySheet')).toBeVisible();
  await hold(page, -1);
  await expect(page.locator('#historySheet')).toBeHidden();
});

test('tastiera: frecce, Invio ed Esc seguono le stesse regole', async ({ page }) => {
  await expect(page.locator('.cn-focus')).toBeVisible();
  for (let i = 0; i < 40 && (await focusInfo(page)).id !== 'openSettings'; i++) await page.keyboard.press('ArrowRight');
  expect((await focusInfo(page)).id).toBe('openSettings');
  await page.keyboard.press('Enter');
  await expect(page.locator('#settingsSheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsSheet')).toBeHidden();
});

test('dispositivi: il pannello si apre e "Aggiungi dispositivo" si raggiunge solo col Click', async ({ page }) => {
  await goTo(page, '#deviceBar');
  await hold(page, +1);
  await expect(page.locator('#devicesSheet')).toBeVisible();
  await goTo(page, '#addDevice');
  await expect(page.locator('#deviceList .dev-card')).toHaveCount(2); // rullo e Click già collegati dal beforeEach
  await goTo(page, '#srcCadence'); // le fonti sono elenchi veri: si prendono con tieni +
  await hold(page, -1); // indietro
  await expect(page.locator('#devicesSheet')).toBeHidden();
});
