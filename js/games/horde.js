// L'ORDA — sparatutto "a orde" su bici, in 3D (modelli Meshy, stile di Turbo Pedali).
// Parti con una pistola contro pochi zombi; ondate sempre più grandi, armi che evolvono,
// portali che danno alleati e potenziamenti. + / − sterzano (tenuti premuti), i watt decidono la cadenza,
// lo sprint scatena l'OVERDRIVE.
// Grafica: ciclisti Meshy con scheletro automatico e pose sulle ossa; nemici Meshy con animazione procedurale
// (vicini: ossa vere, fino a un tetto che dipende dalla qualità; lontani: istanze in posa cotta); cimitero di notte.
import { THREE, Stage, loadAll, Pool, Effects, labelTexture, tracer, fxTexture, Cyclist, makeKit, loadCyclistTemplate, toonMaterial, prepareModel, Quality } from './kit3d.js';
import { loadMeshyTemplate, CYCLIST_URL, MESHY_FAN_URL, BIKE } from './kit/cyclist.js';
import { Walker, FarCrowd, makeEnemyKit, bakePose, enemyMaterial } from './kit/walkers.js';
import { buildSky, buildGround, Scenery, LampLights, ROAD_W } from './horde-world.js';
import { Effort, clamp, lerp, pick, hash } from './engine.js';
import { txt as hudText, hudView, paragraph, wrapLines, MessageQueue, HUD, loadHudFonts } from './kit/hud.js';
import { t, fmtDec } from '../i18n.js';
import { SONGS } from './audio.js';

const M = 'assets/3d/meshy';
// strada larga: ti muovi liberamente (tieni premuto + / − per sterzare)
const ROAD = 7.2;           // metà larghezza percorribile
const NUDGE = 1.6;          // spostamento di un tocco singolo
const STEER = 9;            // m/s tenendo premuto
const SPAWN_Z = 120;        // i nemici compaiono lontano e si vedono arrivare
const MAX_ALIVE = 320;
const NEAR = 52;            // entro questa distanza un nemico può avere le ossa (fino al tetto della qualità)
const ANIM_CAP = { high: 26, medium: 16, low: 9 }; // nemici animati con ossa, per livello di qualità
const RIDER_S = 1.3;        // il ciclista è un po' più grande del vero: si legge dall'alto
// i nemici diventano più robusti a ogni ondata: le armi migliori servono davvero
// dopo l'ondata 8 crescono ancora più in fretta: la partita ha una fine, anche se hai tutti i potenziamenti
const waveHp = (w) => Math.pow(1.2, w - 1) * (1 + Math.max(0, w - 8) * 0.7);
const FORMATION = [[-1.3, -1.6], [1.3, -1.6], [0, -2.8], [-2.6, -2.8], [2.6, -2.8], [-1.3, -4], [1.3, -4], [-2.6, -5.2], [2.6, -5.2], [0, -5.2], [-1.3, -6.4], [1.3, -6.4]];

const GUN_FLIP = 1; // verso della canna del blaster Meshy rispetto a +Z (1 o −1)

const WEAPONS = [
  { name: 'games.horde.w.pistol', rate: 2.2, dmg: 1, shots: 1, spread: 0, speed: 38, color: '#fff3a0', xp: 20 },
  { name: 'games.horde.w.revolver', rate: 2.6, dmg: 1.6, shots: 1, spread: 0, speed: 40, color: '#ffd166', xp: 50 },
  { name: 'games.horde.w.smg', rate: 6, dmg: 1, shots: 1, spread: 0.05, speed: 42, color: '#ffe08a', xp: 135 },
  { name: 'games.horde.w.pump', rate: 1.6, dmg: 1.4, shots: 6, spread: 0.32, speed: 34, color: '#ff9f43', xp: 210 },
  { name: 'games.horde.w.mg', rate: 9, dmg: 1.4, shots: 1, spread: 0.06, speed: 46, color: '#ffd166', xp: 330 },
  { name: 'games.horde.w.rifle', rate: 7, dmg: 2.4, shots: 2, spread: 0.08, speed: 50, color: '#b8f2ff', xp: 480 },
  { name: 'games.horde.w.rocket', rate: 1.6, dmg: 10, shots: 1, spread: 0, speed: 26, color: '#ff6b35', splash: 3.2, xp: 690 },
  { name: 'games.horde.w.plasma', rate: 3.2, dmg: 7, shots: 1, spread: 0, speed: 34, color: '#c77dff', splash: 2.2, pierce: true, xp: 960 },
  { name: 'games.horde.w.minigun', rate: 18, dmg: 2.2, shots: 1, spread: 0.1, speed: 52, color: '#7dff6a', xp: 1350 },
  { name: 'games.horde.w.laser', rate: 10, dmg: 5, shots: 1, spread: 0, speed: 80, color: '#4de3ff', pierce: true, xp: Infinity },
];

const ENEMIES = {
  zombie: { file: 'zombie', h: 2.1, rad: 0.6, hp: 3, speed: 1.7, style: 'walk', xp: 1, score: 10 },
  runner: { file: 'zombie_runner', h: 2.0, rad: 0.55, hp: 2, speed: 3.6, style: 'run', xp: 1, score: 15, fast: true },
  skeleton: { file: 'skeleton', h: 2.1, rad: 0.6, hp: 4, speed: 2.6, style: 'bones', xp: 2, score: 20 },
  brute: { file: 'zombie_brute', h: 2.8, rad: 0.85, hp: 14, speed: 2.0, style: 'brute', xp: 4, score: 50 },
  keeper: { file: 'ogre', h: 6.2, rad: 2.2, hp: 260, speed: 1.1, style: 'boss', xp: 40, score: 1000, boss: true },
};

const WAVE_MIN_S = 28, WAVE_MAX_S = 50; // durata minima e massima di un'ondata
const GATE_EVERY = [16, 22];            // secondi fra una coppia di portali e la successiva

