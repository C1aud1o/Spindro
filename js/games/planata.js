// PLANATA — un aereo a pedali: i tuoi watt sono la quota. Più spingi, più sali.
// Passa nelle porte, scavalca le creste spingendo, abbassati sotto i ponti di roccia calando i watt.
// È un allenamento a intervalli travestito: le sezioni alte chiedono potenza, quelle basse recupero.
// Grafica come Turbo Pedali (docs/giochi-stile.md): aereo Meshy, terreno a valli e laghi, villaggi, nuvole e isole a istanze.
import * as THREE from 'three';
import { Effects } from './kit3d.js';
import { skyDome, styleLights, styleFog, toonMaterial, toonify } from './kit/style.js';
import { scatterModel, groundModel, prepareModel } from './kit/env.js';
import { Shake } from './kit/juice.js';
import { txt, panel, uiScale, powerColor, HUD } from './kit/hud.js';
import { clamp, lerp } from './engine.js';
import { Base3D } from './base3d.js';
import { t } from '../i18n.js';

const A = 'assets/3d';
const SIDE = 6.5;           // spostamento laterale massimo
const YMAX = 15;            // quota massima
const SEG = 26;             // metri tra un elemento e l'altro
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
  constructor(scene, gltf, cap, { kind = 'house', lodDist = 90 } = {}) {
    groundModel(gltf);
    this.info = prepareModel(gltf); this.cap = cap;
    const dummy = Array.from({ length: cap }, () => ({ x: 0, y: -999, z: 0, rot: 0, h: 1 }));
    this.inst = scatterModel(scene, gltf, dummy, { kind, lodDist });
    this.inst.baseLod = lodDist; this.n = 0;
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 1, 0); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
  }
  set(items) {
    const L = this.inst.list; const M = this.inst.mats; this.n = Math.min(items.length, this.cap);
    for (let i = 0; i < this.cap; i++) {
      if (i >= this.n) { L[i].keep = 9; continue; }
      const p = items[i]; const sc = p.h / this.info.height;
      L[i].x = p.x; L[i].z = p.z; L[i].keep = hash2(i, 3.7);
      M[i].compose(this.v.set(p.x, p.y, p.z), this.q.setFromAxisAngle(this.up, p.rot || 0), this.s.setScalar(sc));
    }
  }
}

// ---------- roccia a poligoni: cresta e ponte ----------
// Scatola con i vertici scossi e colori per faccia: sopra erba, sui lati roccia. Una geometria, un draw call.
function rockBox(w, h, d, sx, sy, sz, jitter, seed) {
  const g = new THREE.BoxGeometry(w, h, d, sx, sy, sz); g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const hh = hash2(x * 3.1 + seed, z * 2.3 + y * 1.7);
    if (y > 0.01) p.setY(i, y - 0.07 * hh); // non sale mai sopra la quota di collisione
    p.setX(i, x + (hash2(y + seed, z) - 0.5) * jitter * 0.9); p.setZ(i, z + (hash2(x, y + seed) - 0.5) * jitter * 0.9);
  }
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  const n = ng.attributes.position.count; const col = new Float32Array(n * 3); const nr = ng.attributes.normal; const c = new THREE.Color();
  const grass = new THREE.Color('#86b84f'); const rock1 = new THREE.Color('#a99a8c'); const rock2 = new THREE.Color('#8a7a6a');
  for (let i = 0; i < n; i++) {
    const up = nr.getY(i);
    c.copy(up > 0.75 ? grass : (hash2(Math.floor(i / 3), seed) > 0.5 ? rock1 : rock2));
    c.multiplyScalar(0.92 + 0.14 * hash2(Math.floor(i / 3), seed + 4));
    c.toArray(col, i * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3)); ng.deleteAttribute('uv');
  return ng;
}

// aereo: elica che gira alla cadenza (due pale e un disco trasparente)
function makePropeller() {
  const grp = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.2, 0.05), new THREE.MeshBasicMaterial({ color: '#2a2a33' }));
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: HUD.lime }));
  hub.position.z = 0.1;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const spin = new THREE.Group(); spin.add(blade, disc);
  grp.add(spin, hub); grp.spin = spin; grp.disc = disc; grp.blade = blade;
  return grp;
}

