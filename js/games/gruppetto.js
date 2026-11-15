// GRUPPETTO — raccogli i ciclisti rimasti indietro: si accodano alla tua scia e il gruppo si allunga.
// Non urtare la staccionata né la coda del tuo gruppo. Più è lungo il gruppo, più sale la pendenza (tiri tu!).
// + / − girano a destra / sinistra (tenuti premuti: curva continua). Sprint = punti doppi.
// Grafica come Turbo Pedali (docs/giochi-stile.md): ciclisti Meshy con bici (Cyclist), campagna italiana con modelli Meshy a istanze.
import * as THREE from 'three';
import { Effects } from './kit3d.js';
import { loadGLTF } from './kit/loader.js';
import { skyDome, styleLights, styleFog, toonMaterial, PALETTE } from './kit/style.js';
import { Cyclist, loadMeshyTemplate, loadCyclistTemplate, makeKit, CYCLIST_URL, MESHY_FAN_URL } from './kit/cyclist.js';
import { scatterModel, groundModel, prepareModel } from './kit/env.js';
import { txt, panel, uiScale, powerColor, gradeColor, HUD } from './kit/hud.js';
import { clamp, lerp, pick } from './engine.js';
import { Base3D } from './base3d.js';
import { t } from '../i18n.js';

const A = 'assets/3d';
const HALF = 22;            // metà lato dell'arena
const GAP = 1.7;            // distanza tra i corridori in fila
const TURN = 2.3;           // rad/s con il tasto tenuto
const TAP = Math.PI / 6;    // un tocco = 30°
const WORLD = 340;          // lato del terreno (m)
const PLAYER_COLOR = '#d9ff3d';
const JERSEYS = PALETTE.jerseys.filter((c) => c !== PLAYER_COLOR);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// piccola funzione casuale con seme: il paesaggio è sempre lo stesso
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

