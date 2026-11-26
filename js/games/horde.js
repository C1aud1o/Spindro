// HORDE RUN — tieni la strada: tre corsie, + / − cambiano corsia. I nemici scendono lungo le corsie e ognuno che arriva
// alla tua linea costa un cuore: vai nella corsia della minaccia più vicina, quella è la partita. Si spara solo nella
// propria corsia (gli alleati nelle due accanto). L'arma sale di un livello a ogni sforzo o scatto riuscito; i portali
// (alleato, arma, cadenza, cuore) e le rare casse (bomba, cuore) stanno nelle corsie e si prendono passandoci sopra.
// Ogni partita è un ALLENAMENTO: dura 5, 10 o 20 minuti e segue ondate di sforzo e recupero in % della FTP (horde-plan.js);
// il rullo è in ERG, i watt li tiene lui: se smetti di pedalare il gioco va in pausa. A fine blocco arriva il Custode.
// Il direttore (directorTick) fa nascere i nemici solo se il giocatore può ancora ripulire tutto in tempo (horde-plan.js feasible).
// Grafica: ciclisti Meshy con scheletro automatico; nemici Meshy con animazione procedurale
// (vicini: ossa vere, fino a un tetto che dipende dalla qualità; lontani: istanze in posa cotta); cimitero al crepuscolo.
import { THREE, Stage, loadAll, Pool, Effects, tracer, fxTexture, Cyclist, makeKit, loadCyclistTemplate, toonMaterial, prepareModel, Quality } from './kit3d.js';
import { loadMeshyTemplate, CYCLIST_URL, MESHY_FAN_URL, BIKE } from './kit/cyclist.js';
import { Walker, FarCrowd, makeEnemyKit, bakePose, enemyMaterial } from './kit/walkers.js';
import { buildSky, buildGround, Scenery, LampLights } from './horde-world.js';
import { clamp, lerp } from './engine.js';
import { txt as hudText, hudView, paragraph, MessageQueue, loadHudFonts, hurtVignette, HURT_FLASH_S, guardTrainer, trainerLostBanner, panel as hudPanel } from './kit/hud.js';
import { t } from '../i18n.js';
import { GameMenu, ResultsView } from './kit/menu.js';
import { makeRandom } from './kit/rng.js';
import { SONGS } from './audio.js';
import { DURATIONS, LEVELS, COOL_S, buildPlan, planFromWorkout, segAt, composAt, targetW, targetPct, heartStars, heartHint, LANES, LANE_W, laneX, SLACK, SWITCH_S, DENSITY, GAP_K, feasible } from './horde-plan.js';
import { WorkoutClock, BandMeter, workoutStars } from './kit/workout-plan.js';
import { drawWorkoutStrip, stripBottom, stripFromPlan } from './kit/workout-strip.js';

const M = 'assets/3d/meshy';
const V = 3.6;              // m/s: velocità di scorrimento fissa, così i tempi di arrivo non dipendono dalla velocità del rullo
const LINE_D = 1.6;         // un nemico a meno di questa distanza dal ciclista ha raggiunto la linea: costa un cuore
const SPAWN_Z = 92;         // i nemici nascono oltre dove finisce la nebbia (92 m): emergono, non compaiono
const GATE_Z = 64;          // portali e casse compaiono a questa distanza (circa 18 s prima)
const CAM_Y = 6.6; const CAM_BACK = 13.2; const CAM_LOOK = 9; // telecamera: altezza, distanza dietro il ciclista, punto guardato davanti
const FIRE_RANGE = 24;      // si spara dentro questa distanza
const ZONE_D = FIRE_RANGE + 16; // da qui un nemico è "in gioco" (i colpi che trapassano arrivano a 40 m): è l'evento che il direttore mantiene regolare
const BOSS_RANGE = 42;      // il Custode è grande: lo si colpisce da più lontano
const BOSS_OFF = 0.45;      // danno al Custode da una corsia che non è la sua
const SPLASH_ADJ = 0.35;    // danno ad area nelle corsie accanto
const WARN_S = 2;           // l'avviso di minaccia compare quando un nemico è a meno di questi secondi dalla linea
const ALLY_RATE = [0.4, 0.55, 0.7]; // cadenza degli alleati rispetto a quella del ciclista (i portali "alleati" la alzano)
const MAX_BULLETS = 60;     // colpi con la scia in volo insieme; oltre, il danno arriva subito
const MAX_ALIVE = 64;       // capacità della folla lontana (istanze)
const NEAR = 34;            // entro questa distanza un nemico può avere le ossa (fino al tetto della qualità)
const ANIM_CAP = { high: 20, medium: 12, low: 7 }; // nemici animati con ossa, per livello di qualità
const RIDER_S = 1.3;        // il ciclista è più grande del vero: si legge dall'alto
const GUN_FLIP = 1; // verso della canna del blaster Meshy rispetto a +Z (1 o −1)
const SEG_COLOR = { warm: '#9ee37d', pace: '#ffd34d', effort: '#ff9f43', sprint: '#ff4d6d', rest: '#4de3ff', cool: '#a0f0c0' };

// sei armi, sei modi diversi di sparare lungo la corsia
const WEAPONS = [
  { name: 'games.horde.w.pistol', rate: 3, dmg: 1, shots: 1, speed: 38, color: '#fff3a0' },
  { name: 'games.horde.w.smg', rate: 7, dmg: 1, shots: 1, speed: 44, color: '#ffe08a' },
  { name: 'games.horde.w.pump', rate: 1.8, dmg: 1.6, shots: 3, speed: 34, color: '#ff9f43', pierce: 2, range: 13 },
  { name: 'games.horde.w.rifle', rate: 6, dmg: 2.5, shots: 1, speed: 52, color: '#b8f2ff', pierce: 3 },
  { name: 'games.horde.w.rocket', rate: 1.6, dmg: 12, shots: 1, speed: 28, color: '#ff6b35', splash: 3.2 },
  { name: 'games.horde.w.laser', rate: 9, dmg: 4, shots: 1, speed: 80, color: '#4de3ff', pierce: 99 },
];
const TOP = WEAPONS.length - 1;

// walker lento e debole · runner veloce (precedenza) · brute robusto (tiene la corsia) · skeleton (cambia corsia al primo colpo) · il Custode
const ENEMIES = {
  zombie: { file: 'zombie', h: 3.3, rad: 0.75, hp: 2, speed: 1.9, style: 'walk', score: 10 },
  runner: { file: 'zombie_runner', h: 3.2, rad: 0.7, hp: 2, speed: 4.2, style: 'run', score: 15, fast: true },
  skeleton: { file: 'skeleton', h: 3.3, rad: 0.75, hp: 3, speed: 2.8, style: 'bones', score: 20, dodge: true },
  brute: { file: 'zombie_brute', h: 4.3, rad: 1.1, hp: 9, speed: 2.0, style: 'brute', score: 50 },
  keeper: { file: 'ogre', h: 8.2, rad: 2.6, hp: 260, speed: 1.2, style: 'boss', score: 1000, boss: true },
};

// ---------- portali e casse: stanno nelle corsie, si prendono passandoci sopra ----------
const G = {
  ally: { text: 'games.horde.gate.ally', kind: 'ally', color: '#2fd6a0', apply: (g) => g.addAlly() },
  allyUp: { text: 'games.horde.gate.allyUp', kind: 'allyUp', color: '#2fd6a0', apply: (g) => g.addAlly() },
  weapon: { text: 'games.horde.gate.weapon', kind: 'weapon', color: '#ff9f43', apply: (g) => g.weaponUp(false) },
  rate: { text: 'games.horde.gate.rateUp', kind: 'rate', color: '#4de3ff', apply: (g) => { g.rateMul = Math.min(1.9, g.rateMul * 1.3); } },
  life: { text: 'games.horde.gate.life', kind: 'life', color: '#ff7ab6', apply: (g) => { g.hp = Math.min(g.maxHp, g.hp + 1); } },
};
const PICKS = {
  bomb: { text: 'games.horde.pick.bomb', kind: 'bomb', color: '#ffb84d' },
  heart: { text: 'games.horde.pick.heart', kind: 'heart', color: '#ff7ab6' },
};

export class Horde {
  constructor(hudCanvas, hooks, audio) {
    this.hudCanvas = hudCanvas; this.hooks = guardTrainer(hooks); this.audio = audio;
    this.active = false;
    this.seed = null; this.rnd = makeRandom(this.seed);
    const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
    this.menu = new GameMenu({
      id: 'horde', title: () => t('games.horde.hud.title'), pitch: () => t('games.horde.hud.tagline'),
      howto: () => [t('games.horde.rule2'), t('games.horde.rule3'), t('games.horde.rule4')],
      load: () => ({ durIdx: clamp(Number(ls('hordeDur', 0)) || 0, 0, DURATIONS.length - 1), level: clamp(Number(ls('hordeLvl', 1)) || 0, 0, LEVELS.length - 1) }),
      save: ({ durIdx, level }) => { try { localStorage.setItem('hordeDur', durIdx); localStorage.setItem('hordeLvl', level); } catch { /* niente storage */ } },
      best: (d, l) => { const r = this.recordFor(DURATIONS[d], LEVELS[l].id); return { stars: r.stars || 0, text: r.score ? String(r.score) : null }; },
      sfx: (n) => this.audio.sfx(n), ready: () => this.state === 'menu', workout: () => this.hooks.workout?.(),
      onStart: () => { this.reset(); this.begin(); },
    });
    this.results = new ResultsView({ sfx: (n) => this.audio.sfx(n), onAgain: () => { this.reset(); this.begin(); }, onBack: () => this.hooks.close?.() });
    this.detach = [];
    this.loop = this.loop.bind(this);
  }

  get durIdx() { return this.menu.durIdx; }
  set durIdx(v) { this.menu.durIdx = v; }
  get lvlIdx() { return this.menu.level; }
  set lvlIdx(v) { this.menu.level = v; }

  async start() {
    this.hooks.reset?.();
    this.active = true;
    const size = () => ({ W: this.stage.W, H: this.stage.H });
    this.detach = [this.menu.attach(this.hudCanvas, size, () => this.state === 'menu' || this.state === 'loading'), this.results.attach(this.hudCanvas, size, () => this.state === 'results')];
    this.quality = new Quality();
    this.stage = new Stage(this.hudCanvas, { quality: this.quality });
    this.stage.onQuality = (cfg) => this.applyQuality(cfg);
    this.state = 'loading'; this.t = 0; this.msgs = new MessageQueue(); this.power = 0; this.pw = 0; this.cadence = 0;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
    this.audio.playSong(SONGS.menu);
    try {
      const files = {};
      for (const n of ['tombstones', 'iron_fence', 'crypt', 'dead_tree', 'street_lamp', 'portal', 'blaster']) files[n] = `${M}/${n}.glb`;
      this.m = await loadAll(files, (p) => { this.loadPct = p * 0.5; });
      // ciclisti: modello Meshy con scheletro automatico; se non si carica, il ciclista Quaternius di prima
      this.tpl = await loadMeshyTemplate().catch((err) => { console.warn('Meshy cyclist:', err); return loadCyclistTemplate(CYCLIST_URL); });
      this.allyTpl = await loadMeshyTemplate(MESHY_FAN_URL).catch(() => this.tpl); // gli alleati usano il modello leggero (3.500 triangoli)
      this.loadPct = 0.65;
      this.kits = {};
      let done = 0; const types = Object.entries(ENEMIES);
      this.farKits = {};
      await Promise.all(types.map(async ([k, d]) => {
        this.kits[k] = await makeEnemyKit(`${M}/${d.file}.glb`, d.h);
        if (!d.boss) this.farKits[k] = await makeEnemyKit(`${M}/${d.file}-lo.glb`, d.h); // versione da ~1000 triangoli per la folla lontana
        this.loadPct = 0.65 + 0.35 * (++done / types.length);
      }));
      await loadHudFonts();
      if (!this.active) return;
      this.build();
      this.state = 'menu'; this.stateT = 0; this.menu.reset();
    } catch (err) { console.error(err); this.state = 'error'; this.error = err.message; }
  }

