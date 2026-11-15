// Allenamento in corso → piano del gioco. Logica pura (nessuna grafica): si prova anche senza browser.
//
// Quando l'app ha un allenamento in corso (workouts sheet → "Gioca" o tasto Giochi nella schermata di guida), passa ai giochi
// l'hook `workout()` = { name, total, elapsed, steps: [{ t0, dur, pct, watts, kind, w0?, w1?, label? }] } oppure null.
// Qui lo si traduce in segmenti generici che ogni gioco sa leggere:
//   { t0, t1, kind, pct, watts, w0, w1, wave, step, label, stepEnd, fixed: true, wk: true }
//   kind: warm | easy | tempo | effort | sprint | recovery | cool   (fasce di docs/giochi-design.md §1)
//   `fixed` = i watt li decide l'allenamento: livello e difficoltà adattiva NON li toccano.
// I tratti fermi più lunghi di 3 minuti sono spezzati in "ondate" da 60–120 s con lo STESSO bersaglio, così il gioco ha
// eventi, obiettivi e contatore senza cambiare il carico.
//
// Qui sta anche il criterio delle stelle in modalità allenamento, uguale per tutti i giochi:
//   ★ allenamento finito · ★★ almeno il 60 % del tempo entro ±7 % del bersaglio · ★★★ almeno l'85 %.

export const BAND = 0.07;          // entro ±7 % dei watt richiesti
export const STARS_2 = 0.6; export const STARS_3 = 0.85;
export const SPLIT_OVER = 180;     // s: oltre questa durata un tratto fermo si divide in ondate
export const WAVE_MAX = 120;       // s: durata massima di un'ondata
export const SETTLE_S = 6;         // s dopo ogni cambio di tratto in cui la potenza non si giudica (il rullo ci mette un attimo)

const r5 = (w) => Math.round(w / 5) * 5;

// fasce in % della FTP (docs/giochi-design.md §1): recupero < 65 %, facile 65–75 %, ritmo 75–92 %, sforzo ≥ 92 %, scatto ≥ 120 % e breve
export function classify(pct, dur) {
  if (pct >= 1.2 && dur <= 45) return 'sprint';
  if (pct >= 0.92) return 'effort';
  if (pct >= 0.75) return 'tempo';
  if (pct >= 0.65) return 'easy';
  return 'recovery';
}

// Hook → piano. Restituisce null se non c'è un allenamento (o è vuoto).
export function workoutPlan(wk, ftp = 200) {
  if (!wk || !Array.isArray(wk.steps) || !wk.steps.length || !(wk.total > 0)) return null;
  const steps = wk.steps.filter((s) => s.dur > 0);
  if (!steps.length) return null;
  // avvio: i passi facili all'inizio; defaticamento: i passi facili in fondo (solo nella seconda metà)
  let nWarm = 0; while (nWarm < steps.length - 1 && steps[nWarm].pct < 0.7) nWarm++;
  let nCool = 0; while (nCool < steps.length - nWarm - 1 && steps[steps.length - 1 - nCool].pct < 0.7 && steps[steps.length - 1 - nCool].t0 >= wk.total / 2) nCool++;
  const segs = []; let wave = 0;
  steps.forEach((s, i) => {
    const warm = i < nWarm; const cool = i >= steps.length - nCool;
    const kind0 = warm ? 'warm' : cool ? 'cool' : classify(s.pct, s.dur);
    const pieces = s.dur > SPLIT_OVER ? Math.ceil(s.dur / WAVE_MAX) : 1;
    const w0 = Number.isFinite(s.w0) ? s.w0 : s.watts; const w1 = Number.isFinite(s.w1) ? s.w1 : s.watts;
    for (let p = 0; p < pieces; p++) {
      const t0 = s.t0 + (s.dur * p) / pieces; const t1 = s.t0 + (s.dur * (p + 1)) / pieces;
      const a = w0 + (w1 - w0) * (p / pieces); const b = w0 + (w1 - w0) * ((p + 1) / pieces);
      const watts = r5((a + b) / 2);
      const kind = kind0;
      // le ondate: ogni tratto di lavoro (facile, ritmo, sforzo, scatto) ne apre una nuova; il recupero resta nell'ondata che lo precede
      if (kind === 'tempo' || kind === 'easy' || kind === 'effort' || kind === 'sprint') wave++;
      else if (kind === 'recovery' && wave === 0) wave = 1; // un recupero prima di ogni lavoro apre comunque la prima ondata
      segs.push({ t0, t1, dur: t1 - t0, kind, pct: +(watts / ftp).toFixed(3), watts, w0: r5(a), w1: r5(b), wave: kind === 'warm' ? 0 : kind === 'cool' ? -1 : wave, step: i, label: s.label || null, stepStart: s.t0, stepEnd: s.t0 + s.dur, fixed: true, wk: true });
    }
  });
  segs.sort((a, b) => a.t0 - b.t0);
  const N = Math.max(1, wave);
  for (const s of segs) if (s.wave < 0) s.wave = N + 1;
  // la fine dell'ultimo tratto = fine dell'allenamento (niente deriva dei decimali)
  segs[segs.length - 1].t1 = Math.max(segs[segs.length - 1].t1, wk.total);
  return { name: wk.name || '', total: wk.total, elapsed: Math.max(0, wk.elapsed || 0), ftp, N, segs, wk: true };
}

