// Horde Run, regole delle tre corsie (docs/games/DESIGN-RULES.md, riga Horde Run): + / − cambiano corsia, un nemico che arriva alla linea
// costa un cuore, si spara solo nella propria corsia, i portali si prendono solo nella loro corsia, l'arma sale con gli sforzi riusciti,
// niente gemme né XP. Il gioco avanza a mano (1/30 s) e la scena si prepara a mano: i nemici si mettono dove serve ai test.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test.setTimeout(120_000);
const SRC = (f) => readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8');

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('analytics', '0'); localStorage.setItem('ftp', '200'); localStorage.setItem('gameQuality', 'low'); localStorage.setItem('lang', 'en'); } catch { /* niente storage */ } window.__spindroSeed = 3; });
  await page.goto('/index.html?game=horde&demo=1');
  await expect.poll(() => page.evaluate(() => window.__game?.state), { timeout: 120_000 }).toBe('menu');
  // partita pulita, ferma: niente nemici, niente portali né casse, il direttore non fa nascere nessuno
  await page.evaluate(() => {
    const g = window.__game; g.active = false; g.durIdx = 0; g.lvlIdx = 1;
    g.hooks = { ...g.hooks, connected: () => true, ftp: () => 200, stats: () => ({ power: g.tgtW || 120, cadence: 85 }), speedKmh: () => 30, setGrade() {}, setTarget: (w) => w };
    g.reset(); g.begin();
    g.enemies.forEach((e) => { e.dead = true; e.deadT = 9; }); g.enemies = [];
    g.nextGate = 1e9; g.nextPick = 1e9; g.lastEnter = 1e9; g.nextSpawn = null;
    window.__run = (sec) => { for (let i = 0; i < Math.round(sec * 30); i++) g.update(1 / 30); };
    window.__spawn = (type, lane, d, hp) => g.spawnEnemy(type, lane, g.z + d, hp);
  });
});
test.afterEach(async ({ page }) => { expect(page.errors, 'errori JavaScript non gestiti nella pagina').toEqual([]); });

test('Horde Run: + / − spostano di una corsia a ogni tocco (+ = destra), si fermano ai bordi e lo spostamento dura circa 0,15 s', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game; const out = { lanes: [], x: [] };
    const tap = (d) => { g.input(d); out.lanes.push(g.lane); };
    out.start = g.lane; tap(1); tap(1); tap(-1); tap(-1); tap(-1); tap(1);
    // scorrimento: due fotogrammi (0,07 s) e poi 0,3 s
    g.lane = 1; g.tx = 0; g.x = 0; g.input(1); const x0 = g.x; const target = g.tx;
    window.__run(5 / 30); out.at15 = (g.x - x0) / (target - x0);
    window.__run(0.3); out.at45 = (g.x - x0) / (target - x0);
    out.tx = target; out.moves = g.moves;
    return out;
  });
  expect(r.start).toBe(1);
  expect(r.lanes, '+ a destra, − a sinistra, mai oltre le tre corsie').toEqual([2, 2, 1, 0, 0, 1]);
  expect(r.tx, 'destra sullo schermo = −X (la camera guarda +Z)').toBeLessThan(0);
  expect(r.at15, 'dopo ~0,17 s è già quasi arrivato').toBeGreaterThan(0.85); expect(r.at45).toBeGreaterThan(0.99);
  expect(r.moves, 'solo i tocchi che spostano contano').toBe(5);
});

test('Horde Run: tenere premuto non scivola più; in partita hold() non sposta nulla', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game; g.hold(1); window.__run(2); const a = g.lane; g.hold(0); return { a, x: g.x };
  });
  expect(r.a).toBe(1); expect(Math.abs(r.x)).toBeLessThan(0.01);
});

