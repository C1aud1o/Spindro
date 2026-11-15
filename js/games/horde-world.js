// Mondo notturno de L'Orda: cimitero e campagna sotto la luna. Strada larga, lampioni che la illuminano,
// cancellate, lapidi, cripte e alberi secchi (modelli Meshy). Tutto è istanziato e si rigenera attorno al giocatore:
// la strada è infinita e ogni oggetto è deterministico (stesso posto a ogni giro), un draw call per modello.
import { THREE, fxTexture, skyDome, styleLights, styleFog, toonMaterial, prepareModel } from './kit3d.js';
import { hash } from './engine.js';

export const ROAD_W = 17;
const CELL = 6;       // m: una cellula di scenografia
const BEHIND = 25; const AHEAD = 140;

export const NIGHT = {
  top: '#0c1330', horizon: '#34406e', bottom: '#1a2140', glow: '#bcd0ff', sunDir: [-0.35, 0.42, 0.83],
  sun: '#b4c4ff', sunI: 2.3, hemiSky: '#9db0f0', hemiGround: '#3a4668', hemiI: 1.8, fog: '#222c50',
};

// ----- cielo, luna, stelle, nebbia, luci -----
export function buildSky(scene, quality) {
  scene.add(skyDome(NIGHT));
  styleFog(scene, NIGHT, 40, 150);
  const L = styleLights(scene, NIGHT, { shadows: quality.cfg.shadows, mapSize: quality.cfg.shadowMap, extent: 30 });
  const dir = new THREE.Vector3(...NIGHT.sunDir).normalize();
  const moon = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(15, 40), new THREE.MeshBasicMaterial({ color: '#f6f2dc', fog: false, depthWrite: false }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('light_01'), color: '#9db4ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.55 }));
  halo.scale.setScalar(150); halo.position.z = -1;
  moon.add(halo, disc); moon.renderOrder = -5; disc.renderOrder = -5; halo.renderOrder = -6;
  scene.add(moon);
  // stelle
  const N = 220; const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const a = hash(i * 3.1) * Math.PI * 2; const e = 0.12 + hash(i * 7.7) * 1.2; const r = 460; pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#dfe6ff', size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
  stars.frustumCulled = false; stars.renderOrder = -8; scene.add(stars);
  return {
    lights: L,
    follow(cam, x, z) {
      moon.position.copy(cam.position).addScaledVector(dir, 430); moon.lookAt(cam.position);
      stars.position.copy(cam.position);
      L.follow(x, 0, z);
    },
  };
}

// ----- terreno: erba scura e asfalto, che scorrono in blocchi interi per non far vedere stacchi -----
function noiseCanvas(w, h, base, specks, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < specks; i++) { g.fillStyle = fn(i); g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 2, 2 + Math.random() * 2); }
  return c;
}
function tex(c, rx, ry) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const SNAP = 32;
export function buildGround(scene) {
  const grass = noiseCanvas(128, 128, '#36463a', 700, (i) => (i % 3 ? 'rgba(20,40,30,.35)' : 'rgba(110,140,110,.18)'));
  const gt = tex(grass, 26, 26);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 416), new THREE.MeshLambertMaterial({ map: gt }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; scene.add(ground);
  const rc = document.createElement('canvas'); rc.width = 256; rc.height = 256; const g = rc.getContext('2d');
  g.fillStyle = '#5a6070'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) { g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  // bordi chiari, due corsie tratteggiate: la strada si legge anche al buio
  const e = 256 * 0.025; g.fillStyle = '#c9cfdc'; g.fillRect(e, 0, 6, 256); g.fillRect(256 - e - 6, 0, 6, 256);
  g.fillStyle = 'rgba(230,226,205,.85)'; for (const x of [256 / 3, 512 / 3]) for (let y = 0; y < 256; y += 128) g.fillRect(x - 3, y + 8, 6, 62);
  const rt = tex(rc, 1, 416 / SNAP); // la tessitura copre SNAP metri
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 416), new THREE.MeshLambertMaterial({ map: rt }));
  road.rotation.x = -Math.PI / 2; road.position.y = 0.01; road.receiveShadow = true; scene.add(road);
  return { follow(z) { const zs = Math.round(z / SNAP) * SNAP + 150; ground.position.set(0, -0.03, zs); road.position.set(0, 0.01, zs); } };
}

