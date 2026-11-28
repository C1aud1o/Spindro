// H1: pannello Dispositivi. Dispositivi finti (tests/fake-ble.js): rullo, Click, cardio, sensore di cadenza, misuratore di potenza.
// Un solo pulsante "Aggiungi dispositivo"; l'app assegna da sola il ruolo; fonti di potenza e cadenza; ricollegamento all'avvio.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('lang', 'it'); localStorage.setItem('ftp', '200'); localStorage.setItem('autoPause', '0'); /* prove da fermi: nessuna partenza automatica che nasconda la barra in alto */ } } catch { /* */ } });
  await page.addInitScript({ path: FAKE_BLE });
});
test.afterEach(async ({ page }) => { expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]); });

/** Dal pannello, come farebbe una persona: scelta del dispositivo finto e "Aggiungi dispositivo". */
async function addVia(page, kind) {
  if (!(await page.locator('#devicesSheet').isVisible())) await page.click('#deviceBar');
  await page.evaluate((k) => { window.__fakeBle.next = k; }, kind);
  await page.click('#addDevice');
}
const cards = (page) => page.locator('#deviceList .dev-card');
/** "Opzioni avanzate" è chiuso a ogni apertura del pannello: lo apre come farebbe una persona. */
async function openAdvanced(page) {
  if (!(await page.locator('#devicesSheet').isVisible())) await page.click('#deviceBar');
  if (!(await page.locator('#devAdvanced').evaluate((d) => d.open))) await page.click('#devAdvanced > summary');
}
/** "Dimentica" dalla scheda, con la conferma. */
async function forgetCard(page, card) { await card.locator('[data-forget]').click(); await page.click('.dlg [data-ok]'); }

test('il pannello si apre dalla riga di stato; vuoto non ha dispositivi e propone di aggiungerne uno', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#deviceBar')).toBeVisible();
  await expect(page.locator('#trainerStatus')).toHaveText('—');
  await page.click('#deviceBar');
  await expect(page.locator('#devicesSheet')).toBeVisible();
  await expect(page.locator('.dev-empty')).toBeVisible();
  await expect(page.locator('#addDevice')).toHaveText('Aggiungi un dispositivo');
  await expect(page.locator('#sourcesGroup')).toBeHidden();
  // niente doppioni in alto: resta solo l'ingranaggio
  await page.click('#devicesSheet .close');
  await expect(page.locator('.top-actions button')).toHaveCount(1);
});

test('rullo, Click, cardio e sensore di cadenza: ognuno prende da solo il suo ruolo', async ({ page }) => {
  await page.goto('/index.html');
  await addVia(page, 'trainer');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).nth(0)).toContainText('Van Rysel');
  await expect(cards(page).nth(0).locator('.dev-type')).toHaveText('Rullo');
  await expect(cards(page).nth(0).locator('.dev-state')).toHaveText('Collegato');
  await expect(cards(page).nth(0)).toContainText('83%'); // batteria letta dal servizio standard
  await expect(cards(page).nth(0).locator('button')).toHaveText(['Dimentica']); // collegato: niente "Ricollega", l'app ci pensa da sola

  await addVia(page, 'click');
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).nth(1).locator('.dev-type')).toHaveText('Comandi');

  await addVia(page, 'hr');
  await expect(cards(page).nth(2).locator('.dev-type')).toHaveText('Cardio');

  await addVia(page, 'csc');
  await expect(cards(page).nth(3).locator('.dev-type')).toHaveText('Sensore di cadenza');
  await expect(page.locator('#addDevice')).toHaveText('Aggiungi un dispositivo'); // sempre lo stesso pulsante

  // riga di stato in home con i nomi veri
  await page.click('#devicesSheet .close');
  await expect(page.locator('#trainerStatus')).toContainText('Van Rysel');
  await expect(page.locator('#clickStatus')).toContainText('Zwift Click');
  await expect(page.locator('#hrStatus')).toContainText('Fake HRM');
  await expect(page.locator('#dvExtra')).toBeVisible();
  await expect(page.locator('#extraStatus')).toHaveText('+1');
  // la fascia cardio dà il battito
  await page.evaluate(() => window.__fakeBle.setHr(142));
  await expect(page.locator('#hr')).toHaveText('142');

  // "Dimentica" dal pannello: chiede conferma, scollega e non lo ricorda più
  await page.click('#deviceBar');
  await cards(page).nth(2).locator('[data-forget]').click();
  await page.click('.dlg [data-cancel]');
  await expect(cards(page)).toHaveCount(4); // annullato: non succede nulla
  await forgetCard(page, cards(page).nth(2));
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator('#hrStatus')).toHaveText('—');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devKnown')).map((k) => k.id))).not.toContain('fake-hr');
});