test('Horde Run: un nemico che arriva alla linea costa un cuore, in qualunque corsia, e sparisce; il cuore non si perde prima', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game; const out = {};
    const a = window.__spawn('zombie', 0, 12, 99); const b = window.__spawn('zombie', 2, 20, 99); // né nella corsia 1, dove sei
    window.__run(1); out.hp1 = g.hp; out.lost1 = g.lost; out.a1 = a.dead;
    window.__run(1.5); out.hpA = g.hp; out.aDead = a.dead; out.bDead = b.dead;
    window.__run(2); out.hpB = g.hp; out.bDead2 = b.dead; out.lost = g.lost; out.hits = g.evLog.filter((e) => e.k === 'hit').length;
    out.hpFull = g.maxHp;
    return out;
  });
  expect(r.hp1, 'ancora lontani: nessun cuore perso').toBe(6); expect(r.a1).toBe(false);
  expect(r.hpA, 'il primo ha raggiunto la linea').toBe(5); expect(r.aDead, 'e sparisce').toBe(true); expect(r.bDead).toBe(false);
  expect(r.hpB, 'anche il secondo, nell’altra corsia').toBe(4); expect(r.bDead2).toBe(true);
  expect(r.lost).toBe(2); expect(r.hits, 'ogni colpo è un evento').toBe(2);
});

test('Horde Run: si spara solo nella propria corsia (nessuna mira automatica fra corsie)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game;
    const e = [0, 1, 2].map((l) => window.__spawn('brute', l, 30, 5000)); // fermi a distanza di tiro fra poco
    const dmg = () => e.map((x) => Math.round((x.maxHp - x.hp) * 10) / 10);
    window.__run(2); const inLane1 = dmg();
    g.input(-1); // corsia 0 (sinistra)
    window.__run(1.5); const afterMove = dmg();
    return { inLane1, afterMove, lane: g.lane };
  });
  expect(r.inLane1[1], 'la corsia del ciclista è colpita').toBeGreaterThan(0);
  expect(r.inLane1[0], 'le altre no').toBe(0); expect(r.inLane1[2]).toBe(0);
  expect(r.lane).toBe(0);
  expect(r.afterMove[0], 'dopo il cambio si colpisce la nuova corsia').toBeGreaterThan(0);
  expect(r.afterMove[2], 'e quella dall’altra parte mai').toBe(0);
});

test('Horde Run: il Custode si colpisce da ogni corsia, ridotto fuori dalla sua (45 %) e pieno nella sua', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game; const boss = window.__spawn('keeper', 1, 36, 1e6); boss.bossStep = 3; // non cambia corsia durante la prova
    const dmg = (lane) => { g.lane = lane; g.tx = [3.2, 0, -3.2][lane]; g.x = g.tx; boss.hp = boss.maxHp; boss.z = g.z + 33; for (const b of g.bullets) b.life = 0; g.fireT = 0; window.__run(1.2); return boss.maxHp - boss.hp; };
    g.bossAlive = true; return { own: dmg(1), side: dmg(0), far: dmg(2) };
  });
  expect(r.own).toBeGreaterThan(0);
  expect(r.side / r.own, 'fuori corsia: 45 %').toBeGreaterThan(0.35); expect(r.side / r.own).toBeLessThan(0.55);
  expect(r.far / r.own).toBeGreaterThan(0.35); expect(r.far / r.own).toBeLessThan(0.55);
});

test('Horde Run: lo scheletro fa un passo nella corsia accanto al primo colpo; il brute tiene la corsia', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game; const s = window.__spawn('skeleton', 1, 22, 9); const b = window.__spawn('brute', 0, 22, 99);
    const lane0 = s.lane; window.__run(0.8); const lane1 = s.lane; window.__run(0.5);
    return { lane0, lane1, dodged: s.dodged, x: s.x, bruteLane: b.lane };
  });
  expect(r.lane0).toBe(1); expect(r.lane1, 'una corsia accanto').not.toBe(1); expect(r.dodged).toBe(true); expect(r.bruteLane).toBe(0);
});

