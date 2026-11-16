// D1: collegare i dispositivi. Dispositivi finti (tests/fake-ble.js): primo collegamento, problemi per piattaforma, suggerimenti,
// ricollegamento all'avvio, cadute in corsa (anche a metà della stretta di mano, due volte di fila, con allenamento o gioco aperti),
// dispositivi insoliti, prova del rullo, layout a 360×640. Si parte in inglese: i testi sono quelli in locales/en.json.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const STORE = (extra = []) => ({ cookies: [], origins: [{ origin: `http://127.0.0.1:${PORT}`, localStorage: [{ name: 'safetyAck', value: '1' }, ...extra] }] });

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('lang', 'en'); localStorage.setItem('ftp', '200'); localStorage.setItem('ergW', '180'); } } catch { /* */ } });
  await page.addInitScript({ path: FAKE_BLE });
});
test.afterEach(async ({ page }) => { expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]); });

const boot = async (page) => { await page.goto('/index.html'); await page.waitForFunction(() => window.rfDevices); await page.evaluate(() => { window.rfDevices.hub.backoffMs = [80, 80, 80, 80, 80]; }); };
const fast = (page, ms = [80, 80, 80, 80, 80]) => page.evaluate((m) => { window.rfDevices.hub.backoffMs = m; }, ms);
const next = (page, kind) => page.evaluate((k) => { window.__fakeBle.next = k; }, kind);
const erg = (page) => page.evaluate(() => window.__fakeBle.state.controlLog.filter((b) => b[0] === 0x05).map((b) => b[1] | (b[2] << 8)));
const dataEvents = (page) => page.evaluate(() => { // quante volte arriva "data" per un solo pacchetto del rullo (deve essere 1)
  const tr = window.rfDevices.hub.trainer; let n = 0; const h = () => { n++; };
  tr.addEventListener('data', h); window.__fakeBle.setPower(150); tr.removeEventListener('data', h); return n;
});
const hrEvents = (page) => page.evaluate(() => { const h = window.rfDevices.hub.hrm; let n = 0; const f = () => { n++; }; h.addEventListener('hr', f); window.__fakeBle.setHr(120); h.removeEventListener('hr', f); return n; });
const connectTrainer = async (page) => { await page.click('#welcomeConnect'); await expect(page.locator('#trainerStatus')).toContainText('Van Rysel'); };
const cards = (page) => page.locator('#deviceList .dev-card');

test.describe('funzioni pure', () => {
  test('detectSupport, explainError, nextSuggestion', async ({ page }) => {
    await page.goto('/index.html');
    const r = await page.evaluate(async () => {
      const m = await import('/js/connect.js');
      const ua = {
        ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1',
        ff: 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
        safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
        chromeDesk: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      };
      const s = (u, o = {}) => m.detectSupport({ ua: ua[u], hasBluetooth: false, ...o });
      const e = (name, message, o) => m.explainError(Object.assign(new Error(message), { name }), o);
      return {
        ios: s('ios'), ff: s('ff'), safari: s('safari'), android: s('chromeAndroid', { hasBluetooth: true }), desk: s('chromeDesk', { hasBluetooth: true }),
        app: s('chromeAndroid', { native: true }), insecure: s('chromeDesk', { hasBluetooth: false, secure: false }),
        cancelled: e('NotFoundError', 'User cancelled the requestDevice() chooser.'),
        permission: e('NotAllowedError', 'Bluetooth permission has been blocked.'),
        gesture: e('NotAllowedError', 'Must be handling a user gesture to show a permission request.'),
        off: e('NotFoundError', 'Bluetooth adapter not available.'),
        nativeOff: e('Error', 'Bluetooth is not enabled'),
        busy: e('NetworkError', 'GATT operation failed for unknown reason.', { afterPick: true }),
        already: e('Error', 'Device already connected'),
        none: [m.nextSuggestion({ trainer: false }), m.nextSuggestion({ trainer: true, riding: true })],
        seq: [m.nextSuggestion({ trainer: true }), m.nextSuggestion({ trainer: true, haveClick: true }), m.nextSuggestion({ trainer: true, haveClick: true, haveHr: true }),
          m.nextSuggestion({ trainer: true, dismissed: ['click'] }), m.nextSuggestion({ trainer: true, dismissed: ['click', 'hr'] })],
        backoff: [0, 1, 2, 3, 99].map((i) => m.backoffAt(m.BACKOFF_MS, i)),
      };
    });
    expect([r.ios.reason, r.ios.platform]).toEqual(['ios', 'ios']);
    expect(r.ff.reason).toBe('firefox'); expect(r.safari.reason).toBe('safari');
    expect(r.android).toMatchObject({ ok: true, platform: 'android' }); expect(r.desk).toMatchObject({ ok: true, platform: 'desktop' });
    expect(r.app).toMatchObject({ ok: true, platform: 'app' }); expect(r.insecure.reason).toBe('insecure');
    expect([r.cancelled, r.permission, r.gesture, r.off, r.nativeOff, r.busy, r.already]).toEqual(['cancelled', 'permission', 'unknown', 'off', 'off', 'busy', 'already']);
    expect(r.none).toEqual([null, null]);
    expect(r.seq).toEqual(['click', 'hr', null, 'hr', null]);
    expect(r.backoff).toEqual([1000, 2000, 5000, 10000, 30000]);
  });
});

