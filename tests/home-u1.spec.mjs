// U1: home attorno all'ERG, cruscotto durante l'uscita, allenamento → gioco col solo tocco (niente Zwift Click).
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));

// seed: parte da dati puliti (utente nuovo: nessuna modalità salvata) salvo diversa scelta del test
async function open(page, { storage = {}, plan = false } = {}) {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(({ storage, plan }) => {
    try {
      if (!localStorage.getItem('__seeded')) {
        localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('mass', '80');
        localStorage.setItem('lang', 'it'); localStorage.setItem('gameQuality', 'low');
        for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
        if (plan) { const d = Math.round(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) / 864e5); localStorage.setItem('plan', JSON.stringify({ id: 'primipassi', start: d, done: {}, skipped: {}, moved: {} })); }
      }
    } catch { /* niente storage */ }
  }, { storage, plan });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
}
const connectTrainer = async (page) => {
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
};
// ultimo watt di ERG (op 0x05) ricevuto dal rullo finto
const lastErgW = (page) => page.evaluate(() => { const l = window.__fakeBle.state.controlLog.filter((c) => c[0] === 0x05).pop(); return l ? l[1] | (l[2] << 8) : null; });
const ops = (page) => page.evaluate(() => window.__fakeBle.state.controlLog.map((c) => c[0]));

test.afterEach(async ({ page }) => { expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]); });

test('utente nuovo: la modalità è ERG al 60% della FTP, le altre stanno nella sezione chiusa', async ({ page }) => {
  await open(page);
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'erg');
  await expect(page.locator('input[name=mode][value=erg]')).toBeChecked();
  await expect(page.locator('#controlValue')).toHaveText('120'); // 60% di 200 W
  await expect(page.locator('#moreModes')).not.toHaveAttribute('open', '');
  await expect(page.locator('#today #startStop')).toBeVisible();
  await expect(page.locator('#chooseWorkout')).toBeVisible();
  // la scelta di un'altra modalità si ricorda e la sezione resta aperta
  await page.click('#moreModes summary');
  await page.locator('label:has(input[name=mode][value=gears])').click();
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'gears');
  await expect(page.locator('#moreModes')).toHaveAttribute('open', '');
});

test('giro libero: − e + cambiano l\'obiettivo di 5 W e lo mandano al rullo', async ({ page }) => {
  await open(page);
  await connectTrainer(page);
  await expect(page.locator('#controlValue')).toHaveText('120');
  await page.click('#up'); await page.click('#up');
  await expect(page.locator('#controlValue')).toHaveText('130');
  await page.click('#down');
  await expect(page.locator('#controlValue')).toHaveText('125');
  await expect.poll(() => lastErgW(page)).toBe(125);
  // si ricorda per la prossima volta
  await page.reload();
  await expect(page.locator('#controlValue')).toHaveText('125');
});

test('cruscotto: durante l\'uscita restano potenza, obiettivo con − / +, e i quattro tasti', async ({ page }) => {
  await open(page);
  await connectTrainer(page);
  await page.click('#startStop');
  await expect(page.locator('body')).toHaveClass(/riding/);
  await expect(page.locator('#startStop')).toHaveText('Pausa');
  for (const id of ['#power', '#cadence', '#time', '#up', '#down', '#startStop', '#finishRide', '#rideGames', '#rideMode']) await expect(page.locator(id)).toBeVisible();
  for (const id of ['#today', '#quickPick', '#moreModes', '#deviceBar']) await expect(page.locator(id)).toBeHidden();
  await page.click('#up');
  await expect.poll(() => lastErgW(page)).toBe(125);
  // pausa e ripresa: il tasto cambia scritta
  await page.click('#startStop');
  await expect(page.locator('#startStop')).toHaveText('Riprendi');
  await page.click('#startStop');
  await expect(page.locator('#startStop')).toHaveText('Pausa');
  // il tasto "modalità" cambia modalità senza lasciare il cruscotto
  await page.click('#rideMode');
  await page.click('#modeList [data-pick=sim]');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'sim');
  await expect(page.locator('body')).toHaveClass(/riding/);
});

test('tasto Giochi nel cruscotto: apre l\'elenco e l\'uscita continua sotto', async ({ page }) => {
  await open(page);
  await connectTrainer(page);
  await page.click('#startStop');
  await page.click('#rideGames');
  await expect(page.locator('#gamePanel')).toBeVisible();
  await expect(page.locator('#gameMenu')).toBeVisible();
  await expect(page.locator('#gameStrip')).toBeHidden(); // niente allenamento: niente striscia
  await page.click('#closeGame');
  await expect(page.locator('#gamePanel')).toBeHidden();
  await expect(page.locator('#startStop')).toHaveText('Pausa');
  await expect(page.locator('#time')).not.toHaveText('0:00');
});

