// UPDRAFT — un aereo a pedali: i tuoi watt sono la quota. Ogni partita è un ALLENAMENTO (5, 10 o 20 minuti):
// la quota è la percentuale della tua FTP (in basso 50 %, in alto 130 %) e il percorso di anelli ne è il profilo:
// anelli bassi nei recuperi, alti negli sforzi, salita ripida per lo scatto. Il piano è in planata-plan.js.
// Lungo la linea raccogli stelle e fai combo; correnti ascendenti (termiche) e raffiche sono gli eventi; le tempeste
// laterali sono da evitare (mai sulla rotta degli anelli). + / − spostano l'aereo su un'altra corsia per i palloni bonus.
// Si finisce con l'atterraggio sulla pista. Grafica: aereo Meshy con il ciclista che pedala, valli, laghi e villaggi.
import { THREE, Stage, loadAll, Effects, Quality, Cyclist, makeKit, loadCyclistTemplate, toonMaterial, toonify, skyDome, styleLights, styleFog, Shake } from './kit3d.js';
import { scatterModel, groundModel, prepareModel } from './kit/env.js';
import { loadMeshyTemplate, CYCLIST_URL } from './kit/cyclist.js';
import { txt as hudText, hudView, paragraph, wrapLines, MessageQueue, loadHudFonts, HUD } from './kit/hud.js';
import { clamp, lerp } from './engine.js';
import { t } from '../i18n.js';
import { SONGS } from './audio.js';
import { GameMenu, ResultsView, LENGTHS } from './kit/menu.js';
import { makeRandom } from './kit/rng.js';
import { DURATIONS, LEVELS, COOL_S, SPEED, RING_EVERY, FIRST_RING, Y_LO, Y_HI, PCT_LO, PCT_HI, buildPlan, planFromWorkout, segAt, targetW, targetPct, profilePct, altOf, pctOf, Adapter, starsFor, nextStarHint } from './planata-plan.js';
import { WorkoutClock, BandMeter, workoutStars } from './kit/workout-plan.js';

const PLANE_SPAN = 8;       // apertura alare (m)
const RIDER_S = 1.75;       // scala del ciclista (più grande del vero: si legge da lontano)
const RIDER_Z = -0.6;       // posizione lungo la fusoliera
const GUST_DROP = 1.0;      // di quanto spinge giù una raffica (m)
const LAND_S = 6;           // secondi di discesa finale
const CAM_BACK = 10; const CAM_UP = 5.0; const CAM_BACK_T = 9; const CAM_UP_T = 5.4;
// la pista: i laghi e gli alberi la lasciano libera
let RUNWAY_Z = null;
function setRunway(z) { RUNWAY_Z = z; }
function onRunway(x, z, m = 0) { return RUNWAY_Z !== null && Math.abs(x) < 7.5 + m && z > RUNWAY_Z - 85 - m && z < RUNWAY_Z + 65 + m; }
const CH = 60;              // lunghezza di un pezzo di terreno (m)
const NCH = 7;              // pezzi di terreno in scena
const CW = 420;             // larghezza del terreno
const NX = 76; const NZ = 12;
const WATER_Y = -0.15;

// ---------- numeri casuali e rumore: il paesaggio dipende solo dalla posizione, quindi è sempre uguale ----------
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
const hash2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (e0, e1, x) => { const k = clamp((x - e0) / (e1 - e0), 0, 1); return k * k * (3 - 2 * k); };
function vnoise(x, z) {
  const xi = Math.floor(x); const zi = Math.floor(z); const fx = x - xi; const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx); const v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), u), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u), v);
}

// laghi: uno ogni 300 m circa, nel fondovalle
const LAKE_CELL = 300;
const lakeCache = new Map();
function lakesIn(cell) {
  if (!lakeCache.has(cell)) {
    const r = rng(1000 + cell * 17); const out = [];
    if (r() < 0.75) out.push({ x: (r() - 0.5) * 36, z: cell * LAKE_CELL + r() * LAKE_CELL, r: 20 + r() * 16 });
    lakeCache.set(cell, out);
  }
  return lakeCache.get(cell);
}
function lakeAt(x, z) { // 0 fuori, 1 dentro (bordo sfumato)
  if (RUNWAY_Z !== null && Math.abs(z - RUNWAY_Z) < 170) return 0;
  let k = 0; const c = Math.floor(z / LAKE_CELL);
  for (let i = c - 1; i <= c + 1; i++) for (const l of lakesIn(i)) {
    const d = Math.hypot((x - l.x) * 0.8, z - l.z) / l.r; k = Math.max(k, smooth(1.25, 0.75, d));
  }
  return k;
}
// quota del terreno: valle piatta al centro, colline sempre più alte ai lati, laghi che la abbassano
function terrainH(x, z) {
  const ax = Math.abs(x);
  const hills = smooth(16, 90, ax) * (16 + 20 * vnoise(x * 0.012 + 7, z * 0.012)) + smooth(10, 40, ax) * 3.5 * vnoise(x * 0.05, z * 0.05);
  const flat = 0.5 * vnoise(x * 0.04, z * 0.04);
  return lerp(hills + flat, -1.9, lakeAt(x, z));
}

// campi a toppe (grano, prato, arato), roccia in alto, riva sabbiosa
const FIELD = ['#dcc070', '#9fcb5f', '#86b84f', '#a8c85a', '#8fc060', '#9fcb5f', '#cdb36a', '#7fb552', '#b08455'].map((c) => new THREE.Color(c));
const FIELD2 = ['#cdb062', '#92bf55', '#79ab45', '#9bbb4f', '#82b356', '#92bf55', '#bfa45c', '#72a649', '#a07548'].map((c) => new THREE.Color(c));
const ROCK = new THREE.Color('#a99a8c'); const FOREST = new THREE.Color('#5f9440'); const SAND = new THREE.Color('#d9c490'); const SNOW = new THREE.Color('#f4f1e8');
function terrainColor(x, z, h, out) {
  const ax = Math.abs(x);
  const wx = x + 14 * vnoise(x * 0.02, z * 0.02); const wz = z + 14 * vnoise(x * 0.02 + 50, z * 0.02);
  const cx = Math.floor(wx / 30); const cz = Math.floor(wz / 36);
  const id = Math.floor(hash2(cx, cz) * FIELD.length);
  out.copy(((Math.floor(wz / 5) + cx) & 1) ? FIELD[id] : FIELD2[id]);                       // strisce di aratura
  const slope = smooth(14, 40, ax);
  out.lerp(FOREST, slope * 0.75);
  out.lerp(ROCK, smooth(22, 31, h));
  out.lerp(SNOW, smooth(35, 41, h));
  const lk = lakeAt(x, z); out.lerp(SAND, smooth(0.02, 0.1, lk) * smooth(0.6, 0.3, lk));
  const s = 0.94 + 0.12 * hash2(Math.floor(x / 5), Math.floor(z / 5));
  out.multiplyScalar(s);
  return out;
}

// ---------- pezzo di terreno (si ricicla: ogni pezzo riscrive la sua griglia) ----------
class Chunk {
  constructor(scene, mat, waterMat) {
    const geo = new THREE.PlaneGeometry(CW, CH, NX, NZ); geo.rotateX(-Math.PI / 2);
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.bx = Float32Array.from(geo.attributes.position.array.filter((_, i) => i % 3 === 0)); this.bz = Float32Array.from(geo.attributes.position.array.filter((_, i) => i % 3 === 2));
    this.geo = geo; this.mesh = new THREE.Mesh(geo, mat); this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH).rotateX(-Math.PI / 2), waterMat); this.water.position.y = WATER_Y; this.water.frustumCulled = false; scene.add(this.water);
    this.index = null;
  }
  place(index) {
    if (this.index === index) return; this.index = index;
    const z0 = index * CH; const pos = this.geo.attributes.position; const nor = this.geo.attributes.normal; const col = this.geo.attributes.color; const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = this.bx[i]; const z = z0 + CH / 2 + this.bz[i];
      const h = terrainH(x, z); pos.setXYZ(i, x, h, z);
      const dx = terrainH(x + 1.5, z) - terrainH(x - 1.5, z); const dz = terrainH(x, z + 1.5) - terrainH(x, z - 1.5);
      const l = Math.hypot(dx, 3, dz); nor.setXYZ(i, -dx / l, 3 / l, -dz / l);
      terrainColor(x, z, h, c); col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true; nor.needsUpdate = true; col.needsUpdate = true; this.geo.computeBoundingSphere();
    this.water.position.z = z0 + CH / 2; this.mesh.position.z = 0;
  }
}

// ---------- strato di istanze che si riscrive quando arriva un pezzo nuovo ----------
class Layer {
  constructor(scene, gltf, cap, { kind = 'house', lodDist = 90, lod = true } = {}) {
    groundModel(gltf);
    this.info = prepareModel(gltf); this.cap = cap;
    const dummy = Array.from({ length: cap }, () => ({ x: 0, y: -999, z: 0, rot: 0, h: 1 }));
    this.inst = scatterModel(scene, gltf, dummy, { kind, lodDist, lod }); // lod=false: niente sagome a blocco (le nuvole e le case lontane sembravano scatole grigie)
    this.inst.baseLod = lodDist; this.n = 0;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 1, 0); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
  }
  set(items) {
    const L = this.inst.list; const M = this.inst.mats; this.n = Math.min(items.length, this.cap);
    for (let i = 0; i < this.cap; i++) {
      if (i >= this.n) { L[i].keep = 9; continue; }
      const p = items[i]; const sc = p.h / this.info.height;
      L[i].x = p.x; L[i].z = p.z; L[i].keep = hash2(Math.round(p.x * 7), Math.round(p.z * 7) + 3.7); // dalla posizione: non cambia quando il pezzo scorre, niente alberi che compaiono e spariscono
      M[i].compose(this.v.set(p.x, p.y, p.z), this.q.setFromAxisAngle(this.up, p.rot || 0), this.s.setScalar(sc));
    }
  }
}


// aereo: elica che gira alla cadenza (due pale e un disco trasparente)
function makePropeller() {
  const grp = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: '#2a2a33', transparent: true }));
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: HUD.lime }));
  hub.position.z = 0.1;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const spin = new THREE.Group(); spin.add(blade, disc);
  grp.add(spin, hub); grp.spin = spin; grp.disc = disc; grp.blade = blade;
  return grp;
}

