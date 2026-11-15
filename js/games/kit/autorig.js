// Scheletro automatico per personaggi umani in posa a T senza ossa (es. modelli generati con Meshy, CC BY 4.0).
// 1. trova i punti chiave dalla forma: spalle, gomiti, polsi, inguine, ginocchia, caviglie, punte dei piedi;
// 2. costruisce uno scheletro con gli stessi nomi del ciclista Quaternius (Hips, UpperLegL, LowerArmR, …),
//    così lo usa la stessa classe Cyclist con le sue pose (gambe sui pedali, braccia sul manubrio);
// 3. calcola i pesi della pelle: ogni vertice segue le ossa più vicine della sua zona (gamba sinistra,
//    braccio destro, busto…), con una sfumatura sulle articolazioni per non avere pieghe dure.
// Convenzione dei modelli: avanti = +Z, su = +Y, sinistra del personaggio = +X.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// distanza punto–segmento
function segDist(p, a, b) {
  const ab = _ab.subVectors(b, a); const t = THREE.MathUtils.clamp(_ap.subVectors(p, a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
  return _c.copy(a).addScaledVector(ab, t).distanceTo(p);
}
const _ab = new THREE.Vector3(); const _ap = new THREE.Vector3(); const _c = new THREE.Vector3();

// punti chiave dalla nuvola di vertici (posa a T, gambe leggermente aperte)
export function findLandmarks(pos) {
  const n = pos.count; const P = []; const box = new THREE.Box3();
  for (let i = 0; i < n; i++) { const v = V(pos.getX(i), pos.getY(i), pos.getZ(i)); P.push(v); box.expandByPoint(v); }
  const y0 = box.min.y; const H = box.max.y - y0; const Y = (f) => y0 + f * H;
  const slice = (f0, f1, pred = () => true) => P.filter((p) => p.y >= Y(f0) && p.y < Y(f1) && pred(p));
  const mean = (arr) => arr.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / Math.max(1, arr.length));
  // braccia: tutto ciò che sta oltre la larghezza del busto
  const reach = Math.max(-box.min.x, box.max.x);
  const armPts = P.filter((p) => Math.abs(p.x) > reach * 0.55);
  const armY = mean(armPts).y; const armZ = mean(armPts).z;
  // larghezza del busto poco sotto le ascelle
  const chestSlice = P.filter((p) => p.y > armY - 0.12 * H && p.y < armY - 0.06 * H);
  const half = chestSlice.reduce((m, p) => Math.max(m, Math.abs(p.x)), 0);
  // inguine: il punto più basso con pelle sulla linea centrale
  let crotch = Y(0.45);
  for (let f = 0.2; f < 0.65; f += 0.005) { if (P.some((p) => Math.abs(p.x) < 0.012 * H && p.y >= Y(f) && p.y < Y(f + 0.005))) { crotch = Y(f); break; } }
  const cf = (crotch - y0) / H;
  const side = (s) => (p) => Math.sign(p.x) === s;
  const L = {}; L.H = H; L.y0 = y0; L.crotch = crotch;
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    const thigh = mean(slice(cf - 0.12, cf - 0.04, side(s)));
    const kneeF = 0.045 + (cf - 0.045) * 0.5;
    const knee = mean(slice(kneeF - 0.015, kneeF + 0.015, side(s)));
    const ankle = mean(slice(0.05, 0.075, side(s)));
    const feet = P.filter((p) => p.y < Y(0.035) && Math.sign(p.x) === s);
    const toe = feet.reduce((m, p) => (p.z > m.z ? p : m), feet[0] || ankle).clone();
    L['hip' + k] = V(thigh.x, crotch + 0.035 * H, thigh.z);
    L['knee' + k] = V(knee.x, Y(kneeF), knee.z + 0.006 * H);
    L['ankle' + k] = V(ankle.x, Y(0.06), ankle.z - 0.01 * H);
    L['toe' + k] = V(toe.x * 0.6 + ankle.x * 0.4, Y(0.02), toe.z);
    // braccio: spalla poco dentro il bordo del busto, polso prima della mano, gomito a metà
    const tip = s * Math.max(...armPts.filter(side(s)).map((p) => Math.abs(p.x)));
    // l'articolazione della spalla è al bordo esterno del busto, sotto il deltoide
    const sh = s * half * 1.0; const wr = tip - s * 0.085 * H;
    L['shoulderIn' + k] = V(s * half * 0.3, armY + 0.01 * H, armZ);
    L['shoulder' + k] = V(sh, armY, armZ);
    L['elbow' + k] = V((sh + wr) / 2, armY, armZ - 0.004 * H);
    L['wrist' + k] = V(wr, armY, armZ);
    L['tip' + k] = V(tip, armY, armZ);
  }
  const mid = (a, b, t = 0.5) => a.clone().lerp(b, t);
  L.pelvis = V(0, crotch + 0.06 * H, mean(slice(cf + 0.02, cf + 0.08)).z);
  L.neck = V(0, armY + 0.035 * H, mean(slice((armY - y0) / H + 0.03, (armY - y0) / H + 0.05)).z);
  L.head = V(0, armY + 0.075 * H, L.neck.z);
  L.top = V(0, box.max.y, L.neck.z);
  L.abdomen = mid(L.pelvis, L.neck, 0.25); L.torso = mid(L.pelvis, L.neck, 0.5); L.chest = mid(L.pelvis, L.neck, 0.75);
  return L;
}