// watt richiesti in un istante: costanti, tranne nelle rampe (lì seguono la rampa dell'allenamento)
export function wkTarget(seg, el) {
  if (!seg) return 0;
  if (seg.w0 === seg.w1) return seg.watts;
  const k = Math.max(0, Math.min(1, (el - seg.t0) / Math.max(0.001, seg.t1 - seg.t0)));
  return r5(seg.w0 + (seg.w1 - seg.w0) * k);
}

// Orologio del gioco: parte da `elapsed` dell'allenamento, avanza con il tempo del gioco e si riallinea all'hook
// (salto di passo, pausa dell'app). L'allenamento finito = hook che torna null o tempo oltre il totale.
export class WorkoutClock {
  constructor(hooks) { this.hooks = hooks; this.plan = null; this.el = 0; this.ended = false; }
  begin(ftp) {
    const wk = this.hooks?.workout?.() || null;
    this.plan = workoutPlan(wk, ftp); this.ended = false;
    this.el = this.plan ? Math.min(this.plan.total, this.plan.elapsed) : 0;
    return this.plan;
  }
  // dt in secondi di gioco; restituisce il tempo di allenamento
  tick(dt) {
    if (!this.plan) return 0;
    const wk = this.hooks?.workout?.() || null;
    if (!wk) { this.ended = true; return this.el; }
    this.el += dt;
    if (Math.abs((wk.elapsed ?? this.el) - this.el) > 1.5) this.el = wk.elapsed; // l'app è andata avanti (o indietro): ci si riallinea
    if (this.el >= this.plan.total) { this.el = this.plan.total; this.ended = true; }
    return this.el;
  }
}

// Tempo entro ±7 % del bersaglio (è il criterio delle stelle). Non si giudica nei primi secondi di ogni tratto.
export class BandMeter {
  constructor() { this.inT = 0; this.totT = 0; }
  add(dt, power, target, sinceStep) {
    if (!(target > 0) || sinceStep < SETTLE_S) return;
    this.totT += dt; if (Math.abs(power - target) <= BAND * target) this.inT += dt;
  }
  get ratio() { return this.totT > 0 ? this.inT / this.totT : 0; }
}
export function workoutStars(ratio, finished = true) {
  if (!finished) return 0;
  return ratio >= STARS_3 ? 3 : ratio >= STARS_2 ? 2 : 1;
}

// Minuti che mancano (arrotondati per eccesso, almeno 1) per la riga del menu
export const minutesLeft = (wk) => Math.max(1, Math.ceil(Math.max(0, wk.total - wk.elapsed) / 60));

// Tutti i giochi, in modalità allenamento, mostrano lo stesso testo nella riga del bersaglio: nome del passo + tempo che manca
export function stepLabel(seg) { return seg?.label || null; }
