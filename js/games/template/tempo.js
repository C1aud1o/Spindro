// TEMPO: the template game. A complete, minimal 2D-canvas game: hold the target watts to keep the bar in the green.
// COPY THIS FOLDER to js/games/<yourid>/, rename the class, add one entry to js/games/registry.js and your strings to
// locales/*.json (docs/games/CREATE-A-GAME.md). The contract with the app is docs/games/API.md; types are in kit/types.js.
//
// What a game is: a class built once as `new Game(canvas, hooks, audio)`. The app calls start() when the rider opens it,
// stop() when they leave, and forwards + / − to input(±1) (and hold(dir) while the button stays down). Everything else is yours.
import { t } from '../../i18n.js';
import { GameMenu, ResultsView } from '../kit/menu.js';
import { txt, panel, HUD, hudView, uiScale, loadHudFonts } from '../kit/hud.js';
import { WorkoutClock, BandMeter, wkTarget, workoutStars } from '../kit/workout-plan.js';
import { makeRandom } from '../kit/rng.js';

const ID = 'tempo';                    // = registry id: strings are games.tempo.*, storage keys start with "tempo"
const SESSION = 60; const BLOCK = 15;  // a 1-minute session of four 15 s blocks (the menu's minutes are ignored in this tiny example)
const PCTS = [0.75, 0.9, 1.0, 0.85];   // target of each block, fraction of FTP (docs/games/DESIGN-RULES.md, "the five zones")
const LEVEL_K = [0.9, 1, 1.1];         // the level chosen in the menu (easy / normal / hard) scales the targets
const STOPPED_W = 12; const STOPPED_S = 2.5; // below 12 W for 2.5 s the rider has stopped: the game waits instead of punishing
const r5 = (w) => Math.round(w / 5) * 5;

export class Tempo {
  /** @param {HTMLCanvasElement} canvas  @param {import('../kit/types.js').GameHooks} hooks  @param {import('../kit/types.js').GameAudio} audio */
  constructor(canvas, hooks, audio) {
    this.canvas = canvas; this.hooks = hooks; this.audio = audio; this.active = false; this.state = 'loading';
    this.clock = new WorkoutClock(hooks); this.band = new BandMeter();
    // The shared menu and results screen are the same in every game: you only describe them.
    this.menu = new GameMenu({
      id: ID, title: () => t('games.tempo.name'), pitch: () => t('games.tempo.tagline'),
      howto: () => [t('games.tempo.help'), t('games.tempo.how1'), t('games.tempo.how2')],
      best: (d, l) => { const r = hooks.progress?.bestOf(ID, `${d}:${l}`); return { stars: r?.stars || 0, text: r?.score ? String(r.score) : null }; },
      onStart: (_d, level) => this.begin(level), sfx: (n) => audio?.sfx(n), ready: () => this.state === 'menu', workout: () => hooks.workout?.(),
    });
    this.results = new ResultsView({ onAgain: () => this.begin(this.menu.level), onBack: () => hooks.close?.(), sfx: (n) => audio?.sfx(n) });
    this.loop = this.loop.bind(this);
  }

