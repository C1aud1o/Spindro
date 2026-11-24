// Ponte con l'estensione "Spindro Remote" (cartella extension/, vedi docs/extension.md) e modalità "Remote" del Click.
// Protocollo v1 via window.postMessage nella stessa finestra (stesso origin). Il pezzo corrispondente è extension/bridge.js.
//   app → estensione: { ns, v, from:'app', type:'hello' | 'cmd' | 'status', id?, cmd?, args? }
//   estensione → app: { ns, v, from:'ext', type:'hello', version, commands, strong } | { type:'result', id, ok, data? | error:{code,message,detail?} }
// Senza estensione (o fuori da Chrome/Edge desktop) `available` resta falso e la modalità Remote non si offre.
export const NS = 'spindro-remote';
export const PROTOCOL = 1;
export const COMMANDS = ['playPause', 'seekBack', 'seekFwd', 'volumeUp', 'volumeDown', 'mute', 'next', 'prev', 'skip', 'fullscreen',
  'scrollUp', 'scrollDown', 'focusNext', 'focusPrev', 'focusUp', 'focusDown', 'focusLeft', 'focusRight', 'activate', 'back',
  'nextTab', 'prevTab', 'focusSpindro', 'focusTarget'];
export const GUIDE_URL = 'https://github.com/C1aud1o/Spindro/blob/main/docs/extension.md';
const TIMEOUT = 4000;

/**
 * Comando dell'estensione per il ruolo di un tasto, in modalità Remote. Pura.
 * Controller con le frecce: su / giù = volume, sinistra / destra = salto, ok = play/pausa, back = indietro del browser (il menu apre il menu Click).
 * + / − (anche da soli, Click v1): salto avanti / indietro di 10 s.
 */
export function remoteCommandFor(role) {
  switch (role) {
    case 'plus': case 'right': return 'seekFwd';
    case 'minus': case 'left': return 'seekBack';
    case 'up': return 'volumeUp';
    case 'down': return 'volumeDown';
    case 'ok': return 'playPause';
    case 'back': return 'back';
    default: return null;
  }
}

/** Il messaggio viene dall'estensione nella nostra stessa pagina? (origine, finestra, forma). Pura rispetto al DOM: prende l'evento. */
export function isExtMessage(e, win = window) {
  const d = e && e.data;
  return !!d && typeof d === 'object' && e.source === win && e.origin === win.location.origin
    && d.ns === NS && d.v === PROTOCOL && d.from === 'ext' && typeof d.type === 'string';
}

export function createRemote({ win = window, onChange = () => {} } = {}) {
  const r = { available: false, version: null, strong: false, mode: false, commands: [], last: null };
  const waiting = new Map(); let seq = 0;
  const post = (msg) => win.postMessage({ ns: NS, v: PROTOCOL, from: 'app', ...msg }, win.location.origin);
  win.addEventListener('message', (e) => {
    if (!isExtMessage(e, win)) return;
    const d = e.data;
    if (d.type === 'hello') {
      r.available = true; r.version = String(d.version || ''); r.strong = !!d.strong;
      r.commands = Array.isArray(d.commands) ? d.commands.filter((c) => COMMANDS.includes(c)) : [];
      onChange(); return;
    }
    if (d.type === 'result' && waiting.has(d.id)) {
      const w = waiting.get(d.id); waiting.delete(d.id); clearTimeout(w.timer);
      r.last = { cmd: w.cmd, ok: !!d.ok, error: d.ok ? null : (d.error || { code: 'internal', message: 'error' }) };
      if (d.ok) w.resolve({ ok: true, data: d.data }); else w.resolve({ ok: false, error: r.last.error });
      onChange();
    }
  });
  const hello = () => post({ type: 'hello' });
  // l'estensione si annuncia da sola al caricamento, ma può arrivare dopo di noi: si ripete il saluto un paio di volte
  hello(); setTimeout(hello, 400); setTimeout(hello, 1500);
  win.addEventListener('pageshow', hello);

  r.hello = hello;
  r.send = (cmd, args) => new Promise((resolve) => {
    if (!r.available) { resolve({ ok: false, error: { code: 'no-extension', message: 'Extension not found' } }); return; }
    const id = `c${++seq}`;
    const timer = setTimeout(() => { waiting.delete(id); r.last = { cmd, ok: false, error: { code: 'timeout', message: 'No answer' } }; resolve({ ok: false, error: r.last.error }); onChange(); }, TIMEOUT);
    waiting.set(id, { resolve, timer, cmd });
    post({ type: 'cmd', id, cmd, ...(args ? { args } : {}) });
  });
  r.status = () => new Promise((resolve) => {
    if (!r.available) { resolve(null); return; }
    const id = `s${++seq}`; const timer = setTimeout(() => { waiting.delete(id); resolve(null); }, TIMEOUT);
    waiting.set(id, { resolve: (v) => resolve(v.ok ? v.data : null), timer, cmd: 'status' });
    post({ type: 'status', id });
  });
  r.setMode = (on) => { const v = !!on && r.available; if (v !== r.mode) { r.mode = v; onChange(); } return r.mode; };
  r.toggle = () => r.setMode(!r.mode);
  return r;
}