// linee di vento intorno all'aereo (si vedono soprattutto spingendo forte): un solo draw call
class SpeedStreaks {
  constructor(scene, count = 56, rnd = Math.random) {
    this.rnd = rnd;
    const geo = new THREE.PlaneGeometry(0.05, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, count); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; scene.add(this.mesh);
    this.items = Array.from({ length: count }, () => this.fresh({}, true));
    this.m = new THREE.Matrix4(); this.p = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.k = 0;
  }
  fresh(it, any) {
    const rn = this.rnd; const a = rn() * Math.PI * 2; const r = 4 + rn() * 11;
    it.x = Math.cos(a) * r; it.y = Math.sin(a) * r * 0.6; it.z = any ? -4 + rn() * 40 : 36 + rn() * 6; it.len = 2 + rn() * 4;
    if (Math.hypot(it.x, it.y) < 3.5) { it.x *= 2; it.y *= 2; }
    return it;
  }
  update(dt, plane, speed, strength) {
    this.k += (strength - this.k) * Math.min(1, dt * 3);
    this.mesh.material.opacity = 0.4 * this.k; this.mesh.visible = this.k > 0.03;
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]; it.z -= (speed + 10) * dt * 1.6;
      if (it.z < -6) this.fresh(it, false);
      this.p.set(plane.x + it.x, plane.y + it.y, plane.z + it.z);
      this.m.compose(this.p, this.q, this.s.set(1, 1, it.len * (0.5 + this.k)));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- costanti del gioco ----------
const LANE_W = 5.4;           // distanza fra le corsie (3 corsie: −1, 0, +1; +1 = destra sullo schermo)
const RING_R = 3.2;           // raggio dell'anello (m)
const HIT_R = 2.7;            // si passa dentro l'anello se la distanza dal centro è minore
const PERFECT_R = 0.9;        // nel mezzo: bonus
// Nessuna punizione per chi spinge di più: nell'avvio, nei recuperi e nella discesa conta passare ad ogni quota SOPRA l'anello;
// nel ritmo fino a 6 m sopra; negli sforzi e nelle salite l'anello resta preciso.
const UP_TOL = { warm: Infinity, rest: Infinity, cool: Infinity, pace: 6, effort: 2.7, climb: 2.7 };
const AHEAD_S = 15;           // il percorso si genera 15 s in anticipo (225 m, dentro la nebbia)
const MANUAL_S = 2.6;         // dopo un tocco di + / − il pilota automatico aspetta questo tempo
const RW_Y = 0.62;            // quota della pista
const RW_LEN = 150;
const SEG_COLOR = { warm: '#9ee37d', pace: '#ffd34d', effort: '#ff9f43', climb: '#ff4d6d', rest: '#4de3ff', cool: '#a0f0c0' };
const RING_COLOR = { warm: '#9ee37d', pace: '#ffd34d', effort: '#ff7a1a', climb: '#ff3d6d', rest: '#3fd0ff', cool: '#9ee37d' };
const smoothstep = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

export class Planata {
  constructor(hudCanvas, hooks, audio) {
    this.hudCanvas = hudCanvas; this.hooks = hooks; this.audio = audio;
    this.active = false;
    const ls = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
    this.seed = null; this.rnd = makeRandom(this.seed);
    this.menu = new GameMenu({
      id: 'planata', title: () => t('games.planata.hud.title'), pitch: () => t('games.planata.hud.tagline'),
      howto: () => [t('games.planata.rule1'), t('games.planata.rule4'), t('games.planata.rule5')],
      load: () => ({ durIdx: clamp(Number(ls('planataDur', 0)) || 0, 0, DURATIONS.length - 1), level: clamp(Number(ls('planataLvl', 1)) || 0, 0, LEVELS.length - 1) }),
      save: ({ durIdx, level }) => { try { localStorage.setItem('planataDur', durIdx); localStorage.setItem('planataLvl', level); } catch { /* niente storage */ } },
      best: (d, l) => { const r = this.record(DURATIONS[d], LEVELS[l].id); return { stars: r.stars || 0, text: r.score ? String(r.score) : null }; },
      sfx: (n) => this.audio.sfx(n), ready: () => this.state === 'menu', workout: () => this.hooks.workout?.(),
      onStart: (d, l) => { this.configure(d, l); this.reset(); this.begin(); },
    });
    this.results = new ResultsView({ sfx: (n) => this.audio.sfx(n), onAgain: () => { this.reset(); this.begin(); }, onBack: () => this.hooks.close?.() });
    this.loop = this.loop.bind(this);
  }

  get durIdx() { return this.menu.durIdx; }
  set durIdx(v) { this.menu.durIdx = v; }
  get lvlIdx() { return this.menu.level; }
  set lvlIdx(v) { this.menu.level = v; }

  async start() {
    this.active = true;
    this.detach = [this.menu.attach(this.hudCanvas, () => ({ W: this.stage.W, H: this.stage.H }), () => this.state === 'menu'), this.results.attach(this.hudCanvas, () => ({ W: this.stage.W, H: this.stage.H }), () => this.state === 'results')];
    this.quality = new Quality();
    this.stage = new Stage(this.hudCanvas, { quality: this.quality });
    this.stage.onQuality = (cfg) => this.applyQuality(cfg);
    this.state = 'loading'; this.t = 0; this.msgs = new MessageQueue(); this.power = 0; this.pw = 0; this.cadence = 0; this.last = performance.now();
    requestAnimationFrame(this.loop);
    this.audio.playSong(SONGS.menu);
    try {
      const A = 'assets/3d'; const Q = `${A}/quaternius`;
      this.m = await loadAll({
        plane: `${A}/meshy/plane.glb`, cloud: `${A}/meshy/cloud.glb`, island: `${A}/meshy/island.glb`,
        farm: `${A}/meshy/farmhouse.glb`, church: `${A}/meshy/church.glb`, hut: `${A}/meshy/alpine_hut.glb`, windmill: `${A}/meshy/windmill.glb`, cypress: `${A}/meshy/cypress.glb`,
        tree1: `${Q}/nature/tree1.glb`, tree2: `${Q}/nature/tree2.glb`, tree3: `${Q}/nature/tree3.glb`, bush1: `${Q}/nature/bush1.glb`,
      }, (p) => { this.loadPct = p * 0.8; });
      this.tpl = await loadMeshyTemplate().catch((err) => { console.warn('Meshy cyclist:', err); return loadCyclistTemplate(CYCLIST_URL); });
      this.loadPct = 0.95;
      await loadHudFonts();
      if (!this.active) return;
      this.build();
      this.state = 'menu'; this.stateT = 0; this.menu.reset();
    } catch (err) { console.error(err); this.state = 'error'; this.error = err.message; }
  }

  stop() { this.active = false; (this.detach || []).forEach((f) => f()); this.audio.stopSong(); this.hooks.setGrade(null); this.stage?.dispose(); }

  // ---------- scena ----------
  build() {
    const { scene } = this.stage;
    this.scene = scene;
    this.stage.camera.far = 600; this.stage.camera.updateProjectionMatrix();
    scene.add(skyDome('morning'));
    styleFog(scene, 'morning', 90, 340);
    this.light = styleLights(scene, 'morning', { shadows: false });
    this.groundMat = toonMaterial({ vertexColors: true });
    this.waterMat = new THREE.MeshToonMaterial({ gradientMap: this.groundMat.gradientMap, color: '#4fb6e6', transparent: true, opacity: 0.9, depthWrite: false });
    this.chunks = Array.from({ length: NCH }, () => new Chunk(scene, this.groundMat, this.waterMat));
    this.buildScenery();
    this.buildPlane();
    this.buildProps();
    this.fx = new Effects(scene, 80); this.streaks = new SpeedStreaks(scene, 56, (...a) => this.rnd(...a)); this.shake = new Shake();
    this.applyQuality(this.quality.cfg);
    this.reset();
  }

  // aereo Meshy (muso verso −x nel file) con il ciclista che pedala sopra la fusoliera e l'elica che gira alla cadenza
  buildPlane() {
    const { scene } = this.stage;
    this.plane = new THREE.Group(); scene.add(this.plane);
    const pm = this.m.plane.scene.clone(true); toonify(pm);
    const pbox = new THREE.Box3().setFromObject(pm); const span = pbox.max.z - pbox.min.z; const sc = PLANE_SPAN / span;
    const holder = new THREE.Group(); pm.position.set(-(pbox.min.x + pbox.max.x) / 2, -(pbox.min.y + pbox.max.y) / 2, -(pbox.min.z + pbox.max.z) / 2);
    holder.add(pm); holder.scale.setScalar(sc); holder.rotation.y = Math.PI / 2; this.plane.add(holder); this.planeBody = holder;
    this.noseZ = (pbox.max.x - pbox.min.x) / 2 * sc; this.halfH = (pbox.max.y - pbox.min.y) / 2 * sc; this.tailZ = -this.noseZ;
    this.prop = makePropeller(); this.prop.position.set(0, 0, this.noseZ + 0.08); this.prop.scale.setScalar(PLANE_SPAN / 7.4); this.plane.add(this.prop);
    // il ciclista: bici e gambe, in sella sopra l'ala (stessa posa di tutti gli altri giochi)
    this.rider = new Cyclist(this.tpl, makeKit('#d9ff3d', 0), { shadows: false });
    this.rider.root.scale.setScalar(RIDER_S);
    this.riderMount = new THREE.Group(); this.riderMount.add(this.rider.root); this.plane.add(this.riderMount);
    // le ruote poggiano sulla fusoliera: si cerca la quota della superficie sotto la sella con un raggio verso il basso
    this.plane.updateMatrixWorld(true);
    const hit = new THREE.Raycaster(new THREE.Vector3(0, 30, RIDER_Z), new THREE.Vector3(0, -1, 0)).intersectObject(holder, true)[0];
    this.riderMount.position.set(0, (hit ? hit.point.y : this.halfH * 0.3) - 0.04, RIDER_Z);
    // ombra sul terreno
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 2; scene.add(this.blob);
  }