test.describe('1 · prima volta, solo rullo', () => {
  test('un pulsante, la riga che spiega la lista, watt dal vivo dopo il tocco', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#welcome')).toBeVisible();
    await expect(page.locator('#welcome .fine')).toContainText('pick your trainer');
    await expect(page.locator('#welcomeConnect')).toHaveText('Connect your trainer');
    const t0 = Date.now();
    await page.click('#welcomeConnect'); // l'unico tocco dell'app: poi decide il browser con la sua lista
    await expect(page.locator('#power')).toHaveText('150');
    console.log(`D1 caso 1: ${Date.now() - t0} ms dal tocco ai watt (dispositivo finto), 1 tocco nell'app`);
    await expect(page.locator('.sheet:not([hidden])')).toHaveCount(0); // niente fogli in mezzo
  });

  test('iPhone: browser senza Web Bluetooth, lo dice e dice cosa fare', async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 780 }, storageState: STORE([{ name: 'analytics', value: '0' }, { name: 'lang', value: 'en' }]) });
    const page = await ctx.newPage();
    await page.addInitScript(() => { delete Navigator.prototype.bluetooth; });
    await page.goto('/index.html');
    await expect(page.locator('#unsupported')).toBeVisible();
    await expect(page.locator('#unsupported')).toContainText('iPhone and iPad');
    await expect(page.locator('#unsupported')).toContainText('Bluefy');
    await page.click('#welcomeConnect');
    await expect(page.locator('#connectHelp')).toBeHidden(); // non si ripete il testo già in alto
    await ctx.close();
  });

  test('Firefox: dice di usare Chrome o Edge', async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0', storageState: STORE([{ name: 'analytics', value: '0' }, { name: 'lang', value: 'en' }]) });
    const page = await ctx.newPage();
    await page.addInitScript(() => { delete Navigator.prototype.bluetooth; });
    await page.goto('/index.html');
    await expect(page.locator('#unsupported')).toContainText(/Firefox/);
    await ctx.close();
  });

  test('Bluetooth spento: lo dice prima di aprire la lista, con il passo giusto per la piattaforma', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => { navigator.bluetooth.getAvailability = async () => false; window.__asked = 0; const r = navigator.bluetooth.requestDevice; navigator.bluetooth.requestDevice = (o) => { window.__asked++; return r(o); }; });
    await page.click('#welcomeConnect');
    await expect(page.locator('#connectHelp')).toContainText('Bluetooth is off');
    await expect(page.locator('#connectHelp')).toContainText('system settings'); // desktop
    expect(await page.evaluate(() => window.__asked)).toBe(0);
    await page.click('#connectHelpRetry'); // "Riprova" non ripete il controllo: apre la lista (Chrome ha il suo "Accendi Bluetooth")
    await expect(page.locator('#trainerStatus')).toContainText('Van Rysel');
  });

  test('permesso negato: Android Chrome e desktop hanno istruzioni diverse', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => { navigator.bluetooth.requestDevice = () => Promise.reject(Object.assign(new Error('Bluetooth permission has been blocked.'), { name: 'NotAllowedError' })); });
    await page.click('#welcomeConnect');
    await expect(page.locator('#connectHelp')).toContainText('permission is blocked');
    await expect(page.locator('#connectHelp')).toContainText('Site settings');
    await expect(page.locator('#connectHelpReport')).toHaveCount(0); // non è un problema del dispositivo: niente "segnala"
  });

  test('rullo già in uso da un\'altra app: lo dice con il nome', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => { window.__fakeBle.failConnect = 1; });
    await page.click('#welcomeConnect');
    await expect(page.locator('#connectHelp')).toContainText("Couldn't connect to Van Rysel");
    await expect(page.locator('#connectHelp')).toContainText('another app');
    await expect(page.locator('#connectHelp li')).toHaveCount(3);
    await page.click('#connectHelpRetry');
    await expect(page.locator('#trainerStatus')).toContainText('Van Rysel');
    await expect(page.locator('#connectHelp')).toBeHidden();
  });

  test('sul telefono lo stesso flusso entra in 390×780 senza scorrere in orizzontale', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await page.goto('/index.html');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#welcomeConnect')).toBeInViewport();
  });

  test('il foglio di sicurezza compare una volta sola, il consenso non si ripresenta', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORE([]).origins ? { cookies: [], origins: [{ origin: `http://127.0.0.1:${PORT}`, localStorage: [{ name: 'analytics', value: '0' }, { name: 'lang', value: 'en' }] }] } : undefined });
    const page = await ctx.newPage();
    await page.addInitScript({ path: FAKE_BLE });
    await page.goto('/index.html');
    await page.click('#welcomeConnect');
    await expect(page.locator('#power')).toHaveText('150');
    await expect(page.locator('.sheet:not([hidden])')).toHaveCount(0); // collegare non apre nessun foglio
    await page.click('#startStop');
    await expect(page.locator('#safetySheet')).toBeVisible();
    await page.click('#safetyOk');
    await expect(page.locator('#safetySheet')).toBeHidden();
    await page.click('#startStop'); await page.click('#startStop'); // pausa e di nuovo via
    await expect(page.locator('#safetySheet')).toBeHidden();
    await page.reload();
    await expect(page.locator('.sheet:not([hidden])')).toHaveCount(0);
    await ctx.close();
  });
});

