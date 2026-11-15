// BREAKAWAY: il "direttore di corsa". Logica pura (niente three.js): tappa a tempo, momenti annunciati,
// rivali con un profilo in % della FTP del giocatore, obiettivi, commento, punti e stelle.
// Si può provare in Node (scripts/racer-sim-check.mjs) senza browser.
//
// Idea: il gruppo ("pack") segue un copione di ritmo espresso come potenza equivalente in % della FTP del giocatore.
// Un rivale va alla velocità del ritmo del momento × il suo profilo (scalatore, velocista, passista).
// Il giocatore va alla velocità della sua potenza reale ÷ FTP: stessa curva per tutti, quindi la gara
// è combattuta con 120 W di FTP come con 320.

import { workoutStars } from './kit/workout-plan.js';

export const LANES = [-2.4, 0, 2.4];
export const START = 14;       // m: dove parte il giocatore
export const V100 = 10.5;      // m/s nel mondo di gioco a 100 % FTP in piano, senza scia
export const COOL = 30;        // s di defaticamento dopo l'arrivo (podio e riepilogo)
export const LEVELS = [0.9, 1, 1.1]; // Facile / Normale / Difficile: percentuali del copione
export const DRAFT_GAIN = 0.22;      // in scia servono il 22 % di watt in meno a parità di velocità
export const TUNE = { coh: 1500, cohTight: 900, wait: 200, waitMax: 0.15, chase: 500, chaseMax: 0.09, rho: [1.22, 1.08, 0.99, 0.94, 0.9, 0.87, 0.84], kD: [1.03, 1, 1.01] }; // da provare in scripts/racer-sim-check.mjs
export const MIN_GAP = 1.9; // m fra le ruote di due bici nella stessa corsia
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// velocità (m/s del mondo) per una potenza e (in frazione della FTP) e una pendenza g (%)
export function speedFor(e, g = 0) {
  e = Math.max(0.02, e); g = clamp(g, -2.5, 9);
  const need = (x) => x ** 1.25 + 0.2 * g * x;
  let lo = 0.02; let hi = 1.7;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (need(m) > e) hi = m; else lo = m; }
  return (lo + hi) / 2 * V100;
}

// ---------- copione della tappa ----------
// pace = ritmo del gruppo (potenza equivalente, frazione della FTP). obj: obiettivo del giocatore (in % della FTP).
const M = {
  start:   { pace: 0.9, obj: { type: 'stay' } },
  break:   { pace: 0.85, obj: { type: 'hold', pct: 1.05, sec: 40 }, pre: 10 },
  recover: { pace: 0.78, obj: { type: 'rest' } },
  sprint:  { pace: 0.95, obj: { type: 'kick', pct: 1.3, sec: 10 }, pre: 12 },
  climb:   { pace: 0.96, obj: { type: 'hold', pct: 0.9, sec: 0.7 }, pre: 10 }, // sec = frazione del momento
  chase:   { pace: 1.0, obj: { type: 'close', gap: 4 }, pre: 6 },
  final:   { pace: 1.0, obj: { type: 'hold', pct: 1.1, sec: 25 }, pre: 10 },
};
function plan(D) {
  const R = D - COOL;
  const m = (kind, dur) => ({ kind, dur });
  if (D <= 300) return [m('start', 35), m('break', 50), m('recover', 25), m('sprint', 35), m('recover', 20), m('climb', 65), m('final', R - 230)];
  if (D <= 600) return [m('start', 45), m('break', 55), m('recover', 30), m('sprint', 35), m('recover', 30), m('climb', 80), m('chase', 45), m('recover', 40), m('break', 55), m('recover', 30), m('sprint', 35), m('recover', 25), m('final', R - 505)];
  const cyc = [m('break', 55), m('recover', 30), m('sprint', 35), m('recover', 30), m('climb', 90), m('chase', 45), m('recover', 45)];
  const n = Math.max(1, Math.round((R - 55 - 125) / 330));
  const out = [m('start', 55)]; for (let i = 0; i < n; i++) out.push(...cyc);
  const used = out.reduce((a, x) => a + x.dur, 0);
  out.push(m('final', R - used));
  return out;
}
const CLIMB_GRADE = [3.5, 6, 4.5]; // per scenario (stage index)
const ROLL = [0.7, 1.4, 1.1];

