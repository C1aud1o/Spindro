// Slipstream: la strada di campagna (asfalto a tre corsie, banchine, prati falciati), i campi ai lati e gli oggetti lungo il percorso.
// Tutto segue il giocatore lungo Z: strada e campi sono riciclati, alberi e case sono istanze con una finestra che avanza
// (le più lontane "crescono" dalla nebbia: niente comparse di colpo).
import { THREE, toonMaterial, scatterModel, prepareModel } from './kit3d.js';
import { groundModel } from './kit/env.js';

export const LANE_W = 2.3;           // larghezza di una corsia (m)
export const ROAD_HALF = 4.0;        // metà della sede asfaltata
const TILE = 16;                     // lunghezza della piastrella di strada che si ripete (m)
const ROAD_SPAN = 24;                // larghezza della piastrella (strada + banchine + prato falciato)

export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

// ---------- strada ----------
function roadTexture() {
  const S = 512; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const kx = S / ROAD_SPAN; const kz = S / TILE; const X = (m) => (m + ROAD_SPAN / 2) * kx; const rand = rng(21);
  // prato falciato a strisce larghe ai lati
  g.fillStyle = '#86b84f'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#7bae48'; for (let z = 0; z < TILE; z += 8) g.fillRect(0, z * kz, S, 4 * kz);
  // banchina sterrata e asfalto
  g.fillStyle = '#c7ab78'; g.fillRect(X(-ROAD_HALF - 1.1), 0, 2 * (ROAD_HALF + 1.1) * kx, S);
  g.fillStyle = '#5a5961'; g.fillRect(X(-ROAD_HALF), 0, 2 * ROAD_HALF * kx, S);
  for (let i = 0; i < 2600; i++) { g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; g.fillRect(X(-ROAD_HALF) + rand() * 2 * ROAD_HALF * kx, rand() * S, 2, 2); }
  // linee: bordi pieni, corsie tratteggiate
  g.fillStyle = '#f4f1e8';
  for (const x of [-ROAD_HALF + 0.45, ROAD_HALF - 0.45]) g.fillRect(X(x - 0.07), 0, 0.14 * kx, S);
  for (const x of [-LANE_W / 2, LANE_W / 2]) for (let z = 0; z < TILE; z += 8) g.fillRect(X(x - 0.07), z * kz, 0.14 * kx, 3.6 * kz);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 1);
  return tex;
}

// campo a righe: grigio chiaro/scuro, il colore arriva dall'istanza
function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#dcdcdc'; for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 8, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const FIELD_COLORS = ['#e0bd63', '#8fc05a', '#b0794c', '#72a642', '#d3ac55', '#a9c45a', '#9bb84d'];