test.describe('2 · rullo, comandi e cardio: un suggerimento alla volta', () => {
  test('dopo il rullo "Aggiungi i comandi", poi "Aggiungi il cardio"; "Non fa per me" vale per sempre', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#suggest')).toBeHidden(); // senza rullo non si suggerisce nulla
    await connectTrainer(page);
    await expect(page.locator('#suggest')).toBeVisible();
    await expect(page.locator('#suggestAdd')).toHaveText('Add your controller');
    await expect(page.locator('#suggest:visible')).toHaveCount(1);
    // un tocco: la lista del browser mostra solo i comandi Zwift
    await page.evaluate(() => { const r = navigator.bluetooth.requestDevice; navigator.bluetooth.requestDevice = (o) => { window.__opts = o; return r(o); }; });
    await page.click('#suggestAdd');
    await expect(page.locator('#clickStatus')).toContainText('Zwift Click');
    const o = await page.evaluate(() => window.__opts);
    expect(o.filters.flatMap((f) => f.services || [])).toEqual([0xfc82]); // niente rulli nella lista
    await expect(page.locator('#suggestAdd')).toHaveText('Add heart rate');
    await page.click('#suggestNever');
    await expect(page.locator('#suggest')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('suggestOff'))).toBe('["hr"]');
    await page.reload();
    await expect(page.locator('#suggest')).toBeHidden();
  });

  test('"Non fa per me" sui comandi passa al cardio; non compare mentre si pedala né a un foglio aperto', async ({ page }) => {
    await boot(page);
    await connectTrainer(page);
    await page.click('#suggestNever');
    await expect(page.locator('#suggestAdd')).toHaveText('Add heart rate');
    await page.click('#startStop');
    await expect(page.locator('#suggest')).toBeHidden();
    await page.click('#startStop');
  });

  test('un dispositivo con più ruoli viene spiegato a parole', async ({ page }) => {
    await boot(page);
    await connectTrainer(page); // rullo
    await page.click('#deviceBar');
    await expect(cards(page).first()).toContainText('Sets the resistance');
    await expect(cards(page).first()).toContainText('Protocol: FTMS');
    // Cycling Power + CSC (misuratore con cadenza): "un solo dispositivo, più compiti"
    await next(page, 'cps-csc'); await page.click('#addDevice');
    await expect(cards(page).nth(1)).toContainText('Measures your real watts');
    // FTMS + cardio nello stesso apparecchio: due ruoli, spiegati
    await next(page, 'trainer-hr'); await page.click('#addDevice');
    await expect(page.locator('#toast')).toContainText('works as trainer + heart rate');
    await expect(cards(page).nth(1)).toContainText('One device, several jobs: trainer + heart rate');
  });
});

