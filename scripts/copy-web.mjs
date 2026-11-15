// Copia i file della webapp in www/ per l'app Android (Capacitor) e per il deploy web.
// Variabili d'ambiente:
//   CHANNEL       'prod' (default) | 'beta'
//   VERSION_CODE  numero di build mostrato nelle impostazioni
//   WEB_DEPLOY=1  build per GitHub Pages: copia anche sw.js; in beta isola il localStorage, mette noindex e separa la cache
import { createHash } from 'node:crypto';
import { cpSync, rmSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
const out = 'www';
const channel = process.env.CHANNEL === 'beta' ? 'beta' : 'prod';
const webDeploy = process.env.WEB_DEPLOY === '1';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const p of ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons', 'assets', 'vendor', 'locales']) {
  if (existsSync(p)) cpSync(p, `${out}/${p}`, { recursive: true });
}
// numero di build (su GitHub = numero della compilazione) e canale, mostrati nelle impostazioni
const build = process.env.VERSION_CODE || 'sviluppo';
writeFileSync(`${out}/js/build.js`, `export const BUILD = '${build}';\nexport const CHANNEL = '${channel}';\n`);

if (webDeploy) {
  // nell'app Android il service worker non serve: solo sul web
  let sw = readFileSync('sw.js', 'utf8');
  if (channel === 'beta') {
    // cache separata da quella stabile (stessa origine); activate() cancella solo le cache con lo stesso prefisso
    sw = sw.replace("const CACHE_PREFIX = 'spindro-';", "const CACHE_PREFIX = 'beta-spindro-';");
    if (!sw.includes("'beta-spindro-'")) throw new Error('sw.js: CACHE_PREFIX non trovato');
    let html = readFileSync(`${out}/index.html`, 'utf8');
    const shim = readFileSync('scripts/beta-storage-shim.js', 'utf8').trim();
    const inject = `<meta name="robots" content="noindex, nofollow">\n  <script>${shim}</script>`;
    if (!html.includes('<head>')) throw new Error('index.html: <head> non trovato');
    // lo shim dev'essere il primo script della pagina: subito dopo <head>
    html = html.replace('<head>', `<head>\n  ${inject}`);
    // la Content-Security-Policy dell'app deve ammettere (per hash) lo script in linea della beta
    const shimHash = `'sha256-${createHash('sha256').update(shim).digest('base64')}'`;
    if (!html.includes("script-src 'self' ")) throw new Error('index.html: script-src non trovato');
    html = html.replace("script-src 'self' ", `script-src 'self' ${shimHash} `);
    writeFileSync(`${out}/index.html`, html);
  }
  writeFileSync(`${out}/sw.js`, sw);
}
console.log(`www pronto (canale ${channel}${webDeploy ? ', web' : ''})`);