// ---------- terreno ----------
// Campi a strisce (grano, prato, arato, filari), siepi, strade sterrate con file di cipressi.
// Le celle della griglia sono fra i bordi EDGES; il centro (arena) è prato.
const EDGES = [-160, -118, -78, -34, 34, 78, 118, 160];
function worldTexture() {
  const S = 1024; const k = S / WORLD; const rand = rng(11);
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const P = (m) => (m + WORLD / 2) * k;
  g.fillStyle = '#86b84f'; g.fillRect(0, 0, S, S);
  const kinds = [['#e0bd63', '#cfa650'], ['#8fc05a', '#7fb04c'], ['#b0794c', '#9a6840'], ['#72a642', '#62973a'], ['#e0bd63', '#d3ac55'], ['#a9c45a', '#98b44c']];
  for (let i = 0; i < EDGES.length - 1; i++) for (let j = 0; j < EDGES.length - 1; j++) {
    if (i === 3 && j === 3) continue; // il centro (arena e strada intorno) non è un campo
    if (EDGES[i] === -34 && EDGES[j] === -34) continue;
    const x0 = EDGES[i] + 3.5; const x1 = EDGES[i + 1] - 3.5; const z0 = EDGES[j] + 3.5; const z1 = EDGES[j + 1] - 3.5;
    if (x1 <= x0 || z1 <= z0) continue;
    const cols = kinds[Math.floor(rand() * kinds.length)]; const vert = rand() > 0.5; const w = 2 + rand() * 1.6;
    g.save(); g.beginPath(); g.rect(P(x0), P(z0), (x1 - x0) * k, (z1 - z0) * k); g.clip();
    g.fillStyle = cols[0]; g.fillRect(P(x0), P(z0), (x1 - x0) * k, (z1 - z0) * k);
    g.fillStyle = cols[1];
    const len = vert ? z1 - z0 : x1 - x0; const wid = vert ? x1 - x0 : z1 - z0;
    for (let a = 0; a < wid; a += w * 2) { if (vert) g.fillRect(P(x0 + a), P(z0), w * k, len * k); else g.fillRect(P(x0), P(z0 + a), len * k, w * k); }
    g.restore();
    g.strokeStyle = '#4f8a3a'; g.lineWidth = 2.2 * k; g.lineJoin = 'round'; g.strokeRect(P(x0), P(z0), (x1 - x0) * k, (z1 - z0) * k);
  }
  // strade sterrate: anello intorno all'arena e quattro strade verso l'orizzonte
  const dirt = (x0, z0, x1, z1, w) => {
    g.lineCap = 'butt'; g.strokeStyle = '#bd9a64'; g.lineWidth = (w + 1.2) * k; g.beginPath(); g.moveTo(P(x0), P(z0)); g.lineTo(P(x1), P(z1)); g.stroke();
    g.strokeStyle = '#d9c08e'; g.lineWidth = w * k; g.stroke();
  };
  const R = 31;
  dirt(-R, -R, R, -R, 4); dirt(R, -R, R, R, 4); dirt(R, R, -R, R, 4); dirt(-R, R, -R, -R, 4);
  dirt(0, R, 0, WORLD / 2, 4.4); dirt(0, -R, 0, -WORLD / 2, 4.4); dirt(R, 0, WORLD / 2, 0, 4.4); dirt(-R, 0, -WORLD / 2, 0, 4.4);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// prato dell'arena: falciatura a strisce e due sentieri sterrati che si incrociano; bordi sfumati nel campo
function arenaTexture() {
  const S = 512; const L = (HALF + 3) * 2; const k = S / L; const rand = rng(5);
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#8cc055'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#7bb04a'; for (let a = 0; a < L; a += 8) g.fillRect(a * k, 0, 4 * k, S);
  const path = (horiz) => {
    g.fillStyle = '#c9a56e'; g.globalAlpha = 0.9;
    if (horiz) g.fillRect(0, S / 2 - 1.6 * k, S, 3.2 * k); else g.fillRect(S / 2 - 1.6 * k, 0, 3.2 * k, S);
    g.globalAlpha = 1;
  };
  path(true); path(false);
  for (let i = 0; i < 700; i++) { g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(40,70,20,.08)'; g.fillRect(rand() * S, rand() * S, 3, 3); }
  const cols = ['#fff3c0', '#ffffff', '#ffb0c8', '#ffd34d']; // fiorellini
  for (let i = 0; i < 90; i++) { g.fillStyle = cols[i % 4]; const x = rand() * S; const y = rand() * S; g.fillRect(x, y, 3, 3); }
  g.globalCompositeOperation = 'destination-out'; const e = 3 * k;
  for (const [x0, y0, x1, y1, gx, gy] of [[0, 0, S, e, 0, 1], [0, S - e, S, S, 0, -1], [0, 0, e, S, 1, 0], [S - e, 0, S, S, -1, 0]]) {
    const gr = g.createLinearGradient(gx > 0 ? x0 : gx < 0 ? x1 : 0, gy > 0 ? y0 : gy < 0 ? y1 : 0, gx > 0 ? x1 : gx < 0 ? x0 : 0, gy > 0 ? y1 : gy < 0 ? y0 : 0);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// bandierina sopra il ciclista da raccogliere: asta chiara + triangolo oro (una mesh, un draw call)
function flagGeometry() {
  const pole = new THREE.CylinderGeometry(0.035, 0.035, 2.5, 5); pole.translate(0, 1.25, 0);
  const flag = new THREE.BufferGeometry();
  flag.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.45, 0, 0.9, 2.2, 0, 0, 1.95, 0, 0, 2.45, 0, 0, 1.95, 0, 0.9, 2.2, 0], 3));
  const col = (g, c) => { const n = g.attributes.position.count; const a = new Float32Array(n * 3); const cc = new THREE.Color(c); for (let i = 0; i < n; i++) cc.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const p = pole.toNonIndexed(); p.deleteAttribute('uv'); p.deleteAttribute('normal');
  const merged = new THREE.BufferGeometry();
  const a = col(p, '#f4f1e8'); const b = col(flag, '#ffd34d');
  for (const key of ['position', 'color']) {
    const A1 = a.attributes[key]; const B1 = b.attributes[key]; const arr = new Float32Array(A1.array.length + B1.array.length); arr.set(A1.array); arr.set(B1.array, A1.array.length);
    merged.setAttribute(key, new THREE.BufferAttribute(arr, 3));
  }
  return merged;
}

// colore medio di un modello con texture (per la sagoma lontana: senza, prenderebbe un grigio)
function textureAvg(map) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); g.drawImage(map.image, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data; let r = 0; let gr = 0; let b = 0; let n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++; }
    return n ? new THREE.Color().setRGB(r / n / 255, gr / n / 255, b / n / 255, THREE.SRGBColorSpace) : null;
  } catch { return null; }
}

