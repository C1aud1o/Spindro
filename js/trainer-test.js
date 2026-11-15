// "Prova il rullo": per qualche secondo la resistenza sale e scende, così chi pedala sente che il comando funziona.
// Solo a uscita ferma; alla fine (o se qualcosa va storto) si rimette com'era: lo fa `restore` (di solito riapplica la modalità dell'app).
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** Passi della prova secondo ciò che il rullo sa fare: ERG (watt), pendenza o resistenza. */
export function testSteps(trainer, ftp = 200) {
  const f = trainer.features;
  if (f.power) {
    const [minW, maxW] = trainer.ranges.power;
    const low = Math.max(minW || 0, 50);
    const high = Math.min(maxW || 600, Math.max(low + 60, Math.round(ftp * 0.5)), 180);
    return [{ ms: 3000, send: () => trainer.setTargetPower(low) }, { ms: 4000, send: () => trainer.setTargetPower(high) }, { ms: 3000, send: () => trainer.setTargetPower(low) }];
  }
  if (f.simulation) return [{ ms: 3000, send: () => trainer.setSimulation({ grade: 0, mass: 80 }) }, { ms: 4000, send: () => trainer.setSimulation({ grade: 5, mass: 80 }) }, { ms: 3000, send: () => trainer.setSimulation({ grade: 0, mass: 80 }) }];
  if (f.resistance) return [{ ms: 3000, send: () => trainer.setResistancePercent(10) }, { ms: 4000, send: () => trainer.setResistancePercent(40) }, { ms: 3000, send: () => trainer.setResistancePercent(10) }];
  return [];
}

/** Esegue la prova. Ritorna 'done' | 'aborted' | 'failed' | 'unavailable'. `speed` accorcia le attese (test). */
export async function runTrainerTest({ trainer, ftp, restore, onStep = () => {}, shouldAbort = () => false, speed = 1 }) {
  const steps = testSteps(trainer, ftp);
  if (!trainer.connected || !trainer.controllable || !steps.length) return 'unavailable';
  let result = 'done';
  try {
    for (const [i, s] of steps.entries()) {
      if (shouldAbort()) { result = 'aborted'; break; }
      onStep(i + 1, steps.length);
      await s.send();
      await sleepMs(s.ms / speed);
    }
  } catch { result = 'failed'; } finally { try { await restore(); } catch { /* il rullo è caduto: al ricollegamento si rimette lo stato */ } }
  return result;
}