// profilo dei rivali: ρ = forza di base; f = fattori per tipo di momento. Nomi e colori sono in racer3d.js (stessa posizione).
export const PROFILES = [
  { key: 'rouleur', rho: 1.0, f: { final: 1.0, chase: 1.04, break: 1.03, climb: 0.96, sprint: 0.95 } },
  { key: 'sprinter', rho: 1.0, f: { sprint: 1.0, final: 1.0, climb: 0.9, break: 0.97 } },
  { key: 'rouleur', rho: 1.03, f: { final: 1.0, chase: 1.05, break: 1.05, climb: 0.97, sprint: 0.97 } },
  { key: 'sprinter', rho: 0.99, f: { sprint: 1.0, final: 1.0, climb: 0.88, break: 0.96 } },
  { key: 'climber', rho: 1.0, f: { climb: 1.08, break: 1.08, chase: 1.1, sprint: 0.88, final: 0.95 } },
  { key: 'rouleur', rho: 0.93, f: { final: 0.97, chase: 1.0, break: 1.0, climb: 0.96, sprint: 0.93 } },
  { key: 'climber', rho: 0.96, f: { climb: 1.06, break: 1.0, chase: 1.02, sprint: 0.86, final: 0.93 } },
];
export const KICK = { sprinter: 1.3, rouleur: 1.1, climber: 1.0 }; // moltiplicatore negli ultimi metri di volata

// ritmo del gruppo (potenza equivalente) in un momento: fr = avanzamento 0..1, t = secondi dalla partenza
export function packPace(m, fr, t, scale) {
  const base = m.kind === 'break' ? (fr < 0.73 ? m.pace : 1.02) : m.pace;
  return base * scale * (t < 8 ? lerp(0.45, 1, clamp((t - 3) / 5, 0, 1)) : 1);
}

// ---------- allenamento in corso → momenti (kit/workout-plan.js workoutPlan) ----------
// Il tempo della gara è quello dell'allenamento, da `from` (secondi di allenamento in cui parte la gara) in poi.
//   warm → start · facile, recupero, defaticamento → recover · ritmo → climb · sforzo → break · scatto → sprint
//   l'ultimo tratto di lavoro (ritmo, sforzo o scatto) diventa la volata finale. Il ritmo del gruppo e l'obiettivo sono i
//   watt dell'allenamento: l'obiettivo è sempre «tieni il bersaglio del passo» (mai watt diversi).
const WK_MOMENT = { warm: 'start', easy: 'recover', recovery: 'recover', cool: 'recover', tempo: 'climb', effort: 'break', sprint: 'sprint' };
export function itemsFromWorkout(wp, from = 0) {
  const parts = wp.segs.map((g) => ({ g, a: Math.max(g.t0, from), b: g.t1 })).filter((x) => x.b - x.a > 0.5);
  const items = parts.map(({ g, a, b }) => {
    const dur = b - a; const kind = WK_MOMENT[g.kind];
    const hold = ['climb', 'break', 'sprint'].includes(kind) && dur >= 15;
    return { kind, dur, pace: g.pct, wkSeg: g, t0w: a, obj: kind === 'start' ? { type: 'stay' } : hold ? { type: 'hold', pct: g.pct, sec: Math.max(4, Math.round(dur * 0.6)) } : { type: 'rest' }, pre: hold ? 8 : undefined };
  });
  const last = items.map((x, i) => [x, i]).filter(([x]) => ['climb', 'break', 'sprint'].includes(x.kind)).pop();
  if (last) { const [x, i] = last; items[i] = { ...x, kind: 'final', obj: x.obj.type === 'hold' ? x.obj : { type: 'rest' }, pre: x.obj.type === 'hold' ? 8 : undefined }; }
  items.total = items.reduce((a, x) => a + x.dur, 0);
  return items;
}

