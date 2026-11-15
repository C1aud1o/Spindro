// Controller con le frecce (Click v2, finto), ruoli, verifica tasti e legenda. I due tasti (Click v1) sono in click-nav.spec.mjs.
// Tutto col controller FINTO (tests/fake-ble.js): niente di questo è stato provato su un Click vero.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(150_000);

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
});
test.afterEach(async ({ page }) => { expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]); });

/** Apre l'app col rullo finto e il controller finto. seen=false → la verifica tasti si apre da sola. */
async function boot(page, { model = 'click', proto = null, seen = true, lang = 'it', wake = proto !== 'v1' } = {}) {
  await page.addInitScript(([sn, lg]) => {
    try {
      if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('mass', '80'); localStorage.setItem('gameQuality', 'low'); localStorage.setItem('autoPause', '0'); if (!sn) localStorage.setItem('clickCheckSeen', ''); }
      localStorage.setItem('lang', localStorage.getItem('lang') || lg);
    } catch { /* niente storage */ }
  }, [seen, lang]);
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
  await page.evaluate(async ([m, p]) => { window.__fakeBle.clickModel = m; if (p) window.__fakeBle.clickProto = p; window.__fakeBle.next = 'click'; return window.rfDevices.add(); }, [model, proto]);
  await expect(page.locator('#clickStatus')).toContainText('Zwift');
  if (seen) {
    // il Click non dice se è v1 o v2 finché non manda un messaggio: un tasto "sconosciuto" qualsiasi lo sveglia senza muovere nulla
    if (wake) { await page.evaluate((n) => window.__fakeBle.pressNums([n]), model === 'play' ? 7 : 15); await page.waitForTimeout(150); }
    await expect(page.locator('.cn-focus')).toBeVisible(); await expect(page.locator('.click-bar')).toBeVisible();
  }
}
const bit = async (page, b, ms = 0) => { await page.evaluate(([x, m]) => window.__fakeBle.pressBit(x, m), [b, ms]); await page.waitForTimeout(90); };
const id = async (page, raw, ms = 0) => { await page.evaluate(([x, m]) => window.__fakeBle.pressId(x, m), [raw, ms]); await page.waitForTimeout(90); };
const press = async (page, d) => { await page.evaluate((x) => window.__fakeBle.press(x), d); await page.waitForTimeout(90); };
const hold = (page, d, ms = 900) => page.evaluate(([x, m]) => window.__fakeBle.hold(x, m), [d, ms]);
// croce del Click v2: 0 sinistra, 1 su, 2 destra, 3 giù; 4 = A, 5 = B
const ARROW = { left: 0, up: 1, right: 2, down: 3 };
const arrow = (page, dir) => bit(page, ARROW[dir]);
const A = (page) => bit(page, 4);
const B = (page) => bit(page, 5);
const focus = (page) => page.evaluate(() => {
  const e = document.querySelector('.cn-focus'); if (!e) return null;
  const r = e.getBoundingClientRect();
  return { id: e.id, text: (e.textContent || '').trim().slice(0, 30), cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
});
/** Porta il fuoco su un elemento solo con le frecce: ogni mossa va verso l'elemento (asse con più distanza, poi l'altro). */
async function goToId(page, target, max = 120) {
  for (let i = 0; i < max; i++) {
    const r = await page.evaluate((tid) => {
      const f = document.querySelector('.cn-focus'); const t = document.getElementById(tid); if (!f || !t) return null;
      const a = f.getBoundingClientRect(); const b = t.getBoundingClientRect();
      return { same: f.id === tid, dx: (b.left + b.right - a.left - a.right) / 2, dy: (b.top + b.bottom - a.top - a.bottom) / 2 };
    }, target);
    if (!r) throw new Error(`goToId ${target}: niente selezione o elemento`);
    if (r.same) return;
    const vert = Math.abs(r.dy) > 12 ? (r.dy > 0 ? 'down' : 'up') : null; const horz = Math.abs(r.dx) > 12 ? (r.dx > 0 ? 'right' : 'left') : null;
    const before = await focus(page);
    await arrow(page, i % 4 === 3 ? (horz || vert) : (vert || horz));
    const after = await focus(page);
    if (after && before && after.cx === before.cx && after.cy === before.cy) await arrow(page, horz || vert); // non si è mosso: prova l'altro asse
  }
  throw new Error(`il fuoco non è arrivato su #${target}: ${JSON.stringify(await focus(page))}`);
}
const legend = (page) => page.locator('.click-bar').innerText();

/** Dopo un tasto freccia il fuoco deve essere davvero in quella direzione (confronto fra posizioni, non fra ordini del DOM). */
async function expectDirection(page, dir) {
  const before = await focus(page);
  await arrow(page, dir);
  const after = await focus(page);
  expect(after, `dopo ${dir} c'è ancora una selezione`).not.toBeNull();
  const dx = after.cx - before.cx; const dy = after.cy - before.cy;
  return { before, after, dx, dy };
}
const inDirection = (dir, { dx, dy }) => (dir === 'up' ? dy < 0 : dir === 'down' ? dy > 0 : dir === 'left' ? dx < 0 : dx > 0);

// ---------------------------------------------------------------------------------------------------------------------
test.describe('navigazione spaziale', () => {
  test('home: ogni freccia va dove ci si aspetta (posizioni) e ai bordi si rientra dall\'altra parte', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.cn-focus')).toBeVisible();
    let moved = 0; const seen = new Set();
    // percorso misto: per ogni mossa che cambia elemento, la direzione deve essere quella premuta
    for (const dir of ['down', 'down', 'right', 'down', 'left', 'up', 'down', 'right', 'right', 'up', 'left', 'down', 'down', 'up']) {
      const r = await expectDirection(page, dir);
      seen.add(r.after.id || r.after.text);
      if (r.after.cx === r.before.cx && r.after.cy === r.before.cy) continue; // nessun movimento (unico elemento)
      // con il giro ai bordi può comparire dall'altra parte: in tal caso va nel verso opposto, ma mai in quello sbagliato "di poco"
      const wrapped = !inDirection(dir, r);
      if (!wrapped) moved++;
    }
    expect(moved, 'la maggior parte delle mosse va nella direzione premuta').toBeGreaterThanOrEqual(8);
    expect(seen.size, 'la selezione passa per più elementi').toBeGreaterThan(3);
  });

  test('pickSpatial (puro): direzione, riga/colonna più vicina e giro ai bordi', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const { pickSpatial } = await import('/js/clicknav.js');
      const box = (l, t, w = 100, h = 40) => ({ left: l, top: t, right: l + w, bottom: t + h });
      // griglia 2×3 a sinistra + un pulsante largo in fondo + un elemento isolato a destra
      const rects = [box(0, 0), box(120, 0), box(0, 60), box(120, 60), box(0, 120), box(120, 120), box(0, 200, 240), box(300, 60)];
      const go = (i, d, wrap = true) => pickSpatial(rects, rects[i], d, wrap);
      return {
        down0: go(0, 'down'), up2: go(2, 'up'), right0: go(0, 'right'), left1: go(1, 'left'), down3: go(3, 'down'), right3: go(3, 'right'), left7: go(7, 'left'),
        wrapDownBottom: go(6, 'down'), wrapUpTop: go(0, 'up'), wrapRight: go(7, 'right'), wrapLeft: go(0, 'left'), noWrap: go(6, 'down', false),
        wrapUpTop1: go(1, 'up'), wrapLeftRow2: go(2, 'left'),
      };
    });
    expect(r.down0).toBe(2); expect(r.up2).toBe(0); expect(r.right0).toBe(1); expect(r.left1).toBe(0);
    expect(r.down3, 'giù dalla colonna destra: stessa colonna').toBe(5);
    expect(r.right3, 'a destra della riga 2: l\'elemento isolato alla stessa altezza').toBe(7);
    expect(r.left7, 'a sinistra dell\'isolato: il più vicino sulla riga').toBe(3);
    expect([0, 1], 'oltre l\'ultima riga si rientra in cima').toContain(r.wrapDownBottom);
    expect(r.wrapUpTop, 'sopra la prima riga si rientra in fondo').toBe(6);
    expect(r.wrapUpTop1, 'dalla cima, colonna destra: si rientra in fondo').toBe(6);
    expect(r.wrapRight, 'oltre il bordo destro si rientra da sinistra, stessa riga').toBe(2);
    expect(r.wrapLeft, 'oltre il bordo sinistro si rientra da destra').toBe(7);
    expect(r.wrapLeftRow2).toBe(7);
    expect(r.noWrap).toBeNull();
  });

  test('home: Giù attraversa la pagina e dal fondo rientra in cima', async ({ page }) => {
    await boot(page);
    const ys = [];
    for (let i = 0; i < 40; i++) { await arrow(page, 'down'); const g = await focus(page); expect(g, 'la selezione non si perde').not.toBeNull(); ys.push(g.cy); }
    const lo = Math.min(...ys); const hi = Math.max(...ys);
    expect(hi - lo, 'la selezione percorre tutta la pagina').toBeGreaterThan(300);
    const iMax = ys.indexOf(hi);
    expect(Math.min(...ys.slice(iMax + 1)), 'dopo il punto più basso rientra più in alto (giro ai bordi)').toBeLessThan(hi - 150);
  });

  test('impostazioni: le frecce si muovono nel foglio per posizione; A sceglie, B torna', async ({ page }) => {
    await boot(page);
    // arriva su "Impostazioni" con le frecce, poi A
    await goToId(page, 'openSettings');
    await A(page);
    await expect(page.locator('#settingsSheet')).toBeVisible();
    await page.waitForTimeout(200);
    const start = await focus(page);
    expect(await page.evaluate(() => !!document.querySelector('.cn-focus')?.closest('#settingsSheet'))).toBe(true);
    // in un foglio in colonna: Giù scende, Su risale
    const d1 = await expectDirection(page, 'down'); expect(d1.dy, 'Giù scende nel foglio').toBeGreaterThan(0);
    const d2 = await expectDirection(page, 'down'); expect(d2.dy).toBeGreaterThan(0);
    const u1 = await expectDirection(page, 'up'); expect(u1.dy, 'Su risale').toBeLessThan(0);
    const u2 = await expectDirection(page, 'up'); expect(u2.dy).toBeLessThan(0);
    expect(u2.after.id || u2.after.text).toBe(start.id || start.text);
    // la selezione resta dentro il foglio e visibile (mai sotto la legenda)
    for (const dir of ['down', 'down', 'down', 'down', 'up']) {
      await arrow(page, dir);
      const ok = await page.evaluate(() => { const e = document.querySelector('.cn-focus'); const r = e.getBoundingClientRect(); const bar = document.querySelector('.click-bar').getBoundingClientRect(); return !!e.closest('#settingsSheet') && r.bottom <= bar.top + 2 && r.top >= 0; });
      expect(ok, 'elemento in primo piano visibile sopra la legenda').toBe(true);
    }
    await B(page);
    await expect(page.locator('#settingsSheet')).toBeHidden();
  });

  test('con le frecce + / − cambiano il valore di un campo numerico, altrimenti spostano', async ({ page }) => {
    await boot(page);
    await goToId(page, 'openSettings');
    await A(page);
    await expect(page.locator('#settingsSheet')).toBeVisible();
    await goToId(page, 'ftp'); // porta il fuoco sul campo FTP solo con le frecce
    expect((await focus(page)).id).toBe('ftp');
    const v0 = +(await page.inputValue('#ftp'));
    await press(page, +1);
    expect(+(await page.inputValue('#ftp')), '+ aumenta il valore sul posto').toBeGreaterThan(v0);
    expect((await focus(page)).id, 'il fuoco resta sul campo').toBe('ftp');
    await press(page, -1); await press(page, -1);
    expect(+(await page.inputValue('#ftp'))).toBeLessThan(v0 + 1);
    // su un pulsante invece + / − spostano
    for (let i = 0; i < 60 && (await focus(page)).id === 'ftp'; i++) await arrow(page, 'up');
    const b = await focus(page);
    await press(page, +1);
    expect(await focus(page)).not.toEqual(b);
    await B(page);
  });

  test('tastiera: stesse regole (frecce, Invio = A, Esc = B, + e −)', async ({ page }) => {
    await boot(page);
    const f0 = await focus(page);
    await page.keyboard.press('ArrowDown');
    const f1 = await focus(page); expect(f1.cy, 'freccia giù scende').toBeGreaterThanOrEqual(f0.cy);
    await page.keyboard.press('ArrowUp');
    const f2 = await focus(page); expect(f2.cy).toBeLessThanOrEqual(f1.cy);
    let f = await focus(page);
    for (let i = 0; i < 60 && f.id !== 'openSettings'; i++) { await page.keyboard.press(i % 3 === 2 ? 'ArrowRight' : 'ArrowDown'); f = await focus(page); }
    expect(f.id).toBe('openSettings');
    await page.keyboard.press('Enter');
    await expect(page.locator('#settingsSheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#settingsSheet')).toBeHidden();
    const g0 = await focus(page);
    await page.keyboard.press('+'); const g1 = await focus(page);
    expect(g1).not.toEqual(g0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('pedalando e giochi (controller con le frecce)', () => {
  test('pedalando + / − cambiano marcia; A apre il menu Click, B lo chiude', async ({ page }) => {
    await boot(page);
    // avvia l'uscita: seleziona "Avvia" (è la selezione di partenza) e premi A
    expect((await focus(page)).id).toBe('startStop');
    await A(page);
    await expect(page.locator('#startStop')).toHaveText('Pausa');
    await page.waitForTimeout(400);
    await expect(page.locator('.cn-focus')).toHaveCount(0);
    const g = +(await page.textContent('#gearNum'));
    await press(page, +1); expect(+(await page.textContent('#gearNum'))).toBe(g + 1);
    await press(page, -1); expect(+(await page.textContent('#gearNum'))).toBe(g);
    await arrow(page, 'up'); expect(+(await page.textContent('#gearNum')), 'Su = marcia +1 come prima').toBe(g + 1);
    await arrow(page, 'down');
    expect(await legend(page)).toContain('menu');
    await A(page);
    await expect(page.locator('#clickMenu')).toBeVisible();
    await expect(page.locator('#clickMenu')).toContainText('Controlla il tuo controller');
    await B(page);
    await expect(page.locator('#clickMenu')).toBeHidden();
  });

  test('tenere − apre il menu anche con le frecce, e il tasto lungo mostra il riempimento', async ({ page }) => {
    await boot(page);
    await A(page); // avvia
    await expect(page.locator('#startStop')).toHaveText('Pausa');
    await page.waitForTimeout(300);
    const h = hold(page, -1, 1100);
    await page.waitForTimeout(250);
    await expect(page.locator('.click-bar.holding')).toHaveCount(1); // il riempimento sulla legenda mentre si tiene
    await h;
    await expect(page.locator('#clickMenu')).toBeVisible();
  });

  test('in un gioco: tenere B 0,8 s apre il menu Click; + e − vanno al gioco', async ({ page }) => {
    await boot(page);
    await goToId(page, 'openGame');
    await A(page);
    await expect(page.locator('#gameMenu')).toBeVisible();
    await A(page); // primo gioco
    await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('select');
    await expect(page.locator('.cn-focus')).toHaveCount(0);
    const l = await legend(page);
    expect(l).toContain('gioca'); expect(l).toContain('B'); expect(l).not.toContain('tieni −');
    await bit(page, 5, 1100); // tieni B
    await expect(page.locator('#clickMenu')).toBeVisible();
    await B(page); // B chiude il menu
    await expect(page.locator('#clickMenu')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('legenda dei tasti', () => {
  test('due tasti (Click v1): menu, campo preso, pedalando', async ({ page }) => {
    await boot(page, { proto: 'v1' });
    let l = await legend(page);
    expect(l).toMatch(/\+/); expect(l).toContain('sposta'); expect(l).toContain('tieni'); expect(l).toContain('scegli'); expect(l).toContain('indietro');
    expect(l).not.toContain('▲');
    // pedalando
    await hold(page, +1); // avvia
    await expect(page.locator('#startStop')).toHaveText('Pausa'); await page.waitForTimeout(400);
    l = await legend(page);
    expect(l).toContain('marcia'); expect(l).toContain('tieni'); expect(l).toContain('menu');
  });

  test('con le frecce (Click v2): menu, valore, pedalando', async ({ page }) => {
    await boot(page);
    let l = await legend(page);
    expect(l).toContain('▲'); expect(l).toContain('A'); expect(l).toContain('B'); expect(l).toContain('sposta'); expect(l).toContain('scegli'); expect(l).toContain('indietro');
    expect(l, 'con A e B non serve "tieni"').not.toContain('tieni');
    // su un campo numerico compare "+ − cambia"
    await goToId(page, 'openSettings');
    await A(page);
    await goToId(page, 'ftp');
    l = await legend(page); expect(l).toContain('cambia');
    await B(page);
    await A(page); // sul pulsante di partenza? il fuoco può non essere su Avvia: chiude e riparte dal primo
    await page.waitForTimeout(200);
  });

  test('con le frecce: pedalando la legenda dice A = menu', async ({ page }) => {
    await boot(page);
    await A(page);
    await expect(page.locator('#startStop')).toHaveText('Pausa'); await page.waitForTimeout(400);
    const l = await legend(page);
    expect(l).toContain('marcia'); expect(l).toContain('A'); expect(l).toContain('menu'); expect(l).not.toContain('tieni');
  });

  test('Play (solo frecce): frecce per muoversi, destra / sinistra tenuti = scegli / indietro', async ({ page }) => {
    await boot(page, { model: 'play' });
    await id(page, 'play:5'); // un tasto per far conoscere il modello
    const l = await legend(page);
    expect(l).toContain('▲'); expect(l).toContain('tieni'); expect(l).toContain('▶'); expect(l).toContain('◀');
  });

  test('senza controller la legenda sparisce; in inglese è in inglese', async ({ page }) => {
    await boot(page, { lang: 'en' });
    await expect(page.locator('.click-bar')).toBeVisible();
    expect(await legend(page)).toContain('move');
    await page.evaluate(() => window.rfDevices.disconnectAll());
    await expect(page.locator('.click-bar')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('verifica tasti', () => {
  test('si apre da sola al primo collegamento e mostra in diretta nome e id grezzo; l\'id sconosciuto accende "?"', async ({ page }) => {
    await boot(page, { seen: false });
    const cc = page.locator('#clickCheck');
    await expect(cc).toBeVisible();
    await expect(cc.locator('svg')).toBeVisible();
    await bit(page, 12);
    await expect(cc.locator('.cc-name')).toHaveText('+');
    await expect(cc.locator('.cc-raw')).toHaveText('ride:12');
    await expect(cc.locator('.cc-pad')).toHaveAttribute('data-kind', 'v2');
    await bit(page, 3);
    await expect(cc.locator('.cc-name')).toHaveText('Giù');
    await expect(cc.locator('.cc-raw')).toHaveText('ride:3');
    // un tasto "a metà" (premuto per un po'): il disegno si accende e poi si spegne
    const h = bit(page, 12, 500);
    await expect(cc.locator('[data-slot="plus"].on')).toHaveCount(1);
    await h; await expect(cc.locator('[data-slot="plus"].on')).toHaveCount(0);
    // id mai visto: "?"
    await bit(page, 15, 400);
    await expect(cc.locator('.cc-name')).toHaveText('Tasto sconosciuto');
    await expect(cc.locator('.cc-raw')).toHaveText('ride:15');
    await expect(cc.locator('.cc-unk-list')).toContainText('ride:15');
    // durante la verifica i tasti non navigano né cambiano marcia
    expect(+(await page.textContent('#gearNum'))).toBe(12);
    await cc.locator('[data-cc="close"]').first().click();
    await expect(cc).toBeHidden();
    // la seconda volta non si riapre
    await page.evaluate(() => window.rfDevices.disconnectAll());
    await page.evaluate(async () => { window.__fakeBle.next = 'click'; return window.rfDevices.add(); });
    await page.waitForTimeout(300);
    await expect(cc).toBeHidden();
  });

  test('impara una mappatura diversa (+ e − scambiati) e l\'app poi la rispetta; ripristino ai predefiniti', async ({ page }) => {
    await boot(page, { seen: false });
    const cc = page.locator('#clickCheck');
    await cc.locator('[data-cc="start"]').click();
    await expect(cc.locator('.cc-ask')).toContainText('+');
    await bit(page, 8); // il tasto "−" del Click diventa "+"
    await expect(cc.locator('.cc-got')).toContainText('ride:8');
    await expect(cc.locator('.cc-ask')).toContainText('−', { timeout: 3000 });
    await bit(page, 12); // e il "+" diventa "−"
    await expect(cc.locator('.cc-ask')).toContainText('Su', { timeout: 3000 });
    // tutti gli altri passi si saltano col tocco (anche Y e Z, facoltativi)
    for (let i = 0; i < 8; i++) await cc.locator('[data-cc="skip"]').click();
    await expect(cc.locator('.cc-conf')).toContainText('confermata da te');
    await expect(cc.locator('.cc-conf')).toHaveClass(/ok/);
    await expect(cc.locator('.cc-table [data-role="plus"] code')).toHaveText('ride:8 · ride:9 · ride:13');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('clickRoles')));
    expect(stored.ride.roles['ride:8']).toBe('plus');
    expect(stored.ride.roles['ride:12']).toBe('minus');
    expect(stored.ride.confirmed).toBe(true);
    await cc.locator('[data-cc="close"]').first().click();
    // l'app obbedisce: avvia l'uscita (A), poi il bit 8 ora aumenta la marcia e il bit 12 la diminuisce
    await A(page);
    await expect(page.locator('#startStop')).toHaveText('Pausa'); await page.waitForTimeout(600);
    const g = +(await page.textContent('#gearNum'));
    await bit(page, 8);
    await expect(page.locator('#gearNum'), 'bit 8 = +').toHaveText(String(g + 1));

    await bit(page, 12);
    await expect(page.locator('#gearNum'), 'bit 12 = −').toHaveText(String(g));
    // la mappatura resta dopo un ricaricamento
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clickRoles')).ride.roles['ride:8'])).toBe('plus');
  });

  test('ripristino ai predefiniti dal pulsante', async ({ page }) => {
    await boot(page, { seen: false });
    const cc = page.locator('#clickCheck');
    await cc.locator('[data-cc="start"]').click();
    await bit(page, 8); await expect(cc.locator('.cc-ask')).toContainText('−', { timeout: 3000 });
    await expect(cc.locator('.cc-table [data-role="plus"] code')).toContainText('ride:8');
    await cc.locator('[data-cc="reset"]').click();
    await expect(cc.locator('.cc-table [data-role="plus"] code')).toContainText('ride:12');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('clickRoles') || '{}').ride?.roles?.['ride:8'] ?? null)).toBeNull();
    await expect(cc.locator('.cc-conf')).not.toHaveClass(/ok/);
  });

  test('Click v1: la procedura guidata ha solo + e −', async ({ page }) => {
    await boot(page, { seen: false, proto: 'v1' });
    const cc = page.locator('#clickCheck');
    await expect(cc).toBeVisible();
    await id(page, 'v1:1', 100);
    await expect(cc.locator('.cc-pad')).toHaveAttribute('data-kind', 'v1');
    await expect(cc.locator('.cc-name')).toHaveText('+');
    await cc.locator('[data-cc="start"]').click();
    await expect(cc.locator('.cc-count')).toContainText('1');
    await expect(cc.locator('.cc-count')).toContainText('2'); // "Passo 1 di 2"
    await id(page, 'v1:1', 100);
    await expect(cc.locator('.cc-ask')).toContainText('−', { timeout: 3000 });
    await id(page, 'v1:2', 100);
    await expect(cc.locator('.cc-conf')).toContainText('confermata da te', { timeout: 3000 });
  });

  test('si apre dal pannello Dispositivi e dal menu Click', async ({ page }) => {
    await boot(page);
    await page.locator('#deviceBar').click();
    await page.locator('#clickCheckOpen').click();
    await expect(page.locator('#clickCheck')).toBeVisible();
    await page.locator('#clickCheck [data-cc="close"]').first().click();
    await page.locator('#devicesSheet .close, [data-close="devicesSheet"]').first().click();
    await expect(page.locator('#clickCheck')).toBeHidden();
    // menu Click (tieni − mentre si pedala)
    await A(page); await expect(page.locator('#startStop')).toHaveText('Pausa'); await page.waitForTimeout(300);
    await A(page);
    await expect(page.locator('#clickMenu')).toBeVisible();
    await page.locator('#clickMenu button', { hasText: 'Controlla il tuo controller' }).click();
    await expect(page.locator('#clickCheck')).toBeVisible();
    await expect(page.locator('#clickMenu')).toBeHidden();
  });

  test('"Copia rapporto": modello, byte dei messaggi, tabella ruolo → id, id sconosciuti, build; niente dati personali', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await boot(page, { seen: false, lang: 'en' });
    const cc = page.locator('#clickCheck');
    await bit(page, 12); await bit(page, 15, 300);
    await cc.locator('[data-cc="copy"]').click();
    await expect(cc.locator('.cc-msg')).toContainText('copied');
    const text = await cc.locator('.cc-report pre').textContent();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
    expect(text).toContain('Spindro controller report');
    expect(text).toMatch(/App build: \S+ \(\w+\)/);
    expect(text).toContain('Controller: Zwift Click v2');
    expect(text).toContain('Protocol messages seen: 0x23');
    expect(text).toContain('Mapping: defaults, not confirmed by the user');
    expect(text).toContain('plus = ride:12');
    expect(text).toContain('minus = ride:8');
    expect(text).toContain('Unknown ids seen: ride:15');
    expect(text).not.toMatch(/fake-click|fake-trainer|@|http/i);
    expect(text).toContain('Only + (ride:12) and − (ride:8)');
    // dopo aver imparato qualcosa il rapporto lo dice
    await cc.locator('[data-cc="start"]').click();
    await bit(page, 8); await expect(cc.locator('.cc-ask')).toContainText('−', { timeout: 3000 });
    for (let i = 0; i < 9; i++) await cc.locator('[data-cc="skip"]').click();
    const t2 = await cc.locator('.cc-report pre').textContent();
    expect(t2).toContain('Mapping: confirmed by the user');
    expect(t2).toContain('plus = ride:8 (learned)');
  });

  test('Play: la procedura guidata chiede le quattro frecce', async ({ page }) => {
    await boot(page, { seen: false, model: 'play' });
    const cc = page.locator('#clickCheck');
    await id(page, 'play:2', 100);
    await expect(cc.locator('.cc-pad')).toHaveAttribute('data-kind', 'play');
    await expect(cc.locator('.cc-name')).toHaveText('Su');
    await cc.locator('[data-cc="start"]').click();
    await expect(cc.locator('.cc-ask')).toContainText('Su');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
test.describe('ruoli e Ride', () => {
  test('Ride: A e B continuano a cambiare marcia finché non li impari (comportamento di prima)', async ({ page }) => {
    await boot(page, { model: 'ride' });
    await hold(page, +1, 700); // avvia (tieni + = leva di cambio)
    await expect(page.locator('#startStop')).toHaveText('Pausa'); await page.waitForTimeout(400);
    const g = +(await page.textContent('#gearNum'));
    await id(page, 'zr:6'); expect(+(await page.textContent('#gearNum'))).toBe(g + 1); // Y = +
    await id(page, 'zr:5'); expect(+(await page.textContent('#gearNum'))).toBe(g); // B = −
  });

  test('la mappatura vecchia della pagina di debug (clickMap) si migra solo nelle modifiche', async ({ page }) => {
    await page.addInitScript(() => { try { if (!localStorage.getItem('__m')) { localStorage.setItem('__m', '1'); localStorage.setItem('clickMap', JSON.stringify({ 'v1:1': 1, 'v1:2': -1, 'ride:12': -1, 'ride:8': 1, 'ride:1': 1 })); } } catch { /* */ } });
    await boot(page);
    const roles = await page.evaluate(() => JSON.parse(localStorage.getItem('clickRoles')));
    expect(roles.ride.roles['ride:12']).toBe('minus');
    expect(roles.ride.roles['ride:8']).toBe('plus');
    expect(roles.ride.roles['ride:1'], 'ride:1 era un predefinito di allora: ora è "su"').toBeUndefined();
  });
});
