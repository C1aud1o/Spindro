// Fonte di casualità dei giochi. Di norma è Math.random; se un test imposta `window.__spindroSeed` (numero) o il gioco riceve un
// `seed`, ogni partita usa un generatore con seme (mulberry32): stessi numeri a ogni prova, indipendenti dal resto della pagina.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
// seed esplicito > window.__spindroSeed > nessuno (Math.random)
export function makeRandom(seed = null) {
  const s = seed != null ? seed : (typeof globalThis !== 'undefined' ? globalThis.__spindroSeed : undefined);
  return s == null || Number.isNaN(Number(s)) ? Math.random : mulberry32(Number(s) | 0);
}
