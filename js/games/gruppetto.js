// SLIPSTREAM — in bici su una strada di campagna: raggiungi i corridori che scattano davanti a te e portali nella tua scia.
// Il gruppo dietro di te è il punteggio. Ogni partita è un ALLENAMENTO (slip-plan.js): 5, 10 o 20 minuti in % della FTP.
//  · TIENI (vento contro): chi è in scia resta solo se tieni i watt; intanto il prossimo corridore si avvicina davanti a te;
//  · PONTE (sforzo): il corridore scatta, lo raggiungi entro N secondi; i watt chiudono la distanza (metri sulla barra);
//  · VOLATA: un drappello davanti a te e il traguardo; a fine blocco e in finale;
//  · RECUPERO: il gruppo resta unito a watt facili, bidoni da raccogliere.
// + / − cambiano corsia (una cosa sola): per prendere un corridore devi essere nella sua corsia, e i bidoni stanno in corsia.
// Nessuna sconfitta: se non chiudi un ponte quello se ne va e ne arriva un altro; chi smette di pedalare va in pausa.
// Grafica: ciclisti Meshy con scheletro automatico, campagna con modelli Meshy/Quaternius a istanze, kit/hud per i testi.
import { THREE, Stage, loadAll, Effects, Quality, Cyclist, makeKit, loadCyclistTemplate, toonMaterial, prepareModel, skyDome, styleLights, styleFog, PALETTE, WindLines, Shake } from './kit3d.js';
import { loadGLTF } from './kit/loader.js';
import { loadMeshyTemplate, CYCLIST_URL, MESHY_FAN_URL } from './kit/cyclist.js';
import { Road, buildScenery, buildArch, LANE_W } from './slip-world.js';
import { clamp, lerp } from './engine.js';
import { txt as hudText, hudView, paragraph, MessageQueue, loadHudFonts, guardTrainer, trainerLostBanner } from './kit/hud.js';
import { t } from '../i18n.js';
import { SONGS } from './audio.js';
import { GameMenu, ResultsView } from './kit/menu.js';
import { makeRandom } from './kit/rng.js';
import { DURATIONS, LEVELS, COOL_S, buildPlan, planFromWorkout, WARM_BRIDGE, segAt, targetW, closingSpeed, HOLD_PCT, DROP_AFTER, Adapter, starsFor, nextStarHint } from './slip-plan.js';
import { WorkoutClock, BandMeter, workoutStars, SETTLE_S } from './kit/workout-plan.js';

const A = 'assets/3d';
const PLAYER_COLOR = '#d9ff3d';
const JERSEYS = PALETTE.jerseys.filter((c) => c !== PLAYER_COLOR);
const RIDER_S = 1.3;          // il ciclista è più grande del vero: si legge da lontano (come in Horde Run)
const V_BASE = 8;             // m/s di scorrimento: quasi costante, così i tempi degli eventi non dipendono dal rullo
const V_SPRINT = 9.5;
const APPROACH_GAP = 105;     // il prossimo corridore nasce dentro la nebbia (che finisce a 120 m) e si avvicina
const CATCH_GAP = 3.0;        // sotto questa distanza (nella stessa corsia) è preso
const PACK_DZ = 3.3;          // distanza tra i corridori di un drappello
const TARGET_K = 1.22;        // chi scatta davanti è un po' più grande: si legge da 30 m (si rimpicciolisce quando entra in scia)
const SLOT_X = 1.05;          // il gruppo sta ai due lati, dietro di te
const ROW_DZ = 2.5;           // e in file da due
const ROW_Z0 = 2.8;           // prima fila dietro di te
const CAM_H = 4.8; const CAM_BACK = 12.5; const CAM_LOOK = 11; // camera: dietro e un po' sopra, l'orizzonte resta sotto le barre
const HIDE_REL = -9;          // oltre questa distanza dietro il giocatore sono dietro la camera: non si disegnano
const TICK = 2.8;             // un controllo del ritmo ogni 2,8 s
const SEG_COLOR = { warm: '#7fd1ff', pace: '#9ad64b', effort: '#ffb020', sprint: '#ff4d6d', rest: '#4de3b0', cool: '#7fd1ff' };
const GRADE = { warm: 1, pace: 3, effort: 2, sprint: 4, rest: 0, cool: 0 };
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const laneX = (l) => -l * LANE_W; // la destra dello schermo è −X (la camera guarda verso +Z)

const OPTIONAL = { sheep: `${A}/meshy/sheep.glb`, cow: `${A}/meshy/cow.glb`, tractor: `${A}/meshy/tractor.glb`, windmill: `${A}/meshy/windmill.glb`, bottle: `${A}/meshy/bottle.glb`, arch: `${A}/meshy/finish_arch.glb` };

export class Gruppetto {
  constructor(hudCanvas, hooks, audio) {
    this.hudCanvas = hudCanvas; this.hooks = guardTrainer(hooks); this.audio = audio; this.active = false;
    const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
    this.seed = null; this.state = 'loading';
    // menu e risultati: kit comune; durata e livello restano nelle chiavi di sempre (slipDur / slipLvl)
    this.menu = new GameMenu({
      id: 'gruppetto', title: () => t('games.gruppetto.hud.title'), pitch: () => t('games.gruppetto.hud.tagline'),
      howto: () => [t('games.gruppetto.help'), t('games.gruppetto.how2'), t('games.gruppetto.how3')],
      load: () => ({ durIdx: clamp(Number(ls('slipDur', 0)) || 0, 0, DURATIONS.length - 1), level: clamp(Number(ls('slipLvl', 1)) || 0, 0, LEVELS.length - 1) }),
      save: ({ durIdx, level }) => { try { localStorage.setItem('slipDur', durIdx); localStorage.setItem('slipLvl', level); } catch { /* niente storage */ } },
      best: (d, l) => { const r = this.recordOf(DURATIONS[d], LEVELS[l].id); return { stars: r.stars || 0, text: r.score ? String(r.score) : null }; },
      onStart: (d, l) => { this.configure(d, l); this.reset(); this.begin(); },
      sfx: (n) => this.audio.sfx(n), ready: () => this.state === 'menu', workout: () => this.hooks.workout?.(),
    });
    this.results = new ResultsView({ onAgain: () => { this.reset(); this.begin(); }, onBack: () => this.hooks.close?.(), sfx: (n) => this.audio.sfx(n) });
    this.free = {}; this.loop = this.loop.bind(this);
  }
  get durIdx() { return this.menu.durIdx; }
  set durIdx(v) { this.menu.durIdx = v; }
  get lvlIdx() { return this.menu.level; }
  set lvlIdx(v) { this.menu.level = v; }

