// Diagnostica locale, senza rete e senza dati personali:
//  - cattura gli errori JavaScript non gestiti (error, unhandledrejection), in particolare quelli del collegamento Bluetooth
//    (native.js, devices.js, ftms.js, click.js, hr.js…), nel registro dell'app e in un piccolo diario salvato sul telefono;
//  - al prossimo avvio, se la parte nativa ha registrato un arresto anomalo (CrashRecorder.java), mostra "Spindro si è chiuso
//    all'improvviso" con il testo del report e i pulsanti Copia / Condividi;
//  - "Copia diagnostica" nelle Impostazioni: stessa cosa, a richiesta.
// Questo modulo non importa nulla dall'app (solo i18n), così può essere il primo a partire e vedere anche gli errori degli altri.
import { t } from './i18n.js';

const KEY = 'diagLog';
const MAX_LINES = 120;
const CONNECT_FILES = /(native|devices|devices-ui|ftms|click|hr|connect|powermeter|ble-util|trainers\/[\w-]+)\.js/;

let lines = [];
let sinks = [];
let saveTimer = 0;
try { lines = JSON.parse(localStorage.getItem(KEY) || '[]').filter((x) => typeof x === 'string').slice(-MAX_LINES); } catch { lines = []; }

const stamp = () => new Date().toISOString().slice(11, 23);
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* niente storage */ } }, 300);
}

/** Aggiunge una riga al diario (salvato) e la manda ai registri collegati (il registro visibile dell'app). */
export function record(msg) {
  const line = `${stamp()}  ${String(msg).slice(0, 600)}`;
  lines.push(line);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  persist();
  for (const s of sinks) { try { s(String(msg)); } catch { /* un registro rotto non deve rompere gli altri */ } }
}
/** Collega un registro (es. log() dell'app). Riceve anche le righe già raccolte prima del collegamento. */
export function attachLog(fn) {
  sinks.push(fn);
  for (const l of lines.slice(-20)) { try { fn(l); } catch { /* */ } }
}
export const diaryText = () => lines.join('\n');
export function clearDiary() { lines = []; persist(); }

function describe(reason) {
  if (reason instanceof Error) return { msg: `${reason.name}: ${reason.message}`, stack: reason.stack || '' };
  if (reason && typeof reason === 'object' && 'message' in reason) return { msg: `${reason.name || 'Error'}: ${reason.message}`, stack: String(reason.stack || '') };
  return { msg: String(reason), stack: '' };
}
const lastSeen = new Map();
function report(kind, msg, where, stack) {
  const connect = CONNECT_FILES.test(`${where} ${stack}`);
  const key = `${kind}|${msg}`;
  const now = Date.now();
  if (now - (lastSeen.get(key) || 0) < 2000) return; // lo stesso errore in raffica: una riga
  lastSeen.set(key, now);
  if (lastSeen.size > 50) lastSeen.clear();
  const top = stack.split('\n').map((s) => s.trim()).find((s) => /\.js/.test(s)) || '';
  record(`JS ${kind}${connect ? ' [collegamento]' : ''}: ${msg}${where ? ` (${where})` : ''}${top && !where ? ` ${top}` : ''}`);
}

let installed = false;
/** Da chiamare una volta, il prima possibile. Non cambia il comportamento degli errori: restano anche nella console. */
export function installErrorCapture(win = globalThis) {
  if (installed || !win?.addEventListener) return;
  installed = true;
  win.addEventListener('error', (ev) => {
    const file = String(ev.filename || '').split('/').slice(-2).join('/');
    const d = describe(ev.error || ev.message);
    report('error', d.msg, file ? `${file}:${ev.lineno || 0}` : '', d.stack);
  });
  win.addEventListener('unhandledrejection', (ev) => {
    const d = describe(ev.reason);
    report('unhandledrejection', d.msg, '', d.stack);
  });
}

/** Nell'app Android la pagina gira in una WebView: se Capacitor non c'è, il ponte nativo non è stato iniettato (CSP o WebView vecchia). */
export function checkBridge({ ua = globalThis.navigator?.userAgent || '', native = false } = {}) {
  const inWebView = /Android/i.test(ua) && /; wv\)/.test(ua);
  if (inWebView && !native) {
    record('Android WebView senza ponte Capacitor: il Bluetooth nativo non è disponibile (script di iniezione bloccato dalla CSP o WebView troppo vecchia)');
    return false;
  }
  return true;
}