// ---------- costruzione della tappa: momenti con posizione sulla strada ----------
export function buildTimeline(D, stage = 0, wkItems = null) {
  const items = wkItems || plan(D); const R = D - COOL;
  let climbs = [];
  const gradeFn = () => (s) => {
    let g = Math.sin(s / 190) * ROLL[stage] + Math.sin(s / 71 + 1) * ROLL[stage] * 0.4;
    for (const c of climbs) {
      const up = clamp((s - c.s0) / 90, 0, 1); const down = clamp((c.s1 + 30 - s) / 60, 0, 1);
      g = lerp(g, CLIMB_GRADE[stage] * (1 + Math.sin(s / 140) * 0.12), Math.min(up, down));
    }
    return clamp(g, -2.5, 8);
  };
  let grade = gradeFn(); let moments = [];
  for (let it = 0; it < 6; it++) {
    let s = START; let t = 0; moments = [];
    for (const it2 of items) {
      const def = { ...M[it2.kind], ...(it2.pace != null ? { pace: it2.pace } : {}), ...(it2.obj ? { obj: it2.obj } : {}) }; const s0 = s; const t0 = t;
      const dt = 0.1;
      for (; t < t0 + it2.dur - 1e-9; t += dt) s += (t < 3 ? 0 : speedFor(packPace(def, (t - t0) / it2.dur, t, 1), grade(s))) * dt;
      moments.push({ ...it2, ...def, t0, t1: t0 + it2.dur, s0, s1: s });
    }
    climbs = moments.filter((x) => x.kind === 'climb').map((x) => ({ s0: x.s0, s1: x.s1 }));
    grade = gradeFn();
  }
  // con un allenamento la tappa finisce con l'allenamento (a tempo), non al traguardo: la strada è più lunga di quanto il gruppo ne fa, così nessuno arriva prima
  const length = moments.at(-1).s1 * (wkItems ? 1.3 : 1);
  const lines = [];
  moments.forEach((m, i) => {
    m.i = i;
    if (m.kind === 'sprint') lines.push({ type: 'green', s: m.s1 - 8, mi: i });
    if (m.kind === 'climb') lines.push({ type: 'kom', s: m.s1 - 8, mi: i });
  });
  return { moments, lines, length: length, gradeAt: grade, duration: D, race: R, stage, climbs, wk: !!wkItems };
}

// ---------- la gara ----------
export class Race {
  constructor({ tl = null, duration = 300, stage = 0, level = 1, names = [], adapt = 0, seed = 1 } = {}) {
    this.tl = tl || buildTimeline(duration, stage); this.wk = !!this.tl.wk; // con un allenamento: tempo = quello dell'allenamento, watt = quelli dell'allenamento
    this.kD = TUNE.kD[duration <= 300 ? 0 : duration <= 600 ? 1 : 2]; this.D = duration; this.levelMul = LEVELS[level] ?? 1; this.adapt = adapt;
    this.names = names; this.events = []; this.log = [];
    let rs = seed; this.rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
    this.t = 0; this.P = START; this.packV = 0; this.mi = -1; this.announced = new Set();
    this.player = { s: START, x: 0, speed: 0, draft: 0, e: 0, lane: 1 };
    this.rivals = PROFILES.map((p, i) => ({
      i, ...p, s: START - 3 + (6 - i) * 1.7, x: LANES[i % 3], targetX: LANES[i % 3], speed: 0, fin: null,
      ph: this.rnd() * 6.28, out: 0, boost: 0, atk: 0,
    }));
    // chi attacca nelle fughe (a turno i più adatti) e chi scappa dopo la salita (uno scalatore)
    let nb = 0; let nc = 0;
    for (const m of this.tl.moments) {
      if (m.kind === 'break') { const ord = [...this.rivals].sort((a, b) => (TUNE.rho[b.i] * (b.f.break ?? 1)) - (TUNE.rho[a.i] * (a.f.break ?? 1))).map((r) => r.i); m.atk = nb % 2 ? [ord[2], ord[3]] : [ord[0], ord[1]]; nb++; }
      if (m.kind === 'chase') { const cl = this.rivals.filter((r) => r.key === 'climber').map((r) => r.i); m.esc = cl[nc++ % cl.length]; }
    }
    this.points = { green: {}, kom: {} }; this.lineCount = {};
    this.obj = null; this.objDone = 0; this.objTotal = 0; this.streak = { ok: 0, ko: 0 }; this.objHist = [];
    this.lastEvent = 0; this.lastPlace = 8; this.sayT = {};
    this.over = false; this.finT = null; this.winnerT = null; this.timeSpent = { top: 0 };
    this.escapee = null; this.pass = 0;
  }

