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

// Spazio esaurito: setItem lancia QuotaExceededError. Nei gestori dell'app (FTP, peso, impostazioni…) un'eccezione lasciava la schermata a metà;
// ora il dato semplicemente non si salva e l'app avvisa una volta ("storagefull"). Chi deve sapere se il salvataggio è riuscito usa strictSet.
const rawSet = Storage.prototype.setItem;
Storage.prototype.setItem = function setItem(k, v) {
  try { return rawSet.call(this, k, v); } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014)) { try { window.dispatchEvent(new Event('storagefull')); } catch { /* */ } return undefined; }
    throw e;
  }
};
/** Scrive e verifica: true solo se il valore è davvero nello storage. */
export function strictSet(key, value) {
  try { localStorage.setItem(key, value); return localStorage.getItem(key) === value; } catch { return false; }
}
