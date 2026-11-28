// Monitoraggio rispettoso della privacy.
//  - Sentry: errori JavaScript, solo se SENTRY_DSN è impostato. Senza consenso (legittimo interesse), ma senza dati personali.
//  - GoatCounter: statistiche anonime senza cookie, SOLO con consenso dell'utente e se GOATCOUNTER_URL è impostato.
// Con le costanti vuote (default nel repo) non viene caricato né inviato nulla.
import { SENTRY_DSN, GOATCOUNTER_URL } from './config.js';

const SENTRY_SDK = 'https://browser.sentry-cdn.com/8.55.0/bundle.min.js';
const GC_SCRIPT = 'https://gc.zgo.at/count.js';

// ---- consenso: '1' sì, '0' no, assente = non ancora chiesto ----
// CONSENT_LIST is the version of the list of things counted (the text of the question, privacy.body, and docs/legal/privacy.*).
// A "yes" given to an older, shorter list does not cover the new one: nothing is counted and the question is asked once more.
// A "no" stays a no and is never asked again, as the privacy policy promises.
export const CONSENT_LIST = '2';
export function consent() { try { return localStorage.getItem('analytics'); } catch { return null; } }
const listSeen = () => { try { return localStorage.getItem('analyticsList') || '1'; } catch { return '1'; } };
export const consentAsked = () => consent() === '0' || (consent() === '1' && listSeen() === CONSENT_LIST);
export const consentGiven = () => consent() === '1' && listSeen() === CONSENT_LIST;
export function setConsent(yes) {
  try { localStorage.setItem('analytics', yes ? '1' : '0'); localStorage.setItem('analyticsList', CONSENT_LIST); } catch { /* storage non disponibile */ }
  if (yes) loadGoatCounter(); else { queue.length = 0; }
}

const queue = [];
let gcState = 'idle'; // idle | loading | ready
function loadGoatCounter() {
  if (gcState !== 'idle' || !GOATCOUNTER_URL || !consentGiven()) return;
  gcState = 'loading';
  window.goatcounter = { no_onload: true, no_events: true, endpoint: GOATCOUNTER_URL };
  const s = document.createElement('script');
  s.async = true; s.src = GC_SCRIPT; s.dataset.goatcounter = GOATCOUNTER_URL;
  s.onload = () => { gcState = 'ready'; flush(); };
  s.onerror = () => { gcState = 'idle'; queue.length = 0; };
  document.head.append(s);
}
function flush() {
  while (queue.length && gcState === 'ready' && consentGiven()) {
    try { window.goatcounter.count(queue.shift()); } catch { /* le statistiche non devono mai rompere l'app */ }
  }
}

// Evento anonimo: nome corto + dettaglio facoltativo (es. nome del gioco, protocollo, lingua). Mai dati personali.
export function track(name, detail) {
  if (!GOATCOUNTER_URL || !consentGiven()) return;
  const path = detail ? `${name}/${String(detail).slice(0, 40)}` : name;
  queue.push({ path, title: path, event: true });
  if (gcState === 'idle') loadGoatCounter(); else flush();
}

// The same event at most once per page load (for example "a heart-rate strap connected").
const once = new Set();
export function trackOnce(name, detail) { const k = `${name}/${detail || ''}`; if (once.has(k) || !consentGiven()) return; once.add(k); track(name, detail); }
// Lengths are only ever sent as a range, never as a number.
export const durationRange = (s) => (s < 60 ? 'under-1m' : s < 300 ? '1-5m' : s < 900 ? '5-15m' : s < 1800 ? '15-30m' : s < 3600 ? '30-60m' : 'over-60m');
// Time with the app on screen, as milestones reached (1, 5, 15 and 60 minutes): sent while the app is open, so nothing depends on the page closing.
const STAY = [[60, '1m'], [300, '5m'], [900, '15m'], [3600, '60m']];
function watchStay(step = 15) {
  let shown = 0; let next = 0;
  setInterval(() => {
    if (globalThis.document?.visibilityState !== 'visible') return;
    shown += step;
    while (next < STAY.length && shown >= STAY[next][0]) track('stay', STAY[next++][1]);
  }, step * 1000);
}

// ---- Sentry ----
// Toglie tutto ciò che può identificare: query string e hash degli URL, nomi dei dispositivi, localStorage.
export function scrubEvent(event) {
  const clean = (u) => (typeof u === 'string' ? u.split(/[?#]/)[0] : u);
  if (event.request) {
    event.request.url = clean(event.request.url);
    delete event.request.query_string; delete event.request.cookies; delete event.request.headers; delete event.request.env;
  }
  delete event.user; delete event.server_name;
  if (event.contexts) { delete event.contexts.device; delete event.contexts.storage; }
  for (const b of event.breadcrumbs || []) {
    if (b.data) { for (const k of ['url', 'from', 'to']) if (b.data[k]) b.data[k] = clean(b.data[k]); }
    if (typeof b.message === 'string' && /localStorage|device|name=/i.test(b.message)) b.message = '[rimosso]';
  }
  return event;
}

function loadSentry({ release, environment }) {
  if (!SENTRY_DSN) return;
  const s = document.createElement('script');
  s.async = true; s.src = SENTRY_SDK; s.crossOrigin = 'anonymous';
  s.onload = () => {
    try {
      window.Sentry.init({
        dsn: SENTRY_DSN, release, environment,
        sendDefaultPii: false, // niente IP, niente cookie, niente utente
        defaultIntegrations: false,
        integrations: [window.Sentry.globalHandlersIntegration(), window.Sentry.linkedErrorsIntegration(), window.Sentry.dedupeIntegration()],
        beforeSend: scrubEvent,
        beforeBreadcrumb: (b) => (b.category === 'console' ? null : b),
      });
    } catch { /* il monitoraggio non deve mai rompere l'app */ }
  };
  document.head.append(s);
}

export function initMonitoring({ release, environment, lang, platform }) {
  loadSentry({ release, environment });
  watchStay();
  if (consentGiven()) {
    loadGoatCounter();
    track('app-open', platform);
    if (lang) track('lang', lang);
  }
}
