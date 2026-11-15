import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT) || 4173; // PORT=xxxx permette più copie del repo in parallelo
// In locale, se la versione di Chromium non coincide, si può puntare a un binario già installato:
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm test
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // L'avviso di sicurezza (una volta, prima della prima uscita) è già stato visto: i test che pedalano non lo incontrano.
    // tests/compliance.spec.mjs riparte da uno stato vuoto per provarlo.
    storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${port}`, localStorage: [{ name: 'safetyAck', value: '1' }] }] },
    serviceWorkers: 'block', // sw.js non deve falsare la cache fra un test e l'altro
    acceptDownloads: true,
    viewport: { width: 420, height: 900 },
    launchOptions: {
      executablePath,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    command: 'node tests/serve.mjs',
    url: `http://127.0.0.1:${port}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