test('Horde Run: il portale si prende solo nella sua corsia (la terza resta libera); la cassa idem', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game; const out = {};
    g.spawnGatePair(g.z + 6); const lanes = g.gates.map((x) => x.lane).sort(); out.lanes = lanes; out.kinds = g.gates.map((x) => x.def.kind);
    const free = [0, 1, 2].find((l) => !lanes.includes(l)); out.free = free;
    g.lane = free; g.tx = [3.2, 0, -3.2][free]; g.x = g.tx; const before = { w: g.weapon, a: g.allies.length, hp: g.hp, r: g.rateMul };
    window.__run(2.5); out.taken = g.gates.map((x) => !!x.taken); out.same = g.weapon === before.w && g.allies.length === before.a && g.rateMul === before.r;
    // una seconda coppia, nella corsia di uno dei due
    g.hp = 3; g.gates = []; g.spawnGatePair(g.z + 6); const pick = g.gates[0]; g.lane = pick.lane; g.tx = [3.2, 0, -3.2][pick.lane]; g.x = g.tx;
    const snap = () => `${g.weapon}|${g.allies.length}|${g.rateMul}|${g.hp}|${g.allyBoost}`; const s0 = snap();
    window.__run(2.5); out.takenB = g.gates.map((x) => !!x.taken); out.changed = snap() !== s0; out.pickKind = pick.def.kind;
    // cassa: un cuore (manca) o una bomba, solo nella corsia
    g.hp = 3; g.picks = []; g.spawnPick(g.z + 6); const p = g.picks[0]; out.pickLane = p?.lane; out.pickK = p?.def.kind;
    const other = (p.lane + 1) % 3; g.lane = other; g.tx = [3.2, 0, -3.2][other]; g.x = g.tx; const hp0 = g.hp; window.__run(2.5); out.missed = !p.taken && g.hp === hp0 || p.def.kind === 'bomb';
    return out;
  });
  expect(r.lanes.length).toBe(2); expect(new Set(r.lanes).size, 'due corsie diverse').toBe(2); expect(r.kinds[0]).not.toBe(r.kinds[1]);
  expect(r.taken, 'chi passa nella corsia libera non prende niente').toEqual([false, false]); expect(r.same).toBe(true);
  expect(r.takenB.filter(Boolean), 'nella corsia di un portale si prende quel portale').toHaveLength(1); expect(r.changed, `ha dato qualcosa (${r.pickKind})`).toBe(true);
  expect(r.missed, 'la cassa nella corsia accanto non si prende').toBe(true);
});

test('Horde Run: i portali offrono il cuore solo se ne manca uno; con due alleati il portale alleati li rende più veloci', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game; const kinds = () => g.gateOptions().map((d) => d.kind);
    const full = kinds(); g.hp = 4; const missing = kinds(); g.hp = 6;
    g.addAlly(); const one = kinds(); g.addAlly(); const two = kinds(); const rate = [g.allyBoost]; g.addAlly(); rate.push(g.allyBoost); g.addAlly(); rate.push(g.allyBoost); g.addAlly(); rate.push(g.allyBoost);
    return { full, missing, one, two, rate, n: g.allies.length, after: kinds() };
  });
  expect(r.full).not.toContain('life'); expect(r.missing).toContain('life');
  expect(r.one).toContain('ally'); expect(r.two).toContain('allyUp'); expect(r.two).not.toContain('ally');
  expect(r.n, 'al massimo due alleati').toBe(2); expect(r.rate, '40 % → 55 % → 70 %: livelli 0, 1, 2 e poi fermo').toEqual([0, 1, 2, 2]);
  expect(r.after).not.toContain('allyUp');
});

test('Horde Run: gli alleati stanno nelle corsie accanto (sul bordo quello esterno resta dietro) e sparano nella loro, al 40 % del ciclista', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game; g.addAlly(); g.addAlly(); window.__run(1);
    const lanes = (l) => { g.lane = l; return g.allies.map((a) => g.allyLane(a)); };
    const out = { mid: lanes(1), left: lanes(0), right: lanes(2) };
    g.lane = 1; g.tx = 0; g.x = 0; window.__run(1);
    const sh = g.shooters(); out.muls = sh.map((s) => s.mul); out.sl = sh.map((s) => s.lane);
    return out;
  });
  expect(r.mid.slice().sort()).toEqual([0, 2]); expect(r.left).toContain(null); expect(r.right).toContain(null); expect(r.left).toContain(1); expect(r.right).toContain(1);
  expect(r.muls).toEqual([1, 0.4, 0.4]); expect(r.sl.slice().sort()).toEqual([0, 1, 2]);
});