export class Road {
  constructor(scene, quality) {
    this.scene = scene;
    // prato di fondo (grande, a tinta unita: il resto lo fanno la nebbia e i campi)
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), toonMaterial({ color: '#86b84f' }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.position.y = -0.1; this.ground.receiveShadow = false; scene.add(this.ground);
    // strada: una piastrella che segue il giocatore a scatti di TILE metri (il disegno si ripete: nessun salto visibile)
    const geo = new THREE.PlaneGeometry(ROAD_SPAN, 360); geo.rotateX(-Math.PI / 2);
    const rep = 360 / TILE; const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * rep);
    this.road = new THREE.Mesh(geo, toonMaterial({ map: roadTexture() }));
    this.road.receiveShadow = true; this.road.position.y = 0; scene.add(this.road);
    // campi ai lati: istanze di un piano, riciclate quando passano dietro
    this.rand = rng(77); this.N = 20; this.fields = new Array(this.N).fill(null);
    const fg = new THREE.PlaneGeometry(1, 1); fg.rotateX(-Math.PI / 2);
    const fuv = fg.attributes.uv; for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 6, fuv.getY(i) * 6);
    this.fieldMesh = new THREE.InstancedMesh(fg, toonMaterial({ map: stripeTexture() }), this.N);
    this.fieldMesh.frustumCulled = false; this.fieldMesh.receiveShadow = false; this.fieldMesh.position.y = 0.05; scene.add(this.fieldMesh);
    this.m4 = new THREE.Matrix4(); this.col = new THREE.Color(); this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    this.nextZ = [-90, -90]; // fine dell'ultimo campo posato, per lato
    for (let i = 0; i < this.N; i++) { this.fieldMesh.setMatrixAt(i, this.hidden); this.fieldMesh.setColorAt(i, this.col.set('#ffffff')); }
    this.update(0);
  }

  place(i, key) {
    const r = this.rand; const side = key ? 1 : -1; const len = 40 + r() * 70; const wid = 26 + r() * 50; const gap = 9 + r() * 3;
    const z0 = this.nextZ[key] + 1.6; this.nextZ[key] = z0 + len;
    this.fields[i] = { z1: z0 + len, key };
    this.m4.compose(new THREE.Vector3(side * (gap + wid / 2), 0, z0 + len / 2), new THREE.Quaternion(), new THREE.Vector3(wid, 1, len));
    this.fieldMesh.setMatrixAt(i, this.m4); this.fieldMesh.setColorAt(i, this.col.set(FIELD_COLORS[Math.floor(r() * FIELD_COLORS.length)]));
    this.fieldMesh.instanceMatrix.needsUpdate = true; if (this.fieldMesh.instanceColor) this.fieldMesh.instanceColor.needsUpdate = true;
  }

  update(z) {
    this.road.position.z = Math.floor(z / TILE) * TILE; this.ground.position.z = z;
    // campi: quelli finiti 60 m dietro tornano davanti, oltre la nebbia (un lato per volta, fino a 230 m)
    for (const key of [0, 1]) {
      while (this.nextZ[key] < z + 230) {
        let slot = -1;
        for (let i = 0; i < this.N; i++) { const f = this.fields[i]; if (!f || f.z1 < z - 60) { slot = i; break; } }
        if (slot < 0) break;
        this.place(slot, key);
      }
    }
  }
}

// ---------- oggetti lungo il percorso ----------
function textureAvg(map) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); g.drawImage(map.image, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data; let r = 0; let gr = 0; let b = 0; let n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++; }
    return n ? new THREE.Color().setRGB(r / n / 255, gr / n / 255, b / n / 255, THREE.SRGBColorSpace) : null;
  } catch { return null; }
}

