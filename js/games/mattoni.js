// MATTONI — rimbalzi in 3D: la bici fa da racchetta, la cadenza decide la velocità della palla.
// Tieni premuto + / − per spostarti. Lo sprint rende la palla infuocata (sfonda tutto).
// Grafica come Turbo Pedali (docs/giochi-stile.md): strada di tappa in prospettiva, blocchi = borracce, cartelli, balle di fieno e transenne
// (modelli Meshy), power-up = gel e maglie, esplosioni con particelle, scossa e breve rallentatore.
import * as THREE from 'three';
import { Effects, fxTexture } from './kit3d.js';
import { loadGLTF } from './kit/loader.js';
import { skyDome, styleLights, styleFog, toonMaterial, toonify, TIMES, PALETTE } from './kit/style.js';
import { Cyclist, loadMeshyTemplate, loadCyclistTemplate, makeKit, makeMeshyCrowdGeometry, CYCLIST_URL } from './kit/cyclist.js';
import { scatterModel, groundModel, crowdInstances } from './kit/env.js';
import { Shake, TimeScale, Confetti } from './kit/juice.js';
import { txt, panel, uiScale, powerColor, HUD } from './kit/hud.js';
import { clamp, pick } from './engine.js';
import { Base3D } from './base3d.js';
import { t } from '../i18n.js';

const A = 'assets/3d';
const HW = 8;               // metà larghezza del campo
const TOP = 26;             // fondo del campo
const PZ = 1.6;             // linea della racchetta
const MOVE = 15;            // m/s tenendo premuto
const HUES = [0, 28, -28, -62, 190, 150]; // arancione, giallo, rosso, rosa, azzurro, turchese // la borraccia arancione ruotata di tinta: una famiglia di colori
const TIMES_BY_LEVEL = ['golden', 'morning', 'dusk'];
// livelli: ogni carattere è un blocco (1 borraccia, 2 cartello di tappa, 3 balla di fieno, # transenna indistruttibile, . = vuoto)
// forme: salita, ruota, maglia, cuore, muro di fieno
const LEVELS = [
  ['....11....', '...1111...', '..111111..', '.11111111.', '1111111111'],
  ['..222222..', '.21111112.', '211.##.112', '211.##.112', '.21111112.', '..222222..'],
  ['33......33', '3311111133', '.11222211.', '..122221..', '..122221..', '..111111..'],
  ['.222..222.', '2111221112', '2111111112', '.21111112.', '..211112..', '...2112...', '....22....'],
  ['3333333333', '1#1#11#1#1', '2222222222', '1111111111', '.2.2.2.2.2'],
];
const POWERS = [
  { id: 'wide', text: 'games.mattoni.pu.wide', color: '#4de3ff', shape: 'gel' },
  { id: 'multi', text: 'games.mattoni.pu.multi', color: '#c77dff', shape: 'gel' },
  { id: 'slow', text: 'games.mattoni.pu.slow', color: '#ffd166', shape: 'gel' },
  { id: 'life', text: 'games.shooter.plusLife', color: '#ff4d6d', shape: 'jersey' },
];

// ---------- texture disegnate al volo ----------
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
function canvasTex(w, h, draw, { repeat = false, aniso = 4 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// strada di tappa: asfalto, cordoli rosso-bianchi, linea di mezzeria, linea di partenza e traguardo a scacchi
const ROAD_W = HW * 2 + 3.2; const ROAD_Z0 = -7; const ROAD_Z1 = TOP + 3; const ROAD_L = ROAD_Z1 - ROAD_Z0;
function roadTexture() {
  const W = 512; const H = Math.round(W * ROAD_L / ROAD_W); const rand = rng(9);
  return canvasTex(W, H, (g) => {
    const kx = W / ROAD_W; const zy = (z) => (z - ROAD_Z0) / ROAD_L * H;
    g.fillStyle = '#5b5a63'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; g.fillRect(rand() * W, rand() * H, 2 + rand() * 3, 2 + rand() * 3); }
    const X = (x) => (x + ROAD_W / 2) * kx;
    // fasce di corsia più chiare
    g.fillStyle = 'rgba(255,255,255,.035)'; for (let z = ROAD_Z0; z < ROAD_Z1; z += 6) g.fillRect(X(-HW), zy(z), 2 * HW * kx, zy(z + 3) - zy(z));
    // cordoli
    const kerb = 0.55;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : X(HW + 0.45); const w = side < 0 ? X(-HW - 0.45) : W - X(HW + 0.45);
      for (let z = ROAD_Z0, i = 0; z < ROAD_Z1; z += 1, i++) { g.fillStyle = i % 2 ? '#f4f0e6' : '#e0364a'; g.fillRect(x0, zy(z), w, zy(z + 1) - zy(z) + 1); }
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(side < 0 ? X(-HW - 0.45) - 3 : X(HW + 0.45), 0, 3, H);
    }
    // bordi bianchi e mezzeria tratteggiata
    g.fillStyle = '#f4f0e6'; g.fillRect(X(-HW) - 2, 0, 5, H); g.fillRect(X(HW) - 2, 0, 5, H);
    g.fillStyle = 'rgba(244,240,230,.8)'; for (let z = ROAD_Z0 + 0.5; z < ROAD_Z1; z += 3) g.fillRect(X(0) - 3, zy(z), 6, zy(z + 1.6) - zy(z));
    // linea di partenza (sotto la bici) e traguardo a scacchi in fondo
    const chk = (zA, zB, n) => { const cw = 2 * HW * kx / n; const rows = 2; const ch = (zy(zB) - zy(zA)) / rows; for (let r = 0; r < rows; r++) for (let c = 0; c < n; c++) { g.fillStyle = (r + c) % 2 ? '#15141b' : '#f4f0e6'; g.fillRect(X(-HW) + c * cw, zy(zA) + r * ch, cw + 1, ch + 1); } };
    chk(TOP + 0.9, TOP + 1.7, 32);
    g.fillStyle = 'rgba(217,255,61,.9)'; g.fillRect(X(-HW), zy(PZ - 1.5), 2 * HW * kx, 6);
    // frecce di salita
    g.fillStyle = 'rgba(244,240,230,.28)';
    for (const z of [8, 13]) for (const x of [-4, 4]) { g.beginPath(); g.moveTo(X(x), zy(z + 1.6)); g.lineTo(X(x - 0.9), zy(z)); g.lineTo(X(x - 0.3), zy(z)); g.lineTo(X(x - 0.3), zy(z - 1)); g.lineTo(X(x + 0.3), zy(z - 1)); g.lineTo(X(x + 0.3), zy(z)); g.lineTo(X(x + 0.9), zy(z)); g.closePath(); g.fill(); }
  });
}
// prato a strisce di falciatura (si ripete)
function grassTexture(a = '#8cc055', b = '#7bb04a') {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.fillRect(0, 0, w, h / 2);
    const r = rng(2); for (let i = 0; i < 160; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(30,70,20,.09)'; g.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: true });
}
// palla: bianca con la fascia lime
function ballTexture() {
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#fff4e0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d9ff3d'; g.fillRect(0, h * 0.4, w, h * 0.2);
    g.fillStyle = '#15141b'; for (let i = 0; i < 4; i++) g.fillRect(i * w / 4 + w / 8 - 3, 0, 6, h);
  });
}

