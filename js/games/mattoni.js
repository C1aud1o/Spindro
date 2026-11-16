// FEED ZONE — la zona di rifornimento di una tappa, in 3D. Sei il ciclista: la tua bici fa da "racchetta" e rimbalza
// la borraccia (il pallone) verso i soigneur che corrono lungo la strada con le loro musette. Colpiscili: ogni musette
// consegnata è un punto verso l'obiettivo dell'ondata. La CADENZA decide la velocità della borraccia, i WATT la caricano:
// nella zona giusta riempi il turbo (colpi caricati, moltiplicatore) e negli sforzi ("rush") tieni il bersaglio per una
// borraccia infuocata che trapassa la fila e consegna doppio. A fine blocco arriva l'auto della squadra (mini-boss).
// Ogni partita è un ALLENAMENTO (horde-plan.js: 5/10/20 minuti, % della FTP, avvio, ondate, finale, defaticamento).
// + / − fanno UNA cosa: muovono la bici a destra e a sinistra (tenuti premuti = movimento continuo). Chi smette di pedalare va in pausa.
import * as THREE from 'three';
import { Stage, loadAll, Effects, fxTexture, glowTexture, Quality } from './kit3d.js';
import { skyDome, styleLights, styleFog, toonMaterial, toonify, TIMES, PALETTE } from './kit/style.js';
import { Cyclist, loadMeshyTemplate, loadCyclistTemplate, makeKit, makeMeshyCrowdGeometry, crowdMaterial, CYCLIST_URL } from './kit/cyclist.js';
import { scatterModel, groundModel, crowdInstances } from './kit/env.js';
import { Shake, Confetti } from './kit/juice.js';
import { txt as hudText, hudView, paragraph, MessageQueue, loadHudFonts, uiScale, hurtVignette, HURT_FLASH_S, guardTrainer, trainerLostBanner } from './kit/hud.js';
import { GameMenu, ResultsView } from './kit/menu.js';
import { makeRandom } from './kit/rng.js';
import { clamp, lerp } from './engine.js';
import { SONGS } from './audio.js';
import { t } from '../i18n.js';
import { DURATIONS, LEVELS, COOL_S, buildPlan, planFromWorkout, segAt, targetW, targetPct, Adapter, starsFor, nextStarHint } from './horde-plan.js';
import { WorkoutClock, BandMeter, workoutStars } from './kit/workout-plan.js';

const A = 'assets/3d';
export const HW = 5.6;             // metà larghezza del campo (m)
export const TOP = 15.5;             // fondo del campo
const PZ = 1.5;                    // linea della bici
const BR = 0.85;                    // raggio della borraccia
const RIDER_S = 1.75;              // il ciclista è più grande del vero: si legge dall'alto
const GUY_S = 1.7;                 // i soigneur pure
const TR = 0.78;                   // raggio di un soigneur (urto)
const NUDGE = 1.4;                 // un tocco
const MOVE = 12;                   // m/s tenendo premuto
const MAX_LIVES = 5;
const SEG_COLOR = { warm: '#9ee37d', pace: '#ffd34d', effort: '#ff9f43', sprint: '#ff4d6d', rest: '#4de3ff', cool: '#a0f0c0' };

// ondate: ogni blocco di quattro cambia il modo in cui scorrono i soigneur (si ripete, sempre più duro)
// rows: file; spd: velocità di scorrimento (m/s); gel: quota di soigneur con il gel; crate: quota di casse (2 colpi)
export const FORMS = [
  { id: 'lines', rows: 3, spd: 0.9, gel: 0.1, crate: 0 },
  { id: 'gel', rows: 3, spd: 1.2, gel: 0.34, crate: 0.1 },
  { id: 'wind', rows: 3, spd: 2.1, gel: 0.1, crate: 0.15 },
  { id: 'car', rows: 1, spd: 1.2, gel: 0.1, crate: 0.2 },
];
export const WARM_FORM = { id: 'warm', rows: 2, spd: 0.7, gel: 0.15, crate: 0 };
export const formAt = (wave, boss) => (wave < 1 ? WARM_FORM : boss ? FORMS[3] : FORMS[(wave - 1) % 3]);

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

// ---------- texture disegnate al volo ----------
function canvasTex(w, h, draw, { repeat = false, aniso = 4 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
// strada di tappa: asfalto, cordoli rosso-bianchi, mezzeria, linea della bici e traguardo a scacchi in fondo
const ROAD_W = HW * 2 + 3.2; const ROAD_Z0 = -9; const ROAD_Z1 = TOP + 3; const ROAD_L = ROAD_Z1 - ROAD_Z0;
function roadTexture() {
  const W = 512; const H = Math.round(W * ROAD_L / ROAD_W); const rand = rng(9);
  return canvasTex(W, H, (g) => {
    const kx = W / ROAD_W; const zy = (z) => (z - ROAD_Z0) / ROAD_L * H; const X = (x) => (x + ROAD_W / 2) * kx;
    g.fillStyle = '#5b5a63'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; g.fillRect(rand() * W, rand() * H, 2 + rand() * 3, 2 + rand() * 3); }
    g.fillStyle = 'rgba(255,255,255,.035)'; for (let z = ROAD_Z0; z < ROAD_Z1; z += 6) g.fillRect(X(-HW), zy(z), 2 * HW * kx, zy(z + 3) - zy(z));
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : X(HW + 0.45); const w = side < 0 ? X(-HW - 0.45) : W - X(HW + 0.45);
      for (let z = ROAD_Z0, i = 0; z < ROAD_Z1; z += 1, i++) { g.fillStyle = i % 2 ? '#f4f0e6' : '#e0364a'; g.fillRect(x0, zy(z), w, zy(z + 1) - zy(z) + 1); }
    }
    g.fillStyle = '#f4f0e6'; g.fillRect(X(-HW) - 2, 0, 5, H); g.fillRect(X(HW) - 2, 0, 5, H);
    g.fillStyle = 'rgba(244,240,230,.8)'; for (let z = ROAD_Z0 + 0.5; z < ROAD_Z1; z += 3) g.fillRect(X(0) - 3, zy(z), 6, zy(z + 1.6) - zy(z));
    const chk = (zA, zB, n) => { const cw = 2 * HW * kx / n; const ch = (zy(zB) - zy(zA)) / 2; for (let r = 0; r < 2; r++) for (let c = 0; c < n; c++) { g.fillStyle = (r + c) % 2 ? '#15141b' : '#f4f0e6'; g.fillRect(X(-HW) + c * cw, zy(zA) + r * ch, cw + 1, ch + 1); } };
    chk(TOP + 0.9, TOP + 1.7, 32);
  });
}
function grassTexture(a = '#8cc055', b = '#7bb04a') {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.fillRect(0, 0, w, h / 2);
    const r = rng(2); for (let i = 0; i < 160; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(30,70,20,.09)'; g.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: true });
}
// la zona di raccolta davanti alla bici: striscia lime con chevron bianchi (si legge dall'alto)
function stripTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#d9ff3d'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(21,20,27,.55)'; for (let x = -h; x < w + h; x += 40) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h * 0.5, h * 0.5); g.lineTo(x + h, h); g.lineTo(x + h - 12, h); g.lineTo(x + h * 0.5, h * 0.5 + 12); g.lineTo(x + 12, h); g.closePath(); g.fill(); }
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
  });
}

// ---------- oggetti procedurali ----------
// musette: borsa di tela con tracolla (corpo colorato per istanza + fascia e tracolla fisse)
function musetteGeos() {
  const body = new THREE.CylinderGeometry(0.34, 0.44, 0.78, 9); body.translate(0, 0.39, 0);
  const trim = []; const add = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count; const a = new Float32Array(n * 3); const col = new THREE.Color(c); for (let i = 0; i < n; i++) col.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); trim.push(g); };
  const band = new THREE.CylinderGeometry(0.455, 0.455, 0.16, 9, 1, true); band.translate(0, 0.3, 0); add(band, '#fff4e0');
  const flap = new THREE.CylinderGeometry(0.31, 0.34, 0.14, 9); flap.translate(0, 0.84, 0); add(flap, '#fff4e0');
  const strap = new THREE.TorusGeometry(0.3, 0.035, 5, 14, Math.PI); strap.rotateZ(0); strap.translate(0, 0.86, 0); add(strap, '#15141b');
  return { body, trim: mergeNonIndexed(trim) };
}
function mergeNonIndexed(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const out = { position: new Float32Array(n * 3), normal: new Float32Array(n * 3), color: new Float32Array(n * 3) }; let o = 0;
  for (const g of list) { for (const k of ['position', 'normal', 'color']) out[k].set(g.attributes[k].array, o * 3); o += g.attributes.position.count; }
  const geo = new THREE.BufferGeometry(); for (const k of Object.keys(out)) geo.setAttribute(k, new THREE.BufferAttribute(out[k], 3)); return geo;
}
// gel energetico: bustina schiacciata con strappo e fascia (nessun logo)
function gelObject(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 5, 12), toonMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
  body.scale.set(1, 1, 0.42); g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.2, 14, 1, true), toonMaterial({ color: '#f4f0e6' }));
  band.scale.set(1, 1, 0.44); band.position.y = 0.02; g.add(band);
  const tear = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 4), toonMaterial({ color: '#f4f0e6' }));
  tear.scale.set(1, 1, 0.3); tear.position.y = 0.5; tear.rotation.y = Math.PI / 4; g.add(tear);
  g.rotation.z = Math.PI / 2; const w = new THREE.Group(); w.add(g); w.scale.setScalar(2.1); return w;
}
// every gel owns its three small geometries and materials (made in gelObject): free them when it is gone
function disposeObject(o) { o.traverse((c) => { if (c.isMesh) { c.geometry.dispose(); (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose()); } }); }
function buntingMesh(list) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.26, 0, 0, 0.26, 0, 0, 0, -0.55, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), list.length);
  const c = new THREE.Color(); list.forEach((f, i) => mesh.setColorAt(i, c.set(f.color)));
  mesh.frustumCulled = false; return mesh;
}
function prop(gltf, h) { // copia a terra di un modello Meshy, alta h metri, con materiali toon
  groundModel(gltf);
  const box = new THREE.Box3().setFromObject(gltf.scene); const hh = box.max.y - box.min.y;
  const root = gltf.scene.clone(true); toonify(root);
  const g = new THREE.Group(); g.add(root); g.scale.setScalar(h / hh); g.userData.h = hh;
  return g;
}