  stop() {
    this.active = false; this.audio.stopSong();
    for (const d of this.detach) d(); this.detach = [];
    for (const m of this.litMats || []) m.emissive?.set('#000000');
    this.stage?.dispose();
  }

  // ---------- scena ----------
  build() {
    const { scene } = this.stage;
    this.sky = buildSky(scene, this.quality);
    this.ground = buildGround(scene);
    this.scenery = new Scenery(scene, this.m, this.quality.cfg.density);
    this.lamps = new LampLights(scene, 5.4);
    // proiettili ed effetti (texture Kenney in assets/fx)
    this.bullets = []; this.bulletPool = new Pool(scene, () => tracer(), 100);
    this.fx = new Effects(scene, 200);
    // nemici: folla lontana (posa cotta, un draw call per tipo) e pool di personaggi con le ossa
    this.far = {}; this.walkers = {};
    for (const [type, def] of Object.entries(ENEMIES)) {
      this.walkers[type] = [];
      if (def.boss) continue;
      this.far[type] = new FarCrowd(scene, bakePose(this.farKits[type], def.style), enemyMaterial(this.farKits[type].tpl.map, def.h, { far: true }), MAX_ALIVE);
    }
    // la striscia luminosa sulla strada: mostra la corsia dove stai sparando
    this.beam = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W * 0.8, FIRE_RANGE + 2), new THREE.MeshBasicMaterial({ color: '#d9ff3d', transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.beam.rotation.x = -Math.PI / 2; this.beam.renderOrder = 2; scene.add(this.beam);
    // i nemici sono scuri sull'asfalto: un po' di luce propria li fa leggere (la sagoma si stacca dalla strada)
    // (i materiali sono condivisi con gli altri giochi: alla chiusura si rimettono come prima)
    this.litMats = [...Object.values(this.kits).map((k) => k.material), ...Object.entries(this.farKits).map(([type, k]) => enemyMaterial(k.tpl.map, ENEMIES[type].h, { far: true }))];
    for (const m of this.litMats) m.emissive?.set('#1a2140');
    this.initGuns(); this.initPortal();
    this.pops = [];
    this.applyQuality(this.quality.cfg);
    this.reset();
  }

  applyQuality(cfg) {
    if (!this.scenery) return;
    this.scenery.setDensity(cfg.density);
    this.animCap = ANIM_CAP[this.quality.level] || 16;
    this.farRange = SPAWN_Z + 30; // la folla lontana si disegna sempre fino a dove nascono i nemici (nella nebbia): niente comparse
    this.lampN = { high: 3, medium: 2, low: 1 }[this.quality.level] || 2;
    this.lamps.pts.forEach((l, i) => { l.userData.off = i >= this.lampN; });
    const sh = this.quality.level === 'high'; // le ombre dei nemici solo in alta qualità
    for (const list of Object.values(this.walkers)) for (const w of list) w.body.castShadow = sh;
    for (const e of this.enemies || []) if (e.w) e.w.body.castShadow = sh;
    this.player?.setShadows(cfg.shadows);
  }

  // ---------- armi: il blaster Meshy sul manubrio, più grande e colorato a ogni evoluzione ----------
  initGuns() {
    const info = prepareModel(this.m.blaster); const b = info.box;
    const size = new THREE.Vector3(); b.getSize(size);
    // il modello ha la canna lungo l'asse più lungo del piano orizzontale: la si porta lungo +Z
    this.gunYaw = size.x > size.z ? Math.PI / 2 * GUN_FLIP : (GUN_FLIP < 0 ? Math.PI : 0);
    this.gunLen = Math.max(size.x, size.z); this.gunInfo = info;
    this.gunCenter = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
    this.gunMats = WEAPONS.map((w) => info.parts.map((pt) => toonMaterial({ map: pt.mat === 'vc' ? null : pt.mat, vertexColors: pt.mat === 'vc', color: new THREE.Color(w.color).lerp(new THREE.Color('#ffffff'), 0.72) })));
  }

  makeGun(wi) {
    const g = new THREE.Group(); const inner = new THREE.Group(); g.add(inner);
    this.gunInfo.parts.forEach((pt, i) => { const m = new THREE.Mesh(pt.geo, this.gunMats[wi][i]); m.castShadow = false; inner.add(m); });
    inner.position.set(-this.gunCenter.x, -this.gunCenter.y, -this.gunCenter.z);
    const wrap = new THREE.Group(); wrap.add(inner); wrap.rotation.y = this.gunYaw;
    const s = (0.5 + wi * 0.05) / this.gunLen; g.add(wrap); g.scale.setScalar(s);
    return g;
  }

  mountGun(cy, wi) {
    if (cy.gun) cy.lean.remove(cy.gun);
    cy.gun = this.makeGun(wi); cy.gun.position.set(0, BIKE.hood.y - 0.1, BIKE.hood.z + 0.07);
    cy.lean.add(cy.gun);
  }

  // un ciclista Meshy con la sua bici e l'arma
  makeRider(jersey, i, wi, light = false) {
    const cy = new Cyclist(light ? this.allyTpl : this.tpl, makeKit(jersey, i), { shadows: this.quality.cfg.shadows });
    cy.root.scale.setScalar(RIDER_S);
    this.mountGun(cy, wi);
    this.stage.scene.add(cy.root);
    return cy;
  }

  reset() {
    const { scene } = this.stage;
    for (const e of this.enemies || []) if (e.w) scene.remove(e.w.root);
    for (const list of Object.values(this.walkers)) for (const w of list) w.root.visible = false;
    for (const c of Object.values(this.far)) { c.begin(); c.end(); }
    for (const a of this.allies || []) scene.remove(a.r.root);
    for (const g of this.gates || []) this.dropItem(g, scene);
    for (const p of this.picks || []) this.dropItem(p, scene);
    if (this.player) scene.remove(this.player.root);
    for (const b of this.bullets) b.mesh.visible = false;
    this.bullets = [];
    this.rnd = makeRandom(this.seed); this.configure(this.durIdx, this.lvlIdx);
    this.z = 0; this.lane = 1; this.x = laneX(1); this.tx = this.x; this.hp = 6; this.maxHp = 6; this.pops = [];
    this.weapon = 0; this.rateMul = 1; this.dmgMul = 1; this.allyBoost = 0;
    this.kills = 0; this.score = 0; this.el = this.wk ? this.wc.el : 0; this.segIdx = -1; this.seg = this.plan.segs[0];
    this.enemies = []; this.allies = []; this.gates = []; this.picks = [];
    this.gateN = 0; this.lastKinds = {}; this.nextGate = 13; this.nextPick = 24; this.nextSpawn = null; this.lastEnter = 0; this.gt = 0; this.laneLast = -1;
    this.hurtT = 0; this.shake = 0; this.bossAlive = false; this.overdrive = 0;
    this.lost = 0; this.moves = 0; this.v = V; this.warnPrev = [false, false, false]; this.warnT = -9; this.threatT = [Infinity, Infinity, Infinity];
    this.pw = 0; this.popN = 0; // niente eredità dal menu o dalla partita prima: la potenza di allora dipende dal tempo reale
    this.paused = false; this.pauseT = 0; this.startT = 0; this.finished = false; this.result = null;
    this.effortsDone = 0; this.effortsTotal = 0; this.bossKilled = 0; this.bossSpawned = new Set(); this.bossAt = null; this.passed = 0; this.ko = 0; this.hurtFlash = 0;
    this.evLog = []; this.sprinting = false; this.msgs.clear(); this.beamK = 0;
    this.player = this.makeRider('#d9ff3d', 0, 0);
    this.fireT = 0; this.camInit = false; this.frame = 0; this.fov = 60;
    this.scenery.update(this.z, true);
    this.prefill();
  }

  // durata e livello scelti: ricostruiscono il piano
  configure(durIdx, lvlIdx) {
    this.durIdx = durIdx; this.lvlIdx = lvlIdx;
    this.level = LEVELS[lvlIdx];
    // allenamento in corso: la partita È l'allenamento (durata, tratti e watt vengono da lì; il livello non cambia i watt)
    this.wc = new WorkoutClock(this.hooks); this.wk = this.wc.begin(this.ftp);
    if (this.wk) { this.plan = planFromWorkout(this.wk); this.total = this.plan.total; } else { this.total = DURATIONS[durIdx]; this.plan = buildPlan(this.total); }
    this.band = new BandMeter();
  }

  get ftp() { return Math.max(80, this.hooks.ftp?.() || 200); }
  recordKey() { return `hordeBest2:${this.total}:${this.level.id}`; }
  recordFor(total, id) { try { return JSON.parse(localStorage.getItem(`hordeBest2:${total}:${id}`) || '{}'); } catch { return {}; } }
  record() { return this.wk ? {} : this.recordFor(this.total, this.level.id); }

  // ---------- eventi: tutto ciò che chiede o premia qualcosa (si misura nel test) ----------
  ev(kind) { if (this.evLog.length < 20000) this.evLog.push({ t: this.el, k: kind }); }
  eventStats() {
    const end = this.total - COOL_S; const ts = this.evLog.filter((e) => e.t <= end + 0.5).map((e) => e.t).sort((a, b) => a - b);
    let maxGap = 0; let prev = 0; for (const x of ts) { maxGap = Math.max(maxGap, x - prev); prev = x; } maxGap = Math.max(maxGap, end - prev);
    return { first: ts[0] ?? Infinity, maxGap, perMin: ts.length / (end / 60), n: ts.length };
  }

  // ---------- gioco ----------
  // + / −: una corsia a ogni tocco (destra sullo schermo = corsia +1). Niente scivolamento: tenere premuto non fa nulla in partita.
  input(dir) {
    this.audio.ensure();
    if (this.state === 'menu' || this.state === 'loading') { this.menu.input(dir); return; }
    if (this.state === 'results') { this.results.input(dir); return; }
    if (this.state !== 'play' || this.paused) return;
    this.setLane(this.lane + dir);
  }

  // per `npm run game:check` e i test: gioca come il bot LANE, va nella corsia del nemico che arriva per primo (una corsia per volta, come i tasti)
  pilot() { const l = this.threatLane(); if (l >= 0 && l !== this.lane) this.setLane(this.lane + Math.sign(l - this.lane)); }
  get starsIgnorePower() { return true; } // le stelle vengono dai cuori: i watt li tiene il rullo (ERG)

  setLane(l) {
    l = clamp(l, 0, LANES - 1);
    if (l === this.lane) return;
    this.lane = l; this.tx = laneX(l); this.moves++; this.audio.sfx('lane');
  }

  // nel menu: tenere premuto dopo 0,8 s inizia la partita; in partita non serve
  hold(dir) { if (this.state === 'menu' || this.state === 'loading') this.menu.hold(dir); }

  begin() {
    this.state = 'play'; this.stateT = 0; this.hooks.runStart?.();
    this.audio.playSong(SONGS.factory); this.audio.sfx('go');
  }

  // testo che sale dal giocatore (feedback immediato di cosa hai preso)
  pop(text, color, t = 1) { this.popN = (this.popN || 0) + 1; this.pops.push({ text, color, t, t0: t, x: this.x, z: this.z, slot: this.popN % 2 }); while (this.pops.length > 2) this.pops.shift(); }

  // messaggi corti sopra il 38 % dell'altezza: uno alla volta, con priorità (kit/hud.js MessageQueue). prio: 1 normale, 2 grande, 3 boss
  say(text, color = '#ffd34d', t = 1.6, big = false, prio = big ? 2 : 1, sub = null) { this.msgs.say(text, { color, dur: t, big, prio, sub }); }
  prog(stat, n = 1, xp = 0) { this.hooks.progress?.event(stat, n, xp); }

  // alleati: al massimo due, uno per lato; con due già presenti il portale "alleati" li rende più veloci
  addAlly() {
    if (this.allies.length >= 2) {
      this.allyBoost = Math.min(ALLY_RATE.length - 1, this.allyBoost + 1);
      this.say(t('games.horde.allyFaster', { n: Math.round(ALLY_RATE[this.allyBoost] * 100) }), '#06d6a0', 1.4);
      return;
    }
    const jerseys = ['#4de3ff', '#ff4d9d'];
    const side = this.allies.some((a) => a.side === -1) ? 1 : -1; // il primo sta a sinistra, il secondo a destra
    const r = this.makeRider(jerseys[this.allies.length], this.allies.length + 1, this.weapon, true);
    r.setShadows(false);
    // nasce dal portale appena passato (davanti a te, lontano dalla telecamera) e cresce mentre si mette in corsia
    const a = { r, side, fireT: 0.15 + this.rnd() * 0.3, x: this.x, z: this.z + 1.5, born: 0, lane: this.lane };
    r.root.position.set(a.x, 0, a.z); r.root.scale.setScalar(RIDER_S * 0.2);
    this.allies.push(a);
    this.fx.spawn(a.x, 1.6, a.z + 1, { tex: 'green', size: 1.1, life: 0.4 });
    this.say(t('games.horde.alliesSay', { n: this.allies.length }), '#06d6a0', 1.4);
  }
  // la corsia di un alleato: accanto al ciclista; sul bordo della strada quello esterno resta dietro e spara nella corsia del ciclista
  allyLane(a) { const l = this.lane + a.side; return l < 0 || l >= LANES ? null : l; }

  // sale di un livello d'arma (a fine sforzo riuscito o da un portale). Al livello più alto sale il danno
  weaponUp(fromEffort) {
    if (this.weapon >= TOP) { this.dmgMul = Math.min(3, this.dmgMul * 1.15); } else {
      this.weapon++;
      this.mountGun(this.player, this.weapon);
      for (const a of this.allies) this.mountGun(a.r, this.weapon);
    }
    const w = WEAPONS[this.weapon];
    this.say(fromEffort ? t('games.horde.waveCleared', { name: t(w.name) }) : t('games.horde.newWeapon', { name: t(w.name) }), w.color, 2.2, true);
    this.audio.sfx('overdrive'); this.shake = 0.3; this.ev('weapon');
    this.fx.spawn(this.x, 1.8, this.z + 2.5, { tex: 'spark', size: 2.2, life: 0.35 });
  }

  spawnEnemy(type, lane, z, hp = null) {
    const def = ENEMIES[type];
    hp = hp ?? this.hpOf(def);
    const e = { type, def, w: null, lane, x: laneX(lane), z, hp, maxHp: hp, dead: false, deadT: 0, flash: 0, wob: this.rnd() * 6, shade: 0.8 + this.rnd() * 0.28, atk: 1 + this.rnd(), off: (this.rnd() - 0.5) * 0.5, sc: def.boss ? 1 : 0.92 + this.rnd() * 0.16, dodgeT: 0, dodged: false, seen: false, bossStep: 0, age: 9 };
    this.enemies.push(e); return e;
  }
  // i nemici si fanno più robusti lungo la partita (non con le ondate: 5 e 20 minuti hanno la stessa curva)
  hpOf(def) { return def.hp * (1 + 0.8 * clamp(this.el / this.total, 0, 1)); }

  // da "folla" a personaggio con le ossa quando si avvicina (e viceversa quando c'è troppa gente vicina)
  wake(e) {
    const list = this.walkers[e.type];
    const w = list.pop() || new Walker(this.kits[e.type]);
    w.body.castShadow = this.quality.level === 'high';
    w.root.visible = true; w.fall = 0; w.lunge = 0; w.hit = 0; w.pivot.rotation.set(0, 0, 0); w.pivot.position.y = 0; w.inner.scale.setScalar(this.kits[e.type].scale * e.sc);
    w.update(this.rnd() * 0.5, e.def.style, e.def.speed);
    w.root.position.set(e.x, 0, e.z); w.root.rotation.y = Math.PI;
    if (!w.root.parent) this.stage.scene.add(w.root);
    e.w = w;
  }
  sleep(e) { if (!e.w) return; e.w.root.visible = false; this.walkers[e.type].push(e.w); e.w = null; }

  // ---------- il direttore: chi nasce, in quale corsia e quando ----------
  // Danno al secondo sulla corsia del ciclista con l'arma di adesso
  dps() { const w = WEAPONS[this.weapon]; return w.rate * w.dmg * w.shots * this.rateMul * this.dmgMul; }
  get slack() { return SLACK[this.level.id] ?? SLACK.normal; }

  // un nemico visto dal direttore: quando arriva alla linea (a), da quando si può colpire (r), quanto tiro serve (w)
  jobOf(e, z = e.z) {
    const closing = V + e.def.speed;
    const a = Math.max(0.05, (z - this.z - LINE_D) / closing);
    const r = Math.max(0, a - (FIRE_RANGE - LINE_D) / closing);
    return { a, r, w: e.hp / this.dps() + (e.def.dodge && !e.dodged ? SWITCH_S * 0.7 : 0), lane: e.lane };
  }

  // c'è sempre una scelta, ma sempre risolvibile: un branco nasce solo se, con la potenza di fuoco di adesso e passando di corsia
  // in corsia, si ripulisce tutto prima che arrivi (con il margine del livello: 25 % a Normale, 40 % a Facile, 10 % a Difficile)
  tryAdd(batch) {
    const jobs = [];
    for (const e of this.enemies) if (!e.dead && !e.def.boss) jobs.push(this.jobOf(e));
    for (const b of batch) jobs.push(this.jobOf({ def: ENEMIES[b.type], hp: this.hpOf(ENEMIES[b.type]), lane: b.lane }, this.z + SPAWN_Z + b.dz));
    if (!feasible(jobs, { lane: this.lane, slack: this.slack })) return false;
    for (const b of batch) { const e = this.spawnEnemy(b.type, b.lane, this.z + SPAWN_Z + b.dz); this.laneLast = b.lane; }
    return true;
  }

  pickType(mix) {
    let r = this.rnd(); let last = 'zombie';
    for (const [k, p] of Object.entries(mix)) { last = k; if ((r -= p) < 0) return k; }
    return last;
  }
  // la corsia del prossimo nemico: non due volte la stessa di fila, e di solito non quella dove stai già
  pickLane(not = -1) {
    const w = [0, 1, 2].map((l) => (l === not ? 0 : (l === this.laneLast ? 0.45 : 1) * (l === this.lane ? 0.7 : 1)));
    let r = this.rnd() * (w[0] + w[1] + w[2]);
    for (let l = 0; l < LANES; l++) { if ((r -= w[l]) < 0) return l; }
    return 1;
  }

  // Il direttore pianifica per istante di INGRESSO nella zona di tiro (40 m dalla linea), non di nascita né di arrivo: i lenti
  // nascono prima e i veloci dopo, così c'è sempre un nemico che entra a intervalli regolari e la densità segue il tratto in cui
  // arrivano (sforzo = fitto, recupero = rado).
  directorTick(dt) {
    let n = this.nextSpawn;
    if (!n) {
      const enEl = this.el + (this.lastEnter - this.gt); const segA = segAt(this.plan, enEl);
      // gli ultimi nemici entrano nei primi secondi del defaticamento (sparsi): l'orda si ritira all'inizio, ma fino ad allora c'è sempre qualcosa
      const cfg = DENSITY[segA.kind === 'cool' && enEl < this.total - COOL_S + 4 ? 'rest' : segA.kind]; if (!cfg) return;
      const comp = composAt(segA.wave); const alone = this.bossAlive; // con il Custode in strada solo qualche camminatore
      const k = (GAP_K[this.level.id] ?? 1) * (1 - 0.04 * this.weapon); /* più l'arma è forte, più nemici da falciare */ const [g0, g1] = (alone ? [3, 4] : cfg.gap).map((x) => x * k);
      const l1 = this.pickLane(); const batch = [{ type: alone ? 'zombie' : this.pickType(comp.mix), lane: l1, dz: 0 }];
      if (!alone && this.rnd() < cfg.pair) batch.push({ type: this.pickType(comp.mix), lane: this.pickLane(l1), dz: 1 + this.rnd() * 5 });
      n = this.nextSpawn = { batch, enter: this.lastEnter + g0 + this.rnd() * (g1 - g0) }; n.e0 = n.enter;
    }
    const travel = (SPAWN_Z - ZONE_D) / (V + ENEMIES[n.batch[0].type].speed);
    if (this.gt < n.enter - travel) return;
    if (this.tryAdd(n.batch)) { this.lastEnter = Math.max(this.gt + travel, n.enter); this.nextSpawn = null; } else { // troppo carico: slitta; dopo un po' il branco diventa un solo camminatore, e poi un camminatore nella corsia dove sei già (non costa un cambio)
      n.enter += 0.3; const slip = n.enter - n.e0;
      if (slip > 0.9 && (n.batch.length > 1 || n.batch[0].type !== 'zombie')) n.batch = [{ type: 'zombie', lane: n.batch[0].lane, dz: 0 }];
      if (slip > 1.5) n.batch[0].lane = this.lane;
    }
  }

  // la strada all'inizio non è vuota: il primo nemico arriva in 6 s (si vede dopo 2 s)
  prefill() {
    const at = (type, lane, sec) => { const d = ENEMIES[type]; const e = this.spawnEnemy(type, lane, this.z + LINE_D + sec * (V + d.speed)); this.laneLast = lane; };
    at('zombie', this.rnd() < 0.5 ? 0 : 2, 7.5); at('zombie', 1, 11.5); at('zombie', this.laneLast === 0 ? 2 : 0, 15); at('runner', 1, 16.5); this.lastEnter = 11.5;
  }

  // ---------- il piano: cambio di tratto, giudizio degli sforzi ----------
  enterSeg(i) {
    const prev = this.seg; const seg = this.plan.segs[i]; const first = this.segIdx < 0;
    if (!first) this.judge(prev);
    this.segIdx = i; this.seg = seg; seg.inT = 0; seg.okT = 0;
    const W = targetW(seg, this.ftp, this.level.k, this.el);
    const wc = (composId) => t(`games.horde.c.${composId}`);
    if (this.wk && seg.wave >= 1 && seg.wave <= this.plan.N && seg.wave !== prev?.wave && seg.kind !== 'pace') { this.ev('wave'); this.hudWave = seg.wave; }
    if (seg.kind === 'warm' && !first && prev?.kind === 'warm') { /* riscaldamento lungo spezzato in ondate: un solo annuncio */ }
    else if (seg.kind === 'warm') { this.say(t('games.horde.say.warm'), SEG_COLOR.warm, 3, true, 2, t('games.horde.say.warmSub')); }
    else if (seg.kind === 'pace') {
      const comp = composAt(seg.wave);
      this.say(t('games.horde.say.wave', { n: seg.wave, m: this.plan.N }), '#d9ff3d', 2.6, true, 3, t('games.horde.say.waveSub', { what: wc(comp.id), w: W }));
      this.ev('wave');
    } else if (seg.kind === 'effort') { this.say(t('games.horde.say.effort', { w: W }), SEG_COLOR.effort, 2.4, true, 3, t('games.horde.say.effortSub')); this.audio.sfx('go'); this.ev('segment'); this.maybeBoss(seg); }
    else if (seg.kind === 'sprint') { this.say(t('games.horde.say.sprint', { w: W }), SEG_COLOR.sprint, 2.4, true, 3, t('games.horde.say.sprintSub', { s: Math.round(seg.t1 - seg.t0) })); this.audio.sfx('alarm'); this.ev('segment'); this.maybeBoss(seg); }
    else if (seg.kind === 'rest') { this.say(t('games.horde.say.rest'), SEG_COLOR.rest, 2.4, true, 2, t('games.horde.say.restSub', { w: W })); this.ev('segment'); }
    else if (seg.kind === 'cool') { this.startCool(); }
  }

  // uno sforzo (o scatto) è riuscito se per il tempo giusto hai tenuto almeno il 92 % dei watt richiesti: l'arma sale di un livello
  judge(seg) {
    if (seg.kind !== 'effort' && seg.kind !== 'sprint') return;
    const need = Math.max(1, seg.t1 - seg.t0 - (seg.kind === 'sprint' ? 2 : 4));
    const ok = seg.okT / need >= (seg.kind === 'sprint' ? 0.5 : 0.65);
    this.effortsTotal++;
    if (ok) {
      this.effortsDone++; this.score += 300 * (1 + Math.floor(this.el / 60)); this.prog('sprintsWon', seg.kind === 'sprint' ? 1 : 0, 20);
      this.weaponUp(true);
    } else this.say(t('games.horde.effortKo'), '#ffb84d', 1.6, false, 1);
    this.ev(ok ? 'effortOk' : 'effortKo');
  }

  maybeBoss(seg) {
    if (!this.plan.bossWaves.includes(seg.wave) || this.bossSpawned.has(seg.wave)) return;
    this.bossSpawned.add(seg.wave);
    const sprint = this.plan.segs.find((s) => s.kind === 'sprint' && s.wave === seg.wave);
    // il Custode arriva in contatto verso metà dello scatto: parte (distanza ÷ velocità di avvicinamento − 8) secondi prima
    const approach = SPAWN_Z / (V + ENEMIES.keeper.speed);
    const at = sprint ? Math.max(seg.t0, sprint.t0 + 8 - approach) : seg.t0;
    this.bossAt = { t: at, wave: seg.wave, seg, sprint };
  }
  // sta al centro; la sua vita dipende dal danno di adesso: metà del tempo che ha per avvicinarsi, colpito nella sua corsia
  spawnBoss(b) {
    const approach = (BOSS_RANGE - LINE_D - 2.2) / (V + ENEMIES.keeper.speed);
    const hp = Math.max(24, Math.round({ easy: 0.4, normal: 0.5, hard: 0.6 }[this.level.id] * this.dps() * approach));
    const e = this.spawnEnemy('keeper', 1, this.z + SPAWN_Z, hp); e.hp = e.maxHp = hp;
    this.bossAlive = true; this.audio.sfx('alarm'); this.ev('boss');
    this.say(t('games.horde.waveBoss', { n: b.wave }), '#ff4d4d', 3, true, 3, t('games.horde.waveBossSub'));
  }

  startCool() {
    this.clearHorde(); this.ev('cool');
    this.finishResult();
    this.say(t('games.horde.say.cool'), SEG_COLOR.cool, 3, true, 3, t('games.horde.say.coolSub', { w: targetW(this.seg, this.ftp, 0) }));
    this.audio.sfx('win');
  }

  // l'orda si ritira (fine dell'allenamento vero): niente punti, solo nuvole di fumo
  clearHorde() {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.dead = true; e.deadT = 1.5; this.fx.spawn(e.x, 1, e.z, { tex: 'smoke', size: 2, life: 0.6, additive: false });
    }
    this.bossAlive = false;
  }

