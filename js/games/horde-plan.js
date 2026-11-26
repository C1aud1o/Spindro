// Horde Run: la forma dell'allenamento. Logica pura (nessuna grafica): si può provare anche senza browser.
// Ogni partita dura 5, 10 o 20 minuti e segue una curva in % della FTP: avvio facile, ondate di sforzo e recupero,
// un finale più duro con lo scatto, 30 s di defaticamento. Vedi docs/games/DESIGN-RULES.md §1.

export const DURATIONS = [300, 600, 1200];
export const LEVELS = [{ id: 'easy', k: -0.10 }, { id: 'normal', k: 0 }, { id: 'hard', k: 0.10 }];
export const WARM_S = 50;   // avvio facile
export const COOL_S = 30;   // defaticamento con il riepilogo
export const SPRINT_S = 10; // lo scatto del Custode

// quante ondate per durata e dopo quante arriva un Custode (fine di un "blocco" di ondate)
export function waveCount(total) { return total <= 300 ? 4 : total <= 600 ? 7 : 12; }

// composizione delle ondate: quale mix di nemici arriva (il blocco si ripete, sempre più duro)
export const COMPOS = [
  { id: 'walkers', mix: { zombie: 0.82, runner: 0.18 } },                  // camminatori lenti
  { id: 'runners', mix: { runner: 0.7, zombie: 0.3 } },                    // corridori veloci: hanno la precedenza
  { id: 'brutes', mix: { brute: 0.2, zombie: 0.8 } },                      // bruti resistenti: tengono una corsia
  { id: 'bones', mix: { skeleton: 0.6, zombie: 0.25, runner: 0.15 } },     // scheletri che cambiano corsia al primo colpo
];
export const WARM_MIX = { id: 'warm', mix: { zombie: 1 } };

// ---------- corsie e direttore (logica pura, provata senza browser) ----------
export const LANES = 3;
export const LANE_W = 3.2;                      // m
export const laneX = (l) => (1 - l) * LANE_W;   // corsia 0 = sinistra sullo schermo (la camera guarda +Z: destra = −X)
// il margine che il direttore lascia al giocatore: il tempo che serve per ripulire ≤ (1 − margine) × il tempo che i nemici impiegano ad arrivare
export const SLACK = { easy: 0.4, normal: 0.25, hard: 0.1 };
export const SWITCH_S = 0.8;                    // cambio di corsia + mira + volo del colpo (s)
// ogni quanto nasce un nemico (s) e quanto spesso nascono in due corsie insieme, per tipo di tratto
export const DENSITY = {
  warm: { gap: [2.6, 3.4], pair: 0 }, pace: { gap: [1.8, 2.5], pair: 0.15 }, effort: { gap: [1.4, 2], pair: 0.3 },
  sprint: { gap: [1.1, 1.6], pair: 0.35 }, rest: { gap: [2.4, 3.1], pair: 0 }, cool: null,
};
export const GAP_K = { easy: 1.05, normal: 1, hard: 0.85 }; // il livello cambia quanto fitta è l'orda (mai i watt)

// Si può ripulire tutto in tempo? jobs = [{ a: secondi all'arrivo alla linea, r: secondi al primo colpo possibile, w: secondi di tiro, lane }].
// Il giocatore parte dalla corsia `lane`, serve sempre il nemico che arriva prima fra quelli a tiro e perde SWITCH_S a ogni cambio.
// Tutti i tempi sono gonfiati di 1/(1 − margine): vuol dire lasciare quel margine.
export function feasible(jobs, { lane, slack }) {
  const k = 1 / (1 - slack); const todo = jobs.map((j) => ({ ...j })).sort((x, y) => x.a - y.a);
  let t = 0; let at = lane;
  while (todo.length) {
    let i = todo.findIndex((j) => j.r <= t);
    if (i < 0) { t = Math.min(...todo.map((j) => j.r)); i = todo.findIndex((j) => j.r <= t); }
    const j = todo.splice(i, 1)[0];
    if (j.lane !== at) { t += SWITCH_S * k; at = j.lane; }
    t += j.w * k;
    if (t > j.a) return false;
  }
  return true;
}

import { wkTarget } from './kit/workout-plan.js';

const lerp = (a, b, k) => a + (b - a) * k;

// Costruisce il piano: segmenti { t0, t1, kind, pct, wave } e la lista dei Custodi.
// kind: warm | pace | effort | sprint | rest | cool. pct = frazione della FTP (prima del livello).
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
// Watt richiesti: percentuale × FTP più il livello scelto nel menu (recupero, avvio e defaticamento non lo seguono).
// Nei tratti di un allenamento vero (seg.fixed) i watt sono quelli dell'allenamento. Niente cambia da solo durante la partita.
export function targetPct(seg, levelK) { return seg.fixed ? seg.pct : seg.pct + (FIXED[seg.kind] ? 0 : levelK); }
export function targetW(seg, ftp, levelK, el) { return seg.fixed ? (el == null ? seg.watts : wkTarget(seg, el)) : Math.round(ftp * targetPct(seg, levelK)); }

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

// Horde Run, stelle (senza allenamento): 1 = finita; 2 = almeno 4 cuori alla fine; 3 = tutti i 6 cuori, oppure al massimo uno perso
export function heartStars({ hp, lost }) {
  let s = 1;
  if (hp >= 4) s = 2;
  if (hp >= 6 || lost <= 1) s = 3;
  return { stars: s };
}

// Horde Run: cosa manca alla stella successiva
export function heartHint({ stars }) {
  if (stars >= 3) return null;
  return { key: stars === 1 ? 'games.horde.res.heartsNext2' : 'games.horde.res.heartsNext3' };
}