// ---------- oggetti procedurali ----------
// gel energetico: bustina schiacciata con strappo, fascia colore e striscia bianca (nessun logo)
function gelObject(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 5, 12), toonMaterial({ color }));
  body.scale.set(1, 1, 0.42); g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.2, 14, 1, true), toonMaterial({ color: '#f4f0e6' }));
  band.scale.set(1, 1, 0.44); band.position.y = 0.02; g.add(band);
  const tear = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 4), toonMaterial({ color: '#f4f0e6' }));
  tear.scale.set(1, 1, 0.3); tear.position.y = 0.5; tear.rotation.y = Math.PI / 4; g.add(tear);
  g.rotation.z = Math.PI / 2; const w = new THREE.Group(); w.add(g); w.scale.setScalar(1.5); return w;
}
// maglia da ciclista: busto, maniche, cerniera, banda
function jerseyObject(color) {
  const w = new THREE.Group(); const m = toonMaterial({ color });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.2), m); w.add(torso);
  for (const s of [-1, 1]) {
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.2), m); sl.position.set(s * 0.4, 0.24, 0); sl.rotation.z = -s * 0.55; w.add(sl);
  }
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.21), toonMaterial({ color: '#f4f0e6' })); band.position.y = -0.04; w.add(band);
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.215), toonMaterial({ color: '#15141b' })); zip.position.y = 0.04; w.add(zip);
  w.scale.setScalar(1.6); return w;
}
// ruota della racchetta: copertone scuro, cerchio lime, raggi
function wheelObject() {
  const w = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 8, 22), toonMaterial({ color: '#202028' }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 22), toonMaterial({ color: PALETTE.lime, emissive: '#6d8a00' }));
  w.add(tire, rim);
  const spoke = new THREE.BoxGeometry(0.03, 0.8, 0.03); const sm = toonMaterial({ color: '#e8e6dc' });
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(spoke, sm); s.rotation.z = i * Math.PI / 4; w.add(s); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 10), sm); hub.rotation.x = Math.PI / 2; w.add(hub);
  return w;
}
// bandierine triangolari (una sola mesh istanziata), animate dal codice
function buntingMesh(list) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.26, 0, 0, 0.26, 0, 0, 0, -0.55, 0], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), list.length);
  const c = new THREE.Color(); list.forEach((f, i) => mesh.setColorAt(i, c.set(f.color)));
  mesh.frustumCulled = false; return mesh;
}

// copia a terra di un modello Meshy, alta h metri, con materiali toon
function prop(gltf, h) {
  groundModel(gltf);
  const box = new THREE.Box3().setFromObject(gltf.scene); const hh = box.max.y - box.min.y;
  const root = gltf.scene.clone(true); toonify(root);
  const g = new THREE.Group(); g.add(root); g.scale.setScalar(h / hh); g.userData.h = hh;
  return g;
}
// stessa texture con la tinta ruotata (il filtro del canvas manca solo in alcuni browser vecchi: allora resta arancione)
const hueCache = new Map();
function hueMaterial(base, deg) {
  const key = base.uuid + deg; if (hueCache.has(key)) return hueCache.get(key);
  let mat = base;
  try {
    const img = base.map?.image;
    if (deg && img) {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d');
      if ('filter' in g) {
        g.filter = `hue-rotate(${deg}deg)`; g.drawImage(img, 0, 0);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = base.map.flipY; tex.anisotropy = 4;
        mat = toonMaterial({ map: tex });
      }
    }
  } catch { /* resta il colore originale */ }
  hueCache.set(key, mat); return mat;
}