test('rullo "Zwift Ready" (FTMS + servizio Zwift): è solo un rullo, non parte l\'handshake dei telecomandi', async ({ page }) => {
  await page.goto('/index.html');
  await addVia(page, 'trainer-zwift');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).nth(0).locator('.dev-type')).toHaveText('Rullo'); // un solo tipo, non "Rullo + Comandi'
  expect(await page.evaluate(() => window.__fakeBle.state.rideOn || 0), 'nessun "RideOn" scritto sul rullo').toBe(0);
  await page.click('#devicesSheet .close');
  await expect(page.locator('#trainerStatus')).toContainText('Van Rysel');
  await expect(page.locator('#clickStatus')).toHaveText('—');
  // ruoli salvati da una versione vecchia (rullo + comandi): al riavvio si ricollega come solo rullo
  await page.evaluate(() => { localStorage.setItem('devKnown', JSON.stringify([{ id: 'fake-trainer-z', name: 'x', roles: ['trainer', 'click'] }])); window.__fakeBle.known = []; });
  await page.addInitScript(() => { window.__fakeBle.known = [window.__fakeBle.make('trainer-zwift')]; });
  await page.reload();
  await expect(page.locator('#trainerStatus')).toContainText('Van Rysel');
  await expect(page.locator('#clickStatus')).toHaveText('—');
});

test('solo Cycling Power: se non c\'è un rullo chiede una volta "rullo o misuratore?" e lo ricorda', async ({ page }) => {
  await page.goto('/index.html');
  await addVia(page, 'cps');
  await expect(page.locator('.dlg')).toContainText('rullo o un misuratore di potenza');
  await page.click('.dlg [data-cancel]'); // "Misuratore"
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).nth(0).locator('.dev-type')).toHaveText('Misuratore di potenza');
  // il ruolo si può cambiare dalle opzioni avanzate
  await expect(page.locator('#devAdvList [data-role]')).toBeHidden();
  await openAdvanced(page);
  await expect(page.locator('#devAdvList [data-role]')).toHaveValue('power');
  // scollego e ricollego: non chiede più
  await page.evaluate(() => window.rfDevices.disconnectAll());
  await expect(cards(page)).toHaveCount(0);
  await addVia(page, 'cps');
  await expect(page.locator('.dlg')).toHaveCount(0);
  await expect(cards(page).nth(0).locator('.dev-type')).toHaveText('Misuratore di potenza');
  expect(await page.evaluate(() => localStorage.getItem('devRoles'))).toContain('"power"');
  // cambio ruolo: era un rullo
  await openAdvanced(page);
  await page.locator('#devAdvList [data-role]').selectOption('trainer');
  await expect(cards(page).nth(0).locator('.dev-type')).toHaveText('Rullo');
  await expect(page.locator('#trainerStatus')).toContainText('Fake Power Pedals');
});

test('solo Cycling Power con un rullo già collegato: è un misuratore, nessuna domanda', async ({ page }) => {
  await page.goto('/index.html');
  await addVia(page, 'trainer');
  await addVia(page, 'cps');
  await expect(page.locator('.dlg')).toHaveCount(0);
  await expect(cards(page).nth(1).locator('.dev-type')).toHaveText('Misuratore di potenza');
  // i suoi watt vincono su quelli del rullo (150 W)
  await page.evaluate(() => window.__fakeBle.pushCps(222));
  await expect(page.locator('#power')).toHaveText('222');
  // fonte di potenza: dalle opzioni avanzate si torna a quella del rullo
  await openAdvanced(page);
  await page.selectOption('#srcPower', 'trainer');
  await expect(page.locator('#power')).toHaveText('150');
});

