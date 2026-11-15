// BREAKAWAY 3D — tappa in linea a tempo (5/10/20 min): partenza in gruppo, fuga, traguardo volante, salita con GPM, inseguimento, volata.
// La logica di corsa è in racer-sim.js (rivali tarati sulla tua FTP, obiettivi, commento, stelle); qui c'è la scena, la telecamera e l'interfaccia.
// La velocità viene dai watt in % della FTP; + / − cambiano marcia; la traiettoria è automatica. Le salite arrivano al rullo.
// Grafica: modelli Quaternius e Kenney (CC0), three.js (MIT).

import * as THREE from 'three';
import { Stage, Effects } from './kit3d.js';
import { loadAll } from './kit/loader.js';
import { skyDome, styleLights, styleFog, toonMaterial, toonify, TIMES } from './kit/style.js';
import { Cyclist, loadCyclistTemplate, loadMeshyTemplate, makeKit, makeCrowdGeometry, makeMeshyCrowdGeometry, CYCLIST_URL, FAN_URL } from './kit/cyclist.js';
import { scatterModel, crowdInstances, prepareModel } from './kit/env.js';
import { Shake, TimeScale, WindLines, Confetti } from './kit/juice.js';
import { Quality } from './kit/quality.js';
import { txt, panel, uiScale, powerColor, gradeColor, HUD, hudView, measure, paragraph, MessageQueue, FONT_DISPLAY } from './kit/hud.js';
import { clamp, lerp, hash } from './engine.js';
import { SONGS } from './audio.js';
import { Race, buildTimeline, LANES, START, COOL, LEVELS } from './racer-sim.js';
import { t, fmtDec, ordinal } from '../i18n.js';

const you = () => t('games.racer.you'); // il giocatore è riconosciuto dal nome interno 'TU'
// nome corto: la prima parola, saltando gli articoli ("Il Conte Catena" → "Conte")
const first = (n) => { if (n === 'TU') return you(); const w = n.split(' '); return (w[0].length <= 2 && w[1] ? w[1] : w[0]); };
const who = (n) => (n === 'TU' ? you() : n);

const STEP = 2;            // campionamento della strada (m)
const ROAD_W = 8.4;
const DURATIONS = [300, 600, 1200]; // s: tappa breve, media, lunga
const STAGE_FOR = [0, 2, 1];        // scenario per durata: litorale, colline, passo di montagna
const LEVEL_KEYS = ['easy', 'normal', 'hard'];
const WORLD_SCALE = 1.25;  // il mondo scorre un po' più veloce della bici
const VIS_GRADE = 1.6;     // le salite si vedono un po' più ripide
const RUNOUT = 140;        // strada dopo l'arrivo (podio)
const Q = 'assets/3d/quaternius';
const K = 'assets/3d';

const MODELS = {
  qTree1: `${Q}/nature/tree1.glb`, qTree2: `${Q}/nature/tree2.glb`, qTree3: `${Q}/nature/tree3.glb`, qTree4: `${Q}/nature/tree4.glb`,
  qBush1: `${Q}/nature/bush1.glb`, qBush2: `${Q}/nature/bush2.glb`, qBush3: `${Q}/nature/bush3.glb`,
  qRock1: `${Q}/nature/rock1.glb`, qRock2: `${Q}/nature/rock2.glb`, qRock3: `${Q}/nature/rock3.glb`, qGrass: `${Q}/nature/grass2.glb`,
  house1: `${Q}/town/house.glb`, house2: `${Q}/town/house2.glb`, house3: `${Q}/town/house3.glb`, house4: `${Q}/town/house4.glb`, house5: `${Q}/town/house5.glb`, shop: `${Q}/town/shop.glb`,
  barn: `${Q}/farm/barn.glb`, smallBarn: `${Q}/farm/smallbarn.glb`, silo: `${Q}/farm/silo.glb`, windmill: `${Q}/farm/windmill.glb`, fence: `${Q}/farm/fence.glb`, waterTower: `${Q}/farm/watertower.glb`,
  palmTall: `${K}/nature/tree_palmTall.glb`, palmBend: `${K}/nature/tree_palmBend.glb`, palmShort: `${K}/nature/tree_palmShort.glb`,
  pineA: `${K}/nature/tree_pineTallA.glb`, pineB: `${K}/nature/tree_pineTallB.glb`, pineRound: `${K}/nature/tree_pineRoundA.glb`,
  oakFall: `${K}/nature/tree_oak_fall.glb`, defFall: `${K}/nature/tree_default_fall.glb`, tallFall: `${K}/nature/tree_tall_fall.glb`,
  overhead: `${K}/racing/overhead.gltf`, overheadLights: `${K}/racing/overheadLights.gltf`, grandStand: `${K}/racing/grandStandCovered.gltf`, tent: `${K}/racing/tent.gltf`,
  barrierRed: `${K}/racing/barrierRed.gltf`, barrierWhite: `${K}/racing/barrierWhite.gltf`, flagRed: `${K}/racing/flagRed.gltf`, flagCheckers: `${K}/racing/flagCheckers.gltf`,
  coin: `${K}/pickups/coin-gold.glb`,
  // generati con Meshy per Spindro (assets/3d/meshy): transenna, arco gonfiabile, moto delle riprese
  mBarrier: 'assets/3d/meshy/barrier.glb', mArch: 'assets/3d/meshy/arch.glb', mMoto: 'assets/3d/meshy/moto.glb',
  // arco dell'arrivo con la scritta FINISH stampata, ammiraglia e paesaggio (Meshy)
  mFinish: 'assets/3d/meshy/finish_arch.glb', mCar: 'assets/3d/meshy/team_car.glb',
  mHut: 'assets/3d/meshy/alpine_hut.glb', mChurch: 'assets/3d/meshy/church.glb', mFarmhouse: 'assets/3d/meshy/farmhouse.glb',
  mCypress: 'assets/3d/meshy/cypress.glb', mHay: 'assets/3d/meshy/hay_bale.glb', mFeed: 'assets/3d/meshy/feed_tent.glb',
};

// scenari: [modello, peso, tipo, altezza min, altezza max]
const STAGES = [
  {
    name: 'games.racer.stage1.name', desc: 'games.racer.stage1.desc', time: 'dusk',
    grass: '#9fb55a', grass2: '#86a04a', verge: '#d8c08a', far: 'sea', farCol: '#b0745a',
    scenery: [['palmTall', 5, 'tree', 7, 10], ['palmBend', 4, 'tree', 6, 9], ['palmShort', 3, 'tree', 3, 5], ['qBush1', 3, 'bush', 1, 1.8], ['qBush3', 3, 'bush', 1, 1.6], ['qRock1', 2, 'rock', 1, 2.4], ['qRock3', 2, 'rock', 0.8, 1.6], ['qGrass', 3, 'bush', 0.5, 0.9]],
    villages: [0.03, 0.4, 0.95], farms: [],
    layout: [[200, 0, 0], [250, 14, 1], [200, 0, 3], [300, -18, 0], [250, 8, -2], [200, 0, 4], [300, 20, 0], [250, -10, -2], [300, 0, 2], [250, -16, 0], [200, 0, 0]],
  },
  {
    name: 'games.racer.stage2.name', desc: 'games.racer.stage2.desc', time: 'morning',
    grass: '#6fa64e', grass2: '#5b9143', verge: '#9a8f78', far: 'mountains', farCol: '#7d8fa8',
    scenery: [['pineA', 6, 'tree', 8, 14], ['pineB', 5, 'tree', 7, 12], ['pineRound', 3, 'tree', 5, 8], ['qTree3', 2, 'tree', 6, 9], ['qRock1', 3, 'rock', 1.5, 4], ['qRock2', 3, 'rock', 1, 3], ['qBush2', 2, 'bush', 1, 1.6], ['qGrass', 3, 'bush', 0.5, 0.9]],
    villages: [0.03, 0.95], farms: [0.22, 0.6],
    layout: [[200, 0, 0], [300, 10, 4], [250, -16, 5], [300, 14, 6], [200, 0, 3], [250, -12, 5], [300, 18, 6], [200, 0, 2], [300, -14, -4], [250, 10, -3], [200, 0, 0]],
  },
  {
    name: 'games.racer.stage3.name', desc: 'games.racer.stage3.desc', time: 'golden',
    grass: '#a9b25e', grass2: '#94a050', verge: '#c9a77a', far: 'hills', farCol: '#b98a5c',
    scenery: [['oakFall', 4, 'tree', 6, 10], ['defFall', 4, 'tree', 5, 8], ['tallFall', 3, 'tree', 8, 12], ['qTree1', 3, 'tree', 6, 9], ['qTree2', 2, 'tree', 6, 10], ['qBush1', 3, 'bush', 1, 1.8], ['qBush2', 2, 'bush', 1, 1.8], ['qRock2', 1, 'rock', 1, 2], ['qGrass', 3, 'bush', 0.5, 0.9]],
    villages: [0.03, 0.55, 0.95], farms: [0.25, 0.75],
    layout: [[200, 0, 0], [250, -12, 3], [250, 16, -3], [200, 0, 4], [300, -20, -2], [250, 12, 3], [250, 0, -3], [300, 16, 5], [250, -14, -4], [250, 8, 2], [200, 0, 0]],
  },
];

const RIVALS = [
  { name: 'games.racer.rival1.name', color: '#2a9d8f', skill: 1.02, line: 'games.racer.rival1.line' },
  { name: 'games.racer.rival2.name', color: '#ff4d9d', skill: 1.05, line: 'games.racer.rival2.line' },
  { name: 'games.racer.rival3.name', color: '#7b2cbf', skill: 1.04, line: 'games.racer.rival3.line' },
  { name: 'games.racer.rival4.name', color: '#e63946', skill: 0.98, line: 'games.racer.rival4.line' },
  { name: 'games.racer.rival5.name', color: '#ffd166', skill: 1.0, line: 'games.racer.rival5.line', climber: true },
  { name: 'games.racer.rival6.name', color: '#3a86ff', skill: 0.95, line: 'games.racer.rival6.line' },
  { name: 'games.racer.rival7.name', color: '#f77f00', skill: 0.97, line: 'games.racer.rival7.line' },
];
const PLAYER_COLOR = '#d9ff3d';
const KIND_COLORS = { start: '#4de3ff', break: '#ff9f1c', recover: '#7fb7ff', sprint: '#3ccf6a', climb: '#ff5a6a', chase: '#c77dff', final: '#d9ff3d' };
const CAR_YAW = -Math.PI / 2; // nel file l'ammiraglia punta verso +X; nel gioco l'avanti è +Z

