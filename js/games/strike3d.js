// PEDAL STRIKE 3D — sparatutto a scorrimento laterale in 3D.
// La Resistenza a pedali contro l'Impero dei Motori: le macchine hanno vietato le bici, tre ciclisti ribelli
// attraversano il porto (giorno), il passo di montagna (tramonto) e Motor City (notte al neon).
// Comandi: + / − cambiano corsia (tre corsie in profondità), si spara da soli e i watt decidono la cadenza,
// lo sprint sopra la soglia carica e scatena l'OVERDRIVE. Si libera chi è in gabbia passandoci sopra.
// Grafica: ciclisti Meshy con scheletro automatico (kit/cyclist.js), robot Meshy animati sulle ossa (kit/walkers.js),
// boss con fasi e attacchi telegrafati (la corsia diventa rossa prima del colpo), mondo in strike-world.js.
import { THREE, Stage, Pool, Effects, tracer, fxTexture, Cyclist, makeKit, loadCyclistTemplate, toonMaterial, prepareModel, Quality, Shake, TimeScale, WindLines, Confetti } from './kit3d.js';
import { loadGLTF } from './kit/loader.js';
import { loadMeshyTemplate, MESHY_FAN_URL, BIKE } from './kit/cyclist.js';
import { Walker, makeEnemyKit } from './kit/walkers.js';
import { World, LEVELS, LANES, ROAD } from './strike-world.js';
import { Effort, clamp, lerp } from './engine.js';
import { txt, HUD, hudView, measure, paragraph, wrapLines, MessageQueue } from './kit/hud.js';
import { t, fmtDec } from '../i18n.js';
import { SONGS } from './audio.js';

const M = 'assets/3d/meshy';
const RIDER_S = 1.3;

export const HEROES = [
  { id: 'rocco', jersey: '#ff7a1a', hp: 6, rate: 1, od: 1 },
  { id: 'vale', jersey: '#ff4d9d', hp: 5, rate: 1.25, od: 1 },
  { id: 'gino', jersey: '#22d3b4', hp: 5, rate: 1, od: 1.35 },
];

// armi: si raccolgono dalle casse (munizioni contate), poi si torna al blaster
const WEAPONS = {
  blaster: { name: 'games.shooter.w.blaster', rate: 3.4, dmg: 1, speed: 46, color: '#fff3a0', ammo: Infinity, sfx: 'shot' },
  rapid: { name: 'games.shooter.w.rapid', rate: 8.5, dmg: 0.75, speed: 52, color: '#ffd166', ammo: 170, sfx: 'mg', spread: 0.6 },
  spread: { name: 'games.shooter.w.spread', rate: 2.6, dmg: 1.1, speed: 44, color: '#7dff6a', ammo: 55, sfx: 'shot', lanes: true },
  rocket: { name: 'games.shooter.w.rocket', rate: 1.5, dmg: 5, speed: 26, color: '#ff6b35', ammo: 24, sfx: 'rocket', splash: 3.4 },
  laser: { name: 'games.shooter.w.laser', rate: 5.5, dmg: 1.7, speed: 95, color: '#4de3ff', ammo: 110, sfx: 'laser', pierce: true },
};
const CRATE_WEAPONS = ['rapid', 'spread', 'rocket', 'laser'];

// nemici
const FOES = {
  trooper: { kit: 'robot_trooper', h: 2.3, hp: 3, speed: 1.6, style: 'walk', score: 100, rad: 0.8, shoots: true },
  brute: { kit: 'robot_brute', h: 3.2, hp: 11, speed: 2.6, style: 'brute', score: 300, rad: 1.1, charges: true },
  drone: { model: 'drone', h: 1.2, hp: 2, score: 150, rad: 0.9, fly: 3.4, bombs: true },
  barrier: { hp: 4, score: 50, rad: 1.2, obstacle: true },
};
const BOSSES = {
  tank: { model: 'boss_tank', h: 5.2, hp: 210, name: 'games.shooter.boss.tank', attacks: ['shells', 'mortar', 'shells', 'summon'] },
  airship: { model: 'boss_airship', h: 5, hp: 185, fly: 3.6, name: 'games.shooter.boss.airship', attacks: ['bombs', 'mortar', 'drones', 'bombs'] },
  mech: { kit: 'boss_mech', h: 8.5, hp: 300, name: 'games.shooter.boss.mech', attacks: ['laser', 'missiles', 'laser', 'summon', 'stomp'] },
};

const OD_TIME = 8;
const v3 = new THREE.Vector3();

