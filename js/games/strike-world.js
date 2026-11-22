// Mondo di Pedal Strike: tre livelli a scorrimento laterale, ognuno con la sua luce e i suoi piani di profondità.
// 1. IL PORTO (giorno): banchina, container, gru, mare con le navi, città lontana.
// 2. IL PASSO (tramonto): strada di montagna, pendio con pini e rocce, catene di monti a strati, valle sotto.
// 3. MOTOR CITY (notte): marciapiede con lampioni colorati, negozi con insegne al neon, grattacieli, pioggia.
// La strada corre lungo +X (destra sullo schermo), la camera guarda verso −Z: più una cosa è lontana in Z,
// più scorre lenta (parallasse vera, in 3D). Tutto è deterministico: stesso livello, stesso paesaggio.
// Edifici e container sono geometrie unite a blocchi (un draw call per blocco), i modelli si ripetono con le istanze.
import { THREE, fxTexture, skyDome, toonMaterial, prepareModel } from './kit3d.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { hash } from './engine.js';

// tre corsie: 0 davanti (verso la camera), 1 in mezzo, 2 dietro
export const LANES = [2.7, 0, -2.7];
export const ROAD = { front: 4.4, back: -4.4 };
const CHUNK = 48;

// ----- livelli -----
export const LEVELS = [
  {
    id: 'harbor', name: 'games.shooter.level1', song: 'city', len: 820, boss: 'tank', foe: '#ff8a1f', foeDark: '#3a3f4a',
    sky: { top: '#3f8fe0', horizon: '#d6efff', bottom: '#e9f4f7', glow: '#ffffff', sunDir: [-0.45, 0.75, 0.5] },
    sun: '#fff0d2', sunI: 2.4, hemiSky: '#cfe6ff', hemiGround: '#6f746a', hemiI: 0.95, fill: '#bfe3ff', fillI: 0.35, rim: '#ffffff', rimI: 0.0,
    fog: '#cfe6f4', fogNear: 60, fogFar: 330, road: '#5d6068', edge: '#f2f2f2', dash: '#f4d35e', exposure: 1,
  },
  {
    id: 'pass', name: 'games.shooter.level2', song: 'desert', len: 900, boss: 'airship', foe: '#a259ff', foeDark: '#2c2338',
    sky: { top: '#273a85', horizon: '#ff9e5e', bottom: '#d9785f', glow: '#ffd29a', sunDir: [0.42, 0.1, -0.9] },
    sun: '#ffb37a', sunI: 2.2, hemiSky: '#ffc8a8', hemiGround: '#5a4a5e', hemiI: 1.15, fill: '#ff9fb0', fillI: 0.75, rim: '#ffd09a', rimI: 1.2,
    fog: '#e69a86', fogNear: 55, fogFar: 380, road: '#545262', edge: '#f4e6dc', dash: '#ffd27a', exposure: 1,
  },
  {
    id: 'neon', name: 'games.shooter.level3', song: 'factory', len: 980, boss: 'mech', foe: '#ff2e63', foeDark: '#1d1a2e',
    sky: { top: '#05061a', horizon: '#3a1659', bottom: '#14082a', glow: '#b49cff', sunDir: [-0.35, 0.38, -0.86] },
    sun: '#9fb2ff', sunI: 1.1, hemiSky: '#6f5ccf', hemiGround: '#24163a', hemiI: 1.25, fill: '#ff4fd8', fillI: 0.55, rim: '#4de3ff', rimI: 1.4,
    fog: '#2a1446', fogNear: 30, fogFar: 230, road: '#2a2a38', edge: '#ff4fd8', dash: '#4de3ff', exposure: 1, night: true,
  },
];

// ----- texture disegnate al volo -----
function canvasTex(w, h, draw, { repeat = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const rnd = (seed) => { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9 >>> 0) / 4294967296); };

// strada: 16 m di lunghezza per 8,8 m di larghezza, corsie tratteggiate e bordi
function roadTexture(L) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = L.road; g.fillRect(0, 0, w, h);
    const r = rnd(7);
    for (let i = 0; i < 3500; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.1)'; g.fillRect(r() * w, r() * h, 2, 2); }
    // crepe e rattoppi leggeri
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); let x = r() * w; let y = r() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    const zToY = (z) => ((ROAD.front - z) / (ROAD.front - ROAD.back)) * h;
    g.fillStyle = L.edge; g.fillRect(0, zToY(ROAD.front - 0.25) - 4, w, 6); g.fillRect(0, zToY(ROAD.back + 0.25) - 2, w, 6);
    g.fillStyle = L.dash;
    for (const z of [(LANES[0] + LANES[1]) / 2, (LANES[1] + LANES[2]) / 2]) for (let x = 0; x < w; x += 128) g.fillRect(x + 10, zToY(z) - 3, 70, 6);
  });
}

// facciate: una finestra ogni 3 m × 3,2 m; di notte le finestre accese brillano (mappa emissiva)
function windowTextures(night, seed) {
  const N = 8; const S = 256 / N; const r = rnd(seed); const lit = [];
  for (let i = 0; i < N * N; i++) lit.push(r());
  const map = canvasTex(256, 256, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const on = night && lit[j * N + i] < 0.32;
      g.fillStyle = on ? '#2a2638' : night ? '#3c3a52' : '#7d97ad';
      g.fillRect(i * S + 6, j * S + 5, S - 12, S - 12);
      if (!night) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(i * S + 6, j * S + 5, (S - 12) * 0.35, S - 12); }
    }
  });
  const emissive = night ? canvasTex(256, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    const cols = ['#ffd27a', '#ffcf8a', '#9fe8ff', '#ff9ae0', '#fff1c4'];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = lit[j * N + i]; if (v >= 0.32) continue;
      g.fillStyle = cols[Math.floor(v * 100) % cols.length]; g.fillRect(i * S + 9, j * S + 7, S - 18, S - 16);
    }
  }) : null;
  return { map, emissive };
}