  finishResult() {
    const bossTotal = this.plan.bossWaves.length;
    // con un allenamento le stelle sono le stesse di tutti i giochi: tempo entro ±7 % del bersaglio (kit/workout-plan.js)
    const s = this.wk ? { stars: workoutStars(this.band.ratio, true), ratio: this.band.ratio } : heartStars({ hp: this.hp, lost: this.lost });
    const rec = this.record(); const prevBest = rec.score || 0;
    const newBest = this.score > prevBest;
    if (!this.wk && (newBest || (s.stars > (rec.stars || 0)))) { try { localStorage.setItem(this.recordKey(), JSON.stringify({ score: Math.max(prevBest, this.score), stars: Math.max(rec.stars || 0, s.stars) })); } catch { /* niente storage */ } }
    this.result = { ...s, done: this.effortsDone, total: this.effortsTotal, bossKilled: this.bossKilled, bossTotal, ko: this.ko, hp: this.hp, lost: this.lost, score: this.score, newBest, prevStars: rec.stars || 0, bestScore: Math.max(prevBest, this.score) };
    this.result.hint = this.wk ? null : heartHint(this.result);
    this.result.wk = !!this.wk; this.result.band = this.band.ratio;
    this.prog('races', 0, 40 + s.stars * 40 + this.effortsDone * 10);
    if (!this.wk) this.hooks.progress?.setMax('hordeStars', s.stars);
  }

