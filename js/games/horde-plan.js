// Horde Run: la forma dell'allenamento. Logica pura (nessuna grafica): si può provare anche senza browser.
// Ogni partita dura 5, 10 o 20 minuti e segue una curva in % della FTP: avvio facile, ondate di sforzo e recupero,
// un finale più duro con lo scatto, 30 s di defaticamento. Vedi docs/giochi-design.md §1.

export const DURATIONS = [300, 600, 1200];
export const LEVELS = [{ id: 'easy', k: -0.10 }, { id: 'normal', k: 0 }, { id: 'hard', k: 0.10 }];
export const WARM_S = 50;   // avvio facile
export const COOL_S = 30;   // defaticamento con il riepilogo
export const SPRINT_S = 10; // lo scatto del Custode
export const ADAPT_MAX = 0.15;

// quante ondate per durata e dopo quante arriva un Custode (fine di un "blocco" di ondate)
export function waveCount(total) { return total <= 300 ? 4 : total <= 600 ? 7 : 12; }

// composizione delle ondate: quale mix di nemici arriva (il blocco si ripete, sempre più duro)
export const COMPOS = [
  { id: 'walkers', mix: { zombie: 0.82, runner: 0.18 }, pack: [4, 16], demand: 1.15 },   // camminatori lenti in massa
  { id: 'runners', mix: { runner: 0.7, zombie: 0.3 }, pack: [3, 9], demand: 1.0 },       // corridori veloci
  { id: 'brutes', mix: { brute: 0.2, zombie: 0.8 }, pack: [3, 10], demand: 1.0 },          // bruti resistenti
  { id: 'bones', mix: { skeleton: 0.6, zombie: 0.25, runner: 0.15 }, pack: [3, 9], demand: 1.0 }, // scheletri che schivano
];
export const WARM_MIX = { id: 'warm', mix: { zombie: 1 }, pack: [2, 5], demand: 1 };

import { wkTarget } from './kit/workout-plan.js';

const lerp = (a, b, k) => a + (b - a) * k;

// Costruisce il piano: segmenti { t0, t1, kind, pct, wave } e la lista dei Custodi.
// kind: warm | pace | effort | sprint | rest | cool. pct = frazione della FTP (prima di livello e adattamento).
export function buildPlan(total) {
  const N = waveCount(total);
  const mid = total - WARM_S - COOL_S; const L = mid / N;
  const segs = []; let t = 0;
  const push = (len, kind, pct, wave) => { if (len > 0.01) { segs.push({ t0: t, t1: t + len, kind, pct, wave }); t += len; } };
  push(WARM_S, 'warm', 0.62, 0);
  const bossWaves = [];
  for (let w = 1; w <= N; w++) {
    const k = N > 1 ? (w - 1) / (N - 1) : 1; // 0 → 1 lungo la partita
    const boss = w % 4 === 0 || w === N; if (boss) bossWaves.push(w);
    const pace = L * 0.26; const rest = L * 0.34; const effort = L - pace - rest;
    push(pace, 'pace', lerp(0.76, 0.88, k), w);
    push(boss ? effort - SPRINT_S : effort, 'effort', lerp(0.95, 1.06, k), w);
    if (boss) push(SPRINT_S, 'sprint', 1.3, w);
    push(rest, 'rest', 0.56, w);
  }
  push(COOL_S, 'cool', 0.5, N + 1);
  segs[segs.length - 1].t1 = total; // niente deriva dei decimali
  return { total, N, segs, bossWaves, L };
}

export const segAt = (plan, t) => plan.segs.find((s) => t >= s.t0 && t < s.t1) || plan.segs[plan.segs.length - 1];
export const composAt = (wave) => (wave < 1 ? WARM_MIX : COMPOS[(wave - 1) % 4]);

const FIXED = { rest: 1, cool: 1, warm: 1 };
// Watt richiesti: percentuale × FTP, più livello e adattamento (recupero, avvio e defaticamento non si adattano).
// Nei tratti di un allenamento vero (seg.fixed) i watt sono quelli dell'allenamento: livello e adattamento non contano.
export function targetPct(seg, levelK, adapt) { return seg.fixed ? seg.pct : seg.pct + (FIXED[seg.kind] ? 0 : levelK + adapt); }
export function targetW(seg, ftp, levelK, adapt, el) { return seg.fixed ? (el == null ? seg.watts : wkTarget(seg, el)) : Math.round(ftp * targetPct(seg, levelK, adapt)); }

// Allenamento in corso → piano (kit/workout-plan.js workoutPlan): stessi tratti dei piani di Horde Run, con i watt dell'allenamento.
// warm | easy, tempo → pace | effort | sprint | recovery → rest | cool. Custodi: ondate con scatto e l'ultima ondata di lavoro duro.
export const WK_KIND = { warm: 'warm', easy: 'pace', tempo: 'pace', effort: 'effort', sprint: 'sprint', recovery: 'rest', cool: 'cool' };
export function planFromWorkout(wp, kindMap = WK_KIND) {
  const segs = wp.segs.map((s) => ({ ...s, kind: kindMap[s.kind] || s.kind, wkKind: s.kind }));
  const bossWaves = [...new Set(segs.filter((s) => s.wkKind === 'sprint').map((s) => s.wave))];
  const lastWork = [...segs].reverse().find((s) => s.wave >= 1 && s.wave <= wp.N && s.wkKind !== 'recovery');
  if (lastWork && (lastWork.wkKind === 'effort' || lastWork.wkKind === 'sprint') && !bossWaves.includes(lastWork.wave)) bossWaves.push(lastWork.wave);
  bossWaves.sort((a, b) => a - b);
  return { total: wp.total, N: wp.N, segs, bossWaves, L: wp.total / Math.max(1, wp.N), wk: true, name: wp.name };
}

// Adattamento: dopo due sforzi falliti di fila −5 %, dopo tre riusciti +5 %, entro ±15 %
export class Adapter {
  constructor() { this.value = 0; this.fails = 0; this.wins = 0; }
  report(ok) {
    if (ok) { this.wins++; this.fails = 0; if (this.wins >= 3) { this.wins = 0; return this.step(+0.05); } } else { this.fails++; this.wins = 0; if (this.fails >= 2) { this.fails = 0; return this.step(-0.05); } }
    return 0;
  }
  step(d) { const v = Math.max(-ADAPT_MAX, Math.min(ADAPT_MAX, +(this.value + d).toFixed(2))); const m = +(v - this.value).toFixed(2); this.value = v; return m; }
}

// Stelle: 1 = finita; 2 = almeno metà degli sforzi; 3 = almeno l'80 %, tutti i Custodi battuti e al massimo 3 cadute
export function starsFor({ done, total, bossKilled, bossTotal, ko }) {
  const ratio = total ? done / total : 0;
  let s = 1;
  if (ratio >= 0.5) s = 2;
  if (ratio >= 0.8 && bossKilled >= bossTotal && ko <= 3) s = 3;
  return { stars: s, ratio };
}

// cosa manca alla stella successiva
export function nextStarHint({ stars, done, total, bossKilled, bossTotal, ko }) {
  if (stars >= 3) return null;
  if (stars === 1) return { key: 'games.horde.res.next2', n: Math.max(1, Math.ceil(total * 0.5) - done) };
  return { key: 'games.horde.res.next3', n: Math.max(0, Math.ceil(total * 0.8) - done), boss: Math.max(0, bossTotal - bossKilled), ko: Math.max(0, ko - 3) };
}