export class Mattoni extends Base3D {
  constructor(hud, hooks, audio) {
    super(hud, hooks, audio, {
      key: 'mattoni', title: 'games.mattoni.hud.title', tagline: 'games.mattoni.hud.tagline', song: 'desert',
      rules: ['games.mattoni.rule1', 'games.mattoni.rule2', 'games.mattoni.rule3', 'games.mattoni.rule4', 'games.mattoni.rule5'],
    });
  }

  assets() {
    return {
      bottle: `${A}/meshy/bottle.glb`, sign: `${A}/meshy/stage_sign.glb`, hay: `${A}/meshy/hay_bale.glb`, barrier: `${A}/meshy/barrier.glb`,
      arch: `${A}/meshy/finish_arch.glb`, cypress: `${A}/meshy/cypress.glb`, tent: `${A}/meshy/feed_tent.glb`,
    };
  }

  // ciclista Meshy (se non si carica: Quaternius) e pubblico (facoltativo)
  async preload() {
    this.tpl = await loadMeshyTemplate().catch((err) => { console.warn('Meshy cyclist:', err); return loadCyclistTemplate(CYCLIST_URL); });
    this.crowdGeo = await makeMeshyCrowdGeometry().catch(() => null);
  }

  build() {
    const { scene } = this.stage; const q = this.stage.quality;
    this.scene = scene; this.shake = new Shake(); this.ts = new TimeScale();
    this.stage.camera.far = 500; this.stage.camera.updateProjectionMatrix();
    // cielo (uno per ora del giorno, cambia a ogni livello), luci e nebbia
    this.domes = {};
    for (const k of Object.keys(TIMES)) { const d = skyDome(k); d.visible = false; scene.add(d); this.domes[k] = d; }
    this.fog = styleFog(scene, 'golden', 70, 230);
    this.light = styleLights(scene, 'golden', { shadows: q.cfg.shadows, mapSize: q.cfg.shadowMap, extent: 30 });
    // terreno: prato a strisce e strada di tappa
    const gt = grassTexture(); gt.repeat.set(70, 70);
    this.grassMat = toonMaterial({ map: gt });
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), this.grassMat);
    grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.02, TOP / 2); grass.receiveShadow = true; scene.add(grass);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_L), toonMaterial({ map: roadTexture() }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, (ROAD_Z0 + ROAD_Z1) / 2); road.receiveShadow = true; scene.add(road);
    this.buildScenery();
    // palla, ombra, racchetta (due ruote e un assale)
    this.ballGeo = new THREE.SphereGeometry(0.34, 18, 14);
    this.ballMat = toonMaterial({ map: ballTexture(), emissive: '#ffffff', emissiveIntensity: 0.12 });
    this.fireMat = toonMaterial({ color: '#ff9f43', emissive: '#ff5a1a', emissiveIntensity: 1.1 });
    this.blobGeo = new THREE.CircleGeometry(0.42, 14); this.blobGeo.rotateX(-Math.PI / 2);
    this.blobMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false });
    this.glowTex = fxTexture('light_01');
    this.paddle = new THREE.Group(); scene.add(this.paddle);
    this.bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.24, 0.5), toonMaterial({ color: PALETTE.lime, emissive: '#5f7a00', emissiveIntensity: 0.7 }));
    this.bar.position.y = 0.46; this.bar.castShadow = true; this.paddle.add(this.bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.1), toonMaterial({ color: '#15141b' })); stripe.position.set(0, 0.6, 0.12); this.paddle.add(stripe); this.stripe = stripe;
    this.wheels = [-1, 1].map(() => { const w = wheelObject(); w.position.y = 0.52; w.traverse((o) => { if (o.isMesh) o.castShadow = true; }); this.paddle.add(w); return w; });
    this.fx = new Effects(scene, 150);
    this.confetti = new Confetti(scene, 160);
    this.dying = []; this.caps = []; this.balls = []; this.bricks = [];
    this.stage.onQuality = (cfg) => this.applyQuality(cfg);
    this.applyQuality(q.cfg);
    this.setTime('golden');
  }

  applyQuality(cfg) {
    if (this.stage.bloom) { this.stage.bloom.threshold = 0.9; this.stage.bloom.strength = 0.5; this.stage.bloom.radius = 0.4; }
    if (this.stage.composer && this.scene) this.stage.composer.passes[0].scene = this.scene;
    for (const i of this.inst || []) { i.setDensity(i.isCrowd ? cfg.crowd : cfg.density); i.cull(0, 0, 0, 0, 1e4); }
    if (this.light) this.light.sun.castShadow = cfg.shadows;
    this.player?.setShadows(cfg.shadows);
    this.shadowsOn = cfg.shadows;
  }

  // ora del giorno del livello: cielo, luci, nebbia
  setTime(name) {
    const T = TIMES[name]; if (!T || this.timeName === name) return; this.timeName = name;
    for (const [k, d] of Object.entries(this.domes)) d.visible = k === name;
    const { hemi, sun } = this.light;
    hemi.color.set(T.hemiSky); hemi.groundColor.set(T.hemiGround); hemi.intensity = T.hemiI;
    sun.color.set(T.sun); sun.intensity = T.sunI; this.fog.color.set(T.fog);
    this.sunDir = new THREE.Vector3(...T.sunDir).normalize();
    this.grassMat.color.set(name === 'dusk' ? '#c9b6a0' : name === 'morning' ? '#e6f4d8' : '#ffffff');
  }

  // ---------- paesaggio ----------
  buildScenery() {
    const { scene } = this.stage; const m = this.m; const rand = rng(4); this.inst = [];
    const at = (x, z, h, rot = 0, always = false) => ({ x, y: 0, z, rot, h, always });
    const add = (gltf, list, { kind = 'house', lodDist = 80, shadows = false } = {}) => {
      groundModel(gltf); const inst = scatterModel(scene, gltf, list, { kind, lodDist, shadows }); this.inst.push(inst); inst.cull(0, 0, 0, 0, 1e4); return inst;
    };
    // transenne lungo i lati e in fondo
    const bh = 0.95; const bw = 0.94 / 0.48 * bh; const bar = [];
    for (const side of [-1, 1]) for (let z = ROAD_Z0 + 2; z < TOP + 1.2; z += bw * 0.98) bar.push(at(side * (HW + 0.55), z, bh, Math.PI / 2, true));
    for (let x = -HW + bw / 2; x < HW; x += bw * 0.98) bar.push(at(x, TOP + 0.4, bh, 0, true));
    add(m.barrier, bar, { lodDist: 45 });
    // arco del traguardo che chiude la strada, tenda del ristoro, balle di fieno
    add(m.arch, [at(0, TOP + 28, 17, 0, true)], { lodDist: 400 });
    add(m.tent, [at(-HW - 7, 9, 5, Math.PI / 2, true), at(HW + 7.5, 17, 5, -Math.PI / 2, true)], { lodDist: 60 });
    const hay = []; for (let i = 0; i < 10; i++) hay.push(at((i % 2 ? 1 : -1) * (HW + 3 + rand() * 6), -2 + i * 3 + rand() * 2, 1.4, rand() * 6));
    add(m.hay, hay, { lodDist: 40 });
    // cipressi a file ai lati e sullo sfondo
    const cyp = [];
    for (const side of [-1, 1]) for (let z = -6; z < TOP + 60; z += 5.5 + rand() * 1.6) cyp.push(at(side * (HW + 3.8 + rand() * 1.6), z, 7 + rand() * 2.6, rand() * 6));
    for (let i = 0; i < 26; i++) cyp.push(at((rand() - 0.5) * 120, TOP + 14 + rand() * 60, 7 + rand() * 3, rand() * 6));
    add(m.cypress, cyp, { kind: 'tree', lodDist: 38 });
    // pubblico oltre le transenne
    if (this.crowdGeo) {
      const cols = PALETTE.jerseys; const list = [];
      for (const side of [-1, 1]) for (let z = -3; z < TOP + 0.5; z += 2.8 + rand() * 1.0) list.push({ x: side * (HW + 1.5 + rand() * 0.9), y: 0, z, rot: side < 0 ? Math.PI / 2 : -Math.PI / 2, scale: 0.95 + rand() * 0.15, color: cols[Math.floor(rand() * cols.length)] });
      for (let x = -HW + 1; x < HW; x += 3 + rand() * 1.0) list.push({ x, y: 0, z: TOP + 1.7 + rand() * 0.5, rot: Math.PI, scale: 0.95 + rand() * 0.15, color: cols[Math.floor(rand() * cols.length)] });
      this.crowd = crowdInstances(scene, this.crowdGeo, list, { shadows: false }); this.crowd.isCrowd = true; this.inst.push(this.crowd);
    }
    // colline e montagne lontane (le copre la nebbia)
    const hillMat = toonMaterial({ color: '#7fae58' }); const rockMat = toonMaterial({ color: '#b3a6b8' });
    for (let i = 0; i < 9; i++) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
      const s = 40 + rand() * 40; hill.scale.set(s, 8 + rand() * 12, s * 0.8); hill.position.set(-190 + i * 48 + rand() * 20, 0, TOP + 120 + rand() * 40); scene.add(hill);
    }
    for (let i = 0; i < 6; i++) {
      const mt = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 5), rockMat); const s = 40 + rand() * 30;
      mt.scale.set(s, 60 + rand() * 50, s); mt.position.set(-150 + i * 62 + rand() * 20, 25, TOP + 200 + rand() * 30); mt.rotation.y = rand() * 3; scene.add(mt);
    }
    // nuvole che scorrono
    this.clouds = new THREE.Group(); scene.add(this.clouds);
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('smoke_04'), color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
      const s = 55 + rand() * 50; sp.scale.set(s * 1.7, s * 0.7, 1); sp.position.set(-220 + i * 55, 70 + rand() * 50, TOP + 230 + rand() * 60); sp.userData.v = 1.5 + rand() * 2.5; this.clouds.add(sp);
    }
    // bandierine appese lungo i lati e in fondo
    const flags = []; const cols = PALETTE.jerseys;
    const rope = (x0, z0, x1, z1, n, y) => { for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; flags.push({ x: x0 + (x1 - x0) * k, z: z0 + (z1 - z0) * k, y: y - Math.sin(Math.PI * (((i % 8) + 0.5) / 8)) * 0.5, color: cols[(i * 3) % cols.length], ph: i * 0.7 }); } };
    for (const side of [-1, 1]) rope(side * (HW + 0.9), -5, side * (HW + 0.9), TOP, 34, 3.4);
    rope(-HW - 0.9, TOP + 0.4, HW + 0.9, TOP + 0.4, 28, 3.4);
    this.flags = flags; this.flagMesh = buntingMesh(flags); scene.add(this.flagMesh);
    this.fm = new THREE.Matrix4(); this.fq = new THREE.Quaternion(); this.fe = new THREE.Euler(); this.fp = new THREE.Vector3(); this.fs = new THREE.Vector3(1, 1, 1);
  }

  // ---------- partita ----------
  reset() {
    const { scene } = this.stage;
    for (const b of this.bricks || []) scene.remove(b.mesh);
    for (const b of this.dying || []) scene.remove(b.mesh);
    for (const b of this.balls || []) { scene.remove(b.mesh); scene.remove(b.blob); scene.remove(b.glow); }
    for (const c of this.caps || []) scene.remove(c.mesh);
    if (this.player) scene.remove(this.player.root);
    this.player = new Cyclist(this.tpl, makeKit(PALETTE.lime, 0), { shadows: this.shadowsOn });
    this.player.root.scale.setScalar(0.9); this.scene.add(this.player.root);
    this.px = 0; this.pw = 3.2; this.wideT = 0; this.slowT = 0; this.lives = 3; this.level = 0; this.combo = 0; this.score = 0; this.sprintT = 0;
    this.dying = []; this.balls = []; this.caps = []; this.bricks = []; this.wheelRot = 0; this.padPulse = 0;
    this.loadLevel(0);
  }

  // un blocco: modello Meshy, centrato sulla cella
  makeBrick(ch, r, c, extra) {
    const solid = ch === '#'; const kind = solid ? 'barrier' : ch === '1' ? 'bottle' : ch === '2' ? 'sign' : 'hay';
    const hp = solid ? Infinity : Number(ch) + extra;
    let inner;
    if (kind === 'bottle') { // borraccia sdraiata e un po' tozza, tinta diversa per ogni blocco
      const b = prop(this.m.bottle, 1.25); b.scale.x *= 2.3; b.scale.z *= 2.3; b.rotation.z = Math.PI / 2; b.position.set(0.625, 0.37, 0);
      const hue = HUES[(r + c) % HUES.length];
      b.traverse((o) => { if (o.isMesh) o.material = hueMaterial(o.material, hue); });
      inner = b;
    } else if (kind === 'sign') { inner = prop(this.m.sign, 1.3); inner.rotation.y = Math.PI; }
    else if (kind === 'hay') { inner = prop(this.m.hay, 0.95); inner.rotation.y = Math.PI / 2; }
    else { inner = prop(this.m.barrier, 1.0); inner.rotation.y = Math.PI; }
    inner.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const x = -HW + 0.8 + c * 1.6; const z = TOP - 2.5 - r * 1.1;
    const mesh = new THREE.Group(); mesh.add(inner); mesh.position.set(x, 0, z);
    return { mesh, x, z, hp, solid, kind, pulse: 0, tilt: (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.2) };
  }

  loadLevel(n) {
    const { scene } = this.stage;
    for (const b of this.bricks) scene.remove(b.mesh);
    this.bricks = [];
    const rows = LEVELS[n % LEVELS.length];
    const extra = Math.floor(n / LEVELS.length); // dopo l'ultimo livello si ricomincia, più duri
    rows.forEach((row, r) => [...row.padEnd(10, '.')].forEach((ch, c) => {
      if (ch === '.') return;
      const b = this.makeBrick(ch, r, c, extra); scene.add(b.mesh); this.bricks.push(b);
    }));
    for (const b of this.balls) { scene.remove(b.mesh); scene.remove(b.blob); scene.remove(b.glow); }
    this.balls = []; this.serve();
    this.setTime(TIMES_BY_LEVEL[n % TIMES_BY_LEVEL.length]);
    this.hooks.setGrade?.(clamp(1 + (n % 4), 0, 5));
  }

  serve() { this.addBall(this.px, PZ + 0.8, 0, 0, true); }

  addBall(x, z, vx, vz, stuck = false) {
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat); mesh.castShadow = true;
    mesh.position.set(x, 0.5, z); this.stage.scene.add(mesh);
    const blob = new THREE.Mesh(this.blobGeo, this.blobMat); blob.position.set(x, 0.04, z); blob.renderOrder = 1; this.stage.scene.add(blob);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#d9ff3d', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(2.2); this.stage.scene.add(glow);
    this.balls.push({ mesh, blob, glow, x, z, vx, vz, stuck });
  }

  onBegin() { this.say(t('games.mattoni.level', { n: this.level + 1 }), '#d9ff3d', 1.6, true); this.say(t('games.mattoni.launch'), '#ffffff', 2); }

  press(dir) {
    const stuck = this.balls.find((b) => b.stuck);
    if (stuck) { stuck.stuck = false; stuck.vx = (Math.random() - 0.5) * 4; stuck.vz = 10; this.audio.sfx('jump'); return; }
    this.px = clamp(this.px - dir * 1.4, -HW + this.pw / 2, HW - this.pw / 2);
  }

  speed() { return 11 * clamp((this.cadence || 85) / 85, 0.75, 1.4) * (this.slowT > 0 ? 0.7 : 1) * (1 + this.level * 0.04); }

  step(realDt) {
    const dt = this.ts.step(realDt); // hit-stop e rallentatore
    if (dt <= 0) return;
    this.px = clamp(this.px - this.steer(dt, MOVE), -HW + this.pw / 2, HW - this.pw / 2);
    this.wideT = Math.max(0, this.wideT - dt); this.slowT = Math.max(0, this.slowT - dt);
    this.pw += ((this.wideT > 0 ? 5 : 3.2) - this.pw) * Math.min(1, dt * 6);
    const fire = this.sprinting; if (fire) this.sprintT += dt;
    const sp = this.speed();
    for (const b of this.balls) {
      if (b.stuck) { b.x = this.px; b.z = PZ + 0.8; continue; }
      // velocità costante (si adegua alla cadenza)
      const v = Math.hypot(b.vx, b.vz) || 1; b.vx *= sp / v; b.vz *= sp / v;
      const steps = 3;
      for (let k = 0; k < steps; k++) {
        b.x += (b.vx * dt) / steps; b.z += (b.vz * dt) / steps;
        if (b.x < -HW + 0.3) { b.x = -HW + 0.3; b.vx = Math.abs(b.vx); this.wall(b); }
        if (b.x > HW - 0.3) { b.x = HW - 0.3; b.vx = -Math.abs(b.vx); this.wall(b); }
        if (b.z > TOP - 0.3) { b.z = TOP - 0.3; b.vz = -Math.abs(b.vz); this.wall(b); }
        // racchetta: l'angolo dipende da dove colpisci
        if (b.vz < 0 && b.z < PZ + 0.55 && b.z > PZ - 0.4 && Math.abs(b.x - this.px) < this.pw / 2 + 0.3) {
          const off = clamp((b.x - this.px) / (this.pw / 2), -1, 1);
          const a = off * 1.05; b.vx = Math.sin(a) * sp; b.vz = Math.cos(a) * sp; b.z = PZ + 0.55;
          this.combo = 0; this.audio.sfx('land'); this.padPulse = 1; this.shake.add(0.06);
          this.fx.spawn(b.x, 0.6, b.z, { tex: 'spark', size: 1.1, life: 0.2, color: '#d9ff3d' });
          this.fx.spawn(b.x, 0.5, b.z, { tex: 'flash', size: 1.6, life: 0.14, grow: 0.8, color: '#d9ff3d' });
        }
        for (const br of this.bricks) {
          if (br.dead || Math.abs(b.x - br.x) > 1.05 || Math.abs(b.z - br.z) > 0.72) continue;
          if (!(fire && !br.solid)) {
            // rimbalza sul lato più vicino
            const dx = (b.x - br.x) / 1.05; const dz = (b.z - br.z) / 0.72;
            if (Math.abs(dx) > Math.abs(dz)) b.vx = Math.sign(dx) * Math.abs(b.vx); else b.vz = Math.sign(dz) * Math.abs(b.vz);
          }
          this.hitBrick(br, fire);
          if (!fire) break;
        }
      }
      if (b.z < -1.5) b.lost = true;
    }
    for (const b of this.balls.filter((x) => x.lost)) { this.stage.scene.remove(b.mesh); this.stage.scene.remove(b.blob); this.stage.scene.remove(b.glow); }
    this.balls = this.balls.filter((b) => !b.lost);
    if (!this.balls.length) {
      this.lives--; this.audio.sfx('hurt'); this.combo = 0; this.shake.add(0.5); this.ts.hitStop(0.06);
      this.fx.explode(this.px, 0.8, PZ - 0.5, 0.8);
      if (navigator.vibrate) navigator.vibrate(100);
      if (this.lives <= 0) return this.end(this.level * 15);
      this.say(t('games.mattoni.lives', { n: this.lives }), '#ff4d6d', 1.4, true); this.serve();
    }
    // gel e maglie che cadono
    for (const c of this.caps) {
      c.z -= 5 * dt; c.mesh.position.z = c.z; c.mesh.rotation.y += dt * 3; c.mesh.position.y = 0.7 + Math.sin(this.t * 6 + c.x) * 0.12;
      c.glow.position.set(c.x, 0.8, c.z);
      if (c.z < PZ + 0.5 && c.z > PZ - 0.6 && Math.abs(c.x - this.px) < this.pw / 2 + 0.4) { c.done = true; this.applyPower(c.p); }
      if (c.z < -1) c.done = true;
      if (c.done) { this.stage.scene.remove(c.mesh); this.stage.scene.remove(c.glow); }
    }
    this.caps = this.caps.filter((c) => !c.done);
    if (!this.bricks.some((b) => !b.dead && !b.solid) && this.state === 'play') {
      this.level++; this.score += 200 * this.level; this.audio.sfx('win'); this.prog('races', 0, 25);
      this.ts.slowmo(0.25, 0.9); this.shake.add(0.3); this.confetti.burst(0, 3, 14, 110, 5);
      this.hooks.progress?.setMax('mattoniLevel', this.level + 1);
      this.say(t('games.mattoni.levelUp', { n: this.level + 1 }), '#d9ff3d', 2, true);
      this.loadLevel(this.level);
    }
  }

  wall(b) { this.audio.sfx('clank'); this.fx.spawn(b.x, 0.7, b.z, { tex: 'spark', size: 0.7, life: 0.15, color: '#ffffff' }); }

  hitBrick(br, fire) {
    if (br.solid && !fire) { this.audio.sfx('clank'); br.pulse = 1; this.shake.add(0.05); this.fx.spawn(br.x, 0.9, br.z, { tex: 'spark', size: 0.8, life: 0.18, color: '#ffffff' }); return; }
    br.hp -= fire ? 99 : 1;
    if (br.hp > 0) {
      br.pulse = 1; this.audio.sfx('hit'); this.shake.add(0.08);
      this.fx.spawn(br.x, 1, br.z, { tex: 'spark', size: 0.9, life: 0.2, color: '#ffd166' });
      if (br.kind !== 'bottle') br.mesh.rotation.z = br.tilt * (br.kind === 'sign' ? 1 : 0.5);
      return;
    }
    br.dead = true; br.t = 0; this.dying.push(br);
    this.combo++; const pts = 10 * this.combo * (1 + this.level);
    this.score += pts;
    this.pop(this.combo > 1 ? `+${pts} ×${this.combo}` : `+${pts}`, this.combo > 4 ? '#4de3ff' : '#ffd166', clamp(br.x, -HW + 2, HW - 2), 1.6, br.z, 0.7);
    this.fx.explode(br.x, 0.7, br.z, 0.7);
    this.confetti.burst(br.x, 1, br.z, br.kind === 'bottle' ? 14 : 10, 2.4);
    this.audio.sfx(this.combo > 4 ? 'coin' : 'hit'); this.shake.add(0.14); this.ts.hitStop(0.03);
    if (Math.random() < 0.13) {
      const p = pick(POWERS);
      const mesh = p.shape === 'jersey' ? jerseyObject(p.color) : gelObject(p.color);
      mesh.position.set(br.x, 0.7, br.z); this.stage.scene.add(mesh);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: p.color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(1.6); this.stage.scene.add(glow);
      this.caps.push({ mesh, glow, x: br.x, z: br.z, p });
    }
  }

  applyPower(p) {
    this.audio.sfx('pickup'); this.pop(t(p.text), p.color, clamp(this.px, -HW + 5, HW - 5), 2.6, PZ + 3); this.shake.add(0.2);
    this.fx.explode(this.px, 0.8, PZ, 0.6); this.fx.spawn(this.px, 0.8, PZ, { tex: 'blue', size: 3, life: 0.4, color: p.color });
    if (p.id === 'wide') this.wideT = 14;
    if (p.id === 'slow') this.slowT = 10;
    if (p.id === 'life') this.lives = Math.min(5, this.lives + 1);
    if (p.id === 'multi') {
      const src = this.balls.find((b) => !b.stuck) || this.balls[0]; if (!src) return;
      for (const a of [-0.5, 0.5]) this.addBall(src.x, src.z, Math.sin(a) * 10, Math.abs(Math.cos(a) * 10));
    }
  }

  view(realDt) {
    const vd = realDt * (this.ts ? this.ts.scale : 1); const fire = this.sprinting && this.state === 'play';
    this.shake.update(realDt);
    // racchetta: assale con due ruote che girano mentre ti sposti, bici dietro
    const half = this.pw / 2 - 0.45;
    this.wheelRot = (this.wheelRot || 0) + (this.px - (this.lastPx ?? this.px)) / 0.42; this.lastPx = this.px;
    this.padPulse = Math.max(0, (this.padPulse || 0) - realDt * 7);
    this.paddle.position.set(this.px, 0, PZ + 0.05);
    this.bar.scale.set(Math.max(0.1, half * 2), 1 + this.padPulse * 0.5, 1); this.stripe.scale.x = this.bar.scale.x;
    this.bar.material.emissiveIntensity = 0.7 + this.padPulse * 1.2 + (fire ? 0.5 : 0);
    this.wheels.forEach((w, i) => { w.position.x = (i ? 1 : -1) * (half + 0.3); w.rotation.z = -this.wheelRot; });
    this.player.root.position.set(this.px, 0, PZ - 1.05); this.player.root.rotation.y = 0;
    this.player.lean.rotation.z = clamp(-(this.px - (this.camLead ?? this.px)) * 0.05, -0.2, 0.2); this.camLead = this.px;
    this.player.pose(vd, this.state === 'play' ? this.cadence || 80 : 40, this.state === 'play' ? 6 : 0, { stand: fire ? 1 : 0 });
    // palle: posizione, rotazione, scia
    for (const b of this.balls) {
      b.mesh.position.set(b.x, 0.5, b.z); b.mesh.material = fire ? this.fireMat : this.ballMat;
      b.mesh.rotation.x += b.vz * vd * 2.6; b.mesh.rotation.z -= b.vx * vd * 2.6;
      b.blob.position.set(b.x, 0.04, b.z); b.glow.position.set(b.x, 0.55, b.z);
      b.glow.material.color.set(fire ? '#ff7a2a' : '#d9ff3d'); b.glow.scale.setScalar(fire ? 3.2 : 2.2);
      if (!b.stuck && vd > 0) {
        this.fx.spawn(b.x - b.vx * 0.02, 0.5, b.z - b.vz * 0.02, fire ? { tex: 'fire', size: 1.1, life: 0.3, grow: 0.5 } : { tex: 'glow', size: 0.9, life: 0.22, grow: -0.4, color: '#d9ff3d' });
      }
    }
    // gel e maglie: brillano
    for (const c of this.caps) c.glow.material.opacity = 0.55 + Math.sin(this.t * 8 + c.x) * 0.2;
    // blocchi: urto (pulsa), caduta (si gonfiano, ruotano e spariscono)
    for (const br of this.bricks) {
      if (br.pulse > 0) br.pulse = Math.max(0, br.pulse - realDt * 5);
      const k = 1 + br.pulse * 0.22 * Math.sin(br.pulse * Math.PI); br.mesh.position.y = br.pulse * 0.12;
      br.mesh.scale.set(k, k, k);
    }
    for (const br of this.dying) {
      br.t += vd; const k = br.t / 0.28;
      br.mesh.position.y = 0.2 + k * 1.6; br.mesh.rotation.y += vd * 9; br.mesh.rotation.x += vd * 5; br.mesh.scale.setScalar(Math.max(0.01, 1 - k * k));
      if (k >= 1) this.scene.remove(br.mesh);
    }
    this.dying = this.dying.filter((b) => b.t < 0.28);
    this.fx.update(vd); this.confetti.update(vd);
    // sfondo animato: nuvole, bandierine al vento, pubblico che salta
    for (const c of this.clouds.children) { c.position.x += c.userData.v * realDt; if (c.position.x > 280) c.position.x = -280; }
    this.crowd?.tick(this.t);
    this.windFlags();
    // camera: alta e dietro la bici, prospettiva sul campo
    const cam = this.stage.camera; const aspect = this.stage.W / this.stage.H; const tall = aspect < 0.7;
    const target = this._tp || (this._tp = new THREE.Vector3());
    target.set(this.px * 0.22, tall ? 16.5 : 14, tall ? -9.5 : -10.5);
    if (!this.camInit) { this.camPos = target.clone(); this.camInit = true; }
    this.camPos.lerp(target, Math.min(1, realDt * 3));
    cam.position.copy(this.camPos);
    cam.lookAt(this.px * 0.1, 0, tall ? 15 : 15.5);
    const fov = (tall ? 66 : 50) + (fire ? 5 : 0); cam.fov += (fov - cam.fov) * Math.min(1, realDt * 3); cam.updateProjectionMatrix();
    this.shake.apply(cam);
    const sd = this.sunDir || new THREE.Vector3(0.5, 0.75, -0.45);
    this.light.sun.position.set(sd.x * 60, sd.y * 60, TOP / 2 + sd.z * 60); this.light.sun.target.position.set(0, 0, TOP / 2);
  }

  windFlags() {
    const { fm, fq, fe, fp, fs } = this; const T = this.t;
    this.flags.forEach((f, i) => {
      fe.set(Math.sin(T * 3 + f.ph) * 0.35, 0, Math.sin(T * 2.2 + f.ph * 1.3) * 0.25); fq.setFromEuler(fe);
      this.flagMesh.setMatrixAt(i, fm.compose(fp.set(f.x, f.y, f.z), fq, fs));
    });
    this.flagMesh.instanceMatrix.needsUpdate = true;
  }

  hud(ctx, W, H) {
    const s = uiScale(W, H); const top = 54; const gap = 8; const m = 12;
    const pw = Math.min((W - m * 2 - gap * 2) / 3, 150 * s); const ph = 62 * s;
    const box = (i, label, value, color, size = 44) => {
      const x = i === 0 ? m : i === 1 ? (W - pw) / 2 : W - m - pw;
      panel(ctx, x, top, pw, ph, {});
      txt(ctx, label, x + pw / 2, top + 16 * s, { size: 13 * s, align: 'center', color: HUD.dim });
      txt(ctx, value, x + pw / 2, top + ph - 8 * s, { size: size * s, align: 'center', color });
    };
    box(0, t('games.mattoni.level', { n: this.level + 1 }), '♥'.repeat(Math.max(0, this.lives)), HUD.red, this.lives > 3 ? 30 : 38);
    box(1, t('games.gruppetto.lblScore'), String(Math.round(this.score)), this.sprinting ? HUD.cyan : HUD.white);
    box(2, 'WATT', String(Math.round(this.power)), powerColor(this.power, this.effort.threshold));
    // barra potenza sottile con soglia sprint
    const by = top + ph + 6; const bw = W - m * 2; const maxW = Math.max(400, (this.effort.threshold || 200) * 1.6);
    ctx.fillStyle = 'rgba(12,12,18,.55)'; ctx.fillRect(m, by, bw, 7 * s);
    ctx.fillStyle = this.sprinting ? HUD.cyan : HUD.lime; ctx.fillRect(m, by, bw * clamp(this.power / maxW, 0, 1), 7 * s);
    if (this.effort.threshold) { ctx.fillStyle = '#fff'; ctx.fillRect(m + bw * clamp(this.effort.threshold / maxW, 0, 1) - 1, by - 2, 2, 11 * s); }
    // riga: velocità della palla, potenziamenti attivi, combo
    const gy = by + 10 * s; const ph2 = 26 * s;
    panel(ctx, m, gy, 150 * s, ph2, { r: 8, fill: 'rgba(12,12,18,.55)' });
    txt(ctx, t('games.mattoni.ball', { kmh: Math.round(this.speed() * 3.6), rpm: Math.round(this.cadence) }).replace(' · ', ' · '), m + 75 * s, gy + 18 * s, { size: 13 * s, align: 'center', color: HUD.white });
    let rx = W - m;
    const pill = (text, color, wd) => { panel(ctx, rx - wd * s, gy, wd * s, ph2, { r: 8, fill: 'rgba(12,12,18,.55)' }); txt(ctx, text, rx - wd * s / 2, gy + 19 * s, { size: 16 * s, align: 'center', color }); rx -= (wd + 6) * s; };
    if (this.combo > 1) pill(`×${this.combo}`, this.combo > 4 ? HUD.cyan : HUD.gold, 56);
    if (this.wideT > 0) pill(`${Math.ceil(this.wideT)}s ↔`, '#4de3ff', 64);
    if (this.slowT > 0) pill(`${Math.ceil(this.slowT)}s ◔`, '#ffd166', 64);
    if (this.sprinting) txt(ctx, t('games.mattoni.fire'), W / 2, gy + ph2 + 24 * s, { size: 18 * s, align: 'center', color: '#ff9f43' });
  }

  summary() { return [t('games.mattoni.over'), t('games.mattoni.reached', { n: this.level + 1 })]; }
}