test('cadenza: il sensore dedicato vince sul rullo; la fonte si cambia dal pannello e la calibrazione sparisce', async ({ page }) => {
  await page.goto('/index.html');
  await addVia(page, 'trainer');
  await page.click('#devicesSheet .close');
  await page.click('#openSettings');
  await expect(page.locator('#calibGroup')).toBeHidden(); // il rullo finto manda già la cadenza (80 rpm)
  await page.click('#settingsSheet .close');
  await page.click('#deviceBar');
  await addVia(page, 'csc');
  // 90 giri al minuto = un giro ogni 683 tick da 1/1024 s
  await page.evaluate(() => { window.__fakeBle.pushCsc({ crank: { revs: 100, t: 1000 } }); window.__fakeBle.pushCsc({ crank: { revs: 101, t: 1683 } }); });
  await page.click('#devicesSheet .close');
  await expect(page.locator('#cadence')).toHaveText('90');
  await page.click('#deviceBar');
  await openAdvanced(page);
  await expect(page.locator('#srcCadence')).toHaveValue('auto');
  await expect(page.locator('#srcCadence option[value=auto]')).toContainText('Sensore di cadenza');
  // scelgo il rullo come fonte: 80 rpm
  await page.selectOption('#srcCadence', 'trainer');
  await page.evaluate(() => window.__fakeBle.state.trainer && window.__fakeBle.setPower(150));
  await page.click('#devicesSheet .close');
  await expect(page.locator('#cadence')).toHaveText('80', { timeout: 5000 });
  expect(await page.evaluate(() => localStorage.getItem('srcCadence'))).toBe('trainer');
  // senza cadenza vera (nessun rullo con cadenza, nessun sensore) il testo avverte che è una stima
  await page.evaluate(() => document.getElementById('deviceBar').click()); // the pedalling above may already have auto-started the ride, which hides the bar: open the panel the way the Click menu does
  await openAdvanced(page);
  await page.selectOption('#srcCadence', 'estimate');
  await expect(page.locator('#srcNote')).toContainText('stima');
});

test('sensore CSC di qualsiasi marca: pedivella e ruota, rollover a 16 bit, cadenza 0 dopo 2,5 s', async ({ page }) => {
  await page.goto('/index.html');
  await addVia(page, 'csc');
  await page.click('#devicesSheet .close');
  const cad = () => page.locator('#cadence');
  // rollover del tempo (65535 → 0) e dei giri (65535 → 0): 683 tick = 0,667 s = 90 rpm
  await page.evaluate(() => { const f = window.__fakeBle; f.pushCsc({ crank: { revs: 65534, t: 65000 } }); f.pushCsc({ crank: { revs: 65535, t: (65000 + 683) & 0xffff } }); });
  await expect(cad()).toHaveText('90');
  await page.evaluate(() => window.__fakeBle.pushCsc({ crank: { revs: 0, t: (65000 + 1366) & 0xffff } }));
  await expect(cad()).toHaveText('90');
  // il sensore smette di mandare giri nuovi (pacchetto ripetuto): dopo 2,5 s cadenza 0
  await page.evaluate(() => { const f = window.__fakeBle; window.__rep = setInterval(() => f.pushCsc({ crank: { revs: 0, t: (65000 + 1366) & 0xffff } }), 400); });
  await expect(cad()).toHaveText('0', { timeout: 6000 });
  await page.evaluate(() => clearInterval(window.__rep));
  // di nuovo in pedalata
  await page.evaluate(() => window.__fakeBle.pushCsc({ crank: { revs: 1, t: (65000 + 1366 + 600) & 0xffff } }));
  await expect(cad()).not.toHaveText('0');
  // sensore con anche la ruota: ruolo "cadenza e velocità"
  await page.evaluate(() => window.__fakeBle.pushCsc({ wheel: { revs: 10, t: 0 }, crank: { revs: 2, t: (65000 + 1366 + 1200) & 0xffff } }));
  await openAdvanced(page);
  await expect(page.locator('#devAdvList .pill')).toContainText('cadenza e velocità');
});

