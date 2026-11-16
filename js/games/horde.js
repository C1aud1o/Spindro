// HORDE RUN — sparatutto "a orde" su bici, in 3D (modelli Meshy, stile di Turbo Pedali).
// Ogni partita è un ALLENAMENTO: dura 5, 10 o 20 minuti e segue ondate di sforzo e recupero in % della FTP
// (horde-plan.js). Più watt = più colpi; + / − sterzano (tenuti premuti); se smetti di pedalare il gioco va in pausa.
// Parti con una pistola contro pochi zombi; ogni ondata ha un mix diverso (camminatori, corridori, bruti, scheletri),
// a fine blocco arriva il Custode e chiede uno scatto. I portali arrivano a coppie: scegli da che parte passare.
// Grafica: ciclisti Meshy con scheletro automatico; nemici Meshy con animazione procedurale
// (vicini: ossa vere, fino a un tetto che dipende dalla qualità; lontani: istanze in posa cotta); cimitero al crepuscolo.
import { THREE, Stage, loadAll, Pool, Effects, labelTexture, tracer, fxTexture, Cyclist, makeKit, loadCyclistTemplate, toonMaterial, prepareModel, Quality } from './kit3d.js';
import { loadMeshyTemplate, CYCLIST_URL, MESHY_FAN_URL, BIKE } from './kit/cyclist.js';
import { Walker, FarCrowd, makeEnemyKit, bakePose, enemyMaterial } from './kit/walkers.js';
import { buildSky, buildGround, Scenery, LampLights } from './horde-world.js';
import { clamp, lerp } from './engine.js';
import { txt as hudText, hudView, paragraph, MessageQueue, loadHudFonts, hurtVignette, HURT_FLASH_S, guardTrainer, trainerLostBanner } from './kit/hud.js';
import { t, fmtDec } from '../i18n.js';
import { GameMenu, ResultsView } from './kit/menu.js';
import { makeRandom } from './kit/rng.js';
import { SONGS } from './audio.js';
import { DURATIONS, LEVELS, COOL_S, buildPlan, planFromWorkout, segAt, composAt, targetW, targetPct, Adapter, starsFor, nextStarHint } from './horde-plan.js';
import { WorkoutClock, BandMeter, workoutStars } from './kit/workout-plan.js';

const M = 'assets/3d/meshy';
const ROAD = 5.2;           // metà larghezza percorribile (la strada è larga 13 m, il resto è cancellata)
const NUDGE = 1.5;          // spostamento di un tocco singolo
const STEER = 8;            // m/s tenendo premuto
const SPAWN_Z = 92;         // i nemici nascono oltre dove finisce la nebbia (92 m): emergono, non compaiono
const GATE_Z = 100;
const BOSS_RANGE = 40;      // il Custode è grande: lo si colpisce da più lontano
const MAX_BULLETS = 80;     // colpi con la scia in volo insieme; oltre, il danno arriva subito
const FIRE_RANGE = 15;      // si spara dentro questa distanza: l'orda arriva vicina prima di cadere         // anche i portali
const MAX_ALIVE = 320;
const NEAR = 34;            // entro questa distanza un nemico può avere le ossa (fino al tetto della qualità)
const ANIM_CAP = { high: 20, medium: 12, low: 7 }; // nemici animati con ossa, per livello di qualità
const RIDER_S = 1.3;        // il ciclista è più grande del vero: si legge dall'alto
const FM_REF = 0.8;         // a 0,8 × FTP i colpi sono quelli "base" dell'arma
// gli alleati stanno ai lati e un po' avanti: si vedono combattere e fanno da scudo (mai fra te e la telecamera)
const FORMATION = [[-2.3, 2.0], [2.3, 2.0], [-4.1, 0.2], [4.1, 0.2], [-1.2, 4.6], [1.2, 4.6]]; // al massimo 6 alleati
const GUN_FLIP = 1; // verso della canna del blaster Meshy rispetto a +Z (1 o −1)
const SEG_COLOR = { warm: '#9ee37d', pace: '#ffd34d', effort: '#ff9f43', sprint: '#ff4d6d', rest: '#4de3ff', cool: '#a0f0c0' };
// nemici al secondo di base per tipo di tratto
const BASE_RATE = { warm: 1.5, pace: 1.8, effort: 2.4, sprint: 2.8, rest: 1.1, cool: 0 };

const WEAPONS = [
  { name: 'games.horde.w.pistol', rate: 3, dmg: 1, shots: 1, spread: 0, speed: 38, color: '#fff3a0', xp: 10 },
  { name: 'games.horde.w.revolver', rate: 3, dmg: 1.7, shots: 1, spread: 0, speed: 40, color: '#ffd166', xp: 28 },
  { name: 'games.horde.w.smg', rate: 7, dmg: 1, shots: 1, spread: 0.05, speed: 42, color: '#ffe08a', xp: 70 },
  { name: 'games.horde.w.pump', rate: 1.8, dmg: 1.4, shots: 6, spread: 0.32, speed: 34, color: '#ff9f43', xp: 130 },
  { name: 'games.horde.w.mg', rate: 10, dmg: 1.4, shots: 1, spread: 0.06, speed: 46, color: '#ffd166', xp: 220 },
  { name: 'games.horde.w.rifle', rate: 8, dmg: 2.4, shots: 2, spread: 0.08, speed: 50, color: '#b8f2ff', xp: 340 },
  { name: 'games.horde.w.rocket', rate: 1.8, dmg: 10, shots: 1, spread: 0, speed: 26, color: '#ff6b35', splash: 3.2, xp: 500 },
  { name: 'games.horde.w.plasma', rate: 3.4, dmg: 7, shots: 1, spread: 0, speed: 34, color: '#c77dff', splash: 2.2, pierce: true, xp: 700 },
  { name: 'games.horde.w.minigun', rate: 16, dmg: 2.2, shots: 1, spread: 0.1, speed: 52, color: '#7dff6a', xp: 950 },
  { name: 'games.horde.w.laser', rate: 10, dmg: 5, shots: 1, spread: 0, speed: 80, color: '#4de3ff', pierce: true, xp: Infinity },
];

const ENEMIES = {
  zombie: { file: 'zombie', h: 3.3, rad: 0.75, hp: 2, speed: 1.9, style: 'walk', xp: 1, score: 10 },
  runner: { file: 'zombie_runner', h: 3.2, rad: 0.7, hp: 2, speed: 4.2, style: 'run', xp: 1, score: 15, fast: true },
  skeleton: { file: 'skeleton', h: 3.3, rad: 0.75, hp: 3, speed: 2.8, style: 'bones', xp: 2, score: 20, dodge: true },
  brute: { file: 'zombie_brute', h: 4.3, rad: 1.1, hp: 12, speed: 2.2, style: 'brute', xp: 4, score: 50 },
  keeper: { file: 'ogre', h: 8.2, rad: 2.6, hp: 260, speed: 1.2, style: 'boss', xp: 40, score: 1000, boss: true },
};