test.describe('3 · il giorno dopo', () => {
  const known = [{ id: 'fake-trainer', name: 'Van Rysel D100 (finto)', roles: ['trainer'] }, { id: 'fake-hr', name: 'Fake HRM', roles: ['hr'] }];
  test('si ricollegano da soli; nel frattempo "Ricollego…" per ciascuno', async ({ page }) => {
    await page.addInitScript((k) => { localStorage.setItem('devKnown', JSON.stringify(k)); window.__fakeBle.known = [window.__fakeBle.make('trainer'), window.__fakeBle.make('hr')]; window.__fakeBle.connectDelay = 600; }, known);
    await page.goto('/index.html');
    await expect(page.locator('#trainerStatus')).toHaveText('Reconnecting…');
    await expect(page.locator('#hrStatus')).toHaveText('Reconnecting…');
    await expect(page.locator('#welcomeConnect')).toBeDisabled();
    await expect(page.locator('#trainerStatus')).toContainText('Van Rysel', { timeout: 6000 });
    await expect(page.locator('#hrStatus')).toContainText('Fake HRM', { timeout: 6000 });
    await expect(page.locator('#connectHelp')).toBeHidden();
  });

  test('il browser non ricorda i permessi: un pulsante "Ricollega" li passa uno alla volta', async ({ page }) => {
    await page.addInitScript((k) => { localStorage.setItem('devKnown', JSON.stringify(k)); window.__fakeBle.known = []; window.__asks = []; const r = navigator.bluetooth.requestDevice; navigator.bluetooth.requestDevice = (o) => { window.__asks.push(o); window.__fakeBle.next = window.__asks.length === 1 ? 'trainer' : 'hr'; return r(o); }; }, known);
    await page.goto('/index.html');
    await expect(page.locator('#trainerStatus')).toHaveText('—', { timeout: 3000 });
    await expect(page.locator('#welcomeConnect')).toHaveText('Reconnect Van Rysel D100 (finto)');
    await expect(page.locator('#welcomeConnect')).toBeEnabled();
    await page.click('#welcomeConnect');
    await expect(page.locator('#trainerStatus')).toContainText('Van Rysel');
    // la lista del browser era ristretta a quel nome
    expect(await page.evaluate(() => window.__asks[0].filters)).toEqual([{ name: 'Van Rysel D100 (finto)' }]);
    // e col rullo collegato resta l'altro dispositivo da ricollegare: dal pannello, con lo stesso pulsante
    await page.click('#deviceBar');
    await expect(page.locator('#reconnectDevice')).toHaveText('Reconnect Fake HRM');
    await expect(cards(page).nth(1)).toContainText('needs a tap');
    await page.click('#reconnectDevice');
    await expect(page.locator('#hrStatus')).toContainText('Fake HRM');
    await expect(page.locator('#reconnectDevice')).toBeHidden();
    await expect(cards(page)).toHaveCount(2);
  });

  test('un dispositivo che non si trova: "Non trovato", si può dimenticare', async ({ page }) => {
    await page.addInitScript((k) => { localStorage.setItem('devKnown', JSON.stringify(k)); window.__fakeBle.known = [window.__fakeBle.make('hr')]; window.__fakeBle.failConnect = 1; }, known);
    await page.goto('/index.html');
    await page.click('#deviceBar');
    await expect(cards(page).filter({ hasText: 'Fake HRM' })).toContainText('Not found', { timeout: 6000 });
    await cards(page).filter({ hasText: 'Fake HRM' }).locator('[data-forget]').click();
    await expect(cards(page).filter({ hasText: 'Fake HRM' })).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('devKnown')).map((k) => k.id))).toEqual(['fake-trainer']);
  });
});