// sagoma lontana della staccionata: due paletti e due traverse (il blocco pieno sembrerebbe un muro)
function fenceProxy() {
  const col = new THREE.Color('#b8733a'); const parts = [];
  const box = (w, h, d, x, y) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, 0); g.deleteAttribute('uv'); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  box(0.07, 0.57, 0.07, -0.44, 0.285); box(0.07, 0.57, 0.07, 0.44, 0.285); box(0.96, 0.06, 0.05, 0, 0.2); box(0.96, 0.06, 0.05, 0, 0.42);
  const pos = []; const colr = []; const nor = [];
  for (const g of parts) { pos.push(...g.attributes.position.array); colr.push(...g.attributes.color.array); nor.push(...g.attributes.normal.array); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

const OPTIONAL = { sheep: `${A}/meshy/sheep.glb`, cow: `${A}/meshy/cow.glb`, tractor: `${A}/meshy/tractor.glb`, windmill: `${A}/meshy/windmill.glb`, fence: `${A}/meshy/fence.glb` };

export class Gruppetto extends Base3D {
  constructor(hud, hooks, audio) {
    super(hud, hooks, audio, {
      key: 'gruppetto', title: 'games.gruppetto.hud.title', tagline: 'games.gruppetto.hud.tagline', song: 'city',
      rules: ['games.gruppetto.rule1', 'games.gruppetto.rule2', 'games.gruppetto.rule3', 'games.gruppetto.rule4', 'games.gruppetto.rule5'],
    });
    this.half = HALF; this.free = {};
  }

  assets() {
    const Q = `${A}/quaternius`;
    return {
      cypress: `${A}/meshy/cypress.glb`, hay: `${A}/meshy/hay_bale.glb`, farm: `${A}/meshy/farmhouse.glb`, church: `${A}/meshy/church.glb`,
      tree1: `${Q}/nature/tree1.glb`, tree2: `${Q}/nature/tree2.glb`, tree3: `${Q}/nature/tree3.glb`, bush1: `${Q}/nature/bush1.glb`, bush2: `${Q}/nature/bush2.glb`,
      barn: `${Q}/farm/barn.glb`, silo: `${Q}/farm/silo.glb`,
    };
  }

  // ciclista Meshy con scheletro automatico (se non si carica: il ciclista Quaternius) e modelli facoltativi del paesaggio
  async preload() {
    this.tpl = await loadMeshyTemplate().catch((err) => { console.warn('Meshy cyclist:', err); return loadCyclistTemplate(CYCLIST_URL); });
    // il giocatore ha il modello completo (15k triangoli); gli altri ciclisti la versione leggera (3,5k): il gruppo costa poco
    this.tplLo = await loadMeshyTemplate(MESHY_FAN_URL).catch(() => this.tpl);
    this.opt = {};
    await Promise.all(Object.entries(OPTIONAL).map(async ([k, u]) => { this.opt[k] = await loadGLTF(u).catch(() => null); }));
  }

  build() {
    const { scene } = this.stage; const q = this.stage.quality;
    this.scene = scene; this.free = {}; this.player = null; this.train = []; this.strays = [];
    this.stage.camera.far = 600; this.stage.camera.updateProjectionMatrix();
    scene.add(skyDome('golden'));
    styleFog(scene, 'golden', 70, 240);
    this.light = styleLights(scene, 'golden', { shadows: q.cfg.shadows, mapSize: q.cfg.shadowMap, extent: 30 });
    // terreno: campi e strade; sopra, il prato dell'arena
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), toonMaterial({ map: worldTexture() }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const arena = new THREE.Mesh(new THREE.PlaneGeometry((HALF + 3) * 2, (HALF + 3) * 2), toonMaterial({ map: arenaTexture(), transparent: true, depthWrite: false }));
    arena.rotation.x = -Math.PI / 2; arena.position.y = 0.03; arena.receiveShadow = true; arena.renderOrder = 1; scene.add(arena);
    this.buildScenery();
    this.fx = new Effects(scene, 60);
    // bandierina dei ciclisti da raccogliere
    this.flagGeo = flagGeometry(); this.flagMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    // freccia sopra il giocatore
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.32, 4), new THREE.MeshBasicMaterial({ color: PLAYER_COLOR }));
    this.marker.rotation.x = Math.PI;
    this.stage.onQuality = (cfg) => this.applyQuality(cfg);
    this.applyQuality(q.cfg);
  }

  applyQuality(cfg) {
    if (this.stage.bloom) { this.stage.bloom.threshold = 0.93; this.stage.bloom.strength = 0.45; this.stage.bloom.radius = 0.35; }
    if (this.stage.composer && this.scene) this.stage.composer.passes[0].scene = this.scene;
    for (const i of this.inst || []) { i.setDensity(cfg.density); i.lodDist = i.baseLod * (0.5 + 0.5 * cfg.density); } // meno qualità: meno oggetti, sagome più vicine
    if (this.light) this.light.sun.castShadow = cfg.shadows;
    for (const c of [this.player, ...(this.train || []).map((r) => r.cy), ...(this.strays || []).map((s) => s.cy)]) c?.setShadows(cfg.shadows);
    this.shadowsOn = cfg.shadows;
  }

  // ---------- paesaggio ----------
  buildScenery() {
    const { scene } = this.stage; const m = this.m; const o = this.opt; const rand = rng(3);
    this.inst = [];
    const add = (gltf, list, { kind = 'house', lodDist = 60, shadows = false, avg = null, lodGeo = null } = {}) => {
      if (!gltf || !list.length) return;
      groundModel(gltf);
      const info = prepareModel(gltf); const tp = info.parts.find((p) => p.mat !== 'vc');
      if (tp) { const c = textureAvg(tp.mat); if (c) { info.avg = avg ? new THREE.Color(avg) : c; if (kind === 'tree') info.trunkCol = info.trunkCol || new THREE.Color('#6b4a2b'); } }
      const inst = scatterModel(scene, gltf, list, { kind, lodDist, shadows, lodGeo });
      inst.baseLod = lodDist; this.inst.push(inst); return inst;
    };
    const at = (x, z, h, rot = 0, always = false) => ({ x, y: 0, z, rot, h, always });
    // staccionata Meshy intorno all'arena
    if (o.fence) {
      const fh = 1.15; const info = { w: 0.96 / 0.57 * fh }; const step = info.w * 0.97; const list = [];
      const edge = HALF + 0.2;
      for (let a = -edge + step / 2; a < edge; a += step) {
        list.push(at(a, -edge, fh, 0, true), at(a, edge, fh, 0, true), at(-edge, a, fh, Math.PI / 2, true), at(edge, a, fh, Math.PI / 2, true));
      }
      this.fence = add(o.fence, list, { kind: 'house', lodDist: 28, lodGeo: fenceProxy() }); if (this.fence) this.fence.cullR = 46;
    }
    // strade con filari di cipressi
    const cyp = [];
    for (const [ax, az] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      for (let d = 42; d < 150; d += 7 + rand() * 1.5) for (const side of [-1, 1]) {
        const off = side * (5.2 + rand() * 0.5);
        cyp.push(at(ax ? d * ax : off, az ? d * az : off, 7.5 + rand() * 2.5, rand() * 6.28));
      }
    }
    // cipressi dietro la staccionata, a gruppetti
    for (let i = 0; i < 14; i++) { const a = rand() * 6.28; const r = 28 + rand() * 4; cyp.push(at(Math.cos(a) * r, Math.sin(a) * r, 7 + rand() * 2.5, rand() * 6.28)); }
    add(m.cypress, cyp, { kind: 'tree', lodDist: 34 });
    // case coloniche, chiesa in fondo alla strada, fienili
    const face = (x, z) => Math.atan2(-x, -z);
    const houses = [[11, 62], [-11, -88], [74, -11], [-96, 12], [58, 64], [-60, 52], [66, -70]];
    add(m.farm, houses.map(([x, z]) => at(x, z, 8, face(x, z) + Math.PI / 2 * (x === 11 || x === -11 ? (x > 0 ? 1 : -1) : 0), true)), { kind: 'house', lodDist: 150 });
    add(m.church, [at(0, 128, 14, Math.PI, true), at(-4, -138, 14, 0, true)], { kind: 'house', lodDist: 150 });
    add(m.barn, [at(-52, -44, 6.5, 0.4, true), at(50, 40, 6.5, -2.6, true)], { kind: 'house', lodDist: 150 });
    add(m.silo, [at(-60, -44, 9, 0, true), at(58, 44, 9, 0, true)], { kind: 'house', lodDist: 150 });
    if (o.windmill) add(o.windmill, [at(-40, 88, 10, 0.6, true), at(92, 38, 10, 2, true)], { kind: 'house', lodDist: 150 });
    // balle di fieno nei campi, a file
    const hay = [];
    for (let i = 0; i < 26; i++) {
      const a = rand() * 6.28; const r = 38 + rand() * 80; const x = Math.cos(a) * r; const z = Math.sin(a) * r;
      if (Math.abs(x) < 8 || Math.abs(z) < 8) continue;
      for (let k = 0; k < 2 + Math.floor(rand() * 3); k++) hay.push(at(x + k * 3.6, z, 1.5, rand() * 6.28));
    }
    for (const [x, z] of [[27, 12], [-27, -9], [12, -28], [-6, 27]]) hay.push(at(x, z, 1.5, rand() * 6.28, true));
    add(m.hay, hay, { kind: 'house', lodDist: 36 });
    // alberi lungo le siepi dei campi + cespugli
    const trees = []; const bushes = [];
    for (const e of [-118, -78, 78, 118]) {
      for (let d = -150; d < 150; d += 9 + rand() * 6) { if (Math.abs(d) < 36 && Math.abs(e) < 80) continue; trees.push(at(e + (rand() - 0.5) * 2, d, 5 + rand() * 3.5, rand() * 6.28)); trees.push(at(d, e + (rand() - 0.5) * 2, 5 + rand() * 3.5, rand() * 6.28)); }
    }
    add(m.tree1, trees.filter((_, i) => i % 3 === 0), { kind: 'tree', lodDist: 50 });
    add(m.tree2, trees.filter((_, i) => i % 3 === 1), { kind: 'tree', lodDist: 50 });
    add(m.tree3, trees.filter((_, i) => i % 3 === 2), { kind: 'tree', lodDist: 50 });
    for (let i = 0; i < 60; i++) { const a = rand() * 6.28; const r = 27 + rand() * 90; bushes.push(at(Math.cos(a) * r, Math.sin(a) * r, 0.9 + rand() * 0.8, rand() * 6.28)); }
    add(m.bush1, bushes.filter((_, i) => i % 2), { kind: 'tree', lodDist: 40 });
    add(m.bush2, bushes.filter((_, i) => !(i % 2)), { kind: 'tree', lodDist: 40 });
    // animali: gregge di pecore e mucche al pascolo, trattore sulla strada
    const herd = (cx, cz, n, spread, h) => Array.from({ length: n }, () => at(cx + (rand() - 0.5) * spread, cz + (rand() - 0.5) * spread, h, rand() * 6.28));
    add(o.sheep, [...herd(-42, 52, 8, 14, 0.95), ...herd(52, -45, 7, 12, 0.95), ...herd(-30, 18, 4, 5, 0.95)], { kind: 'house', lodDist: 55, avg: '#e9e9e2' });
    add(o.cow, [...herd(42, 58, 5, 14, 1.45), ...herd(-62, -50, 5, 14, 1.45), ...herd(36, 22, 2, 4, 1.45)], { kind: 'house', lodDist: 55, avg: '#d6d6d6' });
    add(o.tractor, [at(31, -14, 2.1, Math.PI / 2, true), at(-88, -30, 2.1, 0.8, true)], { kind: 'house', lodDist: 60 });
  }

  // ---------- ciclisti ----------
  rider(color, idx, lo = true) {
    const key = color + (lo ? 'l' : 'h'); const free = this.free[key];
    let cy = free?.pop();
    if (!cy) { cy = new Cyclist(lo ? this.tplLo : this.tpl, makeKit(color, idx), { shadows: this.shadowsOn }); cy.poolKey = key; cy.rigX0 = cy.rig.position.x; this.scene.add(cy.root); }
    cy.root.visible = true; cy.sitDown(); cy.rig.position.x = cy.rigX0; cy.stand = 0; cy.lean.rotation.set(0, 0, 0);
    return cy;
  }
  release(cy) { cy.root.visible = false; cy.root.remove(this.marker); (this.free[cy.poolKey] = this.free[cy.poolKey] || []).push(cy); }

  reset() {
    for (const r of this.train || []) this.release(r.cy);
    for (const s of this.strays || []) { this.release(s.cy); this.scene.remove(s.flag); }
    if (this.player) this.release(this.player);
    this.player = this.rider(PLAYER_COLOR, 0, false);
    this.player.root.add(this.marker); this.marker.position.set(0, 2.15, -0.1);
    this.x = 0; this.z = -HALF + 6; this.h = 0; this.hT = 0; this.camH = 0; this.lean = 0; this.train = []; this.strays = [];
    // traccia del giocatore: punti (x, z) con la distanza percorsa; i seguaci la leggono per distanza (interpolata: nessuno scatto)
    this.dist = 0; this.PX = []; this.PZ = []; this.PD = [];
    for (let d = -80; d <= 0; d += 0.25) { this.PX.push(this.x); this.PZ.push(this.z + d); this.PD.push(d); }
    this.score = 0; this.sprintT = 0; this.camInit = false;
    for (let i = 0; i < 3; i++) this.addStray();
    this.hooks.setGrade?.(0); this.sentGrade = 0;
  }

  onBegin() { this.say(t('games.gruppetto.go'), '#d9ff3d', 1.8, true); }

  addStray() {
    let x; let z; let guard = 0;
    do { x = (Math.random() * 2 - 1) * (HALF - 4); z = (Math.random() * 2 - 1) * (HALF - 4); } while (guard++ < 30 && (Math.hypot(x - this.x, z - this.z) < 9 || this.hitsTrain(x, z, 2.5, 0)));
    const cy = this.rider(pick(JERSEYS), 1 + Math.floor(Math.random() * 5));
    cy.standUp(); cy.bike.visible = true; cy.standX = 0.8; cy.setShadows(this.shadowsOn); // fermo accanto alla bici, saluta
    cy.root.position.set(x, 0, z); cy.root.rotation.y = Math.random() * 6; cy.t = Math.random() * 6;
    const flag = new THREE.Mesh(this.flagGeo, this.flagMat); flag.position.set(x, 0, z); flag.frustumCulled = false; this.scene.add(flag);
    this.strays.push({ cy, x, z, flag, yaw: cy.root.rotation.y });
  }

  // un tocco imposta la nuova direzione: la bici ci arriva con una curva morbida
  press(dir) { this.hT -= dir * TAP; }

  // joining: se vero, anche chi si sta ancora unendo conta (serve a non far comparire un ciclista sulla fila);
  // per gli urti con la propria coda no: il nuovo arrivato scivola in fila partendo da dove l'hai raccolto, cioè vicino a te
  hitsTrain(x, z, rad, skip, joining = true) {
    for (let i = skip; i < this.train.length; i++) { if (!joining && this.train[i].blend > 0) continue; const p = this.train[i].cy.root.position; if (Math.hypot(p.x - x, p.z - z) < rad) return true; }
    return false;
  }

  // punto della traccia alla distanza d (interpolazione lineare)
  trackAt(d, out) {
    const D = this.PD; let lo = 0; let hi = D.length - 1;
    if (d <= D[0]) { out.x = this.PX[0]; out.z = this.PZ[0]; return out; }
    if (d >= D[hi]) { out.x = this.PX[hi]; out.z = this.PZ[hi]; return out; }
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (D[mid] <= d) lo = mid; else hi = mid; }
    const k = (d - D[lo]) / Math.max(1e-6, D[hi] - D[lo]);
    out.x = lerp(this.PX[lo], this.PX[hi], k); out.z = lerp(this.PZ[lo], this.PZ[hi], k); return out;
  }

  step(dt) {
    const v = clamp((this.kmh / 3.6) * 0.42, 2.2, 7) * (this.sprinting ? 1.15 : 1);
    this.v = v;
    this.hT -= this.steer(dt, TURN);
    // curva fluida verso la direzione voluta (velocità di sterzo limitata) e piega in curva
    const dh = this.hT - this.h; const turn = Math.sign(dh) * Math.min(Math.abs(dh), 3.2 * dt);
    this.h += turn; this.lean += ((turn / Math.max(dt, 1e-3)) * 0.12 - this.lean) * Math.min(1, dt * 8);
    this.x += Math.sin(this.h) * v * dt; this.z += Math.cos(this.h) * v * dt;
    this.dist += v * dt;
    this.PX.push(this.x); this.PZ.push(this.z); this.PD.push(this.dist);
    if (this.PD.length > 6000) { this.PX.splice(0, 2000); this.PZ.splice(0, 2000); this.PD.splice(0, 2000); }
    if (this.sprinting) this.sprintT += dt;
    this.followTrain(dt);
    // raccolta
    for (const s of this.strays) {
      if (Math.hypot(s.x - this.x, s.z - this.z) < 1.5) {
        s.done = true; this.scene.remove(s.flag);
        const cy = s.cy; cy.sitDown(); cy.rig.position.x = cy.rigX0;
        const p = cy.root.position;
        this.train.push({ cy, blend: 1, ox: p.x, oz: p.z, yaw: cy.root.rotation.y, fresh: true });
        const pts = (this.sprinting ? 2 : 1) * (10 + this.train.length * 2);
        this.score += pts; this.prog('rescues', 1, 3);
        this.audio.sfx('rescue'); this.pop(`+${pts}`, this.sprinting ? '#4de3ff' : '#ffd166', this.x, 2.4, this.z);
        this.fx.spawn(s.x, 1, s.z, { tex: 'green', size: 3, life: 0.4 });
        if (this.train.length % 5 === 0) this.say(t('games.gruppetto.groupOf', { n: this.train.length + 1 }), '#d9ff3d', 1.6, true);
      }
    }
    this.strays = this.strays.filter((s) => !s.done);
    const want = 2 + Math.min(4, Math.floor(this.train.length / 6));
    while (this.strays.length < want) this.addStray();
    // la pendenza sale con la lunghezza del gruppo
    const grade = Math.min(7, Math.round(this.train.length * 0.25 * 2) / 2);
    if (grade !== this.sentGrade) { this.sentGrade = grade; this.hooks.setGrade(grade); }
    this.score += dt * (this.sprinting ? 2 : 1) * (1 + this.train.length * 0.1);
    // urti
    if (Math.abs(this.x) > HALF - 0.4 || Math.abs(this.z) > HALF - 0.4) return this.crash(t('games.gruppetto.fence'));
    if (this.hitsTrain(this.x, this.z, 0.9, 3, false)) return this.crash(t('games.gruppetto.rearEnded'));
  }

  // la fila segue la traccia esatta: posizione e direzione sono interpolate, chi si è appena unito scivola in fila
  followTrain(dt) {
    const a = this._a || (this._a = { x: 0, z: 0 }); const b = this._b || (this._b = { x: 0, z: 0 });
    for (let i = 0; i < this.train.length; i++) {
      const r = this.train[i]; const want = this.dist - (i + 1) * GAP;
      this.trackAt(want, a); this.trackAt(want + 0.9, b);
      const yawT = Math.atan2(b.x - a.x, b.z - a.z);
      if (r.blend > 0) r.blend = Math.max(0, r.blend - dt / 0.9);
      const e = r.blend * r.blend * (3 - 2 * r.blend); // morbido
      const p = r.cy.root.position;
      p.x = lerp(a.x, r.ox, e); p.z = lerp(a.z, r.oz, e);
      const dy = wrapAngle(yawT - r.yaw); r.yaw += dy * Math.min(1, dt * 9);
      r.cy.root.rotation.y = r.yaw;
      r.cy.lean.rotation.z = lerp(r.cy.lean.rotation.z, clamp(-dy * 1.4, -0.3, 0.3), Math.min(1, dt * 6));
    }
  }

  crash(why) {
    this.fx.explode(this.x, 1, this.z, 1); this.audio.sfx('hurt'); this.why = why;
    if (navigator.vibrate) navigator.vibrate(120);
    this.score = Math.round(this.score);
    this.hooks.progress?.setMax('gruppettoMax', this.train.length + 1);
    this.end(this.train.length * 2);
  }

  view(dt) {
    const cad = this.cadence || 80; const cam = this.stage.camera;
    const pl = this.player; pl.root.position.set(this.x, 0, this.z); pl.root.rotation.set(0, this.h, 0);
    pl.lean.rotation.z = -clamp(this.lean, -0.35, 0.35); // piega verso l'interno della curva
    const wheel = this.state === 'play' ? (this.v || 0) : 0;
    pl.pose(dt, this.state === 'play' ? cad : cad * 0.5, wheel, { stand: this.sprinting ? 1 : 0 });
    // camera: dietro e sopra, guarda avanti (si vede l'orizzonte della campagna)
    const tall = this.stage.H > this.stage.W; // telefono in verticale: più indietro e più in alto
    const back = 11 + (tall ? 3 : 0) + Math.min(7, this.train.length * 0.22);
    this.camH += wrapAngle(this.h - this.camH) * Math.min(1, dt * 3.5);
    const tx = this.x - Math.sin(this.camH) * back; const tz = this.z - Math.cos(this.camH) * back;
    const ty = 6.8 + back * 0.28 + (tall ? 1.5 : 0);
    if (!this.camInit) { cam.position.set(tx, ty, tz); this.camInit = true; }
    cam.position.x += (tx - cam.position.x) * Math.min(1, dt * 3); cam.position.y += (ty - cam.position.y) * Math.min(1, dt * 3); cam.position.z += (tz - cam.position.z) * Math.min(1, dt * 3);
    const ahead = tall ? 12 : 9; const lx = this.x + Math.sin(this.camH) * ahead; const lz = this.z + Math.cos(this.camH) * ahead;
    cam.lookAt(lx, 0.6, lz);
    const fov = this.sprinting ? 66 : 60; cam.fov += (fov - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix();
    const cx = cam.position.x; const cz = cam.position.z; const dl = Math.hypot(lx - cx, lz - cz) || 1;
    // chi è lontano dalla camera non si anima (e le code lunghe restano economiche)
    const near = (cy) => { const p = cy.root.position; return Math.hypot(p.x - cx, p.z - cz) < 30; };
    for (const r of this.train) { const on = near(r.cy); r.cy.body.visible = on; if (on) r.cy.pose(dt, cad, this.v || 0, { stand: this.sprinting ? 1 : 0 }); }
    for (const s of this.strays) {
      const cy = s.cy; const p = cy.root.position;
      const dxp = this.x - p.x; const dzp = this.z - p.z; const dist = Math.hypot(dxp, dzp);
      if (dist < 16) { s.yaw += wrapAngle(Math.atan2(dxp, dzp) - s.yaw) * Math.min(1, dt * 3); cy.root.rotation.y = s.yaw; } // si gira a salutare
      s.flag.rotation.y = Math.sin(this.t * 4 + s.x) * 0.4; s.flag.position.y = Math.sin(this.t * 3 + s.z) * 0.08;
      cy.body.visible = Math.hypot(p.x - cx, p.z - cz) < 45;
      if (cy.body.visible) cy.pose(dt, 0, 0, { wave: true });
    }
    this.fx.update(dt);
    this.light.follow(this.x, 0, this.z);
    for (const i of this.inst) i.cull(cx, cz, (lx - cx) / dl, (lz - cz) / dl, i.cullR || 175);
  }

  hud(ctx, W, H) {
    const s = uiScale(W, H); const top = 54; const gap = 8; const m = 12;
    const pw = Math.min((W - m * 2 - gap * 2) / 3, 150 * s); const ph = 62 * s;
    const box = (i, label, value, color) => {
      const x = i === 0 ? m : i === 1 ? (W - pw) / 2 : W - m - pw;
      panel(ctx, x, top, pw, ph, {});
      txt(ctx, label, x + pw / 2, top + 16 * s, { size: 14 * s, align: 'center', color: HUD.dim, maxW: pw - 8 });
      txt(ctx, value, x + pw / 2, top + ph - 8 * s, { size: 44 * s, align: 'center', color, maxW: pw - 8 });
    };
    box(0, t('games.gruppetto.lblGroup'), String(this.train.length + 1), HUD.lime);
    box(1, t('games.gruppetto.lblScore'), String(Math.round(this.score)), this.sprinting ? HUD.cyan : HUD.white);
    box(2, 'WATT', String(Math.round(this.power)), powerColor(this.power, this.effort.threshold));
    // barra potenza sottile con soglia sprint
    const by = top + ph + 6; const bw = W - m * 2; const maxW = Math.max(400, (this.effort.threshold || 200) * 1.6);
    ctx.fillStyle = 'rgba(12,12,18,.55)'; ctx.fillRect(m, by, bw, 7 * s);
    ctx.fillStyle = this.sprinting ? HUD.cyan : HUD.lime; ctx.fillRect(m, by, bw * clamp(this.power / maxW, 0, 1), 7 * s);
    if (this.effort.threshold) { ctx.fillStyle = '#fff'; ctx.fillRect(m + bw * clamp(this.effort.threshold / maxW, 0, 1) - 1, by - 2, 2, 11 * s); }
    // pendenza (colorata) e punti doppi
    const gy = by + 10 * s; const g = this.sentGrade || 0;
    panel(ctx, m, gy, 118 * s, 26 * s, { r: 8, fill: 'rgba(12,12,18,.55)' });
    txt(ctx, t('games.gruppetto.grade', { n: g }), m + 59 * s, gy + 19 * s, { size: 16 * s, align: 'center', color: gradeColor(g), maxW: 108 * s });
    if (this.sprinting) { panel(ctx, W - m - 118 * s, gy, 118 * s, 26 * s, { r: 8, fill: 'rgba(12,12,18,.55)' }); txt(ctx, t('games.gruppetto.double'), W - m - 59 * s, gy + 19 * s, { size: 16 * s, align: 'center', color: HUD.cyan, maxW: 108 * s }); }
    this.edgeArrow(ctx, W, H, s, gy + 40 * s);
  }

  // freccia sul bordo dello schermo verso il ciclista da raccogliere più vicino, se è fuori dall'inquadratura
  edgeArrow(ctx, W, H, s, minY) {
    let best = null; let bd = 1e9;
    for (const st of this.strays) { const d = Math.hypot(st.x - this.x, st.z - this.z); if (d < bd) { bd = d; best = st; } }
    if (!best) return;
    const cam = this.stage.camera; const v = new THREE.Vector3(best.x, 1.5, best.z).project(cam);
    let sx = v.x; let sy = v.y; if (v.z > 1) { sx = -sx; sy = -sy; }
    const pad = 30 * s;
    if (v.z <= 1 && Math.abs(sx) < 0.88 && sy > -0.85 && (1 - sy) / 2 * H > minY) return; // si vede già (bandierina)
    const k = Math.max(Math.abs(sx) / 0.88, Math.abs(sy) / 0.85, 1e-3);
    const px = clamp((sx / k + 1) / 2 * W, pad, W - pad); const py = clamp((1 - sy / k) / 2 * H, minY + pad * 0.6, H - pad - 20);
    const ang = Math.atan2(-(py - H / 2), px - W / 2);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-ang);
    ctx.fillStyle = HUD.gold; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(16 * s, 0); ctx.lineTo(-10 * s, -13 * s); ctx.lineTo(-4 * s, 0); ctx.lineTo(-10 * s, 13 * s); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
    txt(ctx, `${Math.round(bd)} m`, px, py + (py > H / 2 ? -20 : 30) * s, { size: 14 * s, align: 'center', color: HUD.gold });
  }

  summary() {
    return [this.why || t('games.gruppetto.over'), t('games.gruppetto.size', { n: this.train.length + 1 }), t('games.gruppetto.stats', { m: Math.round(this.dist), s: Math.round(this.sprintT) })];
  }
}