export class Mattoni {
  constructor(hudCanvas, hooks, audio) {
    this.hudCanvas = hudCanvas; this.hooks = guardTrainer(hooks); this.audio = audio;
    this.active = false;
    const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
    this.menu = new GameMenu({
      id: 'mattoni', title: () => t('games.mattoni.hud.title'), pitch: () => t('games.mattoni.hud.tagline'),
      howto: () => [t('games.mattoni.rule1'), t('games.mattoni.rule3'), t('games.mattoni.rule4')],
      load: () => ({ durIdx: clamp(Number(ls('feedDur', 0)) || 0, 0, DURATIONS.length - 1), level: clamp(Number(ls('feedLvl', 1)) || 0, 0, LEVELS.length - 1) }),
      save: ({ durIdx, level }) => { try { localStorage.setItem('feedDur', durIdx); localStorage.setItem('feedLvl', level); } catch { /* niente storage */ } },
      best: (d, l) => { try { const r = JSON.parse(localStorage.getItem(`feedBest:${DURATIONS[d]}:${LEVELS[l].id}`) || '{}'); return { stars: r.stars || 0, text: r.score ? String(r.score) : null }; } catch { return { stars: 0, text: null }; } },
      sfx: (n) => this.audio.sfx(n), ready: () => this.state === 'menu', workout: () => this.hooks.workout?.(),
      onStart: () => { this.reset(); this.begin(); },
    });
    this.results = new ResultsView({ sfx: (n) => this.audio.sfx(n), onAgain: () => { this.reset(); this.begin(); }, onBack: () => this.hooks.close?.() });
    this.loop = this.loop.bind(this);
    this.seed = null; this.rand = makeRandom(1);
  }
  // durata e livello vivono nel menu (i test e configure() li leggono/scrivono da qui)
  get durIdx() { return this.menu.durIdx; }
  set durIdx(v) { this.menu.durIdx = v; }
  get lvlIdx() { return this.menu.level; }
  set lvlIdx(v) { this.menu.level = v; }

  get ftp() { return Math.max(80, this.hooks.ftp?.() || 200); }