  // ---------- aggiornamento ----------
  update(dt) {
    this.t += dt;
    const connected = this.hooks.connected(); const st = this.hooks.stats();
    const ftp = this.ftp;
    // senza rullo la demo simula 0,8 × FTP con scatti (e un po' meno nel recupero)
    const demo = !connected;
    const demoP = demo && this.wk && this.seg ? targetW(this.seg, ftp, 0, this.el) : demo ? ftp * (this.state === 'play' && this.seg?.kind === 'rest' ? 0.58 : 0.8) * (((this.t % 40) > 31 && this.seg?.kind !== 'rest') ? 1.6 : 1) : 0;
    this.power = connected ? st.power || 0 : demoP;
    this.cadence = connected ? st.cadence || 0 : 88;
    this.pw += (this.power - this.pw) * Math.min(1, dt / 1.2);
    if (this.audio.song) this.audio.setTempo(this.audio.song.bpm * clamp((this.cadence || 85) / 88, 0.85, 1.25));
    this.msgs.update(dt);
    if (this.state === 'loading') { this.menu.update(dt, { connected: false, power: 0 }); }
    if (this.state === 'loading' || this.state === 'error') return;
    this.fx.update(dt);
    this.stateT += dt;
    if (this.state === 'menu') { this.menuTick(dt, connected); this.animateIdle(dt); return; }
    if (this.state === 'results') { this.results.update(dt); this.animateIdle(dt); return; }

    // con un allenamento il tempo è quello dell'allenamento (anche se in pausa); finito lui, finisce la partita
    if (this.wk) { this.el = this.wc.tick(dt); if (this.wc.ended) return this.finish(); }
    // pausa: chi smette di pedalare non perde, il tempo si ferma
    if (connected) {
      if (this.power < 12) { this.pauseT += dt; if (this.pauseT > 2.5 && !this.paused) { this.paused = true; this.audio.sfx('beep'); } } else if (this.power > 25) { this.pauseT = 0; this.paused = false; }
    }
    if (this.paused) { this.player.pose(dt, 0, 8); this.camera(dt); return; }

    if (!this.wk) this.el += dt;
    // il tratto dell'allenamento
    let seg = segAt(this.plan, this.el);
    const idx = this.plan.segs.indexOf(seg);
    if (idx !== this.segIdx) { this.enterSeg(idx); seg = this.seg; }
    if (this.el >= this.total) return this.finish();
    const tgt = this.erg(targetW(seg, ftp, this.level.k, this.el)); // il rullo va in ERG su questo bersaglio (con intensità a mano o dell'allenamento)
    seg.inT += dt;
    if (this.wk) this.band.add(dt, this.pw, tgt, this.el - seg.stepStart);
    if ((seg.kind === 'effort' || seg.kind === 'sprint') && seg.inT > (seg.kind === 'sprint' ? 2 : 4) && this.pw >= 0.92 * tgt) seg.okT += dt;
    this.inTarget = this.pw >= 0.92 * tgt;
    this.tgtW = tgt;
    // scatto riuscito: OVERDRIVE (colpi doppi che trapassano) finché tieni i watt
    const odOn = seg.kind === 'sprint' && this.pw >= 0.9 * tgt;
    if (odOn && this.overdrive <= 0) { this.audio.sfx('overdrive'); this.audio.transpose = 2; this.prog('overdrives', 1, 15); this.ev('overdrive'); }
    if (!odOn && this.overdrive > 0 && this.audio.transpose) this.audio.transpose = 0;
    this.overdrive = odOn ? 1 : 0; this.sprinting = odOn;
    if (this.bossAt && this.el >= this.bossAt.t) { const b = this.bossAt; this.bossAt = null; this.spawnBoss(b); }

    // avanzamento: velocità di scorrimento fissa, così i tempi degli eventi non dipendono dalla velocità del rullo
    this.z += V * dt;
    this.x = lerp(this.x, this.tx, 1 - Math.exp(-dt * 24)); // un cambio di corsia dura circa 0,15 s
    this.shake = Math.max(0, this.shake - dt); this.hurtT = Math.max(0, this.hurtT - dt); this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dt);
    this.beamK = Math.max(0, this.beamK - dt * 8);