  // il livello cambia la forza dei rivali; con un allenamento niente adattamento e mai i watt del giocatore (obiettivi in watt fissi)
  get scale() { return this.wk ? this.levelMul : this.levelMul * (1 + this.adapt); }
  moment(i = this.mi) { return this.tl.moments[Math.max(0, i)]; }
  say(key, p = {}, prio = 1, o = {}) {
    // lo stesso testo non si ripete a ruota
    if (this.sayT[key] != null && this.t - this.sayT[key] < (o.every ?? 6)) return;
    this.sayT[key] = this.t; this.lastEvent = this.t;
    const ev = { key, p, prio, t: this.t, ...o }; this.events.push(ev); this.log.push({ t: this.t, key, mi: this.mi });
  }
  place() { return this.ranking().findIndex((r) => r.me) + 1; }
  ranking() {
    const l = [{ me: true, s: this.player.s, fin: this.player.fin ?? null, i: -1 }];
    for (const r of this.rivals) l.push({ me: false, s: r.s, fin: r.fin, i: r.i });
    l.sort((a, b) => (a.fin != null && b.fin != null ? a.fin - b.fin : a.fin != null ? -1 : b.fin != null ? 1 : b.s - a.s));
    return l;
  }
  gapSec(r) { return (r.s - this.player.s) / Math.max(4, this.player.speed || 6); }
  // la corsia c è libera vicino a r? (nessun altro corridore, giocatore compreso, a meno di 3 m in lunghezza)
  laneFree(r, c) { const pl = this.player; if (Math.abs(pl.s - r.s) < 3.5 && Math.abs(pl.x - c) < 1.3) return false; return !this.rivals.some((q) => q !== r && Math.abs(q.s - r.s) < 3.5 && Math.abs(q.x - c) < 1.3); }
  pname(i) { return this.names[i] ?? `R${i + 1}`; }

  // momento della strada a una certa distanza; avanzamento 0..1 nel momento
  momentAt(s) { const ms = this.tl.moments; let i = 0; while (i < ms.length - 1 && s >= ms[i].s1) i++; return ms[i]; }
  frAt(m, s) { return clamp((s - m.s0) / Math.max(1, m.s1 - m.s0), 0, 1); }

  // ritmo (potenza equivalente, frazione della FTP del giocatore) di un rivale, in base al tratto di strada in cui si trova
  paceOf(r) {
    const m = this.momentAt(r.s); const fr = this.frAt(m, r.s);
    let base = m.kind === 'break' ? (fr < 0.73 ? m.pace : 1.02) : m.pace;
    let k = TUNE.rho[r.i] * (r.f[m.kind] ?? 1) * this.kD;
    if (m.kind === 'start' || m.kind === 'recover') k = 1 + (k - 1) * 0.3; // in gruppo vanno quasi tutti uguali: si vede un plotone, non una fila
    if (m.kind === 'break' && fr < 0.73 && m.atk?.includes(r.i)) k = m.atk[0] === r.i ? 1.08 : 1.05;
    if (m.kind === 'chase' && m.esc === r.i) k = fr < 0.8 ? 1.14 : 0.96;
    // volata: negli ultimi 120 m prima del traguardo
    const line = m.kind === 'sprint' ? m.s1 - 8 : m.kind === 'final' ? this.tl.length : null;
    if (line != null && r.s > line - 120 && r.s < line + 15) k *= KICK[r.key] * (m.kind === 'final' ? 1.0 : 0.97);
    const wob = 1 + Math.sin(this.t * 0.31 + r.ph) * 0.025;
    return base * k * wob * this.scale;
  }

