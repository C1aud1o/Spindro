// Base comune dei giochi 3D "semplici": ciclo, menu, fine partita, sensori, testi a comparsa.
// Ogni gioco implementa: assets(), build(), reset(), press(dir), step(dt), view(dt), hud(ctx, W, H) e summary().
import { THREE, Stage, loadAll } from './kit3d.js';
import { Effort, clamp } from './engine.js';
import { txt as hudText, hudView, paragraph, wrapLines, MessageQueue } from './kit/hud.js';
import { SONGS } from './audio.js';
import { t } from '../i18n.js';

export class Base3D {
  constructor(hudCanvas, hooks, audio, { key, title, tagline, rules, song = 'race' }) {
    Object.assign(this, { hudCanvas, hooks, audio, key, title, tagline, rules, songName: song });
    this.active = false; this.best = Number(localStorage.getItem(`${key}Best`)) || 0;
    this.loop = this.loop.bind(this);
  }

  async start() {
    this.active = true; this.camInit = false;
    this.stage = new Stage(this.hudCanvas);
    this.effort = new Effort();
    this.state = 'loading'; this.t = 0; this.msgs = new MessageQueue(); this.pops = []; this.held = 0; this.heldT = 0;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
    this.audio.playSong(SONGS.menu);
    try {
      this.m = await loadAll(this.assets(), (p) => { this.loadPct = p; });
      await this.preload?.();
      if (!this.active) return;
      this.build(); this.reset();
      this.state = 'menu'; this.stateT = 0;
    } catch (err) { this.state = 'error'; this.error = err.message; }
  }

  stop() { this.active = false; this.audio.stopSong(); this.hooks.setGrade(null); this.stage?.dispose(); }

  input(dir) {
    this.audio.ensure();
    if (this.state === 'menu') { if (dir > 0 && this.stateT > 0.4) this.begin(); return; }
    if (this.state === 'over') { if (this.stateT > 1.2) { this.reset(); this.begin(); } return; }
    if (this.state === 'play') this.press(dir);
  }

  hold(dir) { this.held = dir; this.heldT = 0; }

  begin() {
    this.state = 'play'; this.stateT = 0; this.score = 0;
    this.audio.playSong(SONGS[this.songName] || SONGS.race); this.audio.sfx('go');
    this.hooks.runStart?.();
    this.onBegin?.();
  }

  end(extraXp = 0) {
    if (this.state !== 'play') return;
    this.score = Math.round(this.score);
    this.state = 'over'; this.stateT = 0;
    this.audio.stopSong(); this.audio.sfx('lose');
    this.newBest = this.score > this.best;
    if (this.newBest) { this.best = this.score; localStorage.setItem(`${this.key}Best`, this.best); this.audio.sfx('win'); }
    this.hooks.progress?.event('races', 0, 20 + extraXp);
    this.hooks.runEnd?.({ game: this.key, score: this.score });
    this.hooks.setGrade(0);
  }

  // messaggi a centro schermo: uno alla volta, con priorità (kit/hud.js MessageQueue)
  say(text, color = '#ffd34d', t = 1.6, big = false, prio = big ? 2 : 1) { this.msgs.say(text, { color, dur: t, big, prio }); }
  pop(text, color, x, y, z, t = 0.9) { this.pops.push({ text, color, x, y, z, t, t0: t }); }
  prog(stat, n = 1, xp = 0) { this.hooks.progress?.event(stat, n, xp); }

  // legge rullo e sensori (in demo valori finti, così si può provare senza rullo)
  sense(dt) {
    const connected = this.hooks.connected(); const st = this.hooks.stats();
    const demo = !connected;
    this.connected = connected;
    this.power = demo ? (this.demoPower?.() ?? 170 + 60 * Math.sin(this.t * 0.6)) : st.power || 0;
    this.cadence = demo ? 88 : st.cadence || 0;
    this.kmh = demo ? 28 : this.hooks.speedKmh();
    this.sprinting = this.effort.update(this.power, dt, demo ? 0 : 50);
    if (this.audio.song) this.audio.setTempo(this.audio.song.bpm * clamp((this.cadence || 85) / 88, 0.85, 1.25));
  }

  // sterzata continua: un tocco = passo singolo, tenuto premuto = movimento fluido
  steer(dt, speed) {
    if (!this.held) return 0;
    this.heldT += dt;
    return this.heldT > 0.12 ? this.held * speed * dt : 0;
  }

  loop(now) {
    if (!this.active) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now; this.t += dt;
    this.sense(dt);
    this.msgs.update(dt);
    if (this.state !== 'loading' && this.state !== 'error') {
      this.stateT += dt;
      if (this.state === 'play') this.step(dt);
      this.view(dt);
      this.stage.render();
    }
    this.drawHud(dt);
    requestAnimationFrame(this.loop);
  }