test.describe('4 · cadute in corsa', () => {
  test('rullo in ERG: la registrazione continua, avviso, ritenta, rimette i 180 W; nessun dato doppio', async ({ page }) => {
    await boot(page);
    await connectTrainer(page);
    await expect(page.locator('#power')).toHaveText('150');
    const base = await dataEvents(page);
    await page.click('#startStop');
    await expect.poll(async () => (await page.evaluate(() => window.rfDevices.ride().samples))).toBeGreaterThan(1);
    const before = (await erg(page)).length;
    await fast(page, [1500, 80]);
    await page.evaluate(() => window.__fakeBle.disconnectTrainer());
    await expect(page.locator('#dropBanner')).toBeVisible();
    await expect(page.locator('#dropText')).toContainText('Van Rysel');
    await expect(page.locator('#dropText')).toContainText('keeps recording');
    await expect(page.locator('#trainerStatus')).toHaveText('Reconnecting…');
    const s1 = await page.evaluate(() => window.rfDevices.ride().samples);
    await expect.poll(() => page.evaluate(() => window.rfDevices.ride().samples)).toBeGreaterThan(s1); // pedalare registrato anche a rullo caduto
    expect(await page.evaluate(() => window.rfDevices.ride().last.power), 'i watt non restano congelati').toBe(0);
    await expect(page.locator('#trainerStatus')).toContainText('Van Rysel', { timeout: 8000 });
    await expect(page.locator('#dropBanner')).toBeHidden();
    await expect.poll(async () => (await erg(page)).length).toBeGreaterThan(before);
    expect((await erg(page)).pop()).toBe(180); // la modalità e il valore di prima
    expect(await dataEvents(page), 'dopo la riconnessione ogni pacchetto arriva una volta sola').toBe(base);
    expect(await page.evaluate(() => window.rfDevices.ride().running)).toBe(true);
    await page.click('#startStop');
  });

  test('due cadute di fila: nessun ascoltatore in più, nessun "ricollego" bloccato', async ({ page }) => {
    await boot(page);
    await connectTrainer(page);
    const base = await dataEvents(page);
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => window.__fakeBle.disconnectTrainer());
      await expect(page.locator('#trainerStatus')).toHaveText('Reconnecting…');
      await expect(page.locator('#trainerStatus')).toContainText('Van Rysel', { timeout: 6000 });
    }
    expect(await dataEvents(page)).toBe(base);
    await page.click('#deviceBar');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first().locator('.dev-state')).toHaveText('Connected');
    expect(await page.evaluate(() => window.rfDevices.hub.busy)).toBe(false);
  });

  test('cade durante la stretta di mano del ricollegamento: riprova e alla fine è tutto a posto', async ({ page }) => {
    await boot(page);
    await connectTrainer(page);
    await page.evaluate(() => { window.__fakeBle.dropAt = 2; window.__fakeBle.disconnectTrainer(); });
    await expect(page.locator('#trainerStatus')).toContainText('Van Rysel', { timeout: 8000 });
    expect(await page.evaluate(() => window.rfDevices.hub.busy)).toBe(false);
    expect(await page.evaluate(() => window.rfDevices.hub.entries.map((e) => e.state))).toEqual(['connected']);
  });

  test('cade durante il primo collegamento: errore chiaro, niente voce rimasta a metà', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { window.__fakeBle.dropAt = 2; });
    await page.click('#welcomeConnect');
    await expect(page.locator('#connectHelp')).toBeVisible();
    expect(await page.evaluate(() => window.rfDevices.hub.entries.length)).toBe(0);
    expect(await page.evaluate(() => window.rfDevices.hub.busy)).toBe(false);
    await page.click('#connectHelpRetry');
    await expect(page.locator('#trainerStatus')).toContainText('Van Rysel');
  });

  test('con un allenamento in corso il passo giusto torna dopo la caduta', async ({ page }) => {
    await boot(page);
    await connectTrainer(page);
    await page.click('#openWorkouts');
    await page.locator('#workoutList [data-wk]').first().click();
    await expect(page.locator('#workoutCard')).toBeVisible();
    await expect(page.locator('#target')).toContainText('W');
    await page.evaluate(() => window.__fakeBle.disconnectTrainer());
    await expect(page.locator('#trainerStatus')).toHaveText('Reconnecting…');
    await expect(page.locator('#trainerStatus')).toContainText('Van Rysel', { timeout: 8000 });
    await expect(page.locator('#workoutCard')).toBeVisible();
    const shown = parseInt(await page.locator('#target').textContent(), 10);
    await expect.poll(async () => (await erg(page)).pop()).toBe(shown); // il watt del passo, non quello di prima dell'allenamento
    await page.click('#wkStop'); await page.click('.dlg [data-ok]');
  });

  test('con un gioco aperto: nessun errore, il gioco resta aperto e al ritorno i watt riprendono', async ({ page }) => {
    await boot(page);
    await connectTrainer(page);
    await page.click('#openGame');
    await page.evaluate(() => document.body.classList.add('dev'));
    await page.click('.game-card[data-game="mattoni"]');
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__fakeBle.disconnectTrainer());
    await expect(page.locator('#dropBanner')).toBeVisible();
    await expect(page.locator('#trainerStatus')).toContainText('Van Rysel', { timeout: 8000 });
    await expect(page.locator('#gamePanel')).toBeVisible();
    await page.evaluate(() => window.__fakeBle.setPower(210));
    await expect(page.locator('#power')).toHaveText('210');
  });

  test('cardio: cade e torna, il battito riprende senza dati doppi', async ({ page }) => {
    await boot(page);
    await next(page, 'hr'); await page.click('#welcomeConnect');
    await expect(page.locator('#hrStatus')).toContainText('Fake HRM');
    const base = await hrEvents(page);
    await page.evaluate(() => window.__fakeBle.drop('hr'));
    await expect(page.locator('#hr')).not.toHaveText('120');
    await expect(page.locator('#dropText')).toContainText('Fake HRM');
    await expect(page.locator('#hrStatus')).toContainText('Fake HRM', { timeout: 6000 });
    await page.evaluate(() => window.__fakeBle.setHr(133));
    await expect(page.locator('#hr')).toHaveText('133');
    expect(await hrEvents(page)).toBe(base);
  });

  test('Click: cade e torna, un solo cambio per ogni pressione', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('mode', 'gears'); localStorage.setItem('autoPause', '0'); }); // marce virtuali; niente partenza/pausa automatica
    await boot(page);
    await connectTrainer(page);
    await next(page, 'click'); await page.click('#deviceBar'); await page.click('#addDevice');
    await expect(page.locator('#clickStatus')).toContainText('Zwift Click');
    await page.click('#devicesSheet .close');
    await page.click('#startStop'); // in uscita + e − cambiano marcia (da fermi il Click naviga i menu)
    await page.evaluate(() => window.__fakeBle.drop('click'));
    await expect(page.locator('#dropText')).toContainText('Zwift Click');
    await expect(page.locator('#clickStatus')).toContainText('Zwift Click', { timeout: 6000 });
    await page.waitForTimeout(1200); // la stretta di mano del Click finisce un attimo dopo il collegamento
    const g0 = await page.locator('#gearNum').textContent();
    await page.evaluate(() => window.__fakeBle.press(1));
    await expect(page.locator('#gearNum')).not.toHaveText(g0);
    expect(parseInt(await page.locator('#gearNum').textContent(), 10) - parseInt(g0, 10)).toBe(1);
  });

  test('fuori dall\'uscita ci si arrende dopo qualche tentativo: "Riprova ora" ricollega', async ({ page }) => {
    await boot(page);
    await connectTrainer(page);
    await page.evaluate(() => { window.__fakeBle.failConnect = 99; window.__fakeBle.disconnectTrainer(); });
    await expect(page.locator('#dropText')).toContainText("Can't reach Van Rysel", { timeout: 8000 });
    await expect(page.locator('#dropRetry')).toBeVisible();
    await page.evaluate(() => { window.__fakeBle.failConnect = 0; });
    await page.click('#dropRetry');
    await expect(page.locator('#trainerStatus')).toContainText('Van Rysel', { timeout: 6000 });
    await expect(page.locator('#dropBanner')).toBeHidden();
  });

  test('in uscita non si molla mai: continua a ritentare finché dura', async ({ page }) => {
    await boot(page);
    await connectTrainer(page);
    await page.click('#startStop');
    await page.evaluate(() => { window.__fakeBle.failConnect = 8; window.__fakeBle.disconnectTrainer(); });
    await page.waitForTimeout(1500); // più dei 4 tentativi "da fermo"
    await expect(page.locator('#dropText')).toContainText('Reconnecting');
    await expect(page.locator('#trainerStatus')).toContainText('Van Rysel', { timeout: 8000 });
    await page.click('#startStop');
  });
});