// ----- scenografia istanziata -----
function dressed(gltf, { height = null, length = null, yawToZ = false }) {
  const info = prepareModel(gltf);
  if (!info.dressed) {
    const b = info.box; const cx = (b.min.x + b.max.x) / 2; const cz = (b.min.z + b.max.z) / 2;
    for (const p of info.parts) p.geo.translate(-cx, -b.min.y, -cz);
    info.dressed = true;
  }
  const w = info.box.max.x - info.box.min.x; const d = info.box.max.z - info.box.min.z;
  let scale = height ? height / info.height : 1; let yaw = 0;
  if (length) { const long = Math.max(w, d); scale = length / long; if (yawToZ && w > d) yaw = Math.PI / 2; }
  return { info, scale, yaw };
}

class Kind {
  constructor(scene, gltf, cap, opts) {
    const d = dressed(gltf, opts); this.info = d.info; this.scale = d.scale; this.yaw = d.yaw; this.cap = cap;
    this.meshes = d.info.parts.map((pt) => {
      const m = new THREE.InstancedMesh(pt.geo, pt.mat === 'vc' ? toonMaterial({ vertexColors: true }) : toonMaterial({ map: pt.mat }), cap);
      m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; scene.add(m); return m;
    });
    this.n = 0;
  }
  begin() { this.n = 0; }
  add(m4) { if (this.n >= this.cap) return; for (const m of this.meshes) m.setMatrixAt(this.n, m4); this.n++; }
  end() { for (const m of this.meshes) { m.count = this.n; m.instanceMatrix.needsUpdate = true; } }
  setShadows(on) { for (const m of this.meshes) m.castShadow = on; }
}

const _m = new THREE.Matrix4(); const _q = new THREE.Quaternion(); const _p = new THREE.Vector3(); const _s = new THREE.Vector3(); const UP = new THREE.Vector3(0, 1, 0);
const place = (x, y, z, rot, s) => _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(UP, rot), _s.setScalar(s));