  // geometrie e materiali condivisi di anelli, stelle, palloni, tempeste, termiche e della pista
  buildProps() {
    const { scene } = this.stage;
    this.ringGeos = {};
    for (const [kind, hex] of Object.entries(RING_COLOR)) {
      const g = new THREE.TorusGeometry(RING_R, 0.5, 8, 40); const n = g.attributes.position.count; const col = new Float32Array(n * 3);
      const a = new THREE.Color(hex); const b = new THREE.Color('#ffffff');
      for (let i = 0; i < n; i++) { const ang = Math.atan2(g.attributes.position.getY(i), g.attributes.position.getX(i)); (Math.floor((ang + Math.PI) / (Math.PI / 8)) & 1 ? a : b).toArray(col, i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); this.ringGeos[kind] = g;
    }
    this.filmGeo = new THREE.CircleGeometry(RING_R - 0.4, 28);
    this.beamGeo = new THREE.CylinderGeometry(0.09, 0.09, 1, 5, 1, true).translate(0, 0.5, 0);
    this.beamMat = new THREE.MeshBasicMaterial({ color: '#fff2c0', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
    // stella: moneta d'oro piatta con un anello più chiaro, grande abbastanza da leggersi
    this.coinGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.16, 14).rotateX(Math.PI / 2);
    this.coinMat = new THREE.MeshBasicMaterial({ color: '#ffcf3a' });
    this.coinRimGeo = new THREE.TorusGeometry(0.75, 0.11, 6, 16);
    this.coinRimMat = new THREE.MeshBasicMaterial({ color: '#fff3b0' });
    // pallone bonus (corsia laterale)
    this.podGeo = new THREE.SphereGeometry(1.25, 14, 10); this.podMat = new THREE.MeshToonMaterial({ gradientMap: this.groundMat.gradientMap, color: '#ff4d9d', emissive: '#7a1442' });
    this.podHaloGeo = new THREE.TorusGeometry(1.7, 0.12, 6, 24); this.podHaloMat = new THREE.MeshBasicMaterial({ color: '#ffd1e8' });
    // tempesta: nuvola scura con il lampo
    this.stormGeo = new THREE.IcosahedronGeometry(1, 1); this.stormMat = new THREE.MeshToonMaterial({ gradientMap: this.groundMat.gradientMap, color: '#4b4f66', emissive: '#14162a' });
    this.boltGeo = new THREE.ConeGeometry(0.4, 2.6, 4).rotateX(Math.PI); this.boltMat = new THREE.MeshBasicMaterial({ color: '#fff06a' });
    // termica: colonna luminosa che sale
    this.thermGeo = new THREE.CylinderGeometry(3.6, 3.6, 40, 20, 1, true); this.thermMat = new THREE.MeshBasicMaterial({ color: '#ffe7a0', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.thermRingGeo = new THREE.TorusGeometry(3.4, 0.14, 6, 28).rotateX(Math.PI / 2); this.thermRingMat = new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    // raffica: strisce di vento chiare
    this.gustGeo = new THREE.PlaneGeometry(0.16, 9).rotateX(-Math.PI / 2); this.gustMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    // pista: asfalto, strisce e luci
    this.runway = new THREE.Group(); scene.add(this.runway);
    const asp = new THREE.Mesh(new THREE.BoxGeometry(15, 0.3, RW_LEN), new THREE.MeshToonMaterial({ gradientMap: this.groundMat.gradientMap, color: '#4a4c57' })); asp.position.y = RW_Y - 0.15; this.runway.add(asp);
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff' }); const lamp = new THREE.MeshBasicMaterial({ color: '#ffe27a' });
    for (let i = 0; i < 12; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 5), white); d.position.set(0, RW_Y + 0.02, -RW_LEN / 2 + 14 + i * 11); this.runway.add(d); }
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 6), white); b.position.set(sx * (3 + i * 0.95), RW_Y + 0.02, -RW_LEN / 2 + 6); this.runway.add(b); }
    for (let i = 0; i < 14; i++) for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), lamp); l.position.set(sx * 7.9, RW_Y + 0.25, -RW_LEN / 2 + 4 + i * 11); this.runway.add(l); }
    this.runway.visible = false;
    this.items = [];
  }

  applyQuality(cfg) {
    if (this.stage.bloom) { this.stage.bloom.threshold = 0.93; this.stage.bloom.strength = 0.4; this.stage.bloom.radius = 0.35; }
    if (this.stage.composer && this.scene) this.stage.composer.passes[0].scene = this.scene;
    for (const l of this.layers || []) { l.inst.setDensity(cfg.density); l.inst.lodDist = l.inst.baseLod * (0.5 + 0.5 * cfg.density); }
    if (this.streaks) this.streakMax = cfg.density > 0.9 ? 56 : cfg.density > 0.5 ? 36 : 18;
    this.chunkRefresh = true;
  }

  // ---------- paesaggio ----------
  buildScenery() {
    const { scene } = this.stage; const m = this.m;
    const L = (g, cap, o) => { const l = new Layer(scene, g, cap, o); this.layers.push(l); return l; };
    this.layers = [];
    this.lay = {
      tree1: L(m.tree1, 150, { kind: 'tree', lodDist: 100 }), tree2: L(m.tree2, 150, { kind: 'tree', lodDist: 100 }), tree3: L(m.tree3, 130, { kind: 'tree', lodDist: 100 }),
      bush: L(m.bush1, 70, { kind: 'tree', lodDist: 70 }), cypress: L(m.cypress, 50, { kind: 'tree', lodDist: 110 }),
      farm: L(m.farm, 22, { lod: false }), church: L(m.church, 6, { lod: false }), hut: L(m.hut, 22, { lod: false }), windmill: L(m.windmill, 6, { lod: false }),
      cloud: L(m.cloud, 60, { kind: 'house', lod: false }), island: L(m.island, 8, { kind: 'house', lod: false }),
    };
    this.lastChunk = -1e9;
  }

  // genera le istanze dei pezzi di terreno in vista (deterministico per pezzo)
  layScenery(first) {
    const buckets = {}; for (const k of Object.keys(this.lay)) buckets[k] = [];
    for (let ci = first; ci < first + NCH; ci++) {
      const r = rng(ci * 7919 + 13); const z0 = ci * CH;
      const put = (k, x, z, h, rot = r() * 6.28, up = 0) => { if (terrainH(x, z) < 0.15 || onRunway(x, z, 12) || Math.abs(x) < (k === 'bush' ? 9 : 14)) return false; const y = Math.max(terrainH(x, z), 0) + up; buckets[k].push({ x, y: y - (k === 'cypress' || k.startsWith('tree') ? 0.2 : 0), z, h, rot }); return true; };
      for (let i = 0; i < 34; i++) {
        const side = r() < 0.5 ? -1 : 1; const x = side * (8 + Math.pow(r(), 0.8) * 100); const z = z0 + r() * CH;
        if (Math.abs(x) < 14) continue;
        const gate = Math.abs(x) < 30 ? 0.25 : 1; if (r() > gate) continue;
        const kind = r() < 0.34 ? 'tree1' : r() < 0.5 ? 'tree2' : 'tree3';
        put(kind, x, z, 5 + r() * 5);
      }
      for (let i = 0; i < 12; i++) { const x = (r() < 0.5 ? -1 : 1) * (10 + r() * 60); put('bush', x, z0 + r() * CH, 1.6 + r() * 1.2); }
      if (hash2(ci, 5) < 0.5) { const off = (hash2(ci, 8) < 0.5 ? -1 : 1) * (22 + hash2(ci, 9) * 8); for (let i = 0; i < 6; i++) put('cypress', off + r() * 1.5, z0 + 5 + i * 9, 8 + r() * 3); }
      if (hash2(ci, 2) < 0.55) {
        const vx = (hash2(ci, 3) < 0.5 ? -1 : 1) * (14 + hash2(ci, 4) * 22); const vz = z0 + 12 + hash2(ci, 6) * 34;
        const nh = 4 + Math.floor(r() * 4);
        for (let i = 0; i < nh; i++) {
          const x = vx + (r() - 0.5) * 22; const z = vz + (r() - 0.5) * 24; const rot = Math.round(r() * 4) * Math.PI / 2 + (r() - 0.5) * 0.3;
          const kind = i === 0 ? 'church' : (r() < 0.55 ? 'farm' : 'hut');
          put(kind, x, z, kind === 'church' ? 15 : 7 + r() * 2.5, rot);
        }
      }
      if (hash2(ci, 11) < 0.18) put('windmill', (hash2(ci, 12) < 0.5 ? -1 : 1) * (45 + hash2(ci, 13) * 25), z0 + 20 + r() * 20, 14);
      for (let i = 0; i < 6; i++) { const x = (r() < 0.5 ? -1 : 1) * (14 + r() * 110); const y = 26 + r() * 30; buckets.cloud.push({ x, y, z: z0 + r() * CH, h: 7 + r() * 9, rot: r() * 6.28 }); }
      for (let i = 0; i < 2; i++) { const x = (r() < 0.5 ? -1 : 1) * (28 + r() * 45); buckets.cloud.push({ x, y: 9 + r() * 12, z: z0 + r() * CH, h: 5 + r() * 5, rot: r() * 6.28 }); }
      if (hash2(ci, 21) < 0.34) buckets.island.push({ x: (hash2(ci, 22) < 0.5 ? -1 : 1) * (34 + hash2(ci, 23) * 40), y: 18 + hash2(ci, 24) * 22, z: z0 + r() * CH, h: 15 + r() * 10, rot: r() * 6.28 });
    }
    for (const [k, list] of Object.entries(buckets)) this.lay[k].set(list);
  }

  // terreno e scenografia seguono l'aereo
  updateWorld(force = false) {
    const first = Math.floor((this.z - 70) / CH);
    if (first !== this.lastChunk || force) {
      this.lastChunk = first;
      for (let i = 0; i < NCH; i++) { const ci = first + i; this.chunks[((ci % NCH) + NCH) % NCH].place(ci); }
      this.layScenery(first);
    }
  }

  // ---------- partita ----------
  get ftp() { return Math.max(80, this.hooks.ftp?.() || 200); }
  recordKey() { return `planataBest2:${this.total}:${this.level.id}`; }
  record(total = this.total, lvl = this.level?.id) { if (this.wk) return {}; try { return JSON.parse(localStorage.getItem(`planataBest2:${total}:${lvl}`) || '{}'); } catch { return {}; } }

  configure(durIdx, lvlIdx) {
    this.durIdx = durIdx; this.lvlIdx = lvlIdx;
    this.level = LEVELS[lvlIdx];
    // allenamento in corso: la partita È l'allenamento (durata, tratti e watt vengono da lì; il livello non cambia i watt)
    this.wc = new WorkoutClock(this.hooks); this.wk = this.wc.begin(this.ftp);
    if (this.wk) { this.plan = planFromWorkout(this.wk); this.total = this.plan.total; } else { this.total = DURATIONS[durIdx]; this.plan = buildPlan(this.total); }
    this.band = new BandMeter();
  }

  reset() {
    const { scene } = this.stage;
    for (const o of this.items || []) this.dropItem(o);
    this.configure(this.durIdx, this.lvlIdx);
    this.z = 0; this.x = 0; this.lane = 0; this.manualT = 0; this.y = altOf(0.62); this.vy = 0; this.pitch = 0; this.roll = 0;
    this.items = []; this.zBase = 0; this.el = this.wk ? this.wc.el : 0; this.segIdx = -1; this.seg = this.plan.segs[0];
    this.score = 0; this.combo = 0; this.bestCombo = 0; this.rings = 0; this.ringsTotal = 0; this.coins = 0; this.pods = 0; this.hits = 0;
    this.waveRings = {}; this.waveHit = {};
    this.effortsDone = 0; this.effortsTotal = 0; this.adapt = new Adapter(); this.evLog = []; this.sprinting = false; this.inTarget = false;
    this.paused = false; this.pauseT = 0; this.startT = 0; this.result = null; this.recStart = null; this.finished = false; this.landing = 0; this.rollV = 0;
    this.hurtT = 0; this.boostT = 0; this.gustK = 0; this.sentGrade = undefined; this.pops = []; this.msgs.clear();
    const e0 = this.wk ? this.wc.el : 0; this.nextRingT = e0 + FIRST_RING; this.cn = 0; this.prev = { t: e0 + FIRST_RING - RING_EVERY, z: 0, x: 0, lane: 0 }; this.lastRing = this.prev; this.courseDone = false;
    this.rnd = makeRandom(this.seed);
    this.camInit = false; this.runway.visible = false; this.stateT = 0; setRunway(null); this.landMsg = false;
    for (const c of this.chunks) c.index = null;
    this.lastChunk = -1e9; this.updateWorld(true);
  }

  begin() {
    this.state = 'play'; this.stateT = 0;
    const e0 = this.wk ? this.wc.el : 0; // aperto a metà allenamento: il percorso comincia dal punto giusto del profilo
    this.zBase = this.z - e0 * SPEED; this.el = e0; this.hurtT = 0;
    this.pw = this.power; this.y = altOf(clamp(this.pw / this.ftp, 0.5, 1.3)); this.x = 0;
    this.nextRingT = e0 + FIRST_RING; this.prev = { t: e0 + FIRST_RING - RING_EVERY, z: this.zBase + (e0 + FIRST_RING - RING_EVERY) * SPEED, x: 0, lane: 0 }; this.lastRing = { ...this.prev, z: this.z };
    this.runwayZ = this.zBase + this.total * SPEED; setRunway(this.runwayZ);
    this.runway.position.set(0, 0, this.runwayZ - 10); this.runway.visible = true;
    for (const c of this.chunks) c.index = null; this.lastChunk = -1e9; this.updateWorld(true);
    this.spawnCourse();
    this.hooks.runStart?.();
    this.audio.playSong(SONGS.race); this.audio.sfx('go');
  }

  finish() {
    this.finishResult(true); // numeri definitivi: anelli e punti arrivati dopo l'inizio del defaticamento
    this.state = 'results'; this.stateT = 0; this.finished = true; this.rollV = SPEED * 0.55;
    this.audio.stopSong(); this.audio.sfx('win');
    this.hooks.runEnd?.({ game: 'planata', score: Math.round(this.score) });
    if (!this.wk) this.hooks.setGrade(0);
  }

  // ---------- eventi: tutto ciò che chiede o premia qualcosa (si misura nel test) ----------
  ev(kind) { if (this.evLog.length < 20000) this.evLog.push({ t: this.el, k: kind }); }
  eventStats() {
    const end = this.total - COOL_S; const ts = this.evLog.filter((e) => e.t <= end).map((e) => e.t).sort((a, b) => a - b);
    let maxGap = 0; let prev = 0; for (const x of ts) { maxGap = Math.max(maxGap, x - prev); prev = x; } maxGap = Math.max(maxGap, end - prev);
    return { first: ts[0] ?? Infinity, maxGap, perMin: ts.length / (end / 60), n: ts.length };
  }

  say(text, color = '#ffd34d', dur = 1.6, big = false, prio = big ? 2 : 1, sub = null) { this.msgs.say(text, { color, dur, big, prio, sub }); }
  // testo che sale dall'aereo (feedback immediato); uno solo alla volta, il nuovo prende il posto del vecchio
  pop(text, color, dur = 0.9) { if (this.seg?.kind === 'cool') return; this.pops = [{ text, color, t: dur, t0: dur }]; } // nella discesa c'è il riquadro del risultato
  prog(stat, n = 1, xp = 0) { this.hooks.progress?.event(stat, n, xp); }

  // ---------- comandi ----------
  input(dir) {
    this.audio.ensure();
    if (this.state === 'menu') { this.menu.input(dir); return; } // − durata, + livello, + lungo avvia
    if (this.state === 'results') { this.results.input(dir); return; }
    if (this.state !== 'play' || this.paused || this.landing > 0) return;
    // + = destra, − = sinistra: una corsia per volta; il pilota automatico riprende dopo qualche secondo
    const now = this.manualT > 0 ? this.lane : clamp(Math.round(-this.x / LANE_W), -1, 1);
    this.lane = clamp(now + dir, -1, 1); this.manualT = MANUAL_S; this.audio.sfx('select');
  }
  hold(dir) { if (this.state === 'menu') this.menu.hold(dir); }

  menuTick(dt, connected) {
    this.menu.update(dt, { connected, power: this.power });
  }

  // ---------- il percorso: anelli sul profilo dell'allenamento, stelle sulla linea, palloni e tempeste ai lati ----------
  spawnCourse() {
    while (!this.courseDone && this.nextRingT < this.el + AHEAD_S) this.spawnRing();
  }

  pathY(ta) { return altOf(profilePct(this.plan, ta, this.level.k, this.adapt.value)); }

  spawnRing() {
    const ta = this.nextRingT; const p = this.prev;
    if (ta > this.total - 9) { this.courseDone = true; return; }
    const seg = segAt(this.plan, ta); const r = this.rnd;
    const z = this.zBase + ta * SPEED; const y = this.pathY(ta);
    // corsia: si resta o si cambia di una; nello scatto e nell'avvio si resta
    let lane = p.lane; const q = r();
    if (this.cn >= 2 && seg.kind !== 'climb' && seg.kind !== 'warm' && q >= 0.42) { const d = q < 0.71 ? -1 : 1; lane = p.lane + d; if (lane < -1 || lane > 1) lane = p.lane - d; }
    const x = -lane * LANE_W;
    this.addRing(x, y, z, seg, ta);
    // stelle lungo la linea fra l'anello di prima e questo
    for (let k = 1; k <= 3; k++) {
      const tk = p.t + (ta - p.t) * k / 4; if (tk < 0.5) continue;
      this.addCoin(lerp(p.x, x, smoothstep(k / 4)), this.pathY(tk), this.zBase + tk * SPEED, UP_TOL[segAt(this.plan, tk).kind] ?? 2.7);
    }
    // pallone bonus e tempesta: in una corsia che la rotta non attraversa mai (sempre ≥ 5,4 m dalla linea)
    if (this.cn >= 3 && this.cn % 3 === 0 && Math.abs(lane - p.lane) < 2 && seg.kind !== 'climb' && seg.kind !== 'cool' && seg.kind !== 'warm') {
      const cands = [-1, 0, 1].filter((l) => l !== p.lane && l !== lane);
      if (cands.length) {
        const pl = cands[r() < 0.5 ? 0 : cands.length - 1]; const tp = p.t + (ta - p.t) * 0.3;
        this.addPod(-pl * LANE_W, this.pathY(tp), this.zBase + tp * SPEED, UP_TOL[segAt(this.plan, tp).kind] ?? 2.7);
        if (r() < 0.65) { const ts = p.t + (ta - p.t) * 0.78; this.addStorm(-pl * LANE_W, this.pathY(ts), this.zBase + ts * SPEED); }
      }
    }
    // termica nei recuperi, raffica negli sforzi: una per tratto, a metà fra due anelli
    const mid = p.t + (ta - p.t) * 0.5; const xm = lerp(p.x, x, 0.5);
    if (seg.kind === 'rest' && !seg.thermal && mid > seg.t0 + 5) { seg.thermal = true; this.addThermal(xm, this.pathY(mid), this.zBase + mid * SPEED); }
    if (seg.kind === 'effort' && !seg.gust && mid > seg.t0 + 6) { seg.gust = true; this.addGust(xm, this.pathY(mid), this.zBase + mid * SPEED); }
    this.cn++; this.prev = { t: ta, z, x, lane }; this.nextRingT = ta + RING_EVERY;
  }

  addRing(x, y, z, seg, ta) {
    const g = new THREE.Group(); const kind = seg.kind;
    const ringMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true });
    const filmMat = new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(this.ringGeos[kind], ringMat); const film = new THREE.Mesh(this.filmGeo, filmMat);
    const ground = Math.max(terrainH(x, z), 0);
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat); beam.scale.y = Math.max(0.1, y - RING_R - ground); beam.position.set(0, ground - y, 0);
    g.add(ring, film, beam); g.position.set(x, y, z); this.stage.scene.add(g);
    const wave = seg.wave; this.waveRings[wave] = (this.waveRings[wave] || 0) + 1; this.ringsTotal++;
    const up = UP_TOL[kind] ?? 2.7;
    this.items.push({ kind: 'ring', group: g, ring, film, ringMat, filmMat, x, y, z, wave, flash: 0, seg: kind, up });
  }

  addCoin(x, y, z, up = 1.9) {
    const g = new THREE.Group(); g.add(new THREE.Mesh(this.coinGeo, this.coinMat), new THREE.Mesh(this.coinRimGeo, this.coinRimMat));
    g.position.set(x, y, z); this.stage.scene.add(g); this.items.push({ kind: 'coin', group: g, x, y, z, up: Math.min(up, 26) });
  }

  addPod(x, y, z, up = 2.2) {
    const g = new THREE.Group(); const b = new THREE.Mesh(this.podGeo, this.podMat); const h = new THREE.Mesh(this.podHaloGeo, this.podHaloMat); h.rotation.x = Math.PI / 2.4;
    g.add(b, h); g.position.set(x, y, z); this.stage.scene.add(g); this.items.push({ kind: 'pod', group: g, x, y, z, halo: h, up: Math.min(up, 26) });
  }

  addStorm(x, y, z) {
    const g = new THREE.Group(); const r = this.rnd;
    for (const [dx, dy, dz, s] of [[0, 0, 0, 2.1], [-1.5, -0.3, 0.2, 1.5], [1.5, -0.2, -0.2, 1.6], [-0.6, 1.0, 0.4, 1.3], [0.8, 0.9, -0.3, 1.4]]) { const m = new THREE.Mesh(this.stormGeo, this.stormMat); m.position.set(dx, dy, dz); m.scale.setScalar(s * (0.9 + r() * 0.2)); g.add(m); }
    const bolt = new THREE.Mesh(this.boltGeo, this.boltMat); bolt.position.set(0.2, -2.8, -2.4); bolt.scale.setScalar(1.3); g.add(bolt);
    g.position.set(x, y, z); this.stage.scene.add(g); this.items.push({ kind: 'storm', group: g, x, y, z, bolt });
  }

  addThermal(x, y, z) {
    const g = new THREE.Group(); const col = new THREE.Mesh(this.thermGeo, this.thermMat); col.position.y = 8; g.add(col);
    const rings = [0, 1, 2].map((i) => { const m = new THREE.Mesh(this.thermRingGeo, this.thermRingMat); g.add(m); return m; });
    const gy = Math.max(terrainH(x, z), 0); g.position.set(x, gy, z); this.stage.scene.add(g); this.items.push({ kind: 'thermal', group: g, x, y, z, rings, gy });
  }

  addGust(x, y, z) {
    const g = new THREE.Group(); const r = this.rnd;
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(this.gustGeo, this.gustMat); m.position.set((r() - 0.5) * 16, (r() - 0.5) * 7 + 1.5, (r() - 0.5) * 26); m.scale.z = 0.6 + r() * 1.2; g.add(m); }
    g.position.set(x, y, z); this.stage.scene.add(g); this.items.push({ kind: 'gust', group: g, x, y, z });
  }

  dropItem(it) {
    this.stage.scene.remove(it.group);
    if (it.kind === 'ring') { it.ringMat.dispose(); it.filmMat.dispose(); }
  }

  // ---------- il piano: cambio di tratto, giudizio degli sforzi, adattamento ----------
  enterSeg(i) {
    const prev = this.seg; const seg = this.plan.segs[i]; const first = this.segIdx < 0;
    if (!first) this.judge(prev);
    this.segIdx = i; this.seg = seg; seg.inT = 0; seg.okT = 0;
    const W = targetW(seg, this.ftp, this.level.k, this.adapt.value, this.el);
    const N = this.plan.N;
    if (this.wk && seg.wave >= 1 && seg.wave <= N && seg.wave !== prev?.wave && seg.kind !== 'pace') this.ev('wave');
    if (seg.kind === 'warm' && !first && prev?.kind === 'warm') { /* riscaldamento lungo spezzato in ondate: un solo annuncio */ }
    else if (seg.kind === 'warm') { this.say(t('games.planata.say.warm'), SEG_COLOR.warm, 3, true, 2, t('games.planata.say.warmSub')); this.ev('start'); }
    else if (seg.kind === 'pace') { this.say(t('games.planata.say.wave', { n: seg.wave, m: N }), '#d9ff3d', 2.6, true, 3, t('games.planata.say.waveSub', { w: W })); this.ev('wave'); }
    else if (seg.kind === 'effort') { this.say(t('games.planata.say.effort', { w: W }), SEG_COLOR.effort, 2.4, true, 3, t('games.planata.say.effortSub')); this.audio.sfx('go'); this.ev('segment'); }
    else if (seg.kind === 'climb') { this.say(t('games.planata.say.climb', { w: W }), SEG_COLOR.climb, 2.4, true, 3, t('games.planata.say.climbSub', { s: Math.round(seg.t1 - seg.t0) })); this.audio.sfx('alarm'); this.ev('segment'); }
    else if (seg.kind === 'rest') { this.say(t('games.planata.say.rest'), SEG_COLOR.rest, 2.4, true, 2, t('games.planata.say.restSub', { w: W })); this.ev('segment'); }
    else if (seg.kind === 'cool') this.startCool();
  }

  // uno sforzo (o salita) è riuscito se per il tempo giusto hai tenuto almeno il 92 % dei watt richiesti
  judge(seg) {
    if (seg.kind !== 'effort' && seg.kind !== 'climb') return;
    const need = Math.max(1, seg.t1 - seg.t0 - (seg.kind === 'climb' ? 2 : 4));
    const ok = seg.okT / need >= (seg.kind === 'climb' ? 0.5 : 0.65);
    this.effortsTotal++;
    if (ok) {
      this.effortsDone++; this.score += 300 * (1 + Math.floor(this.el / 60)); this.audio.sfx('rescue');
      this.say(t(seg.kind === 'climb' ? 'games.planata.climbOk' : 'games.planata.effortOk'), '#7dff6a', 1.8, true, 2); this.prog('sprintsWon', seg.kind === 'climb' ? 1 : 0, 20);
    } else this.say(t('games.planata.effortKo'), '#ffb84d', 1.6, false, 1);
    this.ev(ok ? 'effortOk' : 'effortKo');
    const moved = this.wk ? 0 : this.adapt.report(ok); // con un allenamento i watt li decide lui
    if (moved) this.say(t(moved < 0 ? 'games.planata.adaptDown' : 'games.planata.adaptUp'), moved < 0 ? '#4de3ff' : '#ffd34d', 2.2, false, 2);
  }

  startCool() {
    this.finishResult();
    this.say(t('games.planata.say.cool'), SEG_COLOR.cool, 3, true, 3, t('games.planata.say.coolSub', { w: targetW(this.seg, this.ftp, 0, 0, this.el) }));
    this.audio.sfx('win');
  }

  finishResult(update = false) {
    // con un allenamento le stelle sono le stesse di tutti i giochi: tempo entro ±7 % del bersaglio (kit/workout-plan.js)
    const s = this.wk ? { stars: workoutStars(this.band.ratio, true), ratio: this.band.ratio } : starsFor({ done: this.effortsDone, total: this.effortsTotal, hits: this.hits });
    const rec = this.recStart || (this.recStart = this.record()); const prevBest = rec.score || 0; const score = Math.round(this.score);
    const newBest = score > prevBest;
    if (!this.wk && (newBest || s.stars > (rec.stars || 0))) { try { localStorage.setItem(this.recordKey(), JSON.stringify({ score: Math.max(prevBest, score), stars: Math.max(rec.stars || 0, s.stars) })); } catch { /* niente storage */ } }
    this.result = { ...s, done: this.effortsDone, total: this.effortsTotal, rings: this.rings, ringsTotal: this.ringsTotal, hits: this.hits, score, newBest, prevStars: rec.stars || 0, bestCombo: this.bestCombo };
    this.result.hint = this.wk ? null : nextStarHint(this.result); this.result.wk = !!this.wk; this.result.band = this.band.ratio;
    if (update) return;
    this.prog('races', 0, 40 + s.stars * 40 + this.effortsDone * 10);
    this.hooks.progress?.setMax('planataStars', s.stars);
    this.hooks.progress?.setMax('planataDist', Math.round(this.z - this.zBase));
  }

  // ---------- aggiornamento ----------
  update(dt) {
    this.t += dt;
    const connected = this.hooks.connected(); const st = this.hooks.stats(); const ftp = this.ftp;
    // senza rullo la demo simula 0,8 × FTP con scatti (e un po' meno nel recupero)
    const demo = !connected; this.connected = connected;
    const rest = this.state === 'play' && (this.seg?.kind === 'rest' || this.seg?.kind === 'cool');
    const demoP = demo && this.wk && this.seg ? targetW(this.seg, ftp, 0, 0, this.el) : demo ? ftp * (rest ? 0.58 : 0.8) * (((this.t % 40) > 31 && !rest) ? 1.6 : 1) : 0;
    this.power = connected ? st.power || 0 : demoP;
    this.cadence = connected ? st.cadence || 0 : 88;
    this.pw += (this.power - this.pw) * Math.min(1, dt / 0.9);
    this.kmh = connected ? this.hooks.speedKmh() : 28;
    if (this.audio.song) this.audio.setTempo(this.audio.song.bpm * clamp((this.cadence || 85) / 88, 0.85, 1.25));
    this.msgs.update(dt);
    if (this.state === 'loading' || this.state === 'error') return;
    this.fx.update(dt);
    this.stateT += dt;
    if (this.state === 'menu') { this.menuTick(dt, connected); this.cruise(dt); this.view(dt); return; }
    if (this.state === 'results') { this.results.update(dt); this.rollOut(dt); this.view(dt); return; }
    // pausa: chi smette di pedalare non perde, il tempo si ferma. Con un allenamento il tempo è il suo e non si ferma: il rullo è in ERG
    if (connected && !this.wk) {
      if (this.power < 12) { this.pauseT += dt; if (this.pauseT > 2.5 && !this.paused) { this.paused = true; this.audio.sfx('beep'); } } else if (this.power > 25) { this.pauseT = 0; this.paused = false; }
    }
    if (this.paused) { this.view(dt, true); return; }
    this.sim(dt); this.view(dt);
  }

  // il menu: l'aereo veleggia sul posto
  cruise(dt) { this.z += dt * 8; this.y = lerp(this.y, altOf(0.7) + Math.sin(this.t * 0.8) * 0.5, Math.min(1, dt * 2)); this.x = lerp(this.x, 0, Math.min(1, dt * 3)); this.updateWorld(); }

  rollOut(dt) { this.rollV = Math.max(0, (this.rollV ?? SPEED) - dt * 7); this.z += this.rollV * dt; this.y = lerp(this.y, RW_Y + this.baseOff(), Math.min(1, dt * 6)); this.x = lerp(this.x, 0, Math.min(1, dt * 2)); this.updateWorld(); }

  baseOff() { return this.halfH + 0.05; }

  sim(dt) {
    const ftp = this.ftp;
    if (this.wk) { const e0 = this.el; this.el = this.wc.tick(dt); this.z += SPEED * (this.el - e0); if (this.wc.ended) { this.finish(); return; } } else { this.el += dt; this.z += SPEED * dt; }
    // il tratto dell'allenamento
    let seg = segAt(this.plan, this.el); const idx = this.plan.segs.indexOf(seg);
    if (idx !== this.segIdx) { this.enterSeg(idx); seg = this.seg; }
    if (this.el >= this.total) { this.finish(); return; }
    const tgt = targetW(seg, ftp, this.level.k, this.adapt.value, this.el); this.tgtW = tgt;
    seg.inT += dt;
    if (this.wk) this.band.add(dt, this.pw, tgt, this.el - seg.stepStart);
    if ((seg.kind === 'effort' || seg.kind === 'climb') && seg.inT > (seg.kind === 'climb' ? 2 : 4) && this.pw >= 0.92 * tgt) seg.okT += dt;
    this.inTarget = this.pw >= 0.92 * tgt; this.sprinting = seg.kind === 'climb' && this.inTarget;
    const g = seg.kind === 'rest' || seg.kind === 'cool' ? 0 : seg.kind === 'warm' ? 1 : seg.kind === 'pace' ? 2 : 3;
    if (!this.wk && g !== this.sentGrade) { this.sentGrade = g; this.hooks.setGrade(g); }
    this.hurtT = Math.max(0, this.hurtT - dt); this.boostT = Math.max(0, this.boostT - dt); this.manualT = Math.max(0, this.manualT - dt);
    // quota: la potenza (smussata) è la percentuale di FTP; l'aereo la insegue morbido, come un volo e non un grafico
    // Quota = watt. Con un allenamento il rullo è in ERG e segue da solo il bersaglio: la quota segue il profilo dell'allenamento
    // e i tuoi watt la spostano di poco (al massimo ±10 % della FTP): chi segue l'allenamento passa gli anelli, chi non pedala no.
    const pPath = this.wk ? profilePct(this.plan, this.el, this.level.k, this.adapt.value) : 0;
    const ty = altOf(this.wk ? clamp(pPath + clamp(this.pw / ftp - pPath, -0.1, 0.1), 0, 1.4) : clamp(this.pw / ftp, 0, 1.4));
    this.gustK = lerp(this.gustK, 0, Math.min(1, dt * 2.2));
    let y = this.y; const y0 = y;
    y += (ty - GUST_DROP * this.gustK - y) * (1 - Math.exp(-dt * 3));
    // atterraggio: negli ultimi secondi si scende sulla pista qualunque sia la potenza
    const toEnd = this.total - this.el;
    if (toEnd < LAND_S) {
      this.landing = 1 - toEnd / LAND_S;
      y = lerp(y, RW_Y + this.baseOff(), smoothstep(this.landing) * 0.35 + (this.landing > 0.4 ? 0.2 : 0));
      if (this.landing > 0.8) y = Math.max(y, RW_Y + this.baseOff());
      if (!this.landMsg) { this.landMsg = true; this.say(t('games.planata.say.land'), '#a0f0c0', 2.4, true, 3, t('games.planata.say.landSub')); this.ev('land'); }
    } else { this.landing = 0; this.landMsg = false; }
    this.vy = (y - y0) / Math.max(dt, 1e-3); this.y = y;
    // pilota automatico: segue la linea degli anelli; un tocco di + / − lo spegne per qualche secondo
    const px = this.manualT > 0 ? -this.lane * LANE_W : this.pathX();
    const x0 = this.x; this.x = lerp(this.x, this.landing > 0 ? 0 : px, 1 - Math.exp(-dt * (this.manualT > 0 ? 6 : 5)));
    this.vx = (this.x - x0) / Math.max(dt, 1e-3);
    this.spawnCourse();
    this.pass();
    this.items = this.items.filter((it) => { if (it.z < this.z - 30) { this.dropItem(it); return false; } return true; });
  }

  // x della linea degli anelli alla posizione attuale (curva dolce fra un anello e il prossimo)
  pathX() {
    const next = this.items.find((it) => it.kind === 'ring' && it.z >= this.z - 0.01);
    const a = this.lastRing; if (!next) return a.x;
    return lerp(a.x, next.x, smoothstep((this.z - a.z) / Math.max(1, next.z - a.z)));
  }

  // oggetti che l'aereo supera in questo fotogramma
  pass() {
    for (const it of this.items) {
      if (it.kind === 'thermal' || it.kind === 'gust') { this.zone(it); continue; }
      if (it.done || this.z < it.z) continue;
      it.done = true;
      const dx = this.x - it.x; const dy = this.y - it.y; const d = Math.hypot(dx, dy); const mult = this.boostT > 0 ? 2 : 1;
      const inside = (lim = HIT_R) => (dy > 0 && it.up > HIT_R ? Math.abs(dx) < HIT_R && dy < it.up : d < lim);
      if (it.kind === 'ring') {
        this.lastRing = { t: 0, z: it.z, x: it.x, lane: 0 };
        this.ev(inside() ? 'ring' : 'ringMiss');
        if (inside()) {
          this.combo++; this.rings++; this.waveHit[it.wave] = (this.waveHit[it.wave] || 0) + 1; this.bestCombo = Math.max(this.bestCombo, this.combo);
          const perfect = d < PERFECT_R; const pts = 25 * Math.min(this.combo, 8) * mult * (perfect ? 2 : 1); this.score += pts;
          this.audio.sfx('coin'); this.prog('coins', 1, 1);
          this.pop(`${perfect ? '★ ' : ''}+${pts}${this.combo > 1 ? ` ×${Math.min(this.combo, 8)}` : ''}`, perfect ? '#fff06a' : '#ffcc33');
          this.fx.spawn(it.x, it.y, it.z, { tex: 'spark', size: 5, life: 0.35 }); this.shake.add(perfect ? 0.16 : 0.1);
          it.flash = 1; it.hit = true; it.filmMat.color.set('#7dff6a');
          if (this.combo === 5 || this.combo === 10 || this.combo === 20) this.say(t('games.planata.comboSay', { n: this.combo }), '#ffcc33', 1.3, false, 2);
        } else {
          if (this.combo >= 3) this.say(t('games.planata.comboLost'), '#ffb84d', 1.1, false, 1);
          this.combo = 0; it.flash = 1; it.hit = false; it.ringMat.color.set('#9a9aa4'); it.filmMat.color.set('#ff5a6a');
          this.pop(this.y > it.y ? t('games.planata.tooHigh') : t('games.planata.tooLow'), '#ffb84d');
        }
      } else if (it.kind === 'coin') {
        if (it.up > 1.9 && dy > 0 ? Math.abs(dx) < 1.9 && dy < it.up : d < 1.9) { this.coins++; this.score += 5 * mult; this.ev('coin'); this.audio.sfx('pickup'); this.fx.spawn(it.x, it.y, it.z, { tex: 'spark', size: 1.6, life: 0.22 }); it.group.visible = false; }
      } else if (it.kind === 'pod') {
        if (it.up > 2.2 && dy > 0 ? Math.abs(dx) < 2.2 && dy < it.up : d < 2.2) { this.pods++; this.score += 60 * mult; this.ev('pod'); this.audio.sfx('rescue'); this.pop(`+${60 * mult}`, '#ff8cc4'); this.fx.spawn(it.x, it.y, it.z, { tex: 'spark', size: 5, life: 0.4, color: '#ff8cc4' }); this.shake.add(0.1); it.group.visible = false; this.say(t('games.planata.podSay'), '#ff8cc4', 1.2, false, 1); }
      } else if (it.kind === 'storm') {
        this.ev('storm');
        if (d < 3.0 && this.hurtT <= 0) this.hitStorm(it);
      }
    }
  }

  // termica: ×2 per 6 s; raffica: spinge giù di un metro per un attimo
  zone(it) {
    if (it.done) return;
    const dz = this.z - it.z;
    if (it.kind === 'thermal' && Math.abs(dz) < 10 && Math.abs(this.x - it.x) < 4) {
      it.done = true; this.boostT = 6; this.ev('thermal'); this.audio.sfx('boost');
      this.say(t('games.planata.thermal'), '#ffe27a', 2, true, 2, t('games.planata.thermalSub')); this.shake.add(0.12);
    } else if (it.kind === 'gust' && Math.abs(dz) < 16) {
      if (!it.started) { it.started = true; this.ev('gust'); this.audio.sfx('whoosh'); this.say(t('games.planata.gust'), '#cfe9ff', 1.8, true, 2, t('games.planata.gustSub')); this.shake.add(0.3); }
      this.gustK = Math.max(this.gustK, 1 - Math.abs(dz) / 16);
      if (dz > 10) it.done = true;
    }
  }

  hitStorm(it) {
    this.hits++; this.combo = 0; this.hurtT = 1.2;
    this.audio.sfx('hurt'); this.fx.explode(this.x, this.y + 0.5, this.z, 0.9); this.shake.add(0.5);
    this.say(t('games.planata.storm'), '#ff6b6b', 1.6, true, 2, t('games.planata.stormSub'));
    if (navigator.vibrate) navigator.vibrate(120);
  }

  // ---------- grafica per fotogramma ----------
  view(dt, still = false) {
    const cam = this.stage.camera; const playing = this.state === 'play';
    if (this.state === 'menu') { /* il menu veleggia: z avanza in cruise() */ }
    this.updateWorld();
    this.shake.update(dt);
    // aereo: muso su e giù con la quota, ala inclinata nelle virate
    const pitchT = clamp(this.vy * 0.045, -0.3, 0.3);
    this.pitch = lerp(this.pitch, pitchT, Math.min(1, dt * 4));
    this.roll = lerp(this.roll, clamp(-(this.vx || 0) * 0.035, -0.22, 0.22), Math.min(1, dt * 5));
    this.plane.position.set(this.x, this.y, this.z);
    this.plane.rotation.set(-this.pitch, 0, this.roll + Math.sin(this.t * 1.7) * 0.03);
    this.plane.visible = !(this.hurtT > 0 && Math.floor(this.hurtT * 12) % 2);
    // elica e gambe: sempre in movimento (cadenza vera; in pausa o nel menu un giro lento)
    const cad = this.paused ? 20 : (this.cadence || 60);
    const rps = clamp(cad / 60, 0.4, 2.2) * 2.2; this.prop.spin.rotation.z += Math.min(rps * Math.PI * 2 * dt, 1.2);
    const blur = clamp((rps - 0.8) / 1.6, 0, 1);
    this.prop.disc.material.opacity = 0.32 * blur; this.prop.blade.material.opacity = 1 - 0.75 * blur;
    this.rider.pose(dt, Math.max(cad, 30), SPEED);
    this.riderMount.rotation.z = Math.sin(this.t * 1.3) * 0.015;
    // ombra sul terreno
    const gy = onRunway(this.x, this.z, 0) ? RW_Y : Math.max(terrainH(this.x, this.z), WATER_Y);
    this.blob.position.set(this.x, gy + 0.08, this.z); const h = Math.max(0, this.y - gy); this.blob.scale.set(3.2 + h * 0.03, 1.8 + h * 0.02, 1); this.blob.material.opacity = clamp(0.32 - h * 0.012, 0.08, 0.32);
    // anelli, stelle, palloni, tempeste, termiche
    for (const it of this.items) {
      const gk = it.group;
      if (it.kind === 'ring') {
        const k = it.flash > 0 ? (it.flash = Math.max(0, it.flash - dt * 3.4)) : 0;
        if (!it.done) { it.ring.rotation.z = this.t * 0.8; it.filmMat.opacity = 0.14 + 0.06 * Math.sin(this.t * 4 + it.z); } else {
          const s = it.hit ? 1 + (1 - k) * 0.35 : 1; it.ring.scale.setScalar(s); it.film.scale.setScalar(s);
          it.filmMat.opacity = (it.hit ? 0.4 : 0.25) * k; it.ringMat.opacity = clamp(k * 1.4, 0, 1); if (it.hit) it.ringMat.color.setScalar(0.4 + k * 0.6);
          if (k <= 0) gk.visible = false;
        }
      } else if (it.kind === 'coin') { gk.rotation.y = this.t * 3.2 + it.z; if (it.done) { it.fade = Math.min(1, (it.fade || 0) + dt * 6); gk.scale.setScalar(Math.max(0.001, 1 - it.fade)); } }
      else if (it.kind === 'pod') { gk.position.y = it.y + Math.sin(this.t * 2.4 + it.z) * 0.3; it.halo.rotation.z = this.t * 1.6; }
      else if (it.kind === 'storm') { gk.rotation.y = Math.sin(this.t * 0.7 + it.z) * 0.25; it.bolt.visible = Math.sin(this.t * 17 + it.z) > -0.35; }
      else if (it.kind === 'thermal') it.rings.forEach((m, i) => { const k = (this.t * 0.5 + i / 3) % 1; m.position.y = k * 24; m.material.opacity = 0.8 * (1 - k); });
      else if (it.kind === 'gust') gk.children.forEach((m, i) => { m.position.z = ((m.position.z + 13 + dt * 38) % 26) - 13; });
    }
    // effetti di velocità: linee di vento, campo visivo più largo spingendo
    const strength = playing ? clamp((this.pw / this.ftp - 0.8) * 1.6 + (this.sprinting ? 0.4 : 0), 0.15, 1) : 0.1;
    this.streaks.update(dt, this.plane.position, SPEED, strength * (this.streakMax / 56));
    // camera: dietro e sopra, il telefono in verticale sta più vicino
    const tall = this.stage.H > this.stage.W; const back = tall ? CAM_BACK_T : CAM_BACK; const up = tall ? CAM_UP_T : CAM_UP;
    const target = new THREE.Vector3(this.x * 0.85, this.y + up, this.z - back);
    if (!this.camInit) { cam.position.copy(target); this.camInit = true; }
    cam.position.lerp(target, Math.min(1, dt * 3.5));
    const mf = this.state === 'menu' ? this.menuFrame(cam, tall, back, up) : null;
    const lift = mf ? mf.lift : (this.state === 'results' || this.seg?.kind === 'cool') ? (tall ? 3.2 : 1.2) : 0; this.lift = lerp(this.lift ?? 0, lift, Math.min(1, dt * 3));
    this.lookX = lerp(this.lookX ?? 0, mf ? mf.sx : 0, Math.min(1, dt * 3));
    cam.lookAt(this.x * 0.9 + this.lookX, this.y - 0.2 + this.lift, this.z + 22);
    this.shake.apply(cam);
    const fov = (tall ? 64 : 58) + strength * 6; cam.fov += (fov - cam.fov) * Math.min(1, dt * 2.5); cam.updateProjectionMatrix();
    this.light.follow(this.x, 0, this.z);
    const cx = cam.position.x; const cz = cam.position.z;
    for (const l of this.layers) l.inst.cull(cx, cz, 0, 1, 330, 20);
  }

  // menu: l'aereo sta nella fascia libera (verticale: fra il testo e il tasto; orizzontale: a destra della colonna di testo)
  menuFrame(cam, tall, back, up) {
    const W = this.stage.W; const H = this.stage.H; const m = this.menu; const half = Math.tan(cam.fov * Math.PI / 360); const D = back + 22;
    if (tall) {
      const cb = m.contentBottom ?? H * 0.55; const st = m.startTop ?? H * 0.85; const ny = 1 - 2 * ((cb + (st - cb) * 0.8) / H); // il ciclista sta sopra l'aereo: centro un po' sotto metà fascia
      const down = Math.atan(up / back) + Math.atan(ny * half); // angolo sotto l'orizzontale dell'asse della camera
      return { lift: up - Math.tan(down) * D + 0.2, sx: 0 };
    }
    const colR = 24 + Math.min(W * 0.38, 440) + 40; const nx = 2 * ((colR + W) / 2 / W) - 1;
    return { lift: 2, sx: nx * half * (W / H) * D };
  }

  loop(now) {
    if (!this.active) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.update(dt);
    if (this.plane) this.stage.render();
    this.drawHud(dt);
    requestAnimationFrame(this.loop);
  }

  // ---------- interfaccia ----------
  // in alto: punteggio · ondata n/N · combo; sotto la richiesta del momento (tratto, watt, tempo) e le barre;
  // poi l'obiettivo (anelli di quest'ondata, distanza dalla pista). A destra l'altimetro, in basso la potenza.
  // Tutto con kit/hud.js: leggibile da 1 m, senza sovrapposizioni.
  drawHud(dt) {
    const { ctx, W, H } = this.stage;
    ctx.clearRect(0, 0, W, H); hudView(ctx, W, H);
    if (this.state === 'loading') { ctx.fillStyle = '#0f0e0c'; ctx.fillRect(0, 0, W, H); hudText(ctx, t('games.common.loading'), W / 2, H / 2, { size: 22, align: 'center', color: '#d9ff3d' }); hudText(ctx, `${Math.round((this.loadPct || 0) * 100)}%`, W / 2, H / 2 + 28, { size: 14, align: 'center' }); return; }
    if (this.state === 'error') { hudText(ctx, t('ui.error', { error: this.error }), W / 2, H / 2, { size: 14, align: 'center', color: '#ff6b6b' }); return; }
    if (this.state === 'menu') { this.menu.draw(ctx, W, H, { connected: this.hooks.connected() }); this.hooks.progress?.drawToasts(ctx, W, dt); return; }
    if (this.state === 'results') { if (this.result) this.drawResult(ctx, W, H, true); this.hooks.progress?.drawToasts(ctx, W, dt, W > H * 1.15 ? Math.round(H * 0.78) : 330, true); return; }
    const seg = this.seg; const pad = 12; const y0 = 84; const ftp = this.ftp;
    const col = SEG_COLOR[seg.kind]; const tw = this.tgtW || targetW(seg, ftp, this.level.k, this.adapt.value, this.el);
    // riga in alto
    ctx.fillStyle = 'rgba(8,10,26,.62)'; rrect(ctx, pad - 4, y0 - 22, W - 2 * pad + 8, 36, 10); ctx.fill();
    hudText(ctx, String(Math.round(this.score)), pad + 6, y0 + 5, { size: 26, maxW: 100 });
    const wn = t('games.planata.waveOf', { n: clamp(seg.wave, 0, this.plan.N), m: this.plan.N });
    hudText(ctx, wn, W / 2, y0 + 3, { size: W < 400 ? 19 : 22, align: 'center', color: '#d9ff3d', maxW: W - 2 * (pad + 100) });
    if (this.combo > 1) hudText(ctx, `×${Math.min(this.combo, 8)}`, W - pad - 6, y0 + 5, { size: 26, align: 'right', color: HUD.gold, maxW: 90 });
    else if (this.boostT > 0) hudText(ctx, '×2', W - pad - 6, y0 + 5, { size: 26, align: 'right', color: '#ffe27a', maxW: 90 });
    // la richiesta del momento
    const by = y0 + 22; const bh2 = 44;
    ctx.fillStyle = 'rgba(8,10,26,.72)'; rrect(ctx, pad - 4, by, W - 2 * pad + 8, bh2, 12); ctx.fill();
    ctx.fillStyle = col; rrect(ctx, pad - 4, by, 7, bh2, 3); ctx.fill();
    const left = Math.max(0, Math.ceil((this.wk ? seg.stepEnd : seg.t1) - this.el)); // con un allenamento: nome del passo e tempo che manca alla fine del passo
    hudText(ctx, this.wk ? (seg.label || t(`games.wk.seg.${seg.wkKind}`)) : t(`games.planata.seg.${seg.kind}`), pad + 12, by + 29, { size: 21, color: col, maxW: W * 0.34 });
    const calm = seg.kind === 'rest' || seg.kind === 'cool' || seg.kind === 'warm';
    hudText(ctx, `${tw} W`, W / 2 + 8, by + 32, { size: 32, align: 'center', color: this.inTarget || calm ? '#ffffff' : '#ffd34d', maxW: W * 0.34 });
    hudText(ctx, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, W - pad - 4, by + 29, { size: 21, align: 'right', color: '#e8e8f4', maxW: 70 });
    const segK = this.wk ? clamp((seg.stepEnd - this.el) / (seg.stepEnd - seg.stepStart), 0, 1) : clamp((seg.t1 - this.el) / (seg.t1 - seg.t0), 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; rrect(ctx, pad, by + bh2 + 4, W - 2 * pad, 6, 3); ctx.fill();
    ctx.fillStyle = col; rrect(ctx, pad, by + bh2 + 4, Math.max(6, (W - 2 * pad) * segK), 6, 3); ctx.fill();
    const ty = by + bh2 + 15; const tk = clamp(this.el / this.total, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; rrect(ctx, pad, ty, W - 2 * pad, 5, 2.5); ctx.fill();
    ctx.fillStyle = '#d9ff3d'; rrect(ctx, pad, ty, Math.max(5, (W - 2 * pad) * tk), 5, 2.5); ctx.fill();
    ctx.fillStyle = 'rgba(8,10,26,.9)';
    for (const [i, s] of this.plan.segs.entries()) if (this.wk ? (s.wave >= 1 && s.wave !== this.plan.segs[i - 1]?.wave) : s.kind === 'pace') ctx.fillRect(pad + (W - 2 * pad) * (s.t0 / this.total) - 1, ty - 1, 2, 7);
    // obiettivo: anelli di quest'ondata e distanza dalla pista
    const gy = ty + 14; const pw2 = (W - 2 * pad - 8) / 2; const gh = 28;
    const a = this.waveHit[seg.wave] || 0; const b = this.waveRings[seg.wave] || 0; const dist = Math.max(0, this.total - this.el) * SPEED;
    ctx.fillStyle = 'rgba(8,10,26,.66)'; rrect(ctx, pad, gy, pw2, gh, 9); ctx.fill(); rrect(ctx, pad + pw2 + 8, gy, pw2, gh, 9); ctx.fill();
    hudText(ctx, t('games.planata.goalRings', { a, b }), pad + pw2 / 2, gy + 21, { size: 18, align: 'center', color: '#ffe9a8', maxW: pw2 - 12 });
    hudText(ctx, t('games.planata.goalStrip', { d: dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist / 10) * 10} m` }), pad + pw2 * 1.5 + 8, gy + 21, { size: 18, align: 'center', color: '#a0f0c0', maxW: pw2 - 12 });
    if (!this.hooks.connected()) hudText(ctx, t('games.common.demo'), W / 2, gy + gh + 17, { size: 13, align: 'center', color: '#ffd34d' });

    // altimetro: 50 % in basso, 130 % in alto; il segno dorato è dove sta il prossimo anello
    if (seg.kind !== 'cool' && this.state !== 'results') this.drawAltimeter(ctx, W, H, ftp, pad);
    // in basso: potenza (numero grande + barra con il bersaglio)
    const bh = 22; const barY = H - 16 - bh; const bx = pad + 2; const bw2 = W - 2 * pad - 4;
    const gr = ctx.createLinearGradient(0, H - 118, 0, H); gr.addColorStop(0, 'rgba(6,8,22,0)'); gr.addColorStop(0.35, 'rgba(6,8,22,.55)'); gr.addColorStop(1, 'rgba(6,8,22,.82)');
    ctx.fillStyle = gr; ctx.fillRect(0, H - 118, W, 118);
    const pc = this.sprinting ? '#4de3ff' : this.inTarget ? '#d9ff3d' : '#ffffff';
    const numW = hudText(ctx, String(Math.round(this.power)), pad + 4, barY - 10, { size: W < 500 ? 56 : 64, color: pc, maxW: 150 });
    hudText(ctx, 'W', pad + 8 + numW, barY - 10, { size: 22, color: '#e8e8f4' });
    ctx.fillStyle = 'rgba(8,10,26,.75)'; rrect(ctx, bx, barY, bw2, bh, 8); ctx.fill();
    const maxW = Math.max(ftp * 1.7, tw * 1.25);
    ctx.fillStyle = pc; rrect(ctx, bx, barY, Math.max(8, bw2 * clamp(this.power / maxW, 0, 1)), bh, 8); ctx.fill();
    const t0 = bx + bw2 * clamp(0.92 * tw / maxW, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(t0, barY, Math.max(2, bx + bw2 * clamp(tw * 1.15 / maxW, 0, 1) - t0), bh);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx + bw2 * clamp(tw / maxW, 0, 1) - 1, barY - 4, 3, bh + 8);

    this.msgs.draw(ctx, W, H, { u: W < 500 ? 0.9 : 1.1, y: H * 0.34 });
    const v3 = new THREE.Vector3();
    for (const p of this.pops) {
      p.t -= dt; const k = 1 - p.t / p.t0;
      v3.set(this.x, this.y + 3.6 + k * 1.4, this.z).project(this.stage.camera);
      ctx.globalAlpha = clamp((p.t / p.t0) * 2, 0, 1);
      hudText(ctx, p.text, clamp((v3.x + 1) / 2 * W, 70, W - 90), clamp((1 - v3.y) / 2 * H, H * 0.44, H - 160), { size: 22, align: 'center', color: p.color, maxW: 150 });
      ctx.globalAlpha = 1;
    }
    this.pops = this.pops.filter((p) => p.t > 0 && this.state !== 'results');
    if (this.hurtT > 0.9) { ctx.fillStyle = `rgba(255,0,40,${(this.hurtT - 0.9) * 0.55})`; ctx.fillRect(0, 0, W, H); }
    if (this.paused) {
      ctx.fillStyle = 'rgba(8,10,26,.72)'; ctx.fillRect(0, 0, W, H);
      hudText(ctx, t('games.planata.paused'), W / 2, H * 0.42, { size: 42, align: 'center', color: '#ffd34d' });
      paragraph(ctx, t('games.planata.pausedSub'), W / 2, H * 0.42 + 36, { size: 20, maxW: W - 40, color: '#f0f0f0' });
    }
    if (this.result && seg.kind === 'cool') this.drawResult(ctx, W, H, false); // i riquadri dei traguardi non coprono l'azione: aspettano la fine del volo
  }

  // altimetro: sfondo pieno e scuro, 50 % in basso e 130 % in alto. Il riempimento azzurro con la freccia bianca sei tu,
  // l'anello dorato (con i watt) è il prossimo anello da passare.
  drawAltimeter(ctx, W, H, ftp, pad) {
    const aw = 30; const ax = W - pad - aw - 2; const ay = Math.round(H * 0.46); const ah = Math.max(120, H - 168 - ay);
    const yPx = (y) => ay + ah - clamp((y - Y_LO) / (Y_HI - Y_LO), 0, 1.04) * ah;
    ctx.fillStyle = '#0d1226'; rrect(ctx, ax - 4, ay - 4, aw + 8, ah + 8, 10); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
    const my = yPx(this.y);
    ctx.fillStyle = '#2aa9d6'; ctx.fillRect(ax + 3, my, aw - 6, ay + ah - my - 1);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 1; i < 4; i++) ctx.fillRect(ax + 3, Math.round(ay + ah - ah * i / 4) - 1, aw - 6, 2);
    hudText(ctx, `${Math.round(ftp * PCT_HI)}`, ax - 10, ay + 14, { size: 15, align: 'right', color: '#ffffff' });
    hudText(ctx, `${Math.round(ftp * PCT_LO)}`, ax - 10, ay + ah, { size: 15, align: 'right', color: '#ffffff' });
    const nr = this.items.find((it) => it.kind === 'ring' && !it.done);
    if (nr) {
      const py = yPx(nr.y); ctx.lineWidth = 5; ctx.strokeStyle = '#15141b'; ctx.fillStyle = HUD.gold;
      ctx.beginPath(); ctx.arc(ax + aw / 2, py, 8, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 3.5; ctx.strokeStyle = HUD.gold; ctx.stroke();
      const lab = `${Math.round(ftp * pctOf(nr.y) / 5) * 5}`; const ly = clamp(py + 7, ay + 28, ay + ah - 18);
      const lw = Math.max(40, lab.length * 12 + 14); ctx.fillStyle = 'rgba(13,18,38,.92)'; rrect(ctx, ax - 14 - lw, ly - 20, lw, 26, 8); ctx.fill();
      hudText(ctx, lab, ax - 20, ly, { size: 20, align: 'right', color: HUD.gold, stroke: null });
    }
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#15141b'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(ax + 4, my); ctx.lineTo(ax - 12, my - 9); ctx.lineTo(ax - 12, my + 9); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(ax + 3, my - 2, aw - 6, 4);
  }

  // riepilogo: stelle, sforzi tenuti, anelli, tempeste, record e cosa manca alla prossima stella
  drawResult(ctx, W, H, full) {
    const r = this.result;
    if (!full) { // durante la discesa: un riquadro piccolo sopra l'aereo (stelle, sforzi, anelli, punti)
      const top = Math.round(H * 0.4); const h = 122;
      ctx.fillStyle = 'rgba(8,10,26,.78)'; rrect(ctx, 12, top, W - 24, h, 14); ctx.fill();
      hudText(ctx, t('games.planata.res.title'), W / 2, top + 26, { size: 22, align: 'center', color: '#d9ff3d' });
      drawStars(ctx, W / 2, top + 52, 17, r.stars);
      hudText(ctx, `${t('games.planata.res.efforts', { a: r.done, b: r.total })} · ${t('games.planata.res.rings', { a: r.rings, b: r.ringsTotal })}`, W / 2, top + 91, { size: 15, align: 'center', color: '#f0f0f0', font: 'text', maxW: W - 40 });
      hudText(ctx, `${t('games.common.score', { n: r.score })}${r.newBest ? t('games.common.newBest') : ''}`, W / 2, top + 112, { size: 15, align: 'center', color: r.newBest ? '#7dff6a' : '#f0f0f0', font: 'text', maxW: W - 40 });
      return;
    }
    const r2 = this.result; const done = r2.total ? r2.done / r2.total : 0;
    this.results.draw(ctx, W, H, {
      title: t('games.planata.res.title'), subtitle: r2.wk ? this.wk.name : `${t('games.menu.min', { n: this.total / 60 })} · ${t(`games.menu.${this.level.id}`)}`, stars: r2.stars,
      criteria: r2.wk ? [{ ok: true, label: t('games.wk.res.done') }, { ok: r2.band >= 0.85, label: t('games.wk.res.band', { p: Math.round(r2.band * 100) }) }, { ok: r2.hits <= 3, label: t('games.planata.res.storms', { n: r2.hits }) }] : [{ ok: true, label: t('games.planata.res.cLand') }, { ok: done >= 0.5, label: t('games.planata.res.cHalf', { a: r2.done, b: r2.total }) }, { ok: done >= 0.8 && r2.hits <= 3, label: t('games.planata.res.cFull', { a: r2.done, b: r2.total, n: r2.hits }) }],
      score: r2.score, best: (this.record().score || 0) ? String(this.record().score) : null, newBest: r2.newBest,
      lines: [`${t('games.planata.res.rings', { a: r2.rings, b: r2.ringsTotal })} · ${t('games.planata.res.storms', { n: r2.hits })}`],
    });
  }
}

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