  drawHud(dt) {
    const { ctx, W, H } = this.stage;
    ctx.clearRect(0, 0, W, H); hudView(ctx, W, H);
    if (this.state === 'loading') { ctx.fillStyle = '#0f0e0c'; ctx.fillRect(0, 0, W, H); hudText(ctx, t('games.common.loading'), W / 2, H / 2, { size: 22, align: 'center', color: '#d9ff3d' }); hudText(ctx, `${Math.round((this.loadPct || 0) * 100)}%`, W / 2, H / 2 + 28, { size: 14, align: 'center' }); return; }
    if (this.state === 'error') { hudText(ctx, t('ui.error', { error: this.error }), W / 2, H / 2, { size: 14, align: 'center', color: '#ff6b6b' }); return; }
    if (this.state === 'menu') {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(8,10,16,.85)'); g.addColorStop(0.45, 'rgba(8,10,16,.15)'); g.addColorStop(1, 'rgba(8,10,16,.92)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      hudText(ctx, t(this.title), W / 2, 120, { size: 50, align: 'center', color: '#d9ff3d' });
      hudText(ctx, t(this.tagline), W / 2, 150, { size: 15, align: 'center' });
      // regole: a capo automatico, corpo ridotto finché stanno tra il titolo e "Pedala per iniziare"
      const rules = this.rules.map((l) => '· ' + t(l)); const top = Math.max(H * (W < H ? 0.27 : 0.42), 180); const bottom = W < H ? H * 0.66 : H - 84; /* in verticale resta sopra il ciclista */ const mw = Math.min(W - 28, 560);
      let fs = W < 500 ? 16 : 19;
      const need = () => rules.reduce((a, r) => a + wrapLines(ctx, r, mw, fs, { font: 'text' }).length, 0) * 1.28 * fs + rules.length * 6 + fs * 1.6;
      while (fs > 10 && need() > bottom - top) fs -= 0.5;
      let y = top;
      for (const r of rules) y = paragraph(ctx, r, W / 2, y, { size: fs, maxW: mw, lineK: 1.28, color: '#f0f0f0' }).bottom + 6;
      hudText(ctx, t('games.common.best', { n: this.best }), W / 2, Math.min(y + fs * 0.8, bottom + 4), { size: fs, align: 'center', color: '#c8c8c8', font: 'text' });
      hudText(ctx, t('games.common.start'), W / 2, H - 50, { size: 20, align: 'center', color: '#d9ff3d' });
      this.hooks.progress?.drawToasts(ctx, W, dt);
      return;
    }
    this.hud(ctx, W, H, dt);
    const v3 = new THREE.Vector3();
    for (const p of this.pops) {
      p.t -= dt; const k = 1 - p.t / p.t0;
      v3.set(p.x, p.y + k * 1.8, p.z).project(this.stage.camera);
      ctx.globalAlpha = clamp((p.t / p.t0) * 2, 0, 1);
      hudText(ctx, p.text, (v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H, { size: 20, align: 'center', color: p.color });
      ctx.globalAlpha = 1;
    }
    this.pops = this.pops.filter((p) => p.t > 0);
    this.msgs.draw(ctx, W, H, { u: W < 500 ? 0.9 : 1.1, y: H * 0.34 });
    if (!this.connected) hudText(ctx, t('games.common.demo'), W / 2, H - 12, { size: 14, align: 'center', color: '#ffd34d', font: 'text' });
    if (this.state === 'over') {
      ctx.fillStyle = 'rgba(8,8,14,.8)'; ctx.fillRect(0, 0, W, H);
      const [head, ...lines] = this.summary();
      hudText(ctx, head, W / 2, H * 0.32, { size: 30, align: 'center', color: '#d9ff3d' });
      hudText(ctx, `${t('games.common.score', { n: Math.round(this.score) })}${this.newBest ? t('games.common.newBest') : ''}`, W / 2, H * 0.32 + 40, { size: 18, align: 'center' });
      let ly = H * 0.32 + 70; lines.forEach((l) => { ly = paragraph(ctx, l, W / 2, ly, { size: 16, maxW: W - 32, color: '#f0f0f0', maxLines: 3 }).bottom + 4; });
      if (this.stateT > 1.2) hudText(ctx, t('games.common.retry'), W / 2, Math.min(H - 40, Math.max(H * 0.32 + 150, ly + 24)), { size: 22, align: 'center', color: '#d9ff3d' });
    }
    this.hooks.progress?.drawToasts(ctx, W, dt);
  }

  // barra potenza standard con soglia sprint
  powerBar(ctx, x, y, w) {
    ctx.fillStyle = 'rgba(10,8,16,.6)'; ctx.fillRect(x, y, w, 12);
    const maxW = Math.max(400, (this.effort.threshold || 200) * 1.6);
    ctx.fillStyle = this.sprinting ? '#4de3ff' : '#d9ff3d'; ctx.fillRect(x, y, w * clamp(this.power / maxW, 0, 1), 12);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + w * clamp((this.effort.threshold || 0) / maxW, 0, 1) - 1, y - 3, 2, 18);
    hudText(ctx, `${Math.round(this.power)} W`, x + 6, y + 10, { size: 10 });
  }
}