  async start() {
    this.hooks.reset?.();
    this.active = true;
    this.quality = new Quality();
    this.stage = new Stage(this.hudCanvas, { quality: this.quality });
    this.stage.onQuality = (cfg) => this.applyQuality(cfg);
    this.state = 'loading'; this.t = 0;
    this.detach = [this.menu.attach(this.hudCanvas, () => ({ W: this.stage.W, H: this.stage.H }), () => this.state === 'menu' || this.state === 'loading'), this.results.attach(this.hudCanvas, () => ({ W: this.stage.W, H: this.stage.H }), () => this.state === 'results')]; this.msgs = new MessageQueue(); this.power = 0; this.pw = 0; this.cadence = 0; this.pops = [];
    this.last = performance.now();
    requestAnimationFrame(this.loop);
    this.audio.playSong(SONGS.menu);
    try {
      const Q = `${A}/quaternius`;
      this.m = await loadAll({
        cypress: `${A}/meshy/cypress.glb`, hay: `${A}/meshy/hay_bale.glb`, farm: `${A}/meshy/farmhouse.glb`, church: `${A}/meshy/church.glb`,
        tree1: `${Q}/nature/tree1.glb`, tree2: `${Q}/nature/tree2.glb`, tree3: `${Q}/nature/tree3.glb`, bush1: `${Q}/nature/bush1.glb`, bush2: `${Q}/nature/bush2.glb`,
        barn: `${Q}/farm/barn.glb`, silo: `${Q}/farm/silo.glb`,
      }, (p) => { this.loadPct = p * 0.5; });
      this.tpl = await loadMeshyTemplate().catch((err) => { console.warn('Meshy cyclist:', err); return loadCyclistTemplate(CYCLIST_URL); });
      this.tplLo = await loadMeshyTemplate(MESHY_FAN_URL).catch(() => this.tpl); // gli altri ciclisti: modello leggero (3.500 triangoli)
      this.loadPct = 0.75;
      this.opt = {};
      await Promise.all(Object.entries(OPTIONAL).map(async ([k, u]) => { this.opt[k] = await loadGLTF(u).catch(() => null); }));
      await loadHudFonts();
      if (!this.active) return;
      this.build();
      this.state = 'menu'; this.stateT = 0; this.menu.reset();
    } catch (err) { console.error(err); this.state = 'error'; this.error = err.message; }
  }

  stop() { this.active = false; for (const d of this.detach || []) d(); this.detach = []; this.audio.stopSong(); this.hooks.setGrade(null); this.stage?.dispose(); }

  // ---------- scena ----------
  build() {
    const { scene } = this.stage; const q = this.quality;
    this.scene = scene; this.free = {};
    this.stage.camera.far = 400; this.stage.camera.fov = 46; this.stage.camera.updateProjectionMatrix();
    scene.add(skyDome('golden'));
    styleFog(scene, 'golden', 45, 125);
    this.light = styleLights(scene, 'golden', { shadows: q.cfg.shadows, mapSize: q.cfg.shadowMap, extent: 24 });
    this.road = new Road(scene, q);
    this.inst = buildScenery(scene, this.m, this.opt, 1200 * V_SPRINT + 400, q);
    this.fx = new Effects(scene, 80); this.shake = new Shake(); this.wind = new WindLines(scene, 36);
    // bidoni: pochi oggetti riutilizzati (il modello Meshy della borraccia; senza, un cilindro)
    this.gems = []; this.gemPool = [];
    for (let i = 0; i < 12; i++) this.gemPool.push(this.makeGem());
    // arco del traguardo (volata finale) o del traguardo volante (a fine blocco)
    if (this.opt.arch) { this.arch = buildArch(this.opt.arch, 9.6); this.arch.visible = false; scene.add(this.arch); }
    this.applyQuality(q.cfg);
    this.reset();
  }