  step(dt, { e = 0.7, x = null } = {}) {
    const tl = this.tl; const pl = this.player;
    this.t += dt; pl.e = e;
    // momento attuale (dalla posizione del giocatore): annunci, obiettivi
    let mi = this.mi < 0 ? 0 : this.mi;
    if (this.wk) while (mi < tl.moments.length - 1 && this.t >= tl.moments[mi].t1) mi++; // a tempo: i momenti seguono l'allenamento
    else while (mi < tl.moments.length - 1 && pl.s >= tl.moments[mi].s1) mi++;
    if (mi !== this.mi) this.enter(mi);
    const m = this.moment(); const fr = this.wk ? clamp((this.t - m.t0) / Math.max(1, m.t1 - m.t0), 0, 1) : this.frAt(m, pl.s);
    this.fr = fr;
    const nx = tl.moments[mi + 1];
    if (nx && nx.pre && !this.announced.has(nx.i) && (this.wk ? this.t >= nx.t0 - nx.pre : pl.s >= nx.s0 - nx.pre * Math.max(8, pl.speed))) { this.announced.add(nx.i); this.announce(nx); }
    const cd = this.t < 3; // via
    const ramp = this.t < 8 ? lerp(0.45, 1, clamp((this.t - 3) / 5, 0, 1)) : 1;
    // il gruppo = la mediana dei rivali
    const ss = this.rivals.map((r) => r.s).sort((a, b) => a - b); this.P = (ss[3] + ss[4]) / 2; this.packV = this.rivals.reduce((a, r) => a + r.speed, 0) / 7;
    // rivali
    const pl0 = this.player;
    for (const r of this.rivals) {
      if (r.fin != null && this.over) { r.s += r.speed * dt; continue; }
      const g = tl.gradeAt(r.s);
      let v = cd ? 0 : speedFor(this.paceOf(r) * ramp, g);
      // coesione: restano attorno al gruppo, tranne chi è in fuga
      const off = r.s - this.P;
      const rm = this.momentAt(r.s).kind;
      if (rm !== 'break' && rm !== 'chase') { const coh = rm === 'start' || rm === 'recover' ? TUNE.cohTight : TUNE.coh; v *= 1 + clamp(-off / coh, -0.05, 0.08); }
      // in partenza e nei recuperi il gruppo non scappa: chi è staccato di poco lo ritrova (nessuno resta solo al primo minuto)
      if ((rm === 'start' || rm === 'recover') && r.s > pl0.s) v *= 1 - clamp((this.P - pl0.s - 12) / TUNE.wait, 0, TUNE.waitMax);
      // il gruppo insegue chi scappa: più sei avanti, più forte tirano (così la tappa dura quanto previsto per tutti)
      if (this.t > 40) v *= 1 + clamp((pl0.s - r.s - 50) / TUNE.chase, 0, TUNE.chaseMax);
      r.speed += (v - r.speed) * Math.min(1, dt * 1.2);
      const prev = r.s; r.s += r.speed * dt;
      this.crossLines(r.i, prev, r.s);
      if (r.fin == null && r.s >= tl.length) { r.fin = this.t; this.arrived(r.i); }
      if (this.rnd() < dt * 0.22) { const c = LANES[Math.floor(this.rnd() * 3)]; if (this.laneFree(r, c)) r.targetX = c; }
      // chi sta dietro al giocatore, fra lui e la telecamera, si sposta di lato (non copre la scena)
      const behind = pl0.s - r.s; let evading = false; if (behind > 0.5 && behind < 9 && Math.abs(r.x - pl0.x) < 1.6) { evading = true; const alt = LANES.filter((c) => Math.abs(c - pl0.x) > 1.8 && this.laneFree(r, c)).sort((a, b) => Math.abs(a - r.x) - Math.abs(b - r.x))[0]; if (alt != null) r.targetX = alt; }
      r.x += (r.targetX - r.x) * Math.min(1, dt * (evading ? 3 : 1.6));
      // niente compenetrazioni: chi segue sta almeno a una bici di distanza
      for (const q of this.rivals) { if (q === r || Math.abs(q.x - r.x) > 1.0) continue; const gp = q.s - r.s; if (gp > 0 && gp < MIN_GAP) { r.s = q.s - MIN_GAP; r.speed = Math.min(r.speed, q.speed); } }
      if (Math.abs(pl0.x - r.x) <= 1.0 && pl0.s - r.s > 0 && pl0.s - r.s < MIN_GAP) { r.s = pl0.s - MIN_GAP; r.speed = Math.min(r.speed, pl0.speed); }
    }
    // giocatore: scia e blocco
    if (x != null) pl.x = x;
    let drafting = false; let blocked = null;
    for (const r of this.rivals) {
      const gap = r.s - pl.s; const same = Math.abs(r.x - pl.x) < 1.2;
      if (same && gap > 1.5 && gap < 10) drafting = true;
      if (Math.abs(r.x - pl.x) < 1.2 && gap > 0 && gap < 4 && pl.speed > r.speed - 0.2 && (!blocked || gap < blocked.gap)) blocked = { r, gap };
      
    }
    pl.draft = clamp(pl.draft + (drafting ? dt / 1.2 : -dt * 2), 0, 1);
    let v = speedFor(e * (1 + DRAFT_GAIN * pl.draft), tl.gradeAt(pl.s));
    this.blocked = blocked;
    if (blocked) v = Math.min(v, blocked.r.speed);
    pl.speed += (v - pl.speed) * Math.min(1, dt * (v > pl.speed ? 2.4 : 3));
    const prev = pl.s; pl.s = Math.min(tl.length, pl.s + pl.speed * dt);
    for (const r of this.rivals) if (Math.abs(r.x - pl.x) <= 1.0 && r.s > prev - 0.01 && pl.s > r.s - MIN_GAP) { pl.s = Math.max(prev, r.s - MIN_GAP); pl.speed = Math.min(pl.speed, r.speed); }
    this.crossLines(-1, prev, pl.s);
    if (pl.fin == null && pl.s >= tl.length - 0.001) { pl.fin = this.t; this.arrived(-1); }
    this.updateObjective(dt, m, fr);
    this.commentary(dt, m);
    return pl;
  }