  // ---- lifecycle ----------------------------------------------------------------------------------------------
  async start() {                       // may be async: a 3D game loads its models here, state stays 'loading' meanwhile
    this.active = true; this.state = 'loading';
    this.ctx = this.canvas.getContext('2d'); this.onResize = () => this.resize(); window.addEventListener('resize', this.onResize); this.resize();
    const size = () => ({ W: this.W, H: this.H });
    this.detach = [this.menu.attach(this.canvas, size, () => this.state === 'menu'), this.results.attach(this.canvas, size, () => this.state === 'results')];
    this.last = performance.now(); requestAnimationFrame(this.loop);
    await loadHudFonts();
    if (!this.active) return;
    this.state = 'menu'; this.menu.reset();
  }
  stop() {                              // leave: undo everything start() did
    this.active = false; window.removeEventListener('resize', this.onResize); (this.detach || []).forEach((f) => f());
    this.hooks.setGrade(null);          // give the trainer's slope back to the app (harmless if you never set one)
    this.ctx?.setTransform(1, 0, 0, 1, 0, 0); this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  end() { if (this.state === 'play') this.finish(); }   // optional: finish now (tests and the bot harness use it)

  // ---- input: ALWAYS exactly +1 or −1 --------------------------------------------------------------------------
  input(dir) {
    this.audio?.ensure();
    if (this.state === 'menu') this.menu.input(dir);
    else if (this.state === 'results') this.results.input(dir);
    else if (this.state === 'play') this.hooks.shift?.(dir);   // + / − = gear up / down: with a trainer in Gears mode they change the load
  }
  hold(dir) { if (this.state === 'menu') this.menu.hold(dir); }   // long press on + starts from the menu

  // ---- a run ---------------------------------------------------------------------------------------------------
  get ftp() { return Math.max(80, this.hooks.ftp?.() || 200); }
  begin(level) {
    this.rnd = makeRandom();            // seeded by window.__spindroSeed in tests: same run every time
    this.order = PCTS.map((p) => p * (0.98 + this.rnd() * 0.04));  // a touch of variety per run, never harder than +2 %
    this.k = LEVEL_K[level] ?? 1; this.band = new BandMeter(); this.el = 0; this.fill = 0.3; this.still = 0; this.wait = false;
    this.plan = this.clock.begin(this.ftp);                          // workout mode: the plan decides the targets and the length
    this.total = this.plan ? this.plan.total : SESSION; this.state = 'play'; this.hooks.runStart?.(); this.audio?.sfx('go');
  }
  target() {
    if (this.plan) { const s = this.plan.segs.find((x) => this.el >= x.t0 && this.el < x.t1) || this.plan.segs.at(-1); return { w: wkTarget(s, this.el), since: this.el - s.t0, label: s.label }; }
    const i = Math.min(PCTS.length - 1, Math.floor(this.el / BLOCK));
    return { w: r5(this.ftp * this.order[i] * this.k), since: this.el - i * BLOCK, label: null };
  }
  finish() {
    const ratio = this.band.ratio; const stars = workoutStars(ratio, true);   // same star rule as every game: 60 % / 85 % of the time within ±7 %
    const score = Math.round(this.band.inT * 10); const key = `${this.menu.durIdx}:${this.menu.level}`;
    const prev = this.plan ? null : this.hooks.progress?.bestOf(ID, key); const newBest = !this.plan && score > (prev?.score || 0);
    if (!this.plan && (newBest || stars > (prev?.stars || 0))) this.hooks.progress?.saveBest(ID, key, { score: Math.max(score, prev?.score || 0), stars: Math.max(stars, prev?.stars || 0) });
    this.result = { stars, ratio, score, best: Math.max(score, prev?.score || 0), newBest, wk: !!this.plan };
    this.state = 'results'; this.results.reset(); this.audio?.sfx('win');
    // Only games with a leaderboard report here: this.hooks.runEnd({ game: ID, score }). Tempo has none.
  }

  // ---- one frame: update(dt) then draw -------------------------------------------------------------------------
  update(dt) {
    const { power } = this.hooks.stats(); const connected = this.hooks.connected();
    if (this.state === 'menu') { this.menu.update(dt, { connected, power }); return; }
    if (this.state === 'results') { this.results.update(dt); return; }
    if (this.state !== 'play') return;
    this.still = power < STOPPED_W ? this.still + dt : 0; this.wait = this.still > STOPPED_S;   // stopped pedalling: pause the clock
    if (this.wait) return;
    this.el = this.plan ? this.clock.tick(dt) : this.el + dt;
    const tg = this.target(); this.band.add(dt, power, tg.w, tg.since);
    const inBand = Math.abs(power - tg.w) <= 0.07 * tg.w;
    this.fill = Math.max(0, Math.min(1, this.fill + (inBand ? dt / 8 : -dt / 14)));     // the bar rises in the green, sinks slowly outside
    if (this.el >= this.total || this.clock.ended) this.finish();
  }
  loop(now) {
    if (!this.active) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.update(dt); this.draw(dt);
    requestAnimationFrame(this.loop);
  }
  resize() {
    const r = this.canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = r.width; this.H = r.height; this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  draw(dt) {
    const { ctx, W, H } = this; const u = uiScale(W, H); hudView(ctx, W, H);
    ctx.fillStyle = '#0f1420'; ctx.fillRect(0, 0, W, H);
    if (this.state === 'loading') return txt(ctx, '…', W / 2, H / 2, { size: 40, align: 'center' });
    if (this.state === 'menu') { this.menu.draw(ctx, W, H, { connected: this.hooks.connected() }); return; }
    if (this.state === 'results') { this.drawResults(); return; }
    const { power } = this.hooks.stats(); const tg = this.target(); const cx = W / 2; const bw = Math.min(W - 40, 420 * u);
    txt(ctx, tg.label || t('games.tempo.target'), cx, 120 * u, { size: 20 * u, align: 'center', color: HUD.dim, font: 'text', maxW: bw });
    txt(ctx, `${tg.w} W`, cx, 190 * u, { size: 72 * u, align: 'center', color: HUD.lime, maxW: bw });
    // the gauge: green zone = ±7 % of the target, the marker is your power (scale 50 %–150 % of the target)
    const gy = 250 * u; const x = (w) => cx - bw / 2 + bw * Math.max(0, Math.min(1, (w / tg.w - 0.5)));
    panel(ctx, cx - bw / 2, gy, bw, 34 * u, { r: 17 * u, fill: 'rgba(255,255,255,.12)' });
    ctx.fillStyle = '#2bd67b'; ctx.fillRect(x(tg.w * 0.93), gy, x(tg.w * 1.07) - x(tg.w * 0.93), 34 * u);
    ctx.fillStyle = '#fff'; ctx.fillRect(x(power) - 3, gy - 8 * u, 6, 50 * u);
    txt(ctx, `${Math.round(power)} W`, cx, gy + 96 * u, { size: 56 * u, align: 'center', maxW: bw });
    panel(ctx, cx - bw / 2, gy + 130 * u, bw, 16 * u, { r: 8 * u, fill: 'rgba(255,255,255,.12)' });                 // the "tempo" bar
    panel(ctx, cx - bw / 2, gy + 130 * u, Math.max(16 * u, bw * this.fill), 16 * u, { r: 8 * u, fill: this.fill > 0.5 ? '#2bd67b' : HUD.gold });
    const left = Math.max(0, Math.ceil(this.total - this.el)); txt(ctx, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, W - 16, 40 * u, { size: 26 * u, align: 'right' });
    if (this.wait) txt(ctx, t('games.tempo.keep'), cx, H - 60 * u, { size: 24 * u, align: 'center', color: HUD.gold, maxW: bw });
    this.hooks.progress?.drawToasts(ctx, W, dt);
  }
  drawResults() {
    const r = this.result;
    this.results.draw(this.ctx, this.W, this.H, {
      title: t('games.tempo.res.title'), subtitle: t('games.tempo.name'), stars: r.stars,
      criteria: [{ ok: true, label: t('games.wk.res.done') }, { ok: r.ratio >= 0.6, label: t('games.tempo.crit.zone', { p: 60 }) }, { ok: r.ratio >= 0.85, label: t('games.tempo.crit.zone', { p: 85 }) }],
      score: r.score, best: r.best ? String(r.best) : null, newBest: r.newBest, lines: [t('games.wk.res.band', { p: Math.round(r.ratio * 100) })],
    });
  }
}
