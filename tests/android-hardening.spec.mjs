// Controlli STATICI sull'app Android (nessun telefono, nessun emulatore): i permessi Bluetooth del manifest, il registratore di crash,
// le patch ai plugin e i punti che in passato avrebbero chiuso l'app. Se uno di questi test si rompe, rileggi docs/android-and-install.md.
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(`${root}${p}`, 'utf8');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const perms = [...manifest.matchAll(/<uses-permission\s+([^>]*?)\/>/gs)].map((m) => {
  const attrs = Object.fromEntries([...m[1].matchAll(/([\w:]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
  return { name: attrs['android:name']?.replace('android.permission.', ''), attrs };
});
const perm = (n) => perms.find((p) => p.name === n);

test.describe('manifest Android: permessi Bluetooth', () => {
  test('Android 12+: SCAN senza posizione, CONNECT e ADVERTISE dichiarati', () => {
    expect(perm('BLUETOOTH_SCAN')?.attrs['android:usesPermissionFlags']).toBe('neverForLocation');
    expect(perm('BLUETOOTH_SCAN')?.attrs['tools:node']).toBe('replace'); // la fusione con il manifest del plugin non deve allargarlo
    expect(perm('BLUETOOTH_CONNECT')?.attrs['tools:node']).toBe('replace');
    expect(perm('BLUETOOTH_ADVERTISE')).toBeTruthy(); // GarminBridgePlugin: il telefono si annuncia come sensore
  });
  test('Android 11 e precedenti: permessi vecchi e posizione SOLO fino all\'API 30', () => {
    for (const n of ['BLUETOOTH', 'BLUETOOTH_ADMIN', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) {
      expect(perm(n)?.attrs['android:maxSdkVersion'], n).toBe('30');
      expect(perm(n)?.attrs['tools:node'], n).toBe('replace');
    }
    expect(perm('ACCESS_BACKGROUND_LOCATION')).toBeUndefined();
  });
  test('il Bluetooth LE è richiesto e l\'attività regge i cambi di configurazione', () => {
    expect(manifest).toMatch(/android\.hardware\.bluetooth_le"[^>]*android:required="true"/s);
    const cc = manifest.match(/android:configChanges="([^"]*)"/)?.[1] || '';
    for (const c of ['orientation', 'screenSize', 'keyboardHidden', 'uiMode', 'smallestScreenSize']) expect(cc.split('|'), c).toContain(c);
    expect(manifest).toContain('android:launchMode="singleTask"');
  });
  test('il tema dell\'app resta AppCompat (il selettore Bluetooth del plugin usa AlertDialog di sistema) e la splash passa al tema dell\'app', () => {
    const styles = read('android/app/src/main/res/values/styles.xml');
    expect(styles).toMatch(/name="AppTheme" parent="Theme\.AppCompat\./);
    expect(styles).toMatch(/name="AppTheme\.NoActionBarLaunch" parent="Theme\.SplashScreen"/);
    expect(styles).toContain('postSplashScreenTheme');
  });
});

test.describe('registratore di crash nativo', () => {
  const main = read('android/app/src/main/java/com/spindro/app/MainActivity.java');
  const plugin = read('android/app/src/main/java/com/spindro/app/GarminBridgePlugin.java');
  const rec = read('android/app/src/main/java/com/spindro/app/CrashRecorder.java');

  test('MainActivity lo installa prima di tutto (anche prima di super.onCreate)', () => {
    const install = main.indexOf('CrashRecorder.install(this)');
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(main.indexOf('super.onCreate'));
    expect(install).toBeLessThan(main.indexOf('registerPlugin('));
  });
  test('scrive stack, thread, modello, Android e versione dell\'app, poi passa al gestore precedente', () => {
    expect(rec).toContain('Thread.setDefaultUncaughtExceptionHandler');
    for (const needle of ['thread.getName()', 'Build.MODEL', 'Build.VERSION.RELEASE', 'versionName', 'printStackTrace', 'previous.uncaughtException']) expect(rec, needle).toContain(needle);
    expect(rec).toContain('getFilesDir()');
    expect(rec).not.toMatch(/java\.net|HttpURLConnection|okhttp|getAccounts|Settings\.Secure|ANDROID_ID|getDeviceId|getSerial/); // niente rete, niente identificativi
  });
  test('il plugin espone lettura e cancellazione del report', () => {
    for (const m of ['getCrashReport', 'clearCrashReport', 'breadcrumb', 'environment']) expect(plugin, m).toMatch(new RegExp(`@PluginMethod\\s+public void ${m}\\(PluginCall call\\)`));
  });
  test('ogni metodo del plugin Garmin è protetto: un\'eccezione diventa un rifiuto, non la fine del processo', () => {
    const methods = [...plugin.matchAll(/@PluginMethod\s+public void (\w+)\(PluginCall call\)\s*\{/g)];
    expect(methods.length).toBeGreaterThanOrEqual(12);
    for (const m of methods) {
      const rest = plugin.slice(m.index + m[0].length);
      const body = rest.slice(0, rest.search(/\n    (@|private|public|protected)/));
      expect(body, `GarminBridgePlugin.${m[1]} senza try/catch`).toContain('try');
    }
  });
  test('callback sul thread principale / thread Bluetooth: niente server.sendResponse nudo, advertising e ticker protetti', () => {
    expect(plugin).not.toMatch(/\bserver\.sendResponse/);
    expect(plugin).toMatch(/private void respond\(/);
    expect(plugin).toMatch(/try \{ doAdvertise\(\); \} catch \(Throwable/);
    expect(plugin).toMatch(/try \{ tick\(\); \} catch \(Throwable/);
  });
  test('la build dichiara la dipendenza androidx.webkit usata dal registratore', () => {
    expect(read('android/app/build.gradle')).toContain('androidx.webkit:webkit');
  });
});

test.describe('patch ai plugin (patch-package)', () => {
  const pkg = JSON.parse(read('package.json'));
  test('postinstall applica le patch e le versioni sono quelle delle patch', () => {
    expect(pkg.scripts.postinstall).toBe('patch-package');
    expect(pkg.devDependencies['patch-package']).toBeTruthy();
    expect(existsSync(`${root}patches/@capacitor+android+${pkg.dependencies['@capacitor/android']}.patch`), 'serve rigenerare la patch di @capacitor/android').toBe(true);
    expect(existsSync(`${root}patches/@capacitor-community+bluetooth-le+${pkg.dependencies['@capacitor-community/bluetooth-le']}.patch`), 'serve rigenerare la patch di bluetooth-le').toBe(true);
  });
  test('dopo npm ci le patch sono applicate in node_modules', () => {
    const bridge = read('node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java');
    expect(bridge).toContain('Spindro patch');
    expect(bridge).not.toMatch(/Serious error executing plugin[\s\S]{0,200}throw new RuntimeException\(ex\)/);
    const dir = 'node_modules/@capacitor-community/bluetooth-le/android/src/main/java/com/capacitorjs/community/plugins/bluetoothle/';
    expect(read(`${dir}DeviceScanner.kt`)).toContain('Spindro patch');
    expect(read(`${dir}Device.kt`)).toContain('Spindro patch');
    expect(read(`${dir}BluetoothLe.kt`)).toContain('Spindro patch');
  });
});

test('la CSP resta stretta (niente script in linea): il ponte Capacitor arriva da addDocumentStartJavaScript, e il registratore dice se la WebView lo supporta', () => {
  const csp = read('index.html').match(/Content-Security-Policy" content="([^"]*)"/)?.[1] || '';
  const script = csp.match(/script-src ([^;]*)/)?.[1] || '';
  expect(script).not.toContain("'unsafe-inline'");
  expect(read('android/app/src/main/java/com/spindro/app/CrashRecorder.java')).toContain('DOCUMENT_START_SCRIPT');
});
