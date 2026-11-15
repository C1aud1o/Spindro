// Ascolti sicuri per i dispositivi che si ricollegano: un oggetto (rullo, fascia, sensore…) che si ricollega allo stesso
// dispositivo non deve accumulare ascoltatori. Con la stessa chiave il vecchio ascoltatore viene tolto prima di mettere il nuovo,
// altrimenti dopo ogni riconnessione ogni dato arriverebbe una volta in più ("dati doppi", "scollegato" ripetuto).
const registry = new WeakMap(); // owner → Map(key → { target, type, fn })
export function listen(owner, key, target, type, fn) {
  let m = registry.get(owner);
  if (!m) registry.set(owner, m = new Map());
  const old = m.get(key);
  if (old) old.target.removeEventListener(old.type, old.fn);
  m.set(key, { target, type, fn });
  target.addEventListener(type, fn);
}
