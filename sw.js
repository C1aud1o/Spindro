// CACHE_PREFIX: la build beta lo cambia (scripts/copy-web.mjs) per non toccare le cache dell'app stabile, che sta nella stessa origine
const CACHE_PREFIX = 'spindro-';
const CACHE = CACHE_PREFIX + 'v118';
// I modelli 3D (assets/3d) e il decoder meshopt non sono nel precache: si salvano in cache al primo uso (rete prima, cache come riserva).
const ASSETS = ['./', 'index.html', 'css/tokens.css', 'css/style.css', 'css/glass.css', 'js/glass.js', 'js/app.js', 'js/storage-guard.js', 'js/ftms.js', 'js/trainers/index.js', 'js/trainers/fec.js', 'js/trainers/wahoo.js', 'js/click.js', 'js/gears.js', 'js/hr.js', 'js/fit.js', 'js/native.js', 'js/crashreport.js', 'js/build.js', 'js/powermeter.js', 'js/devices.js', 'js/devices-ui.js', 'js/connect.js', 'js/ble-util.js', 'js/trainer-test.js', 'js/sources.js', 'vendor/capacitor/capacitor.js', 'js/strava.js', 'js/config.js', 'js/debug.js', 'js/debugview.js', 'js/games/engine.js', 'js/games/audio.js', 'js/games/racer3d.js', 'js/games/kit3d.js', 'js/games/horde.js', 'js/games/strike3d.js', 'js/games/progress.js', 'js/watchguide.js', 'js/games/gruppetto.js', 'js/games/mattoni.js', 'js/games/planata.js', 'js/videoride.js', 'js/workouts.js', 'js/history.js', 'js/route.js', 'js/sharecard.js', 'js/editor.js', 'js/ui.js', 'js/i18n.js', 'locales/it.json', 'locales/en.json', 'locales/fr.json', 'locales/es.json', 'locales/de.json', 'js/coach.js', 'js/celebrate.js', 'js/clicknav.js', 'js/clickcheck.js', 'js/icons.js', 'js/dialog.js', 'manifest.webmanifest', 'icons/icon.svg', 'js/monitor.js', 'js/report.js', 'js/account/index.js', 'js/account/sdk.js', 'js/account/ui.js', 'js/account/sync.js', 'js/account/sync-core.js', 'js/account/boards.js', 'js/challenges.js', 'js/plans.js', 'js/plans-ui.js', 'js/calibrate.js', 'js/games/kit/loader.js', 'js/games/kit/style.js', 'js/games/kit/quality.js', 'js/games/kit/juice.js', 'js/games/kit/cyclist.js', 'js/games/kit/autorig.js', 'js/games/kit/env.js', 'js/games/kit/hud.js', 'js/games/kit/walkers.js', 'js/games/horde-world.js', 'assets/fonts/lilita-one-latin-400-normal.woff2', 'assets/fonts/lilita-one-latin-ext-400-normal.woff2', 'assets/fonts/nunito-latin-700-normal.woff2', 'assets/fonts/nunito-latin-ext-700-normal.woff2', 'assets/fonts/nunito-latin-900-normal.woff2', 'js/games/strike-world.js', 'js/games/strike-plan.js', 'js/games/racer-sim.js', 'js/games/horde-plan.js', 'js/games/slip-plan.js', 'js/games/slip-world.js', 'js/games/planata-plan.js', 'js/games/kit/menu.js', 'js/games/kit/rng.js', 'js/games/kit/workout-plan.js', 'assets/fonts/barlow-latin-400-normal.woff2', 'assets/fonts/barlow-latin-500-normal.woff2', 'assets/fonts/barlow-latin-600-normal.woff2', 'assets/fonts/barlow-condensed-latin-500-normal.woff2', 'assets/fonts/barlow-condensed-latin-600-normal.woff2', 'assets/fonts/barlow-condensed-latin-700-normal.woff2', 'assets/fonts/barlow-condensed-latin-700-italic.woff2', 'assets/fonts/barlow-condensed-latin-800-italic.woff2', 'js/games/kit/types.js', 'js/games/registry.js', 'js/games/list.js', 'js/games/demo.js', 'js/games/template/tempo.js', 'js/games/template/skeleton3d.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/shortcut-workouts.png', 'icons/shortcut-games.png', 'js/games/kit/workout-strip.js', 'js/ticker.js', 'js/ticker-worker.js', 'js/remote.js', 'js/miniwin.js', 'js/mini-view.js', 'css/mini.css'];

// Installazione: tutto il precache o niente. NIENTE skipWaiting qui: un nuovo worker aspetta che l'utente lo accetti
// (invito "nuova versione pronta" in js/app.js, che manda il messaggio 'skipWaiting') oppure che l'app venga chiusa e riaperta.
// Così una pedalata in corso non cambia versione sotto i piedi.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
// Pulizia: si cancellano solo le cache con LO STESSO prefisso (la beta usa 'beta-spindro-', la stabile 'spindro-': non si toccano)
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rete prima, cache come riserva (così gli aggiornamenti arrivano subito e offline l'app parte).
// In cache entrano solo risposte buone (200 dello stesso sito): un 404/500 di passaggio non deve sostituire il file giusto, altrimenti offline l'app resta rotta.
// Offline una pagina con parametri (?open=…, ?code=…, ?utm=…) o una rotta sconosciuta ripiega sulla pagina principale in cache.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      return Response.error();
    })
  );
});
