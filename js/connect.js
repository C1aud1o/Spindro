// Collegare i dispositivi: parti pure (nessun accesso a Bluetooth o al DOM), così si provano da sole.
//   detectSupport()   può questa piattaforma parlare Bluetooth dal browser? se no, perché e cosa fare
//   explainError()    da un errore Bluetooth al motivo in parole semplici (spento, permesso negato, occupato…)
//   nextSuggestion()  qual è il prossimo dispositivo da proporre (uno alla volta)
//   BACKOFF_MS        attese fra i tentativi di ricollegamento in corsa
//   roleSummary()     frase semplice per un dispositivo con più ruoli
// Testi: js/i18n.js (chiavi connect.*). Spiegazione per l'utente: docs/connecting-devices.md.

/** Piattaforma e supporto. `native`: app Android (Capacitor); `hasBluetooth`: 'bluetooth' in navigator. */
export function detectSupport({ ua = '', native = false, hasBluetooth = false, secure = true } = {}) {
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua)); // tutti i browser su iOS usano WebKit: nessuno ha Web Bluetooth
  const firefox = /Firefox|FxiOS/i.test(ua);
  const platform = native ? 'app' : ios ? 'ios' : android ? 'android' : 'desktop';
  if (native) return { ok: true, platform, reason: null };
  if (!secure) return { ok: false, platform, reason: 'insecure' };
  if (hasBluetooth) return { ok: true, platform, reason: null };
  if (ios) return { ok: false, platform, reason: 'ios' };
  if (firefox) return { ok: false, platform, reason: 'firefox' };
  if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua)) return { ok: false, platform, reason: 'safari' };
  return { ok: false, platform, reason: 'other' };
}

/** Dal messaggio e dal nome dell'errore al motivo. `afterPick`: l'errore è venuto dopo che la persona aveva scelto il dispositivo. */
export function explainError(err, { afterPick = false } = {}) {
  const name = err?.name || '';
  const msg = String(err?.message || err || '');
  if (err?.unsupported) return 'unsupportedDevice';
  if (/already connected/i.test(msg)) return 'already';
  if (/bluetooth.*(off|disabled|not enabled|not available|unavailable)|adapter|powered off|not enabled|is disabled|turned off/i.test(msg)) return 'off';
  if (/permission|not allowed|denied|blocked|SecurityError/i.test(msg) || name === 'SecurityError') return 'permission';
  if (name === 'NotFoundError' && /cancel|no device|chooser|selected/i.test(msg)) return 'cancelled';
  if (/cancel|dismiss/i.test(msg)) return 'cancelled';
  if (afterPick || name === 'NetworkError' || /GATT|connection|connect|timeout|timed out|busy|failed/i.test(msg)) return afterPick ? 'busy' : 'noDevice';
  if (name === 'NotFoundError') return 'noDevice';
  return 'unknown';
}

/** Prossimo dispositivo da proporre dopo il rullo: uno solo alla volta, mai ciò che è già collegato o scartato per sempre. */
export function nextSuggestion({ trainer = false, haveClick = false, haveHr = false, dismissed = [], riding = false } = {}) {
  if (!trainer || riding) return null;
  if (!haveClick && !dismissed.includes('click')) return 'click';
  if (!haveHr && !dismissed.includes('hr')) return 'hr';
  return null;
}

/** Attese (ms) fra un tentativo e l'altro: 1, 2, 5, 10 s… poi 15 e 30. L'ultima si ripete finché dura l'uscita. */
export const BACKOFF_MS = [1000, 2000, 5000, 10000, 15000, 30000];
export const backoffAt = (list, attempt) => list[Math.min(attempt, list.length - 1)];

/** Quanti tentativi fuori dall'uscita prima di arrendersi (poi resta il pulsante "Ricollega"). */
export const IDLE_ATTEMPTS = 4;

/** Servizi per ogni scelta "mirata": la lista del browser mostra solo quel tipo di dispositivo. */
export const KIND_FILTERS = {
  click: [{ services: [0xfc82] }, { namePrefix: 'Zwift' }],
  hr: [{ services: [0x180d] }],
};

/** Ruoli di un dispositivo → elenco di chiavi i18n (devices.role.*), senza doppioni. */
export const roleKeys = (roles) => [...new Set(roles.filter((r) => r !== '?'))];