  enter(i) {
    this.mi = i; const m = this.moment(); this.mt0 = this.t;
    this.closeObjective();
    if (m.kind === 'break') this.say('games.racer.say.attack', { name: this.pname(m.atk[0]) }, 3, { big: true, every: 0 });
    if (m.kind === 'chase') { this.escapee = m.esc; this.say('games.racer.say.escape', { name: this.pname(m.esc) }, 3, { big: true, every: 0 }); }
    if (m.kind === 'start') this.say('games.racer.say.start', {}, 2, { every: 0 });
    if (m.kind === 'recover' && i > 0) this.say('games.racer.say.recover', {}, 2, { every: 0 });
    if (m.kind === 'climb') this.say('games.racer.say.climbGo', {}, 2, { every: 0 });
    if (m.kind === 'final') this.say('games.racer.say.finalGo', {}, 3, { big: true, every: 0 });
    if (m.kind === 'sprint') this.say('games.racer.say.sprintGo', {}, 3, { big: true, every: 0 });
    this.openObjective(m);
  }
  announce(nx) {
    const key = { break: 'games.racer.say.preBreak', sprint: 'games.racer.say.preSprint', climb: 'games.racer.say.preClimb', chase: 'games.racer.say.preChase', final: 'games.racer.say.preFinal' }[nx.kind];
    if (key) this.say(key, { pct: Math.round(((nx.obj.pct ?? 1) * (this.wk ? 1 : this.scale)) * 20) * 5, sec: nx.obj.sec }, 3, { every: 0, big: true });
    this.next = nx; this.nextT = this.t;
  }

