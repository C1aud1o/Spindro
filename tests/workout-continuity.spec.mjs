// Un allenamento avviato non si interrompe mai da solo: né aprendo menu e pannelli, né entrando o uscendo da un gioco,
// né smettendo di pedalare, né con la pagina in secondo piano, né ricaricando. Si ferma solo se lo ferma la persona o se finisce.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(150_000);
test.use({ actionTimeout: 15_000 }); // un clic che non trova il suo bersaglio fallisce subito, con il nome del passo

async function boot(page, { clock = false } = {}) {
  page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => {
    try {
      if (!localStorage.getItem('__wc')) { localStorage.setItem('__wc', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('safetyAck', '1'); localStorage.setItem('lang', 'it'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); }
    } catch { /* niente storage */ }
  });
  await page.addInitScript({ path: FAKE_BLE });
  if (clock) await page.clock.install();
  await page.goto('/index.html');
}
const addTrainer = (page) => page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); await window.rfDevices.add(); });
/** Secondi trascorsi dell'allenamento, letti dalla scheda ("0:07 / 30:00"). */
const wkSeconds = (page) => page.evaluate(() => {
  const m = (document.getElementById('wkTotal').textContent || '').split('/')[0].trim().split(':').map(Number);
  return m.length === 3 ? m[0] * 3600 + m[1] * 60 + m[2] : m[0] * 60 + m[1];
});
const running = (page) => page.evaluate(() => document.body.classList.contains('in-workout') && !document.getElementById('workoutCard').hidden);
async function startFirstWorkout(page) {
  await page.click('#openWorkouts');
  await page.locator('#workoutList [data-wk]').first().click();
  await expect(page.locator('#workoutCard')).toBeVisible();
  await expect(page.locator('#startStop')).toHaveText('Pausa');
}
/** L'allenamento è ancora in corso e il suo tempo è andato avanti di almeno `min` secondi rispetto a `from`. */
async function stillGoing(page, from, min, what) {
  expect(await running(page), `allenamento ancora in corso: ${what}`).toBe(true);
  await expect(page.locator('#startStop'), `uscita ancora in corso: ${what}`).toHaveText('Pausa');
  await expect.poll(() => wkSeconds(page), { timeout: 15_000, message: `il tempo dell'allenamento avanza: ${what}` }).toBeGreaterThanOrEqual(from + min);
  return wkSeconds(page);
}
test.afterEach(async ({ page }) => { expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]); });

test('menu, pannelli, entrare e uscire da un gioco: l\'allenamento continua sempre', async ({ page }) => {
  await boot(page); await addTrainer(page);
  await startFirstWorkout(page);
  let t = await stillGoing(page, 0, 2, 'appena avviato');

  // nel cruscotto: il menu Click (tasto M), aprire e chiudere
  await page.keyboard.press('m'); await expect(page.locator('#clickMenu')).toBeVisible();
  await page.waitForTimeout(1200); await page.keyboard.press('m'); await expect(page.locator('#clickMenu')).toBeHidden();
  t = await stillGoing(page, t, 1, 'dopo il menu Click');

  // elenco dei giochi dal cruscotto
  await page.click('#rideGames');
  await expect(page.locator('#gameMenu')).toBeVisible();
  t = await stillGoing(page, t, 1, 'elenco dei giochi aperto');

  // dentro un gioco: menu del gioco, partita, uscita
  await page.click('[data-game=horde]');
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
  t = await stillGoing(page, t, 1, 'menu del gioco');
  await page.evaluate(() => { const g = window.__game; g.stateT = 5; if (typeof g.begin === 'function') g.begin(); else g.input(1); });
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 30_000 }).toBe('play');
  t = await stillGoing(page, t, 3, 'durante la partita');
  // il rullo resta in ERG sui watt dell'allenamento (ultimo comando "potenza richiesta" = obiettivo del passo)
  const target = Number(await page.textContent('#wkTarget'));
  const lastErg = await page.evaluate(() => { const l = window.__fakeBle.state.controlLog.filter((c) => c[0] === 0x05).pop(); return l ? l[1] | (l[2] << 8) : null; });
  expect(lastErg, 'il rullo segue i watt dell\'allenamento anche nel gioco').toBe(target);

  await page.click('#closeGame'); // dal gioco all'elenco
  await expect(page.locator('#gameMenu')).toBeVisible();
  t = await stillGoing(page, t, 1, 'uscito dal gioco');
  await page.click('#closeGame'); // dall'elenco al cruscotto
  await expect(page.locator('#gamePanel')).toBeHidden();
  t = await stillGoing(page, t, 2, 'tornato al cruscotto');

  // un secondo gioco, poi di nuovo fuori
  await page.click('#rideGames'); await page.click('[data-game=mattoni]');
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
  await page.click('#closeGame'); await page.click('#closeGame');
  await stillGoing(page, t, 1, 'dopo il secondo gioco');
});

