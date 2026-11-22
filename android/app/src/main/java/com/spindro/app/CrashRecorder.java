package com.spindro.app;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Registratore di arresti anomali, tutto sul telefono (nessuna rete, nessun dato personale).
 *  - Thread.setDefaultUncaughtExceptionHandler: scrive traccia dello stack, thread, modello, Android, versione app
 *    e le ultime "briciole" (passi del collegamento Bluetooth) in files/crash-report.txt, poi passa la mano al gestore precedente.
 *  - Per i crash nativi (nessuna eccezione Java: SIGSEGV nello stack Bluetooth, ANR, ...) usa ApplicationExitInfo (Android 11+)
 *    al lancio successivo.
 *  - Il report si legge e si cancella dall'app web con GarminBridgePlugin.getCrashReport / clearCrashReport.
 */
final class CrashRecorder {
    private static final String FILE = "crash-report.txt";
    private static final String CRUMBS_FILE = "breadcrumbs.txt";
    private static final String PREFS = "crash_recorder";
    private static final String KEY_EXIT_SEEN = "exit_seen_ts";
    private static final int MAX_CRUMBS = 40;
    private static final int MAX_REPORT_CHARS = 60_000;

    private static final ArrayDeque<String> crumbs = new ArrayDeque<>();
    private static volatile Context appContext;
    private static volatile boolean installed = false;

    private CrashRecorder() { }