  // ---------- obiettivi ----------
  openObjective(m) {
    const o = m.obj; if (!o || o.type === 'rest') { this.obj = null; return; }
    const pct = o.pct != null ? o.pct * (this.wk ? 1 : this.scale) : null;
    const sec = o.type === 'hold' && o.sec < 1 ? Math.round(m.dur * o.sec) : o.sec;
    this.obj = { type: o.type, pct, sec, bar: 0, done: false, kind: m.kind, m, t: 0, gap: o.gap };
    this.objTotal++;
  }
  updateObjective(dt, m, fr) {
    const ob = this.obj; if (!ob || ob.done) return; const pl = this.player; ob.t += dt;
    if (ob.type === 'hold') {
      if (pl.e >= ob.pct * (this.wk ? 0.93 : 0.97)) ob.bar = Math.min(ob.sec, ob.bar + dt); else ob.bar = Math.max(0, ob.bar - dt * 0.5); // con un allenamento la tolleranza è ±7 % (come le stelle)
      if (ob.bar >= ob.sec) this.succeed();
    } else if (ob.type === 'kick') {
      const line = this.tl.lines.find((l) => l.mi === m.i)?.s ?? m.s1;
      if (pl.s > line - 170 && pl.s < line + 12) {
        if (pl.e >= ob.pct * 0.97) ob.bar = Math.min(ob.sec, ob.bar + dt); else ob.bar = Math.max(0, ob.bar - dt * 0.4);
        if (ob.bar >= ob.sec) this.succeed();
      }
    } else if (ob.type === 'close') {
      const r = this.rivals[this.escapee]; if (r && this.gapSec(r) <= ob.gap) this.succeed(); // raggiunta o superata
    }
  }
  succeed() {
    const ob = this.obj; ob.done = true; this.objDone++; this.streak.ok++; this.streak.ko = 0; this.objHist.push({ kind: ob.kind, ok: true, t: this.t });
    this.say('games.racer.say.objOk', { kind: ob.kind }, 3, { big: true, every: 0, ok: true });
    if (!this.wk && this.streak.ok >= 3 && this.adapt < 0.15) { this.adapt = Math.min(0.15, this.adapt + 0.05); this.streak.ok = 0; this.say('games.racer.say.harder', {}, 1, { every: 0 }); }
  }
  closeObjective() {
    const ob = this.obj; if (!ob) return;
    if (!ob.done) {
      let ok = false;
      if (ob.type === 'stay') ok = this.player.s >= this.P - 25;
      // chi attraversa il tratto più in fretta del tempo richiesto (è più veloce) ha successo se ha tenuto il ritmo quasi tutto il tempo
      if ((ob.type === 'hold' || ob.type === 'kick') && ob.t >= 0.6 * ob.sec && ob.bar >= 0.85 * Math.min(ob.sec, ob.t)) ok = true;
      if (ob.type === 'close') ok = false;
      if (ok) { ob.done = true; this.objDone++; this.streak.ok++; this.streak.ko = 0; this.objHist.push({ kind: ob.kind, ok: true, t: this.t }); this.say('games.racer.say.objOk', { kind: ob.kind }, 3, { big: true, every: 0, ok: true }); }
      else {
        this.streak.ko++; this.streak.ok = 0; this.objHist.push({ kind: ob.kind, ok: false, t: this.t });
        this.say('games.racer.say.objKo', { kind: ob.kind }, 2, { every: 0, ko: true });
        if (!this.wk && ob.type !== 'stay' && this.streak.ko >= 2 && this.adapt > -0.15) { this.adapt = Math.max(-0.15, this.adapt - 0.05); this.streak.ko = 0; this.say('games.racer.say.easier', {}, 1, { every: 0 }); }
      }
    }
    this.obj = null;
  }

