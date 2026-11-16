// TEMPO: the template game. A complete, minimal 2D-canvas game: hold the target watts to keep the bar in the green.
// COPY THIS FOLDER to js/games/<yourid>/, rename the class, add one entry to js/games/registry.js and your strings to
// locales/*.json (docs/games/CREATE-A-GAME.md). The contract with the app is docs/games/API.md; types are in kit/types.js.
//
// What a game is: a class built once as `new Game(canvas, hooks, audio)`. The app calls start() when the rider opens it,
// stop() when they leave, and forwards + / − to input(±1) (and hold(dir) while the button stays down). Everything else is yours.
import { t } from '../../i18n.js';
import { GameMenu, ResultsView } from '../kit/menu.js';
import { txt, panel, HUD, hudView, uiScale, loadHudFonts } from '../kit/hud.js';
import { WorkoutClock, wkTarget, workoutStars, BAND, SETTLE_S } from '../kit/workout-plan.js';
import { makeRandom } from '../kit/rng.js';

const ID = 'tempo';                    // = registry id: strings are games.tempo.*, storage keys start with "tempo"
const LENGTHS = [1, 2, 3]; const BLOCK = 15; // session lengths in minutes (the menu shows these instead of 5 / 10 / 20), blocks of 15 s
const PCTS = [0.75, 0.9, 1.0, 0.85];   // target of each block, fraction of FTP (docs/games/DESIGN-RULES.md, "the five zones")
const LEVEL_K = [0.9, 1, 1.1];         // the level chosen in the menu (easy / normal / hard) scales the targets
const STOPPED_W = 12; const STOPPED_S = 2.5; // below 12 W for 2.5 s the rider has stopped: the game waits instead of punishing
const r5 = (w) => Math.round(w / 5) * 5;

