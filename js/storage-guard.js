// Se il browser vieta il localStorage (cookie bloccati, alcune modalità privata) l'accesso a window.localStorage lancia un errore
// e l'app non partirebbe. In quel caso si ripiega su una memoria temporanea, valida finché la pagina resta aperta.
// Deve essere il primo modulo importato da app.js: gli altri moduli leggono il localStorage appena vengono caricati.
for (const name of ['localStorage', 'sessionStorage']) {
  let blocked = false;
  try { window[name].getItem('__spindro'); } catch { blocked = true; }
  if (!blocked) continue;
  const m = new Map();
  const mem = {
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
  try { Object.defineProperty(window, name, { configurable: true, get: () => mem }); } catch { /* non ridefinibile: si va avanti com'era */ }
}
