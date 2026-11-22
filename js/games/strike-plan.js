// PEDAL STRIKE — la partita è un allenamento con una forma (docs/giochi-design.md, regola 1).
// Logica pura, senza three.js: si prova anche in Node (tests/strike-plan.test.mjs).
//   buildWorkout(minuti)  → blocchi in % della FTP: avvio facile, ondate di sforzo e recupero, scatti, mini-boss a metà,
//                           boss finale più duro, defaticamento di 30 s.
//   Coach                 → livello (Facile −10 %, Normale, Difficile +10 %) e difficoltà che si adatta
//                           (2 sforzi falliti di fila: −5 %; 3 riusciti di fila: +5 %; entro ±15 %).
//   starsFor(...)         → da 1 a 3 stelle con criteri chiari.

export const DURATIONS = [5, 10, 20];
export const LEVEL_MUL = [0.9, 1, 1.1]; // Facile, Normale, Difficile

// tipi di blocco: warm (avvio), effort (sforzo), rec (recupero), sprint (scatto), mini (mini-boss: sforzo), boss (sforzo finale), cool
export const ZONE = { warm: 0.6, rec: 0.58, cool: 0.5 };
export const TOL = 0.95; // si è "in zona" sopra il 95 % del bersaglio (il segnale della potenza oscilla)

export function buildWorkout(minutes = 5) {
  const T = minutes * 60;
  const warm = minutes >= 20 ? 60 : minutes >= 10 ? 55 : 45;
  const cool = 30;
  const boss = minutes >= 20 ? 80 : minutes >= 10 ? 70 : 55;
  const eDur = minutes >= 20 ? 75 : minutes >= 10 ? 60 : 40;
  const effortPct = [0.95, 1.0, 1.05, 1.0, 1.05, 1.08, 1.02, 1.08, 1.1];
  let e = 0;
  // riempie un tratto con sforzo + recupero (e scatto + recupero nelle partite lunghe), finendo sempre con un recupero
  const fill = (len, afterHard) => {
    const out = []; let left = len;
    const push = (kind, dur, pct) => { out.push({ kind, dur, pct }); left -= dur; };
    if (afterHard) push('rec', 40, ZONE.rec);
    for (;;) {
      if (left >= eDur + 40) {
        push('effort', eDur, effortPct[Math.min(e++, effortPct.length - 1)]); push('rec', 40, ZONE.rec);
        if (minutes >= 10 && left >= 50 + 40) { push('sprint', 10, 1.35); push('rec', 40, ZONE.rec); }
      } else if (left >= 30 + 40) { push('effort', left - 40, effortPct[Math.min(e++, effortPct.length - 1)]); push('rec', 40, ZONE.rec); } else break;
    }
    if (left > 0) { if (out.length && out[out.length - 1].kind === 'rec') out[out.length - 1].dur += left; else out.push({ kind: 'rec', dur: left, pct: ZONE.rec }); }
    return out;
  };
  // il mini-boss sta a metà partita
  const m0 = Math.round(T / 2 - eDur / 2);
  const first = fill(m0 - warm, false);
  const mini = { kind: 'mini', dur: eDur + 5, pct: 1.0 };
  const second = fill(T - cool - boss - (m0 + mini.dur), true);
  const blocks = [{ kind: 'warm', dur: warm, pct: ZONE.warm }, ...first, mini, ...second, { kind: 'boss', dur: boss, pct: 1.05 }, { kind: 'cool', dur: cool, pct: ZONE.cool }];
  // recuperi troppo lunghi: a metà uno scatto breve (sempre seguito da 40 s facili)
  for (let i = blocks.length - 1; i >= 0; i--) { const b = blocks[i]; if (b.kind === 'rec' && b.dur >= 90) blocks.splice(i, 1, { kind: 'rec', dur: b.dur - 50, pct: ZONE.rec }, { kind: 'sprint', dur: 10, pct: 1.35 }, { kind: 'rec', dur: 40, pct: ZONE.rec }); }
  let t = 0;
  for (const b of blocks) { b.t0 = t; t += b.dur; b.t1 = t; }
  blocks.total = t;
  return blocks;
}

