// Checks the translations: node tests/i18n-check.mjs [--strict]
//  - keys present in one language and missing in another;
//  - {placeholders} that differ between languages;
//  - leftover Italian words in the other languages (small stop-word list);
//  - strings identical to the Italian one where a translation is clearly expected (allow-list below);
//  - keys used in the code (t('…'), data-i18n…) but not defined in the files;
//  - keys in the files that the code never uses.
// Exits with an error on any problem; unused keys are a warning (an error with --strict).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = readdirSync(join(root, 'locales')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const dict = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(join(root, 'locales', `${l}.json`), 'utf8'))]));
const strict = process.argv.includes('--strict');

const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const jsFiles = walk(join(root, 'js')).filter((f) => f.endsWith('.js'));
// i18n.js has example keys in comments: they do not count as used keys, but they do count for dynamic prefixes (ordinal.*)
const src = [join(root, 'index.html'), join(root, 'sw.js'), ...jsFiles.filter((f) => !f.endsWith('i18n.js'))].map((f) => readFileSync(f, 'utf8')).join('\n');
const srcAll = [src, readFileSync(join(root, 'js/i18n.js'), 'utf8')].join('\n');

let errors = 0; let warnings = 0;
const say = (kind, msg) => { console.log(`${kind === 'ERR' ? '✗' : '!'} ${msg}`); if (kind === 'ERR') errors++; else warnings++; };

// 1. keys that differ between languages
const all = new Set(LANGS.flatMap((l) => Object.keys(dict[l])));
for (const k of [...all].sort()) {
  const missing = LANGS.filter((l) => !(k in dict[l]));
  if (missing.length) say('ERR', `key "${k}" is missing in: ${missing.join(', ')}`);
}

// 2. consistent placeholders
const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const k of [...all].sort()) {
  const sets = LANGS.filter((l) => k in dict[l]).map((l) => [l, ph(dict[l][k])]);
  if (new Set(sets.map(([, p]) => p)).size > 1) say('ERR', `different placeholders for "${k}": ${sets.map(([l, p]) => `${l}={${p}}`).join(' ')}`);
}

// Text without placeholders, markup, entities, units and product names: what is left is what a translator wrote.
const NAMES = /\b(Spindro|Strava|Garmin(?: Connect)?|Zwift(?: Click| Play| Ride| Cog)?|FTMS|ERG|FTP|GPX|FIT|TCX|ZWO|BLE|Bluetooth|YouTube|Wahoo|Polar|Suunto|COROS|Apple Watch|Van Rysel|Tacx|Elite|Meshy|Quaternius|Kenney|Firebase|Google|GitHub|Breakaway|Horde Run|Pedal Strike|Slipstream|Updraft|Feed Zone|Tempo|Sweet Spot|OVERDRIVE|SMASH|KOM|NP|TSS|HR|CTL|VO2|W|kJ|km|rpm|bpm|kg|min|Min|VO2max|Z[1-7])\b/gi;
const words = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ').replace(/\{\w+\}/g, ' ').replace(NAMES, ' ').replace(/[^\p{L}\s'’-]/gu, ' ').split(/\s+/).filter((w) => w.length > 1);

// 3. leftover Italian words in the other languages (words that are not valid in the target language)
const IT_WORDS = ['della', 'delle', 'degli', 'dello', 'nella', 'nelle', 'sono', 'anche', 'più', 'quando', 'questo', 'questa', 'questi', 'tuo', 'tua', 'tuoi', 'tue',
  'uscita', 'uscite', 'allenamento', 'allenamenti', 'rullo', 'sforzo', 'sforzi', 'recupero', 'pedala', 'pedalare', 'collega', 'collegare', 'collegato', 'scegli',
  'premi', 'riprova', 'nessun', 'nessuna', 'già', 'perché', 'così', 'mentre', 'vuoi', 'puoi', 'hai', 'impostazioni', 'classifica', 'partita', 'gara', 'salita',
  'tappa', 'errore', 'fallito', 'mancato', 'riuscito', 'finestra', 'apri', 'chiudi', 'salva', 'annulla', 'avvia', 'avvio', 'conferma', 'prova', 'cadenza',
  'riscaldamento', 'defaticamento', 'battito', 'percorso', 'sfida', 'obiettivo', 'settimana', 'giorno', 'giorni', 'scia', 'traguardo', 'scatto'];
