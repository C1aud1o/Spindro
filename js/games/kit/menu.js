// Menu di partenza e schermata dei risultati UGUALI per tutti i giochi (docs/giochi-design.md, "Menu e risultati").
//
// Comandi (Zwift Click + / −, tastiera, tocco):
//   pressione breve −  → cambia la durata (5 / 10 / 20 min)
//   pressione breve +  → cambia il livello (Facile / Normale / Difficile)
//   pressione lunga +  → parte (≈0,6 s, barra che si riempie)
//   rullo collegato: oltre 30 W per 6 s → parte (il conto riparte a ogni scelta)
//   tocco: pillole e tasto VIA
// Il gioco inoltra i suoi punti d'ingresso: input(dir) → menu.input(dir), hold(dir) → menu.hold(dir), e ogni fotogramma
// menu.update(dt, { connected, power }) + menu.draw(ctx, W, H). Il menu non conosce il gioco: chiama `onStart(durIdx, level)`.
import { t } from '../../i18n.js';
import { txt, panel, HUD, uiScale, fitText } from './hud.js';
import { minutesLeft } from './workout-plan.js';

export const LENGTHS = [5, 10, 20]; // minuti
export const LEVEL_KEYS = ['easy', 'normal', 'hard'];
export const HOLD_START = 0.6; // s di + premuto per partire
export const PEDAL_WATTS = 30; export const PEDAL_SECS = 6; // pedalare oltre 30 W per 6 s parte: c'è il tempo di scegliere, e ogni scelta fa ripartire il conto
const SETTLE = 0.4; // s dall'apertura in cui i tasti non fanno nulla (evita avvii involontari)
const clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, v | 0));