export class Racer3D {
  constructor(hudCanvas, hooks, audio) {
    this.hud = hudCanvas; this.hooks = hooks; this.audio = audio;
    this.active = false;
    const ls = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : Number(v); } catch { return d; } };
    this.durIdx = clamp(ls('racerDur', 0) | 0, 0, DURATIONS.length - 1); this.level = clamp(ls('racerLevel', 1) | 0, 0, 2); this.adaptMem = clamp(ls('racerAdapt', 0), -0.15, 0.15);
    this.stageIndex = STAGE_FOR[this.durIdx];
    this.loop = this.loop.bind(this);
  }

  // ---------- ciclo di vita ----------
  async start() {
    this.active = true;
    this.quality = new Quality();
    this.stage = new Stage(this.hud, { quality: this.quality });
    this.stage.onQuality = (cfg) => this.applyDensity(cfg);
    this.shake = new Shake(); this.time = new TimeScale();
    this.msgs = new MessageQueue(); this.pops = []; this.t = 0; this.state = 'loading'; this.power = 0; this.cadence = 0;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
    this.audio.playSong(SONGS.menu);
    // tocco sui tasti del menu (durata, livello): in cattura sulla finestra, così non parte anche il + / − del tocco a metà schermo
    this.onPointer = (e) => {
      if (this.state !== 'select' || e.target !== this.hud) return;
      const r = this.hud.getBoundingClientRect();
      if (this.tap((e.clientX - r.left) * (this.W / r.width), (e.clientY - r.top) * (this.H / r.height))) { e.stopImmediatePropagation(); e.preventDefault(); }
    };
    window.addEventListener('pointerdown', this.onPointer, true);
    try {
      this.models = await loadAll(MODELS, (p) => { this.loadPct = p * 0.85; });
      // corridori: modello Meshy con scheletro automatico; se non si carica, il ciclista Quaternius di prima
      this.tpl = await loadMeshyTemplate().catch((err) => { console.warn('Meshy cyclist:', err); return loadCyclistTemplate(CYCLIST_URL); });
      this.crowdGeo = await makeMeshyCrowdGeometry().catch((err) => { console.warn('Meshy fan:', err); return makeCrowdGeometry(FAN_URL); });
      this.loadPct = 1;
      if (!this.active) return;
      this.buildStage();
      this.state = 'select'; this.selT = 0;
    } catch (err) {
      console.error(err);
      this.state = 'error'; this.error = err.message;
    }
  }

  stop() {
    this.active = false;
    window.removeEventListener('pointerdown', this.onPointer, true);
    this.audio.stopSong();
    this.hooks.setGrade(null);
    this.disposeStage();
    this.stage?.dispose();
  }

  disposeStage() {
    if (!this.scene) return;
    this.scene.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }

  get W() { return this.stage.W; }
  get H() { return this.stage.H; }

  // ---------- costruzione della tappa ----------
  buildStage() {
    this.disposeStage();
    this.stageIndex = STAGE_FOR[this.durIdx]; this.builtKey = `${this.durIdx}`;
    const S0 = STAGES[this.stageIndex];
    this.tl = buildTimeline(this.dur, this.stageIndex);
    // paesi e fattorie: lo stesso schema ripetuto lungo tutta la tappa
    const reps = this.dur / 300; const expand = (a) => Array.from({ length: reps }, (_, k) => a.map((v) => (v + k) / reps)).flat();
    const S = { ...S0, villages: expand(S0.villages), farms: expand(S0.farms) }; this.S = S;
    const scene = new THREE.Scene(); this.scene = scene; this.stage.scene = scene;
    // il passo di render del bagliore guarda la scena vecchia: si ricrea
    if (this.stage.composer) { this.stage.composer.passes[0].scene = scene; }
    this.camera = this.stage.camera; this.camera.fov = 60; this.camera.far = 900; this.camera.updateProjectionMatrix();
    this.camInit = false;
    const T = TIMES[S.time];
    scene.add(skyDome(S.time));
    styleFog(scene, S.time, 80, 520);
    this.light = styleLights(scene, S.time, { shadows: true, mapSize: this.quality.cfg.shadowMap, extent: 26 });
    this.effects = new Effects(scene, 60);
    this.wind = new WindLines(scene, 36);
    this.confetti = new Confetti(scene, 260);
    this.buildPath(S);
    this.buildRoad(S);
    this.buildTerrain(S, T);
    this.inst = [];
    this.planMeshy(S);
    this.buildScenery(S);
    this.buildTowns(S);
    this.buildMeshy();
    this.buildLandmarks();
    this.buildCrowd();
    this.buildRiders();
    this.buildPickups();
    this.buildDraftZone();
    this.buildPodium();
    this.applyDensity(this.quality.cfg);
    this.positionIdle();
  }

  applyDensity(cfg) {
    // bagliore misurato: brillano luci e coriandoli, non le maglie chiare
    if (this.stage.bloom) { this.stage.bloom.threshold = 0.93; this.stage.bloom.strength = 0.45; this.stage.bloom.radius = 0.35; }
    if (this.stage.composer && this.scene) this.stage.composer.passes[0].scene = this.scene;
    if (!this.inst) return;
    for (const i of this.inst) { i.setDensity(i.isCrowd ? cfg.crowd : cfg.density); if (!i.isCrowd) i.setShadows?.(false); }
    this.light?.sun && (this.light.sun.castShadow = cfg.shadows);
    for (const r of this.riders || []) r.cy.setShadows(cfg.shadows);
  }

  buildPath(S) {
    const pts = []; let h = 0; let x = 0; let z = 0; let y = 0; let s = 0;
    const L = this.tl.length; const total = L + RUNOUT + 40;
    // curve: lo schema della tappa ripetuto e specchiato; la pendenza viene dal copione (salite dei momenti)
    const segs = []; let acc = 0; let rep = 0;
    while (acc < total) { for (const [len, turn] of S.layout) { segs.push({ a: acc, b: acc + len, turn: rep % 2 ? -turn : turn }); acc += len; if (acc >= total) break; } rep++; }
    segs.push({ a: acc, b: acc + 1e6, turn: 0 });
    let k = 0;
    while (s <= total) {
      while (segs[k].b <= s) k++;
      const prevTurn = k > 0 ? segs[k - 1].turn : 0; const blend = clamp((s - segs[k].a) / 80, 0, 1);
      const tr = s > L + RUNOUT ? 0 : lerp(prevTurn, segs[k].turn, blend * blend * (3 - 2 * blend));
      const gr = this.tl.gradeAt(Math.min(s, L + 40)) * (s > L ? clamp(1 - (s - L) / 60, 0, 1) : 1);
      pts.push({ x, y, z, h, grade: gr, s, turn: tr });
      h += (tr * Math.PI / 180) * (STEP / 100);
      x += Math.sin(h) * STEP; z += Math.cos(h) * STEP;
      y += (gr / 100) * STEP * VIS_GRADE;
      s += STEP;
    }
    this.pts = pts;
    this.length = L;
    const race = pts.filter((p) => p.s <= this.length);
    this.minY = Math.min(...race.map((p) => p.y)); this.maxY = Math.max(...race.map((p) => p.y));
    this.lines = this.tl.lines.map((l) => ({ type: l.type, s: l.s }));
  }

  // posizione sulla strada: s = metri dalla partenza, off = spostamento laterale (+ destra)
  at(s, off = 0) {
    const f = clamp(s / STEP, 0, this.pts.length - 1.001);
    const i = Math.floor(f); const k = f - i;
    const a = this.pts[i]; const b = this.pts[i + 1];
    const h = lerp(a.h, b.h, k);
    const rx = -Math.cos(h); const rz = Math.sin(h);
    return { x: lerp(a.x, b.x, k) + rx * off, y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) + rz * off, h, grade: lerp(a.grade, b.grade, k), turn: lerp(a.turn, b.turn, k) };
  }

  buildRoad(S) {
    const n = this.pts.length;
    const pos = new Float32Array(n * 2 * 3); const uv = new Float32Array(n * 2 * 2); const idx = [];
    const curb = new Float32Array(n * 4 * 3); const cuv = new Float32Array(n * 4 * 2); const cidx = [];
    this.pts.forEach((p, i) => {
      const rx = -Math.cos(p.h); const rz = Math.sin(p.h); const hw = ROAD_W / 2;
      pos.set([p.x - rx * hw, p.y + 0.03, p.z - rz * hw, p.x + rx * hw, p.y + 0.03, p.z + rz * hw], i * 6);
      uv.set([0, p.s / 12, 1, p.s / 12], i * 4);
      const c = [hw, hw + 0.45];
      curb.set([p.x - rx * c[1], p.y + 0.06, p.z - rz * c[1], p.x - rx * c[0], p.y + 0.06, p.z - rz * c[0],
        p.x + rx * c[0], p.y + 0.06, p.z + rz * c[0], p.x + rx * c[1], p.y + 0.06, p.z + rz * c[1]], i * 12);
      cuv.set([0, p.s / 3, 1, p.s / 3, 0, p.s / 3, 1, p.s / 3], i * 8);
      if (i < n - 1) {
        const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        const q = i * 4; cidx.push(q, q + 4, q + 1, q + 1, q + 4, q + 5, q + 2, q + 6, q + 3, q + 3, q + 6, q + 7);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, toonMaterial({ map: roadTexture(), side: THREE.DoubleSide }));
    road.receiveShadow = true;
    this.scene.add(road);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(curb, 3)); cg.setAttribute('uv', new THREE.BufferAttribute(cuv, 2));
    cg.setIndex(cidx); cg.computeVertexNormals();
    const curbs = new THREE.Mesh(cg, toonMaterial({ map: curbTexture(), side: THREE.DoubleSide }));
    curbs.receiveShadow = true;
    this.scene.add(curbs);
    // scritte sull'asfalto: linea d'arrivo a scacchi
    const fin = this.at(this.length);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 1.4), toonMaterial({ map: checkerTexture() }));
    line.rotation.set(-Math.PI / 2, 0, fin.h + Math.PI); line.position.set(fin.x, fin.y + 0.05, fin.z); line.receiveShadow = true;
    this.scene.add(line);
  }

  // colline low-poly ai lati della strada
  terrainY(s, off) {
    const p = this.at(s);
    const d = Math.abs(off);
    if (d < ROAD_W / 2 + 1.4) return p.y - 0.05;
    const side = off > 0 ? 1 : -1;
    const n = Math.sin(s * 0.013 + side * 1.7) * 0.6 + Math.sin(s * 0.031 + d * 0.07 + side) * 0.4;
    const rise = (d - ROAD_W / 2) * (this.S.far === 'mountains' ? 0.35 : 0.16);
    return p.y - 0.2 + Math.max(-2, n * rise * 0.9 + rise * 0.25);
  }

  buildTerrain(S, T) {
    const cols = [-140, -90, -60, -40, -26, -16, -9.5, -6.2, 6.2, 9.5, 16, 26, 40, 60, 90, 140];
    const step = 4; const rows = Math.ceil(this.pts.at(-1).s / step) + 1;
    const pos = []; const col = []; const idx = [];
    const c1 = new THREE.Color(S.grass); const c2 = new THREE.Color(S.grass2); const cv = new THREE.Color(S.verge);
    for (let r = 0; r < rows; r++) {
      const s = r * step;
      for (const off of cols) {
        const p = this.at(s, off);
        pos.push(p.x, this.terrainY(s, off), p.z);
        const c = Math.abs(off) < 7 ? cv : (hash(r * 31 + off) > 0.5 ? c1 : c2);
        col.push(c.r, c.g, c.b);
      }
    }
    const nc = cols.length; const mid = cols.findIndex((c) => c > 0) - 1;
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < nc - 1; c++) {
      if (c === mid) continue; // sotto la strada
      const a = r * nc + c; const b = a + nc;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const g2 = geo.toNonIndexed(); g2.computeVertexNormals();
    const mesh = new THREE.Mesh(g2, toonMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    // sfondo lontano: mare o pianura + montagne/colline in un'unica mesh
    const xs = this.pts.map((p) => p.x); const zs = this.pts.map((p) => p.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2; const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), toonMaterial({ color: S.far === 'sea' ? '#3f78ad' : S.grass2 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(cx, this.minY - (S.far === 'sea' ? 3 : 7), cz);
    this.scene.add(ground);
    const peaks = []; const cMain = new THREE.Color(S.farCol); const cSnow = new THREE.Color('#f4f8ff');
    const paint = (g, c) => { g = g.toNonIndexed(); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
    const big = S.far === 'mountains'; const n = S.far === 'sea' ? 14 : 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash(i) * 0.2; const dist = 560 + hash(i + 5) * 180;
      if (S.far === 'sea' && Math.sin(a) > -0.2) continue; // mare da un lato, promontori dall'altro
      const hgt = (big ? 130 : 50) + hash(i + 9) * (big ? 150 : 45);
      const cone = new THREE.ConeGeometry(hgt * 1.15, hgt, 7); cone.translate(cx + Math.cos(a) * dist, this.minY - 7 + hgt / 2, cz + Math.sin(a) * dist);
      peaks.push(paint(cone, cMain.clone().offsetHSL(0, 0, (hash(i + 2) - 0.5) * 0.08)));
      if (big && hgt > 180) {
        const cap = new THREE.ConeGeometry(hgt * 0.4, hgt * 0.36, 7); cap.translate(cx + Math.cos(a) * dist, this.minY - 7 + hgt * 0.83, cz + Math.sin(a) * dist);
        peaks.push(paint(cap, cSnow));
      }
    }
    if (peaks.length) {
      const g = mergeGeometriesSafe(peaks); g.computeVertexNormals();
      this.scene.add(new THREE.Mesh(g, toonMaterial({ vertexColors: true, fog: true })));
    }
  }

  // vegetazione con istanze e LOD
  buildScenery(S) {
    const total = S.scenery.reduce((a, x) => a + x[1], 0);
    const per = {};
    const near = (s) => S.villages.some((v) => Math.abs(s - v * this.length) < 110) || S.farms.some((v) => Math.abs(s - v * this.length) < 70);
    for (let s = 6; s < this.pts.at(-1).s; s += 6) {
      for (const side of [-1, 1]) {
        const r = hash(s * 1.3 + side * 7);
        if (r < 0.2) continue;
        let k = hash(s * 2.1 + side) * total; let pickE = S.scenery[0];
        for (const e of S.scenery) { if ((k -= e[1]) < 0) { pickE = e; break; } }
        const [name, , kind, h0, h1] = pickE;
        const small = kind !== 'tree';
        if (!small && near(s)) continue;
        const off = side * (ROAD_W / 2 + (small ? 1.8 : 4.5) + hash(s + side * 3) * (small ? 8 : 44));
        const p = this.at(s, off);
        if (this.reserved.some((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < (q.r + 2.5) ** 2)) continue;
        (per[name] = per[name] || { kind, list: [] }).list.push({ x: p.x, y: this.terrainY(s, off) - 0.1, z: p.z, rot: hash(s * 5 + side) * Math.PI * 2, h: h0 + hash(s * 3 + side) * (h1 - h0), d: s });
      }
    }
    for (const [name, { kind, list }] of Object.entries(per)) {
      const gl = this.models[name]; if (!gl) continue;
      this.inst.push(scatterModel(this.scene, gl, list, { kind, lod: kind === 'tree', lodDist: 200, window: [-30, 560], grow: 60 }));
    }
  }

  // paesi (case ai lati) e fattorie
  buildTowns(S) {
    const houses = ['house1', 'house2', 'house3', 'house4', 'house5', 'shop'];
    const per = {};
    const put = (name, s, off, h, face = 0) => {
      const p = this.at(s, off);
      (per[name] = per[name] || []).push({ x: p.x, y: this.terrainY(s, off) - 0.15, z: p.z, rot: p.h + (off > 0 ? -Math.PI / 2 : Math.PI / 2) + face, h, d: s, always: true });
    };
    for (const v of S.villages) {
      const c = v * this.length;
      for (let s = c - 100; s < c + 100; s += 15) for (const side of [-1, 1]) {
        if (hash(s * 0.7 + side) < 0.18) continue;
        const name = houses[Math.floor(hash(s + side * 11) * houses.length)];
        put(name, s, side * (ROAD_W / 2 + 9 + hash(s * 3 + side) * 4), name === 'shop' ? 6 : 7 + hash(s) * 3);
        if (hash(s * 1.9 + side) > 0.5) put(houses[Math.floor(hash(s * 4 + side) * 5)], s + 6, side * (ROAD_W / 2 + 25 + hash(s * 5) * 10), 8);
      }
    }
    for (const f of S.farms) {
      const c = f * this.length; const side = hash(c) > 0.5 ? 1 : -1;
      put('barn', c, side * 34, 9, 0); put('silo', c + 16, side * 42, 15, 0); put('smallBarn', c - 18, side * 30, 6, 0);
      put(hash(c * 2) > 0.5 ? 'windmill' : 'waterTower', c + 40, -side * 46, 16, 0);
      // staccionata lungo la strada
      for (let s = c - 70; s < c + 70; s += 4.2) put('fence', s, side * (ROAD_W / 2 + 4), 1.1, Math.PI / 2);
    }
    for (const [name, list] of Object.entries(per)) {
      const gl = this.models[name]; if (!gl) continue;
      this.inst.push(scatterModel(this.scene, gl, list, { kind: 'house', lod: false, window: [-40, 560], grow: 60 }));
    }
  }

  placeModel(name, s, off, scale, rotExtra = 0) {
    const g = this.models[name]; if (!g) return null;
    const o = g.scene.clone(true);
    const p = this.at(s, off);
    o.position.set(p.x, p.y, p.z);
    o.rotation.y = p.h + rotExtra;
    o.scale.setScalar(scale);
    o.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = true; } });
    this.scene.add(o);
    return o;
  }

  // arco dell'arrivo: modello Meshy con la scritta stampata nella texture, davanti a chi arriva
  finishArch(s) {
    const gl = this.models.mFinish; const geo = groundedGeometry(gl);
    let map = null; gl.scene.traverse((o) => { if (o.isMesh && !map) map = o.material.map; });
    const p = this.at(s); const k = (ROAD_W + 2.6) / geo.userData.width;
    const arch = new THREE.Mesh(geo, toonMaterial(map ? { map, emissive: '#2a2020' } : { color: '#c81d25' }));
    arch.position.set(p.x, p.y - 0.05, p.z); arch.rotation.y = p.h + Math.PI; arch.scale.setScalar(k);
    arch.castShadow = false; arch.receiveShadow = true;
    this.scene.add(arch);
  }

  // paesaggio Meshy: si pianifica prima della vegetazione, che lascia libero lo spazio (this.reserved)
  planMeshy(S) {
    const L = this.length; const per = {}; this.reserved = [];
    const idx = this.stageIndex;
    const nearTown = (s) => S.villages.some((v) => Math.abs(s - v * L) < 118) || S.farms.some((v) => Math.abs(s - v * L) < 84);
    const put = (key, s, off, h, r, { face = 0, sink = 0.3, always = true, rot = null } = {}) => {
      const p = this.at(s, off);
      this.reserved.push({ x: p.x, z: p.z, r });
      (per[key] = per[key] || []).push({ x: p.x, y: this.terrainY(s, off) - sink, z: p.z, rot: rot ?? p.h + (off > 0 ? -Math.PI / 2 : Math.PI / 2) + face, h, d: s, always });
    };
    // chiese: in fondo a ogni paese, a 16 m dal ciglio
    S.villages.forEach((v, i) => { const c = v * L; const s = v < 0.5 ? c + 112 : c - 112; put('mChurch', s, (i % 2 ? -1 : 1) * (ROAD_W / 2 + 17), 13, 9); });
    // case coloniche: vicino alle fattorie e sole in campagna
    const lone = [[0.25, 0.7], [0.42, 0.8], [0.12, 0.42, 0.88]][idx] || [];
    for (const f of S.farms) { const c = f * L; const side = hash(c) > 0.5 ? 1 : -1; put('mFarmhouse', c - 52, side * (ROAD_W / 2 + 22), 8, 8); }
    lone.forEach((f, i) => { const s = f * L; if (!nearTown(s) && s < L - 320) put('mFarmhouse', s, (i % 2 ? -1 : 1) * (ROAD_W / 2 + 24), 8, 8); });
    // baite alpine: sulle salite della tappa di montagna
    if (S.far === 'mountains') {
      let last = -1e9; let n = 0;
      for (const p of this.pts) {
        if (p.s > L - 300 || n >= 8) break;
        if (p.grade < 3 || p.s < last + 150 || p.s < 90 || nearTown(p.s)) continue;
        put('mHut', p.s, (n % 2 ? -1 : 1) * (ROAD_W / 2 + 15 + hash(p.s) * 8), 7, 6);
        last = p.s; n++;
      }
    }
    // colline: cipressi in fila lungo la strada e balle di fieno nei campi
    if (S.far === 'hills') {
      for (let c = 140; c < L - 300; c += 130 + hash(c) * 60) {
        if (nearTown(c)) continue;
        const side = hash(c * 3) > 0.5 ? 1 : -1;
        for (let k = 0; k < 6; k++) put('mCypress', c + k * 6.5, side * (ROAD_W / 2 + 6.5 + hash(c + k) * 0.8), 8 + hash(c * 7 + k) * 2, 1.8, { sink: 0.1, always: false, rot: hash(c + k * 5) * 6.28 });
      }
      for (let c = 260; c < L - 300; c += 170 + hash(c * 2) * 80) {
        if (nearTown(c)) continue;
        const side = hash(c * 5) > 0.5 ? -1 : 1;
        for (let k = 0; k < 3; k++) put('mHay', c + k * 3.4, side * (ROAD_W / 2 + 9 + hash(c + k * 3) * 6), 1.5, 2, { sink: 0.1, always: false, rot: hash(c * 3 + k) * 6.28 });
      }
    }
    // zona di ristoro a metà tappa, un gazebo per lato
    const mid = L * 0.5;
    put('mFeed', mid, -(ROAD_W / 2 + 7.5), 3, 4.5); put('mFeed', mid + 9, ROAD_W / 2 + 7.5, 3, 4.5);
    this.meshyPlan = per;
  }

  buildMeshy() {
    const kinds = { mCypress: 'prop', mHay: 'prop' };
    for (const [key, list] of Object.entries(this.meshyPlan)) {
      const gl = this.models[key]; if (!gl) continue;
      groundModel(gl);
      const far = key === 'mCypress' || key === 'mHay';
      const inst = scatterModel(this.scene, gl, list, { kind: kinds[key] || 'house', lod: !far, lodDist: 220, window: [-20, far ? 320 : 520], grow: 60 });
      inst.meshyKey = key; this.inst.push(inst);
    }
  }

  // ammiraglia: segue il giocatore 15–25 m dietro; si vede quando la camera guarda indietro (menu, arrivo, podio)
  updateCar(dt) {
    if (!this.carRoot) return;
    const st = this.state; let s; let x = -(ROAD_W / 2 - 1.9);
    if (st === 'race' || st === 'countdown') s = this.s - (20 + Math.sin(this.t * 0.17) * 4.5);
    else if (st === 'finishCam') { s = this.s - 11; x = -2.5; } // la camera d'arrivo guarda indietro: l'ammiraglia si avvicina al gruppo
    else if (st === 'results') {
      // parcheggiata accanto al podio
      this.podium.updateMatrixWorld(true); const w = this.podium.localToWorld(new THREE.Vector3(-3.7, 0, 3.4));
      this.carState = st; this.carS = null; this.carRoot.visible = true;
      this.carRoot.position.set(w.x, w.y, w.z); this.carRoot.rotation.set(0, this.podium.rotation.y + Math.PI + 0.25, 0);
      return;
    }
    else s = START - 15; // menu: dietro al gruppo fermo
    s = clamp(s, 0, this.pts.at(-1).s - 4);
    this.carS = this.carS == null || st !== this.carState ? s : this.carS + (s - this.carS) * Math.min(1, dt * 3);
    this.carState = st;
    const p = this.at(this.carS, x);
    this.carRoot.visible = true;
    this.carRoot.position.set(p.x, p.y, p.z);
    this.carRoot.rotation.set(0, p.h, 0); this.carRoot.rotateX(-Math.atan(p.grade / 100 * VIS_GRADE));
  }

  buildLandmarks() {
    // arco gonfiabile (modello Meshy senza colori: lo colora il materiale) con il cartello appeso sotto
    const archGeo = this.models.mArch ? groundedGeometry(this.models.mArch) : null;
    const banner = (s, text, color, fg = '#fff', pattern = 'stripe') => {
      const p = this.at(s);
      if (archGeo) {
        const span = ROAD_W + 2.4; const k = span / archGeo.userData.width;
        const arch = new THREE.Mesh(archGeo, archMaterial(color, pattern));
        arch.position.set(p.x, p.y, p.z); arch.rotation.y = p.h; arch.scale.setScalar(k);
        arch.castShadow = false; arch.receiveShadow = true;
        this.scene.add(arch);
        const top = archGeo.userData.inner * k;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W * 0.78, 1.15), toonMaterial({ map: labelTexture(text, color === '#ffffff' ? '#d62839' : color, fg), emissive: '#222222' }));
        plane.position.set(p.x, p.y + top - 0.9, p.z); plane.rotation.y = p.h + Math.PI;
        const backP = plane.clone(); backP.rotation.y = p.h; backP.position.set(p.x + Math.sin(p.h) * 0.02, p.y + top - 0.9, p.z + Math.cos(p.h) * 0.02);
        this.scene.add(plane, backP);
        return;
      }
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 1.2, 1.3), toonMaterial({ map: labelTexture(text, color, fg), side: THREE.DoubleSide, emissive: '#222222' }));
      plane.position.set(p.x, p.y + 4.6, p.z); plane.rotation.y = p.h + Math.PI;
      this.scene.add(plane);
    };
    banner(START + 16, t('games.racer.start'), '#2b2b33');
    if (this.models.mFinish) this.finishArch(this.length); else banner(this.length, t('games.racer.finish'), '#d62839');
    for (const ln of this.lines) banner(ln.s, ln.type === 'kom' ? t('games.racer.komBanner') : t('games.racer.sprintBanner'), ln.type === 'kom' ? '#ffffff' : '#2a9d3a', '#fff', ln.type === 'kom' ? 'dots' : 'stripe');
    // ultimi 500 m: striscione rosso ("triangolo rosso") e cartello dei 200 m
    this.lastK = this.length - 500;
    banner(this.lastK, t('games.racer.last500'), '#c81d25');
    // tribune, tende, bandiere
    for (const s of [this.length - 40, this.length + 30]) {
      this.placeModel('grandStand', s, -(ROAD_W / 2 + 6), 7, Math.PI / 2);
      this.placeModel('grandStand', s + 12, ROAD_W / 2 + 6, 7, -Math.PI / 2);
    }
    this.placeModel('tent', 50, -(ROAD_W / 2 + 7), 5); this.placeModel('tent', 50, ROAD_W / 2 + 7, 5);
    // transenne (istanze): ultimi 250 m, partenza e intorno ai traguardi
    const bars = { barrierRed: [], barrierWhite: [], flagRed: [], flagCheckers: [] };
    const barName = (side) => (this.models.mBarrier ? 'mBarrier' : side < 0 ? 'barrierRed' : 'barrierWhite');
    if (this.models.mBarrier) { groundModel(this.models.mBarrier); bars.mBarrier = []; }
    const bar = (s, side) => { if (this.models.mFinish && Math.abs(s - this.length) < 4.5) return; const p = this.at(s, side * (ROAD_W / 2 + 1.2)); bars[barName(side)].push({ x: p.x, y: p.y, z: p.z, rot: p.h + Math.PI / 2, h: this.models.mBarrier ? 1.2 : 1.05, d: s, always: true }); };
    for (let s = this.length - 260; s < this.length + 90; s += 2.6) { bar(s, -1); bar(s, 1); }
    for (let s = 0; s < 70; s += 2.6) { bar(s, -1); bar(s, 1); }
    for (const ln of this.lines) for (let k = -24; k <= 24; k += 8) {
      const a = this.at(ln.s + k, -(ROAD_W / 2 + 1.6)); const b = this.at(ln.s + k + 4, ROAD_W / 2 + 1.6);
      bars.flagRed.push({ x: a.x, y: a.y, z: a.z, rot: a.h, h: 3.2, d: ln.s + k, always: true });
      bars.flagCheckers.push({ x: b.x, y: b.y, z: b.z, rot: b.h, h: 3.2, d: ln.s + k, always: true });
    }
    for (const [name, list] of Object.entries(bars)) if (list.length) this.inst.push(scatterModel(this.scene, this.models[name], list, { kind: 'prop', lod: false, window: [-30, 480], grow: 50 }));
    // cartelli della pendenza all'inizio delle salite
    let prev = 0;
    for (const p of this.pts) {
      if (p.s > this.length) break;
      if (p.grade >= 3 && prev < 3 && p.s > 60) this.sign(p.s, `${Math.round(p.grade * 2) / 2}%`.replace('.', ','), '#ffd34d', '#1b1b1b');
      prev = p.grade;
    }
  }

  sign(s, text, bg, fg) {
    const p = this.at(s, ROAD_W / 2 + 1.6);
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), new THREE.MeshBasicMaterial({ map: labelTexture(text, bg, fg, 256, 154, '900 96px "Roboto Condensed", "Arial Narrow", sans-serif'), side: THREE.DoubleSide }));
    board.position.y = 2.1; g.add(board);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5), toonMaterial({ color: '#cfd3da' })); post.position.y = 0.9; g.add(post);
    g.position.set(p.x, p.y, p.z); g.rotation.y = p.h + Math.PI - 0.35;
    this.scene.add(g);
  }

  // pubblico: in salita (pendenza ≥ 3%) vicino alla strada, folto all'arrivo e ai traguardi
  buildCrowd() {
    const list = []; const cols = ['#e63946', '#ffd166', '#3a86ff', '#06d6a0', '#ff4d9d', '#f77f00', '#ffffff', '#7b2cbf', '#d9ff3d', '#118ab2'];
    const add = (s, off) => {
      const p = this.at(s, off);
      list.push({ x: p.x, y: this.terrainY(s, off) - 0.05, z: p.z, rot: p.h + (off > 0 ? Math.PI / 2 : -Math.PI / 2) + (hash(s * 9 + off) - 0.5) * 0.6, scale: 0.92 + hash(s + off) * 0.16, d: s, color: cols[Math.floor(hash(s * 3.3 + off) * cols.length)] });
    };
    this.climbs = [];
    for (const p of this.pts) {
      if (p.s > this.length) break;
      if (p.grade < 3) continue;
      this.climbs.push(p.s);
      for (const side of [-1, 1]) {
        if (hash(p.s * 0.37 + side) < 0.25) continue;
        add(p.s + hash(p.s + side) * 1.5, side * (ROAD_W / 2 + 0.9 + hash(p.s * 7 + side) * 1.4));
        if (hash(p.s * 0.91 + side) > 0.55) add(p.s + 1, side * (ROAD_W / 2 + 2.6 + hash(p.s * 5 + side) * 1.6));
      }
    }
    const busy = [...this.lines.map((l) => l.s), this.length];
    for (const c of busy) for (let s = c - 70; s < c + 25; s += 1.3) for (const side of [-1, 1]) {
      if (hash(s * 1.7 + side) < 0.2) continue;
      add(s, side * (ROAD_W / 2 + 2.1 + hash(s * 2 + side) * 1.3));
    }
    for (let s = 2; s < 60; s += 1.6) for (const side of [-1, 1]) add(s, side * (ROAD_W / 2 + 2.1 + hash(s + side) * 1.2));
    this.crowd = crowdInstances(this.scene, this.crowdGeo, list, { shadows: false, window: [-30, 220], grow: 50 });
    this.crowd.isCrowd = true;
    // moto delle riprese TV: precede il gruppo di lato, con il cameraman girato verso i corridori
    if (this.models.mMoto) {
      const g = groundModel(this.models.mMoto); const b = new THREE.Box3().setFromObject(g.scene);
      this.moto = g.scene.clone(true); this.moto.scale.setScalar(1.55 / (b.max.y - b.min.y));
      this.moto.rotation.y = -Math.PI / 2; // nel file la moto punta verso +X, nel gioco l'avanti è +Z
      toonify(this.moto); this.moto.traverse((o) => { if (o.isMesh) o.castShadow = this.quality.cfg.shadows; });
      this.motoRoot = new THREE.Group(); this.motoRoot.add(this.moto); this.scene.add(this.motoRoot);
    }
    if (this.models.mCar) {
      const g = groundModel(this.models.mCar); const b = new THREE.Box3().setFromObject(g.scene);
      const body = g.scene.clone(true); toonify(body); body.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      this.car = new THREE.Group(); this.car.add(body); this.car.scale.setScalar(1.6 / (b.max.y - b.min.y)); // il posizionamento a terra è nelle unità del file
      this.car.rotation.y = CAR_YAW;
      this.carRoot = new THREE.Group(); this.carRoot.add(this.car); this.carRoot.visible = false; this.scene.add(this.carRoot); this.carS = null;
    }
    this.inst.push(this.crowd);
  }

  buildRiders() {
    const mk = (color, i, name) => new Cyclist(this.tpl, makeKit(color, i), { shadows: this.quality.cfg.shadows, name });
    this.player = mk(PLAYER_COLOR, 0, 'TU');
    this.scene.add(this.player.root);
    // freccia sopra il giocatore
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLOR }));
    marker.rotation.x = Math.PI; marker.position.set(0, 2.15, -0.1); this.player.root.add(marker); this.marker = marker;
    this.rivalRiders = RIVALS.map((r, i) => { const c = mk(r.color, i + 1, t(r.name)); this.scene.add(c.root); return c; });
    this.riders = [{ cy: this.player }, ...this.rivalRiders.map((cy) => ({ cy }))];
  }

  buildPickups() {
    this.coins = [];
    // (niente monete: la tappa ha già qualcosa da fare in ogni momento, e le monete sporcavano la strada)
    this.coinMeshes = []; this.coinScale = 1;
  }

  // la "scia" visibile: un cuneo chiaro sull'asfalto dietro al corridore che ti precede
  buildDraftZone() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(14, 0); g.lineTo(50, 0); g.lineTo(64, 256); g.lineTo(0, 256); g.closePath(); g.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(1.3, 7); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -4.4);
    this.draftZone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: '#4de3ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.draftZone.renderOrder = 3;
    this.scene.add(this.draftZone);
  }

  // podio dopo l'arrivo, sulla strada
  buildPodium() {
    const s = this.length + 70; const p = this.at(s);
    const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.rotation.y = p.h + Math.PI; // rivolto verso chi arriva
    const blocks = [[0, 1.2, '#d9ff3d', '1'], [-1.5, 0.85, '#d6dae2', '2'], [1.5, 0.6, '#d9a066', '3']];
    this.podiumSpots = blocks.map(([x, h, col, n]) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.45, h, 1.3), toonMaterial({ color: col }));
      box.position.set(x, h / 2, 0); box.castShadow = true; box.receiveShadow = true; g.add(box);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: labelTexture(n, null, '#15141b', 128, 128, '900 110px "Roboto Condensed", Arial, sans-serif'), transparent: true }));
      num.position.set(x, h * 0.5, 0.66); g.add(num);
      return { x, h };
    });
    // pannello di sfondo con lo striscione
    const back = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.4), toonMaterial({ map: podiumBackTexture(t('games.racer.hud.title')), side: THREE.DoubleSide }));
    back.position.set(0, 2.2, -1.4); g.add(back);
    // luce frontale per la premiazione (si accende solo sul podio)
    const key = new THREE.DirectionalLight('#fff3dc', 1.6); key.position.set(1.5, 4, 8); key.target.position.set(0, 1.2, 0); g.add(key, key.target); key.visible = false;
    this.podiumLight = key;
    this.scene.add(g);
    this.podium = g;
  }

  positionIdle() {
    // anteprima in menu: gruppo fermo alla partenza
    this.s = 0; this.x = 0; if (this.marker) this.marker.visible = false;
    this.poseAll(0);
  }

  // ---------- gara ----------
  get dur() { return DURATIONS[this.durIdx]; }

  newRace() {
    const D = this.dur;
    this.race = new Race({ tl: this.tl, duration: D, stage: this.stageIndex, level: this.level, adapt: this.adaptMem, names: RIVALS.map((r) => t(r.name)) });
    this.rivals = this.race.rivals;
    this.rivals.forEach((r, i) => { r.name = t(RIVALS[i].name); r.color = RIVALS[i].color; r.line = t(RIVALS[i].line); r.said = 0; r.boost = 0; });
    this.s = START; this.x = 0; this.lane = 1; this.speed = 0; this.raceT = 0; this.capV = null; this.blockT = 0; this.bumpT = 0;
    this.draft = 0; this.coinsTaken = 0; this.finished = false; this.lean = 0; this.finishT = null; this.result = null;
    this.draftOf = null; this.draftNear = null; this.hardT = 0; this.lastObjOk = 0; this.paused = false; this.idleT = 0;
    for (const c of this.coins) c.taken = false;
    for (const r of this.riders) { r.cy.sitDown(); r.cy.root.visible = true; r.cy.root.scale.setScalar(1); }
    this.marker.visible = true; this.podiumLight.visible = false; this.msgs.clear();
    this.state = 'countdown'; this.stateT = 0; this.lastBeep = 4; this.hooks.runStart?.();
    this.sentGrade = null; this.cheerT = 0; this.lastKSaid = false; this.camMode = 'chase'; this.camInit = false; this.prevPlace = 8;
    this.audio.playSong(SONGS.race);
    this.say(t('games.racer.say.start'), HUD.cyan, 2.6, false, 2);
  }

  input(dir) {
    this.audio.ensure();
    if (this.state === 'select') {
      if (this.selT < 0.4) return;
      if (dir < 0) { this.durIdx = (this.durIdx + 1) % DURATIONS.length; this.audio.sfx('select'); this.saveSetup(); }
      else { this.saveSetup(); this.audio.sfx('pickup'); this.begin(); }
      return;
    }
    if (this.state === 'results') {
      if (this.stateT < 2) return;
      if (dir > 0) this.begin(); else { this.state = 'select'; this.selT = 0; this.audio.playSong(SONGS.menu); this.rebuild(); }
      return;
    }
    if (this.state !== 'race' && this.state !== 'countdown') return;
    // + / − restano il cambio: marce virtuali dell'app
    this.hooks.shift?.(dir);
    this.audio.sfx(dir > 0 ? 'shiftUp' : 'shiftDown');
    this.gearFlash = 1.2;
  }

  saveSetup() { try { localStorage.setItem('racerDur', this.durIdx); localStorage.setItem('racerLevel', this.level); } catch { /* niente storage */ } }

  // il percorso dipende dalla durata: se serve si ricostruisce, poi si parte
  begin() {
    const key = `${this.durIdx}`;
    if (this.builtKey === key && this.scene) { this.newRace(); return; }
    this.state = 'loading'; this.loadPct = 1;
    setTimeout(() => { if (!this.active) return; this.buildStage(); this.newRace(); }, 60);
  }

  rebuild() {
    this.state = 'loading';
    setTimeout(() => { if (!this.active) return; if (this.builtKey !== `${this.durIdx}`) this.buildStage(); else this.positionIdle(); this.state = 'select'; this.selT = 0; }, 30);
  }

  // tocco sul menu: scelta di durata e livello
  tap(x, y) {
    if (this.state !== 'select') return false;
    const z = this.hitZones || []; for (const h of z) if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { h.fn(); this.audio.sfx('select'); this.saveSetup(); return true; }
    return false;
  }

  prog(stat, n = 1, xp = 0) { this.hooks.progress?.event(stat, n, xp); }
  // messaggi a centro schermo: uno alla volta, con priorità (kit/hud.js MessageQueue). prio: 0 chiacchiere, 1 normale, 2 grande, 3 annuncio
  say(text, color = '#ffd34d', dur = 1.6, big = false, prio = big ? 2 : 1) { this.msgs.say(text, { color, dur, big, prio }); }
  pop(text, color, dur = 0.9) { this.pops.push({ text, color, t: dur, t0: dur, s: this.s, x: this.x }); }

  sense(dt) {
    const connected = this.hooks.connected();
    const st = this.hooks.stats();
    this.ftp = this.hooks.ftp?.() || 200;
    // senza rullo la demo simula 0,8 × FTP con uno scatto ogni 22 s
    const demoBurst = !connected && (this.t % 22) > 14 && (this.t % 22) < 22;
    this.connected = connected;
    this.power = connected ? st.power || 0 : (demoBurst ? 1.3 : 0.8 + Math.sin(this.t * 0.7) * 0.04) * this.ftp;
    this.cadence = connected ? st.cadence || 0 : demoBurst ? 104 : 88;
    this.gear = st.gear;
    this.sprinting = this.power >= this.ftp * 1.15;
    if (this.audio.song) this.audio.setTempo(this.audio.song.bpm * clamp((this.cadence || 85) / 88, 0.85, 1.2));
  }

  update(dt, realDt) {
    this.t += realDt; this.selT = (this.selT || 0) + realDt;
    this.sense(realDt);
    this.msgs.update(realDt);
    this.gearFlash = Math.max(0, (this.gearFlash || 0) - realDt);
    if (this.state === 'loading' || this.state === 'error' || this.state === 'select') return;
    this.stateT += realDt;
    if (this.state === 'countdown') {
      const left = 3 - Math.floor(this.stateT);
      if (left !== this.lastBeep && left > 0) { this.lastBeep = left; this.audio.sfx('beep'); }
      if (this.stateT >= 3) { this.state = 'race'; this.stateT = 0; this.audio.sfx('go'); this.say(t('games.racer.go'), '#06d6a0', 1, true, 3); this.shake.add(0.3); }
      return;
    }
    if (this.state === 'results') { this.afterRivals(dt); this.updateCooldown(realDt); return; }
    if (this.state === 'finishCam') {
      // il giocatore rallenta dopo la linea, gli altri arrivano al rallentatore
      this.speed = Math.max(3, this.speed - dt * 4); this.s = Math.min(this.length + RUNOUT * 0.4, this.s + this.speed * dt);
      this.afterRivals(dt);
      if (this.stateT > 3.4) this.toPodium();
      return;
    }

    const race = this.race; const pl = race.player;
    // chi smette di pedalare va in pausa, non perde: dopo 3 s a meno di 10 W la gara aspetta (senza rullo la demo non si ferma)
    if (this.connected) { this.idleT = this.power < 10 ? (this.idleT || 0) + realDt : 0; if (this.idleT > 3) this.paused = true; else if (this.power > 25) this.paused = false; } else this.paused = false;
    if (this.paused) { this.speed = Math.max(0, this.speed - dt * 6); return; }
    // la corsia: scia del corridore davanti, altrimenti le monete; si cambia anche per sorpassare chi blocca
    this.chooseLine(dt);
    this.x = lerp(this.x, LANES[this.lane], Math.min(1, dt * 2.2));
    const e = this.power / this.ftp;
    pl.s = this.s; pl.speed = this.speed;
    race.step(dt, { e, x: this.x });
    this.s = pl.s; this.speed = pl.speed; this.draft = pl.draft; this.raceT = race.t;
    this.handleBlock(dt);
    for (const ev of race.events.splice(0)) this.onEvent(ev);
    this.updateRivalsLook(dt);
    const p = this.at(this.s);
    this.grade = clamp(p.grade, -4, 7);
    const g = Math.round(this.grade * 2) / 2;
    if (g !== this.sentGrade) { this.sentGrade = g; this.hooks.setGrade(g); }
    if (this.draft >= 1) { this.draftAcc = (this.draftAcc || 0) + dt; if (this.draftAcc >= 1) { this.draftAcc -= 1; this.prog('draftSec', 1, 1); } }
    // tifo: quando passi fra il pubblico
    this.cheerT -= dt;
    if (this.cheerT <= 0 && this.climbs.some((c) => Math.abs(c - this.s) < 6)) { this.audio.sfx('cheer'); this.cheerT = 3.5; }
    this.pickups();
    const place = race.place();
    if (place < this.prevPlace) { if (this.t > 5) this.audio.sfx('pass'); if (this.s > this.length - 400) { this.time.slowmo(0.5, 0.6); this.shake.add(0.12); } }
    this.prevPlace = place;
    this.standing = race.ranking().map((q) => (q.me ? { name: 'TU', me: true, d: q.s, color: PLAYER_COLOR } : { name: this.rivals[q.i].name, d: q.s, color: this.rivals[q.i].color, r: this.rivals[q.i] }));
    if (race.checkEnd()) this.finish();
  }

  // blocco: chi è più veloce di chi ha davanti resta a ruota un attimo, poi passa dalla corsia libera
  handleBlock(dt) {
    const b = this.race.blocked;
    if (b) {
      this.blockT = (this.blockT || 0) + dt;
      if (this.blockT > 0.5) {
        const free = (i) => !this.rivals.some((q) => Math.abs(q.x - LANES[i]) < 1.2 && q.s - this.s > -2.5 && q.s - this.s < 7);
        const opts = LANES.map((_, i) => i).filter((i) => i !== this.lane && free(i)).sort((a, c) => Math.abs(a - this.lane) - Math.abs(c - this.lane));
        if (opts.length) { this.lean = Math.sign(opts[0] - this.lane); this.lane = opts[0]; this.lineT = 2.5; this.blockT = 0; }
      }
    } else this.blockT = 0;
    // la scia si vede (cuneo) anche mentre si sta entrando
    let near = null;
    for (const r of this.rivals) { const gap = r.s - this.s; if (gap > 1.6 && gap < 16 && (!near || gap < near.gap)) near = { r, gap }; }
    this.draftNear = near?.r || null;
    if (this.draft >= 1 && !this.draftShown) { this.draftShown = true; this.say(t('games.racer.draft'), '#4de3ff', 1, false, 1); this.audio.sfx('whoosh'); }
    if (this.draft < 0.5) this.draftShown = false;
  }

  // atteggiamento dei rivali: in piedi sui pedali quando danno tutto; battute ogni tanto
  updateRivalsLook(dt) {
    for (const r of this.rivals) {
      const e = (this.race.paceOf(r) || 0); r.hard = e > 1.07;
      const gap = r.s - this.s;
      if (gap < -1 && gap > -4 && r.said < this.t - 25 && Math.random() < dt * 2) { r.said = this.t; this.say(`${r.name}: "${r.line}"`, r.color, 2.2, false, 0); }
    }
  }

  // eventi del direttore → scritte, suoni, effetti
  onEvent(ev) {
    const p = { ...ev.p }; const E = ev.key.replace('games.racer.say.', '');
    for (const k of ['name']) if (p[k]) p[k] = first(p[k]);
    if (p.place != null) p.place = ordinal(p.place);
    if (p.kind) p.kind = t(`games.racer.kind.${p.kind}`);
    const text = t(ev.key, p);
    let color = HUD.gold; let dur = 2; let sfx = null;
    if (ev.big) { color = HUD.cyan; dur = 2.6; }
    if (ev.ok) { color = HUD.lime; sfx = 'win'; this.shake.add(0.25); this.confetti.burst(this.at(this.s).x, this.at(this.s).y + 3, this.at(this.s).z, 40, 3); this.prog('sprintsWon', E === 'objOk' && ev.p.kind === 'sprint' ? 1 : 0, 0); }
    if (ev.ko) { color = HUD.red; dur = 1.8; }
    if (E === 'attack' || E === 'escape') { color = HUD.red; sfx = 'bell'; this.shake.add(0.2); }
    if (E.startsWith('pre')) { sfx = 'beep'; }
    if (E === 'passed') { color = '#4de3ff'; }
    if (ev.line) { sfx = ev.n === 0 ? 'win' : 'coin'; color = ev.line === 'kom' ? '#ff5a6a' : '#3ccf6a'; if (ev.n === 0) { const q = this.at(this.s); this.confetti.burst(q.x, q.y + 4, q.z, 60, 3); } }
    if (E === 'gapAhead' || E === 'gapBehind' || E === 'packAhead' || E === 'packBehind' || E === 'left' || E === 'gapLead') { color = HUD.dim; dur = 2.2; }
    this.say(text, color, dur, !!ev.big, ev.prio ?? 1);
    if (sfx) this.audio.sfx(sfx);
    this.lastEventAt = this.t;
  }

  // traiettoria automatica: scia del corridore davanti, altrimenti le monete, altrimenti si resta
  chooseLine(dt) {
    this.lineT = (this.lineT || 0) - dt;
    if (this.lineT > 0) return;
    this.lineT = 0.6;
    let best = null;
    for (const r of this.rivals) { const gap = r.s - this.s; if (gap > 1.8 && gap < 22 && (!best || gap < best.gap)) best = { gap, x: r.x }; }
    let target = this.lane;
    if (best) target = LANES.reduce((bi, lx, i) => (Math.abs(lx - best.x) < Math.abs(LANES[bi] - best.x) ? i : bi), 0);
    else { const c = this.coins.find((c) => !c.taken && c.s > this.s + 4 && c.s < this.s + 45); if (c) target = c.lane; }
    if (target !== this.lane) { this.lean = Math.sign(target - this.lane); this.lane = target; }
  }

  pickups() {
    for (const c of this.coins) {
      if (c.taken || Math.abs(c.s - this.s) > 0.9 || Math.abs(LANES[c.lane] - this.x) > 1.1) continue;
      c.taken = true; this.coinsTaken++; this.pop('+1', '#ffcc33');
      const p = this.at(c.s, LANES[c.lane]); this.effects.spawn(p.x, p.y + 1, p.z, { tex: 'spark', size: 0.9, life: 0.35, grow: 1.5, color: '#ffd34d' });
      this.audio.sfx('coin'); this.prog('coins', 1, 1);
    }
  }

  leader(type) { return this.race?.leader(type) || null; }
  place() { return this.race ? this.race.place() : 8; }
  ranking() { return this.standing || []; }

  // dopo l'arrivo i rivali rallentano oltre la linea
  afterRivals(dt) {
    for (const r of this.rivals) {
      const target = r.s > this.length + 10 ? Math.max(2, (this.length + RUNOUT * 0.55 - r.s) * 0.4) : Math.max(4, r.speed);
      r.speed = lerp(r.speed, target, Math.min(1, dt * 0.8));
      r.s = Math.min(this.length + RUNOUT * 0.6, r.s + r.speed * dt);
      r.hard = false;
    }
  }

  // defaticamento: 30 s di pedalata leggera dopo l'arrivo (il rullo torna in piano)
  updateCooldown(realDt) { this.cool = Math.max(0, (this.cool ?? COOL) - realDt); }

  finish() {
    const race = this.race; const crossed = race.player.fin != null && race.player.s >= this.length - 0.01;
    const res = race.finalize(); this.result = res;
    this.finished = true; this.finishT = res.time;
    this.standing = race.ranking().map((q) => (q.me ? { name: 'TU', me: true, d: q.s, fin: res.time, color: PLAYER_COLOR } : { name: this.rivals[q.i].name, d: q.s, fin: this.rivals[q.i].fin, color: this.rivals[q.i].color, r: this.rivals[q.i] }));
    const place = res.place;
    this.state = 'finishCam'; this.stateT = 0; this.camMode = crossed ? 'finish' : 'chase'; this.camInit = false; this.cool = COOL;
    this.time.slowmo(0.22, 2.4); this.shake.add(0.35);
    this.audio.stopSong(); this.audio.sfx(place <= 3 ? 'win' : 'lose'); this.audio.sfx('cheer');
    const p = this.at(this.length); this.confetti.burst(p.x, p.y + 5, p.z, 160, 5);
    const key = `racer3dBest${this.stageIndex}`;
    const best = Number(localStorage.getItem(key)) || Infinity;
    this.newBest = crossed && this.finishT < best;
    if (this.newBest) localStorage.setItem(key, this.finishT.toFixed(1));
    // stelle e livello adattivo restano per la prossima tappa
    const sk = `racerStars${this.durIdx}_${this.level}`; const prev = Number(localStorage.getItem(sk)) || 0;
    this.newStars = res.stars > prev; if (this.newStars) localStorage.setItem(sk, res.stars);
    this.adaptMem = race.adapt; try { localStorage.setItem('racerAdapt', race.adapt); } catch { /* niente storage */ }
    this.hooks.runEnd?.({ game: 'racer', stage: this.stageIndex, score: Math.round(this.finishT * 10) / 10 });
    this.prog('races', 1, 60 + ([100, 70, 50][place - 1] || 0) + res.stars * 20);
    if (place <= 3) this.prog('podiums', 1, 0);
    if (place === 1) { this.prog('wins', 1, 0); this.hooks.progress?.addToList('tracksWon', this.stageIndex); }
    if (this.leader('green')?.name === 'TU') { this.prog('green', 1, 80); this.prog('jerseys', 1, 0); }
    if (this.leader('kom')?.name === 'TU') { this.prog('kom', 1, 80); this.prog('jerseys', 1, 0); }
    this.hooks.setGrade(0);
  }

  toPodium() {
    this.state = 'results'; this.stateT = 0; this.camMode = 'podium'; this.camInit = false;
    this.standing = this.race.ranking().map((q) => (q.me ? { name: 'TU', me: true, d: q.s, fin: this.race.player.fin, color: PLAYER_COLOR } : { name: this.rivals[q.i].name, d: q.s, fin: this.rivals[q.i].fin, color: this.rivals[q.i].color, r: this.rivals[q.i] }));
    const top = this.standing.slice(0, 3);
    for (const r of this.riders) r.cy.root.visible = false;
    this.marker.visible = false;
    top.forEach((e, i) => {
      const cy = e.me ? this.player : this.rivalRiders[e.r.i];
      const spot = this.podiumSpots[i];
      cy.standUp(i === 0); cy.root.visible = true; cy.root.scale.setScalar(1);
      this.podium.updateMatrixWorld(true);
      const wp = this.podium.localToWorld(new THREE.Vector3(spot.x, spot.h, 0));
      cy.root.position.copy(wp); cy.root.rotation.set(0, this.podium.rotation.y, 0);
      cy.lean.rotation.set(0, 0, 0);
    });
    this.podiumTop = top; this.podiumLight.visible = true;
    const wp = this.podium.localToWorld(new THREE.Vector3(0, 3, 0)); this.confetti.burst(wp.x, wp.y + 2, wp.z, 200, 3);
    this.audio.sfx('cheer');
  }

  // ---------- disegno ----------
  // la moto resta 10–16 m davanti al giocatore, sul lato della strada
  updateMoto() {
    if (!this.motoRoot) return;
    const racing = this.state === 'race' || this.state === 'countdown';
    this.motoRoot.visible = racing;
    if (!this.motoRoot.visible) return;
    const ms = Math.min(this.length - 10, Math.max(START + 20, this.s + 13 + Math.sin(this.t * 0.23) * 3));
    const p = this.at(ms, ROAD_W / 2 - 1.1);
    this.motoRoot.position.set(p.x, p.y, p.z);
    this.motoRoot.rotation.set(0, p.h, 0); this.motoRoot.rotateX(-Math.atan(p.grade / 100 * VIS_GRADE));
  }

  poseRider(cy, s, x, cadence, speed, dt, opts = {}) {
    const p = this.at(s, x);
    cy.root.position.set(p.x, p.y, p.z);
    cy.root.rotation.set(0, p.h - (opts.yaw || 0), 0);
    cy.root.rotateX(-Math.atan(p.grade / 100 * VIS_GRADE));
    // piega in curva (dalla curvatura e dalla velocità) e nei cambi di linea
    cy.lean.rotation.z = clamp(-(p.turn / 100) * speed * 0.9, -0.35, 0.35) - (opts.lean || 0) * 0.12;
    cy.pose(dt, cadence, speed / WORLD_SCALE, opts);
  }

  poseAll(dt) {
    const pre = this.state === 'select' || this.state === 'loading' || !this.rivals;
    if (pre) {
      this.poseRider(this.player, START, 0, 0, 0, dt);
      this.rivalRiders.forEach((r, i) => this.poseRider(r, START - 3 + (6 - i) * 1.7, LANES[i % 3], 0, 0, dt));
      return;
    }
    if (this.state === 'results') { for (const r of this.riders) if (r.cy.root.visible) r.cy.pose(dt); return; }
    const cad = this.state === 'countdown' ? 0 : (this.cadence || 0);
    this.updateMoto();
    this.poseRider(this.player, this.s, this.x, cad, this.state === 'countdown' ? 0 : this.speed, dt, { stand: this.sprinting && this.state === 'race' ? 1 : (this.grade > 4.5 ? 0.6 : 0), lean: this.lean, yaw: Math.atan2((LANES[this.lane] - this.x) * 2.2, Math.max(4, this.speed)) });
    this.rivals.forEach((r, i) => {
      const cy = this.rivalRiders[i];
      const far = Math.abs(r.s - this.s) > 120; cy.root.visible = !far;
      if (far) return;
      const rc = this.state === 'countdown' ? 0 : 80 + (r.speed / 8) * 12;
      // lontani (> 35 m): la posa si aggiorna a fotogrammi alterni
      const mid = Math.abs(r.s - this.s) > 35;
      if (mid && (this.frame + i) % 2) { const p = this.at(r.s, r.x); cy.root.position.set(p.x, p.y, p.z); return; }
      this.poseRider(cy, r.s, r.x, rc, this.state === 'countdown' ? 0 : r.speed, mid ? dt * 2 : dt, { stand: r.hard || this.at(r.s).grade > 5 ? 1 : 0, yaw: Math.atan2((r.targetX - r.x) * 1.6, Math.max(4, r.speed)), lean: clamp((r.targetX - r.x) * 0.6, -1, 1) });
      // chi è dietro di te, tra la tua bici e la telecamera, non si disegna: altrimenti copre la scena con una sagoma enorme
      // chi è dietro di te, esattamente fra la tua bici e la telecamera, sparirebbe in una sagoma enorme: si rimpicciolisce in 0,25 s (niente comparsa di colpo)
      const between = this.s - r.s > 0.5 && this.s - r.s < 4.5 && Math.abs(r.x - this.x) < 0.9;
      r.shrink = clamp((r.shrink ?? 1) + (between ? -dt * 4 : dt * 4), 0, 1);
      cy.root.scale.setScalar(Math.max(0.001, r.shrink)); cy.root.visible = r.shrink > 0.01;
    });
  }

  draw(dt, realDt) {
    if (!this.scene) return;
    const sel = this.state === 'select' || this.state === 'loading';
    this.poseAll(dt);
    this.updateCar(dt);
    this.lean = (this.lean || 0) * Math.pow(0.05, dt);
    const focusS = sel ? START : this.s;
    for (const i of this.inst) i.update(focusS);
    this.crowd.tick(this.t);
    this.updatePickupMeshes(focusS);
    // scia visibile
    const dn = !sel && this.state === 'race' ? this.draftNear : null;
    this.draftZone.visible = !!dn;
    if (dn) {
      const p = this.at(dn.s, dn.x);
      this.draftZone.position.set(p.x, p.y + 0.07, p.z); this.draftZone.rotation.set(0, p.h, 0);
      this.draftZone.material.opacity += ((this.draft >= 1 ? 0.2 : 0.08) - this.draftZone.material.opacity) * Math.min(1, dt * 5);
    }
    this.wind.update(realDt, this.player.root, !sel && this.state === 'race' ? Math.max(this.draft >= 1 ? 1 : 0, this.sprinting ? 1 : 0) : 0);
    this.effects.update(dt); this.confetti.update(dt);
    if (this.marker) this.marker.position.y = 2.15 + Math.sin(this.t * 4) * 0.06;
    this.shake.update(realDt);
    this.updateCamera(dt, realDt, sel, focusS);
    const fp = this.at(focusS);
    this.light.follow(fp.x, fp.y, fp.z);
    this.stage.render();
  }

  updateCamera(dt, realDt, sel, focusS) {
    const cam = this.camera;
    let pos; let look; let fov = 54;
    if (this.camMode === 'finish' && this.state === 'finishCam') {
      // di lato alla linea d'arrivo, segue il giocatore al rallentatore
      // dopo la linea, di tre quarti: i corridori arrivano verso la camera
      const side = this.at(this.length + 10, ROAD_W / 2 - 0.6);
      pos = new THREE.Vector3(side.x, side.y + 1.3, side.z);
      const p = this.at(Math.min(this.s, this.length + 4) - 3, this.x * 0.5); look = new THREE.Vector3(p.x, p.y + 1.25, p.z); fov = 42;
    } else if (sel) {
      // menu: il gruppo fermo alla partenza, inquadrato da davanti
      const sw = Math.sin(this.t * 0.25);
      const c = this.at(START + 13.5, sw * 2.6); pos = new THREE.Vector3(c.x, c.y + 1.9 + Math.cos(this.t * 0.3) * 0.2, c.z);
      const l = this.at(START + 3, 0); look = new THREE.Vector3(l.x, l.y + 0.9, l.z); fov = 50;
    } else if (this.state === 'results') {
      const a = this.stateT * 0.12;
      const port = this.H > this.W;
      const c = this.podium.localToWorld(new THREE.Vector3(Math.sin(a) * 1.0 + (port ? 0 : 2.4), port ? 3.2 : 2.3, (port ? 13 : 8.2) + Math.cos(a) * 0.3));
      pos = c; look = this.podium.localToWorld(new THREE.Vector3(port ? 0 : 2.6, port ? 0.5 : 1.6, 0)); fov = port ? 44 : 40;
    } else {
      const off = sel ? 0 : (this.x || 0) * 0.6;
      const speedK = clamp((this.speed || 0) / 14, 0, 1);
      const back = this.at(Math.max(-10, focusS - 5.4 - speedK * 1.1), off);
      const ahead = this.at(Math.min(this.pts.at(-1).s, focusS + 20), off * 0.3);
      pos = new THREE.Vector3(back.x, back.y + 2.05, back.z);
      look = new THREE.Vector3(ahead.x, ahead.y + 1.25, ahead.z);
      fov = 54 + speedK * 6 + (this.draft >= 1 ? 3 : 0) + (this.sprinting ? 3 : 0);
      if (this.state === 'countdown') fov = 56;
    }
    if (!this.camInit) { cam.position.copy(pos); this.camLook = look.clone(); this.camInit = true; }
    const k = Math.min(1, realDt * (this.state === 'results' ? 2 : 4.5));
    cam.position.lerp(pos, k); this.camLook.lerp(look, Math.min(1, realDt * 6));
    cam.lookAt(this.camLook);
    cam.fov += (fov - cam.fov) * Math.min(1, realDt * 3); cam.updateProjectionMatrix();
    this.shake.apply(cam);
  }

  updatePickupMeshes(s0) {
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const v = new THREE.Vector3(); const sc = new THREE.Vector3();
    let n = 0;
    for (const c of this.coins) {
      if (c.taken || c.s < s0 - 10 || c.s > s0 + 160) continue;
      const p = this.at(c.s, LANES[c.lane]);
      e.set(0, this.t * 3 + c.s, 0); q.setFromEuler(e);
      m.compose(v.set(p.x, p.y + 0.6, p.z), q, sc.setScalar(this.coinScale));
      for (const cm of this.coinMeshes) cm.setMatrixAt(n, m);
      n++;
    }
    for (const cm of this.coinMeshes) { cm.count = n; cm.instanceMatrix.needsUpdate = true; }
  }

  // ---------- interfaccia ----------
  drawHud(dt) {
    const ctx = this.stage.ctx; const W = this.W; const H = this.H;
    ctx.clearRect(0, 0, W, H); hudView(ctx, W, H);
    if (this.state === 'loading') {
      ctx.fillStyle = '#0f0e0c'; if (!this.scene) ctx.fillRect(0, 0, W, H);
      txt(ctx, t('games.common.loading'), W / 2, H / 2, { size: 26, align: 'center', color: HUD.lime });
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(W / 2 - 90, H / 2 + 18, 180, 8);
      ctx.fillStyle = HUD.lime; ctx.fillRect(W / 2 - 90, H / 2 + 18, 180 * (this.loadPct || 0), 8);
      return;
    }
    if (this.state === 'error') { txt(ctx, t('ui.error', { error: this.error }), W / 2, H / 2, { size: 15, align: 'center', color: '#ff6b6b' }); return; }
    if (this.state === 'select') return this.drawSelect(ctx, W, H);
    if (this.state === 'results') return this.drawResults(ctx, W, H, dt);
    const u = uiScale(W, H); const top = 56;
    if (this.state === 'finishCam') return this.drawFinish(ctx, W, H, u, dt);
    const race = this.race;
    this.drawTags(ctx, W, H, u);
    // posizione (in alto a sinistra)
    const place = this.place();
    const pw = txt(ctx, ordinal(place), 14, top + 52 * u, { size: 58 * u, color: place <= 3 ? HUD.lime : HUD.white, italic: true });
    txt(ctx, '/8', 18 + pw, top + 52 * u, { size: 22 * u, color: HUD.dim });
    // potenza (in alto a destra): il numero più grande, con la percentuale della FTP
    const pc = powerColor(this.power, this.ftp);
    const ww = txt(ctx, 'W', W - 14, top + 52 * u, { size: 22 * u, align: 'right', color: HUD.dim });
    txt(ctx, String(Math.round(this.power)), W - 18 - ww, top + 52 * u, { size: 58 * u, align: 'right', color: pc });
    txt(ctx, `${Math.round((this.power / this.ftp) * 100)} % FTP`, W - 14, top + 80 * u, { size: 22 * u, align: 'right', color: pc });
    // pendenza
    const gr = this.grade || 0;
    const gtxt = `${gr > 0.05 ? '+' : ''}${fmtDec(gr, 1)}%`;
    panel(ctx, W - 14 - 92 * u, top + 90 * u, 92 * u, 32 * u, { fill: 'rgba(12,12,18,.55)', border: gradeColor(gr) });
    txt(ctx, gtxt, W - 14 - 46 * u, top + 114 * u, { size: 22 * u, align: 'center', color: gradeColor(gr) });
    // tempo che resta (al centro) e chilometri
    const leftT = Math.max(0, race.tl.race - race.t);
    txt(ctx, `${Math.floor(leftT / 60)}:${String(Math.floor(leftT % 60)).padStart(2, '0')}`, W / 2, top + 30 * u, { size: 34 * u, align: 'center', color: leftT < 30 ? HUD.red : HUD.white });
    const left = Math.max(0, this.length - this.s) / WORLD_SCALE;
    txt(ctx, left >= 1000 ? `${fmtDec(left / 1000, 1)} km` : `${Math.round(left / 10) * 10} m`, W / 2, top + 52 * u, { size: 17 * u, align: 'center', color: left < 500 ? HUD.red : HUD.dim });
    // marcia e cadenza (sotto la posizione)
    const gy = top + 64 * u;
    if (this.gear != null) {
      panel(ctx, 14, gy, 104 * u, 32 * u, { fill: this.gearFlash > 0 ? 'rgba(217,255,61,.85)' : 'rgba(12,12,18,.55)' });
      txt(ctx, t('games.racer.gear', { n: this.gear }), 14 + 52 * u, gy + 23 * u, { size: 19 * u, align: 'center', color: this.gearFlash > 0 ? '#15141b' : HUD.white, stroke: this.gearFlash > 0 ? null : undefined });
    }
    txt(ctx, `${Math.round(this.cadence || 0)} rpm`, 14, gy + 56 * u, { size: 18 * u, color: HUD.dim });
    // scia
    if (this.draft > 0.05) {
      const bw = 130 * u; const bx = W / 2 - bw / 2; const by = top + 62 * u;
      panel(ctx, bx, by, bw, 26 * u, { fill: 'rgba(12,12,18,.55)' });
      ctx.fillStyle = this.draft >= 1 ? HUD.cyan : '#2a6f97'; ctx.fillRect(bx + 3, by + 3, (bw - 6) * this.draft, 20 * u);
      txt(ctx, this.draft >= 1 ? t('games.racer.inDraft') : t('games.racer.drafting'), W / 2, by + 19 * u, { size: 14 * u, align: 'center' });
    }
    // obiettivo: cosa fare ora e a che punto sei
    const objBottom = this.drawObjective(ctx, W, u, top + 132 * u);
    // classifica corta: davanti e dietro di te, con i distacchi in secondi
    this.drawStandings(ctx, W, H, u);
    this.drawProfile(ctx, W, H, u);
    // testi a comparsa, sotto la scheda dell'obiettivo
    this.msgs.draw(ctx, W, H, { u, y: objBottom + 34 * u });
    // testi che salgono dal corridore
    const v3 = new THREE.Vector3();
    for (const q of this.pops) {
      q.t -= dt; const k = 1 - q.t / q.t0; const p = this.at(q.s, q.x);
      v3.set(p.x, p.y + 2.2 + k * 1.4, p.z).project(this.camera);
      ctx.globalAlpha = clamp((q.t / q.t0) * 2, 0, 1);
      txt(ctx, q.text, (v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H, { size: 22 * u, align: 'center', color: q.color });
      ctx.globalAlpha = 1;
    }
    this.pops = this.pops.filter((q) => q.t > 0);
    if (this.paused && this.state === 'race') {
      panel(ctx, W / 2 - 150 * u, H * 0.42 - 34 * u, 300 * u, 84 * u, { fill: 'rgba(12,12,18,.82)', border: HUD.gold });
      txt(ctx, t('games.racer.paused'), W / 2, H * 0.42 + 2 * u, { size: 30 * u, align: 'center', color: HUD.gold, italic: true, maxW: 280 * u });
      txt(ctx, t('games.racer.pausedHint'), W / 2, H * 0.42 + 32 * u, { size: 15 * u, align: 'center', color: HUD.white, font: 'text', maxW: 280 * u });
    }
    if (this.state === 'countdown') {
      const n = 3 - Math.floor(this.stateT); const f = this.stateT % 1;
      txt(ctx, String(n), W / 2, H * 0.42, { size: (110 - f * 30) * u, align: 'center', color: HUD.lime, italic: true });
    }
    if (!this.connected) txt(ctx, t('games.common.demo'), W / 2, H - 70 * u, { size: 13 * u, align: 'center', color: HUD.gold, font: 'text' });
    this.hooks.progress?.drawToasts(ctx, W, dt);
  }

  // scheda dell'obiettivo (sempre visibile): il momento della tappa, il ritmo da tenere in % FTP e in watt, la barra di avanzamento
  drawObjective(ctx, W, u, y) {
    const race = this.race; const pl = race.player; const ob = race.obj; const m = race.moment(); const nx = race.tl.moments[race.mi + 1];
    const soon = nx && nx.obj && nx.obj.type !== 'rest' && race.announced.has(nx.i) && pl.s < nx.s0 && (!ob || ob.done || ob.type === 'stay');
    let kind = m.kind; let pct = null; let sec = null; let frac = 0; let status = ''; let extra = null; let mm = m;
    if (soon) { mm = nx; kind = nx.kind; const o = nx.obj; pct = (o.pct ?? 0) * race.scale; sec = o.sec < 1 ? Math.round(nx.dur * o.sec) : o.sec; status = t('games.racer.obj.soon', { s: Math.max(1, Math.ceil((nx.s0 - pl.s) / Math.max(6, pl.speed))) }); }
    else if (ob && !ob.done) { pct = ob.pct; sec = ob.sec; frac = ob.type === 'hold' || ob.type === 'kick' ? ob.bar / ob.sec : 0; if (ob.type === 'stay') frac = clamp(1 - Math.max(0, race.P - pl.s) / 25, 0, 1); if (ob.type === 'close') { const r = this.rivals[race.escapee]; extra = r ? first(r.name) : ''; const g = r ? Math.max(0, race.gapSec(r)) : 0; frac = clamp(1 - g / 30, 0, 1); status = `+${Math.round(g)} s`; } }
    else if (ob && ob.done) { status = '✓'; frac = 1; pct = ob.pct; sec = ob.sec; }
    else if (m.kind === 'recover') pct = null;
    const col = KIND_COLORS[kind] || HUD.cyan; const w = Math.min(W - 28, 350 * u); const x = (W - w) / 2; const h = 60 * u;
    panel(ctx, x, y, w, h, { fill: 'rgba(12,12,18,.7)', border: soon ? 'rgba(255,255,255,.45)' : col });
    ctx.fillStyle = col; ctx.fillRect(x + 6, y + 8 * u, 5 * u, h - 16 * u);
    const pct5 = pct != null ? Math.round(pct * 20) * 5 : null; const watts = pct != null ? Math.round((pct * this.ftp) / 5) * 5 : null;
    let title;
    if (!ob && !soon) title = t(kind === 'recover' ? 'games.racer.obj.recover' : 'games.racer.obj.start');
    else if (kind === 'start' && !soon) title = t('games.racer.obj.start');
    else title = t(`games.racer.obj.${kind}`, { pct: pct5, sec, name: extra || '' });
    txt(ctx, title, x + 20 * u, y + 25 * u, { size: 19 * u, color: col, maxW: w - 40 * u - (watts ? 70 * u : 0) });
    if (watts && !(ob && ob.type === 'close')) txt(ctx, `≈ ${watts} W`, x + w - 12 * u, y + 25 * u, { size: 19 * u, align: 'right' });
    // seconda riga: stato / avanzamento
    const by = y + 36 * u; const bw = w - 34 * u;
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(x + 20 * u, by, bw, 8 * u);
    if (frac > 0) { ctx.fillStyle = frac >= 1 ? HUD.lime : col; ctx.fillRect(x + 20 * u, by, bw * clamp(frac, 0, 1), 8 * u); }
    let line2 = status;
    if (!soon && ob && !ob.done && (ob.type === 'hold' || ob.type === 'kick')) { const nowOk = pl.e >= ob.pct * 0.97; line2 = nowOk ? t('games.racer.obj.holdOk', { a: Math.round(ob.bar), b: ob.sec }) : t('games.racer.obj.holdLow', { p: Math.round(pl.e * 100) }); ctx.fillStyle = nowOk ? HUD.lime : HUD.gold; }
    if (!ob && !soon && kind === 'recover') line2 = t('games.racer.obj.recoverHint');
    if (!soon && kind === 'start' && (!ob || ob.type === 'stay')) line2 = t('games.racer.obj.stayHint');
    txt(ctx, line2, x + 20 * u, y + 56 * u, { size: 13 * u, color: soon ? HUD.gold : HUD.dim, font: 'text', maxW: w - 30 * u });
    return y + h;
  }

  // dopo la linea: il risultato grande, al rallentatore
  drawFinish(ctx, W, H, u, dt) {
    const place = this.place(); const k = clamp(this.stateT * 2.5, 0, 1);
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.4); g.addColorStop(0, 'rgba(8,8,12,.7)'); g.addColorStop(1, 'rgba(8,8,12,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.4);
    ctx.globalAlpha = k;
    txt(ctx, place === 1 ? t('games.racer.victory') : place <= 3 ? t('games.racer.podium') : t('games.racer.finish'), W / 2, 120 * u, { size: (64 - (1 - k) * 30) * u, align: 'center', color: place <= 3 ? HUD.lime : HUD.white, italic: true });
    txt(ctx, `${ordinal(place)} · ${fmt(this.finishT)}`, W / 2, 158 * u, { size: 30 * u, align: 'center' });
    ctx.globalAlpha = 1;
    this.hooks.progress?.drawToasts(ctx, W, dt);
  }

  // nomi sopra i due rivali più vicini davanti (senza sovrapposizioni)
  drawTags(ctx, W, H, u) {
    const v = new THREE.Vector3(); const boxes = [];
    const near = (this.rivals || []).map((r) => ({ r, gap: r.s - this.s })).filter((e) => e.gap > 1 && e.gap < 30).sort((a, b) => a.gap - b.gap).slice(0, 2);
    for (const { r, gap } of near) {
      const p = this.at(r.s, r.x); v.set(p.x, p.y + 2.0, p.z).project(this.camera);
      if (v.z > 1) continue;
      let x = (v.x + 1) / 2 * W; let y = (1 - v.y) / 2 * H;
      const name = first(r.name); const sz = clamp(17 - gap * 0.12, 13, 17) * u;
      const w = measure(ctx, name, sz) + 20; const h = sz + 8;
      for (const b of boxes) if (Math.abs(b.x - x) < (b.w + w) / 2 && Math.abs(b.y - y) < h) y = b.y - h - 2;
      x = clamp(x, w / 2 + 6, W - w / 2 - 6); // il nome resta sempre dentro lo schermo
      boxes.push({ x, y, w });
      ctx.globalAlpha = clamp(1 - (gap - 26) / 10, 0, 1);
      panel(ctx, x - w / 2, y - h, w, h, { r: 6, fill: 'rgba(12,12,18,.62)' });
      ctx.fillStyle = r.color; ctx.fillRect(x - w / 2 + 5, y - h + 4, 4, h - 8);
      txt(ctx, name, x + 3, y - 5, { size: sz, align: 'center', stroke: null });
      ctx.globalAlpha = 1;
    }
  }

  drawStandings(ctx, W, H, u) {
    const list = this.standing || this.ranking(); const me = list.findIndex((x) => x.me);
    const rows = [...new Set([0, me - 1, me, me + 1].filter((i) => i >= 0 && i < list.length))];
    const lh = 21 * u; const y0 = H - 92 * u - rows.length * lh; const x0 = W - 14;
    rows.forEach((i, k) => {
      const r = list[i]; const y = y0 + k * lh;
      const gs = Math.round(Math.abs(r.d - this.s) / Math.max(5, this.speed)); const gap = i === me ? '' : `${r.d - this.s > 0 ? '+' : '−'}${gs} s`;
      txt(ctx, `${i + 1}. ${r.me ? you() : first(r.name)}  ${gap}`, x0, y, { size: 16 * u, align: 'right', color: r.me ? HUD.lime : HUD.white });
      ctx.fillStyle = r.color; ctx.fillRect(x0 + 2, y - 12 * u, 4, 13 * u);
    });
  }

  // profilo altimetrico della tappa con le posizioni
  drawProfile(ctx, W, H, u = 1, yBottom = H - 14) {
    const x0 = 16; const x1 = W - 16; const y1 = yBottom; const h = 44 * u;
    panel(ctx, x0 - 8, y1 - h - 10, x1 - x0 + 16, h + 16, { fill: 'rgba(12,12,18,.55)' });
    const range = Math.max(10, this.maxY - this.minY);
    const X = (s) => x0 + (Math.min(s, this.length) / this.length) * (x1 - x0);
    const Y = (y) => y1 - ((y - this.minY) / range) * h;
    ctx.beginPath(); ctx.moveTo(x0, y1);
    for (const p of this.pts) { if (p.s > this.length) break; if (p.s % 12 === 0) ctx.lineTo(X(p.s), Y(p.y)); }
    ctx.lineTo(x1, y1); ctx.closePath();
    ctx.fillStyle = 'rgba(217,255,61,.22)'; ctx.fill();
    // parte già fatta
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y1 - h - 4, X(this.s || 0) - x0, h + 4); ctx.clip();
    ctx.beginPath(); ctx.moveTo(x0, y1); for (const p of this.pts) { if (p.s > this.length) break; if (p.s % 12 === 0) ctx.lineTo(X(p.s), Y(p.y)); } ctx.lineTo(x1, y1); ctx.closePath();
    ctx.fillStyle = 'rgba(217,255,61,.55)'; ctx.fill(); ctx.restore();
    // fascia colorata sopra il profilo: i momenti della tappa
    for (const m of this.tl.moments) { if (m.kind === 'recover') continue; ctx.fillStyle = KIND_COLORS[m.kind]; ctx.globalAlpha = 0.9; ctx.fillRect(X(m.s0), y1 - h - 9, Math.max(2, X(Math.min(m.s1, this.length)) - X(m.s0)), 4 * u); ctx.globalAlpha = 1; }
    for (const ln of this.lines) { ctx.fillStyle = ln.type === 'kom' ? '#ff5a6a' : '#3ccf6a'; ctx.fillRect(X(ln.s) - 1.5, y1 - h - 4, 3, h + 4); }
    for (const r of this.rivals || []) { ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(X(r.s), Y(this.at(r.s).y), 3.5 * u, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = HUD.lime; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(this.s || 0), Y(this.at(this.s || 0).y), 6 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  drawSelect(ctx, W, H) {
    const S = STAGES[STAGE_FOR[this.durIdx]]; const u = uiScale(W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55); g.addColorStop(0, 'rgba(8,8,12,.9)'); g.addColorStop(1, 'rgba(8,8,12,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.55);
    const g2 = ctx.createLinearGradient(0, H * 0.5, 0, H); g2.addColorStop(0, 'rgba(8,8,12,0)'); g2.addColorStop(1, 'rgba(8,8,12,.94)');
    ctx.fillStyle = g2; ctx.fillRect(0, H * 0.5, W, H * 0.5);
    txt(ctx, t('games.racer.hud.title'), W / 2, 96 * u, { size: 46 * u, align: 'center', color: HUD.lime, italic: true });
    txt(ctx, t('games.racer.hud.tagline'), W / 2, 122 * u, { size: 16 * u, align: 'center', color: HUD.dim, font: 'text', maxW: W - 28 });
    this.hitZones = [];
    // durata (tre tasti) e livello (tre tasti)
    const chip = (label, x, y, w, h, on, fn, col = HUD.lime) => {
      panel(ctx, x, y, w, h, { r: 12 * u, fill: on ? col : 'rgba(12,12,18,.7)', border: on ? null : 'rgba(255,255,255,.35)' });
      txt(ctx, label, x + w / 2, y + h * 0.66, { size: 20 * u, align: 'center', color: on ? '#15141b' : HUD.white, stroke: on ? null : undefined, maxW: w - 8 });
      this.hitZones.push({ x, y, w, h, fn });
    };
    const cw = Math.min(104 * u, (W - 28 - 16) / 3); const cx0 = (W - (cw * 3 + 16)) / 2;
    txt(ctx, t('games.racer.menu.duration'), W / 2, 156 * u, { size: 14 * u, align: 'center', color: HUD.dim, font: 'text' });
    DURATIONS.forEach((d, i) => chip(t('games.racer.menu.min', { n: d / 60 }), cx0 + i * (cw + 8), 164 * u, cw, 42 * u, i === this.durIdx, () => { this.durIdx = i; }));
    txt(ctx, t(S.name), W / 2, 238 * u, { size: 26 * u, align: 'center', maxW: W - 28 });
    txt(ctx, t(S.desc), W / 2, 260 * u, { size: 15 * u, align: 'center', color: HUD.dim, font: 'text', maxW: W - 28 });
    txt(ctx, t('games.racer.menu.level'), W / 2, 292 * u, { size: 14 * u, align: 'center', color: HUD.dim, font: 'text' });
    LEVEL_KEYS.forEach((k, i) => chip(t(`games.racer.menu.${k}`), cx0 + i * (cw + 8), 300 * u, cw, 38 * u, i === this.level, () => { this.level = i; }, HUD.cyan));
    // che cosa succede nella tappa e a quale ritmo (in % della TUA FTP)
    const ftp = this.hooks.ftp?.() || 200; const lv = LEVELS[this.level];
    txt(ctx, t('games.racer.menu.ftp', { w: ftp }), W / 2, 366 * u, { size: 15 * u, align: 'center', color: HUD.gold, font: 'text', maxW: W - 28 });
    const hold = Math.round(1.05 * lv * 20) * 5; const kick = Math.round(1.3 * lv * 20) * 5;
    txt(ctx, t('games.racer.menu.example', { a: hold, wa: Math.round(hold * ftp / 500) * 5, b: kick, wb: Math.round(kick * ftp / 500) * 5 }), W / 2, 388 * u, { size: 14 * u, align: 'center', color: HUD.dim, font: 'text', maxW: W - 28 });
    const stars = Number(localStorage.getItem(`racerStars${this.durIdx}_${this.level}`)) || 0;
    const best = Number(localStorage.getItem(`racer3dBest${STAGE_FOR[this.durIdx]}`));
    txt(ctx, `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}${best ? `  ·  ${t('games.racer.best', { time: fmt(best) })}` : ''}`, W / 2, 414 * u, { size: 18 * u, align: 'center', color: HUD.gold, font: 'text' });
    this.drawProfile(ctx, W, H, u, H - 96 * u);
    txt(ctx, t('games.racer.menuKeys'), W / 2, H - 44 * u, { size: 19 * u, align: 'center', color: HUD.lime, font: 'text', maxW: W - 28 });
    this.hooks.progress?.drawToasts(ctx, W, 0.016);
  }

  drawResults(ctx, W, H, dt) {
    const u = uiScale(W, H); const place = this.place(); const res = this.result || { stars: 1, objDone: 0, objTotal: 0 };
    if (H >= W * 0.83) {
      const g = ctx.createLinearGradient(0, H * 0.42, 0, H); g.addColorStop(0, 'rgba(8,8,12,0)'); g.addColorStop(0.2, 'rgba(8,8,12,.86)'); g.addColorStop(1, 'rgba(8,8,12,.95)');
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.42, W, H * 0.58);
    }
    const g2 = ctx.createLinearGradient(0, 0, 0, 190 * u); g2.addColorStop(0, 'rgba(8,8,12,.78)'); g2.addColorStop(1, 'rgba(8,8,12,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, 190 * u);
    txt(ctx, place === 1 ? t('games.racer.victory') : place <= 3 ? t('games.racer.podium') : t('games.racer.finish'), W / 2, 92 * u, { size: 42 * u, align: 'center', color: place <= 3 ? HUD.lime : HUD.white, italic: true });
    txt(ctx, `${ordinal(place)} · ${fmt(this.finishT)}${this.newBest ? t('games.common.newBest') : ''}`, W / 2, 120 * u, { size: 20 * u, align: 'center' });
    txt(ctx, `${'★'.repeat(res.stars)}${'☆'.repeat(3 - res.stars)}`, W / 2, 158 * u, { size: 34 * u, align: 'center', color: HUD.gold, font: 'text', stroke: 'rgba(0,0,0,.85)' });
    // nomi sopra le teste sul podio
    const v = new THREE.Vector3();
    (this.podiumTop || []).forEach((e, i) => {
      const cy = e.me ? this.player : this.rivalRiders[e.r.i];
      v.copy(cy.root.position); v.y += 2.15; v.project(this.camera);
      txt(ctx, `${i + 1}. ${e.me ? you() : first(e.name)}`, (v.x + 1) / 2 * W, (1 - v.y) / 2 * H, { size: 18 * u, align: 'center', color: e.me ? HUD.lime : HUD.white });
    });
    const land = W > H * 1.2;
    const cx = land ? W * 0.74 : W / 2; let y0 = land ? H * 0.2 : H * 0.5;
    if (land) { panel(ctx, cx - 190 * u * 0.85, y0 - 30 * u, 380 * u * 0.85, (130 + this.standing.length * 22) * u, { fill: 'rgba(8,8,12,.72)' }); }
    // obiettivi riusciti / mancati, uno per momento
    txt(ctx, t('games.racer.res.goals', { a: res.objDone, b: res.objTotal }), cx, y0, { size: 16 * u, align: 'center', color: HUD.white });
    const hist = this.race?.objHist || []; const cw2 = Math.min(W - 28, 360 * u);
    hist.forEach((hh, i) => {
      const per = Math.ceil(hist.length / (hist.length > 8 ? 2 : 1)); const col = i % per; const row = Math.floor(i / per); const cw = cw2 / per;
      txt(ctx, `${hh.ok ? '✓' : '✗'} ${t(`games.racer.kind.${hh.kind}`)}`, cx - cw2 / 2 + col * cw + cw / 2, y0 + 20 * u + row * 17 * u, { size: 12 * u, align: 'center', color: hh.ok ? HUD.lime : HUD.red, font: 'text', maxW: cw - 4 });
    });
    y0 += (hist.length > 8 ? 52 : 36) * u;
    const gr = this.leader('green'); const km = this.leader('kom');
    if (gr || km) { txt(ctx, t('games.racer.jerseysEnd', { green: gr ? who(gr.name) : '-', dots: km ? who(km.name) : '-' }), cx, y0, { size: 13 * u, align: 'center', color: HUD.dim, maxW: W - 24 }); y0 += 8 * u; }
    const lh = 19 * u; const cw = land ? 0.85 : 1;
    this.standing.forEach((r, i) => {
      const y = y0 + 18 * u + i * lh;
      txt(ctx, `${i + 1}.`, cx - 130 * u * cw, y, { size: 16 * u, align: 'right', color: r.me ? HUD.lime : HUD.dim });
      txt(ctx, r.me ? you() : r.name, cx - 120 * u * cw, y, { size: 16 * u, color: r.me ? HUD.lime : HUD.white, maxW: 170 * u });
      const first1 = this.standing[0].fin;
      txt(ctx, i === 0 ? fmt(r.fin) : `+${fmtGap(r.fin - first1)}`, cx + 140 * u * cw, y, { size: 16 * u, align: 'right', color: r.me ? HUD.lime : HUD.dim });
    });
    const cool = Math.ceil(this.cool ?? 0);
    txt(ctx, cool > 0 ? t('games.racer.res.cool', { t: `0:${String(cool).padStart(2, '0')}` }) : t('games.racer.res.coolDone'), W / 2, H - 58 * u, { size: 15 * u, align: 'center', color: HUD.cyan, font: 'text', maxW: W - 24 });
    if (this.stateT > 2) txt(ctx, t('games.racer.endKeys'), W / 2, H - 30 * u, { size: 19 * u, align: 'center', color: HUD.lime, font: 'text', maxW: W - 24 });
    this.hooks.progress?.drawToasts(ctx, W, dt);
  }

  loop(now) {
    if (!this.active) return;
    const realDt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    const dt = this.time.step(realDt);
    this.update(dt, realDt);
    this.frame = (this.frame || 0) + 1;
    if (this.scene && this.state !== 'error') this.draw(dt, realDt);
    // l'HUD (canvas 2D, testo con contorno) si ridisegna a 30 Hz: basta per i numeri e costa la metà
    this.hudDt = (this.hudDt || 0) + realDt;
    if (this.frame % 2 === 0 || this.state === 'loading') { this.drawHud(this.hudDt); this.hudDt = 0; }
    requestAnimationFrame(this.loop);
  }
}

// ---------- texture disegnate al volo ----------
function mergeGeometriesSafe(list) {
  // unione semplice di geometrie non indicizzate con gli stessi attributi
  const total = list.reduce((a, g) => a + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const k of Object.keys(list[0].attributes)) {
    const size = list[0].attributes[k].itemSize; const arr = new Float32Array(total * size); let o = 0;
    for (const g of list) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
function roadTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#5a5960'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) { g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
  g.fillStyle = '#f2f2f2'; g.fillRect(3, 0, 3, 128); g.fillRect(122, 0, 3, 128);
  g.fillRect(63, 0, 2, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function curbTexture() {
  const c = document.createElement('canvas'); c.width = 8; c.height = 16;
  const g = c.getContext('2d'); g.fillStyle = '#d62839'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#f4f4f4'; g.fillRect(0, 8, 8, 8);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function checkerTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 16;
  const g = c.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x * 8, y * 8, 8, 8); }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function labelTexture(text, bg, fg = '#fff', w = 512, h = 64, font = `400 44px ${FONT_DISPLAY}`) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 3, w - 16);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- modelli Meshy ----------
// appoggia un modello a terra (base a y = 0) e lo centra in x/z: i file Meshy hanno l'origine al centro
function groundModel(gltf) {
  if (gltf.userData.grounded) return gltf;
  const b = new THREE.Box3().setFromObject(gltf.scene);
  gltf.scene.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  gltf.scene.updateMatrixWorld(true); gltf.userData.grounded = true;
  return gltf;
}
// geometria unica del modello, a terra, con larghezza e altezza interna (per l'arco)
function groundedGeometry(gltf) {
  if (gltf.userData.geo) return gltf.userData.geo;
  groundModel(gltf);
  let mesh = null; gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.computeBoundingBox(); const bb = g.boundingBox;
  // altezza libera sotto la traversa: il punto più basso dell'arco al centro della strada
  const pos = g.attributes.position; let inner = bb.max.y; const w = bb.max.x - bb.min.x;
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i)) < w * 0.15) inner = Math.min(inner, pos.getY(i));
  g.userData = { width: w, height: bb.max.y - bb.min.y, inner };
  gltf.userData.geo = g;
  return g;
}
// colore dell'arco gonfiabile: tinta unita con fascia bianca, oppure bianco a pois rossi (GPM)
const archMats = new Map();
function archMaterial(color, pattern) {
  const key = color + pattern; if (archMats.has(key)) return archMats.get(key);
  const m = toonMaterial({ color });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <color_fragment>', pattern === 'dots'
      ? `#include <color_fragment>
        { vec2 q = vec2(vObj.x + vObj.z, vObj.y) * 28.0; vec2 c = fract(q) - 0.5; float d = length(c);
          diffuseColor.rgb = mix(vec3(0.96), vec3(0.85, 0.12, 0.16), 1.0 - smoothstep(0.26, 0.3, d)); }`
      : `#include <color_fragment>
        { float top = vObj.y / 0.72; float band = step(0.83, top) * step(top, 0.9); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96), band); } // una fascia bianca sulla traversa`);
  };
  m.customProgramCacheKey = () => 'arch-' + pattern;
  archMats.set(key, m);
  return m;
}