test.describe('5 · dispositivi insoliti', () => {
  test('dispositivo non supportato: nome e servizi, "Segnala questo dispositivo" senza dati personali', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { window.__urls = []; window.open = (u) => { window.__urls.push(u); return null; }; });
    await next(page, 'weird');
    await page.click('#welcomeConnect');
    await expect(page.locator('#connectHelp')).toContainText('can\'t use “Mystery Gadget” yet');
    await expect(page.locator('#connectHelp')).toContainText('0x1234');
    await page.click('#connectHelpReport');
    const url = new URL(await page.evaluate(() => window.__urls[0]));
    expect(url.hostname + url.pathname).toBe('github.com/C1aud1o/Spindro/issues/new');
    expect(url.searchParams.get('title')).toBe('[Device] Mystery Gadget');
    const details = url.searchParams.get('details');
    expect(details).toContain('BLE name: Mystery Gadget'); expect(details).toContain('0x1234');
    expect(url.toString()).not.toMatch(/localStorage|127\.0\.0\.1|@/);
    expect(await page.evaluate(() => window.rfDevices.hub.entries.length)).toBe(0);
  });

  test('lo stesso dispositivo scelto due volte: lo dice con il nome, non lo raddoppia', async ({ page }) => {
    await boot(page);
    await connectTrainer(page);
    await page.click('#deviceBar');
    await page.click('#addDevice');
    await expect(page.locator('#toast')).toContainText('Van Rysel D100 (finto) is already connected');
    await expect(cards(page)).toHaveCount(1);
  });

  test('due fonti di battito: vince l\'ultima, la precedente si toglie e lo dice', async ({ page }) => {
    await boot(page);
    await next(page, 'hr'); await page.click('#welcomeConnect');
    await page.click('#deviceBar');
    await next(page, 'hr2'); await page.click('#addDevice');
    await expect(page.locator('#toast')).toContainText('Fake HRM was disconnected');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('Fake HRM 2');
    await page.evaluate(() => window.__fakeBle.setHr(150));
    await expect(page.locator('#hr')).toHaveText('150');
  });

  test('un rullo che ritrasmette il battito non viene staccato dalla fascia aggiunta dopo', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { window.__fakeBle.next = 'trainer-zwift'; });
    await connectTrainer(page);
    await next(page, 'hr'); await page.click('#deviceBar'); await page.click('#addDevice');
    await expect(page.locator('#trainerStatus')).toContainText('Van Rysel');
    await expect(page.locator('#hrStatus')).toContainText('Fake HRM');
    expect(await page.evaluate(() => window.rfDevices.hub.trainer.connected)).toBe(true);
  });

  test('secondo controller: entrambi restano collegati', async ({ page }) => {
    await boot(page);
    await connectTrainer(page);
    await next(page, 'click'); await page.click('#deviceBar'); await page.click('#addDevice');
    await page.evaluate(() => { window.__fakeBle.clickModel = 'play'; window.__fakeBle.next = 'click'; });
    await page.click('#addDevice');
    await expect(cards(page)).toHaveCount(3);
    expect(await page.evaluate(() => window.rfDevices.hub.click.links.length)).toBe(2);
  });

  test('misuratore di potenza + rullo "muto" (solo cadenza): dice che non c\'è nulla da comandare', async ({ page }) => {
    await boot(page);
    await next(page, 'cps-csc'); await page.click('#welcomeConnect');
    await page.click('#deviceBar');
    await expect(page.locator('#srcNote')).toContainText('No trainer is connected');
    await expect(cards(page).first()).toContainText("can't change resistance");
    await expect(page.locator('#srcPower')).toBeVisible();
  });
});