// ---------- portali: ogni coppia è una scelta vera ----------
const G = {
  ally1: { text: 'games.horde.gate.ally1', kind: 'ally', color: '#2fd6a0', apply: (g) => g.addAllies(1) },
  ally2: { text: 'games.horde.gate.ally2', kind: 'ally', color: '#2fd6a0', apply: (g) => g.addAllies(2) },
  allyx2: { text: 'games.horde.gate.allyx2', kind: 'ally', color: '#2fd6a0', apply: (g) => g.addAllies(Math.max(1, g.allies.length)) },
  weapon: { text: 'games.horde.gate.weapon', kind: 'weapon', color: '#ff9f43', apply: (g) => g.evolve() },
  rate: { text: 'games.horde.gate.rateUp', kind: 'rate', color: '#4de3ff', apply: (g) => { g.rateMul = Math.min(2.2, g.rateMul * 1.3); } },
  dmg: { text: 'games.horde.gate.dmgUp', kind: 'dmg', color: '#ff5a6a', apply: (g) => { g.dmgMul = Math.min(3.5, g.dmgMul * 1.4); } },
  life: { text: 'games.horde.gate.life', kind: 'life', color: '#ff7ab6', apply: (g) => { g.hp = Math.min(g.maxHp, g.hp + 2); } },
};
// le coppie: [alleato o arma] [cadenza o danno] [alleato o vita] [×2 alleati o arma]; si alternano senza ripetersi
const PAIRS = [
  (g) => [g.allies.length < 3 ? G.ally2 : G.ally1, G.weapon],
  () => [G.rate, G.dmg],
  (g) => [g.allies.length < 6 ? G.ally1 : G.rate, g.hp < g.maxHp ? G.life : G.dmg],
  (g) => [g.allies.length >= 2 && g.allies.length <= 4 ? G.allyx2 : G.ally2, G.dmg],
  (g) => [G.rate, g.allies.length < 6 ? G.ally1 : G.dmg],
  (g) => [G.dmg, g.hp < g.maxHp ? G.life : G.rate],
];

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
    this.detach = [this.menu.attach(this.hudCanvas, size, () => this.state === 'menu'), this.results.attach(this.hudCanvas, size, () => this.state === 'results')];
    this.quality = new Quality();
    this.stage = new Stage(this.hudCanvas, { quality: this.quality });
    this.stage.onQuality = (cfg) => this.applyQuality(cfg);
    this.state = 'loading'; this.t = 0; this.msgs = new MessageQueue(); this.power = 0; this.pw = 0; this.cadence = 0;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
    this.audio.playSong(SONGS.menu);
    try {
      const files = { jewel: 'assets/3d/pickups/jewel.glb' };
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
    this.active = false; this.audio.stopSong(); this.hooks.setGrade(null);
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
    // gemma: gioiello Kenney (Platformer Kit, CC0) con un alone che il bagliore fa brillare
    const jb = new THREE.Box3().setFromObject(this.m.jewel.scene); this.gemScale = 0.75 / ((jb.max.y - jb.min.y) || 1);
    this.gemGlow = new THREE.SpriteMaterial({ map: fxTexture('light_01'), color: '#5fd4ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
    // i nemici sono scuri sull'asfalto: un po' di luce propria li fa leggere (la sagoma si stacca dalla strada)
    // (i materiali sono condivisi con gli altri giochi: alla chiusura si rimettono come prima)
    this.litMats = [...Object.values(this.kits).map((k) => k.material), ...Object.entries(this.farKits).map(([type, k]) => enemyMaterial(k.tpl.map, ENEMIES[type].h, { far: true }))];
    for (const m of this.litMats) m.emissive?.set('#38446f');
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
    for (const g of this.gates || []) this.dropGate(g, scene);
    for (const gm of this.gems || []) scene.remove(gm.mesh);
    if (this.player) scene.remove(this.player.root);
    for (const b of this.bullets) b.mesh.visible = false;
    this.bullets = [];
    this.rnd = makeRandom(this.seed); this.configure(this.durIdx, this.lvlIdx);
    this.z = 0; this.x = 0; this.tx = 0; this.held = 0; this.heldT = 0; this.hp = 6; this.maxHp = 6; this.pops = [];
    this.weapon = 0; this.xp = 0; this.rateMul = 1; this.dmgMul = 1;
    this.kills = 0; this.score = 0; this.spawnAcc = 0; this.el = this.wk ? this.wc.el : 0; this.segIdx = -1; this.seg = this.plan.segs[0];
    this.enemies = []; this.allies = []; this.gates = []; this.gems = [];
    this.gateN = 0; this.lastPair = -1; this.nextGate = 12; this.overdrive = 0; this.hurtT = 0; this.shake = 0; this.bossAlive = false;
    this.pw = 0; this.sinceSpawn = 0; this.gemAcc = 0; this.gemT = 0; this.popN = 0; // niente eredità dal menu o dalla partita prima: la potenza di allora dipende dal tempo reale
    this.paused = false; this.pauseT = 0; this.startT = 0; this.calm = 0; this.finished = false; this.result = null;
    this.nextSize = 0; this.trailT = 5; this.pressure = 1; this.lastHitT = 0; this.ko = 0; this.effortsDone = 0; this.effortsTotal = 0; this.bossKilled = 0; this.bossSpawned = new Set(); this.passed = 0;
    this.adapt = new Adapter(); this.evLog = []; this.sprinting = false; this.sentGrade = undefined; this.msgs.clear();
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
    const end = this.total - COOL_S; const ts = this.evLog.filter((e) => e.t <= end).map((e) => e.t).sort((a, b) => a - b);
    let maxGap = 0; let prev = 0; for (const x of ts) { maxGap = Math.max(maxGap, x - prev); prev = x; } maxGap = Math.max(maxGap, end - prev);
    return { first: ts[0] ?? Infinity, maxGap, perMin: ts.length / (end / 60), n: ts.length };
  }

  // ---------- gioco ----------
  input(dir) {
    this.audio.ensure();
    if (this.state === 'menu') { this.menu.input(dir); return; }
    if (this.state === 'results') { this.results.input(dir); return; }
    if (this.state !== 'play' || this.paused) return;
    this.tx = clamp(this.tx - dir * NUDGE, -ROAD, ROAD); // destra sullo schermo = −X (camera rivolta a +Z)
  }

  // tenuto premuto: sterzata continua (nel menu: dopo 0,8 s inizia la partita)
  hold(dir) { if (this.state === 'menu') { this.menu.hold(dir); return; } this.held = dir; this.heldT = 0; }

  begin() {
    this.state = 'play'; this.stateT = 0; this.hooks.runStart?.();
    this.audio.playSong(SONGS.factory); this.audio.sfx('go');
  }

  // testo che sale dal giocatore (feedback immediato di cosa hai preso)
  pop(text, color, t = 1) { this.popN = (this.popN || 0) + 1; this.pops.push({ text, color, t, t0: t, x: this.x, z: this.z, slot: this.popN % 2 }); while (this.pops.length > 2) this.pops.shift(); }

  // messaggi a centro schermo: uno alla volta, con priorità (kit/hud.js MessageQueue). prio: 1 normale, 2 grande, 3 boss
  say(text, color = '#ffd34d', t = 1.6, big = false, prio = big ? 2 : 1, sub = null) { this.msgs.say(text, { color, dur: t, big, prio, sub }); }
  prog(stat, n = 1, xp = 0) { this.hooks.progress?.event(stat, n, xp); }

  addAllies(n) {
    const jerseys = ['#4de3ff', '#ff4d9d', '#ffd166', '#06d6a0', '#ff922b', '#7b2cbf', '#3a86ff', '#e63946'];
    for (let i = 0; i < n && this.allies.length < FORMATION.length; i++) {
      const k = this.allies.length;
      const r = this.makeRider(jerseys[k % jerseys.length], k + 1, this.weapon, true);
      r.setShadows(false);
      const slot = FORMATION[k];
      // nascono dal portale appena passato (davanti a te, lontani dalla telecamera) e crescono mentre si mettono in formazione
      const a = { r, slot, fireT: 0.15 + this.rnd() * 0.3, x: this.x + slot[0] * 0.3, z: this.z + 1.5, born: 0 };
      r.root.position.set(a.x, 0, a.z); r.root.scale.setScalar(RIDER_S * 0.2);
      this.allies.push(a);
      this.fx.spawn(a.x, 1.6, a.z + 1, { tex: 'green', size: 2.2, life: 0.4 });
    }
    this.say(t('games.horde.alliesSay', { n: this.allies.length }), '#06d6a0', 1.4);
  }

  evolve() {
    if (this.weapon >= WEAPONS.length - 1) { this.dmgMul = Math.min(3.5, this.dmgMul * 1.15); return; }
    this.weapon++; this.xp = 0;
    const w = WEAPONS[this.weapon];
    this.mountGun(this.player, this.weapon);
    for (const a of this.allies) this.mountGun(a.r, this.weapon);
    this.say(t('games.horde.newWeapon', { name: t(w.name) }), w.color, 2.4, true);
    this.audio.sfx('overdrive'); this.shake = 0.3; this.ev('weapon');
    this.fx.spawn(this.x, 1.8, this.z + 2.5, { tex: 'spark', size: 2.2, life: 0.35 });
  }

  spawnEnemy(type, x, z, hp = null) {
    const def = ENEMIES[type];
    hp = hp ?? Math.max(1, Math.round(def.hp * this.hpScale()));
    const e = { type, def, w: null, x, z, hp, maxHp: hp, dead: false, deadT: 0, flash: 0, wob: this.rnd() * 6, shade: 0.8 + this.rnd() * 0.28, contact: 0, atk: 1 + this.rnd(), off: (this.rnd() - 0.5) * 1.6, sc: def.boss ? 1 : 0.92 + this.rnd() * 0.16, dodgeT: 0, dodgeCd: this.rnd(), dodgeV: 0 };
    this.enemies.push(e); return e;
  }
  xpNeed() { return WEAPONS[this.weapon].xp * 2.2 * Math.sqrt(this.total / 300); }
  // i nemici si fanno più robusti lungo la partita (non con le ondate: 5 e 20 minuti hanno la stessa curva)
  hpScale() { return 0.7 * (1 + 2.2 * Math.pow(clamp(this.el / this.total, 0, 1), 1.1)) * clamp(Math.pow(this.strength(), 0.55), 1, 20); }

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

  // ---------- il direttore: quanti nemici e di che tipo, secondo il tratto dell'allenamento ----------
  firepower(pct) { // danno al secondo previsto se il giocatore pedala alla % indicata
    const w = WEAPONS[this.weapon];
    return (1 + this.allies.length * 0.85) * w.rate * w.dmg * w.shots * this.rateMul * this.dmgMul * clamp(pct / FM_REF, 0.35, 1.8);
  }

  pickType(mix) {
    let r = this.rnd(); let last = 'zombie';
    for (const [k, p] of Object.entries(mix)) { last = k; if ((r -= p) < 0) return k; }
    return last;
  }

  // dimensione del branco: quanto "matura" in ~3 s (così non passano mai più di pochi secondi fra un branco e l'altro)
  packSize(comp, rate = 0.8) {
    const prog = clamp(this.el / this.total, 0, 1); const [a, b] = comp.pack;
    return Math.max(a, Math.min(Math.round(b * (1 + prog)), Math.round(rate * 3.2 * (0.7 + this.rnd() * 0.6))));
  }

  spawnPack(comp, seg, atZ = null, size = this.packSize(comp)) {
    const type = this.pickType(comp.mix);
    const wide = comp.id === 'walkers' ? 1.0 : 0.6; // i camminatori arrivano "in massa", larghi quanto la strada
    const cx = (this.rnd() * 2 - 1) * (ROAD - 1.2);
    const spread = Math.min(2 * ROAD, 2 + size * 0.55 * wide);
    const z0 = atZ ?? this.z + SPAWN_Z + this.rnd() * 12;
    for (let i = 0; i < size; i++) {
      const ty = this.rnd() < 0.18 && type !== 'brute' ? this.pickType(comp.mix) : type; // qualche intruso nel branco
      this.spawnEnemy(ty, clamp(cx + (this.rnd() - 0.5) * spread, -ROAD - 0.6, ROAD + 0.6), z0 + this.rnd() * (3 + size * 0.5));
    }
  }

  // la strada all'inizio non è vuota: come se il flusso di nemici fosse già in corso
  prefill() {
    const comp = composAt(0); let d = 20;
    while (d < SPAWN_Z - 4) { this.spawnPack(comp, this.seg, this.z + d, 2 + Math.floor(this.rnd() * 3)); d += 11 + this.rnd() * 6; }
    this.spawnAcc = 2;
    this.spawnTrail(this.z + 24); this.spawnTrail(this.z + 52);
    this.spawnGatePair(this.z + 62);
  }

  // quanto è forte la squadra rispetto alla sola pistola (a 0,8 × FTP): i nemici crescono con lei, ma più piano
  strength() { return Math.max(1, this.firepower(FM_REF) / 3); }

  directorTick(dt, seg) {
    if (seg.kind === 'cool') return;
    const comp = composAt(seg.wave);
    const prog = clamp(this.el / this.total, 0, 1);
    const alive = this.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
    const cap = Math.min(MAX_ALIVE, Math.round((60 + 140 * prog) * (0.45 + 0.55 * (this.quality.cfg.crowd ?? 1)))); // meno folla sui telefoni che faticano
    // nemici al secondo: dipendono dal tratto (più sforzo, più orda), crescono lungo la partita e con la forza della squadra
    let rate = BASE_RATE[seg.kind] * (1 + 1.2 * prog) * clamp(Math.pow(this.strength(), 0.25), 1, 2.2) * comp.demand;
    // la pressione scende quando ti colpiscono e risale piano quando tieni la linea: nessuno viene schiacciato, nessuno si annoia
    if (this.el - (this.lastHitT || 0) > 18) this.pressure = Math.min(1.35, this.pressure + dt * 0.004);
    rate *= this.pressure;
    if (this.wk) rate *= 1 + 2 * this.level.k; // con un allenamento il livello cambia solo quanti nemici arrivano, mai i watt
    if (this.bossAlive) rate *= 0.5;
    if (this.calm > 0) { this.calm -= dt; rate *= 0.65; }
    this.spawnAcc += rate * dt;
    // un branco alla volta: quando i nemici "maturati" bastano per il prossimo branco, parte
    if (!this.nextSize) this.nextSize = this.packSize(comp, rate);
    this.sinceSpawn = (this.sinceSpawn || 0) + dt;
    if (this.spawnAcc >= this.nextSize && alive < cap) { this.spawnAcc -= this.nextSize; this.spawnPack(comp, seg, null, this.nextSize); this.nextSize = 0; this.sinceSpawn = 0; }
    else if (this.sinceSpawn > 1.9 && alive < cap) { this.spawnPack(comp, seg, null, 1 + (this.rnd() < 0.5 ? 1 : 0)); this.sinceSpawn = 0; this.spawnAcc = Math.max(0, this.spawnAcc - 1); } // mai più di pochi secondi fra un branco e l'altro
    if (alive >= cap) this.spawnAcc = Math.min(this.spawnAcc, this.nextSize || 4);
  }

  // ---------- il piano: cambio di tratto, giudizio degli sforzi, adattamento ----------
  enterSeg(i) {
    const prev = this.seg; const seg = this.plan.segs[i]; const first = this.segIdx < 0;
    if (!first) this.judge(prev);
    this.segIdx = i; this.seg = seg; seg.inT = 0; seg.okT = 0;
    const W = targetW(seg, this.ftp, this.level.k, this.adapt.value, this.el);
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

  // un sforzo (o scatto) è riuscito se per il tempo giusto hai tenuto almeno il 92 % dei watt richiesti
  judge(seg) {
    if (seg.kind !== 'effort' && seg.kind !== 'sprint') return;
    const need = Math.max(1, seg.t1 - seg.t0 - (seg.kind === 'sprint' ? 2 : 4));
    const ok = seg.okT / need >= (seg.kind === 'sprint' ? 0.5 : 0.65);
    this.effortsTotal++;
    if (ok) {
      this.effortsDone++; this.score += 300 * (1 + Math.floor(this.el / 60)); this.audio.sfx('rescue');
      this.say(t(seg.kind === 'sprint' ? 'games.horde.sprintOk' : 'games.horde.effortOk'), '#7dff6a', 1.8, true, 2); this.prog('sprintsWon', seg.kind === 'sprint' ? 1 : 0, 20);
    } else this.say(t('games.horde.effortKo'), '#ffb84d', 1.6, false, 1);
    this.ev(ok ? 'effortOk' : 'effortKo');
    const moved = this.wk ? 0 : this.adapt.report(ok); // con un allenamento i watt li decide lui
    if (moved) this.say(t(moved < 0 ? 'games.horde.adaptDown' : 'games.horde.adaptUp'), moved < 0 ? '#4de3ff' : '#ffd34d', 2.2, false, 2);
  }

  maybeBoss(seg) {
    if (!this.plan.bossWaves.includes(seg.wave) || this.bossSpawned.has(seg.wave)) return;
    this.bossSpawned.add(seg.wave);
    const sprint = this.plan.segs.find((s) => s.kind === 'sprint' && s.wave === seg.wave);
    // il Custode arriva in contatto verso metà dello scatto; più forte la squadra, più resistente
    // contatto verso 8 s dentro lo scatto: parte (distanza ÷ velocità di avvicinamento − 8) secondi prima dello scatto
    const approach = SPAWN_Z / ((this.v || 5) + ENEMIES.keeper.speed);
    const at = sprint ? Math.max(seg.t0, sprint.t0 + 8 - approach) : seg.t0;
    this.bossAt = { t: at, wave: seg.wave, seg, sprint };
  }
  spawnBoss(b) {
    const pct = targetPct(b.seg, this.level.k, this.adapt.value);
    const hp = Math.round(0.2 * this.firepower(pct) * (BOSS_RANGE / (this.v + ENEMIES.keeper.speed)));
    const e = this.spawnEnemy('keeper', 0, this.z + SPAWN_Z, Math.max(60, hp)); e.hp = e.maxHp = Math.max(60, hp);
    this.bossAlive = true; this.audio.sfx('alarm'); this.ev('boss');
    this.say(t('games.horde.waveBoss', { n: b.wave }), '#ff4d4d', 3, true, 3, t('games.horde.waveBossSub'));
  }

  startCool() {
    this.clearHorde();
    this.finishResult();
    this.say(t('games.horde.say.cool'), SEG_COLOR.cool, 3, true, 3, t('games.horde.say.coolSub', { w: targetW(this.seg, this.ftp, 0, 0) }));
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
    const s = this.wk ? { stars: workoutStars(this.band.ratio, true), ratio: this.band.ratio } : starsFor({ done: this.effortsDone, total: this.effortsTotal, bossKilled: this.bossKilled, bossTotal, ko: this.ko });
    const rec = this.record(); const prevBest = rec.score || 0;
    const newBest = this.score > prevBest;
    if (!this.wk && (newBest || (s.stars > (rec.stars || 0)))) { try { localStorage.setItem(this.recordKey(), JSON.stringify({ score: Math.max(prevBest, this.score), stars: Math.max(rec.stars || 0, s.stars) })); } catch { /* niente storage */ } }
    this.result = { ...s, done: this.effortsDone, total: this.effortsTotal, bossKilled: this.bossKilled, bossTotal, ko: this.ko, score: this.score, newBest, prevStars: rec.stars || 0, bestScore: Math.max(prevBest, this.score) };
    this.result.hint = this.wk ? null : nextStarHint(this.result);
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
    const demoP = demo && this.wk && this.seg ? targetW(this.seg, ftp, 0, 0, this.el) : demo ? ftp * (this.state === 'play' && this.seg?.kind === 'rest' ? 0.58 : 0.8) * (((this.t % 40) > 31 && this.seg?.kind !== 'rest') ? 1.6 : 1) : 0;
    this.power = connected ? st.power || 0 : demoP;
    this.cadence = connected ? st.cadence || 0 : 88;
    this.pw += (this.power - this.pw) * Math.min(1, dt / 1.2);
    const kmh = connected ? this.hooks.speedKmh() : 28;
    if (this.audio.song) this.audio.setTempo(this.audio.song.bpm * clamp((this.cadence || 85) / 88, 0.85, 1.25));
    this.msgs.update(dt);
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
    const tgt = targetW(seg, ftp, this.level.k, this.adapt.value, this.el);
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

    // avanzamento: velocità di scorrimento quasi costante, così i tempi degli eventi non dipendono dalla velocità del rullo
    const v = clamp((kmh / 3.6) * 0.4, 3, 4.6);
    this.v = v;
    this.z += v * dt;
    if (this.held) { this.heldT += dt; if (this.heldT > 0.12) this.tx = clamp(this.tx - this.held * STEER * dt, -ROAD, ROAD); }
    this.x = lerp(this.x, this.tx, 1 - Math.exp(-dt * 9));
    this.shake = Math.max(0, this.shake - dt); this.hurtT = Math.max(0, this.hurtT - dt); this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dt);
    const g = this.bossAlive ? 4 : seg.kind === 'rest' || seg.kind === 'cool' ? 0 : seg.kind === 'warm' ? 1 : seg.kind === 'pace' ? 2 : 3;
    if (!this.wk && g !== this.sentGrade) { this.sentGrade = g; this.hooks.setGrade(g); } // con un allenamento il rullo resta in ERG: la pendenza non si tocca

    this.directorTick(dt, seg);
    if (seg.kind !== 'cool') { this.trailT -= dt; if (this.trailT <= 0) { this.spawnTrail(this.z + SPAWN_Z); this.trailT = 6 + this.rnd() * 3; } }
    // portali: una coppia ogni 13–17 s; nascono lontano e si vedono arrivare
    if (seg.kind !== 'cool') { this.nextGate -= dt; if (this.nextGate <= 0) { this.spawnGatePair(this.z + GATE_Z); this.nextGate = 13 + this.rnd() * 4; } }

    this.updateShooters(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateGates(dt);
    this.updateGems(dt);
    this.animate(dt);
  }

  menuTick(dt, connected) { this.menu.update(dt, { connected, power: this.power }); }

  finish() {
    if (!this.result) this.finishResult();
    this.state = 'results'; this.stateT = 0; this.finished = true;
    this.audio.stopSong(); this.audio.sfx('win'); this.results.reset();
    this.hooks.runEnd?.({ game: 'horde', score: this.score });
    if (!this.wk) this.hooks.setGrade(0);
  }

  // ---------- portali: arco di pietra Meshy con energia colorata per tipo ----------
  initPortal() {
    const info = prepareModel(this.m.portal); const b = info.box; const w = b.max.x - b.min.x; const d = b.max.z - b.min.z;
    const cx = (b.min.x + b.max.x) / 2; const cz = (b.min.z + b.max.z) / 2;
    if (!info.dressed) { for (const p of info.parts) p.geo.translate(-cx, -b.min.y, -cz); info.dressed = true; }
    this.portal = { info, wide: Math.max(w, d), turn: w < d ? Math.PI / 2 : 0, height: info.height };
    this.portalMats = info.parts.map((pt) => toonMaterial({ map: pt.mat === 'vc' ? null : pt.mat, vertexColors: pt.mat === 'vc' }));
  }

  spawnGatePair(z) {
    // coppie di scelte vere, a rotazione e mai la stessa due volte di fila
    let k = this.gateN++ % PAIRS.length; if (k === this.lastPair) k = (k + 1) % PAIRS.length; this.lastPair = k;
    const pair = PAIRS[k](this);
    const P = this.portal; const width = 3.4; const s = width / P.wide; const sy = Math.min(s, 3.8 / P.height);
    const sides = this.rnd() < 0.5 ? [0, 1] : [1, 0];
    pair.forEach((def, i) => {
      const x = (sides[i] ? 1 : -1) * 2.5; // fra i due portali resta un varco: chi passa in mezzo non attraversa i pilastri
      const group = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.5, 2.9), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      panel.position.y = 1.7; group.add(panel);
      const frame = new THREE.Group();
      P.info.parts.forEach((pt, j) => { frame.add(new THREE.Mesh(pt.geo, this.portalMats[j])); });
      frame.rotation.y = P.turn; frame.scale.set(s, sy, s); group.add(frame);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(width - 1.0, 0.8), new THREE.MeshBasicMaterial({ map: labelTexture(t(def.text), null, '#ffffff'), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      label.position.set(0, 1.8, -0.08); label.rotation.y = Math.PI; group.add(label);
      group.position.set(x, 0, z);
      this.stage.scene.add(group);
      this.gates.push({ def, x, z, group, used: false, pair: this.gateN, panel });
    });
  }

  updateGates(dt) {
    for (const g of this.gates) {
      if (g.used || this.z < g.z) continue;
      g.used = true;
      // passa dal portale della propria metà strada: l'altro della coppia svanisce
      const mine = (this.x >= 0) === (g.x >= 0);
      if (mine) {
        g.def.apply(this);
        this.say(t(g.def.text), g.def.color, 1.6, true);
        this.audio.sfx('rescue'); this.ev('gate');
        this.fx.spawn(g.x, 2.2, g.z + 1, { tex: 'blue', size: 3, life: 0.35 });
        g.taken = true;
      } else g.fade = 0.01;
      g.passT = 0;
    }
    // il portale scelto resta fino a quando è dietro la telecamera; l'altro si spegne piano (niente sparizioni di colpo)
    for (const g of this.gates) {
      if (g.fade !== undefined) { g.fade = Math.min(1, g.fade + dt / 0.5); g.panel.material.opacity *= 1 - g.fade; g.group.scale.setScalar(1 - 0.15 * g.fade); if (g.fade >= 1) g.group.visible = false; }
      else if (g.taken) { g.panel.material.opacity = Math.max(0, g.panel.material.opacity - dt * 4); }
    }
    this.gates = this.gates.filter((g) => { if (g.z < this.z - 12) { this.dropGate(g, this.stage.scene); return false; } return true; });
  }

  // a gate owns its two plane geometries, two materials and the label texture (the frame parts are shared): free them
  dropGate(g, scene) {
    scene.remove(g.group);
    g.group.traverse((o) => { if (o.isMesh && o.geometry?.type === 'PlaneGeometry') { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  }

  shooters() { return [{ x: this.x, z: this.z, r: this.player, self: true }, ...this.allies.map((a) => ({ x: a.x, z: a.z, r: a.r, ally: a }))]; }

  updateShooters(dt) {
    const w = WEAPONS[this.weapon];
    const od = this.overdrive > 0;
    // più watt = più colpi: a 0,8 × FTP la cadenza base dell'arma, a 1,2 × FTP una volta e mezza
    const fm = clamp(this.pw / (this.ftp * FM_REF), 0.35, 1.8);
    this.fireRate = w.rate * this.rateMul * fm * (od ? 2 : 1);
    for (const s of this.shooters()) {
      const holder = s.self ? this : s.ally;
      holder.fireT = (holder.fireT || 0) - dt;
      if (holder.fireT > 0) continue;
      const target = this.pickTarget(s, FIRE_RANGE);
      if (!target) { holder.fireT = 0.1; continue; }
      holder.fireT = (1 / this.fireRate) * (s.self ? 1 : 1.15);
      const ang = Math.atan2(target.x - s.x, target.z - s.z);
      if (this.bullets.length >= MAX_BULLETS) { this.hitscan(target, w, od); continue; } // troppi colpi in volo (costano disegni): il danno arriva subito, senza la scia
      for (let k = 0; k < w.shots; k++) {
        const a = ang + (w.shots > 1 ? (k / (w.shots - 1) - 0.5) * w.spread : (this.rnd() - 0.5) * w.spread);
        const mesh = this.bulletPool.get();
        mesh.glow.material.color.set(od ? '#4de3ff' : w.color);
        // forma per tipo d'arma: razzi corti e grossi, laser lunghi e sottili, raffiche medie
        if (w.splash) mesh.shape(1.8, 0.5); else if (w.speed >= 70) mesh.shape(4.5, 0.2); else if (w.rate > 8) mesh.shape(2.4, 0.2); else mesh.shape(2.2, 0.24 * (od ? 1.4 : 1));
        mesh.rotation.set(0, a, 0);
        mesh.position.set(s.x + Math.sin(a) * 1.6, 1.5, s.z + Math.cos(a) * 1.6);
        this.bullets.push({ mesh, vx: Math.sin(a) * w.speed, vz: Math.cos(a) * w.speed, life: clamp(44 / w.speed, 0.6, 1.8), dmg: w.dmg * this.dmgMul * (od ? 2 : 1), splash: w.splash, pierce: w.pierce || od || target.def.boss, hits: null }); // i colpi contro il Custode trapassano la folla
        mesh.core.visible = s.self && w.rate <= 8; // il nucleo bianco solo per i colpi lenti del giocatore: meno disegni
      }
      // vampata alla bocca dell'arma (per gli alleati solo ogni tanto)
      if (s.self || this.rnd() < 0.4) this.fx.spawn(s.x + Math.sin(ang) * 1.15, 1.5, s.z + Math.cos(ang) * 1.15, { tex: w.splash ? 'fire' : 'muzzle', size: w.splash ? 1.5 : 1.1, life: 0.08, grow: 0.6, color: od ? '#9eeeff' : null });
      if (s.self) this.audio.sfx(w.splash ? 'rocket' : w.rate > 8 ? 'mg' : w.pierce ? 'laser' : 'shot');
      else if (this.rnd() < 0.35) holder.r.root.userData.kick = 0.1;
    }
  }

  hitscan(target, w, od) {
    const dmg = w.dmg * this.dmgMul * (od ? 2 : 1) * w.shots;
    if (w.splash) { this.fx.explode(target.x, 1, target.z, w.splash / 3); for (const o of this.enemies) if (!o.dead && Math.hypot(o.x - target.x, o.z - target.z) < w.splash) this.damage(o, dmg); } else this.damage(target, dmg);
  }

  // chi spara sceglie il nemico più vicino; gli alleati ne scelgono uno fra i tre più vicini: non si accanisce tutti sullo stesso
  pickTarget(s, range) {
    // il Custode attira i colpi quando è a tiro (altrimenti li prenderebbero i più vicini della folla)
    if (this.bossAlive && this.rnd() < 0.85) { const b = this.enemies.find((e) => e.def.boss && !e.dead && e.z > s.z && e.z - s.z < BOSS_RANGE); if (b) return b; }
    if (s.self) return this.nearest(s.x, s.z, range);
    return this.nearest(s.x, s.z, range * 0.8, 1 + Math.floor(this.rnd() * 3));
  }
  nearest(x, z, range, skip = 0) {
    let best = null; let bd = range; const near = [];
    for (const e of this.enemies) {
      if (e.dead || e.z < z - 1) continue;
      const d = Math.hypot(e.x - x, (e.z - z) * 0.8) - (e.def.boss ? 1 : 0);
      if (d < bd) { if (skip) { near.push([d, e]); } else { bd = d; best = e; } }
    }
    if (skip && near.length) { near.sort((a, b) => a[0] - b[0]); return near[Math.min(skip - 1, near.length - 1)][1]; }
    return best;
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      b.mesh.position.x += b.vx * dt; b.mesh.position.z += b.vz * dt; b.life -= dt;
      const bx = b.mesh.position.x; const bz = b.mesh.position.z;
      for (const e of this.enemies) {
        if (e.dead || (b.hits && b.hits.has(e))) continue;
        const rad = e.def.rad;
        if (Math.abs(e.z - bz) < rad + 0.3 && Math.abs(e.x - bx) < rad) {
          if (b.splash) {
            this.fx.explode(bx, 1, bz, b.splash / 2.5);
            this.audio.sfx('boom'); this.shake = Math.max(this.shake, 0.12);
            for (const o of this.enemies) if (!o.dead && Math.hypot(o.x - bx, o.z - bz) < b.splash) this.damage(o, b.dmg);
          } else { this.damage(e, b.dmg); this.fx.spawn(bx, 1.3, bz, { tex: 'spark', size: 1.0, life: 0.09, grow: 1 }); for (let q = 0; q < 2; q++) this.fx.spawn(bx, 1.3, bz, { tex: 'spark', size: 0.22, life: 0.25, vx: (this.rnd() - 0.5) * 6, vy: 2 + this.rnd() * 3, vz: -b.vz * 0.08 + (this.rnd() - 0.5) * 3, grow: 0 }); }
          if (b.pierce) (b.hits = b.hits || new Set()).add(e); else { b.life = 0; break; }
        }
      }
      if (b.life <= 0) b.mesh.visible = false;
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  damage(e, n) {
    if (e.dead) return;
    e.hp -= n; e.flash = 0.08; if (e.w) e.w.hit = 1;
    if (e.hp > 0) return;
    e.dead = true; e.deadT = 0;
    if (!e.w) { e.deadT = 1.5; this.fx.spawn(e.x, 1, e.z, { tex: 'smoke', size: 2, life: 0.5, additive: false }); } // lontano: sparisce in una nuvola
    this.kills++; this.ev('kill'); this.score += Math.round(e.def.score * (1 + this.el / 120));
    this.prog('kills', 1, e.def.boss ? 200 : 1);
    this.xp += e.def.xp;
    if (this.xp >= this.xpNeed()) this.evolve();
    if ((this.rnd() < 0.2 && this.gems.length < 28) || e.def.boss) this.dropGem(e.x, e.z, e.def.boss ? 12 : e.def.xp > 2 ? 3 : 1);
    if (e.def.boss) {
      this.bossAlive = false; this.fx.explode(e.x, 2.5, e.z, 2.5); this.shake = 0.8; this.bossKilled++;
      this.audio.sfx('win'); this.say(t('games.horde.bossDown'), '#d9ff3d', 2.6, true, 3); this.prog('bosses', 1, 150);
      this.addAllies(2);
    }
  }

  addGem(x, z, trail = false) {
    const mesh = new THREE.Group();
    const jewel = this.m.jewel.scene.clone(true); jewel.scale.setScalar(this.gemScale); mesh.add(jewel);
    const halo = new THREE.Sprite(this.gemGlow); halo.scale.setScalar(1.6); halo.position.y = 0.35; mesh.add(halo);
    mesh.position.set(x, 0.6, z);
    this.stage.scene.add(mesh); this.gems.push({ mesh, t: this.rnd() * 3, trail });
  }
  dropGem(x, z, n) {
    for (let i = 0; i < n; i++) this.addGem(clamp(x + (this.rnd() - 0.5) * (n > 1 ? 4 : 0.5), -ROAD, ROAD), z + (this.rnd() - 0.5) * (n > 1 ? 4 : 0.5));
  }
  // una fila di gemme su una corsia: sterzando la raccogli tutta (la strada non è mai senza qualcosa da fare)
  spawnTrail(z) {
    const x = (this.rnd() * 2 - 1) * (ROAD - 1); const n = 5;
    for (let i = 0; i < n; i++) this.addGem(x, z + i * 3, true);
  }

  updateGems(dt) {
    // le gemme prese in rapida successione si leggono come un unico "+N" (niente pile di scritte sovrapposte)
    if (this.gemAcc) { this.gemT = (this.gemT || 0) + dt; if (this.gemT > 0.45) { this.pop(`+${this.gemAcc}`, '#7dff6a', 0.8); this.gemAcc = 0; this.gemT = 0; } }
    for (const g of this.gems) {
      g.t += dt; g.mesh.rotation.y += dt * 4; g.mesh.position.y = 0.7 + Math.sin(g.t * 5) * 0.15;
      const dx = this.x - g.mesh.position.x; const dz = this.z - g.mesh.position.z; const d = Math.hypot(dx, dz) || 1;
      // restano a terra: le prendi passandoci vicino (il magnete ha raggio 4 m)
      if (d < (g.trail ? 2.6 : 4) || g.pull) {
        g.pull = true;
        const step = Math.min(d, 26 * dt);
        g.mesh.position.x += (dx / d) * step; g.mesh.position.z += (dz / d) * step;
        if (d < 1.1) {
          g.done = true; this.stage.scene.remove(g.mesh); this.xp += 1; this.score += 5; this.ev('gem');
          this.audio.sfx('coin'); this.gemAcc = (this.gemAcc || 0) + 1;
          this.fx.spawn(this.x, 1.4, this.z, { tex: 'green', size: 1.6, life: 0.35, grow: 1.2, spin: 4 });
          if (this.xp >= this.xpNeed()) this.evolve();
        }
      } else if (dz > 10) { g.done = true; this.stage.scene.remove(g.mesh); } // solo quando è dietro la telecamera
    }
    this.gems = this.gems.filter((g) => !g.done);
  }

  // il giocatore cade: l'orda si ritira un po', ti rialzi con tre cuori. Mai game over.
  knockOut() {
    this.ko++; this.ev('ko');
    this.hp = 4; this.hurtT = 2.6; this.hurtFlash = HURT_FLASH_S; this.calm = 8; this.shake = 0.7;
    this.audio.sfx('boom');
    this.fx.explode(this.x, 1.5, this.z + 2, 2.2);
    for (const e of this.enemies) if (!e.dead && !e.def.boss && Math.hypot(e.x - this.x, e.z - this.z) < 22) this.damage(e, 999);
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
      if (animated.has(e) || e.def.boss || e.contact > 0) { if (!e.w) this.wake(e); } else if (e.w && e.z - this.z > NEAR * 0.7) this.sleep(e);
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
      // camminano verso di te (ognuno con il proprio scarto laterale: non si ammassano in un punto); durante il colpo restano fermi
      const stop = e.contact > 0;
      if (!stop) e.z -= e.def.speed * dt;
      const near = e.z - this.z < 30;
      if (!stop) e.x += clamp(this.x * 0.7 + e.off - e.x, -1, 1) * dt * (near ? (e.def.fast ? 1.6 : 1.0) : 0.12);
      // gli scheletri schivano i colpi: un passo di lato quando un proiettile sta per arrivare
      if (e.def.dodge && !stop) this.dodge(e, dt);
      e.wob += dt; e.flash = Math.max(0, e.flash - dt);
      const lean = e.dodgeT > 0 ? Math.sign(e.dodgeV) * 0.3 : 0;
      if (e.w) {
        e.w.update(dt, e.def.style, stop ? 0 : e.def.speed);
        e.w.root.position.set(e.x, 0, e.z);
        e.w.root.rotation.y = Math.PI + clamp((e.x - this.x) * 0.02, -0.3, 0.3) + Math.sin(e.wob * 1.3) * 0.06;
        e.w.pivot.rotation.z = lerp(e.w.pivot.rotation.z, lean, Math.min(1, dt * 14));
        e.w.inner.scale.setScalar(this.kits[e.type].scale * e.sc * (e.flash > 0 ? 1.08 : 1));
      } else if (e.z - this.z < this.farRange) this.far[e.type]?.add(e.x, 0, e.z, Math.PI + Math.sin(e.wob * 1.3) * 0.1, e.sc, e.shade);
      // contatto con te o con un alleato
      const hit = (sx, sz) => Math.abs(e.z - sz) < (e.def.boss ? 2.6 : 1.0) && Math.abs(e.x - sx) < (e.def.boss ? 3.4 : 1.25);
      for (const a of this.allies) if (!a.dead && hit(a.x, a.z)) { a.dead = true; e.hp -= 3; }
      if (this.allies.some((a) => a.dead)) {
        for (const a of this.allies.filter((x) => x.dead)) { this.fx.explode(a.x, 1, a.z, 0.8); this.stage.scene.remove(a.r.root); }
        this.allies = this.allies.filter((a) => !a.dead);
        this.audio.sfx('hurt'); this.ev('allyLost');
      }
      if (e.contact > 0) { e.contact -= dt; if (e.contact <= 0 && !e.def.boss) this.damage(e, 999); continue; }
      if (e.def.boss && e.w) { e.atk -= dt; if (e.atk <= 0 && e.z - this.z < 9) { e.atk = 1.8; e.w.lungeDur = 0.6; e.w.lunge = 0.6; } }
      if (hit(this.x, this.z)) {
        if (this.overdrive > 0 && !e.def.boss) { this.damage(e, 999); continue; }
        if (this.hurtT <= 0) {
          this.hp -= 1; this.hurtT = 1.5; this.hurtFlash = HURT_FLASH_S; this.shake = 0.4; this.audio.sfx('hurt'); this.ev('hit');
          this.calm = Math.max(this.calm, 3); this.pop('−1 ♥', '#ff4d6d', 1); this.pressure = Math.max(0.5, this.pressure * 0.9); this.lastHitT = this.el;
          if (navigator.vibrate) navigator.vibrate(90);
          if (this.hp <= 0 && this.el >= 60) this.knockOut(); else if (this.hp <= 0) this.hp = 1;
        }
        // il colpo: affonda gli artigli, poi cade. Il Custode, se ti raggiunge, se ne va dopo il colpo
        if (!e.def.boss) { e.contact = 0.3; if (e.w) { e.w.lungeDur = 0.3; e.w.lunge = 0.3; } }
        else { this.bossAlive = false; e.dead = true; e.deadT = 0; this.fx.explode(e.x, 2, e.z, 1.5); this.say(t('games.horde.bossLeft'), '#ffb84d', 2, false, 2); }
      }
      if (e.z < this.z - 6) { e.dead = true; e.deadT = 2; this.passed++; if (e.def.boss) this.bossAlive = false; } // superati
    }
    this.enemies = this.enemies.filter((e) => {
      if (e.dead && e.deadT > 1.6) { this.sleep(e); return false; }
      return true;
    });
    for (const c of Object.values(this.far)) c.end();
  }

  dodge(e, dt) {
    e.dodgeCd -= dt;
    if (e.dodgeT > 0) { e.dodgeT -= dt; e.x = clamp(e.x + e.dodgeV * dt, -ROAD - 0.6, ROAD + 0.6); return; }
    if (e.dodgeCd > 0 || e.z - this.z > 40) return;
    for (const b of this.bullets) {
      const dz = e.z - b.mesh.position.z;
      if (dz > 1 && dz < 9 && Math.abs(b.mesh.position.x - e.x) < 0.7 && b.vz > 0) {
        e.dodgeV = (e.x >= b.mesh.position.x ? 1 : -1) * 4.2; if (Math.abs(e.x) > ROAD - 0.3) e.dodgeV = -Math.sign(e.x) * 4.2;
        e.dodgeT = 0.3; e.dodgeCd = 1.3; return;
      }
    }
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
    // gli alleati si pongono a turno (un fotogramma su due, con il passo di tempo giusto): le pose sulle ossa costano
    this.allies.forEach((a, i) => {
      const k = 1 - Math.exp(-dt * 4);
      a.x = lerp(a.x, clamp(this.x + a.slot[0], -ROAD - 0.6, ROAD + 0.6), k); a.z = lerp(a.z, this.z + a.slot[1], k);
      a.born = Math.min(1, a.born + dt / 0.4); a.r.root.scale.setScalar(RIDER_S * (0.2 + 0.8 * (1 - (1 - a.born) ** 2)));
      a.r.root.position.set(a.x, 0, a.z);
      a.r.root.rotation.y = clamp((this.x + a.slot[0] - a.x) * -0.1, -0.3, 0.3);
      a.acc = (a.acc || 0) + dt;
      if ((this.frame + i) % 2 === 0) { a.r.pose(a.acc, cad, 8, { stand: this.sprinting ? 1 : 0 }); a.acc = 0; }
    });
    for (const g of this.gates) if (!g.used) g.panel.material.opacity = 0.12 + Math.sin(this.t * 6) * 0.03;
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
    this.player.pose(dt, 70, 5);
    for (const c of Object.values(this.far)) c.begin();
    for (const e of this.enemies) if (!e.dead && e.z - this.z < this.farRange && !e.w) this.far[e.type]?.add(e.x, 0, e.z, Math.PI, e.sc, e.shade);
    for (const c of Object.values(this.far)) c.end();
    this.world(dt);
    this.camera(dt);
  }

  // telecamera bassa e vicina: il ciclista è grande, l'orda riempie lo schermo
  camera(dt) {
    const cam = this.stage.camera;
    const sx = this.shake > 0 ? (this.rnd() - 0.5) * this.shake * 0.6 : 0;
    const sy = this.shake > 0 ? (this.rnd() - 0.5) * this.shake * 0.3 : 0;
    const target = new THREE.Vector3(this.x * 0.6 + sx, 3.3 + sy, this.z - 7.0);
    if (!this.camInit) { cam.position.copy(target); this.camInit = true; }
    cam.position.lerp(target, 1 - Math.exp(-dt * 6));
    // solo nel menu: il ciclista sta nella fascia libera (verticale: tra testo e tasto; orizzontale: a destra della colonna di testo)
    const { W, H } = this.stage; const m = this.menu; const menuOn = this.state === 'menu' && m.contentBottom;
    const wantX = menuOn && W > H * 1.15 ? -1.3 : 0; const wantY = menuOn && W <= H * 1.15 ? 0.55 : 0;
    this.menuOffX = lerp(this.menuOffX || 0, wantX, 1 - Math.exp(-dt * 4)); this.menuOffY = lerp(this.menuOffY || 0, wantY, 1 - Math.exp(-dt * 4));
    cam.lookAt(this.x * 0.7 + this.menuOffX, 0.8 + this.menuOffY, this.z + 8);
    const wantFov = 60 + (this.overdrive > 0 ? 4 : 0);
    this.fov = lerp(this.fov, wantFov, 1 - Math.exp(-dt * 5));
    cam.fov = this.fov; cam.far = 520; cam.updateProjectionMatrix();
    this.sky.follow(cam, this.x, this.z);
  }

  // ---------- interfaccia ----------
  // in alto: punteggio · ondata n/N · cuori; sotto, la richiesta del momento (tratto, watt, tempo) e le barre.
  // in basso la potenza con il numero grande e il bersaglio. Tutto con kit/hud.js: leggibile da 1 m, senza sovrapposizioni.
  drawHud(dt) {
    const { ctx, W, H } = this.stage;
    ctx.clearRect(0, 0, W, H); hudView(ctx, W, H);
    if (this.state === 'loading') { ctx.fillStyle = '#0f0e0c'; ctx.fillRect(0, 0, W, H); hudText(ctx, t('games.common.loading'), W / 2, H / 2, { size: 22, align: 'center', color: '#d9ff3d' }); hudText(ctx, `${Math.round((this.loadPct || 0) * 100)}%`, W / 2, H / 2 + 28, { size: 14, align: 'center' }); return; }
    if (this.state === 'error') { hudText(ctx, t('ui.error', { error: this.error }), W / 2, H / 2, { size: 14, align: 'center', color: '#ff6b6b' }); return; }
    if (this.state === 'menu') { this.drawMenu(ctx, W, H, dt); return; }
    if (this.state === 'results' && this.result) { this.drawOver(ctx, W, H, dt); return; }
    const w = WEAPONS[this.weapon]; const seg = this.seg;
    const pad = 12; const y0 = 84; // sotto la barra del gioco (titolo, audio, esci)
    // riga in alto
    ctx.fillStyle = 'rgba(8,10,26,.62)'; rrect(ctx, pad - 4, y0 - 22, W - 2 * pad + 8, 36, 10); ctx.fill();
    hudText(ctx, String(this.score), pad + 6, y0 + 5, { size: 26, maxW: 100 });
    const wn = seg.kind === 'warm' ? t('games.horde.seg.warm') : seg.kind === 'cool' ? t('games.horde.seg.cool') : t('games.horde.waveOf', { n: seg.wave, m: this.plan.N });
    hudText(ctx, wn, W / 2, y0 + 3, { size: W < 400 ? 19 : 22, align: 'center', color: '#d9ff3d', maxW: W - 2 * (pad + 100) });
    let hx = W - pad - 4 - (this.maxHp - 1) * 18;
    for (let i = 0; i < this.maxHp; i++) { hudText(ctx, i < this.hp ? '♥' : '♡', hx + i * 18, y0 + 4, { size: 21, color: i < this.hp ? '#ff4d6d' : '#7a7a99', align: 'center' }); }
    // la richiesta del momento: tratto, watt, tempo che manca
    const col = SEG_COLOR[seg.kind]; const by = y0 + 22; const bh2 = 44;
    ctx.fillStyle = 'rgba(8,10,26,.72)'; rrect(ctx, pad - 4, by, W - 2 * pad + 8, bh2, 12); ctx.fill();
    ctx.fillStyle = col; rrect(ctx, pad - 4, by, 7, bh2, 3); ctx.fill();
    const tw = this.tgtW || targetW(seg, this.ftp, this.level.k, this.adapt.value, this.el);
    // con un allenamento: nome del passo e tempo che manca alla fine del passo (la striscia dell'app è nascosta)
    const left = Math.max(0, Math.ceil((this.wk ? seg.stepEnd : seg.t1) - this.el));
    hudText(ctx, this.wk ? (seg.label || t(`games.wk.seg.${seg.wkKind}`)) : t(`games.horde.seg.${seg.kind}`), pad + 12, by + 29, { size: 21, color: col, maxW: W * 0.34 });
    hudText(ctx, `${tw} W`, W / 2 + 8, by + 32, { size: 32, align: 'center', color: this.inTarget || seg.kind === 'rest' || seg.kind === 'cool' || seg.kind === 'warm' ? '#ffffff' : '#ffd34d', maxW: W * 0.34 });
    hudText(ctx, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, W - pad - 4, by + 29, { size: 21, align: 'right', color: '#e8e8f4', maxW: 70 });
    // barra del tratto (cala) e barra dell'allenamento intero con i confini delle ondate
    const segK = this.wk ? clamp((seg.stepEnd - this.el) / (seg.stepEnd - seg.stepStart), 0, 1) : clamp((seg.t1 - this.el) / (seg.t1 - seg.t0), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; rrect(ctx, pad, by + bh2 + 4, W - 2 * pad, 6, 3); ctx.fill();
    ctx.fillStyle = col; rrect(ctx, pad, by + bh2 + 4, Math.max(6, (W - 2 * pad) * segK), 6, 3); ctx.fill();
    const ty = by + bh2 + 15; const tk = clamp(this.el / this.total, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; rrect(ctx, pad, ty, W - 2 * pad, 5, 2.5); ctx.fill();
    ctx.fillStyle = '#d9ff3d'; rrect(ctx, pad, ty, Math.max(5, (W - 2 * pad) * tk), 5, 2.5); ctx.fill();
    ctx.fillStyle = 'rgba(8,10,26,.9)';
    for (const [i, s] of this.plan.segs.entries()) if (this.wk ? (s.wave >= 1 && s.wave !== this.plan.segs[i - 1]?.wave) : s.kind === 'pace') ctx.fillRect(pad + (W - 2 * pad) * (s.t0 / this.total) - 1, ty - 1, 2, 7);
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

    // in basso: potenza (numero grande + barra con il bersaglio), arma ed evoluzione
    const bh = 22; const barY = H - 16 - bh; const bx = pad + 2; const bw2 = W - 2 * pad - 4;
    const gr = ctx.createLinearGradient(0, H - 128, 0, H); gr.addColorStop(0, 'rgba(6,8,22,0)'); gr.addColorStop(0.35, 'rgba(6,8,22,.55)'); gr.addColorStop(1, 'rgba(6,8,22,.82)');
    ctx.fillStyle = gr; ctx.fillRect(0, H - 128, W, 128);
    const big = W < 500 ? 56 : 64;
    const pc = this.sprinting ? '#4de3ff' : this.inTarget ? '#d9ff3d' : '#ffffff';
    const numW = hudText(ctx, String(Math.round(this.power)), pad + 4, barY - 10, { size: big, color: pc, maxW: 150 });
    hudText(ctx, 'W', pad + 8 + numW, barY - 10, { size: 22, color: '#e8e8f4' });
    const free = W - 2 * pad - numW - 56; // spazio per arma e cadenza di fuoco, a destra del numero
    const rx = W - pad - 4;
    hudText(ctx, t(w.name), rx, barY - 56, { size: W < 400 ? 17 : 20, align: 'right', color: w.color, maxW: Math.max(90, free) });
    const ew = Math.min(170, W * 0.42);
    ctx.fillStyle = 'rgba(255,255,255,.2)'; rrect(ctx, rx - ew, barY - 50, ew, 8, 4); ctx.fill();
    ctx.fillStyle = w.color; rrect(ctx, rx - ew, barY - 50, Math.max(8, ew * (Number.isFinite(w.xp) ? clamp(this.xp / this.xpNeed(), 0, 1) : 1)), 8, 4); ctx.fill();
    hudText(ctx, `${t('games.horde.fireRate', { n: fmtDec(this.fireRate || 0, 1) })} · ${t('games.horde.alliesHud', { n: this.allies.length })}`, rx, barY - 20, { size: 15, align: 'right', color: '#e8e8f4', font: 'text', maxW: Math.max(90, free) });
    // barra potenza con il bersaglio: tacca bianca e fascia chiara da 92 % in su
    ctx.fillStyle = 'rgba(8,10,26,.75)'; rrect(ctx, bx, barY, bw2, bh, 8); ctx.fill();
    const maxW = Math.max(this.ftp * 1.7, tw * 1.25);
    ctx.fillStyle = pc; rrect(ctx, bx, barY, Math.max(8, bw2 * clamp(this.power / maxW, 0, 1)), bh, 8); ctx.fill();
    const t0 = bx + bw2 * clamp(0.92 * tw / maxW, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(t0, barY, Math.max(2, bx + bw2 * clamp(tw * 1.15 / maxW, 0, 1) - t0), bh);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw2 * clamp(tw / maxW, 0, 1) - 1, barY - 4, 3, bh + 8);

    this.msgs.draw(ctx, W, H, { u: W < 500 ? 0.9 : 1.1, y: H * 0.33 });
    const v3 = new THREE.Vector3();
    for (const p of this.pops) {
      p.t -= dt; const k = 1 - p.t / p.t0;
      v3.set(p.x, 3.0 + k * 2.0, p.z).project(this.stage.camera);
      ctx.globalAlpha = clamp(p.t / p.t0 * 2, 0, 1);
      hudText(ctx, p.text, clamp((v3.x + 1) / 2 * W + (p.slot ? 34 : -34), 40, W - 40), (1 - v3.y) / 2 * H, { size: 24, align: 'center', color: p.color });
      ctx.globalAlpha = 1;
    }
    this.pops = this.pops.filter((p) => p.t > 0 && this.state !== 'results');
    hurtVignette(ctx, W, H, (this.hurtFlash || 0) / HURT_FLASH_S);
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

  drawMenu(ctx, W, H, dt) {
    const connected = this.hooks.connected();
    this.menu.draw(ctx, W, H, { connected });
    this.hooks.progress?.drawToasts(ctx, W, dt);
  }

  // fine partita: il riepilogo comune (stelle, criteri, punteggio, record)
  drawOver(ctx, W, H, dt) {
    const r = this.result;
    const hint = r.hint ? t(r.hint.key, { n: r.hint.n }) : null;
    this.results.draw(ctx, W, H, {
      title: t('games.horde.res.title'), stars: r.stars, score: r.score,
      criteria: r.wk ? [
        { ok: true, label: t('games.wk.res.done') },
        { ok: r.band >= 0.85, label: t('games.wk.res.band', { p: Math.round(r.band * 100) }) },
        { ok: r.bossKilled >= r.bossTotal, label: t('games.horde.res.bosses', { a: r.bossKilled, b: r.bossTotal }) },
      ] : [
        { ok: r.ratio >= 0.8, label: t('games.horde.res.efforts', { a: r.done, b: r.total }) },
        { ok: r.bossKilled >= r.bossTotal, label: t('games.horde.res.bosses', { a: r.bossKilled, b: r.bossTotal }) },
        { ok: r.ko <= 3, label: t('games.horde.res.falls', { n: r.ko }) },
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
    line(r.wk ? t('games.wk.res.band', { p: Math.round(r.band * 100) }) : t('games.horde.res.efforts', { a: r.done, b: r.total }));
    line(t('games.horde.res.bosses', { a: r.bossKilled, b: r.bossTotal }) + ' · ' + t('games.horde.res.falls', { n: r.ko }));
    line(`${t('games.common.score', { n: r.score })}${r.newBest ? t('games.common.newBest') : ''}`, r.newBest ? '#7dff6a' : '#f0f0f0');
    if (r.hint) line(t(r.hint.key, { n: r.hint.n }), '#ffd34d');
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
