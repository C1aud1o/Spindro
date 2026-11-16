// PEDAL STRIKE 3D — sparatutto in corsa, il gioco di punta.
// La Resistenza a pedali contro l'Impero dei Motori: le macchine hanno vietato le bici, tre ciclisti ribelli
// attraversano il porto (giorno), il passo di montagna (tramonto) e Motor City (notte al neon).
// La partita è un ALLENAMENTO (docs/giochi-design.md): 5, 10 o 20 minuti con avvio facile, ondate di sforzo e recupero
// in % della FTP, scatti, mini-boss a metà, boss finale con fasi legate allo sforzo e 30 s di defaticamento (strike-plan.js).
// Comandi: + / − cambiano corsia (+ a destra, − a sinistra); si spara da soli e i watt decidono la cadenza dei colpi,
// lo scatto carica e scatena l'OVERDRIVE. Gli scudi dei robot cedono solo sopra la potenza richiesta.
// Camera alle spalle, di tre quarti: il ciclista è grande in basso, la strada e i nemici davanti.
import { THREE, Stage, Pool, Effects, tracer, fxTexture, Cyclist, makeKit, loadCyclistTemplate, toonMaterial, prepareModel, Quality, Shake, TimeScale, WindLines, Confetti } from './kit3d.js';
import { loadGLTF } from './kit/loader.js';
import { loadMeshyTemplate, MESHY_FAN_URL, BIKE } from './kit/cyclist.js';
import { Walker, makeEnemyKit } from './kit/walkers.js';
import { World, LEVELS, LANES } from './strike-world.js';
import { buildWorkout, blocksFromWorkout, Coach, starsFor, isHard, DURATIONS, TOL } from './strike-plan.js';
import { WorkoutClock, BandMeter, workoutStars, workoutPlan } from './kit/workout-plan.js';
import { clamp, lerp } from './engine.js';
import { txt, HUD, hudView, measure, paragraph, wrapLines, MessageQueue, guardTrainer, trainerLostBanner } from './kit/hud.js';
import { t, fmtDec } from '../i18n.js';
import { SONGS } from './audio.js';
import { GameMenu, ResultsView } from './kit/menu.js';
import { makeRandom } from './kit/rng.js';

const M = 'assets/3d/meshy';
const RIDER_S = 1.3;
const SPAWN = 46; // i nemici entrano a questa distanza davanti (nella foschia), mai vicino alla camera
const RANGE = 25; // distanza di tiro: si combatte da vicino, i nemici si vedono grandi

export const HEROES = [
  { id: 'rocco', jersey: '#ff7a1a', hp: 6, rate: 1, od: 1, stars: 0 },
  { id: 'vale', jersey: '#ff4d9d', hp: 5, rate: 1.25, od: 1, stars: 3 },
  { id: 'gino', jersey: '#22d3b4', hp: 5, rate: 1, od: 1.35, stars: 6 },
];

// armi: i potenziamenti durano pochi secondi, poi si torna al blaster
const WEAPONS = {
  blaster: { name: 'games.shooter.w.blaster', rate: 3.4, dmg: 1, speed: 46, color: '#fff3a0', sfx: 'shot' },
  rapid: { name: 'games.shooter.w.rapid', rate: 8.5, dmg: 0.75, speed: 52, color: '#ffd166', sfx: 'mg', spread: 0.5 },
  spread: { name: 'games.shooter.w.spread', rate: 2.8, dmg: 1.1, speed: 44, color: '#7dff6a', sfx: 'shot', lanes: true },
  rocket: { name: 'games.shooter.w.rocket', rate: 1.6, dmg: 5, speed: 30, color: '#ff6b35', sfx: 'rocket', splash: 3.4 },
  laser: { name: 'games.shooter.w.laser', rate: 5.5, dmg: 1.7, speed: 95, color: '#4de3ff', sfx: 'laser', pierce: true },
};
const POWERUPS = {
  rapid: { dur: 12, weapon: true }, spread: { dur: 12, weapon: true }, rocket: { dur: 10, weapon: true }, laser: { dur: 12, weapon: true },
  shield: { dur: 8, color: '#4de3ff', name: 'games.shooter.pu.shield' },
  double: { dur: 10, color: '#ffd34d', name: 'games.shooter.pu.double' },
  heart: { dur: 0, color: '#ff4d6d', name: 'games.shooter.plusLife' },
};
const DROPS = ['rapid', 'spread', 'rocket', 'laser', 'shield', 'double', 'rapid', 'laser', 'heart'];

// nemici: ognuno ha un comportamento diverso
//  trooper  a piedi verso di te, spara un colpo annunciato sulla sua corsia
//  sniper   su un disco volante, tiene la distanza e spara da lontano: si schiva cambiando corsia
//  brute    si ferma, la corsia diventa rossa, poi carica
//  shield   scudo di energia: cede solo sopra la potenza richiesta
//  drone    vola davanti e sgancia bombe sul cerchio rosso
//  runner   piccolo e veloce, in gruppo
//  barrier  transenna sulla corsia
const FOES = {
  trooper: { kit: 'robot_trooper', h: 2.7, hp: 3, speed: 1.3, style: 'walk', score: 100, rad: 0.8 },
  sniper: { kit: 'robot_trooper', h: 2.7, hp: 4, score: 150, rad: 0.9, hover: true },
  brute: { kit: 'robot_brute', h: 3.7, hp: 10, speed: 0, style: 'brute', score: 300, rad: 1.1, charges: true },
  shield: { kit: 'robot_trooper', h: 2.7, hp: 4, speed: 1.5, style: 'walk', score: 250, rad: 0.9, shielded: true },
  drone: { model: 'drone', h: 1.2, hp: 2, score: 150, rad: 0.9, fly: 3.4, bombs: true },
  runner: { kit: 'robot_trooper', h: 2.7, hp: 1, speed: 3.2, style: 'run', score: 60, rad: 0.7, size: 0.74 },
  barrier: { hp: 4, score: 50, rad: 1.2, obstacle: true },
};
const BOSSES = {
  mini: { kit: 'robot_brute', h: 5.2, name: 'games.shooter.boss.mini', attacks: ['stomp', 'summon', 'stomp', 'bolts'], kill: 9, hover: true },
  tank: { model: 'boss_tank', h: 5.2, name: 'games.shooter.boss.tank', attacks: ['shells', 'mortar', 'shells', 'summon'], kill: 16 },
  airship: { model: 'boss_airship', h: 4.2, fly: 1.4, name: 'games.shooter.boss.airship', attacks: ['bombs', 'mortar', 'drones', 'bombs'], kill: 16 },
  mech: { kit: 'boss_mech', h: 7, name: 'games.shooter.boss.mech', attacks: ['laser', 'missiles', 'laser', 'summon', 'stomp'], kill: 16 },
};
// gruppi di nemici per ogni tipo di blocco dell'allenamento
const POOLS = {
  warm: ['pair', 'trooper', 'drone', 'pair', 'runners'],
  effort: ['shield', 'squad', 'brute', 'shieldPair', 'sniper', 'mix', 'shield', 'wall'],
  rec: ['sniper', 'drone', 'pair', 'runners', 'snipers', 'mix'],
  sprint: ['swarm', 'swarm'],
  mini: ['runners', 'pair'],
  boss: ['runners', 'pair'],
};
const GAP = { warm: 3.6, effort: 2.9, rec: 3.4, sprint: 2.2, mini: 5.5, boss: 6, cool: 99 };
const GRADE = { warm: 1, effort: 3, rec: 0.5, sprint: 2, mini: 3.5, boss: 4, cool: 0 };

const OD_TIME = 7;
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
  constructor(scene, rnd = Math.random) {
    this.rnd = rnd;
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
      this.bits.push({ x, y, z, vx: (this.rnd() - 0.3) * 9 * power, vy: 3 + this.rnd() * 7 * power, vz: (this.rnd() - 0.5) * 7 * power, r: this.rnd() * 6, vr: (this.rnd() - 0.5) * 16, s: 0.12 + this.rnd() * 0.22 * power, t: 0, life: 1.2 + this.rnd() * 0.8, c: colors[i % colors.length] });
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

// texture dello scudo: esagoni chiari su un velo azzurro
function hexTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(80,200,255,.25)'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(220,250,255,.95)'; g.lineWidth = 3;
  const r = 14; const h = r * Math.sqrt(3);
  for (let y = -h; y < 128 + h; y += h) for (let x = -r * 3, k = 0; x < 128 + r * 3; x += r * 1.5, k++) {
    const cy = y + (k % 2 ? h / 2 : 0); g.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.lineTo(x + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); }
    g.closePath(); g.stroke();
  }
  const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace; return tx;
}

export class Strike3D {
  constructor(hudCanvas, hooks, audio) {
    this.hudCanvas = hudCanvas; this.hooks = guardTrainer(hooks); this.audio = audio;
    this.active = false;
    this.best = JSON.parse(localStorage.getItem('strikeBest5') || '{}');
    this.starsTotal = Number(localStorage.getItem('strikeStars')) || 0;
    // chi giocava già alla versione di prima ha tutti gli eroi
    if (Number(localStorage.getItem('strikeBest3')) > 0) this.starsTotal = Math.max(this.starsTotal, 6);
    this.heroIndex = clamp(Number(localStorage.getItem('strikeHero')) || 0, 0, HEROES.length - 1);
    if (!this.unlocked(this.heroIndex)) this.heroIndex = 0;
    this.minutes = DURATIONS.includes(Number(localStorage.getItem('strikeMin'))) ? Number(localStorage.getItem('strikeMin')) : 5;
    this.diff = clamp(Number(localStorage.getItem('strikeDiff') ?? 1), 0, 2);
    this.worldIx = clamp(Number(localStorage.getItem('strikeWorld')) || 0, 0, LEVELS.length - 1);
    this.seed = null; this.rnd = makeRandom(this.seed); // il caso è nostro: con un seme (prove) la partita si ripete uguale
    this.bestStars = JSON.parse(localStorage.getItem('strikeBestStars') || '{}');
    // menu e risultati comuni a tutti i giochi; durata e livello restano nelle chiavi di sempre (strikeMin, strikeDiff)
    this.menu = new GameMenu({
      id: 'shooter', title: () => t('games.shooter.hud.title'), pitch: () => t('games.shooter.hud.tagline'),
      howto: () => [t('games.shooter.how1'), t('games.shooter.how2'), t('games.shooter.how3')],
      best: (d, l) => { const k = `${DURATIONS[d]}`; return { stars: this.bestStars[k] || 0, text: this.best[k] ? String(this.best[k]) : null }; },
      load: () => ({ durIdx: Math.max(0, DURATIONS.indexOf(this.minutes)), level: this.diff }),
      save: ({ durIdx, level }) => { this.minutes = DURATIONS[durIdx]; this.diff = level; try { localStorage.setItem('strikeMin', this.minutes); localStorage.setItem('strikeDiff', this.diff); } catch { /* niente storage */ } },
      onStart: (d, l) => { this.minutes = DURATIONS[d]; this.diff = l; this.begin(); },
      sfx: (k) => this.audio.sfx(k), ready: () => this.state === 'menu', workout: () => this.hooks.workout?.(),
    });
    this.results = new ResultsView({ onAgain: () => this.begin(), onBack: () => this.hooks.close?.(), sfx: (k) => this.audio.sfx(k) });
    this.loop = this.loop.bind(this);
  }
  unlocked(i) { return this.starsTotal >= HEROES[i].stars; }
  ftp() { return Number(this.hooks.ftp?.()) || 200; }

  // ---------- caricamento ----------
  async start() {
    this.hooks.reset?.();
    this.active = true;
    this.quality = new Quality();
    this.stage = new Stage(this.hudCanvas, { quality: this.quality });
    this.stage.onQuality = (cfg) => this.applyQuality(cfg);
    this.ts = new TimeScale(); this.shakeK = new Shake();
    this.state = 'loading'; this.t = 0; this.stateT = 0; this.msgs = new MessageQueue(); this.pops = []; this.power = 0; this.cadence = 0; this.loadPct = 0;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
    this.audio.playSong(SONGS.menu);
    try {
      const files = { crate: 'assets/3d/blasters/crate-medium.glb', heart: 'assets/3d/pickups/heart.glb', tree_pineTallA: 'assets/3d/nature/tree_pineTallA.glb', tree_pineDefaultA: 'assets/3d/nature/tree_pineDefaultA.glb', rock_largeA: 'assets/3d/nature/rock_largeA.glb' };
      for (const n of ['blaster', 'street_lamp', 'alpine_hut', 'drone', 'boss_tank', 'boss_airship', 'cage', 'harbor_crane', 'neon_tower']) files[n] = `${M}/${n}.glb`;
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
      this.state = 'menu'; this.stateT = 0; this.menu.reset();
      const size = () => ({ W: this.stage.W, H: this.stage.H });
      this.detachMenu = this.menu.attach(this.hudCanvas, size, () => this.state === 'menu');
      this.detachResults = this.results.attach(this.hudCanvas, size, () => this.state === 'results');
    } catch (err) { console.error(err); this.state = 'error'; this.error = err.message; }
  }

  stop() {
    this.active = false; this.detachMenu?.(); this.detachResults?.(); this.audio.stopSong(); this.audio.transpose = 0; this.hooks.setGrade(null);
    this.stage?.dispose(); this.stage = null;
  }