function layout(W, H) {
  const land = W > H * 1.15;
  const u = land ? Math.min(uiScale(W, H), H / 600) : uiScale(W, H);
  const colW = land ? Math.min(W * 0.38, 440 * u) : W;
  const x0 = land ? 24 : 0; // bordo sinistro della colonna
  return { land, u, colW, x0, cx: x0 + colW / 2, inner: colW - 28 };
}
const ink = '#15141b';
function scrims(ctx, W, H, L, top, bottom) {
  if (L.land) { // colonna a sinistra: velo da sinistra
    const g = ctx.createLinearGradient(0, 0, L.x0 + L.colW + 40, 0); g.addColorStop(0, 'rgba(8,8,12,.92)'); g.addColorStop(0.85, 'rgba(8,8,12,.78)'); g.addColorStop(1, 'rgba(8,8,12,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, L.x0 + L.colW + 40, H);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, 0, top); g.addColorStop(0, 'rgba(8,8,12,.92)'); g.addColorStop(0.8, 'rgba(8,8,12,.8)'); g.addColorStop(1, 'rgba(8,8,12,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, top);
  const g2 = ctx.createLinearGradient(0, H - bottom, 0, H); g2.addColorStop(0, 'rgba(8,8,12,0)'); g2.addColorStop(0.35, 'rgba(8,8,12,.85)'); g2.addColorStop(1, 'rgba(8,8,12,.95)');
  ctx.fillStyle = g2; ctx.fillRect(0, H - bottom, W, bottom);
}
function pill(ctx, x, y, w, h, label, on, col, u) {
  panel(ctx, x, y, w, h, { r: 12 * u, fill: on ? col : 'rgba(54,56,66,.8)' });
  txt(ctx, label, x + w / 2, y + h * 0.67, { size: 20 * u, align: 'center', color: on ? ink : HUD.white, stroke: on ? null : undefined, maxW: w - 8 });
}
const stars = (n, of = 3) => '★'.repeat(n) + '☆'.repeat(Math.max(0, of - n));

export class GameMenu {
  // id: 'racer', …; title/pitch/howto: stringhe già tradotte (o funzioni che le restituiscono); howto: ≤ 3 righe brevi.
  // best(durIdx, level) → { stars: 0–3, text: 'record' | null }; load() → { durIdx, level }; save({ durIdx, level }).
  constructor({ id, title, pitch, howto = [], best = null, load = null, save = null, onStart = () => {}, sfx = () => {}, ready = () => true, workout = () => null, lengths = LENGTHS }) {
    this.lengths = lengths; // minutes of the three length pills: the standard 5 / 10 / 20, or your own (e.g. [1, 2, 3] in the template game)
    this.workout = workout; this.id = id; this.title = title; this.pitch = pitch; this.howto = howto; this.best = best; this.onStart = onStart; this.sfx = sfx; this.ready = ready;
    this.saveFn = save; const s = (load ? load() : this.defaultLoad()) || {};
    this.durIdx = clampI(s.durIdx ?? 0, 0, this.lengths.length - 1); this.level = clampI(s.level ?? 1, 0, 2);
    this.zones = []; this.reset();
  }
  defaultLoad() { try { return { durIdx: Number(localStorage.getItem(`${this.id}Dur`)) || 0, level: localStorage.getItem(`${this.id}Level`) == null ? 1 : Number(localStorage.getItem(`${this.id}Level`)) }; } catch { return {}; } }
  save() {
    if (this.saveFn) { this.saveFn({ durIdx: this.durIdx, level: this.level }); return; }
    try { localStorage.setItem(`${this.id}Dur`, this.durIdx); localStorage.setItem(`${this.id}Level`, this.level); } catch { /* niente storage */ }
  }
  get minutes() { return this.lengths[this.durIdx]; }
  // da chiamare quando il menu (ri)appare
  // `queued`: START was pressed while the game was still loading; it survives reset() and starts the run as soon as the menu is ready.
  // `loadFrac` (0..1) is set by the game every frame while it loads: the menu is then drawn with a progress bar and a disabled START.
  reset() { this.age = 0; this.pend = null; this.hd = 0; this.ht = 0; this.fired = false; this.pedT = 0; this.started = false; this.loadFrac = null; }
  get loading() { return this.loadFrac != null && !this.ready(); }
  get fill() { return Math.max(this.hd > 0 && !this.fired ? Math.min(1, this.ht / HOLD_START) : 0, Math.min(1, this.pedT / PEDAL_SECS)); }

  // allenamento in corso sotto al gioco: la durata la decide lui (niente scelta 5/10/20)
  get wk() { try { return this.workout() || null; } catch { return null; } }
  cycleLength() { if (this.wk) return; this.durIdx = (this.durIdx + 1) % this.lengths.length; this.pedT = 0; this.sfx('select'); this.save(); }
  cycleLevel() { this.level = (this.level + 1) % 3; this.pedT = 0; this.sfx('select'); this.save(); }
  start() {
    if (this.started || this.age < SETTLE) return;
    if (!this.ready()) { if (this.loadFrac != null && !this.queued) { this.queued = true; this.sfx('select'); } return; } // still loading: remember the press
    this.queued = false; this.started = true; this.save(); this.sfx('pickup'); this.onStart(this.durIdx, this.level); }

  // + / − (pressione, subito): la pressione breve agisce al rilascio; se hold() non arriva (prove, tastiere senza rilascio) agisce dopo 60 ms
  input(dir) { if (!dir || this.age < SETTLE) return; this.pend = { dir, t: 0, held: false }; }
  hold(dir) {
    if (dir) { if (this.pend && this.pend.dir === dir) this.pend.held = true; this.hd = dir; this.ht = 0; this.fired = false; return; }
    const p = this.pend;
    if (p && p.held && this.hd === p.dir && !this.fired && this.ht < HOLD_START) this.act(p.dir);
    this.pend = null; this.hd = 0; this.ht = 0; this.fired = false;
  }
  act(dir) { if (dir < 0) this.cycleLength(); else this.cycleLevel(); }
  update(dt, { connected = false, power = 0 } = {}) {
    this.age += dt;
    if (this.queued && this.ready()) this.start(); // START was pressed during loading
    if (this.pend && !this.pend.held) { this.pend.t += dt; if (this.pend.t >= 0.06) { const d = this.pend.dir; this.pend = null; this.act(d); } }
    if (this.hd > 0 && !this.fired) { this.ht += dt; if (this.ht >= HOLD_START) { this.fired = true; this.pend = null; this.start(); } }
    if (connected && power > PEDAL_WATTS && this.age >= SETTLE) { this.pedT += dt; if (this.pedT >= PEDAL_SECS) this.start(); } else this.pedT = Math.max(0, this.pedT - dt * 2);
  }

  // tocco su pillole e tasto VIA; true se l'ha gestito (il chiamante ferma l'evento)
  tap(x, y) {
    if (this.age < SETTLE) return false;
    for (const z of this.zones) if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
      if (z.kind === 'len') { if (this.wk) return true; this.durIdx = z.i; this.pedT = 0; this.sfx('select'); this.save(); } else if (z.kind === 'lvl') { this.level = z.i; this.pedT = 0; this.sfx('select'); this.save(); } else if (z.kind === 'start') this.start();
      return true;
    }
    return false;
  }
  // ascolta i tocchi sul canvas dell'HUD (in cattura, così non parte anche il + / − della metà schermo); isOn() = il menu è visibile
  attach(canvas, size, isOn) {
    const fn = (e) => {
      if (e.target !== canvas || !isOn()) return;
      const r = canvas.getBoundingClientRect(); const { W, H } = size();
      if (this.tap((e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height))) { e.stopImmediatePropagation(); e.preventDefault(); }
    };
    window.addEventListener('pointerdown', fn, true);
    return () => window.removeEventListener('pointerdown', fn, true);
  }

  draw(ctx, W, H, { connected = false } = {}) {
    const L = layout(W, H); const { u, cx, inner } = L; const T = (v) => (typeof v === 'function' ? v() : v);
    this.zones = [];
    scrims(ctx, W, H, L, 372 * u, 128 * u);
    const al = 'center'; let y = (L.land ? 70 : 84) * u;
    txt(ctx, T(this.title), cx, y, { size: 46 * u, align: al, color: HUD.lime, italic: true, maxW: inner });
    y += 26 * u; txt(ctx, T(this.pitch), cx, y, { size: 15 * u, align: al, color: HUD.dim, font: 'text', maxW: inner, minK: 0.75 });
    const cw = Math.min(110 * u, (inner - 16) / 3); const px0 = cx - (cw * 3 + 16) / 2;
    const wk = this.wk;
    if (wk) { // la riga della durata diventa una sola riga: l'allenamento è la partita
      y += 38 * u; panel(ctx, px0, y, cw * 3 + 16, 40 * u, { r: 12 * u, fill: HUD.lime });
      txt(ctx, t('games.menu.wkLine', { name: wk.name, n: minutesLeft(wk) }), cx, y + 40 * u * 0.67, { size: 17 * u, align: al, color: ink, stroke: null, maxW: cw * 3 + 16 - 16, minK: 0.6 });
    } else {
    y += 30 * u; txt(ctx, t('games.menu.length'), cx, y, { size: 13 * u, align: al, color: HUD.dim, font: 'text' });
    y += 8 * u; this.lengths.forEach((m, i) => { const x = px0 + i * (cw + 8); pill(ctx, x, y, cw, 40 * u, t('games.menu.min', { n: m }), i === this.durIdx, HUD.lime, u); this.zones.push({ kind: 'len', i, x, y, w: cw, h: 40 * u }); });
    }
    y += 62 * u; txt(ctx, t('games.menu.level'), cx, y, { size: 13 * u, align: al, color: HUD.dim, font: 'text' });
    y += 8 * u; LEVEL_KEYS.forEach((k, i) => { const x = px0 + i * (cw + 8); pill(ctx, x, y, cw, 40 * u, t(`games.menu.${k}`), i === this.level, HUD.cyan, u); this.zones.push({ kind: 'lvl', i, x, y, w: cw, h: 40 * u }); });
    y += 40 * u + 8 * u;
    for (const line of (wk ? [t('games.menu.wkHold')] : T(this.howto)).slice(0, 3)) { y += 21 * u; txt(ctx, line, cx, y, { size: 14 * u, align: al, color: HUD.white, font: 'text', maxW: inner, minK: 0.7 }); }
    const b = this.best && !wk ? this.best(this.durIdx, this.level) : null;
    if (wk) y += 8 * u; else {
    y += 28 * u; txt(ctx, `${stars(b?.stars || 0)}${b?.text ? `  ·  ${t('games.menu.best', { v: b.text })}` : `  ·  ${t('games.menu.noBest')}`}`, cx, y, { size: 17 * u, align: al, color: HUD.gold, font: 'text', maxW: inner, minK: 0.7 });
    }
    this.contentBottom = y; // il personaggio sta sotto: tra contentBottom e startTop
    // tasto VIA con barra di pressione lunga; sotto, il suggerimento dei tasti
    const bw = Math.min(inner, 300 * u); const bh = 46 * u; const bx = cx - bw / 2; const by = L.land ? Math.max(y + 24 * u, H - 120 * u) : H - 96 * u;
    this.startTop = by - 22 * u;
    const loading = this.loading; const lf = Math.max(0, Math.min(1, this.loadFrac || 0));
    txt(ctx, loading ? (this.queued ? t('games.menu.loadingQueued') : t('games.menu.loading', { n: Math.round(lf * 100) })) : t(wk ? 'games.menu.wkKeys' : 'games.menu.keys'), cx, by - 8 * u, { size: 14 * u, align: al, color: loading ? HUD.white : HUD.lime, font: 'text', maxW: inner, minK: 0.7 });
    panel(ctx, bx, by, bw, bh, { r: 14 * u, fill: 'rgba(12,12,18,.78)', tint: HUD.lime, tintA: loading ? 0.12 : 0.28 });
    if (loading) { ctx.save(); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 14 * u) : ctx.rect(bx, by, bw, bh); ctx.clip(); ctx.fillStyle = 'rgba(217,255,61,.28)'; ctx.fillRect(bx, by, bw * lf, bh); ctx.restore(); }
    const f = loading ? 0 : this.fill;
    if (f > 0) { ctx.save(); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 14 * u) : ctx.rect(bx, by, bw, bh); ctx.clip(); ctx.fillStyle = HUD.lime; ctx.fillRect(bx, by, bw * f, bh); ctx.restore(); }
    ctx.save(); if (loading) ctx.globalAlpha = 0.5;
    txt(ctx, t('games.menu.start'), cx, by + bh * 0.67, { size: 22 * u, align: al, color: f > 0.5 ? ink : HUD.lime, stroke: f > 0.5 ? null : undefined, maxW: bw - 16 });
    ctx.restore();
    this.zones.push({ kind: 'start', x: bx, y: by, w: bw, h: bh });
    if (connected && !loading) txt(ctx, t('games.menu.pedal'), cx, by + bh + 20 * u, { size: 13 * u, align: al, color: HUD.dim, font: 'text', maxW: inner });
  }
}