// Alberi, cipressi, cespugli, case, fienili, balle di fieno, gregge, trattore: tutto lungo la strada fino a zMax.
export function buildScenery(scene, m, opt, zMax, quality) {
  const rand = rng(3); const inst = [];
  const add = (gltf, list, { kind = 'house', lodDist = 70, avg = null, shadows = false } = {}) => {
    if (!gltf || !list.length) return null;
    groundModel(gltf);
    const info = prepareModel(gltf); const tp = info.parts.find((p) => p.mat !== 'vc');
    if (tp) { const c = textureAvg(tp.mat); if (c) { info.avg = avg ? new THREE.Color(avg) : c; if (kind === 'tree') info.trunkCol = info.trunkCol || new THREE.Color('#6b4a2b'); } }
    const it = scatterModel(scene, gltf, list, { kind, lodDist, shadows, window: [-30, 150], grow: 32 });
    it.baseLod = lodDist; inst.push(it); return it;
  };
  const at = (x, z, h, rot = 0) => ({ x, y: 0, z, d: z, rot, h });
  const trees = [[], [], []]; const cyp = []; const bush1 = []; const bush2 = [];
  for (let z = 6; z < zMax; z += 6.5 + rand() * 2.5) {
    for (const side of [-1, 1]) {
      const x = side * (6.0 + rand() * 1.3);
      if (rand() < 0.7) cyp.push(at(x, z, 7 + rand() * 2.6, rand() * 6.28));
      else (rand() < 0.5 ? bush1 : bush2).push(at(x, z, 1.0 + rand() * 0.7, rand() * 6.28));
    }
  }
  for (let z = 0; z < zMax; z += 22 + rand() * 12) { for (const side of [-1, 1]) trees[Math.floor(rand() * 3)].push(at(side * (10 + rand() * 12), z + rand() * 10, 5 + rand() * 3.5, rand() * 6.28)); }
  for (let z = 0; z < zMax; z += 40 + rand() * 20) { for (const side of [-1, 1]) { const o = 7.8 + rand() * 8; bush1.push(at(side * o, z + rand() * 14, 1 + rand() * 0.7, rand() * 6.28)); bush2.push(at(side * (o + 2.5), z + rand() * 14, 0.9 + rand() * 0.6, rand() * 6.28)); } }
  add(m.cypress, cyp, { kind: 'tree', lodDist: 45 });
  add(m.tree1, trees[0], { kind: 'tree', lodDist: 55 }); add(m.tree2, trees[1], { kind: 'tree', lodDist: 55 }); add(m.tree3, trees[2], { kind: 'tree', lodDist: 55 });
  add(m.bush1, bush1, { kind: 'tree', lodDist: 40 }); add(m.bush2, bush2, { kind: 'tree', lodDist: 40 });
  // case coloniche, fienili, silos, mulini: una ogni 70–140 m, alternando i lati, voltate verso la strada
  const farms = []; const barns = []; const silos = []; const mills = []; const hay = []; const herdsS = []; const herdsC = []; const tractors = []; const church = [];
  let k = 0;
  for (let z = 50; z < zMax; z += 75 + rand() * 70) {
    const side = k++ % 2 ? 1 : -1; const x = side * (15 + rand() * 12); const face = Math.atan2(-side, 0);
    const r = rand();
    if (r < 0.4) { farms.push(at(x, z, 8, face + (side > 0 ? -Math.PI / 2 : Math.PI / 2) * 0 + Math.PI / 2 * -side)); }
    else if (r < 0.62) { barns.push(at(x, z, 6.5, rand() * 0.6 - 0.3)); silos.push(at(x + side * 8, z + 3, 9, 0)); }
    else if (r < 0.78) mills.push(at(side * (22 + rand() * 12), z, 10, rand() * 6));
    else if (r < 0.86) church.push(at(side * 26, z, 14, Math.PI / 2 * -side));
    else tractors.push(at(side * (9 + rand() * 2), z, 2.1, Math.PI / 2 + rand() * 0.4));
    for (let j = 0; j < 2 + Math.floor(rand() * 3); j++) hay.push(at(side * (8.5 + rand() * 6), z + 16 + j * 3.4, 1.5, rand() * 6.28));
  }
  for (let z = 25; z < zMax; z += 55 + rand() * 40) {
    const side = rand() > 0.5 ? 1 : -1; const cx = side * (10.5 + rand() * 5); const sheep = rand() > 0.4;
    for (let j = 0; j < 4 + Math.floor(rand() * 4); j++) (sheep ? herdsS : herdsC).push(at(cx + (rand() - 0.5) * 12, z + (rand() - 0.5) * 12, sheep ? 0.95 : 1.45, rand() * 6.28));
  }
  add(m.farm, farms, { kind: 'house', lodDist: 150 }); add(m.barn, barns, { kind: 'house', lodDist: 150 }); add(m.silo, silos, { kind: 'house', lodDist: 150 });
  add(m.church, church, { kind: 'house', lodDist: 150 }); add(m.hay, hay, { kind: 'house', lodDist: 50 });
  if (opt.windmill) add(opt.windmill, mills, { kind: 'house', lodDist: 150 });
  add(opt.sheep, herdsS, { kind: 'house', lodDist: 60, avg: '#e9e9e2' }); add(opt.cow, herdsC, { kind: 'house', lodDist: 60, avg: '#d6d6d6' });
  add(opt.tractor, tractors, { kind: 'house', lodDist: 60 });
  return inst;
}

// ---------- arco di arrivo / traguardo volante ----------
// Il modello Meshy è centrato e col lato lungo in X o Z: lo si porta a terra, con la campata lungo X e larga quanto la strada.
export function buildArch(gltf, span = 9.6, tint = null) {
  const info = prepareModel(gltf); const b = info.box; const w = b.max.x - b.min.x; const d = b.max.z - b.min.z;
  const cx = (b.min.x + b.max.x) / 2; const cz = (b.min.z + b.max.z) / 2;
  if (!info.dressed) { for (const p of info.parts) p.geo.translate(-cx, -b.min.y, -cz); info.dressed = true; }
  const g = new THREE.Group(); const turn = d > w ? Math.PI / 2 : 0; const s = span / Math.max(w, d);
  const inner = new THREE.Group(); inner.rotation.y = turn; inner.scale.setScalar(s);
  for (const p of info.parts) inner.add(new THREE.Mesh(p.geo, toonMaterial({ map: p.mat === 'vc' ? null : p.mat, vertexColors: p.mat === 'vc', color: tint || '#ffffff' })));
  g.add(inner); g.userData.height = info.height * s;
  return g;
}
