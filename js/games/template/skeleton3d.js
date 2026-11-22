// THREE.JS SKELETON: the shared 3D stage and the shared cyclist, and nothing else. A starting point for a 3D game.
// Copy this folder, rename the class and the id (registry + locales, see docs/games/CREATE-A-GAME.md), then add your world and rules.
// The rider pedals at the cadence read from the trainer; the camera looks at them from behind. The shared menu starts a run
// and the run ends on the shared results screen after 20 s so the skeleton is a complete game you can test with game:check.
//
// Where things live: kit3d.js re-exports the 3D kit (THREE, Stage, Quality, Cyclist, sky and lights). Models are glTF files in
// assets/3d/<author>/ (licence credited in README.md and docs/legal/licenses.*.md: no new assets without a clear licence).
import { THREE, Stage, Quality, Cyclist, makeKit, loadCyclistTemplate, skyDome, styleLights, styleFog } from '../kit3d.js';
import { loadHudFonts, hudView } from '../kit/hud.js';
import { GameMenu, ResultsView } from '../kit/menu.js';
import { t } from '../../i18n.js';

const ID = 'skeleton'; const RUN = 20; // seconds of a skeleton run

export class Skeleton3D {
  /** @param {HTMLCanvasElement} canvas  @param {import('../kit/types.js').GameHooks} hooks  @param {import('../kit/types.js').GameAudio} audio */
  constructor(canvas, hooks, audio) {
    this.canvas = canvas; this.hooks = hooks; this.audio = audio; this.active = false; this.state = 'loading';
    this.menu = new GameMenu({ id: ID, title: () => t('games.skeleton.name'), pitch: () => t('games.skeleton.desc'), howto: () => [t('games.skeleton.help')], onStart: () => this.begin(), sfx: (n) => audio?.sfx(n), ready: () => this.state === 'menu', workout: () => hooks.workout?.() });
    this.results = new ResultsView({ onAgain: () => this.begin(), onBack: () => hooks.close?.(), sfx: (n) => audio?.sfx(n) });
    this.loop = this.loop.bind(this);
  }
  async start() {
    this.active = true; this.state = 'loading';
    this.stage = new Stage(this.canvas, { quality: new Quality() });            // the WebGL canvas goes under the HUD canvas
    const { scene, camera } = this.stage;
    scene.add(skyDome('golden')); styleFog(scene, 'golden', 45, 125); styleLights(scene, 'golden', { shadows: this.stage.cfg.shadows, mapSize: this.stage.cfg.shadowMap, extent: 24 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: '#5f8f4a' })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const size = () => ({ W: this.stage.W, H: this.stage.H });
    this.detach = [this.menu.attach(this.canvas, size, () => this.state === 'menu'), this.results.attach(this.canvas, size, () => this.state === 'results')];
    this.last = performance.now(); requestAnimationFrame(this.loop);
    const tpl = await loadCyclistTemplate();                                    // the shared rider model and rig
    await loadHudFonts();
    if (!this.active) return;
    this.rider = new Cyclist(tpl, makeKit('#d9ff3d'), { shadows: this.stage.cfg.shadows }); this.rider.root.scale.setScalar(1.3); scene.add(this.rider.root);
    camera.position.set(0, 2.6, -5.5); camera.lookAt(0, 1.2, 2);
    this.state = 'menu'; this.menu.reset();
  }
  stop() { this.active = false; (this.detach || []).forEach((f) => f()); this.stage?.dispose(); }
  end() { if (this.state === 'play') this.finish(); }
  input(dir) { this.audio?.ensure(); if (this.state === 'menu') this.menu.input(dir); else if (this.state === 'results') this.results.input(dir); /* in play: give + / − ONE job */ }
  hold(dir) { if (this.state === 'menu') this.menu.hold(dir); }
  begin() { this.el = 0; this.state = 'play'; this.hooks.runStart?.(); this.audio?.sfx('go'); }
  finish() { this.state = 'results'; this.results.reset(); this.result = { stars: 1 }; this.audio?.sfx('win'); }
  update(dt) {
    const { power, cadence } = this.hooks.stats();
    if (this.state === 'menu') this.menu.update(dt, { connected: this.hooks.connected(), power });
    if (this.state === 'results') this.results.update(dt);
    if (this.state === 'play') { this.el += dt; if (this.el >= RUN) this.finish(); }
    this.rider?.pose(dt, cadence || 60, this.hooks.speedKmh() / 3.6);          // legs follow the cadence
  }
  loop(now) {
    if (!this.active) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.update(dt); if (this.rider) this.stage.render();                       // 3D scene, then the 2D HUD on top
    const { ctx, W, H } = this.stage; ctx.clearRect(0, 0, W, H); hudView(ctx, W, H);
    if (this.state === 'menu') this.menu.draw(ctx, W, H, { connected: this.hooks.connected() });
    if (this.state === 'results') this.results.draw(ctx, W, H, { title: t('games.skeleton.name'), stars: 1, criteria: [{ ok: true, label: t('games.wk.res.done') }], score: Math.round(this.el), best: null, newBest: false });
    requestAnimationFrame(this.loop);
  }
}
