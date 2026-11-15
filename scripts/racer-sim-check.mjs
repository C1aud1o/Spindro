// Prova senza browser del direttore di Breakaway: un giocatore a potenza fissa (in % della FTP) contro i 7 rivali.
//   node scripts/racer-sim-check.mjs [--min=5] [--stage=0] [--level=1] [--seeds=5]
import { Race, buildTimeline, TUNE } from "../js/games/racer-sim.js";
if (process.env.RHO) TUNE.rho = process.env.RHO.split(",").map(Number); if (process.env.CHASE) TUNE.chase = Number(process.env.CHASE); if (process.env.CMAX) TUNE.chaseMax = Number(process.env.CMAX); if (process.env.KD) TUNE.kD = process.env.KD.split(",").map(Number); if (process.env.CT) TUNE.cohTight = Number(process.env.CT); if (process.env.WAIT) TUNE.wait = Number(process.env.WAIT); if (process.env.WMAX) TUNE.waitMax = Number(process.env.WMAX); if (process.env.COH) TUNE.coh = Number(process.env.COH);
const a = process.argv.slice(2); const opt = (k, d) => Number(a.find((x) => x.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const MIN = opt('min', 5); const STAGE = opt('stage', { 5: 0, 10: 2, 20: 1 }[MIN]); const LEVEL = opt('level', 1); const SEEDS = opt('seeds', 5);
const tl = buildTimeline(MIN * 60, STAGE);
if (a.includes('--tl')) { for (const m of tl.moments) console.log(m.kind.padEnd(8), `t ${m.t0.toFixed(0)}-${m.t1.toFixed(0)}  s ${m.s0.toFixed(0)}-${m.s1.toFixed(0)}`); console.log('lunghezza', tl.length.toFixed(0)); }
console.log(`tappa ${MIN} min, scenario ${STAGE}, livello ${LEVEL}`);
console.log('FTP×  piazz.(per seme)      stelle  obiettivi  tempo   primoEv  maxVuoto  ev/min');
for (const pw of [0.6, 0.8, 1.0, 1.2]) {
  const rows = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = new Race({ duration: MIN * 60, stage: STAGE, level: LEVEL, seed, names: ['Gianni', 'Tina', 'Conte', 'Mirko', 'Lia', 'Bruno', 'Zia'] });
    const dt = 1 / 30; let guard = 0;
    // il bot guida come il gioco: scia del corridore davanti (3 corsie), sorpasso dalla corsia libera dopo 0,5 s di blocco
    const LN = [-2.4, 0, 2.4]; let lane = 1; let x = 0; let lineT = 0; let blockT = 0;
    while (!r.checkEnd() && guard++ < 60 * 30 * MIN * 3) {
      lineT -= dt;
      if (lineT <= 0) { lineT = 0.6; let best = null; for (const q of r.rivals) { const gp = q.s - r.player.s; if (gp > 1.8 && gp < 22 && (!best || gp < best.gp)) best = { gp, x: q.x }; } if (best) lane = LN.reduce((bi, lx, i) => (Math.abs(lx - best.x) < Math.abs(LN[bi] - best.x) ? i : bi), 0); }
      x += (LN[lane] - x) * Math.min(1, dt * 2.2);
      r.step(dt, { e: pw, x });
      if (r.blocked) { blockT += dt; if (blockT > 0.5) { const free = (i) => !r.rivals.some((q) => Math.abs(q.x - LN[i]) < 1.2 && q.s - r.player.s > -2.5 && q.s - r.player.s < 7); const o = [0, 1, 2].filter((i) => i !== lane && free(i)).sort((a2, b2) => Math.abs(a2 - lane) - Math.abs(b2 - lane)); if (o.length) { lane = o[0]; lineT = 2.5; blockT = 0; } } } else blockT = 0;
    }
    const res = r.finalize(); const ts = r.log.map((l) => l.t); const gaps = ts.slice(1).map((t, i) => t - ts[i]);
    rows.push({ place: res.place, stars: res.stars, obj: `${res.objDone}/${res.objTotal}`, time: r.t, first: ts[0] ?? 99, maxGap: Math.max(...gaps, ts[0] ?? 0), perMin: ts.length / (r.t / 60) });
  }
  const avg = (k) => rows.reduce((s, x) => s + x[k], 0) / rows.length;
  console.log(`${pw.toFixed(1)}   ${rows.map((x) => x.place).join(',').padEnd(18)} ${rows.map((x) => x.stars).join(',').padEnd(8)} ${rows.map((x) => x.obj).join(' ').padEnd(24)} ${avg('time').toFixed(0).padStart(4)}s  ${avg('first').toFixed(1).padStart(5)}  ${Math.max(...rows.map((x) => x.maxGap)).toFixed(1).padStart(6)}  ${avg('perMin').toFixed(1)}`);
}
