// Updraft: la forma dell'allenamento e la quota. Logica pura (nessuna grafica), si prova anche senza browser.
// Come Horde Run: 5/10/20 minuti, curva in % della FTP (avvio facile, ondate di sforzo e recupero, finale più duro,
// 30 s di defaticamento = la discesa verso la pista). In più: la quota dell'aereo È la percentuale di FTP
// (in basso 50 %, in alto 130 %), quindi il percorso di anelli è il profilo dell'allenamento. Vedi docs/giochi-design.md §1.
import { DURATIONS, LEVELS, WARM_S, COOL_S, ADAPT_MAX, Adapter, segAt, targetPct, targetW, WK_KIND, planFromWorkout as workoutBase } from './horde-plan.js';

export { DURATIONS, LEVELS, WARM_S, COOL_S, ADAPT_MAX, Adapter, segAt, targetPct, targetW };
export const CLIMB_S = 10;      // la salita ripida (scatto)
export const PCT_LO = 0.5;      // base dello schermo
export const PCT_HI = 1.3;      // cima dello schermo
export const Y_LO = 4.2;        // quota (m) a PCT_LO
export const Y_HI = 16.2;       // quota (m) a PCT_HI
export const SPEED = 15;        // velocità di avanzamento (m/s): costante, così i tempi non dipendono dal rullo
export const RING_EVERY = 3.6;  // secondi fra un anello e l'altro
export const FIRST_RING = 4;    // secondi dall'inizio al primo anello

const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };

export function waveCount(total) { return total <= 300 ? 4 : total <= 600 ? 7 : 12; }

// segmenti { t0, t1, kind, pct, wave }: warm | pace | effort | climb | rest | cool
export function buildPlan(total) {
  const N = waveCount(total);
  const mid = total - WARM_S - COOL_S; const L = mid / N;
  const segs = []; let t = 0;
  const push = (len, kind, pct, wave) => { if (len > 0.01) { segs.push({ t0: t, t1: t + len, kind, pct, wave }); t += len; } };
  push(WARM_S, 'warm', 0.62, 0);
  const climbWaves = [];
  for (let w = 1; w <= N; w++) {
    const k = N > 1 ? (w - 1) / (N - 1) : 1;
    const climb = w % 4 === 0 || w === N; if (climb) climbWaves.push(w);
    const pace = L * 0.26; const rest = L * 0.34; const effort = L - pace - rest;
    push(pace, 'pace', lerp(0.76, 0.88, k), w);
    push(climb ? effort - CLIMB_S : effort, 'effort', lerp(0.95, 1.06, k), w);
    if (climb) push(CLIMB_S, 'climb', 1.3, w);
    push(rest, 'rest', 0.56, w);
  }
  push(COOL_S, 'cool', 0.5, N + 1);
  segs[segs.length - 1].t1 = total;
  return { total, N, segs, climbWaves, L };
}

// Allenamento in corso → piano (kit/workout-plan.js): il percorso di anelli è il profilo dell'allenamento; lo scatto è la salita ripida.
export function planFromWorkout(wp) {
  const b = workoutBase(wp, { ...WK_KIND, sprint: 'climb' });
  return { total: b.total, N: b.N, segs: b.segs, climbWaves: [...new Set(b.segs.filter((s) => s.kind === 'climb').map((s) => s.wave))], L: b.L, wk: true, name: b.name };
}

// quota ↔ percentuale della FTP
export const altOf = (pct) => Y_LO + Math.max(0, Math.min(1.08, (pct - PCT_LO) / (PCT_HI - PCT_LO))) * (Y_HI - Y_LO);
export const pctOf = (y) => PCT_LO + (y - Y_LO) / (Y_HI - Y_LO) * (PCT_HI - PCT_LO);

// profilo dolce: i passaggi fra un tratto e l'altro sono rampe (3 s, 1,6 s verso la salita ripida), così la rotta
// è una curva da volare e non un grafico a gradini. t in secondi di partita.
export function profilePct(plan, t, levelK, adapt) {
  const segs = plan.segs; const i = Math.max(0, segs.findIndex((s) => t >= s.t0 && t < s.t1));
  const s = segs[i]; const here = targetPct(s, levelK, adapt);
  const ramp = (a, b) => (b.kind === 'climb' ? 1.6 : 3);
  let v = here;
  const prev = segs[i - 1]; const next = segs[i + 1];
  if (prev) { const r = ramp(prev, s) / 2; const d = t - s.t0; if (d < r) v = lerp(lerp(targetPct(prev, levelK, adapt), here, 0.5), here, smooth(d / r)); }
  if (next && v === here) { const r = ramp(s, next) / 2; const d = s.t1 - t; if (d < r) v = lerp(lerp(targetPct(next, levelK, adapt), here, 0.5), here, smooth(d / r)); }
  return v;
}

// Stelle: 1 = atterrato; 2 = almeno metà degli sforzi tenuti; 3 = almeno l'80 % degli sforzi e al massimo 3 tempeste prese
export function starsFor({ done, total, hits }) {
  const ratio = total ? done / total : 0;
  let s = 1;
  if (ratio >= 0.5) s = 2;
  if (ratio >= 0.8 && hits <= 3) s = 3;
  return { stars: s, ratio };
}

export function nextStarHint({ stars, done, total, hits }) {
  if (stars >= 3) return null;
  if (stars === 1) return { key: 'games.planata.res.next2', n: Math.max(1, Math.ceil(total * 0.5) - done) };
  return { key: 'games.planata.res.next3', n: Math.max(0, Math.ceil(total * 0.8) - done), hits: Math.max(0, hits - 3) };
}