  async start() {
    this.hooks.reset?.();
    this.active = true;
    this.quality = new Quality();
    this.stage = new Stage(this.hudCanvas, { quality: this.quality });
    this.stage.onQuality = (cfg) => this.applyQuality(cfg);
    this.state = 'loading'; this.t = 0; this.msgs = new MessageQueue(); this.power = 0; this.pw = 0; this.cadence = 0; this.pops = [];
    this.last = performance.now();
    this.detach = [this.menu.attach(this.hudCanvas, () => ({ W: this.stage.W, H: this.stage.H }), () => this.state === 'menu' || this.state === 'loading'), this.results.attach(this.hudCanvas, () => ({ W: this.stage.W, H: this.stage.H }), () => this.state === 'results')];
    requestAnimationFrame(this.loop);
    this.audio.playSong(SONGS.menu);
    try {
      this.m = await loadAll({
        bottle: `${A}/meshy/bottle.glb`, hay: `${A}/meshy/hay_bale.glb`, barrier: `${A}/meshy/barrier.glb`, arch: `${A}/meshy/finish_arch.glb`,
        cypress: `${A}/meshy/cypress.glb`, tent: `${A}/meshy/feed_tent.glb`, car: `${A}/meshy/team_car.glb`,
      }, (p) => { this.loadPct = p * 0.6; });
      this.tpl = await loadMeshyTemplate().catch((err) => { console.warn('Meshy cyclist:', err); return loadCyclistTemplate(CYCLIST_URL); });
      this.loadPct = 0.8;
      this.crowdGeo = await makeMeshyCrowdGeometry().catch(() => null);
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
    this.scene = scene; this.shake = new Shake();
    this.stage.camera.far = 500; this.stage.camera.updateProjectionMatrix();
    this.domes = {};
    for (const k of Object.keys(TIMES)) { const d = skyDome(k); d.visible = false; scene.add(d); this.domes[k] = d; }
    this.fog = styleFog(scene, 'golden', 80, 240);
    this.light = styleLights(scene, 'golden', { shadows: q.cfg.shadows, mapSize: q.cfg.shadowMap, extent: 26 });
    const gt = grassTexture(); gt.repeat.set(70, 70);
    this.grassMat = toonMaterial({ map: gt });
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), this.grassMat);
    grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.02, TOP / 2); grass.receiveShadow = true; scene.add(grass);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_L), toonMaterial({ map: roadTexture() }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, (ROAD_Z0 + ROAD_Z1) / 2); road.receiveShadow = true; scene.add(road);
    this.buildScenery();
    this.glowTex = glowTexture('#ffffff'); // gli sprite Kenney 'light' hanno un bordo quasi trasparente ma non nullo: più sprite sommati disegnano un rettangolo. Questo sfuma a zero.
    this.fx = new Effects(scene, 160);
    this.confetti = new Confetti(scene, 160);
    this.buildActors();
    this.applyQuality(q.cfg);
    this.setTime(['morning', 'golden', 'dusk'][this.lvlIdx] || 'golden');
    this.reset();
  }

  applyQuality(cfg) {
    if (this.stage.composer && this.scene) this.stage.composer.passes[0].scene = this.scene;
    for (const i of this.inst || []) { i.setDensity(i.isCrowd ? cfg.crowd : cfg.density); i.cull(0, 0, 0, 0, 1e4); }
    if (this.light) this.light.sun.castShadow = cfg.shadows;
    this.player?.setShadows(cfg.shadows);
  }

  setTime(name) {
    const T = TIMES[name]; if (!T || this.timeName === name) return; this.timeName = name;
    for (const [k, d] of Object.entries(this.domes)) d.visible = k === name;
    const { hemi, sun } = this.light;
    hemi.color.set(T.hemiSky); hemi.groundColor.set(T.hemiGround); hemi.intensity = T.hemiI;
    sun.color.set(T.sun); sun.intensity = T.sunI; this.fog.color.set(T.fog);
    this.sunDir = new THREE.Vector3(...T.sunDir).normalize();
    this.grassMat.color.set(name === 'dusk' ? '#c9b6a0' : name === 'morning' ? '#e6f4d8' : '#ffffff');
  }

  buildScenery() {
    const { scene } = this.stage; const m = this.m; const rand = rng(4); this.inst = [];
    const at = (x, z, h, rot = 0, always = false) => ({ x, y: 0, z, rot, h, always });
    const add = (gltf, list, { kind = 'house', lodDist = 80, shadows = false } = {}) => {
      groundModel(gltf); const inst = scatterModel(scene, gltf, list, { kind, lodDist, shadows }); this.inst.push(inst); inst.cull(0, 0, 0, 0, 1e4); return inst;
    };
    // transenne lungo i lati e in fondo (alte quanto basta per leggersi dall'alto)
    const bh = 1.5; const bw = 0.94 / 0.48 * bh; const bar = [];
    for (const side of [-1, 1]) for (let z = ROAD_Z0 + 2; z < TOP + 1.2; z += bw * 0.98) bar.push(at(side * (HW + 0.55), z, bh, Math.PI / 2, true));
    for (let x = -HW + bw / 2; x < HW; x += bw * 0.98) bar.push(at(x, TOP + 0.4, bh, 0, true));
    add(m.barrier, bar, { lodDist: 60 });
    add(m.tent, [at(-HW - 8, 8, 6, Math.PI / 2, true), at(HW + 8.5, 15, 6, -Math.PI / 2, true)], { lodDist: 70 });
    const hay = []; for (let i = 0; i < 10; i++) hay.push(at((i % 2 ? 1 : -1) * (HW + 3.5 + rand() * 5), -6 + i * 3 + rand() * 2, 1.6, rand() * 6));
    add(m.hay, hay, { lodDist: 50 });
    const cyp = [];
    for (const side of [-1, 1]) for (let z = -8; z < TOP + 60; z += 5.5 + rand() * 1.6) cyp.push(at(side * (HW + 4.6 + rand() * 1.6), z, 7 + rand() * 2.6, rand() * 6));
    for (let i = 0; i < 26; i++) cyp.push(at((rand() - 0.5) * 120, TOP + 14 + rand() * 60, 7 + rand() * 3, rand() * 6));
    add(m.cypress, cyp, { kind: 'tree', lodDist: 44 });
    if (this.crowdGeo) {
      const cols = PALETTE.jerseys; const list = [];
      for (const side of [-1, 1]) for (let z = -6; z < TOP + 0.5; z += 2.6 + rand() * 0.8) list.push({ x: side * (HW + 1.8 + rand() * 0.9), y: 0, z, rot: side < 0 ? Math.PI / 2 : -Math.PI / 2, scale: 1.1 + rand() * 0.15, color: cols[Math.floor(rand() * cols.length)] });
      for (let x = -HW + 1; x < HW; x += 2.6 + rand() * 0.8) list.push({ x, y: 0, z: TOP + 1.9 + rand() * 0.5, rot: Math.PI, scale: 1.1 + rand() * 0.15, color: cols[Math.floor(rand() * cols.length)] });
      this.crowd = crowdInstances(scene, this.crowdGeo, list, { shadows: false }); this.crowd.isCrowd = true; this.inst.push(this.crowd);
    }
    const hillMat = toonMaterial({ color: '#7fae58' }); const rockMat = toonMaterial({ color: '#b3a6b8' });
    for (let i = 0; i < 9; i++) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
      const s = 40 + rand() * 40; hill.scale.set(s, 8 + rand() * 12, s * 0.8); hill.position.set(-190 + i * 48 + rand() * 20, 0, TOP + 120 + rand() * 40); scene.add(hill);
    }
    for (let i = 0; i < 6; i++) {
      const mt = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 5), rockMat); const s = 40 + rand() * 30;
      mt.scale.set(s, 60 + rand() * 50, s); mt.position.set(-150 + i * 62 + rand() * 20, 25, TOP + 200 + rand() * 30); mt.rotation.y = rand() * 3; scene.add(mt);
    }
    this.clouds = new THREE.Group(); scene.add(this.clouds);
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('smoke_04'), color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
      const s = 55 + rand() * 50; sp.scale.set(s * 1.7, s * 0.7, 1); sp.position.set(-220 + i * 55, 70 + rand() * 50, TOP + 230 + rand() * 60); sp.userData.v = 1.5 + rand() * 2.5; this.clouds.add(sp);
    }
    const flags = []; const cols = PALETTE.jerseys;
    const rope = (x0, z0, x1, z1, n, y) => { for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; flags.push({ x: x0 + (x1 - x0) * k, z: z0 + (z1 - z0) * k, y: y - Math.sin(Math.PI * (((i % 8) + 0.5) / 8)) * 0.5, color: cols[(i * 3) % cols.length], ph: i * 0.7 }); } };
    for (const side of [-1, 1]) rope(side * (HW + 0.9), -7, side * (HW + 0.9), TOP, 30, 4.6);
    rope(-HW - 0.9, TOP + 0.4, HW + 0.9, TOP + 0.4, 22, 4.6);
    this.flags = flags; this.flagMesh = buntingMesh(flags); scene.add(this.flagMesh);
    this.fm = new THREE.Matrix4(); this.fq = new THREE.Quaternion(); this.fe = new THREE.Euler(); this.fp = new THREE.Vector3(); this.fs = new THREE.Vector3(1, 1, 1);
  }

  // soigneur (istanze), musette (istanze), borraccia, striscia della bici, auto della squadra
  buildActors() {
    const { scene } = this.stage; const CAP = 40;
    this.guyCap = CAP;
    let geo; let mat;
    if (this.crowdGeo) { geo = this.crowdGeo; mat = crowdMaterial({ map: geo.userData.map, refLum: geo.userData.refLum }); } else { geo = new THREE.CapsuleGeometry(0.28, 1.2, 4, 10); geo.translate(0, 0.9, 0); mat = toonMaterial({}); }
    this.guyMat = mat;
    this.guys = new THREE.InstancedMesh(geo, mat, CAP); this.guys.frustumCulled = false; this.guys.count = 0; this.guys.castShadow = false;
    this.guys.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.guys);
    const mg = musetteGeos();
    this.bags = new THREE.InstancedMesh(mg.body, toonMaterial({}), CAP); this.bags.frustumCulled = false; this.bags.count = 0; scene.add(this.bags);
    this.bagTrim = new THREE.InstancedMesh(mg.trim, toonMaterial({ vertexColors: true }), CAP); this.bagTrim.frustumCulled = false; this.bagTrim.count = 0; scene.add(this.bagTrim);
    this.bags.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.bagTrim.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // borraccia (la palla): modello Meshy, tinta lime, che gira; alone e ombra
    this.ball = { root: new THREE.Group() };
    const bot = prop(this.m.bottle, 2.1); const inner = new THREE.Group(); inner.add(bot); bot.position.y = -1.05; this.ball.root.add(inner); this.ball.spin = inner;
    this.ball.fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ff7a2a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); this.ball.fire.scale.setScalar(3);
    this.ball.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#d9ff3d', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })); this.ball.glow.scale.setScalar(3.4);
    this.ball.glow.material.depthTest = false; this.ball.glow.renderOrder = 5; this.ball.fire.material.depthTest = false; this.ball.fire.renderOrder = 5;
    this.ball.root.add(this.ball.glow, this.ball.fire); scene.add(this.ball.root);
    this.ball.blob = new THREE.Mesh(new THREE.CircleGeometry(0.8, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false })); this.ball.blob.renderOrder = 1; scene.add(this.ball.blob);
    // striscia della bici
    this.stripMat = new THREE.MeshBasicMaterial({ map: stripTexture(), transparent: true, opacity: 0.95, depthWrite: false, fog: false });
    this.strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.8), this.stripMat); this.strip.rotation.x = -Math.PI / 2; this.strip.renderOrder = 2; scene.add(this.strip);
    // auto della squadra (mini-boss), vista di fianco mentre scorre lungo la strada
    this.carBox = new THREE.Box3().setFromObject(this.m.car.scene);
    this.car = prop(this.m.car, 3.2); const car = new THREE.Group(); car.add(this.car); this.carRoot = car; car.visible = false; scene.add(car);
    this.carMats = []; this.car.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); this.carMats.push(o.material); } });
    // gel che cade
    this.gelProto = gelObject('#ffd34d');
  }

  // ---------- partita ----------
  configure(durIdx, lvlIdx) {
    this.durIdx = durIdx; this.lvlIdx = lvlIdx;
    this.level = LEVELS[lvlIdx];
    // allenamento in corso: la partita È l'allenamento (durata, tratti e watt vengono da lì; il livello non cambia i watt:
    // qui cambia solo la velocità delle borracce e le vite, come sempre). Con il rullo in ERG la potenza segue il bersaglio da sola;
    // il gioco resta la cadenza (= velocità) e il + / − per le corsie, e non chiede mai watt diversi da quelli del passo.
    this.wc = new WorkoutClock(this.hooks); this.wk = this.wc.begin(this.ftp);
    if (this.wk) { this.plan = planFromWorkout(this.wk); this.total = this.plan.total; } else { this.total = DURATIONS[durIdx]; this.plan = buildPlan(this.total); }
    this.band = new BandMeter();
  }
  recordKey() { return `feedBest:${this.total}:${this.level.id}`; }
  record() { if (this.wk) return {}; try { return JSON.parse(localStorage.getItem(this.recordKey()) || '{}'); } catch { return {}; } }

  reset() {
    const { scene } = this.stage;
    for (const g of this.gels || []) this.freeGel(g.mesh);
    if (this.player) scene.remove(this.player.root);
    this.rand = makeRandom(this.seed); // il caso è nostro: con un seme (this.seed o window.__spindroSeed) la partita si ripete uguale (test)
    this.configure(this.durIdx, this.lvlIdx);
    this.setTime(['morning', 'golden', 'dusk'][this.lvlIdx] || 'golden');
    this.x = 0; this.tx = 0; this.held = 0; this.heldT = 0; this.pw = 0; this.power = 0; this.cadence = 0; // niente residui del menu: la prima borraccia non dipende da come si pedalava prima
    this.lives = 4; this.score = 0; this.combo = 0; this.bestCombo = 0; this.charge = 0; this.hot = false; this.inTarget = false;
    this.el = this.wk ? this.wc.el : 0; this.segIdx = -1; this.seg = this.plan.segs[0]; this.tgtW = undefined; this.gels = []; this.pop = null;
    this.paused = false; this.pauseT = 0; this.startT = 0; this.finished = false; this.result = null; this.ko = 0;
    this.effortsDone = 0; this.effortsTotal = 0; this.bossKilled = 0; this.bossSpawned = new Set(); this.delivered = 0; this.waveGot = 0; this.waveQuota = Infinity; this.waveClears = 0; this.waveNo = 0;
    this.adapt = new Adapter(); this.evLog = []; this.sprinting = false; this.sentGrade = undefined; this.msgs.clear(); this.boss = null; this.bossAt = null;
    this.hurtT = 0; this.padPulse = 0; this.serveT = 0; this.lastHitT = -9;
    this.player = new Cyclist(this.tpl, makeKit(PALETTE.lime, 0), { shadows: this.quality.cfg.shadows });
    this.player.root.scale.setScalar(RIDER_S); scene.add(this.player.root);
    this.targets = []; this.rows = []; this.form = WARM_FORM;
    this.buildRows(WARM_FORM, 0);
    this.serve(true);
    this.camInit = false; this.fov = 60;
    this.view(0);
  }

  // ---------- eventi: tutto ciò che chiede o premia qualcosa (si misura nel test) ----------
  freeGel(mesh) { this.scene.remove(mesh); disposeObject(mesh); }
  ev(kind) { if (this.evLog.length < 20000) this.evLog.push({ t: this.el, k: kind }); }
  eventStats() {
    const end = this.total - COOL_S; const ts = this.evLog.filter((e) => e.t <= end).map((e) => e.t).sort((a, b) => a - b);
    let maxGap = 0; let prev = 0; for (const x of ts) { maxGap = Math.max(maxGap, x - prev); prev = x; } maxGap = Math.max(maxGap, end - prev);
    return { first: ts[0] ?? Infinity, maxGap, perMin: ts.length / (end / 60), n: ts.length };
  }
  say(text, color = '#ffd34d', t = 1.6, big = false, prio = big ? 2 : 1, sub = null) { this.msgs.say(text, { color, dur: t, big, prio, sub }); }
  prog(stat, n = 1, xp = 0) { this.hooks.progress?.event(stat, n, xp); }

  // ---------- comandi: + / − muovono la bici ----------
  input(dir) {
    this.audio.ensure();
    if (this.state === 'menu' || this.state === 'loading') { this.menu.input(dir); return; }
    if (this.state === 'results') { this.results.input(dir); return; }
    if (this.state !== 'play' || this.paused) return;
    this.tx = clamp(this.tx - dir * NUDGE, -this.reach(), this.reach()); // destra sullo schermo = −X
  }
  hold(dir) { if (this.state === 'menu' || this.state === 'loading') { this.menu.hold(dir); return; } this.held = dir; this.heldT = 0; }
  reach() { return HW - this.pw2() * 0.7; }
  pw2() { return this.stripW / 2; }

  begin() {
    this.state = 'play'; this.stateT = 0; this.held = 0; this.hooks.runStart?.();
    this.audio.playSong(SONGS.desert); this.audio.sfx('go');
    this.serve(true);
  }

  // ---------- soigneur: file che scorrono ----------
  // ogni fila è una catena rigida che va avanti e indietro (nessuno attraversa nessuno); gli abbattuti tornano dopo qualche secondo, crescendo da zero
  buildRows(form, wave) {
    this.form = form; this.targets = []; this.rows = [];
    const rand = this.rand;
    const nRows = form.rows; const z0 = TOP - 3.1; const dz = 2.6;
    for (let r = 0; r < nRows; r++) {
      const z = z0 - r * dz; const gap = 2.4; const amp = form.spd > 1.5 ? 0.45 : 0.6;
      const n = form.id === 'car' ? 3 : Math.floor((2 * HW - 2 * amp - 0.9) / gap) + 1;
      const row = { z, dir: r % 2 ? -1 : 1, spd: form.spd * (0.85 + 0.3 * rand()), off: 0, amp, n };
      this.rows.push(row);
      for (let i = 0; i < n; i++) {
        const base = (i - (n - 1) / 2) * gap; const k = rand();
        const kind = k < form.gel ? 'gel' : k < form.gel + form.crate ? 'crate' : 'bag';
        this.targets.push(this.makeTarget(row, base, kind, r * 0.18 + i * 0.07));
      }
    }
  }
  makeTarget(row, base, kind, delay = 0) {
    const cols = PALETTE.jerseys;
    return { row, base, kind, x: base, z: row.z, hp: kind === 'crate' ? 2 : 1, hp0: kind === 'crate' ? 2 : 1, alive: false, grow: 0, wait: delay + 0.1, pulse: 0, hop: 0, jersey: kind === 'gel' ? '#ffcf33' : kind === 'crate' ? '#5b2a86' : cols[Math.floor(this.rand() * cols.length)], phase: this.rand() * 6, cool: 0, fly: 0, flyT: 0, bag: '#' + new THREE.Color(cols[Math.floor(this.rand() * cols.length)]).lerp(new THREE.Color('#ffffff'), 0.45).getHexString() };
  }
  scaleOf(tg) { return GUY_S * (tg.kind === 'crate' ? 1.12 : 1); }

  stepRows(dt) {
    for (const row of this.rows) {
      row.off += row.dir * row.spd * dt;
      if (row.off > row.amp) { row.off = row.amp; row.dir = -1; } else if (row.off < -row.amp) { row.off = -row.amp; row.dir = 1; }
    }
    for (const tg of this.targets) {
      tg.x = tg.base + tg.row.off; tg.z = tg.row.z; tg.cool = Math.max(0, tg.cool - dt); tg.pulse = Math.max(0, tg.pulse - dt * 4);
      if (tg.flyT > 0) tg.flyT = Math.max(0, tg.flyT - dt);
      if (!tg.alive) {
        tg.wait -= dt;
        if (tg.wait <= 0 && !this.rowsClosed) { tg.alive = true; tg.grow = 0; tg.hp = tg.hp0; tg.cool = 0.4; }
      } else if (tg.grow < 1) tg.grow = Math.min(1, tg.grow + dt / 0.5);
    }
  }

  // ---------- la borraccia ----------
  speed() { return 8.6 * clamp((this.cadence || 85) / 85, 0.8, 1.35) * (1 + this.lvlIdx * 0.03); }

  serve(initial = false) {
    const b = this.ballS = { x: this.x, z: PZ + 1.2, vx: 0, vz: 0, stuck: true, charged: false, sp: this.speed(), spin: 0, born: 0 };
    this.serveT = initial ? 1.4 : 1.0; this.ballAlive = true; return b;
  }

  launch() {
    const b = this.ballS; b.stuck = false; const a = (this.rand() - 0.5) * 0.7;
    b.vx = Math.sin(a) * b.sp; b.vz = Math.cos(a) * b.sp; this.audio.sfx('jump');
    this.fx.spawn(b.x, 0.8, b.z, { tex: 'flash', size: 2.4, life: 0.25, color: '#d9ff3d' });
  }

  stepBall(dt) {
    const b = this.ballS; if (!b) return;
    b.born = Math.min(1, b.born + dt / 0.35);
    if (b.stuck) {
      b.x = this.x; b.z = PZ + 1.2; this.serveT -= dt;
      if (this.serveT <= 0) this.launch();
      return;
    }
    const sp = this.speed(); b.sp += (sp - b.sp) * Math.min(1, dt * 3);
    const sc = b.sp / (Math.hypot(b.vx, b.vz) || 1); b.vx *= sc; b.vz *= sc;
    const n = Math.max(2, Math.ceil(b.sp * dt / 0.18)); const h = dt / n;
    for (let k = 0; k < n && this.ballAlive; k++) {
      b.x += b.vx * h; b.z += b.vz * h;
      if (b.x < -HW + BR) { b.x = -HW + BR; b.vx = Math.abs(b.vx); this.wall(b); }
      if (b.x > HW - BR) { b.x = HW - BR; b.vx = -Math.abs(b.vx); this.wall(b); }
      if (b.z > TOP - BR) { b.z = TOP - BR; b.vz = -Math.abs(b.vz); this.wall(b); }
      // la bici: l'angolo dipende da dove colpisci la striscia
      if (b.vz < 0 && b.z < PZ + 0.45 && b.z > PZ - 0.55 && Math.abs(b.x - this.x) < this.stripW / 2 + BR * 0.6) { this.catchBall(b); continue; }
      if (b.vz < 0 && b.z < PZ - 0.55) { this.loseBall(b); break; }
      this.hitTargets(b);
      this.hitBoss(b);
    }
    // mai troppo orizzontale: si rischia un ping-pong lungo
    const minZ = 0.6 * b.sp; if (Math.abs(b.vz) < minZ) { b.vz = (b.vz < 0 ? -1 : 1) * minZ; const sx = Math.sqrt(Math.max(0, b.sp * b.sp - b.vz * b.vz)); b.vx = Math.sign(b.vx || 1) * sx; }
  }

  wall(b) { this.audio.sfx('clank'); this.fx.spawn(b.x, 1, b.z, { tex: 'spark', size: 0.9, life: 0.15, color: '#ffffff' }); this.shake.add(0.02); }

  isHot(b) { return b.charged || this.hot; }

  catchBall(b) {
    const off = clamp((b.x - this.x) / (this.stripW / 2 + BR * 0.6), -1, 1);
    const a = off * 1.0; b.vx = Math.sin(a) * b.sp; b.vz = Math.cos(a) * b.sp; b.z = PZ + 0.45;
    this.padPulse = 1; this.shake.add(0.06); this.audio.sfx('land'); this.ev('catch');
    b.charged = false;
    if (this.charge >= 0.5) { this.charge -= 0.5; b.charged = true; this.say(t('games.mattoni.smash'), '#ff9f43', 0.9, false, 1); this.audio.sfx('boost'); this.ev('smash'); this.fx.explode(b.x, 0.9, b.z, 0.6); }
    this.fx.spawn(b.x, 0.9, b.z, { tex: 'spark', size: 1.4, life: 0.2, color: '#d9ff3d' });
    this.fx.spawn(b.x, 0.7, b.z, { tex: 'flash', size: 2.0, life: 0.14, grow: 0.8, color: '#d9ff3d' });
  }

  loseBall(b) {
    this.ballAlive = false; this.combo = 0; this.charge *= 0.5; this.ev('lose');
    this.audio.sfx('hurt'); this.shake.add(0.35); this.hurtT = 0.8; this.hurtFlash = HURT_FLASH_S; if (navigator.vibrate) navigator.vibrate(80);
    this.fx.spawn(b.x, 0.6, PZ - 0.5, { tex: 'smoke', size: 2.4, life: 0.6, additive: false });
    this.fx.spawn(b.x, 0.8, PZ - 0.5, { tex: 'flash', size: 3, life: 0.3, grow: 1, color: '#ff4a4a' });
    this.lives--;
    if (this.lives <= 0 && this.el >= 60) this.knockOut();
    else {
      if (this.lives <= 0) this.lives = 1;
      this.say(t('games.mattoni.dropped'), '#ff6b6b', 1.4, true, 2, t('games.mattoni.droppedSub', { n: this.lives }));
    }
    this.serve();
  }

  knockOut() {
    this.ko++; this.lives = 3; this.ev('ko'); this.shake.add(0.6); this.audio.sfx('boom');
    this.say(t('games.mattoni.flat'), '#ff6b6b', 2.4, true, 3, t('games.mattoni.flatSub'));
  }

  hitTargets(b) {
    const hot = this.isHot(b);
    for (const tg of this.targets) {
      if (!tg.alive || tg.grow < 0.6 || tg.cool > 0) continue;
      const dx = b.x - tg.x; const dz = b.z - tg.z; const R = BR + TR * (tg.kind === 'crate' ? 1.1 : 1); const d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2) || 0.01;
      if (!hot) { // rimbalza sulla normale; se ci si infila dentro, esce
        const nx = dx / d; const nz = dz / d; const dot = b.vx * nx + b.vz * nz;
        if (dot < 0) { b.vx -= 2 * dot * nx; b.vz -= 2 * dot * nz; }
        b.x = tg.x + nx * R; b.z = tg.z + nz * R;
      }
      tg.cool = hot ? 0.25 : 0.12;
      this.hitTarget(tg, hot);
      if (!hot) break;
    }
  }

  hitTarget(tg, hot) {
    const dmg = hot ? 2 : 1; tg.hp -= dmg; tg.pulse = 1; this.ev('hit'); this.lastHitT = this.el;
    this.shake.add(0.07); this.fx.spawn(tg.x, 2.2, tg.z - 0.4, { tex: 'spark', size: 1.6, life: 0.2, color: '#ffd166' });
    if (tg.hp > 0) { this.audio.sfx('hit'); return; }
    this.deliver(tg, hot);
  }

  deliver(tg, hot) {
    tg.alive = false; tg.wait = 2.0 + this.rand() * 1.6; tg.flyT = 0.7; tg.flyX = tg.x; tg.flyZ = tg.z; tg.flyCol = tg.jersey; tg.flyKind = tg.kind;
    this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
    const rush = hot && (this.seg.kind === 'effort' || this.seg.kind === 'sprint');
    const val = (tg.kind === 'crate' ? 2 : 1) * (rush ? 2 : 1);
    this.waveGot += val; this.delivered += val;
    const mult = this.mult();
    const pts = Math.round(10 * val * mult * (1 + Math.min(this.combo, 20) * 0.1));
    this.score += pts;
    this.popAdd(pts, mult > 1 ? `×${mult}` : '');
    this.fx.explode(tg.x, 1.6, tg.z, 0.7); this.confetti.burst(tg.x, 2, tg.z, tg.kind === 'gel' ? 16 : 10, 2.4);
    this.audio.sfx(this.combo > 4 ? 'coin' : 'hit'); this.shake.add(0.12); this.ev('deliver');
    if (tg.kind === 'gel') this.dropGel(tg.x, tg.z);
    if (this.waveGot >= this.waveQuota && !this.waveDone) this.waveComplete();
  }

  mult() { return 1 + Math.floor(this.charge * 3.001); }

  waveComplete() {
    if (this.seg.kind === 'cool') return;
    this.waveDone = true; this.waveClears++; this.score += 150 * Math.max(1, this.waveNo);
    this.say(t('games.mattoni.waveClear'), '#7dff6a', 1.6, true, 2); this.audio.sfx('rescue'); this.ev('waveClear');
    this.confetti.burst(0, 3, 12, 80, 4);
  }

  // punti: si sommano in un solo "+N" sopra la bici (niente pile di scritte)
  popAdd(n, mult) {
    if (!n) return;
    const p = this.pop;
    if (p && p.age < 0.8) { p.sum += n; p.mult = mult || p.mult; p.t = p.t0; } else this.pop = { sum: n, mult, t: 1.0, t0: 1.0, age: 0 };
  }

  dropGel(x, z) {
    const mesh = gelObject('#ffd34d'); mesh.position.set(x, 1.2, z); this.scene.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffd34d', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(1.5); mesh.add(glow);
    this.gels.push({ mesh, x, z, t: 0 });
  }
  stepGels(dt) {
    for (const g of this.gels) {
      g.t += dt; g.z -= 5.5 * dt; g.mesh.position.set(g.x, 1.1 + Math.sin(g.t * 7) * 0.15, g.z); g.mesh.rotation.y += dt * 3;
      if (g.z < PZ + 0.7 && g.z > PZ - 0.7 && Math.abs(g.x - this.x) < this.stripW / 2 + 0.6) { g.done = true; this.takeGel(g); }
      else if (g.z < PZ - 0.9) { g.done = true; this.fx.spawn(g.x, 0.8, g.z, { tex: 'smoke', size: 1.4, life: 0.4, additive: false }); }
      if (g.done) this.freeGel(g.mesh);
    }
    this.gels = this.gels.filter((g) => !g.done);
  }
  takeGel(g) {
    this.audio.sfx('pickup'); this.ev('gel'); this.charge = Math.min(1, this.charge + 0.5); this.score += 50;
    if (this.lives < MAX_LIVES) this.lives++;
    this.say(t('games.mattoni.gel'), '#ffd34d', 1.1, false, 1);
    this.fx.explode(this.x, 1.2, PZ, 0.7); this.shake.add(0.12);
  }

  // ---------- auto della squadra ----------
  maybeBoss(seg) {
    if (!this.plan.bossWaves.includes(seg.wave) || this.bossSpawned.has(seg.wave)) return;
    this.bossSpawned.add(seg.wave); this.spawnBoss(seg);
  }
  spawnBoss(seg) {
    const hp = Math.round(9 + this.lvlIdx * 2 + (seg.wave > 4 ? 2 : 0));
    this.boss = { wave: seg.wave, hp, maxHp: hp, x: -HW + 3, dir: 1, z: 6.8, flash: 0, grow: 0, dead: false, deadT: 0, leave: false, sway: 0, bob: 0 };
    this.carRoot.visible = true; this.carRoot.scale.setScalar(0.01);
    this.audio.sfx('alarm'); this.ev('boss');
    this.say(t('games.mattoni.carSay'), '#ff4d4d', 1.9, true, 3, t('games.mattoni.carSub'));
  }
  hitBoss(b) {
    const bs = this.boss; if (!bs || bs.dead || bs.leave || bs.grow < 0.9) return;
    const hx = 2.7 + BR; const hz = 1.2 + BR;
    if (Math.abs(b.x - bs.x) > hx || Math.abs(b.z - bs.z) > hz) return;
    const hot = this.isHot(b);
    if (!hot) { // rimbalza sul lato più vicino
      const dx = (b.x - bs.x) / hx; const dz = (b.z - bs.z) / hz;
      if (Math.abs(dx) > Math.abs(dz)) { b.vx = Math.sign(dx) * Math.abs(b.vx); b.x = bs.x + Math.sign(dx) * hx; } else { b.vz = Math.sign(dz) * Math.abs(b.vz); b.z = bs.z + Math.sign(dz) * hz; }
    }
    if (bs.cd > 0) return; bs.cd = hot ? 0.3 : 0.15;
    bs.hp -= hot ? 2 : 1; bs.flash = 1; this.ev('hit'); this.shake.add(0.18); this.audio.sfx(hot ? 'boom' : 'clank');
    this.fx.explode(b.x, 1.8, b.z, 0.8); this.score += hot ? 60 : 30; this.popAdd(hot ? 60 : 30, '');
    if (bs.hp <= 0) this.bossDown();
  }
  bossDown() {
    const bs = this.boss; bs.dead = true; bs.deadT = 0; this.bossKilled++; this.audio.sfx('win'); this.ev('bossDown');
    this.score += 500; this.confetti.burst(bs.x, 3, bs.z, 120, 5); this.fx.explode(bs.x, 2, bs.z, 2.2); this.shake.add(0.7);
    this.say(t('games.mattoni.carDown'), '#d9ff3d', 2.4, true, 3); this.prog('bosses', 1, 150);
    this.charge = 1; this.lives = Math.min(MAX_LIVES, this.lives + 1);
  }
  stepBoss(dt) {
    const bs = this.boss; if (!bs) return;
    bs.cd = Math.max(0, (bs.cd || 0) - dt); bs.flash = Math.max(0, bs.flash - dt * 4);
    if (bs.dead) { bs.deadT += dt; if (bs.deadT > 1.0) { this.boss = null; this.carRoot.visible = false; } return; }
    bs.grow = Math.min(1, bs.grow + dt / 0.8);
    bs.x += bs.dir * 2.6 * dt; const lim = HW - 2.7; if (bs.x > lim) { bs.x = lim; bs.dir = -1; } if (bs.x < -lim) { bs.x = -lim; bs.dir = 1; }
    bs.bob += dt;
    if (bs.leave) { bs.leaveT = (bs.leaveT || 0) + dt; if (bs.leaveT < dt * 1.5) this.fx.spawn(bs.x, 1.5, bs.z, { tex: 'smoke', size: 4, life: 0.7, additive: false }); if (bs.leaveT > 0.6) { this.boss = null; this.carRoot.visible = false; } }
  }

  // ---------- il piano ----------
  enterSeg(i) {
    const prev = this.seg; const seg = this.plan.segs[i]; const first = this.segIdx < 0;
    if (!first) this.judge(prev);
    this.segIdx = i; this.seg = seg; seg.inT = 0; seg.okT = 0;
    const W = targetW(seg, this.ftp, this.level.k, this.adapt.value, this.el);
    const isBoss = this.plan.bossWaves.includes(seg.wave);
    // con un allenamento un'ondata può cominciare con qualunque tratto (non solo con il ritmo): le file si costruiscono al cambio d'ondata
    if (this.wk && seg.wave >= 1 && seg.wave <= this.plan.N && seg.wave !== prev?.wave && seg.kind !== 'pace') this.startWave(seg, i);
    if (seg.kind === 'warm' && !first && prev?.kind === 'warm') { /* riscaldamento lungo spezzato: un solo annuncio */ }
    else if (seg.kind === 'warm') { this.say(t('games.horde.say.warm'), SEG_COLOR.warm, 3, true, 2, t('games.mattoni.say.warmSub')); }
    else if (seg.kind === 'pace') {
      const form = this.startWave(seg, i);
      this.say(t('games.mattoni.zoneOf', { n: seg.wave, m: this.plan.N }), '#d9ff3d', 2.6, true, 3, t('games.horde.say.waveSub', { what: t(`games.mattoni.f.${form.id}`), w: W }));
    } else if (seg.kind === 'effort') { this.say(t('games.horde.say.effort', { w: W }), SEG_COLOR.effort, 1.9, true, 3, t('games.mattoni.say.effortSub')); this.audio.sfx('go'); this.ev('segment'); this.maybeBoss(seg); }
    else if (seg.kind === 'sprint') { if (this.wk) this.maybeBoss(seg); this.say(t('games.horde.say.sprint', { w: W }), SEG_COLOR.sprint, 2.4, true, 3, t('games.mattoni.say.sprintSub', { s: Math.round(seg.t1 - seg.t0) })); this.audio.sfx('alarm'); this.ev('segment'); }
    else if (seg.kind === 'rest') {
      this.say(t('games.horde.say.rest'), SEG_COLOR.rest, 2.4, true, 2, t('games.horde.say.restSub', { w: W })); this.ev('segment');
      if (this.boss && !this.boss.dead) { this.boss.leave = true; this.say(t('games.mattoni.carGone'), '#ffb84d', 2, false, 2); }
    } else if (seg.kind === 'cool') { this.startCool(); }
  }

  // inizio di un'ondata: file di borracce e quota da consegnare
  startWave(seg, i) {
    this.waveNo = seg.wave; this.waveGot = 0; this.waveDone = false; this.rowsClosed = false;
    const form = formAt(seg.wave, this.plan.bossWaves.includes(seg.wave));
    this.buildRows(form, seg.wave);
    const L = this.wk ? this.plan.segs.filter((q) => q.wave === seg.wave).reduce((a, q) => a + q.t1 - q.t0, 0) : seg.t1 - seg.t0 + (this.plan.segs[i + 1] ? this.plan.segs[i + 1].t1 - this.plan.segs[i + 1].t0 : 0);
    this.waveQuota = Math.max(8, Math.round(L * 0.6 * (form.id === 'car' ? 0.7 : 1)));
    this.ev('wave');
    return form;
  }

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

  startCool() {
    this.rowsClosed = true; for (const tg of this.targets) tg.alive = false;
    if (this.boss && !this.boss.dead) this.boss.leave = true;
    this.finishResult();
    this.msgs.clear();
    this.audio.sfx('win');
  }

  finishResult() {
    const bossTotal = this.plan.bossWaves.length;
    // con un allenamento le stelle sono le stesse di tutti i giochi: tempo entro ±7 % del bersaglio (kit/workout-plan.js)
    const s = this.wk ? { stars: workoutStars(this.band.ratio, true), ratio: this.band.ratio } : starsFor({ done: this.effortsDone, total: this.effortsTotal, bossKilled: this.bossKilled, bossTotal, ko: this.ko });
    const rec = this.record(); const prevBest = rec.score || 0; const newBest = this.score > prevBest;
    if (!this.wk && (newBest || s.stars > (rec.stars || 0))) { try { localStorage.setItem(this.recordKey(), JSON.stringify({ score: Math.max(prevBest, this.score), stars: Math.max(rec.stars || 0, s.stars) })); } catch { /* niente storage */ } }
    this.result = { ...s, prevBest, done: this.effortsDone, total: this.effortsTotal, bossKilled: this.bossKilled, bossTotal, ko: this.ko, score: this.score, newBest, delivered: this.delivered, waves: this.waveClears, combo: this.bestCombo };
    this.result.hint = this.wk ? null : nextStarHint(this.result); this.result.wk = !!this.wk; this.result.band = this.band.ratio;
    this.prog('races', 0, 40 + s.stars * 40 + this.effortsDone * 10);
    if (!this.wk) this.hooks.progress?.setMax('feedStars', s.stars);
  }

  // chiusura anticipata (come negli altri giochi: la usano i test e l'app): calcola il riepilogo e termina
  end() { if (this.state !== 'play') return; if (!this.result) this.finishResult(); this.finish(); }

  finish() {
    this.state = 'results'; this.stateT = 0; this.finished = true; this.results.reset();
    this.audio.stopSong(); this.audio.sfx('win');
    if (!this.result) this.finishResult();
    this.hooks.runEnd?.({ game: 'mattoni', score: this.score });
    if (!this.wk) this.hooks.setGrade(0);
  }

  // ---------- aggiornamento ----------
  update(dt) {
    this.t += dt;
    const connected = this.hooks.connected(); const st = this.hooks.stats();
    const ftp = this.ftp;
    // senza rullo la demo simula 0,8 × FTP con scatti (e un po' meno nel recupero)
    const demoP = !connected && this.wk && this.seg ? targetW(this.seg, ftp, 0, 0, this.el) : !connected ? ftp * (this.state === 'play' && this.seg?.kind === 'rest' ? 0.58 : 0.8) * (((this.t % 40) > 31 && this.seg?.kind !== 'rest') ? 1.6 : 1) : 0;
    this.power = connected ? st.power || 0 : demoP;
    this.cadence = connected ? st.cadence || 0 : 88;
    this.pw += (this.power - this.pw) * Math.min(1, dt / 0.9);
    if (this.audio.song) this.audio.setTempo(this.audio.song.bpm * clamp((this.cadence || 85) / 88, 0.85, 1.25));
    this.msgs.update(dt);
    if (this.state === 'loading') { this.menu.update(dt, { connected: false, power: 0 }); }
    if (this.state === 'loading' || this.state === 'error') return;
    this.fx.update(dt); this.confetti.update(dt);
    this.stateT += dt;
    if (this.state === 'menu') { this.menu.update(dt, { connected, power: st.power || 0 }); this.setTime(['morning', 'golden', 'dusk'][this.lvlIdx] || 'golden'); this.view(dt); return; }
    if (this.state === 'results') { this.results.update(dt); this.view(dt); return; }

    // con un allenamento il tempo è quello dell'allenamento (anche se in pausa); finito lui, finisce la partita
    if (this.wk) { this.el = this.wc.tick(dt); if (this.wc.ended) return this.finish(); }
    // pausa: chi smette di pedalare non perde, il tempo si ferma
    if (connected) {
      if (this.power < 12) { this.pauseT += dt; if (this.pauseT > 2.5 && !this.paused) { this.paused = true; this.audio.sfx('beep'); } } else if (this.power > 25) { this.pauseT = 0; this.paused = false; }
    }
    if (this.paused) { this.view(0); return; }

    if (!this.wk) this.el += dt;
    let seg = segAt(this.plan, this.el);
    const idx = this.plan.segs.indexOf(seg);
    if (idx !== this.segIdx) { this.enterSeg(idx); seg = this.seg; }
    if (this.el >= this.total) return this.finish();
    const tgt = targetW(seg, ftp, this.level.k, this.adapt.value, this.el);
    seg.inT += dt; this.tgtW = tgt;
    if (this.wk) this.band.add(dt, this.pw, tgt, this.el - seg.stepStart);
    this.inTarget = this.pw >= 0.92 * tgt;
    const rush = seg.kind === 'effort' || seg.kind === 'sprint';
    if (rush && seg.inT > (seg.kind === 'sprint' ? 2 : 4) && this.inTarget) seg.okT += dt;
    // watt nella zona: il turbo si carica, fuori scende piano; in un rush con il bersaglio tenuto la borraccia è infuocata
    this.charge = clamp(this.charge + (this.inTarget ? dt / 7 : -dt / 14), 0, 1);
    const hot = rush && this.inTarget;
    if (hot && !this.hot) { this.audio.sfx('overdrive'); this.prog('overdrives', 1, 15); this.ev('hot'); }
    this.hot = hot; this.sprinting = hot;
    const g = this.boss && !this.boss.dead ? 4 : seg.kind === 'rest' || seg.kind === 'cool' ? 0 : seg.kind === 'warm' ? 1 : seg.kind === 'pace' ? 2 : 3;
    if (!this.wk && g !== this.sentGrade) { this.sentGrade = g; this.hooks.setGrade(g); }

    if (this.held) { this.heldT += dt; if (this.heldT > 0.12) this.tx = clamp(this.tx - this.held * MOVE * dt, -this.reach(), this.reach()); }
    this.x = lerp(this.x, this.tx, 1 - Math.exp(-dt * 12));
    this.hurtT = Math.max(0, this.hurtT - dt); this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dt);
    this.stepRows(dt); this.stepBoss(dt); this.stepBall(dt); this.stepGels(dt);
    if (this.pop) { this.pop.t -= dt; this.pop.age += dt; if (this.pop.t <= 0) this.pop = null; }
        this.view(dt);
  }

  // ---------- vista: attori, camera ----------
  get stripW() { return 3.4 + (this.charge >= 0.5 ? 0.6 : 0); }

  view(dt) {
    if (!this.player) return;
    const T = this.t; const play = this.state === 'play';
    this.shake.update(dt); this.padPulse = Math.max(0, this.padPulse - dt * 7);
    // la bici
    this.player.root.position.set(this.x, 0, PZ - 1.9); this.player.root.rotation.set(0, clamp(-(this.tx - this.x) * 0.06, -0.3, 0.3), 0);
    this.player.lean.rotation.z = clamp((this.tx - this.x) * 0.05, -0.25, 0.25);
    this.player.pose(dt, play && !this.paused ? this.cadence || 80 : 40, play ? 7 : 0, { stand: this.hot ? 1 : 0 });
    this.player.root.visible = !(this.hurtT > 0.4 && Math.floor(this.hurtT * 14) % 2);
    // striscia della bici
    const sw = this.stripW; this.stripS = lerp(this.stripS ?? sw, sw, Math.min(1, dt * 8));
    this.strip.position.set(this.x, 0.04, PZ + 0.15); this.strip.scale.set(this.stripS, 1 + this.padPulse * 0.35, 1);
    this.stripMat.color.set(this.charge >= 0.5 ? '#ffb84d' : '#ffffff');
    // borraccia
    const b = this.ballS; const R = this.ball.root;
    if (b && this.ballAlive) {
      const hot = this.isHot(b); R.visible = true; this.ball.blob.visible = true;
      const bornK = 0.25 + 0.75 * (1 - (1 - b.born) ** 2);
      R.position.set(b.x, 1.0, b.z); R.scale.setScalar(bornK);
      this.ball.spin.rotation.z += (b.vx * 0.3 + 6) * dt;
      this.ball.fire.visible = hot; this.ball.fire.material.opacity = hot ? 0.55 + Math.sin(T * 30) * 0.1 : 0; this.ball.fire.scale.setScalar(3.1 + Math.sin(T * 24) * 0.25);
      this.ball.glow.material.color.set(hot ? '#ff9f43' : '#d9ff3d');
      this.ball.blob.position.set(b.x, 0.05, b.z);
      if (!b.stuck && dt > 0) this.fx.spawn(b.x - b.vx * 0.02, 1.0, b.z - b.vz * 0.02, hot ? { tex: 'fire', size: 1.6, life: 0.3, grow: 0.5 } : { tex: 'flash', size: 1.0, life: 0.22, grow: -0.4, color: '#d9ff3d' });
    } else { R.visible = false; this.ball.blob.visible = false; }
    this.drawTargets(T);
    this.drawBoss(dt);
    for (const g of this.gels) if (g.mesh.children[1]) g.mesh.children[1].material.opacity = 0.6 + Math.sin(T * 8) * 0.2;
    // sfondo animato
    for (const c of this.clouds.children) { c.position.x += c.userData.v * dt; if (c.position.x > 280) c.position.x = -280; }
    this.crowd?.tick(T); if (this.guyMat?.userData.time) this.guyMat.userData.time.value = T;
    this.windFlags();
    this.camera(dt);
  }

  drawTargets(T) {
    const m4 = this._m4 || (this._m4 = new THREE.Matrix4()); const q = this._q || (this._q = new THREE.Quaternion()); const up = new THREE.Vector3(0, 1, 0);
    const p = this._p || (this._p = new THREE.Vector3()); const sc = this._s || (this._s = new THREE.Vector3()); const col = this._c || (this._c = new THREE.Color());
    let n = 0; let nb = 0;
    const put = (x, z, s, rot, jersey, bagCol, bagS, lift, hop) => {
      if (n >= this.guyCap) return;
      q.setFromAxisAngle(up, rot); p.set(x, hop, z); sc.setScalar(s);
      this.guys.setMatrixAt(n, m4.compose(p, q, sc)); this.guys.setColorAt(n, col.set(jersey)); n++;
      p.set(x, (hop || 0) + lift, z); sc.setScalar(bagS);
      this.bags.setMatrixAt(nb, m4.compose(p, q, sc)); this.bags.setColorAt(nb, col.set(bagCol));
      this.bagTrim.setMatrixAt(nb, m4.compose(p, q, sc)); nb++;
    };
    for (const tg of this.targets) {
      if (!tg.alive) continue;
      const k = tg.grow; const ease = 1 - (1 - k) ** 3; const pulse = 1 + 0.18 * Math.sin(tg.pulse * Math.PI) * (tg.pulse > 0 ? 1 : 0);
      const s = this.scaleOf(tg) * ease * pulse;
      const hop = Math.max(0, Math.sin(T * 6 + tg.phase)) ** 2 * 0.18 * ease;
      const bagCol = tg.kind === 'gel' ? '#ffd34d' : tg.kind === 'crate' ? '#e63946' : tg.bag;
      put(tg.x, tg.z, s, Math.PI + Math.sin(T * 1.7 + tg.phase) * 0.12, tg.jersey, bagCol, s * (tg.kind === 'crate' ? 0.85 : tg.kind === 'gel' ? 0.72 : 0.62), 1.75 * s * 0.98, hop);
    }
    // musette consegnate: salgono verso la telecamera e svaniscono (rimpiccioliscono)
    for (const tg of this.targets) {
      if (tg.flyT <= 0) continue;
      const k = 1 - tg.flyT / 0.7; const s = GUY_S * 0.62 * (1 - 0.75 * k);
      if (nb >= this.guyCap) break;
      p.set(tg.flyX + k * 1.2 * (tg.flyX >= 0 ? -1 : 1), 3.4 + k * 2.4, tg.flyZ - k * 2.5); sc.setScalar(Math.max(0.01, s)); q.setFromAxisAngle(up, k * 9);
      this.bags.setMatrixAt(nb, m4.compose(p, q, sc)); this.bags.setColorAt(nb, col.set(tg.flyKind === 'gel' ? '#ffd34d' : '#fff4e0')); this.bagTrim.setMatrixAt(nb, m4.compose(p, q, sc)); nb++;
    }
    this.guys.count = n; this.bags.count = nb; this.bagTrim.count = nb;
    this.guys.instanceMatrix.needsUpdate = true; this.bags.instanceMatrix.needsUpdate = true; this.bagTrim.instanceMatrix.needsUpdate = true;
    if (this.guys.instanceColor) this.guys.instanceColor.needsUpdate = true; if (this.bags.instanceColor) this.bags.instanceColor.needsUpdate = true;
  }

  drawBoss(dt) {
    const bs = this.boss; if (!bs) return;
    const k = bs.grow; const ease = 1 - (1 - k) ** 3; const die = bs.dead ? Math.max(0.01, 1 - bs.deadT * 1.2) : bs.leave ? Math.max(0.01, 1 - (bs.leaveT || 0) / 0.6) : 1;
    this.carRoot.position.set(bs.x, Math.abs(Math.sin(bs.bob * 7)) * 0.04, bs.z);
    // l'auto va di fianco: muso nella direzione di marcia
    this.carRoot.rotation.y = lerp(this.carRoot.rotation.y, bs.dir > 0 ? 0 : Math.PI, Math.min(1, (dt || 0.03) * 6));
    this.carRoot.scale.setScalar(Math.max(0.01, ease * die * 1.0));
    for (const m of this.carMats) { if (m.emissive) { m.emissive.set(bs.flash > 0 ? '#ff5533' : '#000000'); m.emissiveIntensity = bs.flash; } }
  }

  windFlags() {
    const { fm, fq, fe, fp, fs } = this; const T = this.t;
    this.flags.forEach((f, i) => {
      fe.set(Math.sin(T * 3 + f.ph) * 0.35, 0, Math.sin(T * 2.2 + f.ph * 1.3) * 0.25); fq.setFromEuler(fe);
      this.flagMesh.setMatrixAt(i, fm.compose(fp.set(f.x, f.y, f.z), fq, fs));
    });
    this.flagMesh.instanceMatrix.needsUpdate = true;
  }

  // telecamera alta e vicina dietro la bici: il ciclista è grande, il campo riempie lo schermo
  camera(dt) {
    const cam = this.stage.camera; const aspect = this.stage.W / this.stage.H; const tall = aspect < 0.75;
    const target = this._tp || (this._tp = new THREE.Vector3());
    target.set(this.x * 0.4, tall ? 9.8 : 8.5, tall ? -7.6 : -9);
    if (!this.camInit) { this.camPos = target.clone(); this.camInit = true; }
    this.camPos.lerp(target, Math.min(1, (dt || 0.03) * 4));
    cam.position.copy(this.camPos);
    cam.lookAt(this.x * 0.3, 0.4, tall ? 7.9 : 8);
    const fov = (tall ? 62 : 48) + (this.hot ? 3 : 0); cam.fov += (fov - cam.fov) * Math.min(1, (dt || 0.03) * 3); cam.updateProjectionMatrix();
    this.shake.apply(cam);
    this.menuFrame(cam);
    const sd = this.sunDir || new THREE.Vector3(0.5, 0.75, -0.45);
    this.light.sun.position.set(sd.x * 60, sd.y * 60, TOP / 2 + sd.z * 60); this.light.sun.target.position.set(0, 0, TOP / 2);
  }

  // nel menu il ciclista sta nella fascia libera tra testo e tasto VIA (verticale: al centro della fascia; orizzontale: a destra della colonna)
  menuFrame(cam) {
    cam.clearViewOffset();
    if (this.state !== 'menu' || !this.menu.startTop) return;
    const W = this.stage.W; const H = this.stage.H; const land = W > H * 1.15;
    const p = this._mp || (this._mp = new THREE.Vector3()); p.set(this.x, 1.5, PZ - 1.9).project(cam);
    const sx = (p.x + 1) / 2 * W; const sy = (1 - p.y) / 2 * H;
    let tx; let ty;
    if (land) { const u = Math.min(uiScale(W, H), H / 600); const left = 24 + Math.min(W * 0.38, 440 * u) + 40; tx = (left + W) / 2; ty = H * 0.55; }
    else { tx = W / 2; ty = (this.menu.contentBottom + this.menu.startTop) / 2; }
    cam.setViewOffset(W, H, sx - tx, sy - ty, W, H);
  }

  // ---------- interfaccia ----------
  drawHud(dt) {
    const { ctx, W, H } = this.stage;
    ctx.clearRect(0, 0, W, H); hudView(ctx, W, H);
    if (this.state === 'loading') { ctx.fillStyle = '#0f0e0c'; ctx.fillRect(0, 0, W, H); this.menu.loadFrac = this.loadPct || 0; this.menu.draw(ctx, W, H, { connected: false }); return; }
    if (this.state === 'error') { hudText(ctx, t('ui.error', { error: this.error }), W / 2, H / 2, { size: 14, align: 'center', color: '#ff6b6b' }); return; }
    if (this.state === 'menu') { this.drawMenu(ctx, W, H, dt); return; }
    if (this.state === 'results') { this.drawResult(ctx, W, H); this.kitToasts(ctx, W, H, dt, 238, true); return; }
    const seg = this.seg; const pad = 12; const y0 = 84;
    // riga in alto: punteggio · zona n/N · vite
    ctx.fillStyle = 'rgba(8,10,26,.62)'; rrect(ctx, pad - 4, y0 - 22, W - 2 * pad + 8, 36, 10); ctx.fill();
    hudText(ctx, String(this.score), pad + 6, y0 + 5, { size: 26, maxW: 100 });
    const wn = seg.kind === 'warm' ? t('games.horde.seg.warm') : seg.kind === 'cool' ? t('games.horde.seg.cool') : t('games.mattoni.zoneOf', { n: seg.wave, m: this.plan.N });
    hudText(ctx, wn, W / 2, y0 + 3, { size: W < 400 ? 19 : 22, align: 'center', color: '#d9ff3d', maxW: W - 2 * (pad + 100) });
    for (let i = 0; i < MAX_LIVES; i++) hudText(ctx, i < this.lives ? '♥' : '♡', W - pad - 6 - (MAX_LIVES - 1 - i) * 17, y0 + 4, { size: 19, color: i < this.lives ? '#ff4d6d' : '#7a7a99', align: 'center' });
    // la richiesta del momento
    const col = SEG_COLOR[seg.kind]; const by = y0 + 22; const bh2 = 44;
    ctx.fillStyle = 'rgba(8,10,26,.72)'; rrect(ctx, pad - 4, by, W - 2 * pad + 8, bh2, 12); ctx.fill();
    ctx.fillStyle = col; rrect(ctx, pad - 4, by, 7, bh2, 3); ctx.fill();
    const tw = this.tgtW || targetW(seg, this.ftp, this.level.k, this.adapt.value, this.el);
    const left = Math.max(0, Math.ceil((this.wk ? seg.stepEnd : seg.t1) - this.el)); // con un allenamento: nome del passo e tempo che manca alla fine del passo
    hudText(ctx, this.wk ? (seg.label || t(`games.wk.seg.${seg.wkKind}`)) : t(`games.horde.seg.${seg.kind}`), pad + 12, by + 29, { size: 21, color: col, maxW: W * 0.34 });
    hudText(ctx, `${tw} W`, W / 2 + 8, by + 32, { size: 32, align: 'center', color: this.inTarget || ['rest', 'cool', 'warm'].includes(seg.kind) ? '#ffffff' : '#ffd34d', maxW: W * 0.34 });
    hudText(ctx, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, W - pad - 4, by + 29, { size: 21, align: 'right', color: '#e8e8f4', maxW: 70 });
    // barra del tratto, poi l'obiettivo dell'ondata (musette consegnate) e, se c'è, la vita dell'auto
    let y = by + bh2 + 4;
    const segK = this.wk ? clamp((seg.stepEnd - this.el) / (seg.stepEnd - seg.stepStart), 0, 1) : clamp((seg.t1 - this.el) / (seg.t1 - seg.t0), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; rrect(ctx, pad, y, W - 2 * pad, 6, 3); ctx.fill();
    ctx.fillStyle = col; rrect(ctx, pad, y, Math.max(6, (W - 2 * pad) * segK), 6, 3); ctx.fill();
    y += 12;
    if (seg.kind !== 'cool' && seg.kind !== 'warm') {
      const gk = clamp(this.waveGot / this.waveQuota, 0, 1); const gw = W - 2 * pad; const done = this.waveGot >= this.waveQuota;
      ctx.fillStyle = 'rgba(8,10,26,.72)'; rrect(ctx, pad, y, gw, 22, 8); ctx.fill();
      ctx.fillStyle = done ? '#2fb86a' : '#3a86ff'; rrect(ctx, pad, y, Math.max(8, gw * gk), 22, 8); ctx.fill();
      hudText(ctx, done ? t('games.mattoni.goalDone') : t('games.mattoni.goal', { a: Math.min(this.waveGot, this.waveQuota), b: this.waveQuota }), W / 2, y + 17, { size: 16, align: 'center', maxW: gw - 12 });
      y += 28;
    } else if (seg.kind === 'warm') {
      hudText(ctx, t('games.mattoni.goalWarm', { n: this.delivered }), W / 2, y + 16, { size: 16, align: 'center', font: 'text', maxW: W - 2 * pad }); y += 26;
    }
    const bs = this.boss;
    if (bs && !bs.dead) {
      const bw = W - 2 * pad;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; rrect(ctx, pad, y, bw, 20, 8); ctx.fill();
      ctx.fillStyle = '#ff3b3b'; rrect(ctx, pad, y, Math.max(8, bw * clamp(bs.hp / bs.maxHp, 0, 1)), 20, 8); ctx.fill();
      hudText(ctx, t('games.mattoni.car'), W / 2, y + 16, { size: 15, align: 'center' }); y += 26;
    }
    if (!this.hooks.connected()) hudText(ctx, t('games.common.demo'), W / 2, y + 12, { size: 13, align: 'center', color: '#ffd34d' });

    // in basso: potenza (numero grande + barra con il bersaglio) e turbo
    const bh = 20; const barY = H - 16 - bh; const bx = pad + 2; const bw2 = W - 2 * pad - 4;
    const gr = ctx.createLinearGradient(0, H - 108, 0, H); gr.addColorStop(0, 'rgba(6,8,22,0)'); gr.addColorStop(0.4, 'rgba(6,8,22,.55)'); gr.addColorStop(1, 'rgba(6,8,22,.85)');
    ctx.fillStyle = gr; ctx.fillRect(0, H - 108, W, 108);
    const pc = this.sprinting ? '#ff9f43' : this.inTarget ? '#d9ff3d' : '#ffffff';
    const numW = hudText(ctx, String(Math.round(this.power)), pad + 4, barY - 10, { size: 46, color: pc, maxW: 120 });
    hudText(ctx, 'W', pad + 8 + numW, barY - 10, { size: 20, color: '#e8e8f4' });
    // turbo: tre tacche, la moltiplicazione che stai guadagnando
    const tx0 = W - pad - 4; const tw3 = Math.min(150, W * 0.4);
    hudText(ctx, `${t('games.mattoni.turbo')} ×${this.mult()}`, tx0, barY - 34, { size: 17, align: 'right', color: this.charge >= 0.5 ? '#ff9f43' : '#e8e8f4', maxW: Math.max(90, W - numW - 70) });
    ctx.fillStyle = 'rgba(255,255,255,.2)'; rrect(ctx, tx0 - tw3, barY - 26, tw3, 9, 4); ctx.fill();
    ctx.fillStyle = this.charge >= 0.5 ? '#ff9f43' : '#4de3ff'; rrect(ctx, tx0 - tw3, barY - 26, Math.max(9, tw3 * this.charge), 9, 4); ctx.fill();
    ctx.fillStyle = 'rgba(8,10,26,.9)'; ctx.fillRect(tx0 - tw3 / 2 - 1, barY - 27, 2, 11);
    if (this.combo > 1) hudText(ctx, t('games.mattoni.combo', { n: this.combo }), tx0, barY - 52, { size: 15, align: 'right', color: this.combo > 4 ? '#4de3ff' : '#ffd34d', font: 'text', maxW: Math.max(90, W - numW - 70) });
    ctx.fillStyle = 'rgba(8,10,26,.75)'; rrect(ctx, bx, barY, bw2, bh, 8); ctx.fill();
    const maxW = Math.max(this.ftp * 1.7, tw * 1.25);
    ctx.fillStyle = pc; rrect(ctx, bx, barY, Math.max(8, bw2 * clamp(this.power / maxW, 0, 1)), bh, 8); ctx.fill();
    const t0 = bx + bw2 * clamp(0.92 * tw / maxW, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(t0, barY, Math.max(2, bx + bw2 * clamp(tw * 1.15 / maxW, 0, 1) - t0), bh);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw2 * clamp(tw / maxW, 0, 1) - 1, barY - 4, 3, bh + 8);

    this.msgs.draw(ctx, W, H, { u: W < 500 ? 0.9 : 1.1, y: H * 0.35 });
    // "+N" dei punti: sopra la bici, uno alla volta
    const p = this.pop;
    if (p) {
      const k = 1 - p.t / p.t0; const rp = this.stage.project(this.x, 4.4, PZ - 1.9);
      ctx.globalAlpha = clamp(p.t / p.t0 * 2.5, 0, 1);
      hudText(ctx, `+${p.sum}${p.mult ? ' ' + p.mult : ''}`, clamp(rp.x, 80, W - 80), clamp(rp.y, 300, H - 160) - k * 24, { size: 26 + Math.min(10, p.sum / 120), align: 'center', color: this.combo > 4 ? '#4de3ff' : '#ffd34d', maxW: 160 });
      ctx.globalAlpha = 1;
    }
    hurtVignette(ctx, W, H, (this.hurtFlash || 0) / HURT_FLASH_S);
    if (this.paused) {
      ctx.fillStyle = 'rgba(8,10,26,.72)'; ctx.fillRect(0, 0, W, H);
      hudText(ctx, t('games.horde.paused'), W / 2, H * 0.42, { size: 42, align: 'center', color: '#ffd34d' });
      paragraph(ctx, t('games.horde.pausedSub'), W / 2, H * 0.42 + 36, { size: 20, maxW: W - 40, color: '#f0f0f0' });
    }
    if (this.hooks.lost) trainerLostBanner(ctx, W, H, t);
    if (!['pace', 'effort', 'sprint'].includes(seg.kind)) this.hooks.progress?.drawToasts(ctx, W, dt, 238, true);
  }

  drawMenu(ctx, W, H, dt) {
    const connected = this.hooks.connected();
    this.menu.draw(ctx, W, H, { connected });
    this.kitToasts(ctx, W, H, dt, 48, false);
  }

  // i riquadri dei progressi: in orizzontale stanno a destra della colonna di testo del menu / risultati
  kitToasts(ctx, W, H, dt, y0, still) {
    const left = W > H * 1.15 ? 24 + Math.min(W * 0.38, 440 * Math.min(uiScale(W, H), H / 600)) + 40 : 0;
    ctx.save(); ctx.translate(left, 0); this.hooks.progress?.drawToasts(ctx, W - left, dt, y0, still); ctx.restore();
  }

  drawResult(ctx, W, H) {
    const r = this.result; const crit = [{ ok: true, label: t('games.mattoni.crit.finish') }];
    if (r.wk) { crit.length = 0; crit.push({ ok: true, label: t('games.wk.res.done') }, { ok: r.band >= 0.85, label: t('games.wk.res.band', { p: Math.round(r.band * 100) }) }, { ok: r.bossKilled >= r.bossTotal, label: t('games.mattoni.crit.cars') }); }
    else {
      crit.push({ ok: r.ratio >= 0.5, label: t('games.mattoni.crit.half') });
      crit.push({ ok: r.ratio >= 0.8, label: t('games.mattoni.crit.most') });
      crit.push({ ok: r.bossKilled >= r.bossTotal, label: t('games.mattoni.crit.cars') });
      crit.push({ ok: r.ko <= 3, label: t('games.mattoni.crit.flats') });
    }
    this.results.draw(ctx, W, H, {
      title: t('games.horde.res.title'), subtitle: `${t('games.mattoni.name')} · ${r.wk ? this.wk.name : t('games.menu.min', { n: this.total / 60 })} · ${t(`games.menu.${['easy', 'normal', 'hard'][this.lvlIdx]}`)}`,
      stars: r.stars, criteria: crit, score: r.score, best: r.prevBest ? String(r.prevBest) : null, newBest: r.newBest,
      lines: [t('games.horde.res.efforts', { a: r.done, b: r.total }), t('games.mattoni.res.cars', { a: r.bossKilled, b: r.bossTotal }) + ' · ' + t('games.mattoni.res.flats', { n: r.ko }), t('games.mattoni.res.bags', { n: r.delivered }) + ' · ' + t('games.mattoni.res.combo', { n: r.combo })],
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
