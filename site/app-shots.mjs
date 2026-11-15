#!/usr/bin/env node
// Schermate dell'app per il sito: schermate vere a 360x640, scala 1,5 -> WebP 540x960, in en e it.
// Usa scripts/store-shots.mjs (rullo finto di tests/fake-ble.js, dati di esempio) e poi converte.
//   node site/app-shots.mjs
// Serve ImageMagick (`convert`). Cloud: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'assets/shots');
const tmp = mkdtempSync(join(tmpdir(), 'spindro-app-'));
const env = { ...process.env, STORE_OUT: tmp, SHOTS: '1,2,3,6,7,8,9', PW_CHROMIUM_PATH: process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium' };
const r = spawnSync('node', ['scripts/store-shots.mjs', 'en', 'it'], { cwd: root, env, stdio: 'inherit' });
if (r.status) { console.error('store-shots è fallito'); process.exit(1); }
const names = { '09': 'connect', '01': 'ride', '02': 'workouts', '03': 'editor', '06': 'watch', '07': 'finish', '08': 'history' };
for (const lang of ['en', 'it']) {
  for (const [n, name] of Object.entries(names)) {
    const c = spawnSync('convert', [join(tmp, lang, `${n}.png`), '-resize', '540x960', '-quality', '82', join(out, `${name}-${lang}.webp`)], { stdio: 'inherit' });
    if (c.status) process.exit(1);
    console.log(`salvato site/assets/shots/${name}-${lang}.webp`);
  }
}
rmSync(tmp, { recursive: true, force: true });
