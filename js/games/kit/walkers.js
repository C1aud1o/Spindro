// Nemici Meshy per L'Orda: scheletro automatico (autorig.js) e animazione PROCEDURALE sulle ossa.
// - Walker: un nemico vicino, con ossa vere. Camminata/corsa barcollante, braccia avanti, colpo, caduta all'indietro.
// - makeEnemyKit: carica un modello, prepara il materiale e la geometria "cotta" in posa fissa per la folla lontana.
// - FarCrowd: tante istanze della posa cotta (un solo draw call per tipo). Le gambe oscillano nel vertex shader,
//   a tempo con la distanza percorsa, così da lontano sembra che camminino.
// Convenzione dei modelli: avanti = +Z, su = +Y, sinistra del personaggio = +X (come il resto del kit).
import * as THREE from 'three';
import { loadMeshyTemplate } from './cyclist.js';
import { toonMaterial } from './style.js';

const BONES = ['Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head', 'UpperLegL', 'LowerLegL', 'UpperLegR', 'LowerLegR', 'UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR'];
const _pw = new THREE.Quaternion(); const _e = new THREE.Euler(0, 0, 0, 'XYZ');
const qe = (rx = 0, ry = 0, rz = 0) => new THREE.Quaternion().setFromEuler(_e.set(rx, ry, rz));

// Stili di movimento: ampiezza delle gambe, inclinazione del busto, braccia, velocità del passo per metro
export const STYLES = {
  walk: { stride: 0.5, leg: 0.5, knee: 0.55, lean: 0.22, arm: 0.12, armUp: 0.1, elbow: 0.35, sway: 0.1, bob: 0.05, freq: 1.7 },
  run: { stride: 0.8, leg: 0.85, knee: 1.1, lean: 0.42, arm: 0.7, armUp: -0.3, elbow: 1.3, sway: 0.06, bob: 0.09, freq: 1.3, pump: true },
  brute: { stride: 0.42, leg: 0.42, knee: 0.4, lean: 0.12, arm: 0.35, armUp: 0.55, elbow: 0.2, sway: 0.2, bob: 0.07, freq: 2.0 },
  bones: { stride: 0.6, leg: 0.65, knee: 0.8, lean: 0.3, arm: 0.5, armUp: 0.05, elbow: 0.7, sway: 0.14, bob: 0.06, freq: 1.5 },
  boss: { stride: 0.38, leg: 0.38, knee: 0.35, lean: 0.12, arm: 0.5, armUp: 0.9, elbow: 0.3, sway: 0.22, bob: 0.09, freq: 2.4 },
};

// ----- un nemico vicino -----
export class Walker {
  constructor(kit) {
    this.kit = kit; const tpl = kit.tpl;
    const arm = tpl.scene.children[0].clone(true);
    const drop = []; arm.traverse((o) => { if (o.isMesh) drop.push(o); }); drop.forEach((o) => o.parent.remove(o));
    const byName = {}; arm.traverse((o) => { if (o.isBone) byName[o.name] = o; });
    const bones = tpl.skeleton.bones.map((b) => byName[b.name]);
    this.body = new THREE.SkinnedMesh(kit.geo, kit.material);
    this.body.bind(new THREE.Skeleton(bones, tpl.skeleton.boneInverses), new THREE.Matrix4());
    this.body.frustumCulled = false;
    this.inner = new THREE.Group(); this.inner.add(arm, this.body);
    this.inner.scale.setScalar(kit.scale); this.inner.position.y = -tpl.minY * kit.scale;
    this.pivot = new THREE.Group(); this.pivot.add(this.inner); // la caduta ruota attorno ai piedi
    this.root = new THREE.Group(); this.root.add(this.pivot);
    this.byName = byName; this.list = BONES.map((n) => byName[n]).filter(Boolean);
    this.t = Math.random() * 10; this.phase = Math.random() * 6.28; this.fall = 0; this.lunge = 0; this.lungeDur = 0.3; this.hit = 0;
    this.rest = this.list.map((b) => kit.rest[b.name]);
    this.C = this.list.map(() => new THREE.Quaternion());
    this.root.userData.walker = this;
  }