// ---------- risultati ----------
// r = { title, subtitle?, stars (1–3), criteria: [{ ok, label }], score: number|string, best: string|null, newBest, lines?: [string], note?: string }
export class ResultsView {
  constructor({ onAgain = () => {}, onBack = () => {}, sfx = () => {}, minAge = 1.5 } = {}) { this.onAgain = onAgain; this.onBack = onBack; this.sfx = sfx; this.minAge = minAge; this.zones = []; this.age = 0; }
  reset() { this.age = 0; }
  update(dt) { this.age += dt; }
  get ready() { return this.age >= this.minAge; }
  // + = ancora, − = indietro
  input(dir) { if (!this.ready || !dir) return; this.sfx('select'); if (dir > 0) this.onAgain(); else this.onBack(); }
  tap(x, y) { if (!this.ready) return false; for (const z of this.zones) if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) { this.input(z.dir); return true; } return false; }
  attach(canvas, size, isOn) {
    const fn = (e) => {
      if (e.target !== canvas || !isOn()) return;
      const r = canvas.getBoundingClientRect(); const { W, H } = size();
      if (this.tap((e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height))) { e.stopImmediatePropagation(); e.preventDefault(); }
    };
    window.addEventListener('pointerdown', fn, true);
    return () => window.removeEventListener('pointerdown', fn, true);
  }

  draw(ctx, W, H, r) {
    const L = layout(W, H); const { u, cx, inner } = L; const al = 'center'; this.zones = [];
    const rows = (r.criteria || []).length + (r.lines || []).length;
    const panelH = (rows * 22 + 120 + (r.note ? 20 : 0)) * u;
    scrims(ctx, W, H, L, 190 * u, panelH + 120 * u);
    let y = (L.land ? 70 : 90) * u;
    txt(ctx, r.title, cx, y, { size: 44 * u, align: al, color: HUD.lime, italic: true, maxW: inner });
    if (r.subtitle) { y += 26 * u; txt(ctx, r.subtitle, cx, y, { size: 17 * u, align: al, color: HUD.white, font: 'text', maxW: inner }); }
    y += 46 * u; txt(ctx, stars(r.stars), cx, y, { size: 40 * u, align: al, color: HUD.gold, font: 'text', maxW: inner });
    // pannello in basso (in orizzontale: sotto le stelle, nella stessa colonna)
    const pw = Math.min(inner, 360 * u); const px = cx - pw / 2;
    const bottom = H - 24 * u; const bh = 44 * u; const btnY = bottom - bh;
    const need = (22 + (r.criteria || []).length * 22 + 34 + 24 + (r.lines || []).length * 22 + (r.note ? 24 : 0)) * u;
    const py = L.land ? y + 22 * u : Math.max(y + 24 * u, btnY - 12 * u - need);
    panel(ctx, px, py, pw, L.land ? need : btnY - 12 * u - py, { r: 14 * u, fill: 'rgba(12,12,18,.78)' });
    let yy = py + 8 * u;
    for (const c of r.criteria || []) { yy += 22 * u; txt(ctx, `${c.ok ? '✓' : '✗'}  ${c.label}`, px + 14 * u, yy, { size: 15 * u, color: c.ok ? HUD.lime : '#9aa0aa', font: 'text', maxW: pw - 28 * u, minK: 0.7 }); }
    yy += 34 * u; txt(ctx, `${t('games.res.score')}  ${r.score}`, cx, yy, { size: 28 * u, align: al, color: HUD.white, maxW: pw - 20 * u });
    yy += 24 * u; txt(ctx, r.newBest ? t('games.res.newBest') : r.best ? t('games.res.best', { v: r.best }) : '', cx, yy, { size: 15 * u, align: al, color: r.newBest ? HUD.lime : HUD.gold, font: 'text', maxW: pw - 20 * u });
    for (const l of r.lines || []) { yy += 22 * u; txt(ctx, l, cx, yy, { size: 14 * u, align: al, color: HUD.dim, font: 'text', maxW: pw - 20 * u, minK: 0.7 }); }
    if (r.note) txt(ctx, r.note, cx, btnY - 20 * u, { size: 14 * u, align: al, color: HUD.cyan, font: 'text', maxW: pw });
    // + = ancora, − = indietro (anche a tocco)
    const gap = 10 * u; const bw = (pw - gap) / 2; const a = this.ready ? 1 : 0.35;
    ctx.save(); ctx.globalAlpha = a;
    panel(ctx, px, btnY, bw, bh, { r: 14 * u, fill: HUD.lime });
    txt(ctx, t('games.res.again'), px + bw / 2, btnY + bh * 0.66, { size: 17 * u, align: al, color: ink, stroke: null, maxW: bw - 10 });
    panel(ctx, px + bw + gap, btnY, bw, bh, { r: 14 * u, fill: 'rgba(54,56,66,.8)' });
    txt(ctx, t('games.res.back'), px + bw + gap + bw / 2, btnY + bh * 0.66, { size: 17 * u, align: al, color: HUD.white, maxW: bw - 10 });
    ctx.restore();
    this.zones.push({ dir: 1, x: px, y: btnY, w: bw, h: bh }, { dir: -1, x: px + bw + gap, y: btnY, w: bw, h: bh });
  }
}