const IT_OK = { // words that are also correct in the target language
  fr: ['avvio'], es: ['prova', 'conferma'], de: ['prova', 'avvio'], en: ['prova', 'vita'],
};
const itRe = (lang) => { const ok = new Set(IT_OK[lang] || []); return new RegExp(`(^|[^\\p{L}])(${IT_WORDS.filter((w) => !ok.has(w)).join('|')})(?![\\p{L}])`, 'iu'); };
// per-key exceptions: Italian words that stay on purpose (e.g. the name of the Italian-language page, quoted Italian)
const ITALIAN_OK = new Set(['lang.it', 'settings.langIt']);
for (const l of LANGS.filter((x) => x !== 'it')) {
  const re = itRe(l);
  for (const [k, v] of Object.entries(dict[l])) {
    if (ITALIAN_OK.has(k)) continue;
    const m = words(v).join(' ').match(re);
    if (m) say('ERR', `[${l}] "${k}" contains the Italian word "${m[2]}": ${JSON.stringify(v)}`);
  }
}

// 4. strings identical to the Italian one: only names, units, symbols and single short tokens may be identical
// keys where the same text as in Italian is right: names, vendor UI terms, words valid in both languages.
const SAME_OK_KEYS = new Set([
  'games.shooter.level3', // MOTOR CITY: a place name
  'strava.openActivity', // appended to the English message of the Strava bridge, kept in English on purpose
  'strava.step2', // "Authorization Callback Domain" is the name of a field in Strava's own English UI
  'workouts.vo2.name', 'zone.power.Z5', // VO2max
  'coach.minutesOnly.one', 'settings.weight', // the same words in Italian and Spanish
  'games.skeleton.help', // developer-only template game
  'clicknav.title', // "Menu Click" reads the same in Italian and French
]);
const SAME_OK = [/^games\.racer\.rival\d+\.name$/, /^games\.shooter\.hero\.[a-z]+\.name$/]; // character names
const INTERNATIONAL = new Set(['test', 'menu', 'demo', 'sprint', 'video', 'ok', 'app', 'online', 'offline', 'email', 'cloud', 'account', 'backup', 'beta', 'zoom', 'wifi', 'wi-fi', 'qr', 'pdf']);
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
for (const l of LANGS.filter((x) => x !== 'it')) {
  for (const [k, v] of Object.entries(dict[l])) {
    const it = dict.it[k];
    if (typeof it !== 'string' || !same(it, v) || SAME_OK_KEYS.has(k) || SAME_OK.some((re) => re.test(k))) continue;
    const w = words(v);
    // nothing but names/units/numbers, or a single international word (Sprint, Menu, Demo, Zoom…): fine
    if (w.length === 0 || (w.length === 1 && w[0].length <= 9) || w.every((x) => INTERNATIONAL.has(x.toLowerCase()))) continue;
    say('ERR', `[${l}] "${k}" is identical to the Italian text and looks untranslated: ${JSON.stringify(v)}`);
  }
}

// 5. keys used in the code: literal, dynamic (prefix) and HTML
const used = new Set(); const prefixes = new Set();
for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) used.add(m[1]);
for (const m of src.matchAll(/\bt\(\s*`([^`$]*)\$\{/g)) prefixes.add(m[1]);
for (const m of srcAll.matchAll(/['"`]([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*\.)\$\{/g)) prefixes.add(m[1]);
for (const m of src.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) used.add(m[1]);
for (const m of src.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(';')) used.add(pair.split(':')[1]?.trim());
const base = (k) => k.replace(/\.(zero|one|two|few|many|other)$/, '');
const exists = (k) => LANGS.every((l) => k in dict[l] || `${k}.other` in dict[l]);
for (const k of [...used].filter(Boolean).sort()) if (!exists(k)) say('ERR', `key used in the code but not defined: "${k}"`);

// 6. keys never used. A key counts as used when its text appears anywhere in the source (tables of data hold keys as
// strings), or when it falls under a dynamic prefix such as t(`x.${k}`). Prefixes of one segment ("games.") are too
// broad to prove anything, so the keys under them are checked with the explicit patterns of the data-driven screens.
const BROAD = (p) => p.split('.').length <= 2;
const patterns = [/^games\.[a-z0-9]+\.(name|desc|help)$/, /^plans\.[a-z]+\.(name|desc)$/, /^workouts\.[a-z0-9]+\.(name|tag|desc)$/, /^workouts\.cat\./,
  /^challenges\.(km|rides|z2|minutes|kj)$/, /^zone\.(hr|power)\./, /^watch\.[a-z]+\.step[123]$/];
for (const k of Object.keys(dict[LANGS[0]]).sort()) {
  const b = base(k);
  if (used.has(b) || used.has(k) || src.includes(b)) continue;
  if ([...prefixes].some((p) => !BROAD(p) && (k.startsWith(p) || b.startsWith(p)))) continue;
  if (patterns.some((re) => re.test(b))) continue;
  say('WARN', `key never used: "${k}"`);
}

console.log(`\n${LANGS.join(' + ')}: ${Object.keys(dict[LANGS[0]]).length} keys, ${errors} errors, ${warnings} warnings`);
process.exit(errors || (strict && warnings) ? 1 : 0);