  // D = { osso: quaternione di rotazione nello spazio del modello }; le altre ossa restano a riposo.
  // C_b = D · C_padre (rotazione cumulata); locale = Rw_padre⁻¹ · C_padre⁻¹ · D · C_padre · Rw_b
  apply(D) {
    const L = this.list; const C = this.C;
    for (let i = 0; i < L.length; i++) {
      const r = this.rest[i]; const b = L[i]; const d = D[b.name];
      const Cp = r.parent >= 0 ? C[r.parent] : null;
      if (!d && !Cp) { C[i].identity(); b.quaternion.copy(r.local); continue; }
      if (d) C[i].copy(d); else C[i].identity();
      if (Cp) C[i].multiply(Cp);
      b.quaternion.copy(C[i]).multiply(r.world);
      if (r.parentWorld) {
        if (Cp) { _pw.copy(Cp).multiply(r.parentWorld).invert(); b.quaternion.premultiply(_pw); } else b.quaternion.premultiply(r.parentWorldInv);
      }
    }
  }

  // stile di movimento, velocità del nemico (m/s), tempo trascorso
  update(dt, style, speed, { dying = false } = {}) {
    this.t += dt;
    const S = STYLES[style] || STYLES.walk;
    this.phase += dt * speed / S.stride * Math.PI; // un ciclo ogni 2·stride metri
    const f = this.phase; const D = {};
    const lungeK = this.lunge > 0 ? Math.sin((1 - this.lunge / this.lungeDur) * Math.PI) : 0;
    this.lunge = Math.max(0, this.lunge - dt);
    this.hit = Math.max(0, this.hit - dt * 5);
    if (dying) return this.poseDeath(dt);
    // anche e busto: ondeggiano, leggermente piegati in avanti
    D.Hips = qe(0, Math.sin(f) * S.sway * 1.4, Math.sin(f) * S.sway * 0.7);
    D.Abdomen = qe(-S.lean * 0.5 - lungeK * 0.35 + this.hit * 0.5, -Math.sin(f) * S.sway, 0);
    D.Torso = qe(-S.lean * 0.4, 0, 0);
    D.Chest = qe(-S.lean * 0.2 + this.hit * 0.3, 0, 0);
    D.Head = qe(S.lean * 0.7 - this.hit * 0.4 + Math.sin(this.t * 2.3 + this.phase) * 0.05, 0, Math.sin(f * 0.5) * 0.12);
    for (const [k, sx, ph] of [['L', 1, 0], ['R', -1, Math.PI]]) {
      const s = Math.sin(f + ph); const c = Math.cos(f + ph);
      D[`UpperLeg${k}`] = qe(-s * S.leg, 0, 0);
      D[`LowerLeg${k}`] = qe(Math.max(0, c * -s + 0.4 * (1 - s)) * S.knee * 0.8 + Math.max(0, -s) * S.knee * 0.3, 0, 0); // il ginocchio si piega quando la gamba è indietro
      // braccia: avanti (T → +Z), con oscillazione e gomito
      const swing = S.pump ? -s * S.arm : s * S.arm * 0.25;
      const yaw = -sx * Math.PI / 2 + sx * (S.pump ? 0.5 : 0.18) * 1; // verso avanti
      D[`UpperArm${k}`] = qe(-(S.armUp + swing) - lungeK * 0.6 - this.hit * 0.2, yaw, 0);
      D[`LowerArm${k}`] = qe(-S.elbow * (S.pump ? 0.6 + 0.4 * c : 1) - lungeK * 0.3, 0, 0);
    }
    this.apply(D);
    this.pivot.rotation.x = 0; this.pivot.position.y = Math.abs(Math.sin(f)) * S.bob;
  }

  // caduta all'indietro: il busto ruota attorno ai piedi, le braccia si aprono
  poseDeath(dt) {
    this.fall = Math.min(1, this.fall + dt / 0.55); const k = 1 - (1 - this.fall) ** 2; const D = {};
    D.Abdomen = qe(0.3 * k, 0, 0); D.Head = qe(-0.4 * k, 0, 0);
    for (const [kk, sx] of [['L', 1], ['R', -1]]) {
      D[`UpperArm${kk}`] = qe(-0.5 * k, -sx * (Math.PI / 2 - 0.6 * k), 0); D[`LowerArm${kk}`] = qe(-0.4 * k, 0, 0);
      D[`UpperLeg${kk}`] = qe(-0.2 * k * sx, 0, sx * 0.1 * k); D[`LowerLeg${kk}`] = qe(0.5 * k, 0, 0);
    }
    this.apply(D);
    this.pivot.rotation.x = -k * (Math.PI / 2 - 0.12); this.pivot.position.y = Math.sin(k * Math.PI) * 0.25;
  }

  dispose() { /* la geometria è condivisa */ }
}