test('parsing CSC: solo ruota, solo pedivella, flag misti (funzioni pure del modulo)', async ({ page }) => {
  await page.goto('/index.html');
  const r = await page.evaluate(async () => {
    const m = await import('/js/powermeter.js');
    const dv = (b) => new DataView(new Uint8Array(b).buffer);
    return {
      wheelOnly: m.parseCsc(dv([1, 0x10, 0, 0, 0, 0x00, 0x04])),
      crankOnly: m.parseCsc(dv([2, 0x05, 0x00, 0x00, 0x04])),
      both: m.parseCsc(dv([3, 1, 0, 0, 0, 2, 0, 7, 0, 0, 1])),
      first: m.rate(null, { revs: 1, t: 1 }, 0),
      ninety: m.rate({ revs: 65535, t: 65000, at: 0 }, { revs: 0, t: (65000 + 683) & 0xffff }, 100),
      stopped: m.rate({ revs: 5, t: 100, at: 0 }, { revs: 5, t: 100 }, 3000),
      stillRecent: m.rate({ revs: 5, t: 100, at: 0 }, { revs: 5, t: 100 }, 1000),
    };
  });
  expect(r.wheelOnly).toEqual({ wheel: { revs: 16, t: 1024 }, crank: null });
  expect(r.crankOnly).toEqual({ wheel: null, crank: { revs: 5, t: 1024 } });
  expect(r.both.wheel).toEqual({ revs: 1, t: 2 });
  expect(r.both.crank).toEqual({ revs: 7, t: 256 });
  expect(r.first).toBeUndefined();
  expect(Math.round(r.ninety)).toBe(90);
  expect(r.stopped).toBe(0);
  expect(r.stillRecent).toBeUndefined();
});

test('all\'avvio i dispositivi già usati si ricollegano da soli, senza errori visibili se non riesce', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('devKnown', JSON.stringify([
      { id: 'fake-hr', name: 'Fake HRM', roles: ['hr'] },
      { id: 'fake-assente', name: 'Non c\'è', roles: ['trainer'] },
    ]));
    window.__fakeBle.known = [window.__fakeBle.make('hr')];
  });
  await page.goto('/index.html');
  await expect(page.locator('#hrStatus')).toContainText('Fake HRM', { timeout: 6000 });
  await expect(page.locator('#trainerStatus')).toHaveText('—');
  await expect(page.locator('#connectHelp')).toBeHidden();
  await expect(page.locator('#toast.show, #toast.on')).toHaveCount(0);
});

test('primo avvio: un pulsante che apre direttamente la scelta Bluetooth', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => { window.__asked = 0; const r = navigator.bluetooth.requestDevice; navigator.bluetooth.requestDevice = (o) => { window.__asked++; window.__opts = o; return r(o); }; });
  await page.click('#welcomeConnect');
  await expect(page.locator('#trainerStatus')).toContainText('Van Rysel');
  expect(await page.evaluate(() => window.__asked)).toBe(1);
  // un'unica richiesta con tutti i servizi supportati
  const o = await page.evaluate(() => window.__opts);
  const svc = o.filters.flatMap((f) => f.services || []);
  for (const s of [0x1826, 0x1818, 0x1816, 0x180d, '6e40fec1-b5a3-f393-e0a9-e50e24dcca9e', 0xfc82]) expect(svc).toContain(s);
  expect(o.filters.map((f) => f.namePrefix).filter(Boolean)).toEqual(expect.arrayContaining(['Zwift', 'Tacx', 'D100']));
});

test('errore di collegamento: compaiono le soluzioni e il pannello non resta bloccato', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => { navigator.bluetooth.requestDevice = () => Promise.reject(new DOMException('User cancelled', 'NotFoundError')); });
  await page.click('#deviceBar');
  await page.click('#addDevice');
  await expect(page.locator('#devMsg')).toBeVisible();
  await expect(page.locator('#devMsg')).toContainText('Bluetooth');
  await expect(page.locator('#addDevice')).toBeEnabled();
});