export function diagnosticsText({ appLog = '', native = false, env = '' } = {}) {
  const nav = globalThis.navigator || {};
  return [
    `Spindro diagnostics ${new Date().toISOString()}`,
    `Native app: ${native ? 'yes' : 'no'}`,
    `User agent: ${nav.userAgent || '?'}`,
    env ? `\n${env}` : '',
    '\n=== Diary (connection steps and JS errors, oldest first) ===',
    diaryText() || '(empty)',
    '\n=== App log (newest first) ===',
    appLog || '(empty)',
  ].filter((x) => x !== '').join('\n');
}

// ---- Appunti e condivisione ------------------------------------------------------------------------------------------
export async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* ripiego */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* niente */ }
  ta.remove();
  return ok;
}
const b64 = (text) => {
  const bytes = new TextEncoder().encode(text); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
/** Lo stesso percorso di "Condividi" per i file FIT (GarminBridge.shareFile), altrimenti la condivisione del browser. */
export async function shareText(text, { plugin = null, name = 'spindro-report.txt' } = {}) {
  if (plugin?.shareFile) { await plugin.shareFile({ name, mime: 'text/plain', data: b64(text), mode: 'send' }); return true; }
  if (navigator.share) { await navigator.share({ title: 'Spindro', text }); return true; }
  return false;
}

// ---- Arresto anomalo dell'ultima volta -----------------------------------------------------------------------------------
/**
 * Se l'ultima sessione si è chiusa per un crash nativo, mostra il report. Il file nativo si cancella solo quando la persona
 * preme Chiudi (se la finestra stessa andasse storta, il report c'è ancora al prossimo avvio). Restituisce l'elemento o null.
 */
export async function checkNativeCrash({ plugin, doc = document } = {}) {
  if (!plugin?.getCrashReport) return null;
  let report = null;
  try { report = (await plugin.getCrashReport())?.report || null; } catch { return null; }
  if (!report) return null;
  const full = `${report}\n\n--- Diary (JS side) ---\n${diaryText() || '(empty)'}`;

  const box = doc.createElement('div');
  box.className = 'calib dlg crash-dlg';
  const body = doc.createElement('div'); body.className = 'calib-box'; body.setAttribute('role', 'dialog'); body.setAttribute('aria-modal', 'true'); body.setAttribute('aria-label', t('crash.title'));
  const h = doc.createElement('h2'); h.textContent = t('crash.title');
  const p = doc.createElement('p'); p.className = 'dlg-msg'; p.textContent = t('crash.body');
  const ta = doc.createElement('textarea'); ta.className = 'dbg-pre crash-text'; ta.readOnly = true; ta.value = full; ta.setAttribute('aria-label', t('crash.report'));
  const note = doc.createElement('p'); note.className = 'fine crash-note'; note.setAttribute('role', 'status');
  const row = doc.createElement('div'); row.className = 'row2';
  const copy = doc.createElement('button'); copy.className = 'cta'; copy.setAttribute('data-copy', ''); copy.textContent = t('crash.copy');
  const share = doc.createElement('button'); share.className = 'ghost'; share.setAttribute('data-share', ''); share.textContent = t('crash.share');
  const close = doc.createElement('button'); close.className = 'ghost'; close.setAttribute('data-close', ''); close.textContent = t('ui.close');
  row.append(copy, share, close);
  body.append(h, p, ta, note, row);
  box.append(body);
  doc.body.append(box);

  copy.addEventListener('click', async () => { note.textContent = (await copyToClipboard(full)) ? t('crash.copied') : t('crash.copyFail'); });
  share.addEventListener('click', async () => {
    try { note.textContent = (await shareText(full, { plugin })) ? '' : t('crash.shareFail'); } catch { note.textContent = t('crash.shareFail'); }
  });
  close.addEventListener('click', async () => {
    try { await plugin.clearCrashReport?.(); } catch { /* resta per la prossima volta */ }
    box.remove();
  });
  copy.focus();
  return box;
}

if (typeof window !== 'undefined') installErrorCapture(window);
