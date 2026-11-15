// Slipstream: la forma dell'allenamento e le regole di "ponte". Logica pura (nessuna grafica): si prova anche senza browser.
// Ogni partita dura 5, 10 o 20 minuti e segue una curva in % della FTP: avvio facile, ondate (ritmo → sforzo → recupero),
// scatti di volata, finale più duro, 30 s di defaticamento. Vedi docs/giochi-design.md §1 e docs/slipstream.md.
// Durate, livelli, adattamento e tratti sono gli stessi di Horde Run (horde-plan.js).
import { DURATIONS, LEVELS, WARM_S, COOL_S, SPRINT_S, ADAPT_MAX, Adapter, segAt, targetPct, targetW, planFromWorkout as workoutBase } from './horde-plan.js';
export { DURATIONS, LEVELS, WARM_S, COOL_S, SPRINT_S, ADAPT_MAX, Adapter, segAt, targetPct, targetW };

const lerp = (a, b, k) => a + (b - a) * k;

// quante ondate per durata (come Horde Run)
export function waveCount(total) { return total <= 300 ? 4 : total <= 600 ? 7 : 12; }

// Piano: segmenti { t0, t1, kind, pct, wave, bridge } con kind: warm | pace | effort | sprint | rest | cool.
//  - warm: il primo corridore è già lì davanti, ponte facile
//  - pace: "tieni il gruppo" (vento contro): chi è in scia resta solo se tieni il ritmo; intanto il prossimo corridore si avvicina
//  - effort: PONTE: un corridore (o un drappello) scatta, lo raggiungi entro la fine del tratto
//  - sprint: volata (a fine blocco e in finale) contro un drappello, fino al traguardo
//  - rest: recupero, il gruppo resta unito a watt facili, bidoni da raccogliere
export function buildPlan(total) {
  const N = waveCount(total);
  const mid = total - WARM_S - COOL_S; const L = mid / N;
  const segs = []; let t = 0;
  const push = (len, kind, pct, wave, extra = {}) => { if (len > 0.01) { segs.push({ t0: t, t1: t + len, kind, pct, wave, ...extra }); t += len; } };
  push(WARM_S, 'warm', 0.62, 0, { bridge: { riders: 1, gap: 18, lead: 0 } });
  const primes = [];
  for (let w = 1; w <= N; w++) {
    const k = N > 1 ? (w - 1) / (N - 1) : 1; // 0 → 1 lungo la partita
    const sprint = w % 4 === 0 || w === N; const last = w === N;
    if (sprint) primes.push(w);
    const pace = L * 0.26; const effort = L * 0.4 - (sprint && !last ? SPRINT_S : 0); // l'ultima ondata ha lo sforzo intero e poi la volata
    const rest = L - pace - effort - (sprint ? SPRINT_S : 0);
    const riders = 1 + Math.floor(k * 2.2); // 1 → 3 corridori per ponte
    push(pace, 'pace', lerp(0.76, 0.88, k), w);
    push(effort, 'effort', lerp(0.95, 1.06, k), w, { bridge: { riders, gap: 20, lead: 80 } });
    if (sprint) push(SPRINT_S, 'sprint', 1.3, w, { bridge: { riders: Math.min(3, riders + 1), gap: 20, lead: 80 }, line: last ? 'finish' : 'prime' });
    push(rest, 'rest', 0.56, w);
  }
  push(COOL_S, 'cool', 0.5, N + 1);
  segs[segs.length - 1].t1 = total;
  const bridges = segs.filter((s) => s.bridge && s.kind !== 'warm');
  const riders = segs.reduce((a, s) => a + (s.bridge?.riders || 0), 0);
  return { total, N, segs, L, primes, bridgeCount: bridges.length, riders };
}

// Allenamento in corso → piano (kit/workout-plan.js): i tratti e i watt sono quelli dell'allenamento; i ponti stanno sugli sforzi
// e sugli scatti (un corridore in più a ogni ondata, come nelle partite normali), il traguardo vero sull'ultimo scatto.
export const WARM_BRIDGE = { riders: 1, gap: 18, lead: 0 };
export function planFromWorkout(wp) {
  const base = workoutBase(wp);
  const lastHard = Math.max(0, ...base.segs.filter((s) => s.wkKind === 'sprint').map((s) => s.wave));
  for (const s of base.segs) {
    const k = base.N > 1 ? (Math.max(1, s.wave) - 1) / (base.N - 1) : 1; const riders = 1 + Math.floor(k * 2.2);
    if (s.kind === 'warm') s.bridge = WARM_BRIDGE;
    else if (s.kind === 'effort') s.bridge = { riders, gap: 20, lead: 80 };
    else if (s.kind === 'sprint') { s.bridge = { riders: Math.min(3, riders + 1), gap: 20, lead: 80 }; s.line = s.wave === lastHard ? 'finish' : 'prime'; }
  }
  const primes = [...new Set(base.segs.filter((s) => s.kind === 'sprint').map((s) => s.wave))];
  const bridges = base.segs.filter((s) => s.bridge && s.kind !== 'warm');
  return { ...base, primes, bridgeCount: bridges.length, riders: base.segs.reduce((a, s) => a + (s.bridge?.riders || 0), 0) };
}

// Velocità di avvicinamento (m/s) al corridore che scatta, in funzione dei watt (già filtrati).
// A "watt richiesti" la distanza si chiude in MARGIN × durata del tratto; sotto la base (metà FTP) non si recupera nulla.
export const BASE_PCT = 0.5;   // sotto questa frazione della FTP il gap non si chiude (il corridore tiene il suo ritmo)
export const MARGIN = 0.7;     // a watt pieni arrivi dopo il 70 % del tempo
export const CLOSE_MAX = 1.6;  // chiusura massima (× quella a watt richiesti): niente premio infinito
export function closingSpeed(power, tgt, ftp, gap0, dur) {
  const base = BASE_PCT * ftp; const k = (power - base) / Math.max(1, tgt - base);
  const nominal = gap0 / (MARGIN * dur);
  return nominal * Math.max(-0.35, Math.min(CLOSE_MAX, k));
}

// Chi è in scia resta solo se tieni almeno il 90 % dei watt richiesti (più di 2,5 s di fila sotto: perdi un corridore)
export const HOLD_PCT = 0.9;
export const DROP_AFTER = 2.5;

// Stelle: 1 = finita; 2 = almeno metà dei ponti (volate comprese); 3 = almeno l'80 %, volata finale vinta e al massimo 3 corridori persi
export function starsFor({ done, total, finalWon, dropped }) {
  const ratio = total ? done / total : 0;
  let s = 1;
  if (ratio >= 0.5) s = 2;
  if (ratio >= 0.8 && finalWon && dropped <= 3) s = 3;
  return { stars: s, ratio };
}

// cosa manca alla stella successiva
export function nextStarHint({ stars, done, total, finalWon, dropped }) {
  if (stars >= 3) return null;
  if (stars === 1) return { key: 'games.gruppetto.res.next2', n: Math.max(1, Math.ceil(total * 0.5) - done) };
  return { key: 'games.gruppetto.res.next3', n: Math.max(0, Math.ceil(total * 0.8) - done), sprint: finalWon ? 0 : 1, lost: Math.max(0, dropped - 3) };
}