// controlli della forma: niente più di 90 s sopra soglia senza 40 s di recupero dopo
export function checkWorkout(blocks) {
  const errs = []; let hard = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]; const above = b.pct >= 0.95;
    if (above) { hard += b.dur; if (hard > 90) errs.push(`>90 s sopra soglia al blocco ${i}`); } else { if (hard > 0 && b.dur < 40 && b.kind !== 'cool') errs.push(`recupero corto al blocco ${i}`); hard = 0; }
  }
  return errs;
}

// Allenamento in corso → blocchi (kit/workout-plan.js workoutPlan). I watt sono quelli dell'allenamento (`fixed`): livello e adattamento
// non li toccano. warm | easy, recovery → rec | tempo, effort → effort | sprint | cool; il boss è l'ultimo sforzo lungo (≥ 45 s),
// il mini-boss quello più vicino a metà partita.
export function blocksFromWorkout(wp) {
  const KIND = { warm: 'warm', easy: 'rec', recovery: 'rec', tempo: 'effort', effort: 'effort', sprint: 'sprint', cool: 'cool' };
  const blocks = wp.segs.map((g) => ({ kind: KIND[g.kind], wkKind: g.kind, t0: g.t0, t1: g.t1, dur: g.t1 - g.t0, pct: g.pct, watts: g.watts, w0: g.w0, w1: g.w1, fixed: true, wk: true, label: g.label, stepStart: g.stepStart, stepEnd: g.stepEnd, wave: g.wave }));
  const hard = blocks.filter((b) => (b.wkKind === 'effort' || b.wkKind === 'sprint') && b.dur >= 45);
  const boss = hard.at(-1);
  if (boss) {
    boss.kind = 'boss';
    const mid = wp.total / 2; const rest = hard.filter((b) => b !== boss && b.t0 > wp.total * 0.15);
    const mini = rest.sort((a, b) => Math.abs((a.t0 + a.t1) / 2 - mid) - Math.abs((b.t0 + b.t1) / 2 - mid))[0];
    if (mini) mini.kind = 'mini';
  }
  blocks.total = wp.total;
  return blocks;
}

export const isHard = (b) => b && (b.kind === 'effort' || b.kind === 'mini' || b.kind === 'boss' || b.kind === 'sprint');

export class Coach {
  constructor(ftp = 200, level = 1) { this.ftp = ftp; this.level = level; this.results = []; }
  get mul() { return LEVEL_MUL[this.level]; }
  // watt richiesti da un blocco (solo il livello scelto nel menu)
  target(b) { if (!b) return 0; if (b.fixed) return b.watts; /* con un allenamento i watt li decide lui */ const k = b.kind === 'sprint' ? LEVEL_MUL[this.level] : isHard(b) ? this.mul : 1; return Math.round(this.ftp * b.pct * k / 5) * 5; }
  // esito di uno sforzo: media della potenza nel blocco rispetto al bersaglio
  finish(b, avgW, inZoneK) {
    const target = this.target(b);
    const ok = b.kind === 'sprint' ? inZoneK >= 0.6 : avgW >= target * TOL;
    this.results.push({ kind: b.kind, target, avg: Math.round(avgW), ok });
    return ok;
  }
  get efforts() { return this.results.filter((r) => r.kind !== 'sprint'); }
  get okRate() { const e = this.efforts; return e.length ? e.filter((r) => r.ok).length / e.length : 0; }
}

// stelle: ★ partita finita · ★★ almeno 60 % degli sforzi riusciti · ★★★ almeno 85 % e boss abbattuto
export function starsFor({ finished, okRate, bossDown }) {
  if (!finished) return 0;
  if (okRate >= 0.85 && bossDown) return 3;
  if (okRate >= 0.6) return 2;
  return 1;
}
