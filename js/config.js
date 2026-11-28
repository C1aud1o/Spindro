// Configurazione pubblica dell'app.
// Indirizzo del ponte Strava (Cloudflare Worker in server/strava-worker).
// Se è vuoto, l'app usa la modalità "personale" (ognuno inserisce la propria app Strava).
export const STRAVA_PROXY = '';

// ---- Monitoraggio (D1). Vuoti = spento: i fork e le build locali non inviano nulla. ----
// Anche per Sentry/GoatCounter con un altro host: aggiorna la Content-Security-Policy di index.html (script-src, connect-src, img-src).
// Sentry (errori JavaScript), regione UE: il DSN termina con ".de.sentry.io". Esempio: 'https://chiave@o123.ingest.de.sentry.io/456'
// Il DSN è pubblico per natura (compare in ogni app che usa Sentry), non è un segreto.
export const SENTRY_DSN = '';
// GoatCounter (statistiche anonime, senza cookie, solo con consenso). Esempio: 'https://spindro.goatcounter.com/count'
export const GOATCOUNTER_URL = 'https://c1laud1o.goatcounter.com/count';

// ---- Segnalazioni. ----
// Indirizzo a cui vanno "Segnala un problema", "Segnala il tuo rullo" e "Segnala questo dispositivo": l'app apre il programma di posta
// della persona con il messaggio già compilato (mailto:), niente passa da un server. Vuoto = come prima, una issue GitHub precompilata (fork).
export const REPORT_EMAIL = 'report@spindro.fit';

// ---- Account facoltativo (E3/E4, docs/account-architettura.md). ----
// FIREBASE_CONFIG = null → nessun login, nessuna richiesta di rete verso Google: è il comportamento di fork e build foss.
// ATTENZIONE: la Content-Security-Policy di index.html non ammette i siti di Firebase/Google. Prima di attivare l'account aggiungi
// a script-src e connect-src gli host che servono (gstatic.com/firebasejs, *.googleapis.com, il dominio Cloud Functions, reCAPTCHA).
// Per attivarlo incolla qui l'oggetto `firebaseConfig` dell'app web (valori pubblici).
// Esempio: { apiKey: '…', authDomain: 'spindro-app.firebaseapp.com', projectId: 'spindro-app', appId: '…', messagingSenderId: '…' }
export const FIREBASE_CONFIG = null;
// true = usa gli emulatori locali (Auth 9099, Firestore 8080, Functions 5001): solo per i test.
export const FIREBASE_EMULATOR = false;
// Chiave pubblica reCAPTCHA v3 per App Check (le classifiche la richiedono: submitScore ha enforceAppCheck). Vuota = App Check spento (emulatori, test).
export const FIREBASE_APPCHECK_SITE_KEY = '';
// Versione ESATTA dell'SDK, caricato solo se FIREBASE_CONFIG c'è, da https://www.gstatic.com/firebasejs/<versione>/
export const FIREBASE_VERSION = '12.19.0';
// Regione delle Cloud Functions (fissa, vedi functions/src/index.ts)
export const FIREBASE_REGION = 'europe-west1';
// Pagine legali del sito (la versione italiana sta sotto /it/). TERMS_VERSION / PRIVACY_VERSION = data della bozza in docs/legal/:
// cambiandola, l'app chiede di nuovo l'accettazione.
export const SITE_URL = 'https://spindro.fit';
export const TERMS_URL = `${SITE_URL}/terms/`;
export const PRIVACY_URL = `${SITE_URL}/privacy/`;
export const TERMS_VERSION = '2026-11';
export const PRIVACY_VERSION = '2026-11';
export const HR_CONSENT_VERSION = '2026-11';