// lamiera ondulata dei container
function corrugatedTexture() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 8) { g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(x, 0, 3, 128); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(x + 4, 0, 2, 128); }
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, 128, 5); g.fillRect(0, 123, 128, 5);
  });
}

// insegne al neon (senza scritte): forme con l'alone già disegnato, così brillano anche senza bagliore
function neonAtlas() {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256);
    const cell = (i, col, draw) => { const x = (i % 4) * 128; const y = Math.floor(i / 4) * 128; g.save(); g.translate(x + 64, y + 64); g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; g.shadowColor = col; for (const [w, b] of [[10, 24], [6, 10], [2.5, 0]]) { g.lineWidth = w; g.shadowBlur = b; g.strokeStyle = b ? col : '#ffffff'; g.beginPath(); draw(); g.stroke(); } g.restore(); };
    cell(0, '#ff3fd2', () => { g.arc(0, 0, 38, 0, Math.PI * 2); g.moveTo(-20, 0); g.lineTo(20, 0); });
    cell(1, '#3fe6ff', () => { for (let k = 0; k < 3; k++) { g.moveTo(-36 + k * 22, -30); g.lineTo(-14 + k * 22, 0); g.lineTo(-36 + k * 22, 30); } });
    cell(2, '#ffd23f', () => { g.moveTo(-10, -44); g.lineTo(-28, 4); g.lineTo(4, 4); g.lineTo(-8, 44); g.lineTo(30, -10); g.lineTo(0, -10); g.lineTo(14, -44); g.closePath(); });
    cell(3, '#7dff6a', () => { for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.moveTo(Math.cos(a) * 22, Math.sin(a) * 22); g.lineTo(Math.cos(a) * 40, Math.sin(a) * 40); } g.moveTo(22, 0); g.arc(0, 0, 22, 0, Math.PI * 2); });
    cell(4, '#ff5a3c', () => { g.rect(-44, -26, 88, 52); g.moveTo(-30, 10); g.lineTo(-10, -10); g.lineTo(10, 10); g.lineTo(30, -10); });
    cell(5, '#b06bff', () => { g.moveTo(0, -42); g.lineTo(40, 0); g.lineTo(0, 42); g.lineTo(-40, 0); g.closePath(); g.moveTo(0, -18); g.lineTo(18, 0); g.lineTo(0, 18); g.lineTo(-18, 0); g.closePath(); });
    cell(6, '#3fe6ff', () => { g.moveTo(-44, 20); g.lineTo(-44, -20); g.lineTo(44, -20); g.moveTo(-30, 30); g.lineTo(44, 30); g.moveTo(-44, 0); g.lineTo(20, 0); });
    cell(7, '#ff3fd2', () => { g.moveTo(-40, 0); g.lineTo(30, 0); g.moveTo(8, -24); g.lineTo(32, 0); g.lineTo(8, 24); });
  }, { repeat: false });
}