    this.gt += dt;
    this.directorTick(dt);
    // portali: una coppia ogni 18–25 s, mai in uno scatto né con il Custode vivo; una cassa ogni 30–45 s, solo in recupero e passo
    const arr = segAt(this.plan, this.el + GATE_Z / V).kind; // il tratto in cui arriverebbero
    const quiet = arr !== 'cool' && arr !== 'sprint' && seg.kind !== 'sprint' && !this.bossAlive && !this.bossAt;
    if (quiet) { this.nextGate -= dt; if (this.nextGate <= 0) { this.spawnGatePair(this.z + GATE_Z); this.nextGate = 18 + this.rnd() * 7; } }
    if ((arr === 'rest' || arr === 'pace') && quiet) { this.nextPick -= dt; if (this.nextPick <= 0 && this.spawnPick(this.z + GATE_Z)) this.nextPick = 30 + this.rnd() * 15; }

    this.updateShooters(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateGates(dt);
    this.updateThreat();
    this.animate(dt);
  }

  menuTick(dt, connected) { this.menu.update(dt, { connected, power: this.power }); }

  finish() {
    if (!this.result) this.finishResult();
    this.state = 'results'; this.stateT = 0; this.finished = true;
    this.audio.stopSong(); this.audio.sfx('win'); this.results.reset();
    this.hooks.runEnd?.({ game: 'horde', score: this.score });
    this.hooks.setTarget?.(Math.round(this.ftp * 0.5)); // a fine partita il rullo scende su un facile (con un allenamento comanda lui)
  }

  // ---------- portali e casse: ogni coppia è una scelta vera, in due delle tre corsie ----------
  initPortal() {
    const info = prepareModel(this.m.portal); const b = info.box; const w = b.max.x - b.min.x; const d = b.max.z - b.min.z;
    const cx = (b.min.x + b.max.x) / 2; const cz = (b.min.z + b.max.z) / 2;
    if (!info.dressed) { for (const p of info.parts) p.geo.translate(-cx, -b.min.y, -cz); info.dressed = true; }
    this.portal = { info, wide: Math.max(w, d), turn: w < d ? Math.PI / 2 : 0, height: info.height };
    this.portalMats = info.parts.map((pt) => toonMaterial({ map: pt.mat === 'vc' ? null : pt.mat, vertexColors: pt.mat === 'vc' }));
    // casse (generate per il progetto, nessun asset): bomba nera con miccia, cuore rosa
    const hs = new THREE.Shape(); hs.moveTo(0, -0.55); hs.bezierCurveTo(-1.0, 0.1, -0.55, 0.85, 0, 0.35); hs.bezierCurveTo(0.55, 0.85, 1.0, 0.1, 0, -0.55);
    this.pickGeo = { heart: new THREE.ExtrudeGeometry(hs, { depth: 0.35, bevelEnabled: false }), bomb: new THREE.SphereGeometry(0.62, 16, 12), fuse: new THREE.CylinderGeometry(0.07, 0.07, 0.4, 6), ring: new THREE.RingGeometry(0.9, 1.25, 28) };
    this.pickMat = { heart: new THREE.MeshLambertMaterial({ color: '#ff4d8a', emissive: '#7a1034' }), bomb: new THREE.MeshLambertMaterial({ color: '#2a2a33', emissive: '#14141a' }), fuse: new THREE.MeshBasicMaterial({ color: '#ffb84d' }) };
  }

  // quali scelte si possono offrire adesso (il cuore solo se ne manca uno)
  gateOptions() {
    const o = [];
    if (this.allies.length < 2) o.push(G.ally); else if (this.allyBoost < ALLY_RATE.length - 1) o.push(G.allyUp);
    if (this.weapon < TOP) o.push(G.weapon);
    if (this.rateMul < 1.8) o.push(G.rate);
    if (this.hp < this.maxHp) o.push(G.life);
    for (const d of [G.weapon, G.rate]) if (o.length < 2 && !o.includes(d)) o.push(d); // tutto al massimo: restano arma (danno) e cadenza
    return o;
  }

