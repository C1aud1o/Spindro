// Renders extension/icons/icon-{16,32,48,128}.png from icons/icon.svg with the Playwright Chromium.
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/ext-icons.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const svg = fs.readFileSync(`${root}icons/icon.svg`, 'utf8');
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
fs.mkdirSync(`${root}extension/icons`, { recursive: true });
for (const n of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: n, height: n }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${n}px;height:${n}px}</style>${svg}`);
  await page.screenshot({ path: `${root}extension/icons/icon-${n}.png`, omitBackground: true, clip: { x: 0, y: 0, width: n, height: n } });
  await page.close();
}
await browser.close();
console.log('icons written');