export class Tempo {
  /** @param {HTMLCanvasElement} canvas  @param {import('../kit/types.js').GameHooks} hooks  @param {import('../kit/types.js').GameAudio} audio */
  constructor(canvas, hooks, audio) {
    this.canvas = canvas; this.hooks = hooks; this.audio = audio; this.active = false; this.state = 'loading';
    this.clock = new WorkoutClock(hooks); this.evLog = [];
    // The shared menu and results screen are the same in every game: you only describe them.
    this.menu = new GameMenu({
      id: ID, lengths: LENGTHS, title: () => t('games.tempo.name'), pitch: () => t('games.tempo.tagline'),
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
    const k = LEVEL_K[level] ?? 1; this.inT = 0; this.totT = 0; this.evLog = []; this.nextTick = 4; this.lastBlock = -1; this.el = 0; this.fill = 0.3; this.still = 0; this.wait = false;
    this.plan = this.clock.begin(this.ftp);                          // workout mode: the plan decides the targets and the length
    this.total = this.plan ? this.plan.total : LENGTHS[this.menu.durIdx] * 60;
    // the session as a list of blocks { t0, t1, w (target watts), in, tot (seconds in the green / judged) }; a workout's steps in workout mode
    this.cells = this.plan ? this.plan.segs.map((sg) => ({ t0: sg.t0, t1: sg.t1, seg: sg, w: sg.watts, in: 0, tot: 0, label: sg.label })) : this.makeCells(LENGTHS[this.menu.durIdx] * 60, k, this.rnd);
    this.state = 'play'; this.hooks.runStart?.(); this.audio?.sfx('go');
  }
  makeCells(total, k, rnd = () => 0.5) {                            // a touch of variety per run: ±2 %
    return Array.from({ length: Math.ceil(total / BLOCK) }, (_, i) => ({ t0: i * BLOCK, t1: (i + 1) * BLOCK, w: r5(this.ftp * PCTS[i % PCTS.length] * (0.98 + rnd() * 0.04) * k), in: 0, tot: 0 }));
  }
  target() {
    const i = Math.max(0, this.cells.findIndex((c) => this.el < c.t1)); const c = this.cells[i] || this.cells.at(-1);   // the block we are in
    return { i, c, w: c.seg ? wkTarget(c.seg, this.el) : c.w, since: this.el - c.t0, label: c.label };
  }
  finish() {
    const ratio = this.totT > 0 ? this.inT / this.totT : 0; const stars = workoutStars(ratio, true);   // same star rule as every game: 60 % / 85 % of the time within ±7 %
    const score = Math.round(this.inT * 10); const key = `${this.menu.durIdx}:${this.menu.level}`;
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
    const tg = this.target();
    // The green: from 7 % under the target up. Pushing harder is never punished (docs/games/DESIGN-RULES.md §3); a workout is stricter: ±7 %.
    const inBand = power >= (1 - BAND) * tg.w && (!this.plan || power <= (1 + BAND) * tg.w);
    if (tg.since >= SETTLE_S) { this.totT += dt; tg.c.tot += dt; if (inBand) { this.inT += dt; tg.c.in += dt; } }        // the first seconds of a block are not judged
    // Something must happen at least every 5 s: a new block, or a reward / a nudge every 4 s. ev() feeds eventStats() (below).
    if (tg.i !== this.lastBlock) { this.lastBlock = tg.i; this.nextTick = this.el + 4; this.ev('block'); this.audio?.sfx('pass'); }
    else if (this.el >= this.nextTick) { this.nextTick += 4; this.ev('tick'); this.audio?.sfx(inBand ? 'coin' : 'shiftDown'); }
    this.fill = Math.max(0, Math.min(1, this.fill + (inBand ? dt / 8 : -dt / 14)));     // the bar rises in the green, sinks slowly outside
    if (this.el >= this.total || this.clock.ended) this.finish();
  }
  // The bot harness (npm run game:check) reads these: when things happened, so it can check "first event within 8 s, never 5 s of nothing".
  ev(kind) { if (this.evLog.length < 20000) this.evLog.push({ t: this.el, k: kind }); }
  eventStats() {
    const ts = this.evLog.map((e) => e.t); let maxGap = 0; let prev = 0; for (const x of ts) { maxGap = Math.max(maxGap, x - prev); prev = x; }
    return { first: ts[0] ?? Infinity, maxGap: Math.max(maxGap, this.total - prev), perMin: ts.length / (this.total / 60), n: ts.length };
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
    if (this.state === 'menu') {                                   // the menu, and a preview of the session in the space it leaves free
      this.menu.draw(ctx, W, H, { connected: this.hooks.connected() }); this.el = 0; const y = this.menu.contentBottom + 30 * u;
      this.cells = this.makeCells(LENGTHS[this.menu.durIdx] * 60, LEVEL_K[this.menu.level]); this.drawProfile(Math.max(20, W / 2 - 210 * u), y, Math.min(W - 40, 420 * u), Math.min(150 * u, this.menu.startTop - y - 40 * u)); return;
    }
    if (this.state === 'results') { this.drawResults(); return; }
    const { power } = this.hooks.stats(); const tg = this.target(); const cx = W / 2; const bw = Math.min(W - 40, 420 * u);
    txt(ctx, tg.label || t('games.tempo.target'), cx, 130 * u, { size: 20 * u, align: 'center', color: HUD.dim, font: 'text', maxW: bw });
    txt(ctx, `${tg.w} W`, cx, 200 * u, { size: 72 * u, align: 'center', color: HUD.lime, maxW: bw });
    // the gauge: green zone = ±7 % of the target, the marker is your power (scale 50 %–150 % of the target)
    const gy = 260 * u; const x = (w) => cx - bw / 2 + bw * Math.max(0, Math.min(1, (w / tg.w - 0.5)));
    panel(ctx, cx - bw / 2, gy, bw, 34 * u, { r: 17 * u, fill: 'rgba(255,255,255,.12)' });
    ctx.fillStyle = '#2bd67b'; ctx.fillRect(x(tg.w * 0.93), gy, x(tg.w * 1.07) - x(tg.w * 0.93), 34 * u);
    ctx.fillStyle = '#fff'; ctx.fillRect(x(power) - 3, gy - 8 * u, 6, 50 * u);
    txt(ctx, `${Math.round(power)} W`, cx, gy + 96 * u, { size: 56 * u, align: 'center', maxW: bw });
    panel(ctx, cx - bw / 2, gy + 130 * u, bw, 16 * u, { r: 8 * u, fill: 'rgba(255,255,255,.12)' });                 // the "tempo" bar
    panel(ctx, cx - bw / 2, gy + 130 * u, Math.max(16 * u, bw * this.fill), 16 * u, { r: 8 * u, fill: this.fill > 0.5 ? '#2bd67b' : HUD.gold });
    const left = Math.max(0, Math.ceil(this.total - this.el)); txt(ctx, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, W - 16, 92 * u, { size: 26 * u, align: 'right' });          // below the app's top bar
    this.drawProfile(cx - bw / 2, gy + 190 * u, bw, 150 * u);
    if (this.wait) txt(ctx, t('games.tempo.keep'), cx, H - 60 * u, { size: 24 * u, align: 'center', color: HUD.gold, maxW: bw });
    this.hooks.progress?.drawToasts(ctx, W, dt);
  }
  // the session as bars (height = target watts); green = you held it, gold = missed, white outline = now. Fills the screen with something useful.
  drawProfile(x, y, w, h) {
    const { ctx } = this; const cs = this.cells; const max = Math.max(...cs.map((c) => c.w)); const bw = w / cs.length;
    cs.forEach((c, i) => {
      const bh = Math.max(6, (h * c.w) / max); const done = c.tot > 0 ? c.in / c.tot >= 0.6 : false; const past = this.el >= c.t1;
      ctx.fillStyle = past ? (done ? '#2bd67b' : HUD.gold) : 'rgba(255,255,255,.22)'; ctx.fillRect(x + i * bw + 2, y + h - bh, Math.max(2, bw - 4), bh);
      if (this.state === 'play' && this.el >= c.t0 && this.el < c.t1) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(x + i * bw + 2, y + h - bh, Math.max(2, bw - 4), bh); }
    });
  }
  drawResults() {
    const r = this.result; const u = uiScale(this.W, this.H); const land = this.W > this.H * 1.15;
    this.drawProfile(land ? this.W * 0.55 : Math.max(20, this.W / 2 - 210 * u), 190 * u, land ? this.W * 0.38 : Math.min(this.W - 40, 420 * u), 150 * u);   // how each block went
    this.results.draw(this.ctx, this.W, this.H, {
      title: t('games.tempo.res.title'), subtitle: t('games.tempo.name'), stars: r.stars,
      criteria: [{ ok: true, label: t('games.wk.res.done') }, { ok: r.ratio >= 0.6, label: t('games.tempo.crit.zone', { p: 60 }) }, { ok: r.ratio >= 0.85, label: t('games.tempo.crit.zone', { p: 85 }) }],
      score: r.score, best: r.best ? String(r.best) : null, newBest: r.newBest, lines: r.wk ? [t('games.wk.res.band', { p: Math.round(r.ratio * 100) })] : [],
    });
  }
}