const GATES = [
  { text: 'games.horde.gate.ally1', good: true, w: 5, apply: (g) => g.addAllies(1), ally: true },
  { text: 'games.horde.gate.ally2', good: true, w: 3, apply: (g) => g.addAllies(2), ally: true },
  { text: 'games.horde.gate.allyx2', good: true, w: 1, apply: (g) => g.addAllies(Math.max(1, g.allies.length)), ally: true },
  { text: 'games.horde.gate.rateUp', good: true, w: 4, apply: (g) => { g.rateMul *= 1.3; } },
  { text: 'games.horde.gate.dmgUp', good: true, w: 4, apply: (g) => { g.dmgMul *= 1.4; } },
  { text: 'games.horde.gate.life', good: true, w: 2, apply: (g) => { g.hp = Math.min(g.maxHp, g.hp + 1); }, life: true },
  { text: 'games.horde.gate.weapon', good: true, w: 2, apply: (g) => g.evolve() },
  { text: 'games.horde.gate.allyDown', good: false, w: 3, apply: (g) => g.loseAlly(), ally: false },
  { text: 'games.horde.gate.rateDown', good: false, w: 2, apply: (g) => { g.rateMul *= 0.8; } },
];

export class Horde {
  constructor(hudCanvas, hooks, audio) {
    this.hudCanvas = hudCanvas; this.hooks = hooks; this.audio = audio;
    this.active = false; this.best = Number(localStorage.getItem('hordeBest')) || 0;
    this.loop = this.loop.bind(this);
  }