    /** Da chiamare per prima cosa in MainActivity.onCreate (prima di super.onCreate). */
    static synchronized void install(Context context) {
        if (installed) return;
        installed = true;
        appContext = context.getApplicationContext();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                writeCrash(thread, error);
            } catch (Throwable ignored) {
                // il registratore non deve mai nascondere il crash vero
            }
            if (previous != null) previous.uncaughtException(thread, error);
        });
        note("app avviata");
    }

    /** Una "briciola": ultimo passo noto prima di un eventuale crash. Si salva anche su file (resiste a crash nativi). */
    static void note(String message) {
        if (message == null) return;
        String line = stamp(System.currentTimeMillis()) + " " + (message.length() > 300 ? message.substring(0, 300) : message);
        String snapshot;
        synchronized (crumbs) {
            crumbs.addLast(line);
            while (crumbs.size() > MAX_CRUMBS) crumbs.removeFirst();
            snapshot = join(crumbs);
        }
        Context c = appContext;
        if (c == null) return;
        try { writeFile(new File(c.getFilesDir(), CRUMBS_FILE), snapshot); } catch (Throwable ignored) { }
    }

    private static void writeCrash(Thread thread, Throwable error) throws Exception {
        Context c = appContext;
        if (c == null) return;
        StringWriter sw = new StringWriter();
        error.printStackTrace(new PrintWriter(sw));
        StringBuilder sb = new StringBuilder();
        sb.append("Spindro crash report\n");
        sb.append("Time: ").append(stamp(System.currentTimeMillis())).append('\n');
        sb.append("Thread: ").append(thread == null ? "?" : thread.getName()).append('\n');
        sb.append(environment(c));
        sb.append("\n--- Stack trace ---\n").append(sw).append('\n');
        sb.append("--- Last steps (oldest first) ---\n");
        synchronized (crumbs) { sb.append(join(crumbs)); }
        writeFile(new File(c.getFilesDir(), FILE), sb.toString());
    }

    /** Modello, Android, versione dell'app, WebView. Niente identificativi personali. */
    static String environment(Context c) {
        StringBuilder sb = new StringBuilder();
        sb.append("Device: ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append('\n');
        sb.append("Android: ").append(Build.VERSION.RELEASE).append(" (API ").append(Build.VERSION.SDK_INT).append(")\n");
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            sb.append("App: ").append(c.getPackageName()).append(' ').append(pi.versionName)
                .append(" (code ").append(Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode).append(")\n");
        } catch (Throwable e) { sb.append("App: ").append(c.getPackageName()).append('\n'); }
        sb.append("WebView: ").append(webViewInfo()).append('\n');
        return sb.toString();
    }

    static String webViewInfo() {
        try {
            PackageInfo wv = androidx.webkit.WebViewCompat.getCurrentWebViewPackage(appContext);
            String v = wv == null ? "unknown" : wv.packageName + " " + wv.versionName;
            boolean docStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
            return v + " (document-start script: " + (docStart ? "yes" : "NO, bridge injected inline: blocked by the strict CSP") + ")";
        } catch (Throwable e) { return "unknown (" + e.getClass().getSimpleName() + ")"; }
    }

    /**
     * Il report in attesa, o null. Prima il file scritto dal gestore Java; se manca, il motivo dell'ultima uscita
     * del processo (crash nativo, ANR) su Android 11+. Non cancella nulla: lo fa clear() quando la persona ha visto il messaggio.
     */
    static String readPending(Context c) {
        try {
            File f = new File(c.getFilesDir(), FILE);
            if (f.exists() && f.length() > 0) return readFile(f);
        } catch (Throwable ignored) { }
        try {
            return exitInfoReport(c);
        } catch (Throwable ignored) { return null; }
    }

    static void clear(Context c) {
        try { new File(c.getFilesDir(), FILE).delete(); } catch (Throwable ignored) { }
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                sp.edit().putLong(KEY_EXIT_SEEN, System.currentTimeMillis()).apply();
            }
        } catch (Throwable ignored) { }
    }

    private static String exitInfoReport(Context c) {
        if (Build.VERSION.SDK_INT < 30) return null;
        ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
        if (am == null) return null;
        List<ApplicationExitInfo> list = am.getHistoricalProcessExitReasons(c.getPackageName(), 0, 5);
        long seen = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_EXIT_SEEN, 0);
        for (ApplicationExitInfo info : list) {
            int r = info.getReason();
            boolean bad = r == ApplicationExitInfo.REASON_CRASH_NATIVE || r == ApplicationExitInfo.REASON_ANR
                || r == ApplicationExitInfo.REASON_CRASH || r == ApplicationExitInfo.REASON_INITIALIZATION_FAILURE;
            if (!bad || info.getTimestamp() <= seen) continue;
            StringBuilder sb = new StringBuilder();
            sb.append("Spindro crash report (from Android's process-exit record, no Java stack trace)\n");
            sb.append("Time: ").append(stamp(info.getTimestamp())).append('\n');
            sb.append("Reason: ").append(reasonName(r)).append('\n');
            sb.append("Description: ").append(info.getDescription()).append('\n');
            sb.append("Importance at exit: ").append(info.getImportance()).append('\n');
            sb.append(environment(c));
            try {
                File crumbs = new File(c.getFilesDir(), CRUMBS_FILE);
                if (crumbs.exists()) sb.append("\n--- Last steps (oldest first) ---\n").append(readFile(crumbs));
            } catch (Throwable ignored) { }
            return sb.toString();
        }
        return null;
    }

    private static String reasonName(int r) {
        if (Build.VERSION.SDK_INT < 30) return String.valueOf(r);
        switch (r) {
            case ApplicationExitInfo.REASON_CRASH_NATIVE: return "CRASH_NATIVE (signal in native code, e.g. Bluetooth stack)";
            case ApplicationExitInfo.REASON_ANR: return "ANR (app not responding)";
            case ApplicationExitInfo.REASON_CRASH: return "CRASH (Java exception)";
            case ApplicationExitInfo.REASON_INITIALIZATION_FAILURE: return "INITIALIZATION_FAILURE";
            default: return String.valueOf(r);
        }
    }

    private static String stamp(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    private static String join(ArrayDeque<String> q) {
        StringBuilder sb = new StringBuilder();
        for (String s : q) sb.append(s).append('\n');
        return sb.toString();
    }

    private static void writeFile(File f, String text) throws Exception {
        if (text.length() > MAX_REPORT_CHARS) text = text.substring(0, MAX_REPORT_CHARS);
        try (FileOutputStream os = new FileOutputStream(f, false)) {
            os.write(text.getBytes(StandardCharsets.UTF_8));
            os.getFD().sync();
        }
    }

    private static String readFile(File f) throws Exception {
        try (java.io.FileInputStream is = new java.io.FileInputStream(f)) {
            byte[] b = new byte[(int) Math.min(f.length(), MAX_REPORT_CHARS)];
            int n = is.read(b);
            return new String(b, 0, Math.max(n, 0), StandardCharsets.UTF_8);
        }
    }
}