test.describe('Prova il rullo e stato nel pannello', () => {
  test('la resistenza sale e scende, poi si rimette il valore di prima; disabilitata in uscita', async ({ page }) => {
    test.setTimeout(45_000);
    await page.addInitScript(() => localStorage.setItem('autoPause', '0')); // nessuna partenza automatica: la prova è da fermi
    await boot(page);
    await connectTrainer(page);
    await page.click('#deviceBar');
    await expect(page.locator('[data-test]')).toBeEnabled();
    await expect(cards(page).first()).toContainText('Only when you are not riding');
    const before = await erg(page);
    await page.click('[data-test]');
    await expect(page.locator('.dev-test-note')).toContainText('Testing');
    await expect(page.locator('.dev-test-note')).toContainText('previous setting is back', { timeout: 20_000 });
    const sent = (await erg(page)).slice(before.length);
    const idx = sent.findIndex((w) => w < 180);
    const lowHighLow = sent.slice(idx);
    expect(lowHighLow[0]).toBe(50); expect(lowHighLow).toContain(110);
    expect(lowHighLow.pop(), 'alla fine il bersaglio di prima').toBe(180);
    // a uscita avviata il pulsante non c'è più
    await page.evaluate(() => document.getElementById('startStop').click()); // l'uscita parte con il pannello aperto
    await expect(page.locator('[data-test]')).toBeDisabled();
    await expect(cards(page).first()).toContainText('only available when you are not riding');
  });

  test('ogni scheda: ruolo, segno di vita, batteria, protocollo, riga di spiegazione', async ({ page }) => {
    await boot(page);
    await connectTrainer(page);
    await page.click('#deviceBar');
    const c = cards(page).first();
    await expect(c.locator('.pill')).toContainText('Trainer');
    await expect(c).toContainText('83%');
    await expect(c.locator('.dev-life')).toHaveText('Live data');
    await expect(c.locator('.dev-why')).not.toBeEmpty();
    await page.evaluate(() => { window.__fakeBle.state.trainer.gatt.connected && clearInterval(window.__fakeBle.state.timer); });
    await expect(c.locator('.dev-life')).toContainText('Last data', { timeout: 6000 });
  });
});