  async start() {
    this.active = true;
    this.quality = new Quality();
    this.stage = new Stage(this.hudCanvas, { quality: this.quality });
    this.stage.onQuality = (cfg) => this.applyQuality(cfg);
    this.effort = new Effort();
    this.state = 'loading'; this.t = 0; this.msgs = new MessageQueue(); this.power = 0; this.cadence = 0;
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
      if (!this.active) return;
      this.build();
      this.state = 'menu'; this.stateT = 0;
    } catch (err) { console.error(err); this.state = 'error'; this.error = err.message; }
  }

  stop() {
    this.active = false; this.audio.stopSong(); this.hooks.setGrade(null);
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
    this.bullets = []; this.bulletPool = new Pool(scene, () => tracer(), 200);
    this.fx = new Effects(scene, 220);
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
    this.initGuns(); this.initPortal();
    this.pops = [];
    this.applyQuality(this.quality.cfg);
    this.reset();
  }

  applyQuality(cfg) {
    if (!this.scenery) return;
    this.scenery.setDensity(cfg.density);
    this.animCap = ANIM_CAP[this.quality.level] || 16;
    this.farRange = { high: 150, medium: 125, low: 95 }[this.quality.level] || 125; // oltre questa distanza la folla non si disegna (è nella nebbia)
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
    const s = (0.5 + wi * 0.045) / this.gunLen; g.add(wrap); g.scale.setScalar(s);
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
    for (const g of this.gates || []) scene.remove(g.group);
    for (const gm of this.gems || []) scene.remove(gm.mesh);
    if (this.player) scene.remove(this.player.root);
    for (const b of this.bullets) b.mesh.visible = false;
    this.bullets = [];
    this.z = 0; this.x = 0; this.tx = 0; this.held = 0; this.heldT = 0; this.hp = 5; this.maxHp = 6; this.pops = [];
    this.pressure = 1; this.calmT = 0; this.waveKills = 0;
    this.weapon = 0; this.xp = 0; this.rateMul = 1; this.dmgMul = 1;
    this.kills = 0; this.score = 0; this.wave = 1; this.waveT = 0; this.spawnAcc = 0;
    this.enemies = []; this.allies = []; this.gates = []; this.gems = [];
    this.gateT = 9; this.gateN = 0; this.lastGates = []; this.overdrive = 0; this.odMeter = 0; this.hurtT = 0; this.shake = 0; this.bossAlive = false;
    this.player = this.makeRider('#d9ff3d', 0, 0);
    this.fireT = 0; this.camInit = false; this.frame = 0;
    this.scenery.update(this.z, true);
  }

  // ---------- gioco ----------
  input(dir) {
    this.audio.ensure();
    if (this.state === 'menu') { if (dir > 0 && this.stateT > 0.4) this.begin(); return; }
    if (this.state === 'over') { if (this.stateT > 1.4) { this.reset(); this.begin(); } return; }
    if (this.state !== 'play') return;
    this.tx = clamp(this.tx - dir * NUDGE, -ROAD, ROAD); // destra sullo schermo = −X (camera rivolta a +Z)
  }

  // tenuto premuto: sterzata continua
  hold(dir) { this.held = dir; this.heldT = 0; }

  begin() {
    this.state = 'play'; this.stateT = 0; this.hooks.runStart?.();
    this.audio.playSong(SONGS.factory); this.audio.sfx('go');
    this.say(t('games.horde.wave', { n: 1 }), '#d9ff3d', 2, true);
  }

  // testo che sale dal giocatore (feedback immediato di cosa hai preso)
  pop(text, color, t = 1) { this.pops.push({ text, color, t, t0: t, x: this.x, z: this.z }); }

  // messaggi a centro schermo: uno alla volta, con priorità (kit/hud.js MessageQueue). prio: 1 normale, 2 grande, 3 boss
  say(text, color = '#ffd34d', t = 1.6, big = false, prio = big ? 2 : 1) { this.msgs.say(text, { color, dur: t, big, prio }); }
  prog(stat, n = 1, xp = 0) { this.hooks.progress?.event(stat, n, xp); }

  addAllies(n) {
    const jerseys = ['#4de3ff', '#ff4d9d', '#ffd166', '#06d6a0', '#ff922b', '#7b2cbf', '#3a86ff', '#e63946'];
    for (let i = 0; i < n && this.allies.length < FORMATION.length; i++) {
      const k = this.allies.length;
      const r = this.makeRider(jerseys[k % jerseys.length], k + 1, this.weapon, true);
      r.setShadows(false);
      const slot = FORMATION[k];
      const a = { r, slot, fireT: Math.random() * 0.5, x: this.x + slot[0], z: this.z + slot[1] - 4 };
      this.allies.push(a);
      this.fx.spawn(a.x, 1, a.z, { tex: 'green', size: 2.5, life: 0.5 });
    }
    this.say(t('games.horde.alliesSay', { n: this.allies.length }), '#06d6a0', 1.4);
  }

  loseAlly() {
    const a = this.allies.pop(); if (!a) return;
    this.fx.explode(a.x, 1, a.z, 0.8);
    this.stage.scene.remove(a.r.root);
  }

  evolve() {
    if (this.weapon >= WEAPONS.length - 1) { this.dmgMul *= 1.15; return; }
    this.weapon++; this.xp = 0;
    const w = WEAPONS[this.weapon];
    this.mountGun(this.player, this.weapon);
    for (const a of this.allies) this.mountGun(a.r, this.weapon);
    this.say(t('games.horde.newWeapon', { name: t(w.name) }), w.color, 2.4, true);
    this.audio.sfx('overdrive'); this.shake = 0.3;
    this.fx.spawn(this.x, 1.4, this.z, { tex: 'spark', size: 4, life: 0.6 });
  }

  spawnEnemy(type, x, z) {
    const def = ENEMIES[type];
    const hp = Math.round(def.boss ? def.hp * Math.pow(1.12, this.wave - 1) * 1.2 : def.hp * waveHp(this.wave)); // il Custode cresce più piano della folla
    const e = { type, def, w: null, x, z, hp, maxHp: hp, dead: false, deadT: 0, flash: 0, wob: Math.random() * 6, shade: 0.78 + Math.random() * 0.3, contact: 0, atk: 1 + Math.random() };
    this.enemies.push(e);
  }

  // da "folla" a personaggio con le ossa quando si avvicina (e viceversa quando c'è troppa gente vicina)
  wake(e) {
    const list = this.walkers[e.type];
    const w = list.pop() || new Walker(this.kits[e.type]);
    w.body.castShadow = this.quality.level === 'high';
    w.root.visible = true; w.fall = 0; w.lunge = 0; w.hit = 0; w.pivot.rotation.x = 0; w.pivot.position.y = 0; w.inner.scale.setScalar(this.kits[e.type].scale);
    w.update(Math.random() * 0.5, e.def.style, e.def.speed);
    if (!w.root.parent) this.stage.scene.add(w.root);
    e.w = w;
  }
  sleep(e) { if (!e.w) return; e.w.root.visible = false; this.walkers[e.type].push(e.w); e.w = null; }

  update(dt) {
    this.t += dt;
    const connected = this.hooks.connected(); const st = this.hooks.stats();
    const demoSprint = !connected && (this.t % 20) > 15;
    this.power = connected ? st.power || 0 : demoSprint ? 320 : 180;
    this.cadence = connected ? st.cadence || 0 : 88;
    const kmh = connected ? this.hooks.speedKmh() : 28;
    this.sprinting = this.effort.update(this.power, dt, connected ? 50 : 0);
    if (this.audio.song) this.audio.setTempo(this.audio.song.bpm * clamp((this.cadence || 85) / 88, 0.85, 1.25));
    this.msgs.update(dt);
    if (this.state === 'loading' || this.state === 'error') return;
    this.fx.update(dt);
    this.stateT += dt;
    if (this.state !== 'play') { this.animateIdle(dt); return; }

    // avanzamento
    const v = Math.max(1.5, (kmh / 3.6) * 0.75);
    this.z += v * dt;
    if (this.held) { this.heldT += dt; if (this.heldT > 0.12) this.tx = clamp(this.tx - this.held * STEER * dt, -ROAD, ROAD); }
    this.x = lerp(this.x, this.tx, Math.min(1, dt * 8));
    this.shake = Math.max(0, this.shake - dt); this.hurtT = Math.max(0, this.hurtT - dt);
    const g = this.bossAlive ? 4 : Math.round((1.5 + 1.5 * Math.sin(this.z / 140)) * 2) / 2;
    if (g !== this.sentGrade) { this.sentGrade = g; this.hooks.setGrade(g); }

    // overdrive
    if (this.overdrive > 0) { this.overdrive -= dt; if (this.overdrive <= 0) this.audio.transpose = 0; }
    else {
      this.odMeter = clamp(this.odMeter + (this.sprinting ? dt / 3 : -dt / 25), 0, 1);
      if (this.odMeter >= 1) { this.overdrive = 7; this.odMeter = 0; this.audio.transpose = 2; this.audio.sfx('overdrive'); this.say(t('games.horde.overdrive'), '#4de3ff', 2, true); this.prog('overdrives', 1, 15); }
    }

    // ondate
    this.waveT += dt;
    // l'ondata finisce quando ne abbatti abbastanza (ma non prima di 28 s) o dopo 50 s: il ritmo segue la tua forza, senza correre
    if ((this.waveKills >= 12 + this.wave * 10 && this.waveT > WAVE_MIN_S) || this.waveT > WAVE_MAX_S) {
      this.waveT = 0; this.wave++; this.waveKills = 0;
      this.hooks.progress?.setMax('hordeWave', this.wave);
      if (this.wave % 5 === 0) { this.spawnEnemy('keeper', 0, this.z + 70); this.bossAlive = true; this.audio.sfx('alarm'); this.say(t('games.horde.waveBoss', { n: this.wave }), '#ff4d4d', 3, true, 3); }
      else this.say(t('games.horde.wave', { n: this.wave }), '#d9ff3d', 2, true);
    }
    // regista: i nemici arrivano a gocce e poi a fiumi; si adatta a come stai andando
    const alive = this.enemies.filter((e) => !e.dead).length;
    this.calmT += dt;
    const capNow = Math.min(MAX_ALIVE, 14 + this.wave * 8 + this.wave * this.wave * 1.2);
    // la pressione sale solo se la folla è sotto controllo; se si accumula, il direttore allenta
    if (alive > capNow * 0.55) this.pressure = Math.max(0.55, this.pressure - dt * 0.03);
    else if (this.calmT > 12) this.pressure = Math.min(1.5, this.pressure + dt * 0.006);
    const firepower = (1 + this.allies.length * 0.85) * WEAPONS[this.weapon].rate * WEAPONS[this.weapon].dmg * WEAPONS[this.weapon].shots * this.rateMul * this.dmgMul;
    const hpScale = waveHp(this.wave);
    // quanti nemici al secondo riesci (circa) ad abbattere: la pressione resta un po' sotto o sopra
    const killRate = firepower / (3 * hpScale);
    const rate = clamp(killRate * (this.wave === 1 ? 0.45 : 0.62 + this.wave * 0.11) * this.pressure, 0.35, 40) * (this.bossAlive ? 0.25 : 1);
    this.spawnAcc += rate * dt;
    const cap = Math.min(MAX_ALIVE, Math.round((14 + this.wave * 8 + this.wave * this.wave * 1.2) * Math.min(1.3, this.pressure))); // le orde crescono sempre più in fretta
    while (this.spawnAcc >= 1 && alive < cap) {
      const group = Math.min(16, 1 + Math.floor(Math.random() * (1 + this.wave * 0.9)));
      this.spawnAcc -= group;
      const r = Math.random();
      const type = this.wave >= 3 && r < 0.1 ? 'brute' : this.wave >= 2 && r < 0.35 ? 'runner' : this.wave >= 4 && r < 0.5 ? 'skeleton' : 'zombie';
      const cx = (Math.random() * 2 - 1) * (ROAD - 1);
      for (let i = 0; i < group; i++) this.spawnEnemy(type, clamp(cx + (Math.random() - 0.5) * (2 + group * 0.5), -ROAD - 0.5, ROAD + 0.5), this.z + SPAWN_Z + Math.random() * 10 + i * 0.7);
    }
    if (alive >= cap) this.spawnAcc = Math.min(this.spawnAcc, 1);

    // portali
    // a tempo (non a distanza): uno ogni 16–22 s per tutta la partita, anche durante il boss
    this.gateT -= dt;
    if (this.gateT <= 0) { this.spawnGates(this.z + 75); this.gateT = GATE_EVERY[0] + Math.random() * (GATE_EVERY[1] - GATE_EVERY[0]); }

    this.rateMul = Math.min(this.rateMul, 2.2); this.dmgMul = Math.min(this.dmgMul, 3.5); // i potenziamenti hanno un tetto
    this.updateShooters(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt, v);
    this.updateGates();
    this.updateGems(dt);
    this.animate(dt);
  }

  // ---------- portali: arco di pietra Meshy con energia blu (buono) o rossa (cattivo) ----------
  initPortal() {
    const info = prepareModel(this.m.portal); const b = info.box; const w = b.max.x - b.min.x; const d = b.max.z - b.min.z;
    const cx = (b.min.x + b.max.x) / 2; const cz = (b.min.z + b.max.z) / 2;
    if (!info.dressed) { for (const p of info.parts) p.geo.translate(-cx, -b.min.y, -cz); info.dressed = true; }
    this.portal = { info, wide: Math.max(w, d), turn: w < d ? Math.PI / 2 : 0, height: info.height };
    const mk = (bad) => info.parts.map((pt) => {
      const m = toonMaterial({ map: pt.mat === 'vc' ? null : pt.mat, vertexColors: pt.mat === 'vc' });
      if (bad) { m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        if (diffuseColor.b - diffuseColor.r > 0.18) diffuseColor.rgb = vec3(diffuseColor.b, diffuseColor.g * 0.22, diffuseColor.r * 0.8);`); }; m.customProgramCacheKey = () => 'portal-bad'; }
      return m;
    });
    this.portalMats = { good: mk(false), bad: mk(true) };
  }

  // sceglie un portale: pesi di base, più chi serve (alleati se sei solo, vita se sei ferito), mai gli stessi degli ultimi due
  rollGate(avoid, good) {
    const wt = (g) => {
      let w = g.w;
      if (this.lastGates.includes(g)) w *= 0.15;
      if (g.life && this.hp < this.maxHp) w *= 1 + (this.maxHp - this.hp) * 0.8;
      if (g.ally && this.allies.length < 3) w *= 2;
      if (g.ally === false && this.allies.length === 0) w = 0;
      return w;
    };
    const pool = GATES.filter((g) => g !== avoid && g.good === good && wt(g) > 0);
    let r = Math.random() * pool.reduce((a, g) => a + wt(g), 0);
    for (const g of pool) if ((r -= wt(g)) < 0) return g;
    return pool[0];
  }

  spawnGates(z) {
    // una coppia: di solito due buoni diversi, a volte un buono e un rosso da evitare (mai due rossi)
    const wantBad = this.gateN++ >= 2 && Math.random() < 0.4;
    const a = this.rollGate(null, true);
    const pair = [a, wantBad ? this.rollGate(null, false) : this.rollGate(a, true)];
    this.lastGates = [...pair, ...this.lastGates].slice(0, 3);
    if (Math.random() < 0.5) pair.reverse();
    const P = this.portal; const width = ROAD - 0.5; const s = width / P.wide; const sy = Math.min(s, 6.2 / P.height);
    for (const [def, x] of [[pair[0], -ROAD / 2], [pair[1], ROAD / 2]]) {
      const group = new THREE.Group();
      const col = def.good ? '#2b8cff' : '#ff3b3b';
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.6, 3.4), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      panel.position.y = 2.1; group.add(panel);
      const frame = new THREE.Group();
      P.info.parts.forEach((pt, i) => { const m = new THREE.Mesh(pt.geo, this.portalMats[def.good ? 'good' : 'bad'][i]); frame.add(m); });
      frame.rotation.y = P.turn; frame.scale.set(s, sy, s); group.add(frame);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), new THREE.MeshBasicMaterial({ map: labelTexture(t(def.text), null, '#ffffff'), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      label.position.set(0, 2.2, -0.05); label.rotation.y = Math.PI; group.add(label);
      group.position.set(x, 0, z);
      this.stage.scene.add(group);
      this.gates.push({ def, x, z, group, used: false });
    }
  }

  updateGates() {
    for (const g of this.gates) {
      if (g.used || this.z < g.z) continue;
      g.used = true;
      // passa dal portale della propria metà strada (la corsia centrale passa in mezzo)
      if (Math.abs(this.x - g.x) < ROAD / 2 + 0.2) {
        g.def.apply(this);
        this.say(t(g.def.text), g.def.good ? '#4de3ff' : '#ff6b6b', 1.6, true);
        this.audio.sfx(g.def.good ? 'rescue' : 'hurt');
        this.fx.spawn(g.x, 1.5, g.z, { tex: g.def.good ? 'blue' : 'red', size: 6, life: 0.5 });
        g.group.visible = false;
      }
    }
    this.gates = this.gates.filter((g) => { if (g.z < this.z - 15) { this.stage.scene.remove(g.group); return false; } return true; });
  }

  shooters() { return [{ x: this.x, z: this.z, r: this.player, self: true }, ...this.allies.map((a) => ({ x: a.x, z: a.z, r: a.r, ally: a }))]; }

  updateShooters(dt) {
    const w = WEAPONS[this.weapon];
    const od = this.overdrive > 0;
    const effortMul = clamp(0.55 + 0.45 * (this.power / Math.max(80, this.effort.avg || this.power || 1)), 0.55, 1.5);
    this.fireRate = w.rate * this.rateMul * effortMul * (od ? 2 : 1);
    for (const s of this.shooters()) {
      const holder = s.self ? this : s.ally;
      holder.fireT = (holder.fireT || 0) - dt;
      if (holder.fireT > 0) continue;
      const target = this.nearest(s.x, s.z, 62);
      if (!target) { holder.fireT = 0.1; continue; }
      holder.fireT = (1 / this.fireRate) * (s.self ? 1 : 1.15);
      const ang = Math.atan2(target.x - s.x, target.z - s.z);
      for (let k = 0; k < w.shots; k++) {
        const a = ang + (w.shots > 1 ? (k / (w.shots - 1) - 0.5) * w.spread : (Math.random() - 0.5) * w.spread);
        const mesh = this.bulletPool.get();
        mesh.glow.material.color.set(od ? '#4de3ff' : w.color);
        // forma per tipo d'arma: razzi corti e grossi, laser lunghi e sottili, raffiche medie
        if (w.splash) mesh.shape(2.2, 0.6); else if (w.speed >= 70) mesh.shape(6, 0.28); else if (w.rate > 8) mesh.shape(3.6, 0.3); else mesh.shape(3.2, 0.34 * (od ? 1.4 : 1));
        mesh.rotation.set(0, a, 0);
        mesh.position.set(s.x + Math.sin(a) * 1.6, 1.5, s.z + Math.cos(a) * 1.6);
        this.bullets.push({ mesh, vx: Math.sin(a) * w.speed, vz: Math.cos(a) * w.speed, life: 1.8, dmg: w.dmg * this.dmgMul * (od ? 2 : 1), splash: w.splash, pierce: w.pierce || od, hits: null });
      }
      // vampata alla bocca dell'arma
      this.fx.spawn(s.x + Math.sin(ang) * 1.15, 1.5, s.z + Math.cos(ang) * 1.15, { tex: w.splash ? 'fire' : 'muzzle', size: w.splash ? 1.5 : 1.1, life: 0.08, grow: 0.6, color: od ? '#9eeeff' : null });
      if (s.self) this.audio.sfx(w.splash ? 'rocket' : w.rate > 8 ? 'mg' : w.pierce ? 'laser' : 'shot');
    }
  }

  nearest(x, z, range) {
    let best = null; let bd = range;
    for (const e of this.enemies) {
      if (e.dead || e.z < z - 1) continue;
      const d = Math.hypot(e.x - x, (e.z - z) * 0.8) - (e.def.boss ? 1 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      b.mesh.position.x += b.vx * dt; b.mesh.position.z += b.vz * dt; b.life -= dt;
      const bx = b.mesh.position.x; const bz = b.mesh.position.z;
      for (const e of this.enemies) {
        if (e.dead || (b.hits && b.hits.has(e))) continue;
        const rad = e.def.rad;
        if (Math.abs(e.z - bz) < rad && Math.abs(e.x - bx) < rad) {
          if (b.splash) {
            this.fx.explode(bx, 1, bz, b.splash / 2.5);
            this.audio.sfx('boom'); this.shake = Math.max(this.shake, 0.12);
            for (const o of this.enemies) if (!o.dead && Math.hypot(o.x - bx, o.z - bz) < b.splash) this.damage(o, b.dmg);
          } else { this.damage(e, b.dmg); this.fx.spawn(bx, 1.3, bz, { tex: 'spark', size: 1.0, life: 0.09, grow: 1 }); for (let q = 0; q < 2; q++) this.fx.spawn(bx, 1.3, bz, { tex: 'spark', size: 0.22, life: 0.25, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, vz: -b.vz * 0.08 + (Math.random() - 0.5) * 3, grow: 0 }); }
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
    this.kills++; this.waveKills++; this.score += e.def.score * this.wave;
    this.prog('kills', 1, e.def.boss ? 200 : 1);
    this.xp += e.def.xp;
    if (this.xp >= WEAPONS[this.weapon].xp) this.evolve();
    if (Math.random() < 0.3 || e.def.boss) this.dropGem(e.x, e.z, e.def.boss ? 12 : e.def.xp > 2 ? 3 : 1);
    if (e.def.boss) {
      this.bossAlive = false; this.fx.explode(e.x, 2.5, e.z, 2.5); this.shake = 0.8;
      this.audio.sfx('win'); this.say(t('games.horde.bossDown'), '#d9ff3d', 2.6, true, 3); this.prog('bosses', 1, 150);
      this.addAllies(2);
    }
  }

  dropGem(x, z, n) {
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Group();
      const jewel = this.m.jewel.scene.clone(true); jewel.scale.setScalar(this.gemScale); mesh.add(jewel);
      const halo = new THREE.Sprite(this.gemGlow); halo.scale.setScalar(1.6); halo.position.y = 0.35; mesh.add(halo);
      mesh.position.set(x + (Math.random() - 0.5) * (n > 1 ? 4 : 0.5), 0.6, z + (Math.random() - 0.5) * (n > 1 ? 4 : 0.5));
      this.stage.scene.add(mesh); this.gems.push({ mesh, t: 0 });
    }
  }

  updateGems(dt) {
    for (const g of this.gems) {
      g.t += dt; g.mesh.rotation.y += dt * 4; g.mesh.position.y = 0.7 + Math.sin(g.t * 5) * 0.15;
      const dx = this.x - g.mesh.position.x; const dz = this.z - g.mesh.position.z; const d = Math.hypot(dx, dz) || 1;
      // restano a terra: le prendi passandoci vicino (il magnete ha raggio 4 m)
      if (d < 4 || g.pull) {
        g.pull = true;
        g.mesh.position.x += (dx / d) * 26 * dt; g.mesh.position.z += (dz / d) * 26 * dt + 6 * dt;
        if (d < 1) {
          g.done = true; this.stage.scene.remove(g.mesh); this.xp += 2; this.score += 5 * this.wave;
          this.audio.sfx('coin'); this.pop('+2', '#7dff6a', 0.8);
          this.fx.spawn(this.x, 1.4, this.z, { tex: 'green', size: 1.6, life: 0.35, grow: 1.2, spin: 4 });
          if (this.xp >= WEAPONS[this.weapon].xp) this.evolve();
        }
      } else if (dz > 6) { g.done = true; this.stage.scene.remove(g.mesh); }
    }
    this.gems = this.gems.filter((g) => !g.done);
  }

  updateEnemies(dt, v) {
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
      // camminano verso di te (convergendo un po'); durante il colpo restano fermi
      const stop = e.contact > 0;
      if (!stop) e.z -= e.def.speed * dt;
      const near = e.z - this.z < 28;
      if (!stop) e.x += clamp(this.x - e.x, -1, 1) * dt * (near ? (e.def.fast ? 1.6 : 1.0) : 0.15);
      e.wob += dt; e.flash = Math.max(0, e.flash - dt);
      if (e.w) {
        e.w.update(dt, e.def.style, stop ? 0 : e.def.speed);
        e.w.root.position.set(e.x, 0, e.z);
        e.w.root.rotation.y = Math.PI + clamp((e.x - this.x) * 0.02, -0.3, 0.3) + Math.sin(e.wob * 1.3) * 0.06;
        e.w.inner.scale.setScalar(this.kits[e.type].scale * (e.flash > 0 ? 1.08 : 1));
      } else if (e.z - this.z < this.farRange) this.far[e.type]?.add(e.x, 0, e.z, Math.PI + Math.sin(e.wob * 1.3) * 0.1, 1, e.shade);
      // contatto con te o con un alleato
      const hit = (sx, sz) => Math.abs(e.z - sz) < (e.def.boss ? 2.2 : 0.9) && Math.abs(e.x - sx) < (e.def.boss ? 3 : 1.1);
      for (const a of this.allies) if (hit(a.x, a.z)) { a.dead = true; e.hp -= 3; }
      if (this.allies.some((a) => a.dead)) {
        for (const a of this.allies.filter((x) => x.dead)) { this.fx.explode(a.x, 1, a.z, 0.8); this.stage.scene.remove(a.r.root); }
        this.allies = this.allies.filter((a) => !a.dead);
        this.audio.sfx('hurt');
      }
      if (e.contact > 0) { e.contact -= dt; if (e.contact <= 0 && !e.def.boss) this.damage(e, 999); continue; }
      if (e.def.boss && e.w) { e.atk -= dt; if (e.atk <= 0 && e.z - this.z < 9) { e.atk = 1.8; e.w.lungeDur = 0.6; e.w.lunge = 0.6; } }
      if (hit(this.x, this.z)) {
        if (this.overdrive > 0) { this.damage(e, 999); continue; }
        if (this.hurtT <= 0) {
          this.hp -= 1; this.hurtT = 1.2; this.shake = 0.4; this.audio.sfx('hurt');
          this.pressure = Math.max(0.55, this.pressure * 0.78); this.calmT = 0; this.pop('−1 ♥', '#ff4d6d', 1);
          if (navigator.vibrate) navigator.vibrate(90);
          if (this.hp <= 0) return this.gameOver();
        }
        // il colpo: affonda gli artigli, poi cade
        if (!e.def.boss) { e.contact = 0.3; if (e.w) { e.w.lungeDur = 0.3; e.w.lunge = 0.3; } }
      }
      if (e.z < this.z - 6) { e.dead = true; e.deadT = 2; this.passed = (this.passed || 0) + 1; } // superati
    }
    this.enemies = this.enemies.filter((e) => {
      if (e.dead && e.deadT > 1.6) { this.sleep(e); return false; }
      return true;
    });
    for (const c of Object.values(this.far)) c.end();
  }

  gameOver() {
    this.state = 'over'; this.stateT = 0;
    this.audio.stopSong(); this.audio.sfx('lose');
    const dist = Math.round(this.z);
    this.newBest = this.score > this.best;
    if (this.newBest) { this.best = this.score; localStorage.setItem('hordeBest', this.best); }
    this.prog('races', 0, 40 + this.wave * 10);
    this.hooks.runEnd?.({ game: 'horde', score: this.score });
    this.hooks.setGrade(0);
    this.finalDist = dist;
  }

  animate(dt) {
    const cad = this.cadence || 85;
    this.frame++;
    const steer = (this.tx - this.x);
    this.player.root.position.set(this.x, 0, this.z);
    this.player.root.rotation.set(0, clamp(-steer * 0.08, -0.4, 0.4), 0);
    this.player.lean.rotation.z = clamp(steer * 0.05, -0.3, 0.3);
    this.player.pose(dt, cad, 8, { stand: this.sprinting || this.overdrive > 0 ? 1 : 0 });
    this.player.root.visible = !(this.hurtT > 0 && Math.floor(this.hurtT * 12) % 2);
    // gli alleati si pongono a turno (un fotogramma su due): le pose sulle ossa costano
    this.allies.forEach((a, i) => {
      a.x = lerp(a.x, this.x + a.slot[0], Math.min(1, dt * 5)); a.z = lerp(a.z, this.z + a.slot[1], Math.min(1, dt * 5));
      a.r.root.position.set(a.x, 0, a.z);
      if ((this.frame + i) % 2 === 0) a.r.pose(dt * 2, cad, 8, { stand: this.overdrive > 0 ? 1 : 0 });
    });
    for (const g of this.gates) g.group.children[0].material.opacity = 0.26 + Math.sin(this.t * 6) * 0.08;
    this.world(dt);
    this.camera(dt);
  }

  // scenografia, luci e cielo che seguono il giocatore
  world() {
    this.scenery.update(this.z);
    this.ground.follow(this.z);
    this.lamps.update(this.scenery.lamps, this.z);
    this.lamps.pts.forEach((l) => { if (l.userData.off) l.visible = false; });
  }

  animateIdle(dt) {
    if (!this.player) return;
    if (this.state === 'menu') this.z += dt * 3;
    this.player.root.position.set(this.x, 0, this.z);
    this.player.pose(dt, 70, 5);
    this.world(dt);
    this.camera(dt);
  }

  camera(dt) {
    const cam = this.stage.camera;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const target = new THREE.Vector3(this.x * 0.6 + sx, 8.6, this.z - 9.6);
    if (!this.camInit) { cam.position.copy(target); this.camInit = true; }
    cam.position.lerp(target, Math.min(1, dt * 5));
    cam.lookAt(this.x * 0.7, 0, this.z + 15);
    cam.fov = 62 + (this.overdrive > 0 ? 6 : 0); cam.far = 520; cam.updateProjectionMatrix();
    this.sky.follow(cam, this.x, this.z);
  }

  // ---------- interfaccia ----------
  // in alto UNA riga (punteggio · ondata · cuori), in basso la potenza con il numero grande: leggibili da 1 m
  drawHud(dt) {
    const { ctx, W, H } = this.stage;
    ctx.clearRect(0, 0, W, H); hudView(ctx, W, H);
    if (this.state === 'loading') { ctx.fillStyle = '#0f0e0c'; ctx.fillRect(0, 0, W, H); hudText(ctx, t('games.common.loading'), W / 2, H / 2, { size: 22, align: 'center', color: '#d9ff3d' }); hudText(ctx, `${Math.round((this.loadPct || 0) * 100)}%`, W / 2, H / 2 + 28, { size: 14, align: 'center' }); return; }
    if (this.state === 'error') { hudText(ctx, t('ui.error', { error: this.error }), W / 2, H / 2, { size: 14, align: 'center', color: '#ff6b6b' }); return; }
    if (this.state === 'menu') {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(8,10,28,.85)'); g.addColorStop(0.45, 'rgba(8,10,28,.12)'); g.addColorStop(1, 'rgba(8,10,28,.92)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      hudText(ctx, t('games.horde.hud.title'), W / 2, 120, { size: 56, align: 'center', color: '#d9ff3d' });
      hudText(ctx, t('games.horde.hud.tagline'), W / 2, 152, { size: 17, align: 'center', font: 'text' });
      // regole: a capo automatico, corpo ridotto finché stanno tra il titolo e il "Pedala per iniziare"
      const rules = [1, 2, 3, 4, 5, 6, 7].map((i) => t(`games.horde.rule${i}`));
      const top = Math.max(H * (W < H ? 0.27 : 0.42), 180); const bottom = W < H ? H * 0.66 : H - 84; /* in verticale resta sopra il ciclista */ const mw = Math.min(W - 28, 560);
      let fs = W < 500 ? 16 : 19; const lineH = (n) => n * 1.28 * fs; let used;
      const count = () => rules.reduce((a, r) => a + wrapLines(ctx, '· ' + r, mw, fs, { font: 'text' }).length, 0);
      while (fs > 10 && lineH(count()) + rules.length * 6 + fs * 1.6 > bottom - top) fs -= 0.5;
      let y = top;
      for (const r of rules) { const o = paragraph(ctx, '· ' + r, W / 2, y, { size: fs, maxW: mw, lineK: 1.28, color: '#f0f0f0' }); y = o.bottom + 6; }
      hudText(ctx, t('games.common.best', { n: this.best }), W / 2, Math.min(y + fs * 0.8, bottom + 4), { size: fs, align: 'center', color: '#c8c8c8', font: 'text' });
      hudText(ctx, t('games.common.start'), W / 2, H - 50, { size: 22, align: 'center', color: '#d9ff3d' });
      this.hooks.progress?.drawToasts(ctx, W, dt);
      return;
    }
    const w = WEAPONS[this.weapon];
    const pad = 12; const y0 = 84; // sotto la barra del gioco (titolo, audio, esci)
    // riga in alto
    ctx.fillStyle = 'rgba(8,10,26,.62)'; rrect(ctx, pad - 4, y0 - 22, W - 2 * pad + 8, 36, 10); ctx.fill();
    hudText(ctx, String(this.score), pad + 6, y0 + 5, { size: 26 });
    hudText(ctx, t('games.horde.wave', { n: this.wave }), W / 2, y0 + 3, { size: W < 400 ? 17 : 20, align: 'center', color: '#d9ff3d' });
    let hx = W - pad - 4 - (this.maxHp - 1) * 19;
    for (let i = 0; i < this.maxHp; i++) { hudText(ctx, i < this.hp ? '♥' : '♡', hx + i * 19, y0 + 4, { size: 22, color: i < this.hp ? '#ff4d6d' : '#7a7a99', align: 'center' }); }
    // vita del boss, sotto la riga
    const boss = this.enemies.find((e) => e.def.boss && !e.dead);
    if (boss) {
      const bw = W - 2 * pad - 8; const by = y0 + 22;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; rrect(ctx, pad + 4, by, bw, 16, 6); ctx.fill();
      ctx.fillStyle = '#ff3b3b'; rrect(ctx, pad + 4, by, Math.max(6, bw * clamp(boss.hp / boss.maxHp, 0, 1)), 16, 6); ctx.fill();
      hudText(ctx, t('games.horde.boss'), W / 2, by + 13, { size: 13, align: 'center' });
    }
    if (!this.hooks.connected()) hudText(ctx, t('games.common.demo'), W / 2, y0 + (boss ? 56 : 36), { size: 12, align: 'center', color: '#ffd34d' });

    // in basso: potenza (numero grande + barra), arma ed evoluzione
    const bh = 22; const barY = H - 16 - bh; const bx = pad + 2; const bw2 = W - 2 * pad - 4;
    const gr = ctx.createLinearGradient(0, H - 128, 0, H); gr.addColorStop(0, 'rgba(6,8,22,0)'); gr.addColorStop(0.35, 'rgba(6,8,22,.55)'); gr.addColorStop(1, 'rgba(6,8,22,.82)');
    ctx.fillStyle = gr; ctx.fillRect(0, H - 128, W, 128);
    const big = W < 500 ? 56 : 64;
    const pc = this.sprinting || this.overdrive > 0 ? '#4de3ff' : '#d9ff3d';
    const numW = hudText(ctx, String(Math.round(this.power)), pad + 4, barY - 10, { size: big, color: pc });
    hudText(ctx, 'W', pad + 8 + numW, barY - 10, { size: 22, color: '#e8e8f4' });
    const free = W - 2 * pad - numW - 56; // spazio per arma e cadenza di fuoco, a destra del numero
    // arma, a destra del numero
    const rx = W - pad - 4;
    hudText(ctx, t(w.name), rx, barY - 56, { size: W < 400 ? 17 : 20, align: 'right', color: w.color, maxW: Math.max(90, free) });
    const ew = Math.min(170, W * 0.42);
    ctx.fillStyle = 'rgba(255,255,255,.2)'; rrect(ctx, rx - ew, barY - 50, ew, 8, 4); ctx.fill();
    ctx.fillStyle = w.color; rrect(ctx, rx - ew, barY - 50, Math.max(8, ew * (Number.isFinite(w.xp) ? clamp(this.xp / w.xp, 0, 1) : 1)), 8, 4); ctx.fill();
    hudText(ctx, `${t('games.horde.fireRate', { n: fmtDec(this.fireRate || 0, 1) })} · ${t('games.horde.alliesHud', { n: this.allies.length })}`, rx, barY - 20, { size: 15, align: 'right', color: '#e8e8f4', font: 'text', maxW: Math.max(90, free) });
    // barra potenza (con soglia dello sprint) e sotto la barra dell'overdrive
    ctx.fillStyle = 'rgba(8,10,26,.75)'; rrect(ctx, bx, barY, bw2, bh, 8); ctx.fill();
    const maxW = Math.max(400, (this.effort.threshold || 200) * 1.6);
    ctx.fillStyle = pc; rrect(ctx, bx, barY, Math.max(8, bw2 * clamp(this.power / maxW, 0, 1)), bh, 8); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw2 * clamp((this.effort.threshold || 0) / maxW, 0, 1) - 1, barY - 4, 3, bh + 8);
    ctx.fillStyle = this.overdrive > 0 ? '#fff' : '#4de3ff'; rrect(ctx, bx, barY + bh + 3, Math.max(0, bw2 * (this.overdrive > 0 ? this.overdrive / 7 : this.odMeter)), 5, 2); ctx.fill();

    this.msgs.draw(ctx, W, H, { u: W < 500 ? 0.9 : 1.1, y: H * 0.3 });
    const v3 = new THREE.Vector3();
    for (const p of this.pops) {
      p.t -= dt; const k = 1 - p.t / p.t0;
      v3.set(p.x, 2.8 + k * 2.2, p.z).project(this.stage.camera);
      ctx.globalAlpha = clamp(p.t / p.t0 * 2, 0, 1);
      hudText(ctx, p.text, (v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H, { size: 24, align: 'center', color: p.color });
      ctx.globalAlpha = 1;
    }
    this.pops = this.pops.filter((p) => p.t > 0);
    if (this.hurtT > 0.9) { ctx.fillStyle = `rgba(255,0,40,${(this.hurtT - 0.9) * 0.9})`; ctx.fillRect(0, 0, W, H); }
    if (this.state === 'over') {
      ctx.fillStyle = 'rgba(8,4,14,.8)'; ctx.fillRect(0, 0, W, H);
      hudText(ctx, t('games.horde.lost'), W / 2, H * 0.32, { size: 32, align: 'center', color: '#ff4d6d' });
      hudText(ctx, `${t('games.common.score', { n: this.score })}${this.newBest ? t('games.common.newBest') : ''}`, W / 2, H * 0.32 + 40, { size: 18, align: 'center' });
      paragraph(ctx, t('games.horde.summary', { wave: this.wave, kills: this.kills, m: this.finalDist }), W / 2, H * 0.32 + 68, { size: 16, maxW: W - 32, color: '#f0f0f0', maxLines: 2 });
      paragraph(ctx, t('games.horde.summary2', { weapon: t(w.name), allies: this.allies.length }), W / 2, H * 0.32 + 118, { size: 16, maxW: W - 32, color: '#f0f0f0', maxLines: 2 });
      if (this.stateT > 1.4) hudText(ctx, t('games.common.retry'), W / 2, H * 0.32 + 176, { size: 22, align: 'center', color: '#d9ff3d' });
    }
    this.hooks.progress?.drawToasts(ctx, W, dt);
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

function rrect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}
