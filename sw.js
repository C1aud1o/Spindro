// CACHE_PREFIX: la build beta lo cambia (scripts/copy-web.mjs) per non toccare le cache dell'app stabile, che sta nella stessa origine
const CACHE_PREFIX = 'spindro-';
const CACHE = CACHE_PREFIX + 'v78';
// I modelli 3D (assets/3d) e il decoder meshopt non sono nel precache: si salvano in cache al primo uso (rete prima, cache come riserva).
const ASSETS = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/ftms.js', 'js/trainers/index.js', 'js/trainers/fec.js', 'js/trainers/wahoo.js', 'js/click.js', 'js/gears.js', 'js/hr.js', 'js/fit.js', 'js/native.js', 'js/build.js', 'js/powermeter.js', 'js/devices.js', 'js/devices-ui.js', 'js/sources.js', 'vendor/capacitor/capacitor.js', 'js/strava.js', 'js/config.js', 'js/debug.js', 'js/debugview.js', 'js/games/engine.js', 'js/games/audio.js', 'js/games/racer3d.js', 'js/games/kit3d.js', 'js/games/horde.js', 'js/games/strike3d.js', 'js/games/progress.js', 'js/watchguide.js', 'js/games/base3d.js', 'js/games/gruppetto.js', 'js/games/mattoni.js', 'js/games/planata.js', 'js/videoride.js', 'js/workouts.js', 'js/history.js', 'js/route.js', 'js/sharecard.js', 'js/editor.js', 'js/ui.js', 'js/i18n.js', 'locales/it.json', 'locales/en.json', 'locales/fr.json', 'locales/es.json', 'locales/de.json', 'js/coach.js', 'js/celebrate.js', 'js/clicknav.js', 'js/dialog.js', 'manifest.webmanifest', 'icons/icon.svg', 'js/monitor.js', 'js/report.js', 'js/account/index.js', 'js/account/sdk.js', 'js/account/ui.js', 'js/account/sync.js', 'js/account/sync-core.js', 'js/account/boards.js', 'js/challenges.js', 'js/plans.js', 'js/plans-ui.js', 'js/calibrate.js', 'js/games/kit/loader.js', 'js/games/kit/style.js', 'js/games/kit/quality.js', 'js/games/kit/juice.js', 'js/games/kit/cyclist.js', 'js/games/kit/autorig.js', 'js/games/kit/env.js', 'js/games/kit/hud.js', 'js/games/kit/walkers.js', 'js/games/horde-world.js', 'assets/fonts/lilita-one-latin-400-normal.woff2', 'assets/fonts/lilita-one-latin-ext-400-normal.woff2', 'assets/fonts/nunito-latin-700-normal.woff2', 'assets/fonts/nunito-latin-ext-700-normal.woff2', 'assets/fonts/nunito-latin-900-normal.woff2', 'assets/icons/trainer.webp', 'assets/icons/click.webp', 'assets/icons/heart.webp', 'assets/icons/workouts.webp', 'assets/icons/games.webp', 'assets/icons/trophy.webp', 'js/games/strike-world.js', 'js/games/strike-plan.js', 'js/games/racer-sim.js', 'js/games/horde-plan.js', 'js/games/slip-plan.js', 'js/games/slip-world.js', 'js/games/planata-plan.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rete prima, cache come riserva (così gli aggiornamenti arrivano subito)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