test.describe('layout e controller', () => {
  test('360×640: avviso, suggerimento e pannello non si sovrappongono né escono dallo schermo', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await boot(page);
    await connectTrainer(page);
    await next(page, 'click'); await page.click('#deviceBar'); await page.click('#addDevice'); await page.click('#devicesSheet .close');
    await expect(page.locator('#suggestAdd')).toHaveText('Add heart rate');
    await page.evaluate(() => { window.rfDevices.hub.backoffMs = [60000]; window.__fakeBle.drop('click'); });
    await expect(page.locator('#dropBanner')).toBeVisible();
    await expect(page.locator('#suggest')).toBeVisible();
    const boxes = await page.evaluate(() => ['deviceBar', 'dropBanner', 'suggest'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, r.top, r.bottom, r.left, r.right]; }));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i][1], `${boxes[i][0]} sotto ${boxes[i - 1][0]}`).toBeGreaterThanOrEqual(boxes[i - 1][2] - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.click('#deviceBar');
    await expect(page.locator('#addDevice')).toBeVisible();
    expect(await page.evaluate(() => document.getElementById('devicesSheet').querySelector('.sheet-body').scrollWidth <= innerWidth)).toBe(true);
  });

  test('tutto si raggiunge con la tastiera: solo bottoni e select veri, con nome accessibile', async ({ page }) => {
    await boot(page);
    await connectTrainer(page);
    await page.evaluate(() => { window.__fakeBle.next = 'cps'; });
    await page.click('#deviceBar');
    await page.click('#addDevice');
    const bad = await page.evaluate(() => [...document.querySelectorAll('#devicesSheet button, #devicesSheet select, #suggest button, #dropBanner button')].filter((e) => e.offsetParent).filter((e) => e.tabIndex < 0 || !(e.textContent.trim() || e.getAttribute('aria-label'))).map((e) => e.outerHTML.slice(0, 80)));
    expect(bad).toEqual([]);
    await page.focus('#addDevice');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).toMatch(/BUTTON|SELECT|A|INPUT/);
  });
});