  // ---------- punti, arrivi, commento ----------
  crossLines(who, from, to) {
    for (const ln of this.tl.lines) {
      if (!(from < ln.s && to >= ln.s)) continue;
      const n = this.lineCount[ln.s] || 0; this.lineCount[ln.s] = n + 1; if (n > 2) continue;
      const pts = [5, 3, 1][n]; const key = who < 0 ? 'TU' : this.pname(who);
      this.points[ln.type][key] = (this.points[ln.type][key] || 0) + pts;
      if (who < 0) this.say(ln.type === 'kom' ? 'games.racer.say.komMe' : 'games.racer.say.sprintMe', { place: n + 1, pts }, 3, { big: n === 0, every: 0, line: ln.type, n });
      else if (n === 0) this.say(ln.type === 'kom' ? 'games.racer.say.komWho' : 'games.racer.say.sprintWho', { name: this.pname(who) }, 2, { every: 0 });
    }
  }
  arrived(who) {
    if (this.winnerT == null) { this.winnerT = this.t; this.winner = who; }
    if (who < 0) { this.over = true; }
  }
  // fine tappa: il giocatore ha tagliato il traguardo, oppure sono passati 15 s dal vincitore
  checkEnd() {
    if (this.over) return true;
    if (this.winnerT != null && this.t - this.winnerT > 15) { this.over = true; this.timeout = true; }
    return this.over;
  }
  finalize(bandRatio = null) {
    this.closeObjective();
    // tempi stimati per chi non è arrivato
    for (const r of this.rivals) if (r.fin == null) r.fin = this.t + (this.tl.length - r.s) / Math.max(3, r.speed);
    if (this.player.fin == null) this.player.fin = this.t + (this.tl.length - this.player.s) / Math.max(3, this.player.speed);
    const place = this.place();
    const frac = this.objTotal ? this.objDone / this.objTotal : 0;
    const top3 = place <= 3;
    let stars = 1;
    if (this.objDone >= Math.ceil(this.objTotal * 0.6) || top3) stars = 2;
    if ((frac >= 0.7 && top3) || (this.objTotal > 0 && this.objDone === this.objTotal && frac >= 0.99)) stars = 3; // 3 stelle: tutti gli obiettivi, oppure il 70 % e il podio
    // con un allenamento le stelle sono le stesse di tutti i giochi: tempo entro ±7 % del bersaglio (kit/workout-plan.js)
    if (this.wk && bandRatio != null) stars = workoutStars(bandRatio, true);
    this.result = { place, stars, objDone: this.objDone, objTotal: this.objTotal, time: this.player.fin, adapt: this.adapt, wk: this.wk, band: bandRatio };
    return this.result;
  }

  commentary(dt, m) {
    const pl = this.player; const pc = this.place();
    if (pc !== this.lastPlace && this.t > 6) {
      if (pc < this.lastPlace) { this.pass++; this.say('games.racer.say.passed', { place: pc }, 2, { every: 2, good: true }); }
      else this.say('games.racer.say.lost', { place: pc }, 1, { every: 3, bad: true });
      this.lastPlace = pc;
    } else if (this.t < 6) this.lastPlace = pc;
    // rientro del gruppo
    const inBreak = pl.s - this.P > 20;
    if (m.kind === 'break' && inBreak && this.fr > 0.8) this.say('games.racer.say.gapLead', { s: Math.round((pl.s - this.P) / Math.max(4, pl.speed)) }, 1, { every: 5 });
    // sempre qualcosa: dopo 4 secondi di silenzio, una riga sullo stato della gara
    if (this.t - this.lastEvent >= 4 && this.t > 3) this.filler(m);
  }
  filler(m) {
    const pl = this.player; const rs = this.rivals;
    const ahead = rs.filter((r) => r.s > pl.s).sort((a, b) => a.s - b.s)[0];
    const behind = rs.filter((r) => r.s <= pl.s).sort((a, b) => b.s - a.s)[0];
    const left = Math.max(0, this.tl.race - this.t); const k = Math.floor(this.t / 4) % 4;
    const ob = this.obj;
    if (k === 0 && ahead) { this.say('games.racer.say.gapAhead', { name: this.pname(ahead.i), s: Math.max(1, Math.round(this.gapSec(ahead))) }, 1, { every: 0 }); return; }
    if (k === 1 && behind) { this.say('games.racer.say.gapBehind', { name: this.pname(behind.i), s: Math.max(1, Math.round(-this.gapSec(behind))) }, 1, { every: 0 }); return; }
    if (k === 2) { const g = Math.round((this.P - pl.s) / Math.max(4, pl.speed)); this.say(g >= 0 ? 'games.racer.say.packAhead' : 'games.racer.say.packBehind', { s: Math.abs(g) }, 1, { every: 0 }); return; }
    this.say('games.racer.say.left', { m: Math.floor(left / 60), s: String(Math.floor(left % 60)).padStart(2, '0') }, 0, { every: 0 });
  }

  leader(type) {
    const e = Object.entries(this.points[type] || {}).sort((a, b) => b[1] - a[1])[0];
    return e ? { name: e[0], pts: e[1] } : null;
  }
}