  spawnGatePair(z) {
    // le due scelte ruotano: quella offerta meno di recente passa avanti; la terza corsia resta libera
    const opts = this.gateOptions().map((d) => [d, this.rnd()]).sort((a, b) => (this.lastKinds[a[0].kind] ?? -1) - (this.lastKinds[b[0].kind] ?? -1) || a[1] - b[1]).slice(0, 2).map((x) => x[0]);
    const near = this.picks.find((p) => !p.used && Math.abs(p.z - z) < 30);
    const free = near ? near.lane : Math.floor(this.rnd() * LANES);
    const lanes = [0, 1, 2].filter((l) => l !== free); if (this.rnd() < 0.5) lanes.reverse();
    this.gateN++;
    const P = this.portal; const width = LANE_W * 0.9; const s = width / P.wide; const sy = Math.min(s, 3.8 / P.height);
    opts.forEach((def, i) => {
      const lane = lanes[i]; const x = laneX(lane);
      this.lastKinds[def.kind] = this.gateN;
      const group = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.4, 2.9), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      panel.position.y = 1.7; panel.userData.own = true; group.add(panel);
      const frame = new THREE.Group();
      P.info.parts.forEach((pt, j) => { frame.add(new THREE.Mesh(pt.geo, this.portalMats[j])); });
      frame.rotation.y = P.turn; frame.scale.set(s, sy, s); group.add(frame);
      // what the portal gives is written in the HUD, above the arch, at a size that never changes with the distance (see drawHud)
      group.position.set(x, 0, z);
      this.stage.scene.add(group);
      this.gates.push({ def, lane, x, z, group, used: false, pair: this.gateN, panel });
    });
  }

  // una cassa in una corsia libera: bomba o cuore (il cuore solo se ne manca uno)
  spawnPick(z) {
    if (this.gates.some((g) => !g.used && Math.abs(g.z - z) < 36)) return false; // una coppia di portali è appena comparsa o sta per arrivare: le scelte non si accavallano
    const busy = new Set(this.gates.filter((g) => !g.used && Math.abs(g.z - z) < 40).map((g) => g.lane));
    const lanes = [0, 1, 2].filter((l) => !busy.has(l)); if (!lanes.length) return false;
    const lane = lanes[Math.floor(this.rnd() * lanes.length)];
    const kind = this.hp < this.maxHp && this.rnd() < 0.7 ? 'heart' : 'bomb'; const def = PICKS[kind];
    const group = new THREE.Group(); const body = new THREE.Group();
    const mesh = new THREE.Mesh(this.pickGeo[kind], this.pickMat[kind]);
    if (kind === 'heart') { mesh.position.z = -0.17; mesh.scale.setScalar(0.9); body.add(mesh); } else {
      body.add(mesh); const fuse = new THREE.Mesh(this.pickGeo.fuse, this.pickMat.fuse); fuse.position.set(0.15, 0.78, 0); fuse.rotation.z = -0.5; body.add(fuse);
    }
    body.position.y = 1.3; group.add(body);
    const ring = new THREE.Mesh(this.pickGeo.ring, new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; ring.userData.ownMat = true; group.add(ring);
    group.position.set(laneX(lane), 0, z); this.stage.scene.add(group);
    this.picks.push({ def, lane, x: laneX(lane), z, group, body, ring, used: false, t: this.rnd() * 6 });
    return true;
  }

  takePick(p) {
    if (p.def.kind === 'bomb') this.bomb(); else { this.hp = Math.min(this.maxHp, this.hp + 1); this.audio.sfx('rescue'); this.say(t('games.horde.pick.heartSay'), '#ff7ab6', 1.4, true); }
  }

  // la bomba spazza la strada: ogni nemico tranne il Custode
  bomb() {
    this.audio.sfx('bomb'); this.shake = 0.8; this.bombFlash = 0.4;
    this.fx.explode(this.x, 1.5, this.z + 6, 4);
    for (const e of this.enemies) if (!e.dead && !e.def.boss) this.damage(e, 9999);
    this.say(t('games.horde.pick.bombSay'), '#ffb84d', 1.6, true);
    // la strada si riempie subito dopo: due corridori emergono dalla nebbia (a 50–70 m) così non resta mai vuota
    const at = (type, lane, sec) => { const e = this.spawnEnemy(type, lane, this.z + LINE_D + sec * (V + ENEMIES[type].speed)); e.age = 0; this.fx.spawn(e.x, 1, e.z, { tex: 'smoke', size: 2.4, life: 0.5, additive: false }); };
    const l = this.pickLane(); at('runner', l, 6.5); at('runner', this.pickLane(l), 9.2);
    this.lastEnter = this.gt + 7; this.nextSpawn = null;
  }

  updateGates(dt) {
    for (const list of [this.gates, this.picks]) {
      for (const g of list) {
        if (!g.seen && g.z - this.z < 45) { g.seen = true; this.ev('portal'); }
        if (g.used || this.z < g.z) continue;
        g.used = true;
        // si prende solo passandoci nella corsia: l'altro della coppia svanisce
        if (this.lane === g.lane) {
          if (g.def.apply) { g.def.apply(this); this.say(t(g.def.text), g.def.color, 1.6, true); } else this.takePick(g);
          if (g.def.apply) this.audio.sfx('rescue');
          this.ev('gate'); this.fx.spawn(g.x, 2.2, g.z + 1, { tex: 'blue', size: 1.6, life: 0.35 });
          g.taken = true; if (!g.panel) g.group.visible = false;
        } else g.fade = 0.01;
      }
      // il portale scelto resta fino a quando è dietro la telecamera; l'altro si spegne piano (niente sparizioni di colpo)
      for (const g of list) {
        if (g.fade !== undefined) { g.fade = Math.min(1, g.fade + dt / 0.5); if (g.panel) g.panel.material.opacity *= 1 - g.fade; g.group.scale.setScalar(1 - 0.15 * g.fade); if (g.fade >= 1) g.group.visible = false; }
        else if (g.taken && g.panel) g.panel.material.opacity = Math.max(0, g.panel.material.opacity - dt * 4);
      }
    }
    this.gates = this.gates.filter((g) => { if (g.z < this.z - 12) { this.dropItem(g, this.stage.scene); return false; } return true; });
    this.picks = this.picks.filter((g) => { if (g.z < this.z - 12) { this.dropItem(g, this.stage.scene); return false; } return true; });
  }

  // un portale possiede il suo pannello (geometria e materiale), una cassa l'anello: le parti dell'arco e le forme delle casse sono condivise
  dropItem(g, scene) {
    scene.remove(g.group);
    g.group.traverse((o) => { if (o.userData.own) { o.geometry.dispose(); o.material.dispose(); } else if (o.userData.ownMat) o.material.dispose(); });
  }

  // ---------- armi: ognuno spara solo lungo la propria corsia ----------
  shooters() {
    const out = [{ lane: this.lane, x: this.x, z: this.z, self: true, mul: 1, holder: this }];
    for (const a of this.allies) out.push({ lane: this.allyLane(a) ?? this.lane, x: a.x, z: a.z, ally: a, mul: ALLY_RATE[this.allyBoost], holder: a });
    return out;
  }

  // il nemico più vicino nella corsia (e davanti); se non c'è, il Custode a tiro, da qualunque corsia
  laneTarget(lane, z) {
    let best = null; let bz = FIRE_RANGE;
    for (const e of this.enemies) {
      if (e.dead || e.def.boss || e.lane !== lane || e.z < z - 1) continue;
      const d = e.z - z; if (d < bz) { bz = d; best = e; }
    }
    if (best) return best;
    return this.enemies.find((e) => e.def.boss && !e.dead && e.z > z && e.z - z < BOSS_RANGE) || null;
  }

  updateShooters(dt) {
    const w = WEAPONS[this.weapon];
    const od = this.overdrive > 0;
    this.fireRate = w.rate * this.rateMul * (od ? 1.3 : 1);
    for (const s of this.shooters()) {
      const h = s.holder;
      h.fireT = (h.fireT || 0) - dt;
      if (h.fireT > 0) continue;
      const target = this.laneTarget(s.lane, s.z);
      if (!target) { h.fireT = 0.08; continue; }
      h.fireT = 1 / (this.fireRate * s.mul);
      if (s.self) this.beamK = 1;
      if (this.bullets.length >= MAX_BULLETS) { this.hitscan(target, w, od, s.lane); continue; } // troppi colpi in volo (costano disegni): il danno arriva subito, senza la scia
      const lx = laneX(s.lane);
      for (let k = 0; k < w.shots; k++) {
        const mesh = this.bulletPool.get();
        mesh.glow.material.color.set(od ? '#4de3ff' : w.color);
        // forma per tipo d'arma: razzi corti e grossi, laser lunghi e sottili, raffiche medie
        if (w.splash) mesh.shape(1.8, 0.5); else if (w.speed >= 70) mesh.shape(4.5, 0.2); else if (w.rate > 6) mesh.shape(2.4, 0.2); else mesh.shape(2.2, 0.24 * (od ? 1.4 : 1));
        mesh.rotation.set(0, 0, 0);
        mesh.position.set(lx + (w.shots > 1 ? (k - (w.shots - 1) / 2) * 0.32 : 0), 1.5, s.z + 1.6);
        this.bullets.push({ mesh, lane: s.lane, vz: w.speed, life: clamp(34 / w.speed, 0.5, 1.4), dmg: w.dmg * this.dmgMul * (od ? 2 : 1), splash: w.splash, pierce: od ? 99 : (w.pierce || 1), hits: null });
        mesh.core.visible = s.self && w.rate <= 6; // il nucleo bianco solo per i colpi lenti del giocatore: meno disegni
      }
      // vampata alla bocca dell'arma (per gli alleati solo ogni tanto)
      if (s.self || this.rnd() < 0.4) this.fx.spawn(lx, 1.5, s.z + 1.3, { tex: w.splash ? 'fire' : 'muzzle', size: w.splash ? 1.1 : 0.8, life: 0.08, grow: 0.6, color: od ? '#9eeeff' : null });
      if (s.self) this.audio.sfx(w.splash ? 'rocket' : w.rate > 6 ? 'mg' : w.pierce ? 'laser' : 'shot');
      else if (this.rnd() < 0.35) s.ally.r.root.userData.kick = 0.1;
    }
  }

  hitscan(target, w, od, lane) {
    const dmg = w.dmg * this.dmgMul * (od ? 2 : 1) * w.shots;
    if (w.splash) this.splashAt(lane, target.z, w.splash, dmg); else this.damage(target, dmg * (target.def.boss && target.lane !== lane ? BOSS_OFF : 1));
  }

  // danno ad area: pieno nella corsia, un po' nelle corsie accanto
  splashAt(lane, z, r, dmg) {
    this.fx.explode(laneX(lane), 1, z, r / 3);
    this.audio.sfx('boom'); this.shake = Math.max(this.shake, 0.12);
    for (const o of this.enemies) {
      if (o.dead || Math.abs(o.z - z) > r) continue;
      const dl = Math.abs(o.lane - lane);
      const m = o.def.boss ? (dl === 0 ? 1 : BOSS_OFF) : dl === 0 ? 1 : dl === 1 ? SPLASH_ADJ : 0;
      if (m) this.damage(o, dmg * m);
    }
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      const z0 = b.mesh.position.z; b.mesh.position.z += b.vz * dt; b.life -= dt;
      const z1 = b.mesh.position.z;
      // colpisce i nemici della sua corsia (il Custode da qualunque corsia) che incontra fra z0 e z1, dal più vicino
      const hit = [];
      for (const e of this.enemies) {
        if (e.dead || (b.hits && b.hits.has(e)) || (e.lane !== b.lane && !e.def.boss)) continue;
        const rad = e.def.rad;
        if (e.z + rad + 0.3 >= z0 && e.z - rad - 0.3 <= z1) hit.push(e);
      }
      if (hit.length > 1) hit.sort((p, q) => p.z - q.z);
      for (const e of hit) {
        if (b.splash) this.splashAt(b.lane, e.z, b.splash, b.dmg);
        else {
          this.damage(e, b.dmg * (e.def.boss && e.lane !== b.lane ? BOSS_OFF : 1));
          const bx = laneX(b.lane);
          this.fx.spawn(bx, 1.3, e.z, { tex: 'spark', size: 1.0, life: 0.09, grow: 1 });
          for (let q = 0; q < 2; q++) this.fx.spawn(bx, 1.3, e.z, { tex: 'spark', size: 0.22, life: 0.25, vx: (this.rnd() - 0.5) * 6, vy: 2 + this.rnd() * 3, vz: -b.vz * 0.08 + (this.rnd() - 0.5) * 3, grow: 0 });
        }
        (b.hits = b.hits || new Set()).add(e);
        if (--b.pierce <= 0) { b.life = 0; break; }
      }
      if (b.life <= 0) b.mesh.visible = false;
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  damage(e, n) {
    if (e.dead) return;
    e.hp -= n; e.flash = 0.08; if (e.w) e.w.hit = 1;
    if (e.hp > 0) {
      // lo scheletro fa un passo di lato nella corsia accanto al primo colpo: bisogna seguirlo
      if (e.def.dodge && !e.dodged) { e.dodged = true; e.lane = e.lane === 1 ? (this.rnd() < 0.5 ? 0 : 2) : 1; e.dodgeT = 0.4; }
      return;
    }
    e.dead = true; e.deadT = 0;
    if (!e.w) { e.deadT = 1.5; this.fx.spawn(e.x, 1, e.z, { tex: 'smoke', size: 2, life: 0.5, additive: false }); } // lontano: sparisce in una nuvola
    this.kills++; this.ev('kill'); this.score += Math.round(e.def.score * (1 + this.el / 120));
    this.prog('kills', 1, e.def.boss ? 200 : 1);
    if (e.def.boss) {
      this.bossAlive = false; this.fx.explode(e.x, 2.5, e.z, 2.5); this.shake = 0.8; this.bossKilled++;
      this.audio.sfx('win'); this.say(t('games.horde.bossDown'), '#d9ff3d', 2.6, true, 3); this.prog('bosses', 1, 150);
      this.addAlly();
    }
  }

  // un nemico ha raggiunto la linea: costa un cuore, in qualunque corsia sia, e sparisce con un colpo ben visibile
  takeHit(e) {
    this.hp -= 1; this.lost++; this.hurtT = 0.6; this.hurtFlash = HURT_FLASH_S; this.shake = 0.4; this.audio.sfx('hurt'); this.ev('hit');
    this.pop('−1 ♥', '#ff4d6d', 1);
    this.fx.explode(laneX(e.lane), 1.2, this.z + 1.6, 1.2);
    if (navigator.vibrate) navigator.vibrate(90);
    e.dead = true; e.deadT = 1.1; if (e.w) { e.w.lungeDur = 0.3; e.w.lunge = 0.3; }
    if (e.def.boss) { this.bossAlive = false; this.say(t('games.horde.bossLeft'), '#ffb84d', 2, false, 2); }
    if (this.hp <= 0) { if (this.el >= 60) this.knockOut(); else this.hp = 1; }
  }

  // il giocatore cade: l'orda si ritira un po', ti rialzi con quattro cuori. Mai game over.
  knockOut() {
    this.ko++; this.ev('ko');
    this.hp = 4; this.hurtT = 2.6; this.hurtFlash = HURT_FLASH_S; this.lastEnter = Math.max(this.lastEnter, this.gt + 4); this.nextSpawn = null; this.shake = 0.7;
    this.audio.sfx('boom');
    this.fx.explode(this.x, 1.5, this.z + 2, 2.2);
    for (const e of this.enemies) if (!e.dead && !e.def.boss && e.z - this.z < 26) this.damage(e, 999);
    this.say(t('games.horde.ko'), '#ff6b6b', 2.4, true, 3, t('games.horde.koSub'));
  }

  updateEnemies(dt) {
    for (const c of Object.values(this.far)) c.begin();
    // i più vicini (fino al tetto della qualità) hanno le ossa; gli altri sono istanze in posa cotta
    const cand = [];
    for (const e of this.enemies) if (!e.dead && e.z - this.z < NEAR && e.z - this.z > -8) cand.push(e);
    cand.sort((a, b) => a.z - b.z);
    const animated = new Set(cand.slice(0, this.animCap));
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (animated.has(e) || e.def.boss) { if (!e.w) this.wake(e); } else if (e.w && e.z - this.z > NEAR * 0.7) this.sleep(e);
    }
    for (const e of this.enemies) {
      if (e.dead) {
        e.deadT += dt;
        if (e.w) {
          e.w.update(dt, e.def.style, 0, { dying: true });
          if (e.deadT > 0.9) e.w.root.position.y -= dt * 1.5;
        }
        continue;
      }
      // scendono la propria corsia verso di te; il cambio di corsia (scheletro, Custode) è uno scivolamento rapido
      e.z -= e.def.speed * dt;
      const d = e.z - this.z;
      if (e.def.boss) while (e.bossStep < 3 && d < [34, 24, 14][e.bossStep]) { e.bossStep++; e.lane = [0, 1, 2].filter((l) => l !== e.lane)[Math.floor(this.rnd() * 2)]; this.ev('bossMove'); }
      const want = laneX(e.lane) + e.off; const gap = want - e.x;
      e.x += gap * (1 - Math.exp(-dt * (e.dodgeT > 0 ? 18 : e.def.boss ? 3 : 7)));
      e.dodgeT = Math.max(0, e.dodgeT - dt);
      e.wob += dt; e.flash = Math.max(0, e.flash - dt); e.age += dt;
      const grow = Math.min(1, 0.25 + e.age * 1.5); // chi emerge dalla nebbia dopo una bomba cresce in mezzo secondo
      if (!e.seen && d < (e.def.boss ? BOSS_RANGE : ZONE_D)) { e.seen = true; this.ev('enemy'); } // entra nella zona dove si può colpire (i colpi che trapassano arrivano a 40 m)
      const lean = Math.abs(gap) > 0.4 ? Math.sign(gap) * 0.3 : 0;
      if (e.w) {
        e.w.update(dt, e.def.style, e.def.speed);
        e.w.root.position.set(e.x, 0, e.z);
        e.w.root.rotation.y = Math.PI + clamp(gap * 0.1, -0.3, 0.3) + Math.sin(e.wob * 1.3) * 0.06;
        e.w.pivot.rotation.z = lerp(e.w.pivot.rotation.z, lean, Math.min(1, dt * 14));
        e.w.inner.scale.setScalar(this.kits[e.type].scale * e.sc * grow * (e.flash > 0 ? 1.08 : 1));
      } else if (d < this.farRange) this.far[e.type]?.add(e.x, 0, e.z, Math.PI + Math.sin(e.wob * 1.3) * 0.1, e.sc * grow, e.shade);
      if (e.def.boss && e.w) { e.atk -= dt; if (e.atk <= 0 && d < 9) { e.atk = 1.8; e.w.lungeDur = 0.6; e.w.lunge = 0.6; } }
      // alla linea: un cuore (il Custode si ferma un po' prima, è enorme)
      if (d < (e.def.boss ? LINE_D + 2.2 : LINE_D)) this.takeHit(e);
    }
    this.enemies = this.enemies.filter((e) => {
      if (e.dead && e.deadT > 1.6) { this.sleep(e); return false; }
      return true;
    });
    for (const c of Object.values(this.far)) c.end();
  }

  // ---------- minaccia: quanto manca al primo arrivo in ogni corsia ----------
  updateThreat() {
    const T = [Infinity, Infinity, Infinity];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ta = Math.max(0, (e.z - this.z - (e.def.boss ? LINE_D + 2.2 : LINE_D)) / (V + e.def.speed));
      if (ta < T[e.lane]) T[e.lane] = ta;
    }
    this.threatT = T;
    for (let l = 0; l < LANES; l++) {
      const w = T[l] <= WARN_S;
      if (w && !this.warnPrev[l] && this.t - this.warnT > 0.7) { this.audio.sfx('warn'); this.warnT = this.t; }
      this.warnPrev[l] = w;
    }
  }
  // la corsia del nemico che arriva prima (−1 se la strada è vuota): è quella dove andare
  threatLane() {
    let best = -1; let bt = Infinity;
    for (let l = 0; l < LANES; l++) if (this.threatT[l] < bt) { bt = this.threatT[l]; best = l; }
    return best;
  }

  animate(dt) {
    const cad = this.cadence || 85;
    this.frame++;
    const steer = (this.tx - this.x);
    this.player.root.position.set(this.x, 0, this.z);
    this.player.root.rotation.set(0, clamp(-steer * 0.08, -0.4, 0.4), 0);
    this.player.lean.rotation.z = clamp(steer * 0.05, -0.3, 0.3);
    this.player.pose(dt, cad, 8, { stand: this.sprinting || this.seg?.kind === 'sprint' ? 1 : 0 });
    this.player.root.visible = !(this.hurtT > 0 && Math.floor(this.hurtT * 12) % 2);
    // la striscia della corsia dove stai sparando
    this.beam.position.set(this.x, 0.05, this.z + FIRE_RANGE / 2 + 1); this.beam.material.opacity = 0.07 + 0.11 * this.beamK; this.beam.visible = true;
    // gli alleati stanno nelle corsie accanto (sul bordo della strada quello esterno resta dietro); si pongono a turno: le pose sulle ossa costano
    this.allies.forEach((a, i) => {
      const al = this.allyLane(a); const k = 1 - Math.exp(-dt * 14);
      const wantX = al == null ? this.x + a.side * 1.4 : laneX(al); const wantDz = al == null ? -2.4 : 1.2;
      a.x = lerp(a.x, wantX, k); a.dz = lerp(a.dz ?? 1.5, wantDz, 1 - Math.exp(-dt * 8)); a.z = this.z + a.dz;
      a.born = Math.min(1, a.born + dt / 0.4); a.r.root.scale.setScalar(RIDER_S * (0.2 + 0.8 * (1 - (1 - a.born) ** 2)));
      a.r.root.position.set(a.x, 0, a.z);
      a.r.root.rotation.y = clamp((wantX - a.x) * -0.1, -0.3, 0.3);
      a.acc = (a.acc || 0) + dt;
      if ((this.frame + i) % 2 === 0) { a.r.pose(a.acc, cad, 8, { stand: this.sprinting ? 1 : 0 }); a.acc = 0; }
    });
    for (const g of this.gates) if (!g.used) g.panel.material.opacity = 0.12 + Math.sin(this.t * 6) * 0.03;
    for (const p of this.picks) { p.t += dt; p.body.rotation.y += dt * 2.5; p.body.position.y = 1.3 + Math.sin(p.t * 3) * 0.15; p.ring.material.opacity = 0.4 + Math.sin(p.t * 5) * 0.15; }
    this.world(dt);
    this.camera(dt);
  }

  // scenografia, luci e cielo che seguono il giocatore
  world() {
    this.scenery.update(this.z);
    this.ground.follow(this.z);
    this.lamps.update(this.scenery.lamps, this.z);
  }

  animateIdle(dt) {
    if (!this.player) return;
    // menu e fine: il ciclista pedala fermo, l'orda aspetta in fondo alla strada
    this.player.root.position.set(this.x, 0, this.z);
    if (this.beam) this.beam.visible = false;
    this.player.pose(dt, 70, 5);
    for (const c of Object.values(this.far)) c.begin();
    for (const e of this.enemies) if (!e.dead && e.z - this.z < this.farRange && !e.w) this.far[e.type]?.add(e.x, 0, e.z, Math.PI, e.sc, e.shade);
    for (const c of Object.values(this.far)) c.end();
    this.world(dt);
    this.camera(dt);
  }

  // telecamera alta e indietro: il ciclista è una figura piccola (8–12 % dell'altezza dello schermo) e si legge l'orda che arriva
  camera(dt) {
    const cam = this.stage.camera;
    const sx = this.shake > 0 ? (this.rnd() - 0.5) * this.shake * 0.6 : 0;
    const sy = this.shake > 0 ? (this.rnd() - 0.5) * this.shake * 0.3 : 0;
    const target = new THREE.Vector3(this.x * 0.9 + sx, CAM_Y + sy, this.z - CAM_BACK);
    if (!this.camInit) { cam.position.copy(target); this.camInit = true; }
    cam.position.lerp(target, 1 - Math.exp(-dt * 6));
    // solo nel menu: il ciclista sta nella fascia libera (verticale: tra testo e tasto; orizzontale: a destra della colonna di testo)
    const { W, H } = this.stage; const m = this.menu; const menuOn = this.state === 'menu' && m.contentBottom;
    const wantX = menuOn && W > H * 1.15 ? -1.3 : 0; const wantY = menuOn && W <= H * 1.15 ? 0.55 : 0;
    this.menuOffX = lerp(this.menuOffX || 0, wantX, 1 - Math.exp(-dt * 4)); this.menuOffY = lerp(this.menuOffY || 0, wantY, 1 - Math.exp(-dt * 4));
    cam.lookAt(this.x * 0.9 + this.menuOffX, 0.6 + this.menuOffY, this.z + CAM_LOOK);
    // su un telefono in verticale il campo è stretto: più ampio, così le tre corsie ci stanno sempre
    const wantFov = (W < H * 0.8 ? 70 : 60) + (this.overdrive > 0 ? 4 : 0);
    this.fov = lerp(this.fov, wantFov, 1 - Math.exp(-dt * 5));
    cam.fov = this.fov; cam.far = 520; cam.updateProjectionMatrix();
    this.sky.follow(cam, this.x, this.z);
  }

  // la striscia comune dell'allenamento: con un allenamento i suoi passi, senza il piano della partita (stessi campi)
  stripInfo() { return stripFromPlan(this.plan, { el: this.el, ftp: this.ftp, target: this.tgtW || targetW(this.seg, this.ftp, this.level.k, this.el), bias: this.hooks.bias?.() ?? 1, targetWfn: (g) => targetW(g, this.ftp, this.level.k) }); }
  // ERG: il bersaglio del gioco va al rullo; restituisce i watt davvero richiesti
  erg(w) { return this.hooks.setTarget ? Math.round(this.hooks.setTarget(w)) : w; }
  // ---------- interfaccia ----------
  // in alto: punteggio · ondata n/N · cuori; sotto, la striscia dell'allenamento. In basso la potenza con il numero grande e il bersaglio,
  // a destra l'arma con i suoi livelli. Tutto con kit/hud.js: leggibile da 1 m, senza sovrapposizioni.
  drawHud(dt) {
    const { ctx, W, H } = this.stage;
    ctx.clearRect(0, 0, W, H); hudView(ctx, W, H);
    if (this.state === 'loading') { ctx.fillStyle = '#0f0e0c'; ctx.fillRect(0, 0, W, H); this.menu.loadFrac = this.loadPct || 0; this.menu.draw(ctx, W, H, { connected: false }); return; }
    if (this.state === 'error') { hudText(ctx, t('ui.error', { error: this.error }), W / 2, H / 2, { size: 14, align: 'center', color: '#ff6b6b' }); return; }
    if (this.state === 'menu') { this.drawMenu(ctx, W, H, dt); return; }
    if (this.state === 'results' && this.result) { this.drawOver(ctx, W, H, dt); return; }
    const w = WEAPONS[this.weapon]; const seg = this.seg;
    const pad = 12; const y0 = stripBottom(W, H) + 22; // sotto la striscia dell'allenamento (kit/workout-strip.js), che sta sotto la barra del gioco
    drawWorkoutStrip(ctx, W, H, this.stripInfo());
    // riga in alto
    ctx.fillStyle = 'rgba(8,10,26,.62)'; rrect(ctx, pad - 4, y0 - 22, W - 2 * pad + 8, 36, 10); ctx.fill();
    hudText(ctx, String(this.score), pad + 6, y0 + 5, { size: 26, maxW: 100 });
    // warm-up and cool-down are already named in the workout strip right above: here only the wave count
    const wn = seg.kind === 'warm' || seg.kind === 'cool' ? '' : t('games.horde.waveOf', { n: seg.wave, m: this.plan.N });
    if (wn) hudText(ctx, wn, W / 2, y0 + 3, { size: W < 400 ? 19 : 22, align: 'center', color: '#d9ff3d', maxW: W - 2 * (pad + 100) });
    let hx = W - pad - 4 - (this.maxHp - 1) * 18;
    for (let i = 0; i < this.maxHp; i++) { hudText(ctx, i < this.hp ? '♥' : '♡', hx + i * 18, y0 + 4, { size: 21, color: i < this.hp ? '#ff4d6d' : '#7a7a99', align: 'center' }); }
    const tw = this.tgtW || targetW(seg, this.ftp, this.level.k, this.el); const ty = y0 + 8;
    // vita del Custode
    const boss = this.enemies.find((e) => e.def.boss && !e.dead);
    let nextY = ty + 24;
    if (boss) {
      const bw = W - 2 * pad - 8; const bY = ty + 12;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; rrect(ctx, pad + 4, bY, bw, 18, 7); ctx.fill();
      ctx.fillStyle = '#ff3b3b'; rrect(ctx, pad + 4, bY, Math.max(6, bw * clamp(boss.hp / boss.maxHp, 0, 1)), 18, 7); ctx.fill();
      hudText(ctx, t('games.horde.boss'), W / 2, bY + 15, { size: 14, align: 'center' }); nextY = bY + 40;
    }
    if (!this.hooks.connected()) hudText(ctx, t('games.common.demo'), W / 2, nextY + 4, { size: 13, align: 'center', color: '#ffd34d' });

    // l'avviso di minaccia sta sulla strada, in fondo alla corsia che sta per essere raggiunta
    this.drawThreat(ctx, W, H);

    // in basso: potenza (numero grande + barra con il bersaglio) e, a destra, il nome dell'arma con i suoi livelli
    const bh = 22; const barY = H - 16 - bh; const bx = pad + 2; const bw2 = W - 2 * pad - 4;
    const gr = ctx.createLinearGradient(0, H - 128, 0, H); gr.addColorStop(0, 'rgba(6,8,22,0)'); gr.addColorStop(0.35, 'rgba(6,8,22,.55)'); gr.addColorStop(1, 'rgba(6,8,22,.82)');
    ctx.fillStyle = gr; ctx.fillRect(0, H - 128, W, 128);
    const big = W < 500 ? 56 : 64;
    const pc = this.sprinting ? '#4de3ff' : this.inTarget ? '#d9ff3d' : '#ffffff';
    const numW = hudText(ctx, String(Math.round(this.power)), pad + 4, barY - 10, { size: big, color: pc, maxW: 150 });
    hudText(ctx, 'W', pad + 8 + numW, barY - 10, { size: 22, color: '#e8e8f4' });
    const free = W - 2 * pad - numW - 56; // spazio per l'arma, a destra del numero
    const rx = W - pad - 4;
    hudText(ctx, t(w.name), rx, barY - 34, { size: W < 400 ? 17 : 20, align: 'right', color: w.color, maxW: Math.max(90, free) });
    for (let i = 0; i < WEAPONS.length; i++) { // ●●●○○○
      const cx = rx - 6 - (WEAPONS.length - 1 - i) * 16; ctx.beginPath(); ctx.arc(cx, barY - 16, 5.5, 0, Math.PI * 2);
      if (i <= this.weapon) { ctx.fillStyle = w.color; ctx.fill(); } else { ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke(); }
    }
    // barra potenza con il bersaglio: tacca bianca e fascia chiara da 92 % in su
    ctx.fillStyle = 'rgba(8,10,26,.75)'; rrect(ctx, bx, barY, bw2, bh, 8); ctx.fill();
    const maxW = Math.max(this.ftp * 1.7, tw * 1.25);
    ctx.fillStyle = pc; rrect(ctx, bx, barY, Math.max(8, bw2 * clamp(this.power / maxW, 0, 1)), bh, 8); ctx.fill();
    const t0 = bx + bw2 * clamp(0.92 * tw / maxW, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(t0, barY, Math.max(2, bx + bw2 * clamp(tw * 1.15 / maxW, 0, 1) - t0), bh);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw2 * clamp(tw / maxW, 0, 1) - 1, barY - 4, 3, bh + 8);

    // annunci: brevi, mai sotto il 38 % dell'altezza (la strada con la corsia dove stai è più in basso)
    const u = W < 500 ? 0.9 : 1.1;
    this.msgs.draw(ctx, W, H, { u, y: Math.min(H * 0.33, H * 0.38 - 30 * u) });
    const v3 = new THREE.Vector3();
    // le scelte: una targa sopra ogni arco o cassa, sempre della stessa dimensione leggibile, nella colonna della sua corsia (mai sopra il 40 %: quella fascia è degli annunci)
    for (const g of [...this.gates, ...this.picks]) {
      const d = g.z - this.z; if (g.used || d > 70 || d < 1.5) continue;
      v3.set(g.x, g.def.apply ? 4.6 : 3.0, g.z).project(this.stage.camera);
      const pw = Math.min(150, W / 3 - 8); const ph = 30;
      const sx = W * (g.lane + 0.5) / 3; const sy = clamp((1 - v3.y) / 2 * H, H * 0.405, H * 0.6);
      ctx.globalAlpha = clamp((70 - d) / 12, 0, 1);
      hudPanel(ctx, sx - pw / 2, sy - ph / 2, pw, ph, { r: 12, fill: 'rgba(10,10,14,.88)', tint: g.def.color, tintA: 0.3, gloss: false });
      hudText(ctx, t(g.def.text), sx, sy + 7, { size: 18, align: 'center', color: '#ffffff', maxW: pw - 14 });
      ctx.globalAlpha = 1;
    }
    for (const p of this.pops) {
      p.t -= dt; const k = 1 - p.t / p.t0;
      v3.set(p.x, 3.0 + k * 2.0, p.z).project(this.stage.camera);
      ctx.globalAlpha = clamp(p.t / p.t0 * 2, 0, 1);
      hudText(ctx, p.text, clamp((v3.x + 1) / 2 * W + (p.slot ? 34 : -34), 40, W - 40), (1 - v3.y) / 2 * H, { size: 24, align: 'center', color: p.color });
      ctx.globalAlpha = 1;
    }
    this.pops = this.pops.filter((p) => p.t > 0 && this.state !== 'results');
    hurtVignette(ctx, W, H, (this.hurtFlash || 0) / HURT_FLASH_S);
    if (this.bombFlash > 0) { ctx.fillStyle = `rgba(255,236,200,${clamp(this.bombFlash * 1.6, 0, 0.6)})`; ctx.fillRect(0, 0, W, H); this.bombFlash -= dt; }
    if (this.paused) {
      ctx.fillStyle = 'rgba(8,10,26,.72)'; ctx.fillRect(0, 0, W, H);
      hudText(ctx, t('games.horde.paused'), W / 2, H * 0.42, { size: 42, align: 'center', color: '#ffd34d' });
      paragraph(ctx, t('games.horde.pausedSub'), W / 2, H * 0.42 + 36, { size: 20, maxW: W - 40, color: '#f0f0f0' });
    }
    if (this.hooks.lost) trainerLostBanner(ctx, W, H, t);
    if (this.result && seg.kind === 'cool') this.drawResult(ctx, W, H);
    // i riquadri dei traguardi non coprono l'azione: durante sforzi e scatti aspettano il recupero
    if (!['pace', 'effort', 'sprint'].includes(seg.kind) || this.state === 'results') this.hooks.progress?.drawToasts(ctx, W, dt, this.result && seg.kind === 'cool' ? 400 : 206, true);
  }

  // avviso di minaccia: sulla strada, in fondo alla corsia il cui nemico è a meno di 2 s dalla linea, due frecce che pulsano verso di te
  // (la corsia del nemico che arriva prima è la più viva)
  drawThreat(ctx, W, H) {
    const cam = this.stage.camera; const v = new THREE.Vector3(); const best = this.threatLane();
    const P = (x, z) => { v.set(x, 0.05, z).project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let l = 0; l < LANES; l++) {
      if (!(this.threatT[l] <= WARN_S)) continue;
      const urgent = l === best; const pulse = 0.55 + 0.45 * Math.sin(this.t * (urgent ? 16 : 11)); const own = l === this.lane ? 0.6 : 1;
      const cx = laneX(l); const q = [P(cx + 1.4, this.z + 1.4), P(cx - 1.4, this.z + 1.4), P(cx - 1.4, this.z + 10), P(cx + 1.4, this.z + 10)];
      ctx.fillStyle = `rgba(255,59,77,${(urgent ? 0.2 : 0.12) * pulse * own + 0.04})`;
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = urgent ? '#ff3b4d' : '#ffa24d';
      for (let k = 0; k < 2; k++) {
        const z = this.z + 3.6 + k * 2.6; const ap = P(cx, z); const a = P(cx + 1.05, z + 1.3); const b = P(cx - 1.05, z + 1.3);
        ctx.globalAlpha = clamp(pulse * own * (k ? 0.65 : 1), 0, 1); ctx.lineWidth = clamp(Math.abs(a[0] - b[0]) * 0.14, 4, 14);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(ap[0], ap[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawMenu(ctx, W, H, dt) {
    const connected = this.hooks.connected();
    this.menu.draw(ctx, W, H, { connected });
    this.hooks.progress?.drawToasts(ctx, W, dt);
  }

  // fine partita: il riepilogo comune (stelle, criteri, punteggio, record)
  drawOver(ctx, W, H, dt) {
    const r = this.result;
    const hint = r.hint ? t(r.hint.key) : null;
    this.results.draw(ctx, W, H, {
      title: t('games.horde.res.title'), stars: r.stars, score: r.score,
      criteria: r.wk ? [
        { ok: true, label: t('games.wk.res.done') },
        { ok: r.band >= 0.85, label: t('games.wk.res.band', { p: Math.round(r.band * 100) }) },
        { ok: r.bossKilled >= r.bossTotal, label: t('games.horde.res.bosses', { a: r.bossKilled, b: r.bossTotal }) },
      ] : [
        { ok: r.hp >= 4, label: t('games.horde.res.hearts', { n: r.hp }) },
        { ok: r.hp >= 6 || r.lost <= 1, label: t('games.horde.res.lost', { n: r.lost }) },
        { ok: r.bossKilled >= r.bossTotal, label: t('games.horde.res.bosses', { a: r.bossKilled, b: r.bossTotal }) },
      ],
      best: r.bestScore ? String(r.bestScore) : null, newBest: r.newBest, note: hint,
    });
    if (W <= H * 1.15) this.hooks.progress?.drawToasts(ctx, W, dt, 200, true); // in orizzontale il riquadro coprirebbe il pannello: resta in coda
  }

  // riepilogo: stelle, sforzi riusciti, Custodi, cadute, record e cosa manca alla prossima stella
  drawResult(ctx, W, H) {
    const r = this.result;
    const top = 84 + 118;
    ctx.fillStyle = 'rgba(8,10,26,.78)'; rrect(ctx, 12, top - 6, W - 24, 172, 14); ctx.fill();
    const y = top + 38;
    hudText(ctx, t('games.horde.res.title'), W / 2, y - 6, { size: 22, align: 'center', color: '#d9ff3d' });
    drawStars(ctx, W / 2, y + 30, 24, r.stars);
    let yy = y + 74;
    const line = (s, c = '#f0f0f0') => { const o = paragraph(ctx, s, W / 2, yy, { size: 17, maxW: W - 40, color: c, maxLines: 2 }); yy = o.bottom + 4; };
    line(r.wk ? t('games.wk.res.band', { p: Math.round(r.band * 100) }) : t('games.horde.res.hearts', { n: r.hp }) + ' · ' + t('games.horde.res.lost', { n: r.lost }));
    line(t('games.horde.res.bosses', { a: r.bossKilled, b: r.bossTotal }));
    line(`${t('games.common.score', { n: r.score })}${r.newBest ? t('games.common.newBest') : ''}`, r.newBest ? '#7dff6a' : '#f0f0f0');
    if (r.hint) line(t(r.hint.key), '#ffd34d');
  }

  loop(now) {
    if (!this.active) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.update(dt);
    if (this.player) this.stage.render();
    this.drawHud(dt);
    requestAnimationFrame(this.loop);
  }
}

// tre stelle disegnate a mano (non dipendono dal carattere): piene d'oro quelle ottenute, vuote le altre
function drawStars(ctx, cx, cy, r, n) {
  for (let i = 0; i < 3; i++) {
    const x = cx + (i - 1) * r * 2.5; ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5; const rr = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    ctx.closePath(); ctx.lineJoin = 'round';
    ctx.fillStyle = i < n ? '#ffd34d' : 'rgba(255,255,255,.14)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = i < n ? '#a8741a' : 'rgba(255,255,255,.4)'; ctx.stroke();
  }
}

function rrect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}