function cloudTexture() {
  return canvasTex(256, 128, (g) => {
    const puff = (x, y, r, a) => { const gr = g.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.75, `rgba(255,255,255,${a * 0.85})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    puff(70, 80, 42, 0.95); puff(120, 62, 52, 1); puff(175, 78, 40, 0.95); puff(130, 92, 46, 0.9); puff(205, 92, 30, 0.85); puff(45, 95, 28, 0.85);
    g.globalCompositeOperation = 'source-atop'; const sh = g.createLinearGradient(0, 40, 0, 128); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(120,130,170,.45)'); g.fillStyle = sh; g.fillRect(0, 0, 256, 128);
  }, { repeat: false });
}

// ----- geometrie colorate per vertice -----
const _c = new THREE.Color();
function paint(geo, color, uv = null) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count; const a = new Float32Array(n * 3); _c.set(color);
  for (let i = 0; i < n; i++) _c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (uv === 'none') { const u = new Float32Array(n * 2).fill(0.01); g.setAttribute('uv', new THREE.BufferAttribute(u, 2)); }
  return g;
}
// scatola con le facce in UV "metriche" (per finestre e lamiere che si ripetono), tetto e fondo su un punto bianco
function boxGeo(w, h, d, x, y, z, color, { tile = [24, 25.6], uvOff = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = g.attributes.position; const nrm = g.attributes.normal; const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = nrm.getX(i); const ny = nrm.getY(i); const px = pos.getX(i); const py = pos.getY(i) + h / 2; const pz = pos.getZ(i);
    if (Math.abs(ny) > 0.5) { uv.setXY(i, 0.003, 0.003); continue; }
    const along = Math.abs(nx) > 0.5 ? pz : px;
    uv.setXY(i, (along + uvOff) / tile[0], py / tile[1]);
  }
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}

// catena di monti: crinale a rumore, neve sulle cime, colore che sfuma nella nebbia (prospettiva aerea dipinta)
function ridgeGeo(x0, x1, z, base, height, color, topColor, seed, { snow = 0.75, step = 6 } = {}) {
  const n = Math.ceil((x1 - x0) / step); const pos = []; const col = []; const c0 = new THREE.Color(color); const c1 = new THREE.Color(topColor);
  const h = (x) => { let v = 0; let a = 1; let f = 1 / 160; for (let o = 0; o < 4; o++) { v += a * Math.sin(x * f + seed * (o + 1) * 1.7) * 0.5 + a * 0.5 * Math.sin(x * f * 2.3 + seed * 3.1 + o); a *= 0.5; f *= 2.1; } return base + height * (0.35 + 0.4 * v); };
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * step; const xb = xa + step; const ha = h(xa); const hb = h(xb);
    pos.push(xa, -20, z, xb, -20, z, xb, hb, z, xa, -20, z, xb, hb, z, xa, ha, z);
    for (const yy of [-20, -20, hb, -20, hb, ha]) { const k = THREE.MathUtils.clamp((yy - base) / (height * 1.1), 0, 1); const cc = c0.clone().lerp(c1, k > snow ? 1 : k * 0.35); col.push(cc.r, cc.g, cc.b); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2).fill(0.01), 2));
  return g;
}

// ----- modelli ripetuti con le istanze, disegnati solo vicino alla camera -----
const _m = new THREE.Matrix4(); const _q = new THREE.Quaternion(); const _p = new THREE.Vector3(); const _s = new THREE.Vector3(); const UP = new THREE.Vector3(0, 1, 0);
class Props {
  constructor(parent, gltf, list, { height = null, length = null, sideways = false, shadows = false, emissive = null } = {}) {
    const info = prepareModel(gltf);
    if (!info.grounded) { const b = info.box; const cx = (b.min.x + b.max.x) / 2; const cz = (b.min.z + b.max.z) / 2; for (const p of info.parts) p.geo.translate(-cx, -b.min.y, -cz); info.grounded = true; }
    const w = info.box.max.x - info.box.min.x; const d = info.box.max.z - info.box.min.z;
    const base = length ? length / Math.max(w, d) : height ? height / info.height : 1;
    const yaw0 = sideways && d > w ? Math.PI / 2 : 0; // il lato lungo parallelo alla strada
    this.list = list.map((p) => ({ ...p, m: _m.compose(_p.set(p.x, p.y || 0, p.z), _q.setFromAxisAngle(UP, yaw0 + (p.rot || 0)), _s.setScalar(base * (p.s || 1))).clone() }));
    this.meshes = info.parts.map((pt) => {
      const mat = pt.mat === 'vc' ? toonMaterial({ vertexColors: true }) : toonMaterial({ map: pt.mat, ...(emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity: 0.25 } : {}) });
      const m = new THREE.InstancedMesh(pt.geo, mat, Math.max(1, this.list.length)); m.count = 0; m.frustumCulled = false; m.castShadow = shadows; m.receiveShadow = true; parent.add(m); return m;
    });
    this.lastX = -1e9;
  }
  update(cx, force = false, ahead = 0) {
    if (!force && Math.abs(cx - this.lastX) < 3) return;
    this.lastX = cx; let n = 0;
    for (const p of this.list) {
      const reach = 34 + Math.max(0, -p.z) * 1.15; // più è lontano, più è largo il campo visivo
      // con la camera alle spalle si vede lontano in avanti: gli oggetti entrano già nella nebbia (ahead)
      if (p.x < cx - reach || p.x > cx + Math.max(reach * 1.15, ahead)) continue;
      for (const m of this.meshes) m.setMatrixAt(n, p.m);
      n++;
    }
    for (const m of this.meshes) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  }
  setShadows(on) { for (const m of this.meshes) m.castShadow = on; }
}

// ----- il mondo -----
export class World {
  constructor(scene, models, quality, rand = Math.random) {
    this.scene = scene; this.models = models; this.quality = quality; this.rand = rand; // rand: sorgente di casualità del gioco (con seme nelle prove)
    this.dome = null; this.root = null;
    // luci comuni (cambiano colore a ogni livello)
    this.hemi = new THREE.HemisphereLight('#fff', '#888', 1);
    this.sun = new THREE.DirectionalLight('#fff', 2);
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.03;
    Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 16, bottom: -16, near: 1, far: 140 });
    this.fill = new THREE.DirectionalLight('#fff', 0.4); // luce di riempimento dal lato della camera
    this.rim = new THREE.DirectionalLight('#fff', 0); // controluce colorato sui bordi dei personaggi
    scene.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target, this.rim, this.rim.target);
    this.roadTexCache = {};
    this.applyQuality(quality.cfg);
  }

  applyQuality(cfg) {
    this.sun.castShadow = cfg.shadows;
    this.sun.shadow.mapSize.set(cfg.shadowMap, cfg.shadowMap);
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    this.density = cfg.density;
    this.rainOn = this.quality.level !== 'low';
    if (this.rain) this.rain.visible = this.rainOn && !!this.L?.night;
    this.lampN = { high: 4, medium: 3, low: 2 }[this.quality.level] || 3;
  }

  // costruisce il livello i (e smonta il precedente)
  setLevel(i, span = 0) {
    const L = LEVELS[i]; this.L = L; this.level = i;
    if (this.root) { this.scene.remove(this.root); this.root.traverse((o) => { if (o.isMesh || o.isPoints) { o.geometry?.dispose(); } }); }
    if (this.dome) { this.scene.remove(this.dome); this.dome.geometry.dispose(); }
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.dome = skyDome(L.sky); this.scene.add(this.dome);
    this.scene.fog = new THREE.Fog(L.fog, L.fogNear, L.fogFar);
    this.hemi.color.set(L.hemiSky); this.hemi.groundColor.set(L.hemiGround); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sun); this.sun.intensity = L.sunI;
    this.fill.color.set(L.fill); this.fill.intensity = L.fillI;
    this.rim.color.set(L.rim); this.rim.intensity = L.rimI;
    this.sunDir = new THREE.Vector3(...L.sky.sunDir).normalize();
    this.chunks = new Map(); this.props = []; this.anim = []; this.lamps = [];
    this.span = Math.max(L.len + 1400, span); // il paesaggio copre il livello e il combattimento col boss
    this.buildRoad(L);
    this.buildSkyExtras(L);
    if (L.id === 'harbor') this.buildHarbor(L);
    else if (L.id === 'pass') this.buildPass(L);
    else this.buildNeon(L);
    this.update(0, null, 0, true);
  }

  // ----- strada, marciapiedi e luci a terra (scorrono con il giocatore) -----
  buildRoad(L) {
    const rt = roadTexture(L); rt.repeat.set(240 / 16, 1);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(240, ROAD.front - ROAD.back), toonMaterial({ map: rt }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, (ROAD.front + ROAD.back) / 2); road.receiveShadow = true;
    this.road = road; this.roadTex = rt; this.root.add(road);
    // marciapiedi con cordolo
    const kerb = L.night ? '#3b3550' : L.id === 'pass' ? '#8a7a72' : '#b9b4ab';
    const walk = L.night ? '#2e2a40' : L.id === 'pass' ? '#7a6a62' : '#a9a397';
    const tiles = canvasTex(128, 128, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(0,0,0,.13)'; g.lineWidth = 3; for (let k = 0; k <= 128; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 128); g.moveTo(0, k); g.lineTo(128, k); g.stroke(); } });
    tiles.repeat.set(240 / 2, 2);
    const mkWalk = (z0, z1, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(240, y, Math.abs(z1 - z0)), toonMaterial({ color: walk, map: tiles })); m.position.set(0, y / 2, (z0 + z1) / 2); m.receiveShadow = true; this.root.add(m); return m; };
    this.walks = [];
    if (L.id !== 'pass') this.walks.push(mkWalk(ROAD.back, ROAD.back - 3.2, 0.18));
    this.walks.push(mkWalk(ROAD.front, ROAD.front + 2.4, 0.18));
    const kerbGeo = new THREE.BoxGeometry(240, 0.22, 0.25);
    for (const z of L.id === 'pass' ? [ROAD.front] : [ROAD.front, ROAD.back]) { const k = new THREE.Mesh(kerbGeo, toonMaterial({ color: kerb })); k.position.set(0, 0.11, z); this.root.add(k); this.walks.push(k); }
    // terreno sotto tutto (si vede ai bordi)
    const groundCol = L.id === 'harbor' ? '#b8b1a4' : L.id === 'pass' ? '#5d6b45' : '#1c1830';
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 60), toonMaterial({ color: groundCol }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -10); ground.receiveShadow = true; this.root.add(ground); this.ground = ground;
    if (L.id === 'pass') { ground.scale.y = 0.4; ground.position.z = 6; }
  }

  buildSkyExtras(L) {
    // sole/luna disegnati nel cielo quando sono davanti alla camera
    if (L.id !== 'harbor') {
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(L.night ? 14 : 26, 40), new THREE.MeshBasicMaterial({ color: L.night ? '#f4f0ff' : '#fff1c8', fog: false, depthWrite: false }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('light_01'), color: L.night ? '#a58cff' : '#ffb070', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: L.night ? 0.14 : 0.2 }));
      halo.scale.setScalar(L.night ? 150 : 260); halo.position.z = -1;
      g.add(halo, disc); disc.renderOrder = -5; halo.renderOrder = -6; this.root.add(g); this.orb = g;
    } else this.orb = null;
    // nuvole: piani lontani, si muovono piano
    this.clouds = [];
    if (!L.night) {
      const tex = cloudTexture(); const r = rnd(L.len);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, color: L.id === 'pass' ? '#ffc2a6' : '#ffffff', opacity: L.id === 'pass' ? 0.85 : 0.95 });
      for (let i = 0; i < 9; i++) {
        const c = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), mat);
        c.position.set(-200 + i * 190 + r() * 80, 70 + r() * 70, -420 - r() * 40); c.scale.setScalar(0.8 + r() * 0.9); c.renderOrder = -4;
        this.root.add(c); this.clouds.push(c);
      }
    }
    // stelle
    this.stars = null;
    if (L.night) {
      const N = 260; const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { const a = -Math.PI * 0.95 + hash(i * 3.1) * Math.PI * 0.9; const e = 0.08 + hash(i * 7.7) * 1.1; const rr = 470; pos[i * 3] = Math.cos(a) * Math.cos(e) * rr; pos[i * 3 + 1] = Math.sin(e) * rr; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * rr; }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#e6e0ff', size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
      this.stars.frustumCulled = false; this.stars.renderOrder = -8; this.root.add(this.stars);
    }
  }

  // ----- blocchi di geometria unita (edifici, container…), creati quando entrano in vista -----
  chunkAt(k) {
    if (this.chunks.has(k)) return;
    const group = new THREE.Group(); const x0 = k * CHUNK; const r = rnd(k * 7919 + this.level * 104729 + 13);
    this.chunkBuilder(group, x0, r);
    this.root.add(group); this.chunks.set(k, group);
  }
  dropChunk(k) { const g = this.chunks.get(k); if (!g) return; this.root.remove(g); g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); this.chunks.delete(k); }

  mergedMesh(group, geos, mat, { shadows = false } = {}) {
    if (!geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat); m.castShadow = shadows; m.receiveShadow = true; group.add(m);
    geos.forEach((g) => g.dispose()); return m;
  }

  // ===== LIVELLO 1: IL PORTO =====
  buildHarbor(L) {
    const M = this.models; const r = rnd(11);
    this.matBuild = toonMaterial({ vertexColors: true, map: windowTextures(false, 3).map });
    this.matBox = toonMaterial({ vertexColors: true, map: corrugatedTexture() });
    this.matPlain = toonMaterial({ vertexColors: true });
    // mare: toon con riflessi che scorrono
    const waterTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#2f8fc4'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 70; i++) { g.fillStyle = i % 3 ? 'rgba(255,255,255,.22)' : 'rgba(10,60,110,.25)'; const y = this.rand() * 256; const x = this.rand() * 256; g.fillRect(x, y, 20 + this.rand() * 40, 3); }
    });
    waterTex.repeat.set(30, 16);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 520), toonMaterial({ map: waterTex, color: '#7fd0f5' }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, -1.2, -300); this.root.add(water); this.water = water; this.waterTex = waterTex;
    // bordo della banchina
    const quay = new THREE.Mesh(new THREE.BoxGeometry(this.span + 400, 1.4, 1), toonMaterial({ color: '#8d8a84' })); quay.position.set(this.span / 2 - 200, -0.5, -40.5); this.root.add(quay);
    const quayTop = new THREE.Mesh(new THREE.PlaneGeometry(this.span + 400, 33), toonMaterial({ color: '#b3ab9c' })); quayTop.rotation.x = -Math.PI / 2; quayTop.position.set(this.span / 2 - 200, 0.0, -24); quayTop.receiveShadow = true; this.root.add(quayTop);
    // città lontana e colline dall'altra parte della baia
    const far = [];
    for (let x = -300; x < this.span + 300; x += 9 + r() * 14) { const h = 8 + r() * 34; far.push(paint(new THREE.BoxGeometry(8 + r() * 10, h, 8).translate(x, h / 2 - 1, -360 - r() * 30), new THREE.Color('#9fb8cf').lerp(new THREE.Color('#d8e8f3'), r() * 0.5))); }
    far.push(ridgeGeo(-400, this.span + 400, -420, 0, 70, '#a9c3d6', '#c8dbe8', 3.3, { snow: 2 }));
    this.mergedMesh(this.root, far, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    // navi sulla baia: scafo, ponte, fumaioli
    const ships = [];
    for (let x = 40; x < this.span; x += 140 + r() * 120) {
      const z = -120 - r() * 90; const len = 40 + r() * 40; const hull = ['#c0392b', '#1f4e79', '#2d6a4f', '#3d3d48'][Math.floor(r() * 4)];
      ships.push(paint(new THREE.BoxGeometry(len, 5, 9).translate(x, 1.5, z), hull));
      ships.push(paint(new THREE.BoxGeometry(len * 0.98, 1, 9.2).translate(x, 4.2, z), '#f2efe8'));
      ships.push(paint(new THREE.BoxGeometry(len * 0.22, 7, 7).translate(x - len * 0.3, 7, z), '#f4f1ea'));
      for (let c = 0; c < 4; c++) ships.push(paint(new THREE.BoxGeometry(5.8, 2.4, 7).translate(x - len * 0.05 + c * 6.1, 5.9 + (c % 2) * 2.4, z), ['#e76f51', '#2a9d8f', '#e9c46a', '#457b9d'][c]));
      ships.push(paint(new THREE.CylinderGeometry(1, 1.2, 4, 8).translate(x - len * 0.3, 12, z), '#e63946'));
    }
    this.mergedMesh(this.root, ships, this.matPlain);
    // gru del porto (Meshy) e lampioni sul marciapiede dietro
    const cranes = []; for (let x = 30; x < this.span; x += 70 + r() * 40) cranes.push({ x, z: -33 - r() * 4, rot: 0, s: 0.9 + r() * 0.25 });
    if (M.harbor_crane) this.props.push(new Props(this.root, M.harbor_crane, cranes, { height: 22, sideways: true }));
    const lamps = []; for (let x = 8; x < this.span; x += 22) lamps.push({ x, z: ROAD.back - 2.4, rot: 0 });
    if (M.street_lamp) this.props.push(new Props(this.root, M.street_lamp, lamps, { height: 6.5 }));
    // primo piano: bitte d'ormeggio e catenelle
    const fore = []; const fr = rnd(5);
    for (let x = -60; x < this.span + 60; x += 7) {
      fore.push(paint(new THREE.CylinderGeometry(0.28, 0.36, 0.9, 8).translate(x, 0.45 + 0.18, ROAD.front + 1.9), '#2b2d33'));
      fore.push(paint(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 8).translate(x, 0.95 + 0.18, ROAD.front + 1.9), '#3a3d45'));
      if (fr() > 0.3) fore.push(paint(new THREE.BoxGeometry(7, 0.06, 0.06).translate(x + 3.5, 0.95, ROAD.front + 1.9), '#f4c430'));
    }
    this.mergedMesh(this.root, fore, this.matPlain);
    this.chunkBuilder = (group, x0, rr) => {
      const box = []; const bld = []; const plain = [];
      // pile di container, colori pieni
      const cols = ['#d1495b', '#00798c', '#edae49', '#30638e', '#e76f51', '#2a9d8f', '#8d99ae', '#f4a261'];
      for (let x = x0; x < x0 + CHUNK; x += 6.4) {
        if (rr() < 0.45) continue;
        const z = -12 - Math.floor(rr() * 3) * 2.6; const stack = 1 + Math.floor(rr() * (rr() < 0.3 ? 3 : 2));
        for (let s = 0; s < stack; s++) box.push(boxGeo(6.1, 2.6, 2.45, x + (rr() - 0.5) * 0.4, s * 2.6, z, cols[Math.floor(rr() * cols.length)], { tile: [6.1, 2.6] }));
        if (rr() < 0.3) { const st2 = 1 + Math.floor(rr() * 3); for (let s = 0; s < st2; s++) box.push(boxGeo(6.1, 2.6, 2.45, x + 1, s * 2.6, z - 7 - rr() * 3, cols[Math.floor(rr() * cols.length)], { tile: [6.1, 2.6] })); }
      }
      // magazzini con tetti a falde, più dietro
      for (let x = x0 + rr() * 30; x < x0 + CHUNK; x += 40 + rr() * 30) {
        const w = 16 + rr() * 6; const h = 6 + rr() * 3; const z = -27 - rr() * 3; const c = ['#d9cbb0', '#c7b8a0', '#a9b7c4', '#e0d6c2'][Math.floor(rr() * 4)];
        box.push(boxGeo(w, h, 9, x, 0, z, c, { tile: [1.2, h] }));
        const roof = new THREE.CylinderGeometry(0.01, 6.6, 2.4, 4, 1).rotateY(Math.PI / 4).scale(w / 9.3, 1, 1).translate(x, h + 1.2, z); plain.push(paint(roof, '#8c4a3c'));
        plain.push(paint(new THREE.BoxGeometry(4, 4.5, 0.2).translate(x - w * 0.2, 2.25, z + 4.6), '#5a5f66'));
      }
      this.mergedMesh(group, box, this.matBox, { shadows: false });
      this.mergedMesh(group, bld, this.matBuild);
      this.mergedMesh(group, plain, this.matPlain);
    };
  }

  // ===== LIVELLO 2: IL PASSO =====
  buildPass(L) {
    const M = this.models; const r = rnd(23);
    this.matPlain = toonMaterial({ vertexColors: true });
    // catene di monti a strati: più lontane = più chiare e più rosa (prospettiva aerea)
    const layers = [
      { z: -420, base: 10, h: 190, col: '#c7849a', top: '#f6d8d8', seed: 1.1, snow: 0.62 },
      { z: -300, base: 0, h: 150, col: '#9a6a8e', top: '#f2d2d6', seed: 2.7, snow: 0.7 },
      { z: -190, base: -8, h: 95, col: '#6d5078', top: '#d9b7c7', seed: 4.2, snow: 0.82 },
      { z: -110, base: -10, h: 55, col: '#4a3d5c', top: '#7a5c7a', seed: 5.9, snow: 2 },
    ];
    for (const ly of layers) this.mergedMesh(this.root, [ridgeGeo(-500, this.span + 500, ly.z, ly.base, ly.h, ly.col, ly.top, ly.seed, { snow: ly.snow })], new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    // valle sotto la strada (davanti): prati scuri, si vede dall'alto
    const valley = new THREE.Mesh(new THREE.PlaneGeometry(900, 300), toonMaterial({ color: '#4c5a3c' })); valley.rotation.x = -Math.PI / 2; valley.position.set(0, -26, 150); this.root.add(valley); this.valley = valley;
    // muro di sostegno e guardrail davanti
    const wall = new THREE.Mesh(new THREE.BoxGeometry(this.span + 400, 26, 1.2), toonMaterial({ color: '#8b7d78' })); wall.position.set(this.span / 2 - 200, -13, ROAD.front + 2.4 + 0.6); this.root.add(wall);
    const fore = [];
    for (let x = -80; x < this.span + 80; x += 3.2) fore.push(paint(new THREE.BoxGeometry(0.16, 0.8, 0.16).translate(x, 0.58, ROAD.front + 2.1), '#5b5560'));
    for (let x = -80; x < this.span + 80; x += 48) fore.push(paint(new THREE.BoxGeometry(48.2, 0.32, 0.08).translate(x + 24, 0.86, ROAD.front + 2.22), '#d9d4d0'));
    this.mergedMesh(this.root, fore, this.matPlain);
    // pini sulla valle (sotto) e sul pendio (dietro), rocce, baite
    // dietro la strada il terreno scende verso la valle: si vedono i monti e il sole che tramonta
    const slopeY = (x, z) => { const d = Math.max(0, -z - 5.4); return Math.max(-34, -d * 0.5 + d * 0.08 * Math.sin(x * 0.045 + z * 0.11) + Math.min(d, 6) * 0.12); };
    this.slopeY = slopeY;
    const pines = []; const pines2 = []; const rocks = []; const huts = [];
    for (let x = -60; x < this.span + 60; x += 3.5) {
      const h = (k) => hash(x * 1.37 + k * 17.1);
      if (h(1) < 0.9) { const z = -7.5 - h(2) * 50; pines.push({ x: x + h(3) * 3, y: slopeY(x, z) - 0.2, z, rot: h(4) * 6.28, s: 0.8 + h(5) * 0.7 }); }
      if (h(6) < 0.35) { const z = 22 + h(7) * 70; pines2.push({ x: x + h(8) * 4, y: -26, z, rot: h(9) * 6.28, s: 1 + h(10) * 0.6 }); }
      if (h(11) < 0) { const z = -6 - h(12) * 10; rocks.push({ x, y: slopeY(x, z) - 0.3, z, rot: h(13) * 6.28, s: 0.8 + h(14) * 1.2 }); }
      if (h(15) < 0.02) { const z = -16 - h(16) * 14; huts.push({ x, y: slopeY(x, z) - 0.4, z, rot: 0.2, s: 1 }); }
    }
    const pineM = M.tree_pineTallA || M.tree_pineDefaultA;
    if (pineM) { this.props.push(new Props(this.root, pineM, pines, { height: 9, shadows: false })); this.props.push(new Props(this.root, M.tree_pineDefaultA || pineM, pines2, { height: 11 })); }
    if (M.rock_largeA) this.props.push(new Props(this.root, M.rock_largeA, rocks, { height: 2.2 }));
    if (M.alpine_hut) this.props.push(new Props(this.root, M.alpine_hut, huts, { height: 8 }));
    this.chunkBuilder = (group, x0, rr) => {
      // pendio dietro la strada: fascia di terreno che sale, erba in basso e roccia in alto
      const nx = 12; const nz = 10; const pos = []; const col = [];
      const grass = new THREE.Color('#6f8a4a'); const grass2 = new THREE.Color('#58743d'); const rock = new THREE.Color('#8a7470'); const snow = new THREE.Color('#f0e4e4');
      const P = (i, j) => { const x = x0 + (i / nx) * CHUNK; const z = ROAD.back - 0.3 - (j / nz) * 75; return [x, slopeY(x, z) + (j ? Math.sin(x * 0.21 + j) * 0.35 : 0), z]; };
      const deep = new THREE.Color('#3d4a3a'); const C = (y, j) => (j % 2 ? grass : grass2).clone().lerp(deep, THREE.MathUtils.clamp(-y / 30, 0, 0.8)).lerp(rock, j === 0 ? 0.35 : 0);
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const a = P(i, j); const b = P(i + 1, j); const c = P(i + 1, j + 1); const d = P(i, j + 1);
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
        for (const p of [a, b, c, a, c, d]) { const cc = C(p[1], j); col.push(cc.r, cc.g, cc.b); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.matPlain); m.receiveShadow = true; group.add(m);
      // paletti di legno con i catarifrangenti lungo il ciglio dietro
      const posts = []; for (let x = x0; x < x0 + CHUNK; x += 8) { posts.push(paint(new THREE.BoxGeometry(0.14, 1, 0.14).translate(x, 0.5, ROAD.back - 0.5), '#f3efe6')); posts.push(paint(new THREE.BoxGeometry(0.15, 0.18, 0.15).translate(x, 0.85, ROAD.back - 0.5), '#e2483d')); }
      this.mergedMesh(group, posts, this.matPlain);
    };
  }

  // ===== LIVELLO 3: MOTOR CITY DI NOTTE =====
  buildNeon(L) {
    const M = this.models; const r = rnd(37);
    const wt = windowTextures(true, 9);
    this.matBuild = toonMaterial({ vertexColors: true, map: wt.map, emissiveMap: wt.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.6 });
    this.matPlain = toonMaterial({ vertexColors: true });
    this.neonTex = neonAtlas();
    this.matNeon = new THREE.MeshBasicMaterial({ map: this.neonTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    // skyline lontano: sagome con finestre accese
    const far = [];
    for (let x = -350; x < this.span + 350; x += 7 + r() * 10) { const h = 25 + r() * 90; far.push(boxGeo(7 + r() * 9, h, 10, x, -2, -230 - r() * 60, new THREE.Color('#2a2050').lerp(new THREE.Color('#4a2f7a'), r()), { uvOff: r() * 50 })); }
    const farMat = toonMaterial({ vertexColors: true, map: wt.map, emissiveMap: wt.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.6 });
    this.mergedMesh(this.root, far, farMat);
    // grattacieli al neon (Meshy) in seconda fila
    const towers = []; for (let x = 20; x < this.span; x += 34 + r() * 30) towers.push({ x, z: -62 - r() * 30, rot: (r() - 0.5) * 0.4, s: 0.85 + r() * 0.5 });
    if (M.neon_tower) this.props.push(new Props(this.root, M.neon_tower, towers, { height: 48, emissive: '#ffffff' }));
    // lampioni con luci colorate sul marciapiede dietro
    const lamps = []; for (let x = 6; x < this.span; x += 18) { lamps.push({ x, z: ROAD.back - 2.5, rot: 0 }); this.lamps.push({ x, z: ROAD.back - 1.6, col: (x / 18) % 2 < 1 ? '#ff4fd8' : '#4de3ff' }); }
    if (M.street_lamp) this.props.push(new Props(this.root, M.street_lamp, lamps, { height: 6.5 }));
    this.lampLights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight('#ff4fd8', 60, 22, 1.5); l.position.set(0, 5, 0); this.root.add(l); this.lampLights.push(l); }
    // pozze di luce sull'asfalto bagnato (riflessi colorati allungati)
    const poolTex = canvasTex(64, 256, (g) => { const gr = g.createRadialGradient(32, 128, 0, 32, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(0.4, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256); }, { repeat: false });
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35, fog: false }), 24);
    this.pools.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(24 * 3), 3); this.pools.frustumCulled = false; this.pools.count = 0; this.root.add(this.pools);
    // pioggia: strisce sottili che cadono attorno alla camera
    const RN = 260; const rg = new THREE.PlaneGeometry(0.025, 0.9);
    this.rain = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: '#b9c6ff', transparent: true, opacity: 0.35, depthWrite: false, fog: false }), RN);
    this.rain.frustumCulled = false; this.root.add(this.rain); this.rain.visible = this.rainOn;
    this.drops = Array.from({ length: RN }, () => ({ x: (this.rand() - 0.5) * 50, y: this.rand() * 16, z: 6 - this.rand() * 18, v: 18 + this.rand() * 8 }));
    // primo piano: ringhiera scura davanti
    const fore = [];
    for (let x = -60; x < this.span + 60; x += 2.4) fore.push(paint(new THREE.BoxGeometry(0.08, 1.0, 0.08).translate(x, 0.68, ROAD.front + 2.1), '#1a1726'));
    for (let x = -60; x < this.span + 60; x += 48) { fore.push(paint(new THREE.BoxGeometry(48.2, 0.08, 0.1).translate(x + 24, 1.18, ROAD.front + 2.1), '#ff4fd8')); fore.push(paint(new THREE.BoxGeometry(48.2, 0.06, 0.08).translate(x + 24, 0.7, ROAD.front + 2.1), '#2a2540')); }
    this.mergedMesh(this.root, fore, toonMaterial({ vertexColors: true, emissive: new THREE.Color('#ff4fd8'), emissiveIntensity: 0.0 }));
    this.foreRail = this.root.children[this.root.children.length - 1];
    this.chunkBuilder = (group, x0, rr) => {
      const shops = []; const signs = [];
      const pal = ['#3a2f5c', '#2c2a48', '#46305e', '#24304f', '#3d2b4f', '#2b3a5a'];
      // prima fila: negozi e palazzi bassi con le insegne
      for (let x = x0; x < x0 + CHUNK;) {
        const w = 8 + rr() * 8; const h = 5 + rr() * 7; const z = ROAD.back - 3.4 - 4.5;
        shops.push(boxGeo(w - 0.4, h, 9, x + w / 2, 0, z, pal[Math.floor(rr() * pal.length)], { uvOff: rr() * 40, tile: [16, 18] }));
        // vetrina illuminata al piano terra
        shops.push(paint(new THREE.BoxGeometry(w * 0.5, 2.0, 0.2).translate(x + w / 2, 1.3, z + 4.55), ['#8a6a3a', '#3f7d8a', '#8a4a78'][Math.floor(rr() * 3)], 'none'));
        // insegne: una o due per palazzo
        const ns = 1 + Math.floor(rr() * 2);
        for (let s = 0; s < ns; s++) {
          const i = Math.floor(rr() * 8); const sz = 2.2 + rr() * 1.6; const sy = Math.min(h + sz * 0.55, 3.6 + rr() * 4);
          const q = new THREE.PlaneGeometry(sz, sz).translate(x + w * (0.3 + 0.4 * rr()), sy, z + 4.62);
          const uv = q.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, ((i % 4) + uv.getX(k)) / 4, 1 - (Math.floor(i / 4) + (1 - uv.getY(k))) / 2);
          signs.push(q);
        }
        x += w;
      }
      // seconda fila: palazzi alti
      const tall = [];
      for (let x = x0 + rr() * 10; x < x0 + CHUNK; x += 14 + rr() * 14) { const h = 14 + rr() * 26; tall.push(boxGeo(9 + rr() * 6, h, 12, x, 0, -32 - rr() * 16, pal[Math.floor(rr() * pal.length)], { uvOff: rr() * 40, tile: [14, 15] })); }
      const em = this.matBuild;
      this.mergedMesh(group, shops, em);
      this.mergedMesh(group, tall, em);
      if (signs.length) { const m = new THREE.Mesh(mergeGeometries(signs, false), this.matNeon); m.renderOrder = 2; group.add(m); signs.forEach((g) => g.dispose()); }
    };
  }

  // ----- a ogni fotogramma -----
  update(px, cam, dt, force = false) {
    const L = this.L; if (!L) return;
    // blocchi visibili: da 2 dietro a 4 avanti (la camera vede più lontano in profondità)
    const k0 = Math.floor((px - 70) / CHUNK); const k1 = Math.floor((px + Math.max(130, this.ahead || 0)) / CHUNK);
    for (let k = k0; k <= k1; k++) this.chunkAt(k);
    for (const k of [...this.chunks.keys()]) if (k < k0 - 1 || k > k1 + 1) this.dropChunk(k);
    for (const p of this.props) p.update(px, force, this.ahead || 0);
    // la strada scorre: il piano segue il giocatore a passi di 16 m, la tessitura resta ferma nel mondo
    const snap = Math.floor(px / 16) * 16;
    this.road.position.x = snap + 60;
    for (const w of this.walks) w.position.x = snap + 60;
    this.ground.position.x = snap + 60;
    if (this.water) { this.water.position.x = snap; this.waterTex.offset.x += dt * 0.01; this.waterTex.offset.y += dt * 0.004; }
    if (this.valley) this.valley.position.x = snap;
    if (cam) {
      this.dome.position.copy(cam.position);
      if (this.orb) { this.orb.position.copy(cam.position).addScaledVector(this.sunDir, 440); this.orb.lookAt(cam.position); }
      if (this.stars) this.stars.position.copy(cam.position);
      for (const c of this.clouds) c.position.x += dt * 1.2;
    }
    // luci: il sole segue il giocatore (ombre nitide vicino a lui)
    const d = this.sunDir;
    this.sun.position.set(px + 6 + d.x * 60, d.y * 60 + 2, d.z * 60); this.sun.target.position.set(px + 6, 0, 0);
    this.fill.position.set(px - 10, 12, 30); this.fill.target.position.set(px + 4, 1, 0);
    this.rim.position.set(px + 30, 10, -30); this.rim.target.position.set(px, 1, 0);
    if (L.night) this.updateNeon(px, dt);
  }

  updateNeon(px, dt) {
    const near = this.lamps.filter((l) => l.x > px - 14 && l.x < px + 34);
    this.lampLights.forEach((l, i) => { const lm = near[i]; if (lm && i < this.lampN) { l.visible = true; l.color.set(lm.col); l.position.set(lm.x, 5.6, lm.z); } else l.visible = false; });
    const c = new THREE.Color(); let n = 0;
    for (const lm of this.lamps) {
      if (lm.x < px - 30 || lm.x > px + 60 || n >= 24) continue;
      this.pools.setMatrixAt(n, _m.compose(_p.set(lm.x, 0.02, 0.4), _q.identity(), _s.set(2.2, 1, 9)));
      this.pools.setColorAt(n, c.set(lm.col)); n++;
    }
    this.pools.count = n; this.pools.instanceMatrix.needsUpdate = true; if (this.pools.instanceColor) this.pools.instanceColor.needsUpdate = true;
    if (this.rain.visible) {
      for (let i = 0; i < this.drops.length; i++) {
        const d = this.drops[i]; d.y -= d.v * dt; if (d.y < 0) { d.y = 14 + this.rand() * 3; d.x = (this.rand() - 0.3) * 50; }
        this.rain.setMatrixAt(i, _m.compose(_p.set(px + d.x, d.y, d.z), _q.identity(), _s.set(1, 1, 1)));
      }
      this.rain.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() { if (this.root) this.scene.remove(this.root); }
}