test('Horde Run: un nemico a meno di 2 s dalla linea accende l’avviso nella sua corsia (e un suono); threatLane() dice dove andare', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game; const sfx = []; const orig = g.audio.sfx.bind(g.audio); g.audio.sfx = (n) => { sfx.push(n); return orig(n); };
    const far = window.__spawn('zombie', 2, 60, 99); const near = window.__spawn('runner', 0, 30, 99); // arriva fra ~3,6 s
    window.__run(1 / 30); const t0 = g.threatT.slice(); const lane0 = g.threatLane(); const warn0 = g.warnPrev.slice();
    window.__run(1.9); const warn1 = g.warnPrev.slice(); const n1 = sfx.filter((s) => s === 'warn').length;
    window.__run(1); const n2 = sfx.filter((s) => s === 'warn').length;
    return { t0, lane0, warn0, warn1, n1, n2, far: far.dead, near: near.dead };
  });
  expect(r.lane0, 'il corridore nella corsia 0 arriva per primo').toBe(0); expect(r.t0[0]).toBeLessThan(r.t0[2]);
  expect(r.warn0).toEqual([false, false, false]); expect(r.warn1[0], 'dentro i 2 s: avviso').toBe(true);
  expect(r.n1, 'un suono quando compare').toBeGreaterThanOrEqual(1); expect(r.n2, 'non si ripete mentre resta acceso').toBeLessThanOrEqual(r.n1 + 1);
});

test('Horde Run: l’arma sale di un livello a ogni sforzo riuscito (e solo se riuscito); annuncio "Wave cleared"', async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    const play = (ratio) => {
      const g = window.__game; g.active = false; window.__spindroSeed = 5; g.reset(); g.begin();
      g.hooks = { ...g.hooks, stats: () => ({ power: Math.round((g.tgtW || 100) * ratio), cadence: 85 }) };
      g.enemies.forEach((e) => { e.dead = true; e.deadT = 9; }); g.enemies = []; g.nextGate = 1e9; g.nextPick = 1e9; g.lastEnter = 1e9; g.nextSpawn = null;
      const eff = g.plan.segs.find((s) => s.kind === 'effort'); const said = [];
      const sayO = g.say.bind(g); g.say = (tx, ...r2) => { said.push(tx); return sayO(tx, ...r2); };
      while (g.el < eff.t1 + 1.5) g.update(1 / 30);
      return { weapon: g.weapon, done: g.effortsDone, total: g.effortsTotal, said: said.filter((x) => /Wave cleared|missed/.test(x)) };
    };
    out.on = play(1); out.off = play(0.6);
    return out;
  });
  expect(r.on.weapon, 'sforzo riuscito: pistola → SMG').toBe(1); expect(r.on.done).toBe(1); expect(r.on.said).toEqual(['Wave cleared: SMG']);
  expect(r.off.weapon, 'sforzo mancato: l’arma resta').toBe(0); expect(r.off.done).toBe(0); expect(r.off.said[0]).toMatch(/missed/);
});

test('Horde Run: sei livelli d’arma, tutti diversi; niente gemme, niente XP, niente barra XP in nessun posto', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = window.__game; g.addAlly(); window.__run(2);
    return { gems: g.gems, xp: g.xp, xpNeed: typeof g.xpNeed, trail: typeof g.spawnTrail, addGem: typeof g.addGem, updateGems: typeof g.updateGems, keys: Object.keys(g).filter((k) => /gem|xp|trail/i.test(k)) };
  });
  expect(r.gems).toBeUndefined(); expect(r.xp).toBeUndefined(); expect([r.xpNeed, r.trail, r.addGem, r.updateGems]).toEqual(['undefined', 'undefined', 'undefined', 'undefined']); expect(r.keys).toEqual([]);
  const code = SRC('js/games/horde.js') + SRC('js/games/horde-plan.js');
  expect(code, 'nel codice non restano gemme né XP').not.toMatch(/\b(gem|gems|xpNeed|dropGem|addGem|spawnTrail|jewel)\b|\bthis\.xp\b|xp:\s*\d/i);
  for (const l of ['en', 'it', 'de', 'fr', 'es']) { const d = JSON.parse(SRC(`locales/${l}.json`)); expect(Object.keys(d).filter((k) => /^games\.horde\./.test(k) && /gem|xp|alliesHud|fireRate$/i.test(k)), `locale ${l}`).toEqual([]); }
  const weapons = await page.evaluate(() => window.__game.constructor.name);
  expect(weapons).toBe('Horde');
});
