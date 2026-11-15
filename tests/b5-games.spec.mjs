// Correzioni B5: L'Orda (portali per tutta la partita) e Gruppetto (nessuna sconfitta a 5 senza colpa).
// I giochi si fanno avanzare a mano, a passi da 1/30 s, con un bot: così i test sono rapidi e ripetibili.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FAKE_BLE = fileURLToPath(new URL('./fake-ble.js', import.meta.url));
test.setTimeout(150_000);

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); } localStorage.setItem('lang', 'it'); } catch { /* niente storage */ }
    // caso fisso: stessi numeri a ogni prova
    let s = 12345; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  });
  await page.addInitScript({ path: FAKE_BLE });
  await page.goto('/index.html');
  await page.evaluate(async () => { while (!window.rfDevices) await new Promise((r) => setTimeout(r, 50)); return window.rfDevices.add(); });
  await expect(page.locator('#trainerStatus')).toContainText('FTMS');
});

test.afterEach(async ({ page }) => {
  expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]);
});

async function openGame(page, kind) {
  await page.click('#openGame');
  await page.click(`[data-game=${kind}]`);
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
}

test("L'Orda: portali di tipi diversi per tutta la partita (bot a 200 W, 5 minuti)", async ({ page }) => {
  await openGame(page, 'horde');
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; // il ciclo del gioco si ferma: si avanza a mano
    g.reset(); g.begin();
    g.hooks = { ...g.hooks, connected: () => true, stats: () => ({ power: 200, cadence: 85 }), speedKmh: () => 30, setGrade() {} };
    const spawned = []; let tt = 0;
    const orig = g.spawnGates.bind(g);
    g.spawnGates = (z) => { const n = g.gates.length; orig(z); spawned.push({ t: tt, defs: g.gates.slice(n).map((x) => ({ text: x.def.text, good: x.def.good })) }); };
    let taken = 0; let dieAt = null;
    for (let i = 0; i < 300 * 30; i++) {
      tt += 1 / 30; g.hp = g.maxHp; // l'obiettivo qui è la comparsa dei portali, non la sopravvivenza
      const good = g.gates.filter((x) => !x.used && x.def.good && x.z - g.z > -1 && x.z - g.z < 45).sort((a, b) => a.z - b.z)[0];
      if (good) g.tx = good.x;
      const before = g.gates.filter((x) => !x.used);
      g.update(1 / 30);
      for (const x of before) if (x.used && !x.group.visible) taken++;
      if (g.state === 'over') { dieAt = tt; break; }
    }
    return { spawned, taken, wave: g.wave, dieAt };
  });
  const gaps = r.spawned.slice(1).map((s, i) => s.t - r.spawned[i].t);
  expect(r.spawned.length, 'coppie di portali in 5 minuti').toBeGreaterThanOrEqual(12);
  expect(Math.max(...gaps), 'pausa più lunga fra due coppie (s)').toBeLessThanOrEqual(25);
  expect(Math.min(...gaps), 'pausa più corta (s)').toBeGreaterThanOrEqual(15);
  const types = new Set(r.spawned.flatMap((s) => s.defs.map((d) => d.text)));
  expect(types.size, 'tipi diversi di portale').toBeGreaterThanOrEqual(6);
  expect(r.spawned.some((s) => s.defs.some((d) => !d.good)), 'ci sono anche portali rossi').toBe(true);
  expect(r.spawned.every((s) => s.defs.some((d) => d.good)), 'ogni coppia ha almeno un portale blu').toBe(true);
  // dopo il primo minuto compaiono ancora portali (era il difetto: solo i primi due)
  expect(r.spawned.filter((s) => s.t > 200).length).toBeGreaterThanOrEqual(4);
  expect(r.taken).toBeGreaterThanOrEqual(10);
  expect(r.wave, 'ondata raggiunta').toBeGreaterThanOrEqual(8);
});

test("L'Orda: il bot a 200 W regge almeno 90 s e non per sempre", async ({ page }) => {
  await openGame(page, 'horde');
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; g.reset(); g.begin();
    g.hooks = { ...g.hooks, connected: () => true, stats: () => ({ power: 200, cadence: 85 }), speedKmh: () => 30, setGrade() {} };
    let tt = 0;
    for (let i = 0; i < 900 * 30 && g.state === 'play'; i++) {
      tt += 1 / 30;
      const good = g.gates.filter((x) => !x.used && x.def.good && x.z - g.z > -1 && x.z - g.z < 45).sort((a, b) => a.z - b.z)[0];
      if (good) g.tx = good.x;
      g.update(1 / 30);
    }
    return { tt, wave: g.wave, over: g.state === 'over' };
  });
  expect(r.tt).toBeGreaterThan(90);
  expect(r.over, 'la partita ha una fine entro 15 minuti').toBe(true);
});

test('Gruppetto: 10 ciclisti raccolti in linea retta e con curve dolci, senza perdere', async ({ page }) => {
  await openGame(page, 'gruppetto');
  const r = await page.evaluate(() => {
    const g = window.__game; g.active = false; // si avanza a mano
    g.reset?.(); g.begin();
    g.kmh = 28; g.sprinting = false; g.held = 0;
    const log = [];
    for (let i = 0; i < 60 * 30 && g.state === 'play' && g.train.length < 10; i++) {
      // se non c'è nessun ciclista da prendere vicino, ne mette uno 4 m davanti, nella direzione di marcia
      if (!g.strays.some((s) => Math.hypot(s.x - g.x, s.z - g.z) < 6)) {
        const x = g.x + Math.sin(g.h) * 4; const z = g.z + Math.cos(g.h) * 4;
        const keep = g.strays.length; g.addStray(); const s = g.strays[keep];
        s.x = x; s.z = z; s.cy.root.position.set(x, 0, z); s.flag.position.set(x, 0, z);
      }
      // curve dolci: zig-zag lento; vicino ai bordi torna verso il centro
      const edge = g.half - 9;
      if (Math.abs(g.x) > edge || Math.abs(g.z) > edge) g.hT = Math.atan2(-g.x, -g.z);
      else g.hT = 0.5 * Math.sin(i / 90);
      g.step(1 / 30);
      if (i % 30 === 0) log.push(g.train.length);
    }
    return { state: g.state, n: g.train.length, why: g.why };
  });
  expect(r.state, `perso: ${r.why}`).toBe('play');
  expect(r.n).toBe(10);
});