export class Scenery {
  constructor(scene, models, density = 1) {
    this.density = density; this.lastCell = -1e9;
    this.kinds = {
      tombs: new Kind(scene, models.tombstones, 140, { height: 1.7 }),
      fence: new Kind(scene, models.iron_fence, 100, { length: CELL, yawToZ: true }),
      crypt: new Kind(scene, models.crypt, 10, { height: 6.5 }),
      tree: new Kind(scene, models.dead_tree, 90, { height: 8 }),
      lamp: new Kind(scene, models.street_lamp, 24, { height: 6 }),
    };
    // niente ombre dalla scenografia: ogni istanza entrerebbe nella mappa delle ombre
    // lampioni: posizioni usate anche dalle luci e dalle pozze di luce
    this.lamps = [];
  }
  setDensity(k) { this.density = k; this.lastCell = -1e9; }
  setShadows(on) { this.kinds.lamp.setShadows(on); this.kinds.tree.setShadows(on); this.kinds.crypt.setShadows(on); this.kinds.tombs.setShadows(on); }
  // lampioni a una cellula su 3, alternando i lati
  static lampAt(c) { if (((c % 3) + 3) % 3 !== 0) return null; return ((Math.floor(c / 3) % 2) + 2) % 2 ? 1 : -1; }
  update(z, force = false) {
    const c0 = Math.floor((z - BEHIND) / CELL); const cm = Math.floor(z / CELL);
    if (!force && cm === this.lastCell) return;
    this.lastCell = cm;
    const K = this.kinds; for (const k of Object.values(K)) k.begin();
    this.lamps.length = 0;
    const c1 = Math.floor((z + AHEAD) / CELL); const edge = ROAD_W / 2;
    for (let c = c0; c <= c1; c++) {
      const z0 = c * CELL + CELL / 2;
      for (const side of [-1, 1]) {
        const h = (k) => hash(c * 13.7 + side * 91.3 + k * 5.1);
        // cancellata lungo il bordo (a tratti rotta: qualche campata manca)
        if (h(1) > 0.07 && (this.density > 0.6 || c % 2 === 0)) K.fence.add(place(side * (edge + 1.7), 0, z0, K.fence.yaw, K.fence.scale));
        // lapidi sparse subito oltre la cancellata, qualche gruppo più lontano
        if (h(2) < 0.55 * this.density + 0.1) K.tombs.add(place(side * (edge + 3.6 + h(3) * 8), 0, z0 + (h(4) - 0.5) * 4, (h(5) - 0.5) * 1.2 + (side > 0 ? Math.PI / 2 : -Math.PI / 2) * 0, K.tombs.scale * (0.9 + h(6) * 0.5)));
        if (h(7) < 0.28 * this.density) K.tombs.add(place(side * (edge + 11 + h(8) * 14), 0, z0 + (h(9) - 0.5) * 5, h(10) * 6.28, K.tombs.scale * (1 + h(11) * 0.6)));
        // alberi secchi, più radi vicino alla strada
        if (h(12) < 0.38 * this.density) K.tree.add(place(side * (edge + 5 + h(13) * 26), 0, z0 + (h(14) - 0.5) * 5, h(15) * 6.28, K.tree.scale * (0.8 + h(16) * 0.6)));
        // cripta ogni tanto, di fronte alla strada
        if (h(17) < 0.06) K.crypt.add(place(side * (edge + 15 + h(18) * 6), 0, z0, side > 0 ? -Math.PI / 2 : Math.PI / 2, K.crypt.scale * (0.9 + h(19) * 0.5)));
      }
      const ls = Scenery.lampAt(c);
      if (ls) { const lx = ls * (edge + 0.6); K.lamp.add(place(lx, 0, z0, ls > 0 ? Math.PI : 0, K.lamp.scale)); this.lamps.push({ x: lx, z: z0, side: ls }); }
    }
    for (const k of Object.values(K)) k.end();
  }
}

// ----- luci dei lampioni: 3 luci puntiformi sui lampioni più vicini, alone sul lampione e pozza di luce sull'asfalto -----
export class LampLights {
  constructor(scene, lampHeight = 5.2) {
    this.h = lampHeight; this.pts = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight('#ffb866', 70, 30, 1.6); l.position.set(0, lampHeight, 0); scene.add(l); this.pts.push(l); }
    // alone dei fanali (Points additivo con la texture Kenney) e pozza di luce a terra
    const N = 20; this.N = N;
    const g = new THREE.BufferGeometry(); this.pos = new Float32Array(N * 3); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ map: poolTexture(), color: '#ffc27a', size: 2.6, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75, fog: true }));
    this.points.frustumCulled = false; scene.add(this.points);
    const pool = new THREE.PlaneGeometry(1, 1); pool.rotateX(-Math.PI / 2);
    this.pool = new THREE.InstancedMesh(pool, new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffb866', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }), N);
    this.pool.frustumCulled = false; this.pool.count = 0; scene.add(this.pool);
  }
  update(lamps, z) {
    const near = lamps.filter((l) => l.z > z - 8).sort((a, b) => a.z - b.z);
    this.pts.forEach((l, i) => { const lm = near[i]; if (lm) { l.visible = true; l.position.set(lm.x * 0.8, this.h, lm.z); } else l.visible = false; });
    const n = Math.min(this.N, near.length);
    for (let i = 0; i < n; i++) {
      const lm = near[i]; this.pos[i * 3] = lm.x - lm.side * 0.0; this.pos[i * 3 + 1] = this.h + 0.1; this.pos[i * 3 + 2] = lm.z;
      this.pool.setMatrixAt(i, _m.compose(_p.set(lm.x * 0.35, 0.05, lm.z), _q.identity(), _s.set(15, 1, 15)));
    }
    this.points.geometry.setDrawRange(0, n); this.points.geometry.attributes.position.needsUpdate = true;
    this.pool.count = n; this.pool.instanceMatrix.needsUpdate = true;
  }
}
function poolTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(0.5, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