  makeGem() {
    const g = new THREE.Group(); const b = this.opt.bottle;
    if (b) {
      const info = prepareModel(b); const bx = info.box; const cx = (bx.min.x + bx.max.x) / 2; const cz = (bx.min.z + bx.max.z) / 2;
      if (!info.dressed) { for (const p of info.parts) p.geo.translate(-cx, -bx.min.y, -cz); info.dressed = true; }
      const s = 1.05 / info.height; const inner = new THREE.Group(); inner.scale.setScalar(s);
      for (const p of info.parts) inner.add(new THREE.Mesh(p.geo, toonMaterial({ map: p.mat === 'vc' ? null : p.mat, vertexColors: p.mat === 'vc' })));
      g.add(inner);
    } else g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.7, 8), toonMaterial({ color: '#ffd34d' })));
    // alone dorato a terra: si legge anche da lontano
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 20), new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, fog: true }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
    g.visible = false; g.userData.ring = ring; this.scene.add(g);
    return g;
  }

  applyQuality(cfg) {
    if (this.stage.composer && this.scene) this.stage.composer.passes[0].scene = this.scene;
    for (const i of this.inst || []) { i.setDensity(cfg.density); i.lodDist = i.baseLod * (0.5 + 0.5 * cfg.density); }
    if (this.light) this.light.sun.castShadow = cfg.shadows;
    this.shadowsOn = cfg.shadows;
    for (const c of this.allRiders()) c.setShadows(cfg.shadows);
  }

  allRiders() {
    const out = [];
    if (this.player) out.push(this.player);
    for (const l of Object.values(this.free)) out.push(...l);
    for (const g of this.group || []) out.push(g.R.cy);
    for (const b of [this.bridge]) if (b) for (const r of b.riders) out.push(r.cy);
    for (const e of this.escapees || []) for (const r of e.riders) out.push(r.cy);
    for (const d of this.drops || []) out.push(d.R.cy);
    return out;
  }

  // ---------- ciclisti (riuso: la creazione di un ciclista costa) ----------
  rider(color, idx, lo = true) {
    const key = color + (lo ? 'l' : 'h'); let cy = this.free[key]?.pop();
    if (!cy) { cy = new Cyclist(lo ? this.tplLo : this.tpl, makeKit(color, idx), { shadows: this.shadowsOn }); cy.poolKey = key; cy.root.scale.setScalar(RIDER_S); this.scene.add(cy.root); }
    cy.root.visible = true; cy.sitDown(); cy.lean.rotation.set(0, 0, 0); cy.root.scale.setScalar(RIDER_S);
    return cy;
  }
  release(cy) { cy.root.visible = false; (this.free[cy.poolKey] = this.free[cy.poolKey] || []).push(cy); }
  newR(x, z, idx, born = false, big = false) {
    const color = JERSEYS[(this.jerseyN = (this.jerseyN || 0) + 1) % JERSEYS.length];
    const cy = this.rider(color, 1 + (idx % 5)); cy.root.position.set(x, 0, z); cy.root.rotation.set(0, 0, 0);
    if (born) cy.root.scale.setScalar(0.01);
    return { cy, x, z, born: born ? 0 : 1, vx: 0, sc: RIDER_S * (big ? TARGET_K : 1) };
  }

  // ---------- partita ----------
  reset() {
    for (const g of this.group || []) this.release(g.R.cy);
    for (const d of this.drops || []) this.release(d.R.cy);
    for (const e of this.escapees || []) for (const r of e.riders) this.release(r.cy);
    if (this.bridge) for (const r of this.bridge.riders) this.release(r.cy);
    for (const g of this.gems || []) { g.mesh.visible = false; this.gemPool.push(g.mesh); }
    if (this.player) this.release(this.player);
    if (this.arch) this.arch.visible = false;
    this.configure(this.durIdx, this.lvlIdx);
    this.rnd = makeRandom(this.seed ?? globalThis.__spindroSeed ?? 9001 + this.durIdx * 7 + this.lvlIdx);
    this.group = []; this.drops = []; this.escapees = []; this.gems = []; this.bridge = null; this.line = null;
    this.z = 0; this.x = 0; this.lane = 0; this.pops = []; this.el = this.wk ? this.wc.el : 0; this.segIdx = -1; this.seg = this.plan.segs[0];
    this.score = 0; this.caught = 0; this.dropped = 0; this.bridgesDone = 0; this.bridgesTotal = 0; this.finalWon = false; this.finalTried = false;
    this.paused = false; this.pauseT = 0; this.startT = 0; this.finished = false; this.result = null; this.v = V_BASE;
    this.adapt = new Adapter(); this.evLog = []; this.sprinting = false; this.sentGrade = undefined; this.msgs.clear();
    this.tickT = TICK; this.deficit = 0; this.gemT = 4; this.gemLane = 0; this.hint = null; this.hintT = 0; this.blocked = false; this.holdOk = true; this.assistT = 0;
    this.bottles = 0; this.lostThisSeg = 0; this.camInit = false; this.laneInput = 0;
    this.player = this.rider(PLAYER_COLOR, 0, false);
    this.player.root.position.set(0, 0, 0);
    // il primo corridore è già lì davanti, nel menu: si parte con qualcosa da prendere
    this.spawnBridge(this.plan.segs[0], { gap: (this.plan.segs[0].bridge || WARM_BRIDGE).gap, born: false });
    this.bridge.state = 'attack'; this.bridge.kind = 'warm'; this.bridge.dur = 30; this.bridge.t0 = 0;
    this.road.update(0); for (const i of this.inst) i.update(0, true);
    this.view(0);
  }

  configure(durIdx, lvlIdx) {
    this.durIdx = durIdx; this.lvlIdx = lvlIdx;
    this.level = LEVELS[lvlIdx];
    // allenamento in corso: la partita È l'allenamento (durata, tratti e watt vengono da lì; il livello non cambia i watt)
    this.wc = new WorkoutClock(this.hooks); this.wk = this.wc.begin(this.ftp);
    if (this.wk) { this.plan = planFromWorkout(this.wk); this.total = this.plan.total; } else { this.total = DURATIONS[durIdx]; this.plan = buildPlan(this.total); }
    this.band = new BandMeter();
  }

  get ftp() { return Math.max(80, this.hooks.ftp?.() || 200); }
  recordKey() { return `slipBest:${this.total}:${this.level.id}`; }
  recordOf(total, id) { try { return JSON.parse(localStorage.getItem(`slipBest:${total}:${id}`) || '{}'); } catch { return {}; } }
  record() { return this.wk ? {} : this.recordOf(this.total, this.level.id); }

  // ---------- eventi: tutto ciò che chiede o premia qualcosa (si misura nel test) ----------
  ev(kind) { if (this.evLog.length < 20000) this.evLog.push({ t: this.el, k: kind }); }
  eventStats() {
    const end = this.total - COOL_S; const ts = this.evLog.filter((e) => e.t <= end).map((e) => e.t).sort((a, b) => a - b);
    let maxGap = 0; let prev = 0; for (const x of ts) { maxGap = Math.max(maxGap, x - prev); prev = x; } maxGap = Math.max(maxGap, end - prev);
    return { first: ts[0] ?? Infinity, maxGap, perMin: ts.length / (end / 60), n: ts.length };
  }

  say(text, color = '#ffd34d', dur = 1.6, big = false, prio = big ? 2 : 1, sub = null) { this.msgs.say(text, { color, dur, big, prio, sub }); }
  prog(stat, n = 1, xp = 0) { this.hooks.progress?.event(stat, n, xp); }
  // testo che sale dal giocatore e lo segue (slot: −1 a sinistra, 0 al centro, +1 a destra: i numeri non si sovrappongono)
  pop(text, color, x, y, z, dur = 0.9, slot = 0) { this.pops.push({ text, color, dx: x - this.x, dz: z - this.z, y, t: dur, t0: dur, slot }); while (this.pops.length > 4) this.pops.shift(); }

  // ---------- comandi ----------
  input(dir) {
    this.audio.ensure();
    if (this.state === 'menu' || this.state === 'loading') { this.menu.input(dir); return; }
    if (this.state === 'results') { this.results.input(dir); return; }
    if (this.state !== 'play' || this.paused) return;
    // una sola cosa: cambia corsia (+ destra, − sinistra)
    const l = clamp(this.lane + (dir > 0 ? 1 : -1), -1, 1);
    if (l !== this.lane) { this.lane = l; this.audio.sfx('shiftUp'); }
  }
  hold(dir) { if (this.state === 'menu' || this.state === 'loading') this.menu.hold(dir); }

  begin() {
    this.state = 'play'; this.stateT = 0; this.pwInit = true; this.hooks.runStart?.();
    this.audio.playSong(SONGS.city); this.audio.sfx('go');
  }

  // ---------- ponti ----------
  pickLane(avoid = []) {
    const free = [-1, 0, 1].filter((l) => !avoid.includes(l));
    return free[Math.floor(this.rnd() * free.length)];
  }
  spawnBridge(seg, { gap = APPROACH_GAP, born = true } = {}) {
    const n = (seg.bridge || WARM_BRIDGE).riders; const busy = this.escapees.filter((e) => e.gap < 70).map((e) => e.lane);
    const lane = this.pickLane(busy);
    const riders = [];
    for (let k = 0; k < n; k++) riders.push(this.newR(laneX(lane), this.z + gap + k * PACK_DZ, k + this.caught, born, true));
    this.bridge = { riders, n, gap, gap0: (seg.bridge || WARM_BRIDGE).gap, nominalGap: (seg.bridge || WARM_BRIDGE).gap, lane, x: laneX(lane), state: 'approach', seg, dur: seg.t1 - seg.t0, t0: seg.t0, swerved: false, startGap: gap, close: 0 };
    if (born) for (const R of riders) this.fx.spawn(R.x, 0.9, R.z, { tex: 'smoke', size: 2.6, life: 0.7, grow: 1.6, additive: false });
    this.ev('spawn');
  }

  tgtNow() { return targetW(this.seg, this.ftp, this.level.k, this.adapt.value, this.el); }

  enterSeg(idx) {
    // un ponte ancora aperto alla fine del tratto precedente è fallito
    const seg = this.plan.segs[idx];
    if (this.bridge && this.bridge.state === 'attack' && this.bridge.seg !== seg) this.failBridge(false);
    this.segIdx = idx; this.seg = seg; seg.inT = 0;
    const w = this.tgtNow(); this.ev('seg');
    const col = SEG_COLOR[seg.kind]; const b = this.bridge;
    this.deficit = 0; this.lostThisSeg = 0;
    if (seg.kind === 'warm') {
      this.say(t('games.gruppetto.say.warm'), col, 3, true, 3, t('games.gruppetto.say.warmSub', { w }));
    } else if (seg.kind === 'pace') {
      this.say(t('games.gruppetto.say.pace'), col, 2.4, true, 2, t('games.gruppetto.say.paceSub', { w }));
      // il prossimo corridore nasce lontano e si avvicina durante il tratto: arriva a 20 m proprio all'inizio dello sforzo
      const next = this.plan.segs[idx + 1];
      if (next?.bridge && !b) this.spawnBridge(next);
    } else if (seg.kind === 'effort') {
      if (!this.bridge) this.spawnBridge(seg, { gap: seg.bridge.gap });
      this.startAttack(seg, 'effort');
      this.say(t('games.gruppetto.say.effort', { w }), col, 3, true, 3, t('games.gruppetto.say.effortSub', { s: Math.round(seg.t1 - seg.t0) }));
    } else if (seg.kind === 'sprint') {
      // volata: il drappello davanti e il traguardo; se qualcuno è ancora in fuga davanti a noi, sparisce nella polvere
      if (this.bridge) this.failBridge(true);
      this.spawnBridge(seg, { gap: seg.bridge.gap, born: true });
      this.startAttack(seg, 'sprint');
      this.startLine(seg);
      this.say(t('games.gruppetto.say.sprint', { w }), col, 3, true, 3, t(seg.line === 'finish' ? 'games.gruppetto.say.sprintFinish' : 'games.gruppetto.say.sprintPrime', { s: Math.round(seg.t1 - seg.t0) }));
      this.audio.sfx('alarm');
    } else if (seg.kind === 'rest') {
      this.say(t('games.gruppetto.say.rest'), col, 2.4, true, 2, t('games.gruppetto.say.restSub', { w }));
    } else if (seg.kind === 'cool') {
      if (this.bridge) this.failBridge(true);
      this.finishResult();
      this.say(t('games.gruppetto.say.cool'), col, 3, true, 3, t('games.gruppetto.say.coolSub', { w }));
      this.audio.sfx('win');
    }
  }

  startAttack(seg, kind) {
    const b = this.bridge; b.state = 'attack'; b.gap = b.gap0; b.dur = seg.t1 - seg.t0; b.seg = seg; b.kind = kind; b.swerved = false;
    this.bridgesTotal++; b.t0 = seg.t0;
    this.ev('attack'); this.audio.sfx('whoosh');
  }

  startLine(seg) {
    if (!this.arch) return;
    // il traguardo è fermo nel mondo: arriva esattamente alla fine dello sprint
    const left = seg.t1 - this.el; this.line = { z: this.z + V_SPRINT * left - 1.5, kind: seg.line, passed: false };
    this.arch.visible = true; this.arch.position.set(0, 0, this.line.z); this.arch.userData.s = 0;
    this.arch.traverse((o) => { if (o.material?.color) o.material.color.set(seg.line === 'finish' ? '#ffffff' : '#ffd34d'); });
  }

  // ponte riuscito: tutti si mettono in scia
  catchBridge() {
    const b = this.bridge; this.bridge = null; const seg = b.seg; const n = b.riders.length;
    b.riders.forEach((R, k) => {
      const side = this.group.filter((g) => g.side < 0).length <= this.group.filter((g) => g.side > 0).length ? -1 : 1;
      const entry = { R, side, relz: R.z - this.z, relx: R.x - this.x, sx: R.x - this.x, sz: R.z - this.z, u: -k * 0.12, dur: 1.15, row: 0 };
      this.group.unshift(entry); // l'ultimo arrivato sta davanti: gli altri scorrono indietro nella loro colonna
    });
    this.caught += n;
    const pts = n * (100 + this.group.length * 8) * (seg.kind === 'sprint' ? 2 : 1);
    this.score += pts; this.ev('catch');
    this.audio.sfx('rescue'); this.shake.add(0.35); this.prog('rescued', n, 3 * n);
    for (const R of b.riders) { this.fx.spawn(R.x, 1.4, R.z, { tex: 'green', size: 2.2, life: 0.4 }); this.fx.spawn(R.x, 1.2, R.z, { tex: 'spark', size: 1.4, life: 0.5, grow: 1.5 }); }
    this.pop(`+${pts}`, '#ffd166', this.x, 2.5, this.z, 1.3, 1);
    if (navigator.vibrate) navigator.vibrate(30);
    if (seg.kind === 'effort' || seg.kind === 'sprint') {
      this.bridgesDone++; if (seg.kind === 'sprint' && seg.line === 'finish') this.finalWon = true;
      if (seg.kind === 'sprint') this.prog('sprintsWon', 1, 10);
      const d = this.wk ? 0 : this.adapt.report(true); if (d > 0) this.say(t('games.gruppetto.adaptUp'), '#7dff6a', 2.2);
      this.say(t('games.gruppetto.caught'), '#7dff6a', 1.6, true, 2, t('games.gruppetto.caughtSub', { n: this.group.length }));
    } else this.say(t('games.gruppetto.caught'), '#7dff6a', 1.6, true, 2, t('games.gruppetto.caughtSub', { n: this.group.length }));
  }

  // il ponte non è riuscito: i corridori se ne vanno (non è una sconfitta: arriva il prossimo)
  failBridge(silent = false) {
    const b = this.bridge; if (!b) return; this.bridge = null;
    this.escapees.push({ riders: b.riders, gap: Math.max(b.gap, 3), lane: b.lane, v: 4 });
    this.ev('escape'); this.blocked = false;
    const seg = b.seg;
    if (!silent && (seg.kind === 'effort' || seg.kind === 'sprint') && b.state === 'attack') {
      const d = this.wk ? 0 : this.adapt.report(false); if (d < 0) this.say(t('games.gruppetto.adaptDown'), '#ffd34d', 2.4);
      else this.say(t('games.gruppetto.gotAway'), '#ff8d8d', 1.8, false, 1, t('games.gruppetto.gotAwaySub'));
    }
    if (seg.kind === 'sprint' && seg.line === 'finish') this.finalTried = true;
  }

  dropOne() {
    if (!this.group.length) return;
    const entry = this.group.pop(); // l'ultimo della fila: si stacca
    this.drops.push({ R: entry.R, side: entry.side, rel: entry.relz, relx: entry.relx, t: 0 });
    this.dropped++; this.lostThisSeg++; this.ev('drop'); this.audio.sfx('hurt'); this.shake.add(0.15);
    if (this.lostThisSeg === 1) this.say(t('games.gruppetto.dropped'), '#ff8d8d', 1.8, true, 2, t('games.gruppetto.droppedSub', { w: this.tgtNow() }));
  }

  // ---------- bidoni ----------
  spawnGems() {
    // una fila di tre bidoni in una corsia (la corsia cambia di uno alla volta: si prendono con un tocco di + o −)
    this.gemLane = clamp(this.gemLane + (this.rnd() < 0.5 ? -1 : 1) * (this.rnd() < 0.8 ? 1 : 0), -1, 1);
    for (let i = 0; i < 3; i++) {
      const mesh = this.gemPool.pop(); if (!mesh) return;
      mesh.visible = true; mesh.scale.setScalar(0.01);
      this.gems.push({ mesh, lane: this.gemLane, z: this.z + 58 + i * 3.6, born: 0 });
    }
    this.ev('gemrow');
  }

  // ---------- aggiornamento ----------
  update(dt) {
    this.t += dt;
    const connected = this.hooks.connected(); const st = this.hooks.stats(); const ftp = this.ftp;
    // senza rullo la demo simula 0,8 × FTP con scatti (e un po' meno nel recupero)
    const demoP = !connected && this.wk && this.seg ? targetW(this.seg, ftp, 0, 0, this.el) : !connected ? ftp * (this.state === 'play' && this.seg?.kind === 'rest' ? 0.58 : 0.8) * (((this.t % 40) > 31 && this.seg?.kind !== 'rest') ? 1.6 : 1) : 0;
    this.power = connected ? st.power || 0 : demoP;
    this.cadence = connected ? st.cadence || 0 : 88;
    if (this.pwInit) { this.pw = this.power; this.pwInit = false; } else this.pw += (this.power - this.pw) * Math.min(1, dt / 1.2);
    this.connected = connected;
    if (this.audio.song) this.audio.setTempo(this.audio.song.bpm * clamp((this.cadence || 85) / 88, 0.85, 1.25));
    this.msgs.update(dt);
    if (this.state === 'loading') { this.menu.update(dt, { connected: false, power: 0 }); }
    if (this.state === 'loading' || this.state === 'error') return;
    this.fx.update(dt); this.shake.update(dt);
    this.stateT += dt;
    if (this.state === 'menu') { this.menuTick(dt, connected); this.view(dt); return; }
    if (this.state === 'results') { this.results.update(dt); this.view(dt, true); return; }

    // con un allenamento il tempo è quello dell'allenamento (anche se in pausa); finito lui, finisce la partita
    if (this.wk) { this.el = this.wc.tick(dt); if (this.wc.ended) return this.finish(); }
    // pausa: chi smette di pedalare non perde, il tempo si ferma
    if (connected) {
      if (this.power < 12) { this.pauseT += dt; if (this.pauseT > 2.5 && !this.paused) { this.paused = true; this.audio.sfx('beep'); } } else if (this.power > 25) { this.pauseT = 0; this.paused = false; }
    }
    if (this.paused) { this.view(dt, true); return; }

    if (!this.wk) this.el += dt;
    let seg = segAt(this.plan, this.el); const idx = this.plan.segs.indexOf(seg);
    if (idx !== this.segIdx) { this.enterSeg(idx); seg = this.seg; }
    if (this.el >= this.total) return this.finish();
    const tgt = this.tgtNow(); this.tgtW = tgt; seg.inT += dt;
    if (this.wk) this.band.add(dt, this.pw, tgt, this.el - seg.stepStart);
    const zone = this.pw >= HOLD_PCT * tgt; this.inTarget = this.pw >= 0.92 * tgt; this.holdOk = zone;
    this.sprinting = seg.kind === 'sprint' && zone;
    const vT = seg.kind === 'sprint' ? V_SPRINT : V_BASE; this.v += (vT - this.v) * Math.min(1, dt * 2);
    this.z += this.v * dt;
    const g = GRADE[seg.kind] ?? 0; if (!this.wk && g !== this.sentGrade) { this.sentGrade = g; this.hooks.setGrade(g); }

    // corsia: il giocatore scivola verso quella scelta; senza rullo (demo) la scelta giusta è automatica
    this.updateAssist(dt);
    const tx = laneX(this.lane); const px0 = this.x; this.x = lerp(this.x, tx, 1 - Math.exp(-dt * 9)); this.vx = (this.x - px0) / Math.max(dt, 1e-3);

    this.updateBridge(dt, seg, tgt);
    this.updateEscapees(dt);
    this.updateGroup(dt, seg, tgt);
    this.updateGems(dt, seg);
    this.updateLine(dt);
    this.updateTicks(dt, seg, tgt, zone);
    if (this.hint) { this.hint.t -= dt; if (this.hint.t <= 0) this.hint = null; }
    this.view(dt);
  }

  // in demo (nessun rullo collegato) il gioco guida da solo la corsia verso il corridore da prendere
  updateAssist(dt) {
    if (this.connected) return;
    const b = this.bridge; if (!b || b.state !== 'attack' || this.lane === b.lane) { this.assistT = 0; return; }
    this.assistT += dt; if (this.assistT > 0.7) { this.lane += Math.sign(b.lane - this.lane); this.assistT = 0; }
  }

  updateBridge(dt, seg, tgt) {
    const b = this.bridge; if (!b) return;
    const ftp = this.ftp;
    if (b.state === 'approach') {
      // arriva a 20 m esattamente alla fine del tratto (potenza ininfluente: è l'avvicinamento)
      const left = Math.max(0.4, seg.t1 - this.el); b.gap = Math.max(b.gap0, b.gap - ((b.gap - b.gap0) / left) * dt);
      if (!b.nearEv && b.gap < 60) { b.nearEv = true; this.ev('near'); this.say(t('games.gruppetto.ahead'), '#ffd34d', 1.4, false, 1); this.audio.sfx('beep'); }
    } else {
      // l'attacco: i watt chiudono la distanza; con più di un corridore la fila davanti è più lunga ma conta il primo
      b.close = closingSpeed(this.pw, tgt, ftp, b.gap0, b.dur);
      const left = b.t0 + b.dur - this.el;
      b.gap = Math.min(b.gap0 * 1.6, b.gap - b.close * dt);
      // scarto laterale a metà ponte: devi spostarti nella sua corsia
      if (!b.swerved && b.kind !== 'warm' && this.el - b.t0 > b.dur * 0.42 && b.gap > 5) {
        b.swerved = true; const opts = [-1, 0, 1].filter((l) => Math.abs(l - b.lane) === 1);
        b.lane = opts[Math.floor(this.rnd() * opts.length)]; this.ev('swerve'); this.say(t('games.gruppetto.swerve'), '#4de3ff', 1.3, false, 1); this.audio.sfx('shiftDown');
      }
      const mism = Math.abs(this.x - b.riders[0].x) > 1.35;
      this.blocked = false;
      if (b.gap <= CATCH_GAP) {
        if (mism) { b.gap = CATCH_GAP; this.blocked = true; if (!b.blockEv || this.el - b.blockEv > 2.2) { b.blockEv = this.el; this.ev('block'); this.audio.sfx('beep'); } } else return this.catchBridge();
      }
      if (left <= 0) this.failBridge(b.kind === 'warm'); // l'avvio: se non lo prendi, si lascia andare senza rimproveri
    }
    // posizioni: la fila davanti a te
    if (this.bridge) {
      const bb = this.bridge;
      bb.riders.forEach((R, k) => {
        const tx = bb.x = laneX(bb.lane); const px = R.x; R.x = lerp(R.x, tx, 1 - Math.exp(-dt * 5)); R.vx = (R.x - px) / Math.max(dt, 1e-3); R.z = this.z + bb.gap + k * PACK_DZ;
      });
    }
  }

  updateEscapees(dt) {
    for (const e of this.escapees) {
      e.v = Math.min(11, e.v + dt * 5); e.gap += e.v * dt;
      e.riders.forEach((R, k) => { R.z = this.z + e.gap + k * PACK_DZ; });
    }
    const keep = [];
    for (const e of this.escapees) { if (e.gap > 112) for (const R of e.riders) this.release(R.cy); else keep.push(e); }
    this.escapees = keep;
  }

  updateGroup(dt, seg, tgt) {
    // righe per colonna: ognuno si sposta indietro quando ne arriva un altro davanti
    const rows = { '-1': 0, '1': 0 };
    for (const g of this.group) {
      g.row = rows[g.side]++;
      const slotZ = -(ROW_Z0 + g.row * ROW_DZ);
      if (g.u < 1) {
        g.u += dt / g.dur; const u = Math.max(0, g.u);
        // prima si sposta di lato (supera il giocatore a distanza), poi scivola indietro
        g.relx = lerp(g.sx, g.side * SLOT_X, smooth(u * 2.2)); g.relz = lerp(g.sz, slotZ, smooth((u - 0.18) / 0.82));
        if (u > 0.85 && !g.said) g.said = true;
      } else { g.relz += (slotZ - g.relz) * Math.min(1, dt * 6); g.relx += (g.side * SLOT_X - g.relx) * Math.min(1, dt * 8); }
      const R = g.R; R.z = this.z + g.relz; R.sc += (RIDER_S - R.sc) * Math.min(1, dt * 2.5);
      R.vx = 0; const wantX = this.x + g.relx; const px = R.x; R.x = g.u < 1 ? wantX : lerp(R.x, wantX, 1 - Math.exp(-dt * 7)); R.vx = (R.x - px) / Math.max(dt, 1e-3);
    }
    // chi si stacca scivola di lato e indietro, fuori dall'inquadratura
    for (const d of this.drops) { d.t += dt; d.rel -= (3 + d.t * 4) * dt; d.relx += d.side * dt * 2.6; d.R.z = this.z + d.rel; d.R.x = this.x + d.relx; d.R.vx = d.side * 2.6; }
    this.drops = this.drops.filter((d) => { if (d.rel < HIDE_REL - 6) { this.release(d.R.cy); return false; } return true; });
    // tieni il gruppo: nel vento contro (e nel recupero) chi è in scia resta solo se tieni i watt
    if ((seg.kind === 'pace' || seg.kind === 'rest') && this.group.length) {
      if (this.pw < HOLD_PCT * tgt && !(this.wk && this.el - seg.stepStart < SETTLE_S)) { this.deficit += dt; if (this.deficit > DROP_AFTER) { this.dropOne(); this.deficit = DROP_AFTER - 1.3; } } else this.deficit = Math.max(0, this.deficit - dt * 2);
    } else this.deficit = 0;
  }

  updateGems(dt, seg) {
    const ok = seg.kind === 'pace' || seg.kind === 'rest' || (seg.kind === 'warm' && this.el > 5);
    if (ok) { this.gemT -= dt; if (this.gemT <= 0) { this.spawnGems(); this.gemT = 3.0 + this.rnd() * 0.6; } }
    for (const g of this.gems) {
      g.born = Math.min(1, g.born + dt * 3); g.mesh.scale.setScalar(smooth(g.born));
      const dz = g.z - this.z; g.mesh.position.set(laneX(g.lane), 0.05 + Math.sin(this.t * 4 + g.z) * 0.06, g.z); g.mesh.rotation.y = this.t * 2.5 + g.z;
      if (!g.done && dz < 0.8 && dz > -1.8 && Math.abs(this.x - laneX(g.lane)) < 1.25) {
        g.done = true; this.bottles++; const pts = 10 + Math.min(20, this.group.length * 2); this.score += pts;
        this.ev('gem'); this.audio.sfx('coin'); this.gemPoints(pts);
        this.fx.spawn(laneX(g.lane), 1, this.z + 0.5, { tex: 'spark', size: 1.6, life: 0.35, grow: 1.6 }); this.prog('coins', 1);
      }
    }
    this.gems = this.gems.filter((g) => { if (g.done || g.z < this.z - 6) { g.mesh.visible = false; this.gemPool.push(g.mesh); return false; } return true; });
  }

  // i bidoni di una fila si sommano in un solo numero sopra il giocatore (niente pioggia di "+12")
  gemPoints(pts) {
    const p = this.gemPop;
    if (p && this.pops.includes(p) && p.t > 0.15) { p.sum += pts; p.text = `+${p.sum}`; p.t = p.t0 = 1.0; return; }
    this.pop(`+${pts}`, '#ffd34d', this.x, 2.4, this.z, 1.0, 1); this.gemPop = this.pops[this.pops.length - 1]; this.gemPop.sum = pts;
  }

  updateLine(dt) {
    const L = this.line; if (!L || !this.arch) return;
    this.arch.userData.s = Math.min(1, this.arch.userData.s + dt * 1.2); this.arch.scale.setScalar(smooth(this.arch.userData.s));
    if (!L.passed && this.z >= L.z) {
      L.passed = true; this.ev('line'); this.audio.sfx('cheer'); this.shake.add(0.4);
      const won = this.bridge == null && (this.finalWon || L.kind !== 'finish'); void won;
      const bonus = 150 + this.group.length * 25; this.score += bonus;
      this.say(t(L.kind === 'finish' ? 'games.gruppetto.finish' : 'games.gruppetto.prime'), '#ffd34d', 2, true, 3, t('games.gruppetto.lineSub', { b: bonus, n: this.group.length }));
      for (let i = 0; i < 6; i++) this.fx.spawn(this.x + (this.rnd() - 0.5) * 6, 2 + this.rnd() * 3, this.z + 2, { tex: 'spark', size: 1.2, life: 0.8, vy: 2, grow: 0.4 });
    }
    if (L.passed && this.z > L.z + 14) { this.arch.visible = false; this.line = null; }
  }

  // controllo del ritmo: premia chi tiene i watt (o chiede più watt): è l'evento che non lascia mai passare più di 3 secondi
  updateTicks(dt, seg, tgt, zone) {
    this.tickT -= dt; if (this.tickT > 0) return; this.tickT = TICK;
    this.ev('tick');
    const n = this.group.length;
    if (zone) {
      const pts = 6 + n * 3; this.score += pts; if (n) this.prog('draftSec', TICK);
      this.pop(`+${pts}`, '#ffffff', this.x, 2.4, this.z, 0.8, -1);
      this.fx.spawn(this.x - 0.5, 1.6, this.z + 0.3, { tex: 'spark', size: 0.9, life: 0.3, grow: 1.2, color: '#d9ff3d' });
      this.audio.sfx('pass');
    } else {
      this.hint = { text: t('games.gruppetto.push', { w: Math.max(5, Math.round((tgt * HOLD_PCT - this.pw) / 5) * 5) }), t: 1.8 }; this.audio.sfx('beep');
    }
  }

  menuTick(dt, connected) { this.menu.update(dt, { connected, power: this.hooks.stats()?.power || 0 }); }

  finishResult() {
    // con un allenamento le stelle sono le stesse di tutti i giochi: tempo entro ±7 % del bersaglio (kit/workout-plan.js)
    const s = this.wk ? { stars: workoutStars(this.band.ratio, true), ratio: this.band.ratio } : starsFor({ done: this.bridgesDone, total: this.bridgesTotal, finalWon: this.finalWon, dropped: this.dropped });
    const rec = this.record(); const prevBest = rec.score || 0; const newBest = this.score > prevBest;
    if (!this.wk && (newBest || s.stars > (rec.stars || 0))) { try { localStorage.setItem(this.recordKey(), JSON.stringify({ score: Math.max(prevBest, this.score), stars: Math.max(rec.stars || 0, s.stars) })); } catch { /* niente storage */ } }
    this.score = Math.round(this.score);
    this.result = { best: Math.max(prevBest, this.score), ...s, done: this.bridgesDone, total: this.bridgesTotal, caught: this.caught, riders: this.plan.riders, dropped: this.dropped, finalWon: this.finalWon, group: this.group.length, score: this.score, newBest, prevStars: rec.stars || 0 };
    this.result.hint = this.wk ? null : nextStarHint(this.result); this.result.wk = !!this.wk; this.result.band = this.band.ratio;
    this.prog('races', 0, 40 + s.stars * 40 + this.bridgesDone * 10);
    if (!this.wk) this.hooks.progress?.setMax('slipStars', s.stars);
  }

  finish() {
    if (!this.result) this.finishResult();
    this.state = 'results'; this.stateT = 0; this.finished = true; this.results.reset();
    this.audio.stopSong(); this.audio.sfx('win');
    this.hooks.runEnd?.({ game: 'gruppetto', score: this.score });
    if (!this.wk) this.hooks.setGrade(0);
  }

  // ---------- vista ----------
  view(dt, still = false) {
    const cam = this.stage.camera; const speed = this.state === 'play' && !still ? this.v : 0;
    const moving = this.state === 'play' && !still; const cad = moving ? (this.cadence || 80) : 0; const stand = this.sprinting ? 1 : 0;
    const pl = this.player; pl.root.position.set(this.x, 0, this.z); pl.root.rotation.y = 0;
    pl.lean.rotation.z = clamp((this.vx || 0) * 0.04, -0.3, 0.3);
    pl.pose(dt, cad, speed, { stand });
    // camera: dietro e sopra, guarda avanti; segue la corsia con un po' di ritardo
    const sprint = this.sprinting ? 1 : 0;
    const cx = this.x * 0.8; const tx = cx; const ty = CAM_H; const tz = this.z - CAM_BACK;
    if (!this.camInit) { cam.position.set(tx, ty, tz); this.camInit = true; this.camX = cx; }
    this.camX += (cx - this.camX) * Math.min(1, dt * 4); cam.position.set(this.camX, ty, tz);
    // solo nei risultati in verticale: il pannello copre il basso, il ciclista sale nella fascia libera sotto le stelle
    const up = this.state === 'results' && this.stage.W < this.stage.H * 1.15 ? 3.2 : 0;
    cam.lookAt(this.camX * 0.9, 0.9 - up, this.z + CAM_LOOK);
    this.shake.apply(cam);
    const fov = 46 + sprint * 5 + (this.seg?.kind === 'effort' ? 1.5 : 0); cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix();
    // gli altri ciclisti: si animano solo quelli che si vedono
    const pose = (R, rel) => { const cy = R.cy; const p = cy.root.position; p.x = R.x; p.z = R.z; p.y = 0;
      if (R.born < 1) R.born = Math.min(1, R.born + dt * 2.2);
      cy.root.scale.setScalar(R.sc * Math.max(0.01, smooth(R.born)));
      const vis = rel > HIDE_REL; cy.root.visible = vis; if (!vis) return;
      cy.lean.rotation.z = clamp((R.vx || 0) * 0.05, -0.3, 0.3);
      cy.pose(dt, moving ? cad * 0.97 + 4 : 0, speed, { stand: this.sprinting ? 1 : 0 }); };
    const b = this.bridge; if (b) for (const R of b.riders) pose(R, R.z - this.z);
    for (const e of this.escapees) for (const R of e.riders) pose(R, R.z - this.z);
    for (const g of this.group) pose(g.R, g.relz);
    for (const d of this.drops) pose(d.R, d.rel);
    this.wind.update(dt, pl.root, this.state === 'play' && !this.paused ? (this.seg?.kind === 'pace' ? 0.55 : this.sprinting ? 0.9 : 0.25) : 0);
    this.road.update(this.z); for (const i of this.inst) i.update(this.z);
    this.light.follow(this.x, 0, this.z);
  }

  // ---------- interfaccia ----------
  // in alto: punti · ponte n/N · corridori presi; sotto la richiesta del momento e le barre; poi l'obiettivo (metri al prossimo corridore).
  // in basso la potenza con il numero grande e il bersaglio, a destra il gruppo (il tuo punteggio vero).
  drawHud(dt) {
    const { ctx, W, H } = this.stage;
    ctx.clearRect(0, 0, W, H); hudView(ctx, W, H);
    if (this.state === 'loading') { ctx.fillStyle = '#0f0e0c'; ctx.fillRect(0, 0, W, H); this.menu.loadFrac = this.loadPct || 0; this.menu.draw(ctx, W, H, { connected: false }); return; }
    if (this.state === 'error') { hudText(ctx, t('ui.error', { error: this.error }), W / 2, H / 2, { size: 14, align: 'center', color: '#ff6b6b' }); return; }
    if (this.state === 'menu') { this.menu.draw(ctx, W, H, { connected: this.hooks.connected() }); this.hooks.progress?.drawToasts(ctx, W, dt); return; }
    if (this.state === 'results') { this.drawResult(ctx, W, H); this.hooks.progress?.drawToasts(ctx, W, dt); return; }
    const seg = this.seg; const pad = 12; const y0 = 84;
    // riga in alto: punti · ponte · presi x/y
    ctx.fillStyle = 'rgba(8,10,26,.62)'; rrect(ctx, pad - 4, y0 - 22, W - 2 * pad + 8, 36, 10); ctx.fill();
    hudText(ctx, String(Math.round(this.score)), pad + 6, y0 + 5, { size: 26, maxW: 96 });
    const wn = seg.kind === 'warm' ? t('games.gruppetto.seg.warm') : seg.kind === 'cool' ? t('games.gruppetto.seg.cool') : t('games.gruppetto.waveOf', { n: seg.wave, m: this.plan.N });
    hudText(ctx, wn, W / 2 - 10, y0 + 3, { size: W < 400 ? 18 : 21, align: 'center', color: '#d9ff3d', maxW: W * 0.3 });
    hudText(ctx, t('games.gruppetto.caughtHud', { a: this.caught, b: this.plan.riders }), W - pad - 4, y0 + 3, { size: W < 400 ? 19 : 22, align: 'right', color: '#ffffff', maxW: W * 0.34 });
    // la richiesta del momento: tratto, watt, tempo che manca
    const col = SEG_COLOR[seg.kind]; const by = y0 + 22; const bh2 = 44;
    ctx.fillStyle = 'rgba(8,10,26,.72)'; rrect(ctx, pad - 4, by, W - 2 * pad + 8, bh2, 12); ctx.fill();
    ctx.fillStyle = col; rrect(ctx, pad - 4, by, 7, bh2, 3); ctx.fill();
    const tw = this.tgtW || this.tgtNow(); const left = Math.max(0, Math.ceil((this.wk ? seg.stepEnd : seg.t1) - this.el)); // con un allenamento: nome del passo e tempo che manca alla fine del passo
    const easy = seg.kind === 'rest' || seg.kind === 'cool' || seg.kind === 'warm';
    hudText(ctx, this.wk ? (seg.label || t(`games.wk.seg.${seg.wkKind}`)) : t(`games.gruppetto.seg.${seg.kind}`), pad + 12, by + 29, { size: 21, color: col, maxW: W * 0.34 });
    hudText(ctx, `${tw} W`, W / 2 + 8, by + 32, { size: 32, align: 'center', color: this.inTarget || easy ? '#ffffff' : '#ffd34d', maxW: W * 0.34 });
    hudText(ctx, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, W - pad - 4, by + 29, { size: 21, align: 'right', color: '#e8e8f4', maxW: 70 });
    const segK = this.wk ? clamp((seg.stepEnd - this.el) / (seg.stepEnd - seg.stepStart), 0, 1) : clamp((seg.t1 - this.el) / (seg.t1 - seg.t0), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; rrect(ctx, pad, by + bh2 + 4, W - 2 * pad, 6, 3); ctx.fill();
    ctx.fillStyle = col; rrect(ctx, pad, by + bh2 + 4, Math.max(6, (W - 2 * pad) * segK), 6, 3); ctx.fill();
    const ty = by + bh2 + 15; const tk = clamp(this.el / this.total, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; rrect(ctx, pad, ty, W - 2 * pad, 5, 2.5); ctx.fill();
    ctx.fillStyle = '#d9ff3d'; rrect(ctx, pad, ty, Math.max(5, (W - 2 * pad) * tk), 5, 2.5); ctx.fill();
    ctx.fillStyle = 'rgba(8,10,26,.9)';
    for (const [i, s] of this.plan.segs.entries()) if (this.wk ? (s.wave >= 1 && s.wave !== this.plan.segs[i - 1]?.wave) : s.kind === 'pace') ctx.fillRect(pad + (W - 2 * pad) * (s.t0 / this.total) - 1, ty - 1, 2, 7);
    const goalBottom = ty + 14 + 46; this.drawGoal(ctx, W, H, ty + 14, col);
    if (!this.connected) hudText(ctx, t('games.common.demo'), W / 2, H - 6, { size: 13, align: 'center', color: '#ffd34d' });

    // in basso: potenza (numero grande + barra con il bersaglio) e il gruppo
    const bh = 22; const barY = H - 22 - bh; const bx = pad + 2; const bw2 = W - 2 * pad - 4;
    const gr = ctx.createLinearGradient(0, H - 128, 0, H); gr.addColorStop(0, 'rgba(6,8,22,0)'); gr.addColorStop(0.35, 'rgba(6,8,22,.55)'); gr.addColorStop(1, 'rgba(6,8,22,.82)');
    ctx.fillStyle = gr; ctx.fillRect(0, H - 128, W, 128);
    const big = W < 500 ? 56 : 64; const pc = this.sprinting ? '#4de3ff' : this.inTarget ? '#d9ff3d' : '#ffffff';
    const numW = hudText(ctx, String(Math.round(this.power)), pad + 4, barY - 10, { size: big, color: pc, maxW: 150 });
    hudText(ctx, 'W', pad + 8 + numW, barY - 10, { size: 22, color: '#e8e8f4' });
    const rx = W - pad - 4; const gw = Math.max(90, W - 2 * pad - numW - 60);
    hudText(ctx, String(this.group.length), rx, barY - 10, { size: big, align: 'right', color: '#d9ff3d', maxW: 110 });
    hudText(ctx, t('games.gruppetto.groupLbl'), rx, barY - 10 - big * 0.78, { size: 16, align: 'right', color: '#e8e8f4', maxW: gw });
    ctx.fillStyle = 'rgba(8,10,26,.75)'; rrect(ctx, bx, barY, bw2, bh, 8); ctx.fill();
    const maxW = Math.max(this.ftp * 1.7, tw * 1.25);
    ctx.fillStyle = pc; rrect(ctx, bx, barY, Math.max(8, bw2 * clamp(this.power / maxW, 0, 1)), bh, 8); ctx.fill();
    const t0 = bx + bw2 * clamp(HOLD_PCT * tw / maxW, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(t0, barY, Math.max(2, bx + bw2 * clamp(tw * 1.15 / maxW, 0, 1) - t0), bh);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw2 * clamp(tw / maxW, 0, 1) - 1, barY - 4, 3, bh + 8);

    // freccia sopra il corridore da prendere (si legge anche da lontano)
    const tb = this.bridge;
    if (tb && (tb.state === 'attack' || tb.gap < 75)) {
      const R0 = tb.riders[0]; const q = new THREE.Vector3(R0.x, 3.0, R0.z).project(this.stage.camera);
      if (q.z < 1) {
        const sx = clamp((q.x + 1) / 2 * W, 22, W - 22); const sy = Math.max(goalBottom + 16, (1 - q.y) / 2 * H - 8); const k = 1 + 0.12 * Math.sin(this.t * 8);
        ctx.save(); ctx.translate(sx, sy); ctx.scale(k, k); ctx.beginPath(); ctx.moveTo(-11, -9); ctx.lineTo(11, -9); ctx.lineTo(0, 9); ctx.closePath();
        ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.stroke(); ctx.fillStyle = this.blocked ? '#4de3ff' : '#ffd34d'; ctx.fill(); ctx.restore();
      }
    }
    // flecce di corsia: compaiono quando devi spostarti verso il corridore
    const b = this.bridge;
    if (b && b.state === 'attack' && Math.abs(this.x - b.riders[0].x) > 1.35 && b.gap < 14) {
      const dir = b.lane > this.lane ? 1 : -1; const k = 0.7 + 0.3 * Math.sin(this.t * 10);
      ctx.save(); ctx.globalAlpha = k; hudText(ctx, dir > 0 ? '▶' : '◀', dir > 0 ? W - 46 : 46, H * 0.5, { size: 52, align: 'center', color: '#4de3ff' }); ctx.restore();
    }
    // richiesta di più watt: sotto la barra dell'obiettivo, solo se non c'è un messaggio al centro
    if (this.hint && !this.msgs.cur) hudText(ctx, this.hint.text, W / 2, goalBottom + 30, { size: 22, align: 'center', color: '#ffd34d', maxW: W - 40 });
    this.msgs.draw(ctx, W, H, { u: W < 500 ? 0.9 : 1.1, y: H * 0.36 });
    const v3 = new THREE.Vector3();
    for (const p of this.pops) {
      p.t -= dt; const k = 1 - p.t / p.t0;
      v3.set(this.x + p.dx, p.y + k * 0.9, this.z + p.dz).project(this.stage.camera);
      ctx.globalAlpha = clamp(p.t / p.t0 * 2, 0, 1);
      hudText(ctx, p.text, clamp((v3.x + 1) / 2 * W + p.slot * 56, 44, W - 44), (1 - v3.y) / 2 * H, { size: 24, align: 'center', color: p.color });
      ctx.globalAlpha = 1;
    }
    this.pops = this.pops.filter((p) => p.t > 0 && this.state !== 'results');
    if (this.paused) {
      ctx.fillStyle = 'rgba(8,10,26,.72)'; ctx.fillRect(0, 0, W, H);
      hudText(ctx, t('games.gruppetto.paused'), W / 2, H * 0.42, { size: 42, align: 'center', color: '#ffd34d' });
      paragraph(ctx, t('games.gruppetto.pausedSub'), W / 2, H * 0.42 + 36, { size: 20, maxW: W - 40, color: '#f0f0f0' });
    }
    if (this.hooks.lost) trainerLostBanner(ctx, W, H, t);
    if (!['pace', 'effort', 'sprint'].includes(seg.kind)) this.hooks.progress?.drawToasts(ctx, W, dt, 224, true);
  }

  // obiettivo sempre visibile: metri al prossimo corridore (o al traguardo), con barra
  drawGoal(ctx, W, H, y, col) {
    const pad = 12; const b = this.bridge; const w = W - 2 * pad; const h = 46; const s = this.seg;
    ctx.fillStyle = 'rgba(8,10,26,.72)'; rrect(ctx, pad - 4, y, w + 8, h, 12); ctx.fill();
    let label; let frac; let right = ''; let c = '#ffffff';
    if (b && b.state === 'attack') {
      const m = Math.max(0, Math.round(b.gap)); label = t('games.gruppetto.gapTo', { m }); frac = 1 - clamp((b.gap - CATCH_GAP) / Math.max(1, b.gap0 - CATCH_GAP), 0, 1);
      right = `${Math.max(0, Math.ceil(b.t0 + b.dur - this.el))} s`; c = this.blocked ? '#4de3ff' : b.close > 0.05 ? '#d9ff3d' : '#ffd34d';
      if (this.blocked) label = t('games.gruppetto.lane');
    } else if (b) {
      label = t('games.gruppetto.nextIn', { m: Math.max(0, Math.round(b.gap)) }); frac = 1 - clamp((b.gap - b.gap0) / Math.max(1, b.startGap - b.gap0), 0, 1); c = '#ffd34d';
    } else if (s.kind === 'rest' || s.kind === 'pace') {
      const n = this.group.length; label = this.holdOk ? t('games.gruppetto.holdOk', { n }) : t('games.gruppetto.holdBad'); frac = clamp(1 - this.deficit / DROP_AFTER, 0, 1); c = this.holdOk ? '#9ad64b' : '#ff8d8d';
    } else { label = t('games.gruppetto.groupOf', { n: this.group.length }); frac = 1; }
    hudText(ctx, label, pad + 8, y + 22, { size: 22, color: c, maxW: w * 0.62 });
    if (right) hudText(ctx, right, W - pad - 4, y + 22, { size: 22, align: 'right', color: '#e8e8f4', maxW: w * 0.3 });
    ctx.fillStyle = 'rgba(255,255,255,.2)'; rrect(ctx, pad + 4, y + 30, w - 8, 9, 4.5); ctx.fill();
    ctx.fillStyle = c; rrect(ctx, pad + 4, y + 30, Math.max(9, (w - 8) * clamp(frac, 0, 1)), 9, 4.5); ctx.fill();
  }

  // riepilogo (kit): le stelle sono i criteri di starsFor() (slip-plan.js)
  drawResult(ctx, W, H) {
    const r = this.result;
    const ok = (n) => r.stars >= n;
    this.results.draw(ctx, W, H, {
      title: t('games.gruppetto.res.title'), subtitle: t('games.gruppetto.name'), stars: r.stars,
      criteria: r.wk ? [
        { ok: true, label: t('games.wk.res.done') },
        { ok: r.band >= 0.85, label: t('games.wk.res.band', { p: Math.round(r.band * 100) }) },
        { ok: r.finalWon, label: t('games.gruppetto.crit.sprint') },
      ] : [
        { ok: true, label: t('games.gruppetto.crit.finish') },
        { ok: ok(2), label: t('games.gruppetto.crit.half') },
        { ok: r.total > 0 && r.done / r.total >= 0.8, label: t('games.gruppetto.crit.most') },
        { ok: r.finalWon, label: t('games.gruppetto.crit.sprint') },
        { ok: r.dropped <= 3, label: t('games.gruppetto.crit.lost', { n: r.dropped }) },
      ],
      score: r.score, best: r.best ? String(r.best) : null, newBest: r.newBest,
      lines: [t('games.gruppetto.res.bridges', { a: r.done, b: r.total }), t('games.gruppetto.res.riders', { a: r.caught, b: r.riders })],
    });
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