test('allenamento → gioco col solo tocco: "Gioca" parte l\'allenamento e apre i giochi', async ({ page }) => {
  await open(page);
  await connectTrainer(page);
  await page.click('#openWorkouts');
  const first = page.locator('#workoutList .wk-wrap').first();
  await expect(first.locator('[data-wk]')).toBeVisible(); // Avvia
  await first.locator('[data-wk-play]').click();          // Gioca
  await expect(page.locator('#workoutCard')).toBeVisible();
  await expect(page.locator('#workoutSheet')).toBeHidden();
  await expect(page.locator('#gamePanel')).toBeVisible();
  await expect(page.locator('#gameMenu')).toBeVisible();
  await expect(page.locator('#gameStrip')).toBeVisible();
  await expect(page.locator('#gsTail')).toContainText('W');
  await expect(page.locator('#startStop')).toHaveText('Pausa');
});

test('piano attivo: "Oggi" ha Avvia e Gioca; Gioca apre i giochi con l\'allenamento in corso', async ({ page }) => {
  await open(page, { plan: true });
  await expect(page.locator('#today')).toHaveClass(/plan-due/);
  await expect(page.locator('#planCard [data-pl-start]')).toBeVisible();
  await expect(page.locator('#freeRide')).toBeHidden();
  await page.locator('#planCard [data-pl-game]').click();
  await expect(page.locator('#workoutCard')).toBeVisible();
  await expect(page.locator('#gameStrip')).toBeVisible();
});

test('un gioco aperto sopra un allenamento non toglie il rullo all\'allenamento', async ({ page }) => {
  await open(page);
  await connectTrainer(page);
  await page.click('#openWorkouts');
  await page.locator('#workoutList .wk-wrap').first().locator('[data-wk-play]').click();
  await expect(page.locator('#gameMenu')).toBeVisible();
  const before = await ops(page);
  await page.click('[data-game=racer]');
  await expect(page.locator('#gameMenu')).toBeHidden();
  await page.waitForTimeout(2500);
  // il gioco chiede una pendenza: viene ignorata, il rullo resta in ERG sui watt dell'allenamento
  const info = await page.evaluate(() => {
    const g = window.__game; g.hooks.setGrade(8); g.hooks.setGrade(null);
    const w = g.hooks.workout();
    return { mode: document.body.dataset.mode, wk: w && { name: w.name, total: w.total, n: w.steps.length, first: w.steps[0], keys: Object.keys(w.steps[0]).sort() } };
  });
  await page.waitForTimeout(2500);
  expect(info.mode).toBe('erg');
  expect(info.wk.n).toBeGreaterThan(2);
  expect(info.wk.keys).toEqual(['dur', 'kind', 'pct', 't0', 'watts']);
  expect(info.wk.first.t0).toBe(0);
  const after = await ops(page);
  expect(after.slice(before.length)).not.toContain(0x11); // nessun comando di simulazione (pendenza) dopo l'avvio del gioco
  const w = await lastErgW(page);
  const shown = Number(await page.locator('#controlValue').textContent());
  expect(Math.abs(w - shown)).toBeLessThanOrEqual(5);
  await expect(page.locator('#gameStrip')).toBeVisible();
  // senza allenamento l'hook dice null
  await page.evaluate(() => document.querySelector('#wkStop').click());
  await page.click('.dlg [data-ok]');
  expect(await page.evaluate(() => window.__game.hooks.workout())).toBeNull();
});

test('Click: il primo tasto scelto dal menu è "Avvia" di Oggi (o "Avvia l\'allenamento" col piano)', async ({ page }) => {
  await open(page, { plan: true });
  await connectTrainer(page);
  await page.evaluate(async () => { window.__fakeBle.next = 'click'; return window.rfDevices.add(); });
  await expect(page.locator('#clickStatus')).toContainText('Zwift');
  await expect(page.locator('.cn-focus')).toBeVisible();
  await expect(page.locator('.cn-focus')).toHaveAttribute('data-pl-start', /.+/);
});

test('icona del Click: tondo con i tasti − e +', async ({ page }) => {
  await open(page);
  await expect(page.locator('#dvClick svg.dv-click')).toBeVisible();
  expect(await page.locator('#dvClick svg.dv-click path').count()).toBeGreaterThanOrEqual(3);
});