// materiale dei robot: le parti verdi del modello prendono il colore della fazione; lampo bianco quando vengono colpiti
function foeMaterial(tpl, color) {
  const m = toonMaterial({ map: tpl.map });
  const u = { foe: { value: new THREE.Color(color) }, refLum: { value: tpl.refLum || 0.3 }, flash: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform vec3 foe; uniform float refLum; uniform float flash;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec3 t = sampledDiffuseColor.rgb; float k = smoothstep(0.05, 0.16, t.g - max(t.r, t.b));
          float lum = dot(t, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(diffuseColor.rgb, foe * clamp(lum / refLum, 0.35, 1.6), k); }`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), flash);');
  };
  m.customProgramCacheKey = () => 'strike-foe-v1';
  return m;
}
// stesso lampo per i modelli rigidi (drone, boss, gabbie)
function flashMaterial(params) {
  const m = toonMaterial(params);
  const u = { flash: { value: 0 }, tint: { value: new THREE.Color('#ffffff') } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform float flash; uniform vec3 tint;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb * tint, vec3(1.0), flash);');
  };
  m.customProgramCacheKey = () => 'strike-flash-v1';
  return m;
}

// un modello rigido centrato, appoggiato a terra, alto h metri, con materiali propri (lampo)
function rigidModel(gltf, h, { face = 0 } = {}) {
  const info = prepareModel(gltf); const b = info.box;
  const inner = new THREE.Group(); const mats = [];
  for (const pt of info.parts) { const mat = flashMaterial(pt.mat === 'vc' ? { vertexColors: true } : { map: pt.mat }); mats.push(mat); const m = new THREE.Mesh(pt.geo, mat); m.castShadow = true; inner.add(m); }
  inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  const s = h / info.height; const wrap = new THREE.Group(); wrap.add(inner); wrap.scale.setScalar(s); wrap.rotation.y = face;
  const root = new THREE.Group(); root.add(wrap);
  root.userData.mats = mats; root.userData.size = new THREE.Vector3((b.max.x - b.min.x) * s, h, (b.max.z - b.min.z) * s);
  return root;
}
const setFlash = (mats, f) => { for (const m of mats) if (m.userData.u) m.userData.u.flash.value = f; };

// texture: corsia telegrafata (frecce rosse che scorrono), anello d'allarme a terra
function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,40,60,.35)'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = 'rgba(255,90,90,.95)';
  for (let x = -40; x < 168; x += 44) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 20, 6); g.lineTo(x + 2, 32); g.lineTo(x + 20, 58); g.lineTo(x, 58); g.lineTo(x - 18, 32); g.closePath(); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(0, 0, 128, 4); g.fillRect(0, 60, 128, 4);
  const tx = new THREE.CanvasTexture(c); tx.wrapS = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.strokeStyle = '#ff3b4d'; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,40,60,.35)'; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.moveTo(64, 30); g.lineTo(64, 98); g.moveTo(30, 64); g.lineTo(98, 64); g.stroke();
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}

// ---------- effetti: onde d'urto, detriti, lampi di luce ----------
class Blast {
  constructor(scene) {
    this.fx = new Effects(scene, 260);
    const ringMat = () => new THREE.MeshBasicMaterial({ map: fxTexture('circle_05'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const flat = new THREE.PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
    this.rings = new Pool(scene, () => new THREE.Mesh(flat, ringMat()), 14);
    this.air = new Pool(scene, () => new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('circle_05'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), 10);
    this.list = [];
    // detriti: cubetti colorati che rimbalzano (un draw call)
    const N = 180; this.N = N;
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toonMaterial({ color: '#ffffff' }), N);
    this.debris.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3).fill(1), 3);
    this.debris.count = 0; this.debris.frustumCulled = false; this.debris.castShadow = false; scene.add(this.debris);
    this.bits = [];
    this.light = new THREE.PointLight('#ffb060', 0, 26, 1.6); scene.add(this.light); this.lightT = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }
  ring(x, z, size, color = '#ffd9a0', life = 0.5) { const m = this.rings.get(); m.position.set(x, 0.08, z); m.material.color.set(color); m.material.opacity = 1; m.scale.setScalar(0.1); this.list.push({ o: m, t: 0, life, size, kind: 'ring' }); }
  airRing(x, y, z, size, color = '#ffffff', life = 0.35) { const s = this.air.get(); s.position.set(x, y, z); s.material.color.set(color); s.material.opacity = 1; s.scale.setScalar(0.1); this.list.push({ o: s, t: 0, life, size, kind: 'ring' }); }
  chunks(x, y, z, n, colors, power = 1) {
    for (let i = 0; i < n; i++) {
      if (this.bits.length >= this.N) this.bits.shift();
      this.bits.push({ x, y, z, vx: (Math.random() - 0.3) * 9 * power, vy: 3 + Math.random() * 7 * power, vz: (Math.random() - 0.5) * 7 * power, r: Math.random() * 6, vr: (Math.random() - 0.5) * 16, s: 0.12 + Math.random() * 0.22 * power, t: 0, life: 1.2 + Math.random() * 0.8, c: colors[i % colors.length] });
    }
  }
  flashLight(x, y, z, color = '#ffb060', power = 1) { this.light.position.set(x, y, z); this.light.color.set(color); this.light.intensity = 140 * power; this.lightT = 0.25; }
  // esplosione completa: lampo, fuoco, scintille, fumo, onda d'urto a terra e in aria, detriti, luce
  boom(x, y, z, size = 1, { colors = ['#3a3f4a', '#ff8a1f', '#c9ced6'], ring = true } = {}) {
    this.fx.explode(x, y, z, size);
    if (ring) { this.ring(x, z, 7 * size, '#ffd9a0', 0.55); this.airRing(x, y, z, 5 * size, '#fff2d0', 0.3); }
    this.chunks(x, y, z, Math.round(6 + 8 * size), colors, Math.min(1.6, 0.7 + size * 0.4));
    this.flashLight(x, y + 1, z + 1.5, '#ffb060', Math.min(2, size));
  }
  update(dt) {
    this.fx.update(dt);
    for (const p of this.list) {
      p.t += dt; const k = p.t / p.life;
      p.o.scale.setScalar(p.size * (1 - (1 - k) ** 3));
      p.o.material.opacity = (1 - k) ** 1.5;
      if (k >= 1) p.o.visible = false;
    }
    this.list = this.list.filter((p) => p.t < p.life);
    let n = 0;
    for (const b of this.bits) {
      b.t += dt; b.vy -= 22 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.r += b.vr * dt;
      if (b.y < b.s / 2) { b.y = b.s / 2; b.vy *= -0.35; b.vx *= 0.6; b.vz *= 0.6; b.vr *= 0.5; }
      const sc = b.s * Math.min(1, (b.life - b.t) * 3);
      this._e.set(b.r, b.r * 0.7, 0); this._q.setFromEuler(this._e);
      this.debris.setMatrixAt(n, this._m.compose(this._p.set(b.x, b.y, b.z), this._q, this._s.setScalar(Math.max(0.001, sc))));
      this.debris.setColorAt(n, this._c.set(b.c)); n++;
    }
    this.bits = this.bits.filter((b) => b.t < b.life);
    this.debris.count = n; this.debris.instanceMatrix.needsUpdate = true; if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity *= Math.max(0, 1 - dt * 9); if (this.lightT <= 0) this.light.intensity = 0; }
  }
}

export class Strike3D {
  constructor(hudCanvas, hooks, audio) {
    this.hudCanvas = hudCanvas; this.hooks = hooks; this.audio = audio;
    this.active = false;
    this.best = Number(localStorage.getItem('strikeBest3')) || 0;
    this.heroIndex = clamp(Number(localStorage.getItem('strikeHero')) || 0, 0, HEROES.length - 1);
    this.loop = this.loop.bind(this);
  }

  // ---------- caricamento ----------
  async start() {
    this.active = true;
    this.quality = new Quality();
    this.stage = new Stage(this.hudCanvas, { quality: this.quality });
    this.stage.onQuality = (cfg) => this.applyQuality(cfg);
    this.effort = new Effort(); this.ts = new TimeScale(); this.shakeK = new Shake();
    this.state = 'loading'; this.t = 0; this.stateT = 0; this.msgs = new MessageQueue(); this.pops = []; this.power = 0; this.cadence = 0; this.loadPct = 0;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
    this.audio.playSong(SONGS.menu);
    try {
      const files = { crate: 'assets/3d/blasters/crate-medium.glb', heart: 'assets/3d/pickups/heart.glb', tree_pineTallA: 'assets/3d/nature/tree_pineTallA.glb', tree_pineDefaultA: 'assets/3d/nature/tree_pineDefaultA.glb', rock_largeA: 'assets/3d/nature/rock_largeA.glb' };
      for (const n of ['blaster', 'street_lamp', 'alpine_hut', 'drone', 'boss_tank', 'boss_airship', 'cage', 'harbor_crane', 'neon_tower']) files[n] = `${M}/${n}.glb`;
      // la scenografia è facoltativa: se un modello manca, il livello si disegna senza
      const optional = new Set(['street_lamp', 'alpine_hut', 'harbor_crane', 'neon_tower', 'tree_pineTallA', 'tree_pineDefaultA', 'rock_largeA']);
      let done = 0; const entries = Object.entries(files); this.m = {};
      await Promise.all(entries.map(async ([k, url]) => {
        try { this.m[k] = await loadGLTF(url); } catch (err) { if (!optional.has(k)) throw err; console.warn('Pedal Strike: modello mancante', k); }
        this.loadPct = (++done / entries.length) * 0.55;
      }));
      this.tpl = await loadMeshyTemplate().catch(() => loadCyclistTemplate());
      this.allyTpl = await loadMeshyTemplate(MESHY_FAN_URL).catch(() => this.tpl);
      this.loadPct = 0.7;
      this.kits = {};
      for (const [k, h] of [['robot_trooper', FOES.trooper.h], ['robot_brute', FOES.brute.h], ['boss_mech', BOSSES.mech.h]]) {
        this.kits[k] = await makeEnemyKit(`${M}/${k}.glb`, h); this.loadPct += 0.09;
      }
      if (!this.active) return;
      this.build();
      this.state = 'menu'; this.stateT = 0;
    } catch (err) { console.error(err); this.state = 'error'; this.error = err.message; }
  }

  stop() {
    this.active = false; this.audio.stopSong(); this.audio.transpose = 0; this.hooks.setGrade(null);
    this.stage?.dispose(); this.stage = null;
  }

  build() {
    const { scene } = this.stage;
    this.world = new World(scene, this.m, this.quality);
    this.blast = new Blast(scene);
    this.bulletPool = new Pool(scene, () => tracer(), 120);
    this.boltPool = new Pool(scene, () => { const tr = tracer('#ff3b4d'); tr.shape(1.6, 0.5); return tr; }, 40);
    this.wind = new WindLines(scene, 36);
    this.confetti = new Confetti(scene, 260);
    this.stripeTex = stripeTexture(); this.ringTex = ringTexture();
    this.teleGeo = new THREE.PlaneGeometry(1, 1); this.teleGeo.rotateX(-Math.PI / 2);
    this.telePool = new Pool(scene, () => new THREE.Mesh(this.teleGeo, new THREE.MeshBasicMaterial({ map: this.stripeTex.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), 8);
    for (const m of this.telePool.items) { m.material.map.wrapS = THREE.RepeatWrapping; m.material.map.needsUpdate = true; m.renderOrder = 3; }
    this.markPool = new Pool(scene, () => { const m = new THREE.Mesh(this.teleGeo, new THREE.MeshBasicMaterial({ map: this.ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); m.renderOrder = 3; return m; }, 16);
    // aura dell'overdrive attorno all'eroe
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('light_01'), color: '#4de3ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.aura.scale.setScalar(4.5); scene.add(this.aura);
    // raggio laser del boss
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 10, 1, true).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3b6b', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 8, 1, true).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }));
    this.beam.add(this.beamCore); this.beam.visible = false; scene.add(this.beam);
    this.initGun();
    this.applyQuality(this.quality.cfg);
    this.newRun();
    this.showcase();
  }

  applyQuality(cfg) {
    if (!this.world) return;
    this.world.applyQuality(cfg);
    this.player?.setShadows(cfg.shadows);
    for (const p of this.props || []) p.setShadows?.(cfg.shadows);
  }

  // ---------- blaster Meshy sul manubrio (colore dell'arma) ----------
  initGun() {
    const info = prepareModel(this.m.blaster); const b = info.box; const size = new THREE.Vector3(); b.getSize(size);
    this.gunYaw = size.x > size.z ? Math.PI / 2 : 0; this.gunLen = Math.max(size.x, size.z); this.gunInfo = info;
    this.gunCenter = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
    this.gunMats = {};
    for (const [k, w] of Object.entries(WEAPONS)) this.gunMats[k] = info.parts.map((pt) => toonMaterial({ map: pt.mat === 'vc' ? null : pt.mat, vertexColors: pt.mat === 'vc', color: new THREE.Color(w.color).lerp(new THREE.Color('#ffffff'), 0.6) }));
  }
  mountGun(cy, wk) {
    if (cy.gun) cy.lean.remove(cy.gun);
    const g = new THREE.Group(); const inner = new THREE.Group();
    this.gunInfo.parts.forEach((pt, i) => inner.add(new THREE.Mesh(pt.geo, this.gunMats[wk][i])));
    inner.position.set(-this.gunCenter.x, -this.gunCenter.y, -this.gunCenter.z);
    const wrap = new THREE.Group(); wrap.add(inner); wrap.rotation.y = this.gunYaw; g.add(wrap);
    g.scale.setScalar((wk === 'blaster' ? 0.55 : 0.72) / this.gunLen);
    g.position.set(0, BIKE.hood.y - 0.08, BIKE.hood.z + 0.1);
    cy.lean.add(g); cy.gun = g;
  }

  // ---------- partita ----------
  newRun() {
    this.score = 0; this.level = 0; this.kills = 0; this.rescued = 0; this.combo = 0; this.comboT = 0; this.maxCombo = 0;
    this.hero = HEROES[this.heroIndex];
    this.hp = this.hero.hp; this.maxHp = this.hero.hp;
  }

  showcase() {
    this.setupLevel(0, true);
  }

  clearActors() {
    const scene = this.stage.scene;
    for (const e of this.foes || []) this.removeFoe(e, true);
    for (const c of this.cages || []) scene.remove(c.root);
    for (const p of this.pickups || []) scene.remove(p.root);
    for (const w of this.wingmen || []) scene.remove(w.r.root);
    for (const b of this.bullets || []) b.mesh.visible = false;
    for (const b of this.bolts || []) b.mesh.visible = false;
    for (const s of this.strikes || []) for (const m of s.meshes) m.visible = false;
    if (this.boss) { scene.remove(this.boss.root); this.boss = null; }
    if (this.player) scene.remove(this.player.root);
    this.beam.visible = false;
  }

  // prepara un livello: mondo, eroe, piano dei nemici
  setupLevel(i, menu = false) {
    this.clearActors();
    this.level = i; this.L = LEVELS[i];
    this.world.setLevel(i);
    this.foes = []; this.cages = []; this.pickups = []; this.wingmen = []; this.bullets = []; this.bolts = []; this.strikes = [];
    this.walkerPool = this.walkerPool || {};
    this.px = 0; this.lane = 1; this.laneZ = LANES[1]; this.tilt = 0;
    this.weapon = 'blaster'; this.ammo = Infinity; this.fireT = 0; this.overdrive = 0; this.odMeter = this.odMeter || 0; this.invuln = 0;
    this.levelStats = { kills: 0, rescued: 0, start: this.score, hits: 0 };
    this.player = new Cyclist(this.tpl, makeKit(this.hero.jersey, this.heroIndex), { shadows: this.quality.cfg.shadows });
    this.player.root.scale.setScalar(RIDER_S);
    this.mountGun(this.player, 'blaster');
    this.stage.scene.add(this.player.root);
    this.plan = this.makePlan(i);
    this.camInit = false; this.bossDone = false; this.idle = 0;
    if (menu) { this.state = 'menu'; this.stateT = 0; }
  }

  // piano del livello: a ogni tratto di strada un gruppo di nemici, gabbie e casse (deterministico, cresce di intensità)
  makePlan(i) {
    const L = LEVELS[i]; const plan = []; let s = 1234 + i * 777;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const lane = () => Math.floor(r() * 3);
    let x = 34;
    let cageAt = 110; let crateAt = 70; let heartAt = L.len * 0.55;
    while (x < L.len - 20) {
      const p = x / L.len; const roll = r();
      const pool = i === 0 ? ['trio', 'pair', 'line', 'brute', 'drones', 'wall', 'pair'] : i === 1 ? ['trio', 'drones', 'brute', 'wall', 'mix', 'drones', 'line'] : ['mix', 'brute', 'drones', 'trio', 'wall', 'squad', 'line'];
      const kind = p < 0.12 ? 'pair' : pool[Math.floor(roll * pool.length)];
      plan.push({ x, kind, lane: lane(), hard: p });
      if (x > cageAt) { plan.push({ x: x + 12, kind: 'cage', lane: lane() }); cageAt += 125 + r() * 40; }
      if (x > crateAt) { plan.push({ x: x + 6, kind: 'crate', lane: lane(), weapon: CRATE_WEAPONS[Math.floor(r() * CRATE_WEAPONS.length)] }); crateAt += 95 + r() * 40; }
      if (x > heartAt) { plan.push({ x: x + 18, kind: 'heart', lane: lane() }); heartAt = Infinity; }
      x += lerp(36, 24, p) + r() * 10 - i * 2;
    }
    plan.sort((a, b) => a.x - b.x);
    return plan;
  }

  // ---------- comandi ----------
  input(dir) {
    this.audio.ensure();
    this.idle = 0; this.manual = true;
    if (this.state === 'menu') {
      if (this.stateT < 0.35) return;
      if (dir < 0) { this.heroIndex = (this.heroIndex + 1) % HEROES.length; this.newRun(); this.audio.sfx('select'); this.swapHero(); }
      else { localStorage.setItem('strikeHero', this.heroIndex); this.audio.sfx('pickup'); this.newRun(); this.startLevel(0); }
      return;
    }
    if (this.state === 'intro') { if (dir > 0 && this.stateT > 0.6) this.stateT = 99; return; }
    if (this.state === 'clear') { if (dir > 0 && this.stateT > 2.5) this.nextLevel(); return; }
    if (this.state === 'over') { if (this.stateT > 1.6) { if (dir > 0) this.retryLevel(); else { this.newRun(); this.setupLevel(0, true); this.audio.playSong(SONGS.menu); } } return; }
    if (this.state === 'victory') { if (this.stateT > 3) { this.newRun(); this.setupLevel(0, true); } return; }
    if (this.state !== 'play' && this.state !== 'boss' && this.state !== 'bossIntro') return;
    this.changeLane(dir > 0 ? 1 : -1);
  }
  hold() { /* le corsie sono a scatti: niente pressione continua */ }

  // nuovo eroe nel menu: si cambia solo il ciclista, il mondo resta
  swapHero() {
    this.stage.scene.remove(this.player.root);
    this.player = new Cyclist(this.tpl, makeKit(this.hero.jersey, this.heroIndex), { shadows: this.quality.cfg.shadows });
    this.player.root.scale.setScalar(RIDER_S);
    this.mountGun(this.player, 'blaster');
    this.stage.scene.add(this.player.root);
    this.blast.fx.spawn(this.px, 1.2, this.laneZ, { tex: 'spark', size: 3, life: 0.4, color: this.hero.jersey });
  }

  changeLane(d) {
    const nl = clamp(this.lane + d, 0, 2);
    if (nl === this.lane) { this.tilt = d * 0.6; return; }
    this.lane = nl; this.audio.sfx('whoosh'); this.tilt = d;
  }

  startLevel(i) {
    this.setupLevel(i);
    this.state = 'intro'; this.stateT = 0;
    this.hooks.runStart?.();
    this.audio.playSong(SONGS[LEVELS[i].song] || SONGS.city); this.audio.sfx('go');
  }
  nextLevel() {
    if (this.level >= LEVELS.length - 1) return;
    this.hp = Math.min(this.maxHp, this.hp + 2);
    this.startLevel(this.level + 1);
  }
  retryLevel() {
    this.score = this.levelStats.start; this.hp = this.maxHp; this.odMeter = 0;
    this.startLevel(this.level);
  }

  // messaggi a centro schermo: uno alla volta, con priorità (kit/hud.js MessageQueue)
  say(text, color = HUD.gold, life = 1.8, big = false, prio = big ? 2 : 1) { this.msgs.say(text, { color, dur: life, big, prio }); }
  pop(text, color, x, y, z, life = 1) { this.pops.push({ text, color, x, y, z, t: life, life }); }
  prog(stat, n = 1, xp = 0) { this.hooks.progress?.event(stat, n, xp); }

  // ---------- nemici ----------
  spawnFoe(type, x, lane, extra = {}) {
    const def = FOES[type]; const z = LANES[lane];
    const e = { type, def, x, lane, z, hp: def.hp * (1 + this.level * 0.35), maxHp: 0, dead: false, deadT: 0, flash: 0, t: Math.random() * 3, fireT: 1.2 + Math.random() * 1.5, tele: 0, ...extra };
    e.maxHp = e.hp;
    if (def.kit) {
      const kit = this.kits[def.kit];
      const list = (this.walkerPool[def.kit] = this.walkerPool[def.kit] || []);
      let w = list.pop();
      if (!w) { w = new Walker(kit); w.body.material = foeMaterial(kit.tpl, this.L.foe); w.body.castShadow = true; }
      w.body.material.userData.u.foe.value.set(this.L.foe);
      w.root.visible = true; w.fall = 0; w.lunge = 0; w.hit = 0; w.pivot.rotation.x = 0; w.pivot.position.y = 0; w.inner.scale.setScalar(kit.scale); w.root.position.set(x, 0, z);
      w.body.castShadow = this.quality.cfg.shadows;
      this.stage.scene.add(w.root); e.w = w; e.root = w.root; e.mats = [w.body.material];
    } else if (type === 'drone') {
      e.root = rigidModel(this.m.drone, def.h, { face: -Math.PI / 2 + 0.55 }); e.mats = e.root.userData.mats;
      e.y = def.fly; e.root.position.set(x, e.y, z); this.stage.scene.add(e.root);
    } else if (type === 'barrier') {
      e.root = this.makeBarrier(); e.mats = e.root.userData.mats; e.root.position.set(x, 0, z); this.stage.scene.add(e.root);
    }
    this.foes.push(e);
    return e;
  }

  // transenna dei robot: blocco di cemento a strisce, con luce rossa lampeggiante
  makeBarrier() {
    if (!this.barrierGeo) {
      const parts = [];
      const add = (g, col) => { g = g.toNonIndexed(); const n = g.attributes.position.count; const c = new THREE.Color(col); const a = new Float32Array(n * 3); for (let k = 0; k < n; k++) c.toArray(a, k * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); parts.push(g); };
      add(new THREE.BoxGeometry(1.0, 1.0, 1.9).translate(0, 0.5, 0), '#d9d6cf');
      for (let k = -2; k <= 2; k++) add(new THREE.BoxGeometry(1.04, 0.34, 0.28).translate(0, 0.62, k * 0.38), k % 2 ? '#ffffff' : '#e8323c');
      add(new THREE.BoxGeometry(1.2, 0.18, 2.1).translate(0, 0.09, 0), '#7c7a75');
      add(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 8).translate(0, 1.1, 0.7), '#ff2030');
      this.barrierGeo = (function merge(list) { let n = 0; for (const g of list) n += g.attributes.position.count; const pos = new Float32Array(n * 3); const nor = new Float32Array(n * 3); const col = new Float32Array(n * 3); let o = 0; for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; } const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); return out; })(parts);
    }
    const mat = flashMaterial({ vertexColors: true });
    const m = new THREE.Mesh(this.barrierGeo, mat); m.castShadow = true;
    const root = new THREE.Group(); root.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('light_01'), color: '#ff3040', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.4); glow.position.set(0, 1.15, 0.7); root.add(glow); root.userData.glow = glow;
    root.userData.mats = [mat];
    return root;
  }

  removeFoe(e, instant = false) {
    if (e.w) { e.w.root.visible = false; this.stage.scene.remove(e.w.root); this.walkerPool[e.def.kit].push(e.w); e.w = null; }
    else if (e.root) this.stage.scene.remove(e.root);
    if (e.teleMesh) { e.teleMesh.visible = false; e.teleMesh = null; }
    void instant;
  }

  spawnPattern(p) {
    const x = this.px + this.visRight + 4; const L = p.lane;
    const other = (k) => (L + k) % 3;
    switch (p.kind) {
      case 'pair': this.spawnFoe('trooper', x, L); this.spawnFoe('trooper', x + 3, other(1)); break;
      case 'trio': for (let k = 0; k < 3; k++) this.spawnFoe('trooper', x + k * 2.2, k); break;
      case 'line': for (let k = 0; k < 3; k++) this.spawnFoe('trooper', x + k * 2.6, L); break;
      case 'brute': this.spawnFoe('brute', x + 2, L); if (p.hard > 0.4) this.spawnFoe('trooper', x, other(1)); break;
      case 'drones': this.spawnFoe('drone', x, L); this.spawnFoe('drone', x + 4, other(2)); break;
      case 'wall': this.spawnFoe('barrier', x, L); this.spawnFoe('barrier', x + 0.2, other(1)); this.spawnFoe('trooper', x + 4, other(2)); break;
      case 'mix': this.spawnFoe('trooper', x, L); this.spawnFoe('drone', x + 3, other(1)); this.spawnFoe('trooper', x + 5, other(2)); break;
      case 'squad': this.spawnFoe('brute', x + 3, L); this.spawnFoe('trooper', x, other(1)); this.spawnFoe('trooper', x + 1, other(2)); this.spawnFoe('drone', x + 6, L); break;
      case 'cage': this.spawnCage(x, L); break;
      case 'crate': this.spawnPickup('crate', x, L, p.weapon); break;
      case 'heart': this.spawnPickup('heart', x, L); break;
      default: break;
    }
  }

  // ---------- prigionieri e oggetti ----------
  spawnCage(x, lane) {
    const root = new THREE.Group(); const z = LANES[lane];
    const cage = rigidModel(this.m.cage, 2.6, { face: 0.3 }); root.add(cage);
    const pr = new Cyclist(this.allyTpl, makeKit(['#4de3ff', '#ffd166', '#7dff6a', '#c77dff', '#ff922b'][this.cages.length % 5], this.cages.length + 3), { shadows: false });
    pr.standUp(false); pr.root.scale.setScalar(0.95); pr.root.rotation.y = 0.5; pr.pose(0.01, 0, 0, { wave: true });
    root.add(pr.root);
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('light_01'), color: '#7dff6a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    beacon.scale.setScalar(3.4); beacon.position.y = 1.4; root.add(beacon);
    root.position.set(x, 0, z); this.stage.scene.add(root);
    this.cages.push({ root, cage, pr, beacon, x, lane, z, open: false, t: 0 });
  }

  spawnPickup(kind, x, lane, weapon = null) {
    const root = new THREE.Group(); const z = LANES[lane];
    const col = kind === 'heart' ? '#ff4d6d' : WEAPONS[weapon].color;
    const model = kind === 'heart' ? rigidModel(this.m.heart, 1.0) : rigidModel(this.m.crate, 1.0);
    model.position.y = 0.6; root.add(model);
    if (kind === 'crate') setFlash(model.userData.mats, 0), model.userData.mats.forEach((m) => m.userData.u.tint.value.set(col).lerp(new THREE.Color('#ffffff'), 0.45));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('light_01'), color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
    glow.scale.setScalar(3); glow.position.y = 1.1; root.add(glow);
    const ring = new THREE.Mesh(this.teleGeo, new THREE.MeshBasicMaterial({ map: fxTexture('circle_05'), color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.scale.setScalar(2.2); ring.position.y = 0.05; root.add(ring);
    root.position.set(x, 0, z); this.stage.scene.add(root);
    this.pickups.push({ root, model, kind, weapon, x, lane, z, t: Math.random() * 3, col });
  }

  freeCage(c) {
    c.open = true; c.t = 0;
    this.rescued++; this.levelStats.rescued++; this.score += 500 * (this.level + 1);
    this.prog('rescued', 1, 20);
    this.blast.chunks(c.x, 1.3, c.z, 18, ['#5b5f66', '#8a8f99', '#3a3d44'], 1.1);
    this.blast.fx.spawn(c.x, 1.2, c.z, { tex: 'green', size: 5, life: 0.6, grow: 1 });
    this.blast.ring(c.x, c.z, 6, '#7dff6a', 0.6);
    c.cage.visible = false; c.beacon.visible = false;
    c.pr.standUp(true);
    this.audio.sfx('rescue'); this.shakeK.add(0.15);
    this.say(t('games.shooter.freed'), '#7dff6a', 1.8, true);
    this.pop(`+${500 * (this.level + 1)}`, '#7dff6a', c.x, 2.8, c.z, 1.2);
    // si unisce come compagno per un tratto (al massimo 2)
    if (this.wingmen.length < 2) setTimeout(() => this.active && this.addWingman(c), 700);
  }

  addWingman(c) {
    if (!this.player || this.wingmen.length >= 2) return;
    const r = new Cyclist(this.allyTpl, c.pr.kit, { shadows: false });
    r.root.scale.setScalar(RIDER_S * 0.95);
    this.mountGun(r, 'blaster');
    this.stage.scene.add(r.root);
    const slot = this.wingmen.length ? -3.6 : -2.2;
    const w = { r, slot, x: c.x, z: c.z, laneOff: this.wingmen.length ? 1 : -1, t: 0, life: 32, fireT: 0.5 };
    this.wingmen.push(w);
    this.say(t('games.shooter.wingman'), '#4de3ff', 1.6);
    if (c.root.parent) this.stage.scene.remove(c.root);
    c.gone = true;
  }

  // ---------- aggiornamento ----------
  update(realDt) {
    const dt = this.ts.step(realDt);
    this.t += realDt;
    const connected = this.hooks.connected(); const st = this.hooks.stats();
    const demoSprint = !connected && (this.t % 24) > 18.5;
    this.power = connected ? st.power || 0 : demoSprint ? 380 : 195 + Math.sin(this.t * 0.7) * 15;
    this.cadence = connected ? st.cadence || 0 : demoSprint ? 105 : 88;
    const kmh = connected ? this.hooks.speedKmh() : demoSprint ? 38 : 29;
    this.sprinting = this.effort.update(this.power, realDt, connected ? 50 : 0);
    if (this.audio.song) this.audio.setTempo(this.audio.song.bpm * clamp((this.cadence || 85) / 88, 0.85, 1.25));
    this.msgs.update(realDt);
    for (const p of this.pops) p.t -= realDt; this.pops = this.pops.filter((p) => p.t > 0);
    this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - realDt); this.whiteFlash = Math.max(0, (this.whiteFlash || 0) - realDt);
    if (this.state === 'loading' || this.state === 'error') return;
    this.stateT += realDt;
    this.shakeK.update(realDt);
    this.blast.update(dt);
    this.confetti.update(dt);
    this.speed = clamp(2.2 + (kmh / 3.6) * 0.48, 3.2, 10.5);
    const playing = this.state === 'play' || this.state === 'boss' || this.state === 'bossIntro';
    if (this.state === 'menu') { this.px += dt * 4; this.animate(dt); return; }
    if (this.state === 'intro') {
      this.px += this.speed * dt; this.animate(dt);
      if (this.stateT > 3.4) { this.state = 'play'; this.stateT = 0; this.nextPlan = 0; this.say(t('games.shooter.missionHint'), HUD.white, 2.4); }
      return;
    }
    if (this.state === 'clear' || this.state === 'victory' || this.state === 'over') {
      if (this.state !== 'over') this.px += this.speed * dt * (this.state === 'victory' ? 0.25 : 0.7);
      this.updateFoes(dt); this.updateBullets(dt); this.animate(dt);
      if (this.state === 'victory' && Math.random() < dt * 2.5) this.firework();
      if (this.state === 'clear' && this.stateT > 7 && !this.manual) this.nextLevel();
      if (this.state === 'over' && this.stateT > 12 && this.idle > 12) this.retryLevel(); // senza toccare niente si riparte da soli
      this.idle += realDt;
      return;
    }
    if (!playing) return;
    // avanzamento: in combattimento col boss si rallenta un po'
    const v = this.speed * (this.state === 'play' ? 1 : 0.8);
    this.px += v * dt;
    this.idle += realDt;
    if (!connected && this.idle > 5) this.autopilot(dt);
    else if (this.auto) this.autopilot(dt);
    // corsia: scivola morbida verso quella scelta
    const zT = LANES[this.lane];
    this.laneZ += (zT - this.laneZ) * Math.min(1, dt * 9);
    this.tilt *= Math.max(0, 1 - dt * 5);
    this.invuln = Math.max(0, this.invuln - dt);
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    // pendenza mandata al rullo: piatto al porto, salita al passo, ondulata in città, dura col boss
    const g = this.state !== 'play' ? 4 : this.L.id === 'pass' ? 3 + 2 * Math.sin(this.px / 90) : this.L.id === 'neon' ? 2 + 1.5 * Math.sin(this.px / 60) : 1 + Math.sin(this.px / 120);
    const gr = Math.round(g * 2) / 2;
    if (gr !== this.sentGrade) { this.sentGrade = gr; this.hooks.setGrade(gr); }
    // overdrive: lo sprint lo carica, quando è pieno parte da solo
    if (this.overdrive > 0) {
      this.overdrive -= dt;
      if (this.overdrive <= 0) { this.audio.transpose = 0; this.say(t('games.shooter.odOver'), HUD.white, 1.2); }
    } else {
      this.odMeter = clamp(this.odMeter + (this.sprinting ? dt / 3.2 * this.hero.od : 0) - dt / 60, 0, 1);
      if (this.odMeter >= 1) this.startOverdrive();
    }
    // piano del livello
    if (this.state === 'play') {
      while (this.nextPlan < this.plan.length && this.plan[this.nextPlan].x <= this.px) this.spawnPattern(this.plan[this.nextPlan++]);
      if (this.px >= this.L.len) this.startBoss();
    }
    if (this.state === 'bossIntro') { if (this.stateT > 3.2) { this.state = 'boss'; this.stateT = 0; } }
    this.updateShooting(dt);
    this.updateBullets(dt);
    this.updateFoes(dt);
    this.updateBolts(dt);
    this.updateStrikes(dt);
    if (this.boss) this.updateBoss(dt);
    this.updateCages(dt);
    this.updatePickups(dt);
    this.updateWingmen(dt);
    this.animate(dt);
  }

  startOverdrive() {
    this.overdrive = OD_TIME; this.odMeter = 0;
    this.audio.transpose = 2; this.audio.sfx('overdrive');
    this.say(t('games.shooter.overdrive'), HUD.cyan, 2.2, true);
    this.ts.slowmo(0.35, 0.55); this.shakeK.add(0.35);
    this.blast.ring(this.px, this.laneZ, 12, '#4de3ff', 0.7); this.blast.airRing(this.px, 1.4, this.laneZ, 8, '#9eeeff', 0.5);
    this.prog('overdrives', 1, 15);
  }

  // pilota automatico (demo senza rullo, o se non tocchi niente): evita i colpi telegrafati, va verso gabbie e casse
  autopilot() {
    if (this.autoT > this.t) return;
    const score = [0, 0, 0];
    for (const s of this.strikes) for (const ln of s.lanes) score[ln] -= 12;
    for (const b of this.bolts) if (b.x > this.px && b.x < this.px + 14) score[b.lane] -= 6;
    for (const e of this.foes) {
      if (e.dead || e.x < this.px) continue;
      if (e.def.obstacle && e.x - this.px < 12) score[e.lane] -= 8;
      if (e.def.charges && e.x - this.px < 14) score[e.lane] -= 6;
      if (e.bombLane !== undefined && e.tele > 0) score[e.bombLane] -= 9;
    }
    for (const c of this.cages) if (!c.open && c.x > this.px && c.x - this.px < 22) score[c.lane] += 7;
    for (const p of this.pickups) if (p.x > this.px && p.x - this.px < 22) score[p.lane] += 5;
    score[1] += 0.5; score[this.lane] += 1;
    let best = this.lane; for (let i = 0; i < 3; i++) if (score[i] > score[best]) best = i;
    if (best !== this.lane) { this.changeLane(Math.sign(best - this.lane)); this.autoT = this.t + 0.35; }
  }

  // ---------- spari dell'eroe e dei compagni ----------
  fireRate() {
    const w = WEAPONS[this.weapon];
    const effortMul = clamp(0.45 + 0.55 * (this.power / Math.max(90, this.effort.avg || this.power || 1)), 0.45, 1.6);
    return w.rate * this.hero.rate * effortMul * (this.overdrive > 0 ? 1.7 : 1);
  }

  target(x, laneZ, range = 30) {
    let best = null; let bs = Infinity;
    for (const e of this.foes) {
      if (e.dead || e.x < x - 0.5 || e.x > x + range) continue;
      if (e.def.obstacle && Math.abs(e.z - laneZ) > 1.2) continue; // le transenne solo se sono sulla tua corsia
      const s = (e.x - x) + Math.abs(e.z - laneZ) * 3.5;
      if (s < bs) { bs = s; best = e; }
    }
    if (!best && this.boss && !this.boss.dead && this.boss.ready) best = this.boss;
    return best;
  }

  updateShooting(dt) {
    const w = WEAPONS[this.weapon];
    this.rate = this.fireRate();
    this.fireT -= dt;
    if (this.fireT <= 0) {
      const tg = this.target(this.px, this.laneZ, this.visRight + 2);
      if (!tg) this.fireT = 0.05;
      else {
        this.fireT = 1 / this.rate;
        const from = v3.set(this.px + 0.9, 1.45, this.laneZ);
        if (w.lanes || this.overdrive > 0) {
          for (let k = 0; k < 3; k++) { const tz = LANES[k]; const e = this.target(this.px, tz, this.visRight + 2); this.shoot(from, e && Math.abs(e.z - tz) < 1.3 ? e : null, tz, w, true); }
        } else this.shoot(from, tg, tg.z, w, true);
        this.blast.fx.spawn(this.px + 1.1, 1.45, this.laneZ, { tex: w.splash ? 'fire' : 'muzzle', size: w.splash ? 1.3 : 0.9, life: 0.07, grow: 0.6, color: this.overdrive > 0 ? '#9eeeff' : null });
        this.audio.sfx(w.sfx);
        if (w.ammo !== Infinity) { this.ammo--; if (this.ammo <= 0) { this.setWeapon('blaster'); this.say(t('games.shooter.ammoOut'), HUD.white, 1.2); } }
      }
    }
  }

  setWeapon(k) {
    this.weapon = k; this.ammo = WEAPONS[k].ammo;
    this.mountGun(this.player, k);
  }

  // un colpo verso un bersaglio (o dritto sulla corsia tz se non c'è)
  shoot(from, tg, tz, w, mine) {
    const mesh = this.bulletPool.get();
    const od = this.overdrive > 0 && mine;
    mesh.glow.material.color.set(od ? '#4de3ff' : w.color);
    if (w.splash) mesh.shape(1.6, 0.5); else if (w.pierce) mesh.shape(5, 0.2); else mesh.shape(2.2, od ? 0.3 : 0.24);
    const tx = tg ? tg.x : from.x + 30; const ty = tg ? (tg.boss ? tg.aimY : centerY(tg)) : 1.4; const tzz = tg ? (tg.boss ? tg.z + 1 : tg.z) : tz;
    const dx = tx - from.x; const dy = ty - from.y; const dz = tzz - from.z; const d = Math.hypot(dx, dy, dz) || 1;
    const spr = w.spread ? (Math.random() - 0.5) * w.spread : 0;
    const vx = (dx / d) * w.speed; const vy = (dy / d) * w.speed + spr * 2; const vz = (dz / d) * w.speed + spr;
    mesh.position.copy(from);
    mesh.lookAt(from.x + vx, from.y + vy, from.z + vz);
    this.bullets.push({ mesh, x: from.x, y: from.y, z: from.z, vx, vy, vz, life: 1.4, dmg: w.dmg * (od ? 2 : 1), splash: w.splash, pierce: w.pierce || od, hits: null, mine });
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
      b.mesh.position.set(b.x, b.y, b.z);
      if (b.y < 0.05) { b.life = 0; this.blast.fx.spawn(b.x, 0.2, b.z, { tex: 'spark', size: 0.6, life: 0.12 }); }
      // bersagli: nemici e boss
      for (const e of this.foes) {
        if (e.dead || (b.hits && b.hits.has(e))) continue;
        const ey = centerY(e);
        if (Math.abs(e.x - b.x) < e.def.rad && Math.abs(e.z - b.z) < 1.0 && Math.abs(ey - b.y) < 1.4) { this.hitFoe(e, b); if (!b.pierce) { b.life = 0; break; } (b.hits = b.hits || new Set()).add(e); }
      }
      const B = this.boss;
      if (b.life > 0 && B && !B.dead && B.ready && b.x > B.x - B.halfW && Math.abs(b.z - B.z) < B.halfD + 1.5 && b.y > B.y0 && b.y < B.y0 + B.h) {
        if (!b.hits?.has(B)) { this.hitBoss(b); if (!b.pierce) b.life = 0; else (b.hits = b.hits || new Set()).add(B); }
      }
      if (b.life <= 0) b.mesh.visible = false;
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  hitFoe(e, b) {
    if (b.splash) {
      this.blast.boom(b.x, b.y, b.z, 0.9, { colors: [this.L.foe, '#3a3f4a', '#ffd166'] });
      this.audio.sfx('boom'); this.shakeK.add(0.12);
      for (const o of this.foes) if (!o.dead && Math.hypot(o.x - b.x, o.z - b.z) < b.splash) this.damageFoe(o, b.dmg);
      if (this.boss?.ready && Math.abs(this.boss.x - b.x) < b.splash + this.boss.halfW) this.damageBoss(b.dmg * 0.5);
    } else {
      this.damageFoe(e, b.dmg);
      this.blast.fx.spawn(b.x, b.y, b.z, { tex: 'spark', size: 0.75, life: 0.07, grow: 1 });
      for (let q = 0; q < 2; q++) this.blast.fx.spawn(b.x, b.y, b.z, { tex: 'spark', size: 0.25, life: 0.3, vx: -3 + Math.random() * 6, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 4, grow: 0 });
    }
  }

  damageFoe(e, n) {
    if (e.dead) return;
    e.hp -= n; e.flash = 1; if (e.w) e.w.hit = 1;
    this.audio.sfx('hit');
    if (e.hp > 0) return;
    this.killFoe(e);
  }

  killFoe(e, bonus = true) {
    e.dead = true; e.deadT = 0;
    if (e.teleMesh) { e.teleMesh.visible = false; e.teleMesh = null; }
    const big = e.type === 'brute' ? 1.4 : e.type === 'barrier' ? 0.8 : 1;
    const y = (e.y || 0) + (e.type === 'barrier' ? 0.6 : 1.2);
    this.blast.boom(e.x, y, e.z, big, { colors: e.type === 'barrier' ? ['#d9d6cf', '#e8323c', '#ffffff'] : [this.L.foe, this.L.foeDark, '#c9ced6', '#ffd166'] });
    this.audio.sfx(e.type === 'brute' ? 'bigboom' : 'boom');
    this.shakeK.add(e.type === 'brute' ? 0.35 : 0.14);
    if (e.type === 'brute') this.ts.hitStop(0.06);
    if (!bonus) return;
    this.kills++; this.levelStats.kills++;
    this.combo++; this.comboT = 2.2; this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (this.combo >= 3) this.hooks.progress?.setMax('maxCombo', this.combo);
    const pts = Math.round(e.def.score * (this.level + 1) * (1 + Math.min(this.combo, 20) * 0.1));
    this.score += pts;
    this.pop(this.combo >= 3 ? `+${pts} ×${this.combo}` : `+${pts}`, this.combo >= 3 ? '#ff9f1c' : '#ffffff', e.x, y + 1.6, e.z, 0.9);
    this.prog('kills', 1, 1);
    this.odMeter = Math.min(1, this.odMeter + 0.025);
    if (e.type === 'drone') { e.vy = 0; e.spin = 8; }
  }

  // ---------- nemici: movimento, attacchi telegrafati ----------
  updateFoes(dt) {
    const px = this.px; const standoff = this.visRight * 0.68;
    for (const e of this.foes) {
      e.t += dt; e.flash = Math.max(0, e.flash - dt * 7);
      setFlash(e.mats, e.flash * 0.8);
      if (e.dead) {
        e.deadT += dt;
        if (e.w) { e.w.update(dt, e.def.style, 0, { dying: true }); if (e.deadT > 0.9) e.w.root.position.y -= dt * 1.5; }
        else if (e.type === 'drone') { e.vy = (e.vy || 0) - 18 * dt; e.y = Math.max(0.3, e.y + e.vy * dt); e.root.position.y = e.y; e.root.rotation.z += dt * 9; e.root.rotation.x += dt * 5; if (e.y <= 0.31 && !e.landed) { e.landed = true; this.blast.boom(e.x, 0.4, e.z, 0.6); } }
        else if (e.root) e.root.visible = false;
        continue;
      }
      const dx = e.x - px;
      if (e.type === 'trooper') {
        // avanza fino a distanza di tiro, poi tiene il passo e spara sulla sua corsia
        const holding = dx < standoff && dx > 3;
        const move = holding ? -this.speed * 0.98 : e.def.speed;
        e.x -= move * dt;
        e.fireT -= dt;
        if (e.fireT <= 0 && dx > 3 && dx < this.visRight && this.state !== 'bossIntro') {
          if (!e.tele) { e.tele = 0.65; e.w.lungeDur = 0.6; e.w.lunge = 0.6; this.teleLine(e); }
        }
        if (e.tele > 0) { e.tele -= dt; if (e.tele <= 0) { e.tele = 0; this.fireBolt(e); e.fireT = 2.2 + Math.random() * 1.8 - this.level * 0.3; } }
        e.w.update(dt, 'walk', holding ? 0 : e.def.speed);
      } else if (e.type === 'brute') {
        // carica sulla sua corsia: telegrafata (corsia rossa) prima dello scatto
        if (!e.charging && dx < this.visRight * 0.85) { e.charging = true; e.tele = 0.9; this.teleLine(e, true); }
        if (e.tele > 0) { e.tele -= dt; e.w.update(dt, 'brute', 0); e.x -= -this.speed * dt * 0.9; }
        else { e.x -= (e.charging ? 7.5 : e.def.speed) * dt; e.w.update(dt, 'brute', e.charging ? 6 : e.def.speed); if (e.teleMesh) { e.teleMesh.visible = false; e.teleMesh = null; } }
      } else if (e.type === 'drone') {
        // vola davanti, poi sgancia bombe sulla corsia dove sei
        const hover = this.visRight * 0.55 + Math.sin(e.t * 0.9) * 2;
        if (dx > hover) e.x -= 4 * dt; else e.x += this.speed * dt * 0.98;
        e.y = FOES.drone.fly + Math.sin(e.t * 3) * 0.3;
        e.root.position.y = e.y; e.root.rotation.z = Math.sin(e.t * 2) * 0.15;
        e.fireT -= dt;
        if (e.fireT <= 0 && dx < this.visRight && this.state !== 'bossIntro') { e.fireT = 3.2 + Math.random() * 1.5 - this.level * 0.3; this.mortar([{ lane: this.lane, dx: (Math.random() - 0.5) * 1.5 }], 1.15, 'bomb', e); }
        // la corsia del drone segue piano la tua
        e.z += (LANES[this.lane] - e.z) * dt * 0.4;
      } else if (e.type === 'barrier') {
        if (e.root.userData.glow) e.root.userData.glow.material.opacity = 0.5 + 0.5 * Math.sin(e.t * 10);
      }
      if (e.w) { e.w.root.position.set(e.x, 0, e.z); e.w.root.rotation.y = -Math.PI / 2 + 0.45; e.w.inner.scale.setScalar(this.kits[e.def.kit].scale * (1 + e.flash * 0.06)); }
      else if (e.root) e.root.position.set(e.x, e.y || 0, e.z);
      // contatto con l'eroe sulla stessa corsia
      if (Math.abs(e.x - px) < e.def.rad + 0.5 && Math.abs(e.z - this.laneZ) < 1.1 && !e.def.bombs) {
        if (this.overdrive > 0) this.killFoe(e);
        else { this.hurt(e.type === 'brute' ? 2 : 1); if (e.type !== 'brute') this.killFoe(e, false); }
      }
      if (e.x < px - 12) { e.dead = true; e.deadT = 9; }
    }
    this.foes = this.foes.filter((e) => {
      if (e.dead && e.deadT > (e.type === 'drone' ? 2.4 : 1.6)) { this.removeFoe(e); return false; }
      return true;
    });
  }

  // linea rossa sulla corsia: avviso di un colpo in arrivo
  teleLine(e, wide = false) {
    const m = this.telePool.get(); m.material.opacity = 0;
    e.teleMesh = m; m.userData.owner = e; m.userData.wide = wide;
  }

  fireBolt(e) {
    if (e.teleMesh) { e.teleMesh.visible = false; e.teleMesh = null; }
    const mesh = this.boltPool.get();
    const b = { mesh, x: e.x - 0.8, y: 1.35, z: e.z, lane: e.lane, v: 15, life: 3 };
    mesh.position.set(b.x, b.y, b.z); mesh.rotation.set(0, -Math.PI / 2, 0);
    this.bolts.push(b);
    this.blast.fx.spawn(b.x, b.y, b.z, { tex: 'muzzle', size: 1, life: 0.08, color: '#ff5a6a' });
    this.audio.sfx('laser');
  }

  updateBolts(dt) {
    for (const b of this.bolts) {
      b.x -= b.v * dt; b.life -= dt; b.mesh.position.set(b.x, b.y, b.z);
      if (Math.abs(b.x - this.px) < 0.7 && Math.abs(b.z - this.laneZ) < 0.9) {
        if (this.overdrive > 0) this.blast.fx.spawn(b.x, b.y, b.z, { tex: 'blue', size: 1.5, life: 0.2 });
        else this.hurt(1);
        b.life = 0;
      }
      if (b.x < this.px - 12) b.life = 0;
      if (b.life <= 0) b.mesh.visible = false;
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  // colpi dall'alto: cerchi rossi a terra, poi esplosione (dx relativo all'eroe, che intanto avanza)
  // dx: dove arriva la bomba rispetto al punto in cui sarà l'eroe allo scoppio (fisso nel mondo)
  mortar(list, tele, kind = 'bomb', owner = null) {
    const v = this.speed * (this.state === 'play' ? 1 : 0.8);
    for (const it of list) {
      const m = this.markPool.get(); m.scale.setScalar(2.6);
      this.strikes.push({ kind: 'mark', lanes: [it.lane], x: this.px + v * tele + it.dx, t: 0, tele, meshes: [m], owner, bomb: kind });
    }
  }

  // corsie intere telegrafate (boss): frecce rosse che scorrono, poi colpo su tutta la corsia
  laneStrike(lanes, tele, kind) {
    const meshes = lanes.map(() => this.telePool.get());
    this.strikes.push({ kind: 'lane', lanes, t: 0, tele, meshes, effect: kind, dur: kind === 'laser' ? 0.5 : 0.35 });
    this.audio.sfx('alarm');
  }

  updateStrikes(dt) {
    const px = this.px; const B = this.boss;
    // linee dei robot che stanno per sparare
    for (const e of this.foes) {
      const m = e.teleMesh; if (!m) continue;
      const x0 = px - 1; const x1 = e.x - 0.5; const len = Math.max(0.5, x1 - x0);
      m.position.set((x0 + x1) / 2, 0.06, e.z); m.scale.set(len, 1, m.userData.wide ? 2.2 : 1.1);
      m.material.map.repeat.set(len / 2.2, 1); m.material.map.offset.x += dt * 2.5;
      m.material.opacity = 0.55 + 0.45 * Math.sin(this.t * 22);
    }
    for (const s of this.strikes) {
      s.t += dt;
      if (s.kind === 'mark') {
        const m = s.meshes[0]; const x = s.x; const z = LANES[s.lanes[0]];
        const k = Math.min(1, s.t / s.tele);
        m.position.set(x, 0.07, z); m.scale.setScalar(2.8 - k * 0.9); m.rotation.y = s.t * 3; m.material.opacity = 0.6 + 0.4 * Math.sin(this.t * (10 + k * 20));
        if (!s.dropped && s.t > s.tele - 0.35) { s.dropped = true; s.fall = { y: 9 }; }
        if (s.t >= s.tele && !s.done) {
          s.done = true; m.visible = false;
          this.blast.boom(x, 0.6, z, 1, { colors: ['#3a3f4a', '#ff8a1f'] }); this.audio.sfx('boom'); this.shakeK.add(0.2);
          if (Math.abs(this.laneZ - z) < 1.1 && Math.abs(px - x) < 1.7) this.hurt(1);
        }
        if (s.dropped && !s.done) this.blast.fx.spawn(x, 9 - (s.t - (s.tele - 0.35)) / 0.35 * 8.5, z, { tex: 'fire', size: 0.8, life: 0.06, grow: 0 });
      } else {
        const x0 = px - 6; const x1 = (B ? B.x - B.halfW * 0.6 : px + 20); const len = Math.max(1, x1 - x0);
        s.meshes.forEach((m, i) => {
          const z = LANES[s.lanes[i]];
          m.position.set((x0 + x1) / 2, 0.06, z); m.scale.set(len, 1, 2.3);
          m.material.map.repeat.set(len / 2.4, 1); m.material.map.offset.x += dt * (2 + s.t * 3);
          m.material.opacity = s.t < s.tele ? 0.5 + 0.5 * Math.sin(this.t * (12 + s.t * 16)) : 0;
        });
        if (s.t >= s.tele && !s.fired) {
          s.fired = true; this.fireLaneEffect(s, x0, x1);
        }
        if (s.fired && !s.done) {
          if (s.lanes.some((ln) => Math.abs(LANES[ln] - this.laneZ) < 1.0)) this.hurt(s.effect === 'stomp' ? 2 : 1);
          if (s.t > s.tele + s.dur) { s.done = true; this.beam.visible = false; }
        }
      }
    }
    this.strikes = this.strikes.filter((s) => {
      if (s.done && (s.kind === 'mark' || s.t > s.tele + s.dur + 0.1)) { for (const m of s.meshes) m.visible = false; return false; }
      return true;
    });
  }

  fireLaneEffect(s, x0, x1) {
    const B = this.boss;
    this.shakeK.add(0.45);
    for (const ln of s.lanes) {
      const z = LANES[ln];
      if (s.effect === 'laser') {
        this.beam.visible = true; this.beam.position.set((x0 + x1) / 2, 1.3, z); this.beam.scale.set(x1 - x0 + 4, 1, 1);
        this.audio.sfx('laser');
        for (let x = x0; x < x1; x += 2.5) this.blast.fx.spawn(x, 0.4, z, { tex: 'fire', size: 1.6, life: 0.4, color: '#ff4d7a' });
      } else {
        for (let x = x1, k = 0; x > x0; x -= 2.2, k++) {
          setTimeout(() => { if (!this.active || !this.stage) return; this.blast.boom(x, 0.5, z, 0.75, { ring: k % 2 === 0, colors: ['#3a3f4a', '#ff8a1f', '#ffd166'] }); }, k * 22);
        }
        this.audio.sfx('bigboom');
      }
    }
    if (B) { B.recoil = 1; if (B.w) { B.w.lungeDur = 0.5; B.w.lunge = 0.5; } }
  }

  // ---------- l'eroe colpito ----------
  hurt(n) {
    if (this.god || this.overdrive > 0 || this.invuln > 0 || this.state === 'over' || this.state === 'clear') return;
    this.hp -= n; this.invuln = 1.5; this.levelStats.hits++;
    this.combo = 0;
    this.shakeK.add(0.55); this.ts.hitStop(0.09); this.hurtFlash = 0.5;
    this.audio.sfx('hurt'); if (navigator.vibrate) navigator.vibrate(90);
    this.pop(`−${n} ♥`, '#ff4d6d', this.px, 3, this.laneZ, 1);
    this.blast.fx.spawn(this.px, 1.3, this.laneZ, { tex: 'red', size: 3.5, life: 0.35 });
    if (this.hp <= 0) this.gameOver();
  }

  gameOver() {
    this.hp = 0; this.state = 'over'; this.stateT = 0;
    this.audio.stopSong(); this.audio.sfx('lose'); this.audio.transpose = 0;
    this.ts.slowmo(0.3, 1.4);
    this.blast.boom(this.px, 1, this.laneZ, 1.2);
    this.endRun();
  }

  endRun() {
    this.newBest = this.score > this.best;
    if (this.newBest) { this.best = Math.round(this.score); localStorage.setItem('strikeBest3', this.best); }
    this.prog('races', 0, 30 + this.level * 30);
    this.hooks.runEnd?.({ game: 'shooter', score: Math.round(this.score) });
    this.hooks.setGrade(0);
  }

  // ---------- gabbie e casse ----------
  updateCages(dt) {
    for (const c of this.cages) {
      c.t += dt;
      if (!c.open) {
        c.beacon.material.opacity = 0.45 + 0.3 * Math.sin(this.t * 5);
        if (c.x - this.px < this.visRight + 4 && (this.frameN & 1)) c.pr.pose(dt * 2, 0, 0, { wave: true }); // si muove solo quando è in vista
        if (Math.abs(c.x - this.px) < 1.3 && Math.abs(c.z - this.laneZ) < 1.1) this.freeCage(c);
      } else if (!c.gone) c.pr.pose(dt, 0, 0);
    }
    this.cages = this.cages.filter((c) => { if (c.x < this.px - 14) { if (c.root.parent) this.stage.scene.remove(c.root); return false; } return !c.gone || c.root.parent; });
  }

  updatePickups(dt) {
    for (const p of this.pickups) {
      p.t += dt; p.model.rotation.y += dt * 2; p.model.position.y = 0.6 + Math.sin(p.t * 3) * 0.15;
      if (!p.taken && Math.abs(p.x - this.px) < 1.3 && Math.abs(p.z - this.laneZ) < 1.1) {
        p.taken = true; this.stage.scene.remove(p.root);
        this.blast.fx.spawn(p.x, 1, p.z, { tex: 'spark', size: 3, life: 0.4, color: p.col });
        this.blast.ring(p.x, p.z, 5, p.col, 0.5);
        if (p.kind === 'heart') { this.hp = Math.min(this.maxHp, this.hp + 1); this.say(t('games.shooter.plusLife'), '#ff4d6d', 1.5); this.audio.sfx('pickup'); }
        else { this.setWeapon(p.weapon); this.say(t(WEAPONS[p.weapon].name), WEAPONS[p.weapon].color, 1.8, true); this.audio.sfx('pickup'); this.ts.hitStop(0.05); }
      }
    }
    this.pickups = this.pickups.filter((p) => { if (p.taken) return false; if (p.x < this.px - 12) { this.stage.scene.remove(p.root); return false; } return true; });
  }

  updateWingmen(dt) {
    const w0 = WEAPONS.blaster;
    for (const w of this.wingmen) {
      w.t += dt;
      const leaving = w.t > w.life;
      let lane = this.lane + w.laneOff; if (lane < 0 || lane > 2) lane = this.lane - w.laneOff;
      w.x = lerp(w.x, leaving ? w.x + 30 : this.px + w.slot, Math.min(1, dt * (leaving ? 0.8 : 2.5)));
      if (leaving) w.x += this.speed * dt * 1.6;
      w.z += (LANES[lane] - w.z) * Math.min(1, dt * 4);
      w.fireT -= dt;
      if (!leaving && w.fireT <= 0) {
        const tg = this.target(w.x, w.z, this.visRight + 4);
        if (tg) { w.fireT = 1 / (w0.rate * 0.7); this.shoot(v3.set(w.x + 0.9, 1.45, w.z), tg, tg.z, w0, false); this.blast.fx.spawn(w.x + 1.1, 1.45, w.z, { tex: 'muzzle', size: 0.8, life: 0.07, grow: 0.6 }); }
        else w.fireT = 0.1;
      }
      w.r.root.position.set(w.x, 0, w.z); w.r.root.rotation.y = Math.PI / 2 - 0.25;
      w.r.pose(dt, this.cadence || 85, 8, { stand: leaving ? 1 : 0 });
    }
    this.wingmen = this.wingmen.filter((w) => { if (w.t > w.life && w.x > this.px + this.visRight + 6) { this.stage.scene.remove(w.r.root); return false; } return true; });
  }

  // ---------- boss ----------
  startBoss() {
    const def = BOSSES[this.L.boss];
    this.state = 'bossIntro'; this.stateT = 0;
    // i nemici rimasti scappano/esplodono
    for (const e of this.foes) if (!e.dead) this.killFoe(e, false);
    const scene = this.stage.scene;
    let root; let w = null; let mats;
    if (def.kit) {
      const kit = this.kits[def.kit]; w = new Walker(kit); w.body.material = foeMaterial(kit.tpl, this.L.foe); w.body.castShadow = true;
      root = w.root; mats = [w.body.material];
    } else { root = rigidModel(this.m[def.model], def.h, { face: 0.3 }); mats = root.userData.mats; }
    const fit = clamp(this.visW / 24, 0.62, 1);
    if (!w) root.scale.setScalar(fit);
    scene.add(root);
    const size = def.kit ? new THREE.Vector3(def.h * 0.6, def.h, def.h * 0.4) : root.userData.size;
    const halfW = Math.max(size.x, size.z) * 0.5 * fit;
    const B = { def, root, w, mats, hp: def.hp * (1 + 0.15 * this.level), maxHp: 0, x: this.px + this.visRight + 14, z: -4.8, y0: def.fly ? def.fly * fit : 0, h: def.h * fit, halfW, halfD: 2, flash: 0, t: 0, atkT: 2.6, phase: 1, ready: false, dead: false, recoil: 0, fit, boss: true, aimY: (def.fly ? def.fly * fit : 0) + def.h * fit * 0.5 };
    B.maxHp = B.hp;
    this.boss = B;
    this.audio.playSong(SONGS.boss); this.audio.sfx('alarm');
    this.ts.slowmo(0.45, 1.6);
    this.say(t('games.shooter.bossIncoming', { name: t(def.name) }), '#ff4d6d', 3.2, true);
    this.shakeK.add(0.3);
  }

  hitBoss(b) {
    if (b.splash) { this.blast.boom(b.x, b.y, b.z, 1, { colors: [this.L.foe, '#3a3f4a'] }); this.audio.sfx('boom'); }
    else { this.blast.fx.spawn(b.x, b.y, b.z, { tex: 'spark', size: 0.9, life: 0.08, grow: 1 }); if (Math.random() < 0.3) this.blast.chunks(b.x, b.y, b.z, 2, [this.L.foeDark, this.L.foe], 0.6); }
    this.damageBoss(b.dmg);
  }

  damageBoss(n) {
    const B = this.boss; if (!B || B.dead || !B.ready) return;
    B.hp -= n; B.flash = Math.max(B.flash, 0.55); this.audio.sfx('hit');
    const ph = B.hp < B.maxHp / 3 ? 3 : B.hp < (2 * B.maxHp) / 3 ? 2 : 1;
    if (ph !== B.phase && B.hp > 0) {
      B.phase = ph; B.atkT = 1.6;
      this.say(t('games.shooter.phase', { n: ph }), '#ff4d6d', 1.8, true);
      this.ts.slowmo(0.35, 0.7); this.shakeK.add(0.5); this.audio.sfx('alarm');
      this.blast.boom(B.x - B.halfW * 0.5, B.aimY, B.z + 1, 1.6);
    }
    if (B.hp <= 0) this.killBoss();
  }

  killBoss() {
    const B = this.boss; B.dead = true; B.deadT = 0; B.ready = false;
    this.beam.visible = false;
    for (const s of this.strikes) for (const m of s.meshes) m.visible = false; this.strikes = [];
    for (const e of this.foes) if (!e.dead) this.killFoe(e, false);
    for (const b of this.bolts) { b.mesh.visible = false; } this.bolts = [];
    this.ts.slowmo(0.22, 2.4);
    this.audio.sfx('bigboom');
    this.score += 5000 * (this.level + 1);
    this.prog('bosses', 1, 150);
    this.say(t('games.shooter.bossDown', { name: t(B.def.name) }), HUD.lime, 3, true);
    this.pop(`+${5000 * (this.level + 1)}`, HUD.lime, B.x, B.aimY + 3, B.z, 2);
  }

  updateBoss(dt) {
    const B = this.boss; B.t += dt;
    B.flash = Math.max(0, B.flash - dt * 6); setFlash(B.mats, B.flash * 0.5);
    B.recoil = Math.max(0, B.recoil - dt * 3);
    const homeX = this.px + this.visRight * 0.66;
    if (B.dead) {
      B.deadT += dt;
      // catena di esplosioni, poi l'onda d'urto finale
      if (B.deadT < 2.2 && Math.random() < dt * 14) this.blast.boom(B.x + (Math.random() - 0.5) * B.halfW * 2, B.y0 + Math.random() * B.h, B.z + 1 + Math.random(), 0.9 + Math.random() * 0.6);
      if (B.deadT > 2.2 && !B.final) {
        B.final = true;
        this.blast.boom(B.x, B.aimY, B.z + 1, 3.2); this.blast.ring(B.x, B.z, 30, '#ffffff', 0.9); this.blast.airRing(B.x, B.aimY, B.z, 22, '#fff4d0', 0.6);
        this.blast.chunks(B.x, B.aimY, B.z, 60, [this.L.foe, this.L.foeDark, '#c9ced6', '#ffd166'], 1.8);
        this.shakeK.add(1); this.audio.sfx('bomb'); this.whiteFlash = 0.6;
        B.root.visible = false;
      }
      if (B.final) B.root.visible = false; else { B.root.position.y = B.y0 * (1 - B.deadT / 2.2) + Math.sin(B.deadT * 40) * 0.06; B.root.rotation.z = -B.deadT * 0.12; }
      if (B.deadT > 3.6) this.levelClear();
      B.x += (homeX - B.x) * Math.min(1, dt * 0.5);
      if (!B.final) this.positionBoss(B, dt);
      return;
    }
    // ingresso: arriva da destra e si piazza
    B.x += (homeX - B.x) * Math.min(1, dt * (B.ready ? 2 : 1.1)) + this.speed * 0.8 * dt; // tiene il passo dell'eroe
    if (!B.ready && Math.abs(B.x - homeX) < 1.5 && this.state === 'boss') {
      B.ready = true; this.shakeK.add(0.6);
      this.blast.ring(B.x, B.z, 16, '#ffd9a0', 0.7);
      if (B.def.kit) { this.blast.boom(B.x, 0.3, B.z, 1.4); this.audio.sfx('bigboom'); }
    }
    this.positionBoss(B, dt);
    if (!B.ready) return;
    // ogni tanto una cassa d'armi: tiene vivo il combattimento e fa cambiare corsia
    B.crateT = (B.crateT ?? 6) - dt;
    if (B.crateT <= 0) { B.crateT = 16; this.spawnPickup('crate', this.px + this.visRight + 2, Math.floor(Math.random() * 3), CRATE_WEAPONS[Math.floor(Math.random() * CRATE_WEAPONS.length)]); }
    // attacchi: ciclo con pause, più rapido nelle fasi avanzate
    B.atkT -= dt;
    const busy = this.strikes.some((s) => s.kind === 'lane');
    if (B.atkT <= 0 && !busy) {
      const list = B.def.attacks; const a = list[(B.k = (B.k || 0) + 1) % list.length];
      this.bossAttack(a, B.phase);
      B.atkT = [0, 3.4, 2.7, 2.1][B.phase];
    }
  }

  positionBoss(B, dt) {
    const bob = B.def.fly ? Math.sin(B.t * 1.4) * 0.5 : B.def.kit ? 0 : Math.abs(Math.sin(B.t * 9)) * 0.05;
    const x = B.x + B.recoil * 0.8;
    if (B.w) {
      const moving = Math.abs(B.x - (this.px + this.visRight * 0.66)) > 0.3 || this.speed > 0;
      B.w.update(dt, 'boss', moving ? 1.2 : 0);
      B.w.root.position.set(x, 0, B.z); B.w.root.rotation.y = -Math.PI / 2 + 0.4;
      B.w.inner.scale.setScalar(this.kits[B.def.kit].scale * B.fit * (1 + B.flash * 0.03));
    } else {
      B.root.position.set(x, B.y0 + bob, B.z);
      B.root.rotation.z = B.def.fly ? Math.sin(B.t * 0.9) * 0.05 : -B.recoil * 0.06;
    }
  }

  bossAttack(a, phase) {
    const tele = [0, 1.5, 1.25, 1.05][phase];
    switch (a) {
      case 'shells': case 'bombs': this.laneStrike(phase >= 2 ? [this.lane, (this.lane + 1 + Math.floor(Math.random() * 2)) % 3] : [this.lane], tele, a); break;
      case 'laser': this.laneStrike(phase >= 3 ? [this.lane, (this.lane + 1) % 3] : [this.lane], tele, 'laser'); break;
      case 'stomp': this.laneStrike([this.lane, (this.lane + 1 + Math.floor(Math.random() * 2)) % 3], tele + 0.2, 'stomp'); break;
      case 'mortar': case 'missiles': {
        const n = 2 + phase; const list = [];
        for (let i = 0; i < n; i++) list.push({ lane: i === 0 ? this.lane : Math.floor(Math.random() * 3), dx: i === 0 ? 0 : -3 + Math.random() * 9 });
        this.mortar(list, tele + 0.2, 'bomb'); this.audio.sfx('rocket');
        break;
      }
      case 'summon': for (let i = 0; i < phase; i++) this.spawnFoe('trooper', this.px + this.visRight + 2 + i * 3, (this.lane + i + 1) % 3); break;
      case 'drones': for (let i = 0; i < Math.min(2, phase); i++) this.spawnFoe('drone', this.boss.x - 2 - i * 2, (this.lane + i) % 3); break;
      default: break;
    }
  }

  levelClear() {
    const B = this.boss; if (B) { this.stage.scene.remove(B.root); this.boss = null; }
    this.state = this.level >= LEVELS.length - 1 ? 'victory' : 'clear'; this.stateT = 0; this.manual = false;
    const noHit = this.levelStats.hits === 0;
    if (noHit) this.score += 3000;
    this.clearBonus = noHit;
    this.audio.playSong(SONGS.menu); this.audio.sfx('win'); this.audio.transpose = 0;
    this.overdrive = 0;
    this.confetti.burst(this.px + 2, 4, this.laneZ, 160, 5);
    if (this.state === 'victory') {
      this.prog('campaigns', 1, 300);
      this.endRun();
      this.player.standUp(true);
      for (const w of this.wingmen) w.r.standUp(true);
    } else this.hooks.progress?.event('races', 0, 40);
  }

  firework() {
    const x = this.px + (Math.random() - 0.2) * this.visW; const y = 8 + Math.random() * 8; const z = -10 - Math.random() * 15;
    const col = ['#ff4d9d', '#4de3ff', '#ffd166', '#7dff6a', '#c77dff'][Math.floor(Math.random() * 5)];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; this.blast.fx.spawn(x, y, z, { tex: 'spark', size: 0.7, life: 1.1, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, vz: 0, grow: 0, color: col }); }
    this.blast.fx.spawn(x, y, z, { tex: 'flash', size: 5, life: 0.3, color: col });
    this.audio.sfx('boom');
  }

  // ---------- pose, camera ----------
  animate(dt) {
    this.frameN = (this.frameN || 0) + 1;
    const cad = this.cadence || 85; const P = this.player;
    const od = this.overdrive > 0;
    if (P.mode === 'ride') {
      P.root.position.set(this.px, 0, this.laneZ);
      P.root.rotation.set(0, Math.PI / 2 - 0.3 - this.tilt * 0.25, 0);
      P.lean.rotation.z = -this.tilt * 0.18;
      P.pose(dt, this.state === 'over' ? 0 : cad, this.speed, { stand: this.sprinting || od ? 1 : 0 });
    } else { P.root.position.set(this.px, 0, this.laneZ); P.root.rotation.set(0, 0.2, 0); P.pose(dt, 0, 0); }
    if (this.state === 'over') { P.root.rotation.z = Math.min(1.3, this.stateT * 3); P.root.position.y = 0; }
    P.root.visible = !(this.invuln > 0 && Math.floor(this.invuln * 14) % 2 && this.state !== 'over');
    this.aura.position.set(this.px, 1.3, this.laneZ + 0.2);
    this.aura.material.opacity += ((od ? 0.4 : 0) - this.aura.material.opacity) * Math.min(1, dt * 6);
    this.aura.material.rotation += dt * 2;
    if (od && Math.random() < dt * 14) this.blast.fx.spawn(this.px - 0.8, 0.5 + Math.random(), this.laneZ, { tex: 'blue', size: 0.5, life: 0.35, vx: -this.speed * 0.6, grow: -0.5 });
    // stelle e linee di vento durante l'overdrive
    this.windAnchor = this.windAnchor || new THREE.Object3D();
    this.windAnchor.position.set(this.px + 5, 0, this.laneZ); this.windAnchor.rotation.y = -Math.PI / 2;
    this.wind.update(dt, this.windAnchor, od ? 1 : this.sprinting ? 0.4 : 0);
    // segnale sulle casse e gabbie
    this.camera(dt);
    this.world.update(this.px, this.stage.camera, dt);
  }

  camera(dt) {
    const cam = this.stage.camera; const W = this.stage.W; const H = this.stage.H; const a = W / Math.max(1, H);
    const k = clamp((a - 0.55) / (1.6 - 0.55), 0, 1); // 0 = telefono in verticale, 1 = orizzontale
    let fov = lerp(60, 38, k); let dist = lerp(20, 19, k); const elev = lerp(0.3, 0.17, k);
    const B = this.boss;
    const bossK = B && !B.dead ? 1 : 0;
    this.bossCam = (this.bossCam || 0) + (bossK - (this.bossCam || 0)) * Math.min(1, dt * 1.5);
    dist *= 1 + this.bossCam * 0.12;
    if (this.state === 'intro') { const s = clamp(1 - this.stateT / 3.2, 0, 1); dist *= 1 + s * s * 0.55; }
    if (this.state === 'menu') dist *= 0.62;
    if (this.state === 'victory' || this.state === 'clear') dist *= 0.82;
    if (this.overdrive > 0) fov += 5;
    const tanH = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * a;
    const halfW = dist * tanH;
    let lead = halfW * (this.state === 'menu' ? 0.05 : 0.46);
    lead += this.bossCam * halfW * 0.06;
    this.visW = halfW * 2; this.visRight = lead + halfW;
    const tz = lerp(LANES[1], this.laneZ, 0.25) - 0.4;
    const tx = this.px + lead; const ty = (this.state === 'menu' ? 1.1 : 1.6) + (1 - k) * 2.6;
    const pos = v3.set(tx, ty + Math.sin(elev) * dist, tz + Math.cos(elev) * dist);
    if (!this.camInit) { this.camBase = pos.clone(); this.camInit = true; this.camLook = new THREE.Vector3(tx, ty, tz); }
    this.camBase.lerp(pos, Math.min(1, dt * 4));
    this.camBase.x = lerp(this.camBase.x, pos.x, Math.min(1, dt * 10));
    cam.position.copy(this.camBase);
    this.camLook.lerp(v3.set(tx, ty, tz), Math.min(1, dt * 6)); this.camLook.x = tx;
    cam.lookAt(this.camLook);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.far = 900; cam.updateProjectionMatrix();
    this.shakeK.apply(cam);
  }

  // ---------- interfaccia ----------
  drawHud(dt) {
    const { ctx, W, H } = this.stage;
    ctx.clearRect(0, 0, W, H); hudView(ctx, W, H);
    if (this.state === 'loading') {
      ctx.fillStyle = '#0d0c14'; ctx.fillRect(0, 0, W, H);
      txt(ctx, t('games.shooter.hud.title'), W / 2, H / 2 - 30, { size: 44, align: 'center', color: HUD.lime, italic: true });
      txt(ctx, t('games.common.loading'), W / 2, H / 2 + 12, { size: 18, align: 'center' });
      ctx.fillStyle = 'rgba(255,255,255,.15)'; rr(ctx, W / 2 - 100, H / 2 + 30, 200, 8, 4); ctx.fill();
      ctx.fillStyle = HUD.lime; rr(ctx, W / 2 - 100, H / 2 + 30, 200 * clamp(this.loadPct || 0, 0, 1), 8, 4); ctx.fill();
      return;
    }
    if (this.state === 'error') { txt(ctx, t('ui.error', { error: this.error }), W / 2, H / 2, { size: 16, align: 'center', color: HUD.red }); return; }
    // vignettatura: chiude i bordi, l'occhio va al centro
    // (vignettatura e sfumatura in basso disegnate una volta sola in un canvas a mezza risoluzione)
    const S0 = clamp(Math.min(W, H) / 390, 1, 1.35); const key = `${W}x${H}${this.L.night}${this.state === 'menu'}`;
    if (this.backKey !== key) {
      this.backKey = key; const c = this.backCanvas || (this.backCanvas = document.createElement('canvas'));
      c.width = Math.ceil(W / 2); c.height = Math.ceil(H / 2); const g = c.getContext('2d'); g.scale(0.5, 0.5);
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, this.L.night ? 'rgba(8,0,20,.55)' : 'rgba(10,10,30,.35)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      if (this.state !== 'menu') {
        const bh = 118 * S0;
        const gr = g.createLinearGradient(0, H - bh - 20, 0, H); gr.addColorStop(0, 'rgba(6,8,22,0)'); gr.addColorStop(0.35, 'rgba(6,8,22,.55)'); gr.addColorStop(1, 'rgba(6,8,22,.85)');
        g.fillStyle = gr; g.fillRect(0, H - bh - 20, W, bh + 20);
      }
    }
    ctx.drawImage(this.backCanvas, 0, 0, W, H);
    if (this.overdrive > 0) { const k = Math.min(1, this.overdrive / 0.6); ctx.fillStyle = `rgba(77,227,255,${0.12 * k})`; ctx.fillRect(0, 0, W, H); }
    if (this.state === 'menu') return this.drawMenu(ctx, W, H, dt);
    const S = clamp(Math.min(W, H) / 390, 1, 1.35);
    const pad = 10; const top = 60;
    // riga in alto: punteggio · missione e avanzamento · cuori
    ctx.fillStyle = 'rgba(8,10,26,.6)'; rr(ctx, pad, top, W - 2 * pad, 42 * S, 12); ctx.fill();
    const rowY = top + 30 * S;
    txt(ctx, String(Math.round(this.score)), pad + 10, rowY, { size: 26 * S, color: HUD.white });
    const heartW = 18 * S; const hx0 = W - pad - 10 - this.maxHp * heartW;
    for (let i = 0; i < this.maxHp; i++) txt(ctx, i < this.hp ? '♥' : '♡', hx0 + (i + 0.5) * heartW, rowY - 1, { size: 21 * S, align: 'center', color: i < this.hp ? '#ff4d6d' : '#77789a', stroke: null });
    const cx0 = pad + 10 + 86 * S; const cx1 = hx0 - 12; const cw = cx1 - cx0;
    if (cw > 60) {
      const label = `${t('games.shooter.mission', { n: this.level + 1 })} · ${t(this.L.name)}`;
      txt(ctx, label, cx0 + cw / 2, top + 18 * S, { size: fitSize(ctx, label, cw, 15 * S), align: 'center', color: HUD.lime });
      const pr = this.boss ? 1 : clamp(this.px / this.L.len, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; rr(ctx, cx0, top + 26 * S, cw, 7 * S, 3); ctx.fill();
      ctx.fillStyle = HUD.lime; rr(ctx, cx0, top + 26 * S, Math.max(6, cw * pr), 7 * S, 3); ctx.fill();
      txt(ctx, '☠', cx1, top + 34 * S, { size: 13 * S, align: 'center', color: '#ff4d6d' });
    }
    let y2 = top + 42 * S + 8;
    // vita del boss
    const B = this.boss;
    if (B && !B.dead && (B.ready || this.state === 'bossIntro')) {
      const bw = W - 2 * pad; const bh = 18 * S;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; rr(ctx, pad, y2, bw, bh, 7); ctx.fill();
      ctx.fillStyle = B.phase === 3 ? '#ff2e63' : B.phase === 2 ? '#ff6b35' : '#ff9f1c'; rr(ctx, pad, y2, Math.max(8, bw * clamp(B.hp / B.maxHp, 0, 1)), bh, 7); ctx.fill();
      for (const f of [1 / 3, 2 / 3]) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(pad + bw * f - 1, y2, 2, bh); }
      const nm = t(B.def.name); txt(ctx, nm, W / 2, y2 + bh - 4 * S, { size: fitSize(ctx, nm, bw - 20, 14 * S), align: 'center' });
      y2 += bh + 6;
    }
    if (!this.hooks.connected()) { txt(ctx, t('games.common.demo'), W / 2, y2 + 12, { size: 12 * S, align: 'center', color: HUD.gold }); y2 += 18; }
    // in basso: watt grandi, colpi al secondo, arma e munizioni, barra overdrive con la soglia sprint
    const barH = 16 * S; const barY = H - 12 - barH; const bx = pad; const bw2 = W - 2 * pad;
    const big = 56 * S; const pc = this.overdrive > 0 || this.sprinting ? HUD.cyan : HUD.lime;
    const pw = String(Math.round(this.power));
    const numW = txt(ctx, pw, pad + 2, barY - 26 * S, { size: big, color: pc });
    txt(ctx, 'W', pad + 6 + numW, barY - 26 * S, { size: 22 * S, color: '#e8e8f4' });
    txt(ctx, t('games.shooter.fireRate', { n: fmtDec(this.rate || 0, 1) }), pad + 2, barY - 8 * S, { size: 14 * S, color: '#dfe3f0' });
    const w = WEAPONS[this.weapon]; const rx = W - pad - 2;
    const wn = t(w.name);
    txt(ctx, wn, rx, barY - 44 * S, { size: fitSize(ctx, wn, W * 0.42, 22 * S), align: 'right', color: w.color });
    if (w.ammo !== Infinity) {
      const aw = Math.min(150 * S, W * 0.38);
      ctx.fillStyle = 'rgba(255,255,255,.2)'; rr(ctx, rx - aw, barY - 34 * S, aw, 7 * S, 3); ctx.fill();
      ctx.fillStyle = w.color; rr(ctx, rx - aw, barY - 34 * S, Math.max(5, aw * this.ammo / w.ammo), 7 * S, 3); ctx.fill();
    }
    const odLabel = this.overdrive > 0 ? t('games.shooter.overdrive') : t('games.shooter.sprintLine', { w: Math.round(this.effort.threshold || 0) });
    txt(ctx, odLabel, rx, barY - 8 * S, { size: fitSize(ctx, odLabel, W * 0.5, 14 * S), align: 'right', color: this.overdrive > 0 ? HUD.cyan : '#dfe3f0' });
    ctx.fillStyle = 'rgba(8,10,26,.8)'; rr(ctx, bx, barY, bw2, barH, 7); ctx.fill();
    const odK = this.overdrive > 0 ? this.overdrive / OD_TIME : this.odMeter;
    const og = ctx.createLinearGradient(bx, 0, bx + bw2, 0); og.addColorStop(0, '#1fa3ff'); og.addColorStop(1, '#4de3ff');
    ctx.fillStyle = this.overdrive > 0 ? `rgba(220,250,255,${0.75 + 0.25 * Math.sin(this.t * 20)})` : og; rr(ctx, bx, barY, Math.max(8, bw2 * odK), barH, 7); ctx.fill();
    // potenza come linea sopra la barra: sopra la soglia diventa ciano
    const maxW = Math.max(300, (this.effort.threshold || 200) * 1.5);
    ctx.fillStyle = pc; rr(ctx, bx, barY - 5, Math.max(4, bw2 * clamp(this.power / maxW, 0, 1)), 3, 1.5); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + bw2 * clamp((this.effort.threshold || 0) / maxW, 0, 1) - 1, barY - 8, 3, barH + 8);
    if (this.sprinting && this.overdrive <= 0) txt(ctx, t('games.shooter.charging'), bx + bw2 / 2, barY + barH - 3 * S, { size: 12 * S, align: 'center', color: '#06121c', stroke: null });
    // combo vicino all'eroe
    const hp = this.stage.project(this.px, 3.6, this.laneZ);
    if (this.combo >= 3 && this.state !== 'over') txt(ctx, t('games.shooter.combo', { n: this.combo }), hp.x, hp.y - 10, { size: 20 * S, align: 'center', color: '#ff9f1c' });
    // suggerimento: gabbia o cassa su un'altra corsia → freccia con + o −
    this.drawLaneHint(ctx, hp, S);
    // avvisi dei progressi sotto la riga in alto, così non la coprono; i messaggi grandi vanno più giù
    const toast = this.hooks.progress?.toasts?.length > 0;
    ctx.save(); ctx.translate(0, top + 42 * S - 40); this.hooks.progress?.drawToasts(ctx, W, dt); ctx.restore();
    // messaggi grandi al centro (si restringono per stare nello schermo)
    const ty = Math.max(y2 + 40 + (toast ? 60 : 0), H * 0.27);
    this.msgs.draw(ctx, W, H, { u: S * 1.05, y: ty });
    for (const p of this.pops) {
      const k = 1 - p.t / p.life; const q = this.stage.project(p.x, p.y + k * 1.6, p.z);
      ctx.globalAlpha = clamp((p.t / p.life) * 2.5, 0, 1);
      txt(ctx, p.text, clamp(q.x, 40, W - 40), q.y, { size: 20 * S, align: 'center', color: p.color });
      ctx.globalAlpha = 1;
    }
    // lampi a schermo intero
    if (this.hurtFlash > 0) { const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7); rg.addColorStop(0, 'rgba(255,0,40,0)'); rg.addColorStop(1, `rgba(255,0,40,${this.hurtFlash})`); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); }
    if (this.whiteFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.whiteFlash})`; ctx.fillRect(0, 0, W, H); }
    if (this.state === 'intro') this.drawIntro(ctx, W, H, S);
    if (this.state === 'clear' || this.state === 'victory') this.drawClear(ctx, W, H, S);
    if (this.state === 'over') this.drawOver(ctx, W, H, S);

  }

  drawLaneHint(ctx, hp, S) {
    if (this.state !== 'play') return;
    let target = null;
    for (const c of this.cages) if (!c.open && c.x > this.px + 2 && c.x - this.px < this.visRight && c.lane !== this.lane) { target = { lane: c.lane, col: '#7dff6a' }; break; }
    if (!target) for (const p of this.pickups) if (p.x > this.px + 2 && p.x - this.px < this.visRight && p.lane !== this.lane) { target = { lane: p.lane, col: p.col }; break; }
    if (!target) return;
    const up = target.lane > this.lane; const pulse = 1 + 0.12 * Math.sin(this.t * 10);
    const y = up ? hp.y - 34 * S : hp.y + 104 * S;
    ctx.save(); ctx.translate(hp.x, y); ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(8,10,26,.75)'; rr(ctx, -26 * S, -18 * S, 52 * S, 36 * S, 10); ctx.fill();
    ctx.strokeStyle = target.col; ctx.lineWidth = 3; ctx.stroke();
    txt(ctx, up ? '+ ▲' : '− ▼', 0, 8 * S, { size: 20 * S, align: 'center', color: target.col, stroke: null });
    ctx.restore();
  }

  drawMenu(ctx, W, H, dt) {
    const S = clamp(Math.min(W, H) / 390, 1, 1.35);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(8,10,28,.88)'); g.addColorStop(0.42, 'rgba(8,10,28,.1)'); g.addColorStop(0.62, 'rgba(8,10,28,.1)'); g.addColorStop(1, 'rgba(8,10,28,.92)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const ty = 66 + 52 * S;
    txt(ctx, t('games.shooter.hud.title'), W / 2, ty, { size: fitSize(ctx, t('games.shooter.hud.title'), W - 30, 60 * S), align: 'center', color: HUD.lime, italic: true });
    const tag = t('games.shooter.hud.tagline');
    txt(ctx, tag, W / 2, ty + 28 * S, { size: fitSize(ctx, tag, W - 30, 16 * S), align: 'center', color: '#e8e8f4' });
    const pk = t('games.shooter.pickHero'); txt(ctx, pk, W / 2, ty + 62 * S, { size: 14 * S, align: 'center', color: HUD.gold });
    // scheda dell'eroe scelto (nome grande, dote) e tre pallini: leggibile anche a 390 px
    const cw = Math.min(W - 28, 420 * S); const cx = (W - cw) / 2; const cy = ty + 72 * S; const ch = 74 * S;
    ctx.fillStyle = 'rgba(12,14,34,.9)'; rr(ctx, cx, cy, cw, ch, 14); ctx.fill(); ctx.strokeStyle = this.hero.jersey; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = this.hero.jersey; rr(ctx, cx + 10, cy + 12 * S, 8, ch - 24 * S, 3); ctx.fill();
    const nm = t(`games.shooter.hero.${this.hero.id}.name`);
    txt(ctx, nm, cx + 28, cy + 32 * S, { size: fitSize(ctx, nm, cw - 44, 26 * S), color: '#ffffff', italic: true });
    const perk = t(`games.shooter.hero.${this.hero.id}.perk`);
    txt(ctx, perk, cx + 28, cy + 58 * S, { size: fitSize(ctx, perk, cw - 44, 16 * S), color: this.hero.jersey });
    HEROES.forEach((h, i) => { const on = i === this.heroIndex; ctx.beginPath(); ctx.arc(W / 2 + (i - 1) * 22 * S, cy + ch + 14 * S, (on ? 7 : 5) * S, 0, Math.PI * 2); ctx.fillStyle = on ? h.jersey : 'rgba(255,255,255,.35)'; ctx.fill(); });
    // regole in basso
    const rules = [1, 2, 3, 4].map((i) => t(`games.shooter.rule${i}`));
    const rmw = Math.min(W - 28, 560); const rtop = cy + ch + 40 * S; const rbot = H - 70 - 20 * S;
    let fs = 14 * S;
    const need = () => rules.reduce((a, r) => a + wrapLines(ctx, r, rmw, fs, { font: 'text' }).length, 0) * 1.28 * fs + rules.length * 5;
    while (fs > 10 && need() > rbot - rtop) fs -= 0.5;
    let ry = rtop; for (const l of rules) ry = paragraph(ctx, l, W / 2, ry, { size: fs, maxW: rmw, lineK: 1.28, color: '#e8e8f4' }).bottom + 5;
    txt(ctx, t('games.common.best', { n: this.best }), W / 2, Math.min(ry + 8, H - 56), { size: 13 * S, align: 'center', color: '#b8b8cc', font: 'text' });
    const keys = t('games.shooter.heroKeys');
    txt(ctx, keys, W / 2, H - 28, { size: fitSize(ctx, keys, W - 30, 22 * S), align: 'center', color: HUD.lime });
    this.hooks.progress?.drawToasts(ctx, W, dt);
  }

  drawIntro(ctx, W, H, S) {
    const k = this.stateT; const a = clamp(Math.min(k * 3, (3.4 - k) * 3), 0, 1);
    ctx.globalAlpha = a;
    const y = H * 0.4; const bandH = 108 * S;
    ctx.fillStyle = 'rgba(8,10,26,.72)'; ctx.fillRect(0, y - bandH / 2, W, bandH);
    ctx.fillStyle = HUD.lime; ctx.fillRect(0, y - bandH / 2, W, 3); ctx.fillRect(0, y + bandH / 2 - 3, W, 3);
    const m = t('games.shooter.mission', { n: this.level + 1 }); txt(ctx, m, W / 2, y - 22 * S, { size: 18 * S, align: 'center', color: HUD.gold });
    const nm = t(this.L.name); txt(ctx, nm, W / 2, y + 18 * S, { size: fitSize(ctx, nm, W - 30, 44 * S), align: 'center', color: '#ffffff', italic: true });
    const sub = t(`games.shooter.levelSub${this.level + 1}`); txt(ctx, sub, W / 2, y + 42 * S, { size: fitSize(ctx, sub, W - 30, 15 * S), align: 'center', color: '#dfe3f0' });
    ctx.globalAlpha = 1;
  }

  drawCard(ctx, W, H, S, title, color, lines, keys) {
    const cw = Math.min(W - 24, 460 * S); const lh = 22 * S; const fz = 16 * S;
    const nl = lines.reduce((a, l) => a + wrapLines(ctx, l, cw - 28, fz, { font: 'text', maxLines: 2 }).length, 0);
    const ch = 70 * S + nl * lh + (keys ? 40 * S : 0);
    const x = (W - cw) / 2; const y = Math.max(H * 0.36 - ch / 2, 70);
    ctx.fillStyle = 'rgba(8,10,26,.86)'; rr(ctx, x, y, cw, ch, 16); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
    txt(ctx, title, W / 2, y + 44 * S, { size: fitSize(ctx, title, cw - 24, 34 * S), align: 'center', color, italic: true });
    let ly = y + 72 * S; for (const l of lines) ly = paragraph(ctx, l, W / 2, ly, { size: fz, maxW: cw - 28, lineK: lh / fz, maxLines: 2, color: '#e8e8f4' }).bottom;
    if (keys) txt(ctx, keys, W / 2, y + ch - 16 * S, { size: fitSize(ctx, keys, cw - 24, 19 * S), align: 'center', color: HUD.lime });
  }

  drawClear(ctx, W, H, S) {
    if (this.stateT < 0.6) return;
    const s = this.levelStats; const v = this.state === 'victory';
    const lines = [t('games.shooter.clearStats', { kills: s.kills, rescued: s.rescued }), t('games.shooter.clearPoints', { n: Math.round(this.score - s.start) })];
    if (this.clearBonus) lines.push(t('games.shooter.noHit'));
    if (v) { lines.unshift(t('games.shooter.victorySub')); lines.push(`${t('games.shooter.points', { n: Math.round(this.score) })}${this.newBest ? t('games.shooter.newBest') : ''}`); }
    this.drawCard(ctx, W, H, S, v ? t('games.shooter.victory') : t('games.shooter.clear'), HUD.lime, lines, this.stateT > 2.5 ? (v ? t('games.shooter.menuKeys') : t('games.shooter.nextKeys')) : null);
  }

  drawOver(ctx, W, H, S) {
    if (this.stateT < 0.8) return;
    ctx.fillStyle = `rgba(8,4,14,${Math.min(0.55, (this.stateT - 0.8) * 0.8)})`; ctx.fillRect(0, 0, W, H);
    const lines = [`${t('games.shooter.points', { n: Math.round(this.score) })}${this.newBest ? t('games.shooter.newBest') : ''}`, t('games.shooter.failStats', { best: this.best, rescued: this.rescued })];
    this.drawCard(ctx, W, H, S, t('games.shooter.failed'), '#ff4d6d', lines, this.stateT > 1.6 ? t('games.shooter.retryKeys') : null);
  }

  loop(now) {
    if (!this.active) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.update(dt);
    if (this.stage && this.player) this.stage.render();
    if (this.stage) this.drawHud(dt);
    requestAnimationFrame(this.loop);
  }
}

// altezza del centro di un nemico (per mirare e colpire)
function centerY(e) { return e.type === 'drone' ? e.y + 0.6 : e.def.obstacle ? 0.6 : e.def.h * 0.55; }

// corpo che fa stare il testo in una larghezza (stesso carattere di txt)
function fitSize(ctx, text, maxW, size) {
  const w = measure(ctx, text, size);
  return w > maxW ? Math.max(9, Math.floor(size * maxW / w)) : size;
}
function rr(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q); ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
}