// linee di vento intorno all'aereo (si vedono soprattutto spingendo forte): un solo draw call
class SpeedStreaks {
  constructor(scene, count = 56) {
    const geo = new THREE.PlaneGeometry(0.05, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, count); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; scene.add(this.mesh);
    this.items = Array.from({ length: count }, () => this.fresh({}, true));
    this.m = new THREE.Matrix4(); this.p = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.k = 0;
  }
  fresh(it, any) {
    const a = Math.random() * Math.PI * 2; const r = 4 + Math.random() * 11;
    it.x = Math.cos(a) * r; it.y = Math.sin(a) * r * 0.6; it.z = any ? -4 + Math.random() * 40 : 36 + Math.random() * 6; it.len = 2 + Math.random() * 4;
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

export class Planata extends Base3D {
  constructor(hud, hooks, audio) {
    super(hud, hooks, audio, {
      key: 'planata', title: 'games.planata.hud.title', tagline: 'games.planata.hud.tagline', song: 'race',
      rules: ['games.planata.rule1', 'games.planata.rule2', 'games.planata.rule3', 'games.planata.rule4', 'games.planata.rule5'],
    });
  }

  assets() {
    const Q = `${A}/quaternius`;
    return {
      plane: `${A}/meshy/plane.glb`, cloud: `${A}/meshy/cloud.glb`, island: `${A}/meshy/island.glb`,
      farm: `${A}/meshy/farmhouse.glb`, church: `${A}/meshy/church.glb`, hut: `${A}/meshy/alpine_hut.glb`, windmill: `${A}/meshy/windmill.glb`, cypress: `${A}/meshy/cypress.glb`,
      tree1: `${Q}/nature/tree1.glb`, tree2: `${Q}/nature/tree2.glb`, tree3: `${Q}/nature/tree3.glb`, bush1: `${Q}/nature/bush1.glb`,
    };
  }

  build() {
    const { scene } = this.stage; const q = this.stage.quality;
    this.scene = scene;
    this.stage.camera.far = 600; this.stage.camera.updateProjectionMatrix();
    scene.add(skyDome('morning'));
    styleFog(scene, 'morning', 80, 330);
    this.light = styleLights(scene, 'morning', { shadows: false });
    // terreno
    this.groundMat = toonMaterial({ vertexColors: true });
    this.waterMat = new THREE.MeshToonMaterial({ gradientMap: this.groundMat.gradientMap, color: '#4fb6e6', transparent: true, opacity: 0.9, depthWrite: false });
    this.chunks = Array.from({ length: NCH }, () => new Chunk(scene, this.groundMat, this.waterMat));
    this.buildScenery();
    // aereo: modello Meshy (il muso è verso -x nel file) con elica che gira
    this.plane = new THREE.Group(); scene.add(this.plane);
    const pm = this.m.plane.scene.clone(true); toonify(pm);
    const pbox = new THREE.Box3().setFromObject(pm); const span = pbox.max.z - pbox.min.z; const sc = 7.4 / span;
    const holder = new THREE.Group(); pm.position.set(-(pbox.min.x + pbox.max.x) / 2, -(pbox.min.y + pbox.max.y) / 2, -(pbox.min.z + pbox.max.z) / 2);
    holder.add(pm); holder.scale.setScalar(sc); holder.rotation.y = Math.PI / 2; holder.position.y = 0.5; this.plane.add(holder); this.planeBody = holder;
    this.noseZ = (pbox.max.x - pbox.min.x) / 2 * sc;
    this.prop = makePropeller(); this.prop.position.set(0, 0.5, this.noseZ + 0.1); this.plane.add(this.prop);
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 2; scene.add(this.blob);
    this.fx = new Effects(scene, 70); this.streaks = new SpeedStreaks(scene); this.shake = new Shake();
    // porte: anello a spicchi bianchi e arancio, pellicola luminosa e raggio fino a terra
    this.gateGeo = new THREE.TorusGeometry(2.7, 0.38, 8, 40);
    const n = this.gateGeo.attributes.position.count; const colA = new Float32Array(n * 3); const cA = new THREE.Color('#ff7a1a'); const cB = new THREE.Color('#ffffff');
    for (let i = 0; i < n; i++) { const a = Math.atan2(this.gateGeo.attributes.position.getY(i), this.gateGeo.attributes.position.getX(i)); (Math.floor((a + Math.PI) / (Math.PI / 8)) & 1 ? cA : cB).toArray(colA, i * 3); }
    this.gateGeo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    this.filmGeo = new THREE.CircleGeometry(2.5, 28); this.beamGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 5, 1, true).translate(0, 0.5, 0);
    this.beamMat = new THREE.MeshBasicMaterial({ color: '#ffe9a8', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.ridgeGeo = rockBox(SIDE * 2 + 9, 1, 3.4, 12, 3, 2, 0.5, 11);
    this.slabGeo = rockBox(SIDE * 2 + 9, 1, 3.4, 12, 2, 2, 0.4, 23);
    this.pillarGeo = rockBox(2.4, 1, 3.4, 2, 6, 2, 0.5, 37);
    this.rockMat = toonMaterial({ vertexColors: true });
    this.stage.onQuality = (cfg) => this.applyQuality(cfg);
    this.applyQuality(q.cfg);
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
      farm: L(m.farm, 22, { lodDist: 140 }), church: L(m.church, 6, { lodDist: 150 }), hut: L(m.hut, 22, { lodDist: 140 }), windmill: L(m.windmill, 6, { lodDist: 150 }),
      cloud: L(m.cloud, 60, { kind: 'house', lodDist: 400 }), island: L(m.island, 8, { kind: 'house', lodDist: 400 }),
    };
    this.cullCache = null; this.lastChunk = -1e9;
  }

  // genera le istanze dei pezzi di terreno in vista (deterministico per pezzo)
  layScenery(first) {
    const buckets = {}; for (const k of Object.keys(this.lay)) buckets[k] = [];
    for (let ci = first; ci < first + NCH; ci++) {
      const r = rng(ci * 7919 + 13); const z0 = ci * CH;
      const put = (k, x, z, h, rot = r() * 6.28, up = 0) => { const y = Math.max(terrainH(x, z), 0) + up; if (terrainH(x, z) < 0.15) return false; buckets[k].push({ x, y: y - (k === 'cypress' || k.startsWith('tree') ? 0.2 : 0), z, h, rot }); return true; };
      // alberi: fitti sulle colline, radi nel fondovalle
      for (let i = 0; i < 34; i++) {
        const side = r() < 0.5 ? -1 : 1; const x = side * (8 + Math.pow(r(), 0.8) * 100); const z = z0 + r() * CH;
        if (Math.abs(x) < 9) continue;
        const gate = Math.abs(x) < 30 ? 0.25 : 1; if (r() > gate) continue;
        const kind = r() < 0.34 ? 'tree1' : r() < 0.5 ? 'tree2' : 'tree3';
        put(kind, x, z, 5 + r() * 5);
      }
      for (let i = 0; i < 12; i++) { const x = (r() < 0.5 ? -1 : 1) * (10 + r() * 60); put('bush', x, z0 + r() * CH, 1.6 + r() * 1.2); }
      // filari di cipressi lungo la strada del fondovalle
      if (hash2(ci, 5) < 0.5) { const off = (hash2(ci, 8) < 0.5 ? -1 : 1) * (22 + hash2(ci, 9) * 8); for (let i = 0; i < 6; i++) put('cypress', off + r() * 1.5, z0 + 5 + i * 9, 8 + r() * 3); }
      // villaggio (una volta ogni due pezzi): case, chiesa, capanne, ogni tanto un mulino
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
      // nuvole alte e basse ai lati; isole col faro in aria
      for (let i = 0; i < 6; i++) { const x = (r() < 0.5 ? -1 : 1) * (14 + r() * 110); const y = 22 + r() * 30; buckets.cloud.push({ x, y, z: z0 + r() * CH, h: 7 + r() * 9, rot: r() * 6.28 }); }
      for (let i = 0; i < 2; i++) { const x = (r() < 0.5 ? -1 : 1) * (28 + r() * 45); buckets.cloud.push({ x, y: 9 + r() * 12, z: z0 + r() * CH, h: 5 + r() * 5, rot: r() * 6.28 }); }
      if (hash2(ci, 21) < 0.34) buckets.island.push({ x: (hash2(ci, 22) < 0.5 ? -1 : 1) * (34 + hash2(ci, 23) * 40), y: 18 + hash2(ci, 24) * 22, z: z0 + r() * CH, h: 15 + r() * 10, rot: r() * 6.28 });
    }
    for (const [k, list] of Object.entries(buckets)) this.lay[k].set(list);
  }

  reset() {
    const { scene } = this.stage;
    for (const o of this.items || []) scene.remove(o.group);
    this.z = 0; this.x = 0; this.y = 6; this.vy = 0; this.lives = 3; this.hurtT = 0; this.combo = 0; this.score = 0;
    this.items = []; this.nextZ = 50; this.phase = 0; this.rings = 0; this.camInit = false; this.lastChunk = -1e9; this.pitch = 0;
    this.updateWorld(true);
  }

  onBegin() { this.say(t('games.planata.climb'), '#d9ff3d', 1.8, true); this.hooks.setGrade(2); }

  // terreno e scenografia seguono l'aereo
  updateWorld(force = false) {
    const first = Math.floor((this.z - 70) / CH);
    if (first !== this.lastChunk || force) {
      this.lastChunk = first;
      for (let i = 0; i < NCH; i++) { const ci = first + i; this.chunks[((ci % NCH) + NCH) % NCH].place(ci); }
      this.layScenery(first);
    }
  }

  // generatore: alterna tratti "alti" (potenza) e "bassi" (recupero), sempre più fitti
  spawnNext() {
    const z = this.nextZ; const lvl = Math.min(1, this.z / 2500);
    this.phase = (this.phase + 1) % 14;
    const high = this.phase >= 7; // 7 elementi alti, 7 bassi
    const r = Math.random();
    if (r < 0.55 - lvl * 0.15) {
      const y = high ? 9 + Math.random() * 4 : 2.5 + Math.random() * 3;
      this.addRing((Math.random() * 2 - 1) * (SIDE - 1.5), y, z);
    } else if (high) this.addRidge(z, 6 + Math.random() * 2 + lvl * 2);
    else this.addArch(z, 6.5 - lvl * 1.5);
    this.nextZ += SEG - lvl * 8;
  }

  addRing(x, y, z) {
    const group = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    const ring = new THREE.Mesh(this.gateGeo, ringMat);
    const filmMat = new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const film = new THREE.Mesh(this.filmGeo, filmMat);
    const ground = Math.max(terrainH(x, z), 0);
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat); beam.scale.y = Math.max(0.1, y - 2.4 - ground); beam.position.set(0, ground - y, 0);
    group.add(ring, film, beam); group.position.set(x, y, z); this.stage.scene.add(group);
    this.items.push({ kind: 'ring', group, ring, film, ringMat, filmMat, x, y, z, flash: 0 });
  }

  // cresta: muro dal suolo fino a "top" → devi stare sopra
  addRidge(z, top) {
    const group = new THREE.Group();
    const wall = new THREE.Mesh(this.ridgeGeo, this.rockMat); wall.scale.y = top; group.add(wall);
    group.position.set(0, 0, z); this.stage.scene.add(group);
    this.items.push({ kind: 'ridge', group, z, top });
  }

  // arco di roccia: lastra da "bottom" in su → devi passare sotto
  addArch(z, bottom) {
    const group = new THREE.Group(); const h = 2.4;
    const slab = new THREE.Mesh(this.slabGeo, this.rockMat); slab.scale.y = h; slab.position.y = bottom; group.add(slab);
    for (const x of [-(SIDE + 3), SIDE + 3]) { const p = new THREE.Mesh(this.pillarGeo, this.rockMat); p.scale.y = bottom + h * 0.5; p.position.x = x; group.add(p); }
    group.position.set(0, 0, z); this.stage.scene.add(group);
    this.items.push({ kind: 'arch', group, z, bottom });
  }

  // quota obiettivo dai watt, relativa alla tua media (così funziona per tutti i livelli)
  ref() { return Math.max(90, this.effort.avg || 150); }
  targetY() { return clamp(((this.power / this.ref()) - 0.45) / 1.1, 0, 1) * (YMAX - 1) + 1; }
  wattsFor(y) { return Math.round((((y - 1) / (YMAX - 1)) * 1.1 + 0.45) * this.ref() / 5) * 5; }

  // in demo (senza rullo) l'aereo vola da solo verso il prossimo obiettivo
  demoPower() {
    const n = this.next && this.items ? this.next() : null;
    const y = !n ? 6 : n.kind === 'ring' ? n.y : n.kind === 'ridge' ? n.top + 2.5 : n.bottom - 3;
    return this.wattsFor(y);
  }

  press(dir) { this.x = clamp(this.x - dir * 1.2, -SIDE, SIDE); }

  step(dt) {
    const v = clamp((this.kmh / 3.6) * 0.9, 5, 14);
    this.z += v * dt; this.v = v;
    this.x = clamp(this.x - this.steer(dt, 7), -SIDE, SIDE);
    const ty = this.targetY();
    this.y = lerp(this.y, ty, Math.min(1, dt * 1.4));
    this.hurtT = Math.max(0, this.hurtT - dt);
    while (this.nextZ < this.z + 160) this.spawnNext();
    for (const it of this.items) {
      if (it.done || this.z < it.z) continue;
      it.done = true;
      if (it.kind === 'ring') {
        if (Math.hypot(this.x - it.x, this.y - it.y) < 2.1) {
          this.combo++; this.rings++; const pts = 25 * this.combo;
          this.score += pts; this.audio.sfx('coin'); this.prog('coins', 1, 1);
          this.pop(this.combo > 1 ? `+${pts} ×${this.combo}` : `+${pts}`, '#ffcc33', it.x, it.y + 1.5, it.z);
          this.fx.spawn(it.x, it.y, it.z, { tex: 'spark', size: 4, life: 0.35 });
          it.flash = 1; it.hit = true; it.filmMat.color.set('#7dff6a'); this.shake.add(0.12);
        } else { if (this.combo) this.combo = 0; it.flash = 1; it.hit = false; it.ringMat.color.set('#9a9aa4'); it.filmMat.color.set('#ff5a6a'); }
      } else {
        const ok = it.kind === 'ridge' ? this.y > it.top + 0.6 : this.y < it.bottom - 1;
        if (ok) { this.score += 40; this.pop('+40', '#d9ff3d', this.x, this.y + 2, this.z); this.audio.sfx('select'); }
        else if (this.hurtT <= 0) this.hit(it);
      }
    }
    this.items = this.items.filter((it) => { if (it.z < this.z - 20) { this.stage.scene.remove(it.group); it.ringMat?.dispose(); it.filmMat?.dispose(); return false; } return true; });
    this.score += v * dt;
  }

  hit(it) {
    this.lives--; this.hurtT = 1.5; this.combo = 0;
    this.audio.sfx('hurt'); this.fx.explode(this.x, this.y + 1, this.z, 1); this.shake.add(0.55);
    this.say(it.kind === 'ridge' ? t('games.planata.tooLow') : t('games.planata.tooHigh'), '#ff6b6b', 1.8);
    if (navigator.vibrate) navigator.vibrate(120);
    if (this.lives <= 0) { this.score = Math.round(this.score); this.hooks.progress?.setMax('planataDist', Math.round(this.z)); this.end(Math.round(this.z / 100)); }
  }

  next() { return this.items.find((it) => !it.done && it.z > this.z); }

  view(dt) {
    const cad = this.cadence || 80; const cam = this.stage.camera;
    const playing = this.state === 'play';
    const ty = playing ? this.targetY() : 6;
    if (!playing) this.z += dt * 8;
    this.updateWorld();
    this.shake.update(dt);
    // aereo: muso su e giù con la quota, inclinazione nelle virate
    const pitchT = clamp((ty - this.y) * 0.07, -0.3, 0.3);
    this.pitch = lerp(this.pitch, pitchT, Math.min(1, dt * 4));
    this.plane.position.set(this.x, this.y, this.z);
    this.plane.rotation.set(-this.pitch, 0, clamp(this.held * 0.3, -0.35, 0.35) * 1 + Math.sin(this.t * 1.7) * 0.03);
    // elica: gira alla cadenza (in fotogrammi veri), oltre una certa velocità diventa un disco sfocato
    const rps = (cad / 60) * 2.2; const ang = rps * Math.PI * 2 * dt;
    this.prop.spin.rotation.z += Math.min(ang, 1.2);
    const blur = clamp((rps - 1.5) / 3, 0, 1);
    this.prop.disc.material.opacity = 0.28 * blur; this.prop.blade.visible = blur < 0.85;
    this.plane.visible = !(this.hurtT > 0 && Math.floor(this.hurtT * 12) % 2);
    // ombra sul terreno: più lontana = più larga e più chiara
    const gy = Math.max(terrainH(this.x, this.z), WATER_Y);
    this.blob.position.set(this.x, gy + 0.08, this.z); const h = this.y - gy; this.blob.scale.set(2.6 + h * 0.03, 1.3 + h * 0.02, 1); this.blob.material.opacity = clamp(0.3 - h * 0.012, 0.08, 0.3);
    // porte: baluginano, a segno si allargano e svaniscono
    for (const it of this.items) if (it.kind === 'ring') {
      const k = it.flash > 0 ? (it.flash = Math.max(0, it.flash - dt * 2.2)) : 0;
      if (!it.done) { it.ring.rotation.z = this.t * 0.8; it.filmMat.opacity = 0.14 + 0.06 * Math.sin(this.t * 4 + it.z); } else {
        const s = it.hit ? 1 + (1 - k) * 0.9 : 1; it.ring.scale.setScalar(s); it.film.scale.setScalar(s);
        it.filmMat.opacity = it.hit ? k * 0.4 : k * 0.25; if (it.hit) it.ringMat.color.setScalar(0.4 + k * 0.6);
        if (it.hit && k <= 0) it.group.visible = false;
      }
    }
    // effetti di velocità: linee di vento, campo visivo più largo spingendo
    const strength = playing ? clamp(((this.power / this.ref()) - 0.8) * 1.6 + (this.sprinting ? 0.4 : 0), 0.15, 1) : 0.1;
    this.streaks.update(dt, this.plane.position, this.v || 8, strength * (this.streakMax / 56));
    this.fx.update(dt);
    // camera: dietro e sopra, si vede l'orizzonte; il telefono in verticale sta più indietro
    const tall = this.stage.H > this.stage.W; const back = tall ? 13.5 : 11; const up = tall ? 5.6 : 4.4;
    const target = new THREE.Vector3(this.x * 0.7, this.y + up, this.z - back);
    if (!this.camInit) { cam.position.copy(target); this.camInit = true; }
    cam.position.lerp(target, Math.min(1, dt * 3));
    cam.lookAt(this.x * 0.8, this.y + 0.4, this.z + 18);
    this.shake.apply(cam);
    const fov = 62 + strength * 9; cam.fov += (fov - cam.fov) * Math.min(1, dt * 2.5); cam.updateProjectionMatrix();
    this.light.follow(this.x, 0, this.z);
    // le istanze oltre la camera non si disegnano
    const cx = cam.position.x; const cz = cam.position.z;
    for (const l of this.layers) l.inst.cull(cx, cz, 0, 1, 330, 20);
  }

  hud(ctx, W, H) {
    const s = uiScale(W, H); const top = 54; const gap = 8; const m = 12;
    const pw = Math.min((W - m * 2 - gap * 2) / 3, 150 * s); const ph = 62 * s;
    const box = (i, label, value, color) => {
      const x = i === 0 ? m : i === 1 ? (W - pw) / 2 : W - m - pw;
      panel(ctx, x, top, pw, ph, {});
      txt(ctx, label, x + pw / 2, top + 16 * s, { size: 13 * s, align: 'center', color: HUD.dim });
      txt(ctx, value, x + pw / 2, top + ph - 8 * s, { size: 44 * s, align: 'center', color });
    };
    box(0, t('games.gruppetto.lblScore'), String(Math.round(this.score)), this.sprinting ? HUD.cyan : HUD.white);
    box(1, 'm', String(Math.round(this.z)), HUD.lime);
    box(2, 'WATT', String(Math.round(this.power)), powerColor(this.power, this.effort.threshold));
    // vite e combo sotto
    const by = top + ph + 6 * s;
    let hx = m; for (let i = 0; i < 3; i++) { txt(ctx, '♥', hx, by + 20 * s, { size: 24 * s, color: i < this.lives ? '#ff4d6d' : 'rgba(255,255,255,.25)' }); hx += 26 * s; }
    if (this.combo > 1) { panel(ctx, W - m - 118 * s, by, 118 * s, 26 * s, { r: 8, fill: 'rgba(12,12,18,.55)' }); txt(ctx, t('games.planata.combo', { n: this.combo }), W - m - 59 * s, by + 19 * s, { size: 17 * s, align: 'center', color: HUD.gold }); }
    // altimetro: dove sei e dove devi essere per il prossimo elemento (banda colorata con i watt da fare)
    const aw = 26 * s; const ax = W - m - aw; const ay = by + 40 * s; const ah = Math.min(H * 0.4, 300 * s);
    const yToPx = (y) => ay + ah - (y / YMAX) * ah;
    panel(ctx, ax - 4, ay - 4, aw + 8, ah + 8, { r: 8, fill: 'rgba(12,12,18,.5)' });
    const n = this.next();
    if (n) {
      let lo; let hi; let label; let col;
      if (n.kind === 'ring') { lo = n.y - 1.6; hi = n.y + 1.6; label = `${this.wattsFor(n.y)}`; col = HUD.gold; }
      else if (n.kind === 'ridge') { lo = n.top + 0.6; hi = YMAX; label = `>${this.wattsFor(n.top + 0.6)}`; col = '#ff9f43'; }
      else { lo = 0; hi = n.bottom - 1; label = `<${this.wattsFor(n.bottom - 1)}`; col = HUD.cyan; }
      ctx.fillStyle = col; ctx.globalAlpha = 0.6; ctx.fillRect(ax, yToPx(Math.min(YMAX, hi)), aw, yToPx(Math.max(0, lo)) - yToPx(Math.min(YMAX, hi))); ctx.globalAlpha = 1;
      const ly = clamp(yToPx((lo + Math.min(YMAX, hi)) / 2) + 7 * s, ay + 16 * s, ay + ah - 4);
      txt(ctx, `${label} W`, ax - 10 * s, ly, { size: 22 * s, align: 'right', color: col });
      const dist = Math.round(n.z - this.z);
      panel(ctx, W / 2 - 112 * s, H - 62 * s, 224 * s, 34 * s, { r: 10 });
      txt(ctx, t(`games.planata.ahead.${n.kind}`, { dist }), W / 2, H - 38 * s, { size: 20 * s, align: 'center', color: col });
    }
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 2; const py = yToPx(clamp(this.y, 0, YMAX));
    ctx.beginPath(); ctx.moveTo(ax - 2, py); ctx.lineTo(ax - 12 * s, py - 7 * s); ctx.lineTo(ax - 12 * s, py + 7 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(ax, py - 2, aw, 4);
  }

  summary() { return [t('games.planata.over'), t('games.planata.stats', { m: Math.round(this.z), rings: this.rings })]; }
}