test('smettere di pedalare non mette in pausa un allenamento (senza allenamento la pausa automatica resta)', async ({ page }) => {
  await boot(page); await addTrainer(page);
  await startFirstWorkout(page);
  const t0 = await stillGoing(page, 0, 1, 'avviato');
  await page.evaluate(() => { window.__fakeBle.state.speed = 0; window.__fakeBle.state.cadence = 0; window.__fakeBle.setPower(0); });
  await page.waitForTimeout(8000); // la pausa automatica scatterebbe dopo 5 s
  await stillGoing(page, t0, 7, 'fermo sui pedali da 8 secondi');

  // fine allenamento scelta dalla persona: da qui la pausa automatica torna a valere
  await page.click('#wkStop'); await page.click('.dlg [data-ok]');
  await expect(page.locator('#workoutCard')).toBeHidden();
  await expect(page.locator('#startStop')).toHaveText('Riprendi', { timeout: 12_000 });
});

test('pagina in secondo piano (timer rallentati): il tempo dell\'allenamento segue l\'orologio vero', async ({ page }) => {
  await boot(page, { clock: true }); await addTrainer(page);
  await startFirstWorkout(page);
  await page.clock.runFor(3000);
  const t0 = await wkSeconds(page);
  await page.clock.fastForward(120_000); // due minuti in cui i timer scattano una volta sola, come con lo schermo spento
  await page.clock.runFor(2000);
  const t1 = await wkSeconds(page);
  expect(t1 - t0, 'due minuti veri = due minuti di allenamento').toBeGreaterThanOrEqual(120);
  expect(t1 - t0).toBeLessThanOrEqual(126);
  expect(await running(page)).toBe(true);
});

test('ricaricare la pagina a metà: l\'allenamento torna dal suo minuto e riprende con Riprendi', async ({ page }) => {
  await boot(page); await addTrainer(page);
  await startFirstWorkout(page);
  const name = await page.textContent('#wkName');
  await expect.poll(() => wkSeconds(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(11); // l'uscita si salva ogni 10 secondi e alla chiusura
  const before = await wkSeconds(page);
  await page.reload();
  await expect(page.locator('#workoutCard')).toBeVisible();
  await expect(page.locator('#wkName')).toHaveText(name);
  const restored = await wkSeconds(page);
  expect(restored, 'riparte da dove era, non da zero').toBeGreaterThanOrEqual(before - 1);
  await expect(page.locator('#startStop')).toHaveText('Riprendi'); // l'uscita ripristinata è in pausa, come sempre
  await addTrainer(page);
  await page.click('#startStop');
  await stillGoing(page, restored, 2, 'ripreso dopo il ricaricamento');
});

test('"Gioca" o "Avvia" sullo stesso allenamento già in corso non lo fa ripartire', async ({ page }) => {
  await boot(page); await addTrainer(page);
  await startFirstWorkout(page);
  const t0 = await stillGoing(page, 0, 3, 'avviato');
  await page.evaluate(() => document.getElementById('openWorkouts').click());
  await page.locator('#workoutList .wk-wrap').first().locator('[data-wk-play]').click();
  await expect(page.locator('.dlg')).toHaveCount(0); // nessuna domanda "interrompere?"
  await expect(page.locator('#gameMenu')).toBeVisible();
  await stillGoing(page, t0, 1, 'aperti i giochi dallo stesso allenamento');
  await page.click('#closeGame');
  await page.evaluate(() => document.getElementById('openWorkouts').click());
  await page.locator('#workoutList [data-wk]').first().click();
  await expect(page.locator('.dlg')).toHaveCount(0);
  await stillGoing(page, t0, 2, 'Avvia sullo stesso allenamento');
});