// ----- modello nemico: template Meshy, materiale, posa cotta -----
export async function makeEnemyKit(url, height, { tint = false } = {}) {
  const tpl = await loadMeshyTemplate(url);
  const scale = height / tpl.height;
  tpl.scene.updateMatrixWorld(true);
  // riferimenti a riposo (quaternione mondo e locale) e indice padre → posizione nella lista
  const rest = {}; const bonesByName = {}; tpl.scene.traverse((o) => { if (o.isBone) bonesByName[o.name] = o; });
  const index = {}; BONES.forEach((n, i) => { index[n] = i; });
  const parentOf = (b) => { let p = b.parent; while (p && p.isBone) { if (index[p.name] !== undefined) return p; p = p.parent; } return null; };
  for (const n of BONES) {
    const b = bonesByName[n]; if (!b) continue;
    const p = parentOf(b); const world = b.getWorldQuaternion(new THREE.Quaternion());
    const pw = p ? p.getWorldQuaternion(new THREE.Quaternion()) : null;
    // il padre diretto può essere un osso non animato (spalla): il riferimento resta quello diretto
    const direct = b.parent && b.parent.isBone ? b.parent : null;
    const dw = direct ? direct.getWorldQuaternion(new THREE.Quaternion()) : null;
    rest[n] = { local: b.quaternion.clone(), world, parent: p ? BONES.indexOf(p.name) : -1, parentWorld: dw, parentWorldInv: dw ? dw.clone().invert() : null, direct: direct?.name };
  }
  const material = enemyMaterial(tpl.map, height);
  const geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) geo.setAttribute(k, tpl.geo.attributes[k]);
  if (tpl.geo.index) geo.setIndex(tpl.geo.index);
  geo.boundingSphere = tpl.geo.boundingSphere;
  const kit = { tpl, scale, height, rest, index, material, geo, tint, url };
  return kit;
}

// posa cotta per la folla: una camminata a metà passo, braccia avanti
export function bakePose(kit, style = 'walk') {
  const w = new Walker(kit);
  const S = STYLES[style] || STYLES.walk;
  w.phase = 0.9; w.update(0.0001, style, 0);
  w.root.updateMatrixWorld(true);
  const src = kit.geo; const n = src.attributes.position.count; const out = new Float32Array(n * 3); const v = new THREE.Vector3();
  const toRoot = w.root.matrixWorld.clone().invert();
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(src.attributes.position, i); w.body.applyBoneTransform(i, v); v.applyMatrix4(w.body.matrixWorld); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
  void toRoot; void m; void S;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3)); g.setAttribute('normal', src.attributes.normal); g.setAttribute('uv', src.attributes.uv);
  if (src.index) g.setIndex(src.index);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// materiale toon con la texture del modello. Vale anche per la folla istanziata: se c'è un colore d'istanza lo usa come tinta,
// e le gambe oscillano a tempo con la distanza percorsa (uTime non serve: la fase è lo spostamento in z).
const mats = new Map();
export function enemyMaterial(map, height, { far = false } = {}) {
  const key = (map?.uuid || 'x') + (far ? 'f' : 'n');
  if (mats.has(key)) return mats.get(key);
  const m = toonMaterial({ map });
  if (far) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uH = { value: height };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uH;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].z * 3.6 + instanceMatrix[3].x * 0.9;
            float legK = smoothstep(uH * 0.5, 0.0, position.y);
            float side = position.x > 0.0 ? 1.0 : -1.0;
            transformed.z += sin(ph) * side * 0.30 * legK;
            transformed.y += abs(sin(ph)) * 0.04;
            transformed.x += sin(ph * 0.5) * 0.04 * position.y;
          #endif`);
    };
    m.customProgramCacheKey = () => 'enemy-far-v1';
  }
  mats.set(key, m);
  return m;
}

// ----- folla lontana -----
export class FarCrowd {
  constructor(scene, geo, material, capacity) {
    this.mesh = new THREE.InstancedMesh(geo, material, capacity);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    this.cap = capacity; scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._c = new THREE.Color();
    this.up = new THREE.Vector3(0, 1, 0);
  }
  begin() { this.mesh.count = 0; }
  add(x, y, z, rotY, scale = 1, shade = 1) {
    if (this.mesh.count >= this.cap) return;
    const i = this.mesh.count++;
    this._q.setFromAxisAngle(this.up, rotY); this._s.setScalar(scale);
    this.mesh.setMatrixAt(i, this._m.compose(this._p.set(x, y, z), this._q, this._s));
    this._c.setScalar(shade); this.mesh.setColorAt(i, this._c);
  }
  end() { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  dispose() { this.mesh.removeFromParent(); this.mesh.dispose(); }
}