// scheletro con nomi "Quaternius"; ogni osso a riposo ha l'asse Y verso il figlio (piedi e mani compresi)
function buildBones(L) {
  const defs = [
    ['Hips', null, L.pelvis, L.abdomen], ['Abdomen', 'Hips', L.abdomen, L.torso], ['Torso', 'Abdomen', L.torso, L.chest],
    ['Chest', 'Torso', L.chest, L.neck], ['Neck', 'Chest', L.neck, L.head], ['Head', 'Neck', L.head, L.top],
  ];
  for (const k of ['L', 'R']) {
    defs.push(
      [`UpperLeg${k}`, 'Hips', L['hip' + k], L['knee' + k]], [`LowerLeg${k}`, `UpperLeg${k}`, L['knee' + k], L['ankle' + k]], [`Foot${k}`, `LowerLeg${k}`, L['ankle' + k], L['toe' + k]],
      [`Shoulder${k}`, 'Chest', L['shoulderIn' + k], L['shoulder' + k]], [`UpperArm${k}`, `Shoulder${k}`, L['shoulder' + k], L['elbow' + k]],
      [`LowerArm${k}`, `UpperArm${k}`, L['elbow' + k], L['wrist' + k]], [`Wrist${k}`, `LowerArm${k}`, L['wrist' + k], L['tip' + k]],
    );
  }
  const bones = {}; const worldQ = {}; const list = [];
  for (const [name, parent, head, tail] of defs) {
    const b = new THREE.Bone(); b.name = name;
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), tail.clone().sub(head).normalize());
    worldQ[name] = q;
    if (parent) {
      const pb = bones[parent]; const pq = worldQ[parent];
      b.position.copy(head.clone().sub(pb.userData.head).applyQuaternion(pq.clone().invert()));
      b.quaternion.copy(pq.clone().invert().multiply(q));
      pb.add(b);
    } else { b.position.copy(head); b.quaternion.copy(q); }
    b.userData.head = head.clone(); b.userData.tail = tail.clone();
    bones[name] = b; list.push(b);
  }
  return { bones, list, defs };
}

// zona di ogni vertice → ossa candidate
function candidates(p, L) {
  const H = L.H; const k = p.x >= 0 ? 'L' : 'R';
  const armEdge = Math.abs(L['shoulder' + k].x);
  if (Math.abs(p.x) > armEdge * 0.9 && p.y > L['shoulder' + k].y - 0.09 * H) return ['Chest', `Shoulder${k}`, `UpperArm${k}`, `LowerArm${k}`, `Wrist${k}`];
  if (p.y < L.crotch + 0.01 * H) return ['Hips', `UpperLeg${k}`, `LowerLeg${k}`, `Foot${k}`];
  return ['Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head', `Shoulder${k}`, `UpperArm${k}`, `UpperLeg${k}`];
}

export function autoRig(geometry) {
  const pos = geometry.attributes.position; const n = pos.count;
  const L = findLandmarks(pos);
  const { bones, list, defs } = buildBones(L);
  const index = Object.fromEntries(list.map((b, i) => [b.name, i]));
  const seg = Object.fromEntries(defs.map(([name, , h, t]) => [name, [h, t]]));
  const si = new Uint16Array(n * 4); const sw = new Float32Array(n * 4); const p = new THREE.Vector3();
  const soft = 0.012 * L.H; // ammorbidisce le articolazioni
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const ws = candidates(p, L).map((name) => { const [a, b] = seg[name]; const d = segDist(p, a, b) + soft; return [index[name], 1 / d ** 6]; });
    ws.sort((a, b) => b[1] - a[1]);
    const top = ws.slice(0, 4); const sum = top.reduce((s, x) => s + x[1], 0);
    top.forEach(([bi, w], j) => { si[i * 4 + j] = bi; sw[i * 4 + j] = w / sum; });
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return { bones, list, landmarks: L, root: bones.Hips };
}