  build() {
    const { scene } = this.stage;
    this.world = new World(scene, this.m, this.quality, () => this.rnd());
    this.blast = new Blast(scene, () => this.rnd());
    this.bulletPool = new Pool(scene, () => tracer(), 120);
    this.boltPool = new Pool(scene, () => { const tr = tracer('#ff3b4d'); tr.shape(1.6, 0.5); return tr; }, 40);
    this.wind = new WindLines(scene, 36);
    this.confetti = new Confetti(scene, 260);
    this.stripeTex = stripeTexture(); this.ringTex = ringTexture(); this.hexTex = hexTexture();
    this.teleGeo = new THREE.PlaneGeometry(1, 1); this.teleGeo.rotateX(-Math.PI / 2);
    this.telePool = new Pool(scene, () => new THREE.Mesh(this.teleGeo, new THREE.MeshBasicMaterial({ map: this.stripeTex.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })), 8);
    for (const m of this.telePool.items) { m.material.map.wrapS = THREE.RepeatWrapping; m.material.map.needsUpdate = true; m.renderOrder = 3; }
    this.markPool = new Pool(scene, () => { const m = new THREE.Mesh(this.teleGeo, new THREE.MeshBasicMaterial({ map: this.ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); m.renderOrder = 3; return m; }, 16);
    // scudi: mezza sfera a esagoni (robot con lo scudo, mini-boss, boss, eroe col potenziamento)
    this.domeGeo = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    this.discGeo = new THREE.CylinderGeometry(0.95, 0.55, 0.28, 18);
    this.discMat = toonMaterial({ color: '#3a3f4a' });
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('light_01'), color: '#4de3ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.aura.scale.setScalar(4.5); scene.add(this.aura);
    this.heroDome = this.makeDome('#4de3ff'); this.heroDome.visible = false; scene.add(this.heroDome);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 10, 1, true).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3b6b', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 8, 1, true).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }));
    this.beam.add(this.beamCore); this.beam.visible = false; scene.add(this.beam);
    this.initGun();
    this.applyQuality(this.quality.cfg);
    this.setupWorld(this.worldIx, true);
  }

  // quanto lontano si vede: il paesaggio si prepara fin dentro la nebbia (gli oggetti nuovi nascono nella foschia);
  // in qualità media e bassa si vede meno lontano (meno oggetti da disegnare)
  setView() {
    if (!this.L || !this.stage.scene.fog) return;
    const far = { high: 165, medium: 135, low: 105 }[this.quality.level] || 135;
    this.world.ahead = far + 5;
    const f = this.stage.scene.fog; f.near = (this.L.night ? 0.2 : 0.26) * far; f.far = this.L.night ? far * 0.85 : far;
  }

  makeDome(color) {
    const m = new THREE.Mesh(this.domeGeo, new THREE.MeshBasicMaterial({ map: this.hexTex, color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    m.renderOrder = 4; return m;
  }

  applyQuality(cfg) {
    if (!this.world) return;
    this.world.applyQuality(cfg);
    this.setView();
    this.player?.setShadows(cfg.shadows);
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
  get hero() { return HEROES[this.heroIndex]; }

  clearActors() {
    const scene = this.stage.scene;
    for (const e of this.foes || []) this.removeFoe(e);
    for (const c of this.cages || []) scene.remove(c.root);
    for (const p of this.pickups || []) scene.remove(p.root);
    for (const w of this.wingmen || []) scene.remove(w.r.root);
    for (const b of this.bullets || []) b.mesh.visible = false;
    for (const b of this.bolts || []) b.mesh.visible = false;
    for (const s of this.strikes || []) for (const m of s.meshes) m.visible = false;
    if (this.boss) this.removeBoss();
    if (this.player) scene.remove(this.player.root);
    this.beam.visible = false;
  }

  // mondo e attori da capo (menu o nuova partita)
  setupWorld(i, menu = false) {
    this.clearActors();
    this.worldIx = i; this.level = i; this.L = LEVELS[i];
    // il paesaggio copre tutta la partita più lunga alla velocità massima
    this.world.setLevel(i, menu ? 0 : (this.blocks?.total || this.minutes * 60) * 10.6 + 500);
    this.setView();
    this.foes = []; this.cages = []; this.pickups = []; this.wingmen = []; this.bullets = []; this.bolts = []; this.strikes = []; this.chain = [];
    this.walkerPool = this.walkerPool || {};
    this.px = 0; this.lane = 1; this.laneZ = LANES[1]; this.tilt = 0;
    this.weapon = 'blaster'; this.weaponT = 0; this.fireT = 0; this.overdrive = 0; this.odMeter = 0; this.invuln = 0; this.puShield = 0; this.puDouble = 0;
    this.player = new Cyclist(this.tpl, makeKit(this.hero.jersey, this.heroIndex), { shadows: this.quality.cfg.shadows });
    this.player.root.scale.setScalar(RIDER_S);
    this.mountGun(this.player, 'blaster');
    this.stage.scene.add(this.player.root);
    this.camInit = false; this.idle = 0;
    if (menu) { this.state = 'menu'; this.stateT = 0; this.menu.reset(); }
  }

  // nuova partita: allenamento, allenatore, punteggi
  newSession() {
    const ftp = this.ftp();
    // allenamento in corso: la partita È l'allenamento (durata, blocchi e watt vengono da lì; il livello non cambia i watt)
    this.wc = new WorkoutClock(this.hooks); const wp = this.wc.begin(ftp); this.wk = wp ? { ...wp } : null; this.band = new BandMeter();
    this.blocks = wp ? blocksFromWorkout(wp) : buildWorkout(this.minutes);
    this.coach = new Coach(ftp, this.diff);
    this.st = wp ? this.wc.el : 0; this.bi = -1; this.block = null; this.blockStat = null;
    this.score = 0; this.kills = 0; this.rescued = 0; this.combo = 0; this.comboT = 0; this.maxCombo = 0; this.kos = 0; this.hitsTaken = 0;
    this.hp = this.hero.hp; this.maxHp = this.hero.hp;
    this.bossDown = false; this.miniDown = false; this.dirT = 0; this.dropT = 12; this.cageT = 20;
    this.ev = []; this.firstSpawn = false; this.ko = 0; this.paused = false; this.stopT = 0;
    this.result = null;
  }
  logEvent(k) { if (this.st == null || this.state === 'menu') return; this.ev.push({ t: this.st, k }); }

  // ---------- comandi ----------
  // gioco: + corsia a destra, − corsia a sinistra (una sola funzione per tutta la partita)
  // menu e risultati: i comandi comuni (kit/menu.js); hold() serve al menu per la pressione lunga di +
  input(dir) {
    this.audio.ensure();
    this.idle = 0; this.manual = true;
    if (this.state === 'menu') { this.menu.input(dir); return; }
    if (this.state === 'intro') { if (dir > 0 && this.stateT > 0.6) this.stateT = 99; return; }
    if (this.state === 'results') { this.results.input(dir); return; }
    if (this.state !== 'play') return;
    this.changeLane(dir > 0 ? -1 : 1);
  }
  hold(dir) { if (this.state === 'menu') this.menu.hold(dir); /* in gioco le corsie sono a scatti: niente pressione continua */ }

  // indice di corsia: 0 = destra (z +), 2 = sinistra (z −)
  changeLane(d) {
    const nl = clamp(this.lane + d, 0, 2);
    if (nl === this.lane) { this.tilt = -d * 0.6; return; }
    this.lane = nl; this.audio.sfx('whoosh'); this.tilt = -d;
  }

  begin() {
    this.rnd = makeRandom(this.seed);
    this.newSession();
    this.setupWorld(this.worldIx);
    this.state = 'intro'; this.stateT = 0;
    this.hooks.runStart?.();
    this.audio.playSong(SONGS[this.L.song] || SONGS.city); this.audio.sfx('go');
    this.logEvent('start');
  }

  // salta a un blocco dell'allenamento (prove automatiche e foto)
  skip(kind) {
    const b = this.blocks.find((x) => x.kind === kind); if (!b) return;
    if (this.state === 'intro') { this.state = 'play'; this.stateT = 0; }
    this.st = b.t0 - 0.01;
  }

  say(text, color = HUD.gold, life = 1.8, big = false, prio = big ? 2 : 1) { this.msgs.say(text, { color, dur: life, big, prio }); }
  pop(text, color, x, y, z, life = 1) { this.pops.push({ text, color, x, y, z, t: life, life }); if (this.pops.length > 5) this.pops.shift(); }
  prog(stat, n = 1, xp = 0) { this.hooks.progress?.event(stat, n, xp); }
  tgW() { return this.coach ? this.coach.target(this.block) : 0; }
  // con un allenamento il rullo è in ERG: «in zona» = segui il bersaglio del passo (in qualunque blocco), così scudi e boss restano giusti per chi segue l'allenamento
  advance(dt) { if (this.wk) this.st = this.wc.tick(dt); else this.st += dt; }
  // potenza "in zona": sopra il 95 % di quella richiesta dal blocco
  inZone() { const tg = this.block && (this.wk || isHard(this.block)) ? this.coach.target(this.block) : 0; return tg > 0 && this.power >= tg * TOL; }
  shieldW() { const b = this.block; if (!b) return 0; if (this.wk) return this.coach.target(b); const k = isHard(b) && b.kind !== 'sprint' ? b : { kind: 'effort', pct: 1 }; return this.coach.target(k); }
  shieldsDown() { return this.power >= this.shieldW() * TOL; }

  // ---------- nemici ----------
  spawnFoe(type, x, lane, extra = {}) {
    const def = FOES[type]; const z = LANES[lane];
    const hpK = 1 + 0.12 * this.diff + (this.coach?.adapt || 0);
    const e = { type, def, x, lane, z, hp: def.hp * hpK, maxHp: 0, dead: false, deadT: 0, flash: 0, t: this.rnd() * 3, born: 0, fireT: 0.6 + this.rnd() * 0.8, tele: 0, size: def.size || 1, extra: [], ...extra };
    e.maxHp = e.hp;
    const scene = this.stage.scene;
    if (def.kit) {
      const kit = this.kits[def.kit];
      const list = (this.walkerPool[def.kit] = this.walkerPool[def.kit] || []);
      let w = list.pop();
      if (!w) { w = new Walker(kit); w.body.material = foeMaterial(kit.tpl, this.L.foe); w.body.castShadow = true; }
      w.body.material.userData.u.foe.value.set(type === 'shield' ? '#3fa9ff' : type === 'sniper' ? '#ffd166' : this.L.foe);
      w.root.visible = true; w.fall = 0; w.lunge = 0; w.hit = 0; w.pivot.rotation.x = 0; w.pivot.position.y = 0; w.inner.scale.setScalar(0.001); w.root.position.set(x, 0, z);
      w.body.castShadow = this.quality.cfg.shadows;
      scene.add(w.root); e.w = w; e.root = w.root; e.mats = [w.body.material];
    } else if (type === 'drone') {
      e.root = rigidModel(this.m.drone, def.h, { face: -Math.PI / 2 - 0.3 }); e.mats = e.root.userData.mats;
      e.y = def.fly + 3; e.root.position.set(x, e.y, z); scene.add(e.root);
    } else if (type === 'barrier') {
      e.root = this.makeBarrier(); e.mats = e.root.userData.mats; e.root.position.set(x, 0, z); scene.add(e.root);
    }
    if (def.hover) { // disco volante sotto i piedi: tiene la distanza senza camminare
      const d = new THREE.Mesh(this.discGeo, this.discMat); d.castShadow = false; scene.add(d);
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('light_01'), color: '#ffb347', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
      g.scale.set(2.4, 1.2, 1); scene.add(g); e.disc = d; e.discGlow = g; e.extra.push(d, g);
    }
    if (def.shielded) { e.dome = this.makeDome('#5cc8ff'); e.dome.scale.set(1.25, 2.1, 1.25); scene.add(e.dome); e.extra.push(e.dome); }
    // entrata: lampo di teletrasporto e crescita in 0,3 s (lontano, nella foschia)
    this.blast.fx.spawn(x, 1.2, z, { tex: 'flash', size: 3.5, life: 0.25, color: type === 'shield' ? '#5cc8ff' : '#ffd9a0' });
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
      let n = 0; for (const g of parts) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3); const nor = new Float32Array(n * 3); const col = new Float32Array(n * 3); let o = 0;
      for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
      const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.barrierGeo = out;
    }
    const mat = flashMaterial({ vertexColors: true });
    const m = new THREE.Mesh(this.barrierGeo, mat); m.castShadow = true;
    const root = new THREE.Group(); root.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('light_01'), color: '#ff3040', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.4); glow.position.set(0, 1.15, 0.7); root.add(glow); root.userData.glow = glow;
    root.userData.mats = [mat];
    return root;
  }

  removeFoe(e) {
    if (e.w) { e.w.root.visible = false; this.stage.scene.remove(e.w.root); this.walkerPool[e.def.kit].push(e.w); e.w = null; }
    else if (e.root) this.stage.scene.remove(e.root);
    for (const o of e.extra || []) { this.stage.scene.remove(o); o.material?.dispose?.(); }
    e.extra = [];
    if (e.teleMesh) { e.teleMesh.visible = false; e.teleMesh = null; }
  }

  // un gruppo di nemici davanti, nella foschia
  spawnPattern(kind) {
    const x = this.px + SPAWN; const L = Math.floor(this.rnd() * 3); const o = (k) => (L + k) % 3;
    switch (kind) {
      case 'trooper': this.spawnFoe('trooper', x, L); break;
      case 'pair': this.spawnFoe('trooper', x, L); this.spawnFoe('trooper', x + 4, o(1)); break;
      case 'squad': for (let k = 0; k < 3; k++) this.spawnFoe('trooper', x + k * 2.5, k); this.spawnFoe('trooper', x + 8, L); break;
      case 'brute': this.spawnFoe('brute', x + 2, L); this.spawnFoe('trooper', x, o(1)); break;
      case 'drone': this.spawnFoe('drone', x - 6, L); break;
      case 'sniper': this.spawnFoe('sniper', x, L); break;
      case 'snipers': this.spawnFoe('sniper', x, L); this.spawnFoe('sniper', x + 5, o(2)); break;
      case 'shield': this.spawnFoe('shield', x, L); this.spawnFoe('trooper', x + 3, o(1)); break;
      case 'shieldPair': this.spawnFoe('shield', x, L); this.spawnFoe('shield', x + 3, o(2)); break;
      case 'wall': this.spawnFoe('barrier', x, L); this.spawnFoe('barrier', x + 0.2, o(1)); this.spawnFoe('shield', x + 5, o(2)); break;
      case 'mix': this.spawnFoe('trooper', x, L); this.spawnFoe('drone', x - 4, o(1)); this.spawnFoe('sniper', x + 6, o(2)); break;
      case 'runners': for (let k = 0; k < 4; k++) this.spawnFoe('runner', x + k * 1.8, (L + k) % 3); break;
      case 'swarm': for (let k = 0; k < 7; k++) this.spawnFoe('runner', x + k * 1.5, k % 3); break;
      default: break;
    }
    this.logEvent('spawn');
  }

  // regia: a ogni blocco il suo tipo di nemici, mai più di qualche secondo senza niente da fare
  director(dt) {
    const b = this.block; if (!b || b.kind === 'cool') return;
    const alive = this.foes.filter((e) => !e.dead && e.x > this.px).length;
    this.dirT -= dt;
    const bossy = (b.kind === 'mini' || b.kind === 'boss') && this.boss && !this.boss.dead;
    const max = bossy ? 4 : b.kind === 'sprint' ? 14 : b.kind === 'effort' ? 7 : 6;
    if ((this.dirT <= 0 || alive === 0) && alive < max) {
      const pool = POOLS[b.kind] || POOLS.rec;
      this.spawnPattern(pool[Math.floor(this.rnd() * pool.length)]);
      this.dirT = GAP[b.kind] * (0.85 + this.rnd() * 0.3) * (1 - 0.08 * this.diff);
    }
    // gabbie nei recuperi (+ compagno), casse quando non ne cade una da un po'
    this.cageT -= dt;
    if (this.cageT <= 0 && (b.kind === 'rec' || b.kind === 'warm')) { this.spawnCage(this.px + SPAWN + 4, Math.floor(this.rnd() * 3)); this.cageT = 32 + this.rnd() * 12; }
    this.dropT -= dt;
    if (this.dropT < -6) { this.spawnPickup(DROPS[Math.floor(this.rnd() * DROPS.length)], this.px + SPAWN, Math.floor(this.rnd() * 3)); this.dropT = 16; }
  }

  // ---------- prigionieri e potenziamenti ----------
  spawnCage(x, lane) {
    const root = new THREE.Group(); const z = LANES[lane];
    const cage = rigidModel(this.m.cage, 2.6, { face: 0.3 }); root.add(cage);
    const pr = new Cyclist(this.allyTpl, makeKit(['#4de3ff', '#ffd166', '#7dff6a', '#c77dff', '#ff922b'][this.rescued % 5], this.rescued + 3), { shadows: false });
    pr.standUp(false); pr.root.scale.setScalar(0.95); pr.root.rotation.y = -0.6; pr.pose(0.01, 0, 0, { wave: true });
    root.add(pr.root);
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('light_01'), color: '#7dff6a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    beacon.scale.setScalar(3.4); beacon.position.y = 1.4; root.add(beacon);
    root.position.set(x, 0, z); root.scale.setScalar(0.001); this.stage.scene.add(root);
    this.cages.push({ root, cage, pr, beacon, x, lane, z, open: false, t: 0 });
    this.logEvent('cage');
  }

  spawnPickup(kind, x, lane) {
    const root = new THREE.Group(); const z = LANES[lane];
    const P = POWERUPS[kind]; const col = P.weapon ? WEAPONS[kind].color : P.color;
    const model = kind === 'heart' ? rigidModel(this.m.heart, 1.0) : rigidModel(this.m.crate, 1.0);
    model.position.y = 0.6; root.add(model);
    if (kind !== 'heart') model.userData.mats.forEach((m) => m.userData.u.tint.value.set(col).lerp(new THREE.Color('#ffffff'), 0.45));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('light_01'), color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
    glow.scale.setScalar(3); glow.position.y = 1.1; root.add(glow);
    const ring = new THREE.Mesh(this.teleGeo, new THREE.MeshBasicMaterial({ map: fxTexture('circle_05'), color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.scale.setScalar(2.2); ring.position.y = 0.05; root.add(ring);
    root.position.set(x, 0, z); this.stage.scene.add(root);
    root.scale.setScalar(0.001);
    this.pickups.push({ root, model, kind, x, lane, z, t: this.rnd() * 3, col, y0: 0, born: 0 });
  }

  freeCage(c) {
    c.open = true; c.t = 0;
    const pts = 500 * this.mulPts();
    this.rescued++; this.score += pts;
    this.prog('rescued', 1, 20);
    this.blast.chunks(c.x, 1.3, c.z, 18, ['#5b5f66', '#8a8f99', '#3a3d44'], 1.1);
    this.blast.fx.spawn(c.x, 1.2, c.z, { tex: 'green', size: 5, life: 0.6, grow: 1 });
    this.blast.ring(c.x, c.z, 6, '#7dff6a', 0.6);
    c.cage.visible = false; c.beacon.visible = false;
    c.pr.standUp(true);
    this.audio.sfx('rescue'); this.shakeK.add(0.15);
    this.say(t('games.shooter.freed'), '#7dff6a', 1.8, true);
    this.pop(`+${pts}`, '#7dff6a', c.x, 2.8, c.z, 1.2);
    this.logEvent('rescue');
    if (this.wingmen.length < 2) c.join = 0.7;
  }

  addWingman(c) {
    if (!this.player || this.wingmen.length >= 2) return;
    const r = new Cyclist(this.allyTpl, c.pr.kit, { shadows: false });
    r.root.scale.setScalar(RIDER_S * 0.95);
    this.mountGun(r, 'blaster');
    this.stage.scene.add(r.root);
    const w = { r, slot: this.wingmen.length ? 6 : 3.5, x: c.x, z: c.z, laneOff: this.wingmen.length ? 1 : -1, t: 0, life: 30, fireT: 0.5 };
    this.wingmen.push(w);
    this.say(t('games.shooter.wingman'), '#4de3ff', 1.6);
    if (c.root.parent) this.stage.scene.remove(c.root);
    c.gone = true;
  }

  takePickup(p) {
    const P = POWERUPS[p.kind];
    this.blast.fx.spawn(p.x, 1, p.z, { tex: 'spark', size: 3, life: 0.4, color: p.col });
    this.blast.ring(p.x, p.z, 5, p.col, 0.5); this.ts.hitStop(0.05); this.audio.sfx('pickup'); this.shakeK.add(0.12);
    if (p.kind === 'heart') { this.hp = Math.min(this.maxHp, this.hp + 1); this.say(t('games.shooter.plusLife'), '#ff4d6d', 1.5); }
    else if (P.weapon) { this.setWeapon(p.kind, P.dur); this.say(t(WEAPONS[p.kind].name), WEAPONS[p.kind].color, 1.6, true); }
    else if (p.kind === 'shield') { this.puShield = P.dur; this.say(t(P.name), P.color, 1.6, true); }
    else if (p.kind === 'double') { this.puDouble = P.dur; this.say(t(P.name), P.color, 1.6, true); }
    this.logEvent('pickup');
  }
  mulPts() { return (1 + 0.25 * this.diff) * (this.puDouble > 0 ? 2 : 1); }

  // ---------- aggiornamento ----------
  update(realDt) {
    this.t += realDt;
    const connected = this.hooks.connected(); const st = this.hooks.stats();
    const ftp = this.coach?.ftp || this.ftp();
    // demo senza rullo: 0,8 × FTP, poi segue gli sforzi e fa gli scatti quando il gioco li chiede (si vede tutto il gioco)
    const wantSprint = this.block?.kind === 'sprint' || (this.boss?.phase === 3 && !this.boss.dead);
    const demoSprint = !connected && wantSprint && (this.st % 14) < 9;
    const demoHard = this.block && isHard(this.block) && this.coach ? this.coach.target(this.block) * 1.03 : 0;
    this.power = connected ? st.power || 0 : this.wk && this.block ? this.coach.target(this.block) : demoSprint ? ftp * 1.4 : Math.max(demoHard, ftp * (0.8 + Math.sin(this.t * 0.7) * 0.05));
    this.cadence = connected ? st.cadence || 0 : demoSprint ? 105 : 86;
    const kmh = connected ? this.hooks.speedKmh() : demoSprint ? 38 : 29;
    if (this.audio.song) this.audio.setTempo(this.audio.song.bpm * clamp((this.cadence || 85) / 88, 0.85, 1.25));
    this.msgs.update(realDt);
    for (const p of this.pops) p.t -= realDt; this.pops = this.pops.filter((p) => p.t > 0);
    this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - realDt); this.whiteFlash = Math.max(0, (this.whiteFlash || 0) - realDt);
    this.fovKick = Math.max(0, (this.fovKick || 0) - realDt * 14);
    if (this.state === 'loading' || this.state === 'error') return;
    // chi smette di pedalare va in pausa (non perde): riparte da solo quando ricomincia
    if (connected && (this.state === 'play' || this.state === 'intro')) {
      if (this.power < 15 && this.cadence < 10) this.stopT += realDt; else this.stopT = 0;
      if (!this.paused && this.stopT > 3) { this.paused = true; if (!this.wk) { this.hooks.setGrade(0); this.sentGrade = 0; } }
      if (this.paused && (this.power > 40 || this.cadence > 30)) { this.paused = false; this.stopT = 0; this.say(t('games.shooter.resume'), HUD.lime, 1.2); }
      if (this.paused) { this.animate(0); return; }
    }
    const dt = this.ts.step(realDt);
    this.stateT += realDt;
    this.shakeK.update(realDt);
    this.blast.update(dt);
    this.confetti.update(dt);
    this.speed = clamp(2.2 + (kmh / 3.6) * 0.48, 3.2, 10.5);
    if (this.state === 'menu') { this.menu.update(realDt, { connected, power: st.power || 0 }); this.px += dt * 3; this.animate(dt); return; }
    // sprint: soglia dello scatto in % della FTP (135 %, scalata dal livello)
    this.sprintW = this.coach ? this.coach.target({ kind: 'sprint', pct: 1.35 }) : Math.round(ftp * 1.35);
    this.sprinting = this.wk ? this.block?.kind === 'sprint' && this.inZone() : this.power >= this.sprintW * TOL;
    if (this.state === 'intro') {
      this.advance(realDt);
      this.px += this.speed * dt; this.animate(dt);
      if (this.stateT > 3.2) { this.state = 'play'; this.stateT = 0; }
      if (this.st > 2.4 && !this.firstSpawn) { this.firstSpawn = true; this.spawnPattern('pair'); this.dirT = 3; }
      return;
    }
    if (this.state === 'cool' || this.state === 'results') {
      this.advance(realDt);
      this.px += this.speed * dt * (this.state === 'results' ? 0.3 : 0.6);
      this.updateFoes(dt); this.updateBullets(dt); this.updateBolts(dt); this.updateWingmen(dt); this.animate(dt);
      this.updateResults(realDt);
      if (this.state === 'results') this.results.update(realDt);
      return;
    }
    if (this.state !== 'play') return;
    this.advance(realDt);
    if (this.wk && this.wc.ended) { this.bi = this.blocks.length - 1; this.block = this.blocks[this.bi]; this.startCool(); return; } // l'allenamento è finito (anche senza defaticamento)
    this.updateBlock(realDt);
    if (this.state !== 'play') return;
    this.px += this.speed * dt;
    this.idle += realDt;
    if ((!connected && this.idle > 5) || this.auto) this.autopilot();
    const zT = LANES[this.lane];
    this.laneZ += (zT - this.laneZ) * Math.min(1, dt * 9);
    this.tilt *= Math.max(0, 1 - dt * 5);
    this.invuln = Math.max(0, this.invuln - dt);
    this.puShield = Math.max(0, this.puShield - dt); this.puDouble = Math.max(0, this.puDouble - dt);
    if (this.weaponT > 0) { this.weaponT -= dt; if (this.weaponT <= 0) { this.setWeapon('blaster'); this.say(t('games.shooter.ammoOut'), HUD.white, 1.1); } }
    this.comboT -= dt; if (this.comboT <= 0 && this.combo > 0) this.combo = 0;
    if (this.ko > 0) { this.ko -= realDt; if (this.ko <= 0) { this.hp = this.maxHp; this.invuln = 3; this.say(t('games.shooter.back'), HUD.lime, 1.4); } }
    // overdrive: lo scatto lo carica, quando è pieno parte da solo
    if (this.overdrive > 0) {
      this.overdrive -= dt;
      if (this.overdrive <= 0) { this.audio.transpose = 0; this.say(t('games.shooter.odOver'), HUD.white, 1.2); }
    } else {
      const k = this.boss?.phase === 3 ? 1.6 : 1;
      // lo scatto carica l'overdrive; con un allenamento (watt decisi da lui) lo carica anche, più piano, tenere il bersaglio negli sforzi
      const rate = this.wk ? (this.sprinting ? 1 / 3.6 : this.inZone() && isHard(this.block) ? 1 / 40 : 0) : (this.sprinting ? 1 / 3.6 : 0);
      this.charging = rate > 0;
      this.odMeter = clamp(this.odMeter + dt * rate * this.hero.od * k, 0, 1);
      if (this.odMeter >= 1) this.startOverdrive();
    }
    this.director(dt);
    this.updateChain(realDt);
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

  // ---------- allenamento: blocchi, bersagli, esiti ----------
  updateBlock(dt) {
    let i = this.bi;
    while (i + 1 < this.blocks.length && this.st >= this.blocks[i + 1].t0) i++;
    if (i !== this.bi) {
      if (this.block) this.endBlock(this.block);
      this.bi = i; this.block = this.blocks[i];
      if (this.block.kind === 'cool') { this.startCool(); return; }
      this.startBlock(this.block);
    }
    const b = this.block; const S = this.blockStat;
    if (this.wk) this.band.add(dt, this.power, this.tgW(), this.st - b.stepStart);
    if (S) { S.sum += this.power * dt; S.time += dt; if (this.power >= this.tgW() * (b.kind === 'sprint' ? TOL : TOL)) S.zone += dt; }
    // pendenza al rullo: facile nei recuperi, più dura negli sforzi
    const g = GRADE[b.kind] ?? 1;
    if (!this.wk && g !== this.sentGrade) { this.sentGrade = g; this.hooks.setGrade(g); }
    // conto alla rovescia negli ultimi 3 s prima di uno sforzo
    const next = this.blocks[i + 1]; const left = b.t1 - this.st;
    if (next && isHard(next) && !isHard(b) && left < 3.05 && Math.ceil(left) !== this.beepN) { this.beepN = Math.ceil(left); if (this.beepN > 0) { this.audio.sfx('beep'); this.logEvent('count'); } }
  }

  startBlock(b) {
    this.blockStat = isHard(b) ? { sum: 0, time: 0, zone: 0 } : null;
    const tg = this.tgW(); this.beepN = null;
    const key = { warm: 'games.shooter.b.warm', effort: 'games.shooter.b.effort', rec: 'games.shooter.b.rec', sprint: 'games.shooter.b.sprint', mini: 'games.shooter.b.mini', boss: 'games.shooter.b.boss' }[b.kind];
    if (isHard(b)) { this.say(t(key), b.kind === 'sprint' ? HUD.cyan : '#ff9f1c', 2.2, true, 2); this.msgs.say(t('games.shooter.holdW', { w: tg }), { color: HUD.white, dur: 2, prio: 1 }); this.audio.sfx(b.kind === 'sprint' ? 'boost' : 'alarm'); }
    else if (b.kind === 'rec' && this.bi > 1) { this.say(t(key), HUD.lime, 1.8, false, 1); }
    else if (b.kind === 'warm') this.say(t('games.shooter.b.warm'), HUD.lime, 2.2, false, 1);
    if (b.kind === 'mini') this.startBoss('mini');
    if (b.kind === 'boss') this.startBoss(this.L.boss);
    if (b.kind === 'sprint') this.spawnPattern('swarm');
    this.dirT = Math.min(this.dirT, 0.8);
    this.logEvent('block');
  }

  endBlock(b) {
    if (this.boss && !this.boss.dead && (b.kind === 'mini' || b.kind === 'boss')) this.bossFlee();
    const S = this.blockStat; if (!S || !S.time) return;
    const ok = this.coach.finish(b, S.sum / S.time, S.zone / S.time);
    if (b.kind === 'sprint') { if (ok) this.say(t('games.shooter.sprintOk'), HUD.cyan, 1.6, true); return; }
    if (ok) { this.say(t('games.shooter.effortOk'), HUD.lime, 1.8, true, 2); this.audio.sfx('coin'); this.score += 1000 * this.mulPts(); this.pop(`+${1000 * this.mulPts()}`, HUD.lime, this.px + 3, 3.4, this.laneZ, 1.4); }
    else this.say(t('games.shooter.effortMiss'), HUD.gold, 2, false, 1);
    this.logEvent('effortEnd');
  }

  startCool() {
    this.state = 'cool'; this.stateT = 0;
    for (const e of this.foes) if (!e.dead) this.poof(e);
    if (this.boss) { if (!this.boss.dead) this.bossFlee(); else { this.blast.boom(this.boss.x, this.boss.aimY, this.boss.z, 2); this.removeBoss(); } }
    for (const s of this.strikes) for (const m of s.meshes) m.visible = false; this.strikes = []; this.beam.visible = false;
    this.overdrive = 0; this.audio.transpose = 0; this.weapon !== 'blaster' && this.setWeapon('blaster');
    if (!this.wk) { this.hooks.setGrade(0); this.sentGrade = 0; }
    const finished = true;
    const okRate = this.coach.okRate;
    // con un allenamento le stelle sono le stesse di tutti i giochi: tempo entro ±7 % del bersaglio (kit/workout-plan.js)
    const stars = this.wk ? workoutStars(this.band.ratio, finished) : starsFor({ finished, okRate, bossDown: this.bossDown });
    const key = `${this.minutes}`; const prev = this.wk ? Infinity : this.best[key] || 0;
    const newBest = this.score > prev;
    if (newBest) { this.best[key] = Math.round(this.score); localStorage.setItem('strikeBest5', JSON.stringify(this.best)); }
    if (!this.wk && stars > (this.bestStars[key] || 0)) { this.bestStars[key] = stars; localStorage.setItem('strikeBestStars', JSON.stringify(this.bestStars)); }
    const before = this.starsTotal; this.starsTotal += stars; localStorage.setItem('strikeStars', this.starsTotal);
    const unlock = HEROES.find((h) => before < h.stars && this.starsTotal >= h.stars) || null;
    const next = HEROES.find((h) => this.starsTotal < h.stars) || null;
    const ef = this.coach.efforts;
    this.fwT = 1; this.result = { stars, okRate, wk: !!this.wk, band: this.band.ratio, ok: ef.filter((r) => r.ok).length, n: ef.length, newBest, best: this.wk ? 0 : this.best[key], unlock, next, shown: 0, revealT: 1.2 };
    this.audio.playSong(SONGS.menu); this.audio.sfx('win');
    this.confetti.burst(this.px + 4, 4, this.laneZ, 120, 5);
    this.prog('races', 0, 30 + stars * 30);
    this.hooks.runEnd?.({ game: 'shooter', score: Math.round(this.score) });
    this.logEvent('cool');
  }

  // fine partita: le stelle si accendono una alla volta, fuochi d'artificio, poi il riepilogo resta
  updateResults(dt) {
    const R = this.result; if (!R) return;
    R.revealT -= dt;
    if (R.revealT <= 0 && R.shown < 3) { R.shown++; R.revealT = 1.1; if (R.shown <= R.stars) { this.audio.sfx('coin'); this.shakeK.add(0.12); this.firework(); } this.logEvent('star'); }
    if (this.state === 'cool') {
      this.fwT = (this.fwT ?? 1) - dt;
      if (this.fwT <= 0 && R.shown >= 3) { this.fwT = 2.2 + this.rnd() * 0.8; this.firework(); this.logEvent('firework'); }
      if (this.st >= this.blocks.total) { this.state = 'results'; this.stateT = 0; this.results.reset(); this.player.standUp(true); for (const w of this.wingmen) w.r.standUp(true); }
    }
  }

  startOverdrive() {
    this.overdrive = OD_TIME; this.odMeter = 0;
    this.audio.transpose = 2; this.audio.sfx('overdrive'); this.audio.sfx('bigboom');
    this.say(t('games.shooter.overdrive'), HUD.cyan, 2.2, true, 3);
    // il momento più bello: rallentatore, lampo, onda d'urto, tutti i robot vicini saltano in aria a catena
    this.ts.slowmo(0.22, 0.9); this.shakeK.add(0.8); this.whiteFlash = 0.45; this.fovKick = 16;
    this.blast.ring(this.px, this.laneZ, 26, '#4de3ff', 0.9); this.blast.airRing(this.px, 1.4, this.laneZ, 14, '#9eeeff', 0.6);
    this.blast.flashLight(this.px + 2, 2, this.laneZ, '#7fe8ff', 2);
    const near = this.foes.filter((e) => !e.dead && e.x > this.px - 2 && e.x < this.px + RANGE).sort((a, b) => a.x - b.x);
    near.forEach((e, i) => this.chain.push({ t: 0.12 + i * 0.09, e }));
    if (this.boss && this.boss.ready && !this.boss.dead) this.chain.push({ t: 0.3 + near.length * 0.09, boss: true });
    else this.spawnPattern('swarm'); // altri robot da travolgere durante l'overdrive
    this.prog('overdrives', 1, 15);
    this.logEvent('overdrive');
  }
  updateChain(dt) {
    for (const c of this.chain) {
      c.t -= dt; if (c.t > 0 || c.done) continue; c.done = true;
      if (c.fx) { this.blast.boom(c.fx.x, 0.5, c.fx.z, 0.75, { ring: c.fx.ring, colors: ['#3a3f4a', '#ff8a1f', '#ffd166'] }); continue; }
      if (c.bolt) { if (this.boss && !this.boss.dead) this.fireBolt({ x: c.bolt.x, z: LANES[c.bolt.lane], lane: c.bolt.lane, def: {} }); continue; }
      if (c.boss) { const B = this.boss; if (B && !B.dead && B.ready && !B.shieldUp) { this.damageBoss(B.maxHp * 0.12); this.blast.boom(B.x - 1, B.aimY, B.z + 1, 2); } }
      else if (!c.e.dead) { this.killFoe(c.e); this.shakeK.add(0.08); }
    }
    this.chain = this.chain.filter((c) => !c.done);
  }

  // pilota automatico (demo senza rullo, o se non tocchi niente): evita i colpi annunciati, va verso gabbie e casse
  autopilot() {
    if (this.autoT > this.t) return;
    const score = [0, 0, 0];
    for (const s of this.strikes) for (const ln of s.lanes) score[ln] -= 12;
    for (const b of this.bolts) if (b.x > this.px - 1 && b.x < this.px + 18) score[b.lane] -= 9;
    for (const e of this.foes) {
      if (e.dead || e.x < this.px) continue;
      const dx = e.x - this.px;
      if (e.tele > 0 && !e.def.bombs && dx < 30) score[e.lane] -= 9;
      if (e.def.obstacle && dx < 12) score[e.lane] -= 8;
      if (e.charging && dx < 20) score[e.lane] -= 9;
      if (e.def.shielded && !this.shieldsDown() && dx < 8) score[e.lane] -= 6;
      if (dx < 3.5 && !e.def.bombs && !e.def.hover) score[e.lane] -= 5;
    }
    for (const s of this.strikes) if (s.kind === 'mark' && s.x - this.px < 6) score[s.lanes[0]] -= 4;
    for (const c of this.cages) if (!c.open && c.x > this.px && c.x - this.px < 22) score[c.lane] += 7;
    for (const p of this.pickups) if (p.x > this.px && p.x - this.px < 22) score[p.lane] += 5;
    score[1] += 0.5; score[this.lane] += 1;
    let best = this.lane; for (let i = 0; i < 3; i++) if (score[i] > score[best]) best = i;
    if (best !== this.lane) { this.changeLane(Math.sign(best - this.lane)); this.autoT = this.t + 0.3; }
  }

  // ---------- spari dell'eroe e dei compagni ----------
  // i watt decidono la cadenza: in % della FTP (al 100 % ≈ ×1,3; nei recuperi ≈ ×0,8)
  fireRate() {
    const w = WEAPONS[this.weapon]; const ftp = this.coach?.ftp || this.ftp();
    const effortMul = clamp(0.35 + this.power / ftp, 0.5, 1.9);
    return w.rate * this.hero.rate * effortMul * (this.overdrive > 0 ? 1.7 : 1);
  }
  // colpi pieni (più danno, scia più grossa) quando sei in zona durante uno sforzo
  dmgMul() { return (this.inZone() ? 1.5 : 1) * (this.overdrive > 0 ? 2 : 1); }

  target(x, laneZ, range = RANGE) {
    let best = null; let bs = Infinity;
    const down = this.shieldsDown();
    for (const e of this.foes) {
      if (e.dead || e.gone || e.x < x + 0.5 || e.x > x + range || e.born < 0.2) continue;
      if (e.def.obstacle && Math.abs(e.z - laneZ) > 1.2) continue; // le transenne solo se sono sulla tua corsia
      let s = (e.x - x) + Math.abs(e.z - laneZ) * 3.5;
      if (e.def.shielded && !down) s += 40; // con lo scudo su, prima gli altri
      if (e.tele > 0 || e.charging) s -= 6; // chi sta per colpire, per primo
      if (s < bs) { bs = s; best = e; }
    }
    const B = this.boss;
    if (B && !B.dead && B.ready && (!best || bs > 18)) best = B;
    return best;
  }

  updateShooting(dt) {
    if (this.ko > 0) return;
    const w = WEAPONS[this.weapon];
    this.rate = this.fireRate();
    this.fireT -= dt;
    if (this.fireT <= 0) {
      const tg = this.target(this.px, this.laneZ);
      if (!tg) this.fireT = 0.05;
      else {
        this.fireT = 1 / this.rate;
        const from = v3.set(this.px + 0.9, 1.45, this.laneZ);
        if (w.lanes || this.overdrive > 0) {
          for (let k = 0; k < 3; k++) { const tz = LANES[k]; const e = this.target(this.px, tz); this.shoot(from, e && (e.boss || Math.abs(e.z - tz) < 1.3) ? e : null, tz, w, true); }
        } else this.shoot(from, tg, tg.z, w, true);
        this.blast.fx.spawn(this.px + 1.1, 1.45, this.laneZ, { tex: w.splash ? 'fire' : 'muzzle', size: w.splash ? 1.3 : 0.9, life: 0.07, grow: 0.6, color: this.overdrive > 0 ? '#9eeeff' : null });
        this.audio.sfx(w.sfx);
      }
    }
  }

  setWeapon(k, dur = 0) {
    this.weapon = k; this.weaponT = dur; this.weaponDur = dur;
    this.mountGun(this.player, k);
  }

  shoot(from, tg, tz, w, mine) {
    const mesh = this.bulletPool.get();
    const od = this.overdrive > 0 && mine; const full = mine && this.inZone();
    mesh.glow.material.color.set(od ? '#4de3ff' : full ? '#b8ff5a' : w.color);
    if (w.splash) mesh.shape(1.6, 0.5); else if (w.pierce) mesh.shape(5, 0.2); else mesh.shape(full || od ? 2.8 : 2.2, od ? 0.34 : full ? 0.32 : 0.24);
    const tx = tg ? (tg.boss ? tg.x - tg.halfW * 0.4 : tg.x) : from.x + 30; const ty = tg ? (tg.boss ? tg.aimY : centerY(tg)) : 1.4; const tzz = tg ? (tg.boss ? tg.z + (tz - tg.z) * 0.6 : tg.z) : tz;
    const dx = tx - from.x; const dy = ty - from.y; const dz = tzz - from.z; const d = Math.hypot(dx, dy, dz) || 1;
    const spr = w.spread ? (this.rnd() - 0.5) * w.spread : 0;
    const vx = (dx / d) * w.speed; const vy = (dy / d) * w.speed + spr * 2; const vz = (dz / d) * w.speed + spr;
    mesh.position.copy(from);
    mesh.lookAt(from.x + vx, from.y + vy, from.z + vz);
    this.bullets.push({ mesh, x: from.x, y: from.y, z: from.z, vx, vy, vz, life: 1.4, dmg: w.dmg * (mine ? this.dmgMul() : 0.8), splash: w.splash, pierce: w.pierce || od, hits: null, mine });
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
      b.mesh.position.set(b.x, b.y, b.z);
      if (b.y < 0.05) { b.life = 0; this.blast.fx.spawn(b.x, 0.2, b.z, { tex: 'spark', size: 0.6, life: 0.12 }); }
      for (const e of this.foes) {
        if (e.dead || e.gone || (b.hits && b.hits.has(e))) continue;
        const ey = centerY(e);
        if (Math.abs(e.x - b.x) < e.def.rad && Math.abs(e.z - b.z) < 1.0 && Math.abs(ey - b.y) < 1.4 * e.size) { this.hitFoe(e, b); if (!b.pierce) { b.life = 0; break; } (b.hits = b.hits || new Set()).add(e); }
      }
      const B = this.boss;
      if (b.life > 0 && B && !B.dead && B.ready && b.x > B.x - B.halfW && b.y > B.y0 - 0.5 && b.y < B.y0 + B.h) {
        if (!b.hits?.has(B)) { this.hitBoss(b); if (!b.pierce) b.life = 0; else (b.hits = b.hits || new Set()).add(B); }
      }
      if (b.life <= 0) b.mesh.visible = false;
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  hitFoe(e, b) {
    // scudo: rimbalza se la potenza non basta
    if (e.def.shielded && !this.shieldsDown()) {
      this.blast.fx.spawn(b.x - 0.6, b.y, b.z, { tex: 'blue', size: 0.9, life: 0.1, grow: 1 });
      e.domeHit = 1; if (this.rnd() < 0.3) this.audio.sfx('clank');
      return;
    }
    if (b.splash) {
      this.blast.boom(b.x, b.y, b.z, 0.9, { colors: [this.L.foe, '#3a3f4a', '#ffd166'] });
      this.audio.sfx('boom'); this.shakeK.add(0.12);
      for (const o of this.foes) if (!o.dead && Math.hypot(o.x - b.x, o.z - b.z) < b.splash && (!o.def.shielded || this.shieldsDown())) this.damageFoe(o, b.dmg);
      if (this.boss?.ready && Math.abs(this.boss.x - b.x) < b.splash + this.boss.halfW) this.damageBoss(b.dmg * 0.5);
    } else {
      this.damageFoe(e, b.dmg);
      this.blast.fx.spawn(b.x, b.y, b.z, { tex: 'spark', size: 0.75, life: 0.07, grow: 1 });
      for (let q = 0; q < 2; q++) this.blast.fx.spawn(b.x, b.y, b.z, { tex: 'spark', size: 0.25, life: 0.3, vx: -3 + this.rnd() * 6, vy: 2 + this.rnd() * 4, vz: (this.rnd() - 0.5) * 4, grow: 0 });
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
    const big = e.type === 'brute' ? 1.4 : e.type === 'barrier' ? 0.8 : e.type === 'runner' ? 0.7 : 1;
    const y = (e.y || 0) + (e.type === 'barrier' ? 0.6 : 1.2 * e.size);
    this.blast.boom(e.x, y, e.z, big, { colors: e.type === 'barrier' ? ['#d9d6cf', '#e8323c', '#ffffff'] : [this.L.foe, this.L.foeDark, '#c9ced6', '#ffd166'] });
    this.audio.sfx(e.type === 'brute' ? 'bigboom' : 'boom');
    this.shakeK.add(e.type === 'brute' ? 0.35 : 0.12);
    if (e.type === 'brute' || e.type === 'shield') this.ts.hitStop(0.05);
    if (e.disc) { this.blast.boom(e.x, 0.4, e.z, 0.6); e.disc.visible = false; e.discGlow.visible = false; }
    if (e.dome) e.dome.visible = false;
    if (!bonus) return;
    this.kills++;
    this.combo++; this.comboT = 2.6; this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (this.combo >= 3) this.hooks.progress?.setMax('maxCombo', this.combo);
    const pts = Math.round(e.def.score * this.mulPts() * (1 + Math.min(this.combo, 30) * 0.1));
    this.score += pts;
    this.pop(this.combo >= 3 ? `+${pts} ×${this.combo}` : `+${pts}`, this.combo >= 3 ? '#ff9f1c' : '#ffffff', e.x, y + 1.6, e.z, 0.9);
    this.prog('kills', 1, 1);
    // serie di colpi: ogni traguardo dà punti e carica l'overdrive
    if ([5, 10, 15, 20, 30, 40, 50, 75, 100].includes(this.combo)) {
      const bonusPts = this.combo * 100 * this.mulPts(); this.score += bonusPts;
      this.say(t('games.shooter.comboBig', { n: this.combo, p: bonusPts }), '#ff9f1c', 1.4, false, 1);
      this.odMeter = Math.min(1, this.odMeter + 0.08); this.audio.sfx('coin'); this.logEvent('combo');
    }
    // potenziamento che cade dal robot
    if (this.dropT <= 0 && e.type !== 'barrier') { this.spawnPickup(DROPS[Math.floor(this.rnd() * DROPS.length)], e.x + 1, e.lane); this.dropT = 14 + this.rnd() * 8; }
    if (e.type === 'drone') { e.vy = 0; e.spin = 8; }
    this.logEvent('kill');
  }

  // sparisce senza punti (passato oltre, fine partita): sbuffo di fumo, mai un oggetto che resta vicino alla camera
  poof(e) {
    if (e.dead || e.gone) return;
    e.gone = true; e.dead = true; e.deadT = 0;
    if (e.teleMesh) { e.teleMesh.visible = false; e.teleMesh = null; }
    this.blast.fx.spawn(e.x, 1.1 * e.size + (e.y || 0), e.z, { tex: 'smoke', size: 2.4, life: 0.45, grow: 1 });
  }

  // ---------- nemici: movimento, attacchi annunciati ----------
  updateFoes(dt) {
    const px = this.px;
    for (const e of this.foes) {
      e.t += dt; e.born += dt; e.flash = Math.max(0, e.flash - dt * 7);
      setFlash(e.mats, e.flash * 0.8);
      const grow = Math.min(1, e.born / 0.3); const sc = (1 - (1 - grow) ** 3) * e.size;
      if (e.dead) {
        e.deadT += dt;
        if (e.gone) { // sbuffo: si rimpicciolisce in 0,25 s
          const k = Math.max(0, 1 - e.deadT / 0.25);
          if (e.w) e.w.inner.scale.setScalar(this.kits[e.def.kit].scale * sc * k); else if (e.root) e.root.scale.setScalar(Math.max(0.001, k));
          for (const o of e.extra) o.visible = k > 0.05;
          continue;
        }
        if (e.w) { // cade all'indietro, poi si rimpicciolisce in uno sbuffo (mai un corpo che sparisce di colpo)
          e.w.update(dt, e.def.style || 'walk', 0, { dying: true });
          if (e.x - this.px < 4 && e.deadT < 0.9) e.deadT = 0.9; // troppo vicino all'eroe: sbuffo subito, niente bici che attraversa un corpo
          if (e.deadT > 0.9) { if (!e.puffed) { e.puffed = true; this.blast.fx.spawn(e.x - 0.6, 0.6, e.z, { tex: 'smoke', size: 2.6, life: 0.5, grow: 1 }); } e.w.inner.scale.setScalar(this.kits[e.def.kit].scale * e.size * Math.max(0.001, 1 - (e.deadT - 0.9) / 0.45)); }
        }
        else if (e.type === 'drone') { e.vy = (e.vy || 0) - 18 * dt; e.y = Math.max(0.3, e.y + e.vy * dt); e.root.position.y = e.y; e.root.rotation.z += dt * 9; e.root.rotation.x += dt * 5; if (e.y <= 0.31 && !e.landed) { e.landed = true; this.blast.boom(e.x, 0.4, e.z, 0.8); e.root.visible = false; } }
        else if (e.root) e.root.visible = false;
        continue;
      }
      const dx = e.x - px; const live = this.state === 'play';
      let ground = 0; let style = e.def.style || 'walk';
      if (e.type === 'trooper' || e.type === 'shield' || e.type === 'runner') {
        // a piedi verso di te (le gambe si muovono alla stessa velocità del corpo: niente scivolate)
        const v = e.def.speed; e.x -= v * dt; ground = v;
        if (e.type === 'trooper' && live) {
          e.fireT -= dt;
          if (e.fireT <= 0 && !e.shot && dx > 12 && dx < 30 && !e.tele) { e.tele = 0.6; e.w.lungeDur = 0.6; e.w.lunge = 0.6; this.teleLine(e); }
          if (e.tele > 0) { e.tele -= dt; ground = 0; e.x += v * dt; if (e.tele <= 0) { e.tele = 0; e.shot = true; this.fireBolt(e); } }
        }
      } else if (e.type === 'sniper') {
        // sul disco: tiene la distanza e spara da lontano, ogni 2–3 s
        const hold = 19 + (e.lane - 1) * 1.5;
        if (dx > hold) e.x -= 6 * dt; else e.x += this.speed * dt * 0.98 + (hold - dx) * dt * 0.5;
        e.fireT -= dt;
        if (live && e.fireT <= 0 && !e.tele && dx < 32) { e.tele = 0.7; e.w.lungeDur = 0.7; e.w.lunge = 0.7; this.teleLine(e); }
        if (e.tele > 0) { e.tele -= dt; if (e.tele <= 0) { e.tele = 0; this.fireBolt(e); e.shots = (e.shots || 0) + 1; e.fireT = 2.2 + this.rnd() * 1.2 - 0.2 * this.diff; } }
        if (e.shots >= 3 && !e.tele) e.leaving = true;
        if (e.leaving) { e.x += this.speed * dt * 0.8; e.hoverY = (e.hoverY || 0) + dt * 3; if (e.hoverY > 6) this.poof(e); }
        style = 'walk';
      } else if (e.type === 'brute') {
        // si ferma, la corsia si colora (annuncio), poi carica
        if (!e.charging && live && dx < 24) { e.charging = true; e.tele = 0.8; this.teleLine(e, true); this.audio.sfx('alarm'); this.logEvent('tele'); }
        if (e.tele > 0) { e.tele -= dt; if (e.tele <= 0 && e.teleMesh) { e.teleMesh.visible = false; e.teleMesh = null; } }
        else if (e.charging) { e.x -= 9 * dt; ground = 9; }
      } else if (e.type === 'drone') {
        // vola davanti, poi sgancia bombe sul cerchio rosso
        const hover = 15 + Math.sin(e.t * 0.9) * 2;
        if (dx > hover) e.x -= 5 * dt; else e.x += this.speed * dt * 0.98;
        e.y += ((FOES.drone.fly + Math.sin(e.t * 3) * 0.3) - e.y) * Math.min(1, dt * 2);
        e.root.position.y = e.y; e.root.rotation.z = Math.sin(e.t * 2) * 0.15;
        e.fireT -= dt;
        if (live && e.fireT <= 0 && dx < 22) { e.fireT = 3 + this.rnd() * 1.4 - this.diff * 0.3; e.bombs = (e.bombs || 0) + 1; this.mortar([{ lane: this.lane, dx: (this.rnd() - 0.5) * 1.5 }], 1.15, 'bomb', e); }
        e.z += (LANES[this.lane] - e.z) * dt * 0.5;
        if (e.bombs >= 3) { e.x += this.speed * dt * 0.6; e.y += dt * 4; if (e.y > 9) this.poof(e); }
      } else if (e.type === 'barrier') {
        if (e.root.userData.glow) e.root.userData.glow.material.opacity = 0.5 + 0.5 * Math.sin(e.t * 10);
      }
      const hy = e.def.hover ? 0.55 + Math.sin(e.t * 2.4) * 0.12 + (e.hoverY || 0) : 0;
      if (e.w) {
        e.w.update(dt, style, ground);
        e.w.root.position.set(e.x, hy, e.z); e.w.root.rotation.y = -Math.PI / 2 + 0.25;
        e.w.inner.scale.setScalar(this.kits[e.def.kit].scale * sc * (1 + e.flash * 0.06));
      } else if (e.root) { e.root.position.set(e.x, e.y || 0, e.z); if (e.type !== 'drone') e.root.scale.setScalar(Math.max(0.001, sc)); }
      if (e.disc) { e.disc.position.set(e.x, hy - 0.16, e.z); e.discGlow.position.set(e.x, hy - 0.4, e.z); e.discGlow.material.opacity = 0.6 + 0.3 * Math.sin(e.t * 12); }
      if (e.dome) {
        const down = this.shieldsDown(); e.domeHit = Math.max(0, (e.domeHit || 0) - dt * 4);
        e.dome.position.set(e.x - 0.15, 0, e.z); e.dome.scale.set(1.25 * sc, 2.1 * sc, 1.25 * sc);
        e.dome.material.color.set(down ? '#7dff6a' : '#5cc8ff');
        e.dome.material.opacity = down ? 0.1 + 0.08 * Math.sin(e.t * 30) : 0.34 + e.domeHit * 0.45;
        e.dome.material.map.offset.y += dt * 0.2;
      }
      // contatto con l'eroe sulla stessa corsia
      if (live && !e.def.bombs && !e.def.hover && Math.abs(e.x - px) < e.def.rad + 0.5 && Math.abs(e.z - this.laneZ) < 1.1) {
        if (this.overdrive > 0) this.killFoe(e);
        else { this.hurt(e.type === 'brute' ? 2 : 1); this.killFoe(e, false); }
      }
      // passato oltre: sparisce prima di arrivare vicino alla camera
      if (!e.dead && e.x < px - 0.8) this.poof(e);
    }
    this.foes = this.foes.filter((e) => {
      if (e.dead && e.deadT > (e.gone ? 0.3 : e.type === 'drone' ? 2.4 : 1.4)) { this.removeFoe(e); return false; }
      return true;
    });
  }

  // frecce rosse sulla corsia: un colpo in arrivo (si vede mezzo secondo prima)
  teleLine(e, wide = false) {
    const m = this.telePool.get(); m.material.opacity = 0;
    e.teleMesh = m; m.userData.owner = e; m.userData.wide = wide;
    this.logEvent('tele');
  }

  fireBolt(e) {
    if (e.teleMesh) { e.teleMesh.visible = false; e.teleMesh = null; }
    const mesh = this.boltPool.get();
    const y = 1.35 + (e.def.hover ? 0.6 : 0);
    const b = { mesh, x: e.x - 0.8, y, z: e.z, lane: e.lane, v: 17, life: 3 };
    mesh.position.set(b.x, b.y, b.z); mesh.rotation.set(0, -Math.PI / 2, 0); mesh.scale.setScalar(1);
    this.bolts.push(b);
    this.blast.fx.spawn(b.x, b.y, b.z, { tex: 'muzzle', size: 1, life: 0.08, color: '#ff5a6a' });
    this.audio.sfx('laser');
  }

  updateBolts(dt) {
    for (const b of this.bolts) {
      b.x -= b.v * dt; b.y += (1.3 - b.y) * Math.min(1, dt * 2); b.life -= dt; b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.scale.setScalar(clamp((b.x - this.px + 3) / 4, 0.001, 1)); // passato l'eroe si spegne prima di arrivare alla camera
      if (Math.abs(b.x - this.px) < 0.7 && Math.abs(b.z - this.laneZ) < 0.9) {
        if (this.overdrive > 0 || this.puShield > 0) this.blast.fx.spawn(b.x, b.y, b.z, { tex: 'blue', size: 1.5, life: 0.2 });
        else this.hurt(1);
        b.life = 0;
      }
      if (b.x < this.px - 3) b.life = 0;
      if (b.life <= 0) b.mesh.visible = false;
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  // colpi dall'alto: cerchi rossi a terra, poi esplosione
  mortar(list, tele, kind = 'bomb', owner = null) {
    for (const it of list) {
      const m = this.markPool.get(); m.scale.setScalar(2.6);
      this.strikes.push({ kind: 'mark', lanes: [it.lane], x: this.px + this.speed * tele + it.dx, t: 0, tele, meshes: [m], owner, bomb: kind });
    }
    this.logEvent('tele');
  }

  // corsie intere annunciate (boss): frecce rosse che scorrono, poi colpo su tutta la corsia
  laneStrike(lanes, tele, kind) {
    const meshes = lanes.map(() => this.telePool.get());
    this.strikes.push({ kind: 'lane', lanes, t: 0, tele, meshes, effect: kind, dur: kind === 'laser' ? 0.5 : 0.35 });
    this.audio.sfx('alarm');
    this.logEvent('tele');
  }

  updateStrikes(dt) {
    const px = this.px; const B = this.boss;
    for (const e of this.foes) {
      const m = e.teleMesh; if (!m) continue;
      const x0 = px + 0.5; const x1 = e.x - 0.5; const len = Math.max(0.5, x1 - x0);
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
        if (!s.dropped && s.t > s.tele - 0.35) s.dropped = true;
        if (s.t >= s.tele && !s.done) {
          s.done = true; m.visible = false;
          this.blast.boom(x, 0.6, z, 1, { colors: ['#3a3f4a', '#ff8a1f'] }); this.audio.sfx('boom'); this.shakeK.add(0.2);
          if (Math.abs(this.laneZ - z) < 1.1 && Math.abs(px - x) < 1.7) this.hurt(1);
        }
        if (s.dropped && !s.done) this.blast.fx.spawn(x, 9 - (s.t - (s.tele - 0.35)) / 0.35 * 8.5, z, { tex: 'fire', size: 0.8, life: 0.06, grow: 0 });
      } else {
        const x0 = px - 1; const x1 = (B ? B.x - B.halfW * 0.6 : px + 22); const len = Math.max(1, x1 - x0);
        s.meshes.forEach((m, i) => {
          const z = LANES[s.lanes[i]];
          m.position.set((x0 + x1) / 2, 0.06, z); m.scale.set(len, 1, 2.3);
          m.material.map.repeat.set(len / 2.4, 1); m.material.map.offset.x += dt * (2 + s.t * 3);
          m.material.opacity = s.t < s.tele ? 0.5 + 0.5 * Math.sin(this.t * (12 + s.t * 16)) : 0;
        });
        if (s.t >= s.tele && !s.fired) { s.fired = true; this.fireLaneEffect(s, x0, x1); }
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
        for (let x = x0 + 2; x < x1; x += 2.5) this.blast.fx.spawn(x, 0.4, z, { tex: 'fire', size: 1.6, life: 0.4, color: '#ff4d7a' });
      } else {
        // fila di esplosioni dal boss verso l'eroe (in coda, non con setTimeout: rispettano il rallentatore)
        for (let x = x1, k = 0; x > x0 + 1.5; x -= 2.2, k++) this.chain.push({ t: k * 0.03, fx: { x, z, ring: k % 2 === 0 } });
        this.audio.sfx('bigboom');
      }
    }
    if (B) { B.recoil = 1; if (B.w) { B.w.lungeDur = 0.5; B.w.lunge = 0.5; } }
  }

  // ---------- l'eroe colpito ----------
  hurt(n) {
    if (this.god || this.overdrive > 0 || this.puShield > 0 || this.invuln > 0 || this.ko > 0 || this.state !== 'play') return;
    this.hp -= n; this.invuln = 1.4; this.hitsTaken++;
    this.combo = 0;
    this.shakeK.add(0.55); this.ts.hitStop(0.08); this.hurtFlash = 0.3;
    this.audio.sfx('hurt'); if (navigator.vibrate) navigator.vibrate(90);
    this.pop(`−${n} ♥`, '#ff4d6d', this.px, 3, this.laneZ, 1);
    this.blast.fx.spawn(this.px, 1.3, this.laneZ, { tex: 'red', size: 3.5, life: 0.35 });
    this.logEvent('hurt');
    // niente game over: chi finisce i cuori si rialza dopo 2 s (la partita è un allenamento)
    if (this.hp <= 0) { this.hp = 0; this.ko = 2; this.kos++; this.say(t('games.shooter.ko'), '#ff4d6d', 1.8, true, 3); this.ts.slowmo(0.35, 0.8); this.blast.boom(this.px, 1, this.laneZ, 1); }
  }

  // ---------- gabbie e casse ----------
  updateCages(dt) {
    for (const c of this.cages) {
      c.t += dt; if (c.t < 0.4) c.root.scale.setScalar(Math.max(0.001, c.t / 0.4)); else if (c.root.scale.x < 1) c.root.scale.setScalar(1);
      if (!c.open) {
        c.beacon.material.opacity = 0.45 + 0.3 * Math.sin(this.t * 5);
        if (c.x - this.px < RANGE && (this.frameN & 1)) c.pr.pose(dt * 2, 0, 0, { wave: true });
        if (Math.abs(c.x - this.px) < 1.3 && Math.abs(c.z - this.laneZ) < 1.1) this.freeCage(c);
        if (c.x < this.px - 0.8) { c.missed = true; this.blast.fx.spawn(c.x, 1.2, c.z, { tex: 'smoke', size: 3, life: 0.4, grow: 1 }); this.stage.scene.remove(c.root); }
      } else if (!c.gone) {
        c.pr.pose(dt, 0, 0);
        if (c.join != null) { c.join -= dt; if (c.join <= 0) { c.join = null; this.addWingman(c); } }
      }
    }
    this.cages = this.cages.filter((c) => { if (c.missed) return false; if (c.x < this.px - 1 && !c.gone) { c.gone = true; this.stage.scene.remove(c.root); } return !c.gone; });
  }

  updatePickups(dt) {
    for (const p of this.pickups) {
      p.t += dt; p.born += dt; p.root.scale.setScalar(Math.max(0.001, Math.min(1, p.born / 0.3))); p.model.rotation.y += dt * 2; p.model.position.y = 0.6 + Math.sin(p.t * 3) * 0.15;
      if (!p.taken && Math.abs(p.x - this.px) < 1.3 && Math.abs(p.z - this.laneZ) < 1.1) { p.taken = true; this.stage.scene.remove(p.root); this.takePickup(p); }
      if (!p.taken && p.x < this.px - 0.8) { p.taken = true; this.blast.fx.spawn(p.x, 1, p.z, { tex: 'spark', size: 1.6, life: 0.3, color: p.col }); this.stage.scene.remove(p.root); }
    }
    this.pickups = this.pickups.filter((p) => !p.taken);
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
      if (!leaving && w.fireT <= 0 && this.state === 'play') {
        const tg = this.target(w.x, w.z);
        if (tg) { w.fireT = 1 / (w0.rate * 0.7); this.shoot(v3.set(w.x + 0.9, 1.45, w.z), tg, tg.z, w0, false); this.blast.fx.spawn(w.x + 1.1, 1.45, w.z, { tex: 'muzzle', size: 0.8, life: 0.07, grow: 0.6 }); }
        else w.fireT = 0.1;
      }
      w.r.root.position.set(w.x, 0, w.z); w.r.root.rotation.y = Math.PI / 2;
      w.r.pose(dt, this.cadence || 85, 8, { stand: leaving ? 1 : 0 });
    }
    this.wingmen = this.wingmen.filter((w) => { if (w.t > w.life && w.x > this.px + RANGE) { this.stage.scene.remove(w.r.root); return false; } return true; });
  }

  // ---------- mini-boss e boss ----------
  // fasi legate allo sforzo: 1) scudo, cede solo tenendo la potenza richiesta per N secondi; 2) si spara;
  // 3) sotto metà vita (solo il boss finale): SCATTO per il colpo finale (l'overdrive si carica più in fretta)
  startBoss(kind) {
    const def = BOSSES[kind]; const scene = this.stage.scene; const mini = kind === 'mini';
    let root; let w = null; let mats;
    if (def.kit) {
      const kit = this.kits[def.kit]; w = new Walker(kit); w.body.material = foeMaterial(kit.tpl, mini ? '#3fa9ff' : this.L.foe); w.body.castShadow = true;
      root = w.root; mats = [w.body.material];
    } else { root = rigidModel(this.m[def.model], def.h, { face: -Math.PI / 2 }); mats = root.userData.mats; }
    scene.add(root);
    const fit = mini ? def.h / FOES.brute.h : 1;
    const size = def.kit ? new THREE.Vector3(def.h * 0.6, def.h, def.h * 0.5) : root.userData.size;
    const halfW = Math.max(size.x, size.z) * 0.5;
    const ftp = this.coach.ftp; const tg = this.tgW();
    // vita tarata sulla potenza richiesta: a quella potenza, col blaster, il boss cade in `kill` secondi di fuoco
    const dps = WEAPONS.blaster.rate * this.hero.rate * clamp(0.35 + tg / ftp, 0.5, 1.9) * 1.5;
    const B = {
      def, kind, mini, root, w, mats, hp: dps * def.kill, maxHp: 0, x: this.px + SPAWN + 10, z: 0, y0: def.fly || 0, h: def.h, halfW, halfD: 2.2,
      flash: 0, t: 0, atkT: 3, phase: 1, ready: false, dead: false, recoil: 0, fit, boss: true, aimY: (def.fly || 0) + def.h * 0.5,
      shieldUp: true, shieldT: 0, shieldNeed: this.wk ? clamp(Math.floor(this.block.dur * 0.3), 8, 20) : mini ? 10 : this.minutes >= 10 ? 20 : 15,
    };
    B.maxHp = B.hp;
    B.dome = this.makeDome('#5cc8ff'); B.dome.scale.set(halfW * 1.7 + 1, def.h * 0.75 + 1, 3.6); scene.add(B.dome);
    if (def.hover) { B.disc = new THREE.Mesh(this.discGeo, this.discMat); B.disc.scale.set(2.2, 1.4, 2.2); scene.add(B.disc); }
    this.boss = B;
    if (!mini) this.audio.playSong(SONGS.boss);
    this.audio.sfx('alarm');
    this.ts.slowmo(0.5, 1.2);
    this.say(t('games.shooter.bossIncoming', { name: t(def.name) }), '#ff4d6d', 2.6, true, 3);
    this.shakeK.add(0.3);
    this.logEvent('boss');
  }

  removeBoss() {
    const B = this.boss; if (!B) return; const scene = this.stage.scene;
    scene.remove(B.root); if (B.dome) scene.remove(B.dome); if (B.disc) scene.remove(B.disc);
    this.boss = null;
  }

  hitBoss(b) {
    const B = this.boss;
    if (B.shieldUp) { this.blast.fx.spawn(b.x - 1, b.y, b.z, { tex: 'blue', size: 1.1, life: 0.1, grow: 1 }); B.domeHit = 1; if (this.rnd() < 0.25) this.audio.sfx('clank'); return; }
    if (b.splash) { this.blast.boom(b.x, b.y, b.z, 1, { colors: [this.L.foe, '#3a3f4a'] }); this.audio.sfx('boom'); }
    else { this.blast.fx.spawn(b.x, b.y, b.z, { tex: 'spark', size: 0.9, life: 0.08, grow: 1 }); if (this.rnd() < 0.3) this.blast.chunks(b.x, b.y, b.z, 2, [this.L.foeDark, this.L.foe], 0.6); }
    this.damageBoss(b.dmg);
  }

  breakShield(B) {
    B.shieldUp = false; B.dome.visible = false;
    this.say(t('games.shooter.shieldBroken'), HUD.lime, 1.8, true, 3);
    this.ts.slowmo(0.3, 0.7); this.shakeK.add(0.6); this.audio.sfx('bigboom'); this.whiteFlash = 0.25;
    this.blast.airRing(B.x, B.aimY, B.z, 16, '#9eeeff', 0.6); this.blast.chunks(B.x - 1, B.aimY, B.z, 30, ['#9eeeff', '#ffffff', '#4de3ff'], 1.4);
    B.phase = 2; B.atkT = 2;
    this.logEvent('shield');
  }

  damageBoss(n) {
    const B = this.boss; if (!B || B.dead || !B.ready || B.shieldUp) return;
    B.hp -= n; B.flash = Math.max(B.flash, 0.55); this.audio.sfx('hit');
    if (!B.mini && B.phase === 2 && B.hp < B.maxHp / 2 && B.hp > 0) {
      B.phase = 3; B.atkT = 1.6;
      if (this.wk) this.say(t('games.wk.finalPhase'), HUD.cyan, 2.2, true, 3); // i watt li decide l'allenamento: niente scatto da chiedere
      else { this.say(t('games.shooter.finalSprint'), HUD.cyan, 2.2, true, 3); this.msgs.say(t('games.shooter.holdW', { w: this.sprintW }), { color: HUD.white, dur: 2, prio: 1 }); }
      this.ts.slowmo(0.35, 0.7); this.shakeK.add(0.5); this.audio.sfx('alarm');
      this.blast.boom(B.x - B.halfW * 0.5, B.aimY, B.z + 1, 1.6);
      this.logEvent('phase');
    }
    if (B.hp <= 0) this.killBoss();
  }

  killBoss() {
    const B = this.boss; B.dead = true; B.deadT = 0; B.ready = false;
    this.beam.visible = false;
    for (const s of this.strikes) for (const m of s.meshes) m.visible = false; this.strikes = [];
    for (const e of this.foes) if (!e.dead) this.killFoe(e, false);
    for (const b of this.bolts) b.mesh.visible = false; this.bolts = [];
    this.ts.slowmo(0.22, 2.2);
    this.audio.sfx('bigboom');
    const pts = (B.mini ? 3000 : 8000) * this.mulPts(); this.score += pts;
    if (B.mini) this.miniDown = true; else this.bossDown = true;
    this.prog('bosses', 1, B.mini ? 60 : 150);
    this.say(t('games.shooter.bossDown', { name: t(B.def.name) }), HUD.lime, 2.6, true, 3);
    this.pop(`+${pts}`, HUD.lime, B.x, B.aimY + 3, B.z, 2);
    this.logEvent('bossDown');
  }

  // fine del blocco con il boss ancora in piedi: si ritira (niente punizione, solo niente stella)
  bossFlee() {
    const B = this.boss; B.fleeing = true; B.ready = false;
    if (B.dome) B.dome.visible = false;
    for (const s of this.strikes) for (const m of s.meshes) m.visible = false; this.strikes = []; this.beam.visible = false;
    this.say(t('games.shooter.bossFled', { name: t(B.def.name) }), HUD.gold, 2, false, 2);
    this.logEvent('flee');
  }

  updateBoss(dt) {
    const B = this.boss; B.t += dt;
    B.flash = Math.max(0, B.flash - dt * 6); setFlash(B.mats, B.flash * 0.5);
    B.recoil = Math.max(0, B.recoil - dt * 3);
    const homeX = this.px + (B.mini ? 18 : 22 + B.h * 0.6);
    if (B.fleeing) {
      B.x += (this.speed * 2.2) * dt; B.y0 += dt * (B.def.fly || B.def.hover ? 3 : 0);
      if (B.t > 0 && (B.fleeT = (B.fleeT || 0) + dt) > 2.4) { this.blast.fx.spawn(B.x, B.aimY, B.z, { tex: 'smoke', size: 8, life: 0.6, grow: 1 }); this.removeBoss(); return; }
      this.positionBoss(B, dt); return;
    }
    if (B.dead) {
      B.deadT += dt;
      if (B.deadT < 2 && this.rnd() < dt * 14) this.blast.boom(B.x + (this.rnd() - 0.5) * B.halfW * 2, B.y0 + this.rnd() * B.h, B.z + (this.rnd() - 0.5) * 2, 0.9 + this.rnd() * 0.6);
      if (B.deadT > 2 && !B.final) {
        B.final = true;
        this.blast.boom(B.x, B.aimY, B.z, 3.2); this.blast.ring(B.x, B.z, 30, '#ffffff', 0.9); this.blast.airRing(B.x, B.aimY, B.z, 22, '#fff4d0', 0.6);
        this.blast.chunks(B.x, B.aimY, B.z, 60, [this.L.foe, this.L.foeDark, '#c9ced6', '#ffd166'], 1.8);
        this.shakeK.add(1); this.audio.sfx('bomb'); this.whiteFlash = 0.6;
        B.root.visible = false; if (B.disc) B.disc.visible = false;
      }
      if (!B.final) { B.root.position.y = B.y0 * (1 - B.deadT / 2) + Math.sin(B.deadT * 40) * 0.06; B.root.rotation.z = -B.deadT * 0.12; }
      B.x += this.speed * dt * 0.9;
      if (!B.final) this.positionBoss(B, dt);
      if (B.deadT > 3) { this.removeBoss(); if (!this.bossDown || B.mini) this.audio.playSong(SONGS[this.L.song] || SONGS.city); }
      return;
    }
    // ingresso: arriva dal fondo e si piazza davanti, poi tiene il passo
    B.x += (homeX - B.x) * Math.min(1, dt * (B.ready ? 2 : 0.9)) + this.speed * dt;
    // si sposta piano con te: resta al centro della vista (la camera guarda un po' a sinistra della strada)
    B.z += (clamp(this.laneZ - 2.2, -3.2, 1.5) - B.z) * Math.min(1, dt * 0.8);
    if (!B.ready && B.x - homeX < 2) {
      B.ready = true; this.shakeK.add(0.6);
      this.blast.ring(B.x, B.z, 16, '#ffd9a0', 0.7);
      if (B.def.kit) { this.blast.boom(B.x, 0.3, B.z, 1.4); this.audio.sfx('bigboom'); }
      this.msgs.say(t('games.shooter.shieldHint', { w: this.tgW(), s: B.shieldNeed }), { color: HUD.cyan, dur: 2.6, prio: 2, big: true });
    }
    // scudo: si consuma solo tenendo la potenza richiesta
    if (B.ready && B.shieldUp) {
      if (this.inZone()) { B.shieldT += dt; if (Math.floor(B.shieldT) !== Math.floor(B.shieldT - dt)) { this.audio.sfx('beep'); this.logEvent('shieldTick'); } }
      if (B.shieldT >= B.shieldNeed) this.breakShield(B);
    }
    if (B.dome) {
      B.domeHit = Math.max(0, (B.domeHit || 0) - dt * 4); const k = 1 - B.shieldT / B.shieldNeed;
      B.dome.position.set(B.x - 0.5, B.y0 - (B.def.fly ? 1 : 0), B.z);
      B.dome.material.opacity = (0.25 + 0.35 * k + B.domeHit * 0.4) * (this.inZone() ? 0.6 + 0.4 * Math.sin(this.t * 40) : 1);
      B.dome.material.color.set(this.inZone() ? '#9eeeff' : '#5cc8ff'); B.dome.material.map.offset.y += dt * 0.3;
    }
    this.positionBoss(B, dt);
    if (!B.ready) return;
    B.atkT -= dt;
    const busy = this.strikes.some((s) => s.kind === 'lane');
    if (B.atkT <= 0 && !busy) {
      const list = B.def.attacks; const a = list[(B.k = (B.k || 0) + 1) % list.length];
      this.bossAttack(a, B.phase);
      B.atkT = [0, 3.6, 3, 2.4][B.phase] - this.diff * 0.25;
    }
  }

  positionBoss(B, dt) {
    const bob = B.def.fly ? Math.sin(B.t * 1.4) * 0.5 : B.def.hover ? 0.7 + Math.sin(B.t * 2) * 0.15 : B.def.kit ? 0 : Math.abs(Math.sin(B.t * 9)) * 0.05;
    const x = B.x + B.recoil * 0.8;
    if (B.w) {
      // il mech cammina davvero: le gambe vanno alla velocità con cui avanza (niente scivolate)
      // il mech guarda l'eroe e arretra alla sua velocità: passo all'indietro proporzionato alla taglia (niente scivolate)
      B.w.update(dt, B.def.hover ? 'brute' : 'boss', B.def.hover ? 0 : -this.speed * (2.5 / B.h) * (B.dead ? 0 : 1));
      B.w.root.position.set(x, B.y0 + bob, B.z); B.w.root.rotation.y = -Math.PI / 2 + 0.2;
      B.w.inner.scale.setScalar(this.kits[B.def.kit].scale * B.fit * (1 + B.flash * 0.03));
      if (B.disc) B.disc.position.set(x, B.y0 + bob - 0.2, B.z);
    } else {
      B.root.position.set(x, B.y0 + bob, B.z);
      B.root.rotation.z = B.def.fly ? Math.sin(B.t * 0.9) * 0.05 : -B.recoil * 0.06;
    }
  }

  bossAttack(a, phase) {
    const tele = [0, 1.4, 1.2, 1.0][phase];
    const other = () => (this.lane + 1 + Math.floor(this.rnd() * 2)) % 3;
    switch (a) {
      case 'shells': case 'bombs': this.laneStrike(phase >= 2 ? [this.lane, other()] : [this.lane], tele, a); break;
      case 'laser': this.laneStrike(phase >= 3 ? [this.lane, (this.lane + 1) % 3] : [this.lane], tele, 'laser'); break;
      case 'stomp': this.laneStrike([this.lane, other()], tele + 0.2, 'stomp'); break;
      case 'bolts': { const B = this.boss; for (let k = 0; k < 3; k++) this.chain.push({ t: k * 0.35, bolt: { x: B.x - 2, lane: k === 1 ? this.lane : Math.floor(this.rnd() * 3) } }); this.logEvent('tele'); break; }
      case 'mortar': case 'missiles': {
        const n = 1 + phase; const list = [];
        for (let i = 0; i < n; i++) list.push({ lane: i === 0 ? this.lane : Math.floor(this.rnd() * 3), dx: i === 0 ? 0 : -2 + this.rnd() * 7 });
        this.mortar(list, tele + 0.2, 'bomb'); this.audio.sfx('rocket');
        break;
      }
      case 'summon': this.spawnPattern(phase >= 2 ? 'pair' : 'trooper'); break;
      case 'drones': for (let i = 0; i < Math.min(2, phase); i++) this.spawnFoe('drone', this.boss.x - 2 - i * 2, (this.lane + i) % 3); this.logEvent('spawn'); break;
      default: break;
    }
  }

  firework() {
    const x = this.px + 20 + this.rnd() * 30; const y = 10 + this.rnd() * 8; const z = (this.rnd() - 0.5) * 30;
    const col = ['#ff4d9d', '#4de3ff', '#ffd166', '#7dff6a', '#c77dff'][Math.floor(this.rnd() * 5)];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; this.blast.fx.spawn(x, y, z, { tex: 'spark', size: 0.9, life: 1.1, vx: 0, vy: Math.sin(a) * 7, vz: Math.cos(a) * 7, grow: 0, color: col }); }
    this.blast.fx.spawn(x, y, z, { tex: 'flash', size: 6, life: 0.3, color: col });
    this.audio.sfx('boom');
  }

  // ---------- pose, camera ----------
  animate(dt) {
    this.frameN = (this.frameN || 0) + 1;
    const cad = this.cadence || 85; const P = this.player;
    const od = this.overdrive > 0;
    if (P.mode === 'ride') {
      P.root.position.set(this.px, 0, this.laneZ);
      P.root.rotation.set(0, Math.PI / 2 - this.tilt * 0.12, 0);
      P.lean.rotation.z = -this.tilt * 0.14;
      P.pose(dt, this.ko > 0 || this.paused ? 0 : cad, this.paused ? 0 : this.speed, { stand: this.sprinting || od ? 1 : 0 });
    } else { P.root.position.set(this.px, 0, this.laneZ); P.root.rotation.set(0, -0.6, 0); P.pose(dt, 0, 0); }
    P.root.visible = !((this.invuln > 0 || this.ko > 0) && Math.floor((this.invuln + this.ko) * 12) % 2 && this.state === 'play');
    this.aura.position.set(this.px, 1.3, this.laneZ);
    this.aura.material.opacity += ((od ? 0.45 : 0) - this.aura.material.opacity) * Math.min(1, dt * 6);
    this.aura.material.rotation += dt * 2;
    this.heroDome.visible = this.puShield > 0; if (this.puShield > 0) { this.heroDome.position.set(this.px, 0, this.laneZ); this.heroDome.scale.set(1.6, 2.4, 1.6); this.heroDome.material.opacity = this.puShield < 2 ? 0.25 + 0.25 * Math.sin(this.t * 20) : 0.35; this.heroDome.material.map.offset.y += dt * 0.3; }
    if (od && this.rnd() < dt * 18) this.blast.fx.spawn(this.px - 0.8, 0.5 + this.rnd(), this.laneZ + (this.rnd() - 0.5), { tex: 'blue', size: 0.5, life: 0.35, vx: -this.speed * 0.6, grow: -0.5 });
    this.windAnchor = this.windAnchor || new THREE.Object3D();
    this.windAnchor.position.set(this.px + 5, 0, this.laneZ); this.windAnchor.rotation.y = -Math.PI / 2;
    this.wind.update(dt, this.windAnchor, od ? 1 : this.sprinting ? 0.5 : 0);
    this.camera(dt);
    this.world.update(this.px, this.stage.camera, dt);
  }

  // camera alle spalle, di tre quarti: il ciclista resta ancorato in basso a sinistra del centro (≥ 14 % dell'altezza),
  // la strada e i nemici davanti. Col boss la camera sale e si allontana (non si inclina): la testa del boss resta sotto l'HUD.
  camera(dt) {
    const cam = this.stage.camera; const W = this.stage.W; const H = this.stage.H; const a = W / Math.max(1, H);
    const k = clamp((a - 0.55) / (1.6 - 0.55), 0, 1); // 0 = telefono in verticale, 1 = orizzontale
    const menu = this.state === 'menu'; const end = this.state === 'results';
    const B = this.boss;
    this.bossCam = (this.bossCam || 0) + ((B && !B.dead && !B.fleeing ? 1 : 0) - (this.bossCam || 0)) * Math.min(1, dt * 1.2);
    const bh = B ? clamp(B.h + (B.y0 || 0), 4, 10) : 5;
    let fov = lerp(56, 46, k); let D = lerp(8, 9, k); let H0 = lerp(4.6, 3.8, k); let yaw = lerp(1.45, 1.42, k);
    let ax = lerp(-0.3, 0.05, k); let ay = lerp(-0.42, -0.4, k); // dove sta l'eroe sullo schermo (coordinate -1…1)
    D += this.bossCam * 1.6; H0 += this.bossCam * Math.max(0, bh - 3.6) * 0.8; ay -= this.bossCam * 0.16;
    if (this.state === 'intro') { const s = clamp(1 - this.stateT / 3, 0, 1); D *= 1 + s * s * 0.6; H0 *= 1 + s * s * 0.5; }
    if (this.overdrive > 0) fov += 5;
    fov += this.fovKick || 0;
    this.visW = 30; this.visRight = RANGE;
    this.camZ = this.camZ == null || !this.camInit ? this.laneZ : this.camZ + (this.laneZ - this.camZ) * Math.min(1, dt * 5);
    if (menu) { // di fronte all'eroe; sta nella fascia libera tra testi e tasto VIA (verticale) o a destra della colonna dei testi (orizzontale)
      const land = W > H * 1.15; const fv = 40; const tanM = Math.tan(THREE.MathUtils.degToRad(fv / 2));
      let axT; let ayT; let hPx;
      if (land) { const colEnd = 24 + Math.min(W * 0.38, 440 * H / 600) + 30; axT = ((colEnd + W) / 2) / W * 2 - 1; ayT = -0.05; hPx = H * 0.6; }
      else { const top = this.menu.contentBottom || H * 0.5; const bot = this.menu.startTop || H * 0.8; axT = 0; ayT = 1 - (top + bot) / H; hPx = Math.max(60, bot - top) * 0.85; }
      const dist = clamp((2.6 * H / hPx) / 2 / tanM, 5, 18);
      const pos = v3.set(this.px + Math.sin(0.75) * dist, 1.3 + dist * 0.12, this.laneZ + Math.cos(0.75) * dist);
      if (!this.camInit) { this.camBase = pos.clone(); this.camInit = true; }
      this.camBase.lerp(pos, Math.min(1, dt * 4)); this.camBase.x = pos.x;
      cam.position.copy(this.camBase); cam.lookAt(this.px, 1.2, this.laneZ);
      cam.rotateY(-Math.atan(-axT * tanM * a)); cam.rotateX(Math.atan(-ayT * tanM));
      cam.fov += (fv - cam.fov) * Math.min(1, dt * 5); cam.far = 900; cam.updateProjectionMatrix();
      this.shakeK.apply(cam);
      return;
    }
    if (end) { // di fronte all'eroe, più vicino
      const pos = v3.set(this.px + Math.sin(0.75) * lerp(7.5, 7, k), lerp(2.6, 2, k), this.laneZ + Math.cos(0.75) * lerp(7.5, 7, k));
      if (!this.camInit) { this.camBase = pos.clone(); this.camInit = true; }
      this.camBase.lerp(pos, Math.min(1, dt * 4)); this.camBase.x = pos.x;
      cam.position.copy(this.camBase); cam.lookAt(this.px, lerp(2.7, 1.8, k), this.laneZ);
      cam.fov += (lerp(52, 42, k) - cam.fov) * Math.min(1, dt * 5); cam.far = 900; cam.updateProjectionMatrix();
      this.shakeK.apply(cam);
      return;
    }
    const pos = v3.set(this.px - Math.sin(yaw) * D, H0, this.camZ + Math.cos(yaw) * D);
    if (!this.camInit) { this.camBase = pos.clone(); this.camInit = true; cam.fov = fov; }
    this.camBase.lerp(pos, Math.min(1, dt * 4));
    this.camBase.x = pos.x; // in avanti la camera non resta mai indietro (niente strappi)
    cam.position.copy(this.camBase);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 5); cam.far = 900; cam.updateProjectionMatrix();
    // guarda l'eroe, poi ruota quanto basta per metterlo nel punto (ax, ay) dello schermo
    cam.lookAt(this.px, 1.3, this.camZ);
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.rotateY(-Math.atan(-ax * tanV * a)); cam.rotateX(Math.atan(-ay * tanV));
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
    const S = clamp(Math.min(W, H) / 390, 1, 1.35);
    // vignettatura e sfumatura in basso: disegnate una volta in un canvas a mezza risoluzione
    const key = `${W}x${H}${this.L.night}${this.state === 'menu'}`;
    if (this.backKey !== key) {
      this.backKey = key; const c = this.backCanvas || (this.backCanvas = document.createElement('canvas'));
      c.width = Math.ceil(W / 2); c.height = Math.ceil(H / 2); const g = c.getContext('2d'); g.scale(0.5, 0.5);
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, this.L.night ? 'rgba(8,0,20,.5)' : 'rgba(10,10,30,.3)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      const bh = 104 * S;
      const gr = g.createLinearGradient(0, H - bh - 20, 0, H); gr.addColorStop(0, 'rgba(6,8,22,0)'); gr.addColorStop(0.4, 'rgba(6,8,22,.5)'); gr.addColorStop(1, 'rgba(6,8,22,.85)');
      g.fillStyle = gr; g.fillRect(0, H - bh - 20, W, bh + 20);
    }
    ctx.drawImage(this.backCanvas, 0, 0, W, H);
    if (this.overdrive > 0) { const k = Math.min(1, this.overdrive / 0.6); ctx.fillStyle = `rgba(77,227,255,${0.1 * k})`; ctx.fillRect(0, 0, W, H); }
    if (this.state === 'menu') { this.menu.draw(ctx, W, H, { connected: this.hooks.connected() }); this.hooks.progress?.drawToasts(ctx, W, dt); return; }
    if (this.state === 'results') { this.drawResults(ctx, W, H, S); this.hooks.progress?.drawToasts(ctx, W, dt); return; } // il riepilogo sta da solo, senza la grafica di gioco
    const pad = 10; const top = 60;
    // riga in alto: punteggio · tempo e blocco · cuori
    ctx.fillStyle = 'rgba(8,10,26,.62)'; rr(ctx, pad, top, W - 2 * pad, 40 * S, 12); ctx.fill();
    const rowY = top + 29 * S;
    txt(ctx, String(Math.round(this.score)), pad + 10, rowY, { size: 24 * S, color: HUD.white });
    const heartW = 16 * S; const hx0 = W - pad - 8 - this.maxHp * heartW;
    for (let i = 0; i < this.maxHp; i++) txt(ctx, i < this.hp ? '♥' : '♡', hx0 + (i + 0.5) * heartW, rowY - 1, { size: 19 * S, align: 'center', color: i < this.hp ? '#ff4d6d' : '#77789a', stroke: null });
    const left = Math.max(0, (this.blocks?.total || 0) - (this.st || 0));
    const clock = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    const cx = (pad + 10 + 80 * S + hx0) / 2;
    txt(ctx, clock, cx, rowY, { size: 24 * S, align: 'center', color: HUD.lime });
    // profilo dell'allenamento: un blocco per tratto, alto quanto lo sforzo; il segno è il punto in cui sei
    // in orizzontale i pannelli stanno a sinistra: il centro resta libero per la strada e il boss
    const PW = W > H * 1.2 ? Math.min(W - 2 * pad, Math.max(420, W * 0.42)) : W - 2 * pad;
    let y2 = top + 40 * S + 6;
    this.drawProfile(ctx, pad, y2, PW, 24 * S); y2 += 24 * S + 6;
    if (this.state === 'play' || this.state === 'intro') { y2 = this.drawBlockCard(ctx, pad, y2, PW, S); }
    const B = this.boss;
    if (B && !B.dead && !B.fleeing && this.state === 'play') y2 = this.drawBossBar(ctx, pad, y2, PW, S, B);
    if (!this.hooks.connected()) { txt(ctx, t('games.common.demo'), pad + PW / 2, y2 + 12, { size: 12 * S, align: 'center', color: HUD.gold }); y2 += 18; }
    if (PW < W - 2 * pad) y2 = top + 40 * S + 6; // a destra dei pannelli lo schermo è libero
    this.drawBottom(ctx, W, H, S, pad);
    // etichette sopra i robot con lo scudo: i watt che servono per romperlo
    this.drawShieldTags(ctx, W, S, y2);
    const hp = this.stage.project(this.px, 3.2, this.laneZ);
    if (this.combo >= 3 && this.state === 'play') {
      const cy = Math.min(hp.y - 6, H - 190 * S);
      txt(ctx, t('games.shooter.combo', { n: this.combo }), hp.x, cy, { size: 22 * S, align: 'center', color: '#ff9f1c' });
      ctx.fillStyle = 'rgba(255,159,28,.85)'; const cw = 70 * S * clamp(this.comboT / 2.6, 0, 1); rr(ctx, hp.x - cw / 2, cy + 5, cw, 4 * S, 2); ctx.fill();
    }
    this.drawLaneHint(ctx, hp, S);
    const toast = this.hooks.progress?.toasts?.length > 0;
    ctx.save(); ctx.translate(0, y2 - 50); this.hooks.progress?.drawToasts(ctx, W, dt); ctx.restore();
    this.msgs.draw(ctx, W, H, { u: S * 1.0, y: Math.max(y2 + 34 + (toast ? 56 : 0), H * 0.3) });
    for (const p of this.pops) {
      const k = 1 - p.t / p.life; const q = this.stage.project(p.x, p.y + k * 1.6, p.z);
      if (!q.visible) continue;
      ctx.globalAlpha = clamp((p.t / p.life) * 2.5, 0, 1);
      txt(ctx, p.text, clamp(q.x, 40, W - 40), clamp(q.y, y2 + 10, H - 150), { size: 18 * S, align: 'center', color: p.color });
      ctx.globalAlpha = 1;
    }
    if (this.hurtFlash > 0) { const rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7); rg.addColorStop(0, 'rgba(255,0,40,0)'); rg.addColorStop(1, `rgba(255,0,40,${Math.min(0.3, this.hurtFlash)})`); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); }
    if (this.hooks.lost) trainerLostBanner(ctx, W, H, t);
    if (this.whiteFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.whiteFlash})`; ctx.fillRect(0, 0, W, H); }
    if (this.state === 'intro') this.drawIntro(ctx, W, H, S);
    if (this.state === 'cool' || this.state === 'results') this.drawResults(ctx, W, H, S);
    if (this.paused) this.drawCard(ctx, W, H, S, t('games.shooter.paused'), HUD.gold, [t('games.shooter.pausedSub')], null);
  }

  drawProfile(ctx, x, y, w, h) {
    const bl = this.blocks; if (!bl) return;
    ctx.fillStyle = 'rgba(8,10,26,.55)'; rr(ctx, x, y, w, h, 6); ctx.fill();
    const T = bl.total; const now = this.st || 0;
    const col = { warm: '#7dd87d', rec: '#7dd87d', cool: '#7dd87d', effort: '#ff9f1c', mini: '#ff6b35', boss: '#ff2e63', sprint: '#4de3ff' };
    for (const b of bl) {
      const bx = x + 2 + (b.t0 / T) * (w - 4); const bw = Math.max(1, (b.dur / T) * (w - 4) - 1);
      const bh = (h - 4) * clamp((b.pct - 0.35) / 1.05, 0.15, 1);
      ctx.globalAlpha = b.t1 <= now ? 0.35 : 1;
      ctx.fillStyle = col[b.kind]; ctx.fillRect(bx, y + h - 2 - bh, bw, bh);
      if (b.kind === 'mini' || b.kind === 'boss') txt(ctx, '☠', bx + bw / 2, y + h - 3, { size: 11, align: 'center', color: '#ffffff', stroke: null });
    }
    ctx.globalAlpha = 1;
    // esiti degli sforzi già fatti
    const res = this.coach?.results || []; let ri = 0;
    for (const b of bl) if (isHard(b) && b.t1 <= now && res[ri]) { const r = res[ri++]; const bx = x + 2 + ((b.t0 + b.dur / 2) / T) * (w - 4); txt(ctx, r.ok ? '✓' : '·', bx, y + 11, { size: 12, align: 'center', color: r.ok ? HUD.lime : '#ffffff', stroke: null }); }
    const mx = x + 2 + clamp(now / T, 0, 1) * (w - 4);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(mx - 1.5, y - 3, 3, h + 6);
  }

  // il blocco in corso: nome, tempo che manca, watt richiesti e barra della potenza
  drawBlockCard(ctx, x, y, w, S) {
    const b = this.block || this.blocks[0]; const hard = isHard(b);
    const tg = this.tgW(); const left = Math.max(0, (this.wk ? b.stepEnd : b.t1) - (this.st || 0)); // con un allenamento: nome del passo e tempo che manca alla fine del passo
    const colr = { warm: HUD.lime, rec: HUD.lime, cool: HUD.lime, effort: '#ff9f1c', mini: '#ff6b35', boss: '#ff4d6d', sprint: HUD.cyan }[b.kind];
    const h = 54 * S;
    ctx.fillStyle = 'rgba(8,10,26,.66)'; rr(ctx, x, y, w, h, 12); ctx.fill();
    ctx.fillStyle = colr; rr(ctx, x, y, 6, h, 3); ctx.fill();
    const name = this.wk ? (b.label || t(`games.wk.seg.${b.wkKind}`)) : t(`games.shooter.card.${b.kind}`);
    txt(ctx, name, x + 14, y + 22 * S, { size: fitSize(ctx, name, w * 0.42, 19 * S), color: colr, italic: true });
    txt(ctx, `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, x + 14 + Math.min(measure(ctx, name, 19 * S), w * 0.42) + 10, y + 22 * S, { size: 16 * S, color: '#dfe3f0' });
    const goal = !tg ? '' : hard ? t('games.shooter.card.hold', { w: tg }) : t('games.shooter.card.easy', { w: tg });
    txt(ctx, goal, x + w - 10, y + 22 * S, { size: fitSize(ctx, goal, w * 0.45, 19 * S), align: 'right', color: HUD.white });
    // barra: potenza attuale rispetto alla richiesta (segno bianco = richiesta)
    const gx = x + 14; const gw = w - 28; const gy = y + 32 * S; const gh = 12 * S;
    const max = Math.max(tg * 1.45, 50); const ok = hard ? this.power >= tg * TOL : true;
    ctx.fillStyle = 'rgba(255,255,255,.14)'; rr(ctx, gx, gy, gw, gh, 5); ctx.fill();
    ctx.fillStyle = hard ? (ok ? HUD.lime : '#ff9f1c') : '#7dd87d'; rr(ctx, gx, gy, Math.max(6, gw * clamp(this.power / max, 0, 1)), gh, 5); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(gx + gw * clamp(tg / max, 0, 1) - 1.5, gy - 4, 3, gh + 8);
    if (hard && b.kind !== 'sprint') {
      const ef = this.coach.efforts; const n = this.blocks.filter((q) => isHard(q) && q.kind !== 'sprint').length;
      const lbl = t('games.shooter.card.efforts', { ok: ef.filter((r) => r.ok).length, n });
      txt(ctx, lbl, x + w - 10, y + h + 14 * S, { size: 12 * S, align: 'right', color: '#dfe3f0', font: 'text' });
    }
    return y + h + (hard && b.kind !== 'sprint' ? 18 * S : 6);
  }

  drawBossBar(ctx, x, y, w, S, B) {
    const bh = 18 * S;
    ctx.fillStyle = 'rgba(0,0,0,.65)'; rr(ctx, x, y, w, bh, 7); ctx.fill();
    let label;
    if (B.shieldUp) {
      ctx.fillStyle = '#5cc8ff'; rr(ctx, x, y, Math.max(8, w * (1 - B.shieldT / B.shieldNeed)), bh, 7); ctx.fill();
      label = t('games.shooter.bossShield', { s: Math.ceil(B.shieldNeed - B.shieldT), w: this.tgW() });
    } else {
      ctx.fillStyle = B.phase === 3 ? '#ff2e63' : '#ff9f1c'; rr(ctx, x, y, Math.max(8, w * clamp(B.hp / B.maxHp, 0, 1)), bh, 7); ctx.fill();
      if (!B.mini) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x + w / 2 - 1, y, 2, bh); }
      label = t(B.def.name);
    }
    txt(ctx, label, x + w / 2, y + bh - 4 * S, { size: fitSize(ctx, label, w - 20, 13 * S), align: 'center' });
    return y + bh + 6;
  }

  drawBottom(ctx, W, H, S, pad) {
    const barH = 14 * S; const barY = H - 12 - barH; const bx = pad; const bw2 = W - 2 * pad;
    const big = 54 * S; const pc = this.overdrive > 0 || this.sprinting ? HUD.cyan : this.inZone() ? HUD.lime : '#ffffff';
    const pw = String(Math.round(this.power));
    const numW = txt(ctx, pw, pad + 2, barY - 24 * S, { size: big, color: pc });
    txt(ctx, 'W', pad + 6 + numW, barY - 24 * S, { size: 22 * S, color: '#e8e8f4' });
    txt(ctx, t('games.shooter.fireRate', { n: fmtDec(this.rate || 0, 1) }), pad + 2, barY - 7 * S, { size: 13 * S, color: '#dfe3f0' });
    const rx = W - pad - 2;
    const w = WEAPONS[this.weapon]; const wn = t(w.name);
    let ry = barY - 44 * S;
    txt(ctx, wn, rx, ry, { size: fitSize(ctx, wn, W * 0.4, 20 * S), align: 'right', color: w.color });
    const aw = Math.min(130 * S, W * 0.36);
    if (this.weaponT > 0) { ctx.fillStyle = 'rgba(255,255,255,.2)'; rr(ctx, rx - aw, ry + 6, aw, 6 * S, 3); ctx.fill(); ctx.fillStyle = w.color; rr(ctx, rx - aw, ry + 6, Math.max(5, aw * this.weaponT / this.weaponDur), 6 * S, 3); ctx.fill(); }
    ry += 26 * S;
    const pu = [];
    if (this.puShield > 0) pu.push([t('games.shooter.pu.shield'), POWERUPS.shield.color, this.puShield]);
    if (this.puDouble > 0) pu.push([t('games.shooter.pu.double'), POWERUPS.double.color, this.puDouble]);
    if (pu.length) { const s = pu.map((p) => `${p[0]} ${Math.ceil(p[2])}`).join(' · '); txt(ctx, s, rx, ry, { size: fitSize(ctx, s, W * 0.5, 14 * S), align: 'right', color: pu[0][1] }); }
    else { const od = this.overdrive > 0 ? t('games.shooter.overdrive') : this.wk ? t('games.wk.charge') : t('games.shooter.sprintLine', { w: this.sprintW || 0 }); txt(ctx, od, rx, ry, { size: fitSize(ctx, od, W * 0.5, 13 * S), align: 'right', color: this.overdrive > 0 ? HUD.cyan : '#dfe3f0' }); }
    ctx.fillStyle = 'rgba(8,10,26,.8)'; rr(ctx, bx, barY, bw2, barH, 7); ctx.fill();
    const odK = this.overdrive > 0 ? this.overdrive / OD_TIME : this.odMeter;
    const og = ctx.createLinearGradient(bx, 0, bx + bw2, 0); og.addColorStop(0, '#1fa3ff'); og.addColorStop(1, '#4de3ff');
    ctx.fillStyle = this.overdrive > 0 ? `rgba(220,250,255,${0.75 + 0.25 * Math.sin(this.t * 20)})` : og; rr(ctx, bx, barY, Math.max(8, bw2 * odK), barH, 7); ctx.fill();
    const chg = this.wk ? this.charging : this.sprinting;
    const lbl = this.overdrive > 0 ? '' : chg ? t('games.shooter.charging') : 'OVERDRIVE';
    if (lbl) txt(ctx, lbl, bx + bw2 / 2, barY + barH - 3 * S, { size: 11 * S, align: 'center', color: chg ? '#06121c' : '#e8f6ff', stroke: chg ? null : undefined });
  }

  drawShieldTags(ctx, W, S, yMin) {
    if (this.state !== 'play') return;
    const down = this.shieldsDown(); const w = this.shieldW(); let n = 0;
    for (const e of this.foes) {
      if (!e.def.shielded || e.dead || e.born < 0.3 || n >= 4) continue;
      const q = this.stage.project(e.x, e.def.h * 1.05 + 0.6, e.z); if (!q.visible) continue; n++;
      const s = `${down ? '' : '🔒 '}${w} W`;
      if (q.y < yMin + 14) continue;
      txt(ctx, s, clamp(q.x, 40, W - 40), q.y, { size: 15 * S, align: 'center', color: down ? HUD.lime : '#9fe0ff' });
    }
    const B = this.boss;
    if (B && B.ready && B.shieldUp && !B.dead && !B.fleeing) {
      const q = this.stage.project(B.x, B.y0 + B.h + 0.8, B.z);
      if (q.visible) txt(ctx, `${this.inZone() ? '' : '🔒 '}${this.tgW()} W`, clamp(q.x, 50, W - 50), Math.max(q.y, yMin + 22 * S), { size: 18 * S, align: 'center', color: this.inZone() ? HUD.lime : '#9fe0ff' });
    }
  }

  // suggerimento: gabbia o cassa su un'altra corsia → freccia con + (destra) o − (sinistra)
  drawLaneHint(ctx, hp, S) {
    if (this.state !== 'play') return;
    let target = null;
    for (const c of this.cages) if (!c.open && c.x > this.px + 3 && c.x - this.px < 30 && c.lane !== this.lane) { target = { lane: c.lane, col: '#7dff6a' }; break; }
    if (!target) for (const p of this.pickups) if (p.x > this.px + 3 && p.x - this.px < 30 && p.lane !== this.lane) { target = { lane: p.lane, col: p.col }; break; }
    if (!target) return;
    const right = target.lane < this.lane; const pulse = 1 + 0.12 * Math.sin(this.t * 10);
    const x = hp.x + (right ? 1 : -1) * 70 * S; const y = hp.y + 40 * S;
    ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(8,10,26,.75)'; rr(ctx, -30 * S, -18 * S, 60 * S, 36 * S, 10); ctx.fill();
    ctx.strokeStyle = target.col; ctx.lineWidth = 3; ctx.stroke();
    // freccia disegnata (i caratteri ◀ ▶ non ci sono nel font del gioco) e il tasto da premere
    const d = right ? 1 : -1; ctx.fillStyle = target.col; ctx.beginPath(); ctx.moveTo(d * 24 * S, 0); ctx.lineTo(d * 10 * S, -10 * S); ctx.lineTo(d * 10 * S, 10 * S); ctx.closePath(); ctx.fill();
    txt(ctx, right ? '+' : '−', -d * 6 * S, 9 * S, { size: 24 * S, align: 'center', color: target.col, stroke: null });
    ctx.restore();
  }

  drawIntro(ctx, W, H, S) {
    const k = this.stateT; const a = clamp(Math.min(k * 3, (3.2 - k) * 3), 0, 1);
    ctx.globalAlpha = a;
    const y = H * 0.42; const bandH = 108 * S;
    ctx.fillStyle = 'rgba(8,10,26,.72)'; ctx.fillRect(0, y - bandH / 2, W, bandH);
    ctx.fillStyle = HUD.lime; ctx.fillRect(0, y - bandH / 2, W, 3); ctx.fillRect(0, y + bandH / 2 - 3, W, 3);
    const m = `${this.wk ? this.wk.name : t('games.shooter.m.min', { n: this.minutes })} · ${t(`games.shooter.m.lv${this.diff}`)} · FTP ${this.coach.ftp} W`;
    txt(ctx, m, W / 2, y - 22 * S, { size: fitSize(ctx, m, W - 30, 17 * S), align: 'center', color: HUD.gold });
    const nm = t(this.L.name); txt(ctx, nm, W / 2, y + 18 * S, { size: fitSize(ctx, nm, W - 30, 44 * S), align: 'center', color: '#ffffff', italic: true });
    const sub = t('games.shooter.introSub'); txt(ctx, sub, W / 2, y + 42 * S, { size: fitSize(ctx, sub, W - 30, 15 * S), align: 'center', color: '#dfe3f0' });
    ctx.globalAlpha = 1;
  }

  drawCard(ctx, W, H, S, title, color, lines, keys, { y0 = null, extra = 0 } = {}) {
    const cw = Math.min(W - 24, 460 * S); const lh = 22 * S; const fz = 15 * S;
    const nl = lines.reduce((a, l) => a + wrapLines(ctx, l, cw - 28, fz, { font: 'text', maxLines: 2 }).length, 0);
    const ch = 64 * S + extra + nl * lh + (keys ? 40 * S : 4);
    const x = (W - cw) / 2; const y = y0 ?? Math.max(H * 0.36 - ch / 2, 70);
    ctx.fillStyle = 'rgba(8,10,26,.88)'; rr(ctx, x, y, cw, ch, 16); ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
    txt(ctx, title, W / 2, y + 40 * S, { size: fitSize(ctx, title, cw - 24, 30 * S), align: 'center', color, italic: true });
    let ly = y + 60 * S + extra; for (const l of lines) ly = paragraph(ctx, l, W / 2, ly, { size: fz, maxW: cw - 28, lineK: lh / fz, maxLines: 2, color: '#e8e8f4' }).bottom;
    if (keys) txt(ctx, keys, W / 2, y + ch - 16 * S, { size: fitSize(ctx, keys, cw - 24, 18 * S), align: 'center', color: HUD.lime });
    return y;
  }

  // fine partita: durante il defaticamento le stelle si accendono una alla volta; poi il riepilogo comune (kit/menu.js)
  drawResults(ctx, W, H, S) {
    const R = this.result; if (!R || this.stateT < 0.5) return;
    if (this.state === 'results') {
      const lines = [t('games.shooter.res.stats', { k: this.kills, c: this.maxCombo, r: this.rescued })];
      if (R.unlock) lines.push(t('games.shooter.res.unlock', { name: t(`games.shooter.hero.${R.unlock.id}.name`) }));
      else if (R.next) lines.push(t('games.shooter.res.next', { n: R.next.stars - this.starsTotal, name: t(`games.shooter.hero.${R.next.id}.name`) }));
      this.results.draw(ctx, W, H, {
        title: t('games.shooter.res.title'), stars: R.stars,
        criteria: R.wk ? [
          { ok: true, label: t('games.wk.res.done') },
          { ok: R.band >= 0.85, label: t('games.wk.res.band', { p: Math.round(R.band * 100) }) },
          { ok: this.bossDown, label: t('games.shooter.res.c3') },
        ] : [
          { ok: true, label: t('games.shooter.res.c1') },
          { ok: R.okRate >= 0.6, label: t('games.shooter.res.c2', { ok: R.ok, n: R.n }) },
          { ok: R.stars >= 3, label: `${t('games.shooter.res.c3')}${this.bossDown ? '' : ` (${t('games.shooter.res.noBoss')})`}` },
        ],
        score: Math.round(this.score), best: R.best ? String(R.best) : null, newBest: R.newBest, lines,
      });
      return;
    }
    const y = 150 * S;
    txt(ctx, t('games.shooter.res.title'), W / 2, y, { size: fitSize(ctx, t('games.shooter.res.title'), W - 30, 40 * S), align: 'center', color: HUD.lime, italic: true });
    for (let i = 0; i < 3; i++) {
      const on = i < Math.min(R.shown, R.stars); const lit = i < R.shown;
      const pulse = on && i === R.shown - 1 ? 1 + 0.25 * Math.max(0, R.revealT - 0.6) : 1;
      txt(ctx, '★', W / 2 + (i - 1) * 56 * S, y + 64 * S, { size: 54 * S * pulse, align: 'center', color: on ? '#ffd34d' : lit ? '#4a4c66' : '#2a2c44', stroke: on ? undefined : null });
    }
    const s = t('games.shooter.res.cool'); txt(ctx, s, W / 2, H - 150 * S, { size: fitSize(ctx, s, W - 30, 16 * S), align: 'center', color: HUD.lime });
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
function centerY(e) { return e.type === 'drone' ? e.y + 0.6 : e.def.obstacle ? 0.6 : e.def.h * 0.55 * e.size + (e.def.hover ? 0.6 : 0); }

// corpo che fa stare il testo in una larghezza (stesso carattere di txt)
function fitSize(ctx, text, maxW, size) {
  const w = measure(ctx, text, size);
  return w > maxW ? Math.max(9, Math.floor(size * maxW / w)) : size;
}
function rr(ctx, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q); ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); ctx.closePath();
}