function podiumBackTexture(title) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#1b1a24'); gr.addColorStop(1, '#2c2a3a'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#d9ff3d' : '#4de3ff'; g.globalAlpha = 0.18; g.fillRect(i * 64 - 30, 0, 26, 256); }
  // il titolo è una carta da parati a righe, quasi trasparente: niente scritta grande dietro la testa dei corridori e i loro nomi
  g.fillStyle = '#b8dc2c'; g.globalAlpha = 0.13; g.font = `400 30px ${FONT_DISPLAY}`; g.textAlign = 'center';
  for (let row = 0; row < 5; row++) for (let k = -1; k < 3; k++) g.fillText(title, 256 + (k - 0.5 + (row % 2) * 0.5) * 250, 36 + row * 52, 230);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function questionTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#f4b41b'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#9a5a10'; g.lineWidth = 6; g.strokeRect(3, 3, 58, 58);
  g.fillStyle = '#fff'; g.font = `400 44px ${FONT_DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 32, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function fmtGap(s) { s = Math.max(0, s); const m = Math.floor(s / 60); return m ? `${m}:${(s - m * 60).toFixed(0).padStart(2, '0')}` : `${s.toFixed(1)} s`; }
function fmt(s) {
  if (!Number.isFinite(s)) return '--:--';
  const m = Math.floor(s / 60); const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}
