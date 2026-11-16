# Phone checklist (real phone, real trainer)

Run before promoting `beta` to `main`. Nothing here can be checked by the automatic tests. Use the **beta** APK first.
Note the phone model, Android version and build number (Settings → About) with the result.

## Install and update
1. **Beta next to stable.** Install `spindro-beta.apk` while the stable app is installed. *Two icons: "Spindro" and "Spindro Beta"; the beta one has the BETA badge in the app.*
2. **Icon.** Look at the launcher, with a round mask and with themed icons on (Android 13+: Settings → Wallpaper → Themed icons). *Orange wheel on dark, not cropped; themed: single-colour wheel.*
3. **Splash.** Cold start. *Dark background with the wheel, then the app; no white flash, no default Capacitor logo.*
4. **Update keeps data.** With a ride in the history, install the new APK over the previous one. *Same app, history/FTP/settings intact.* (Never uninstall first.)
5. **Stable untouched.** Open the stable app after installing beta. *Its history is unchanged; beta data is separate.*
6. **PWA install.** Chrome on the phone: open /beta/ → Install. *Installs as "Spindro Beta" (not replacing /app/); opens standalone, dark status bar, correct icon.*
7. **PWA offline.** Airplane mode, open the installed web app. *It starts and shows the home screen.*
8. **PWA update.** After a new beta deploy, open the installed web app twice. *Bar "A new version is ready · Reload" appears (not mid-ride); Reload loads the new build.*

## Connection and ride
9. **First connection.** Fresh install, tap the trainer. *Android asks for "Nearby devices" only (no location on Android 12+); trainer connects; power and cadence appear.*
10. **Permission denied.** Deny the Bluetooth permission once. *A clear message, and asking again works.*
11. **Screen stays on 10 minutes.** Ride in ERG without touching the screen. *Screen never dims or locks.*
12. **Two-hour safety.** Leave a ride running long (or 30 min at least) with the charger. *Timer matches a watch within a second; no crash.*
13. **Background and return.** Mid-ride press Home, wait 2 minutes, come back. *Timer shows the true elapsed time; trainer still connected; ride continues (a gap in the per-second graph is acceptable, wrong time is not).*
14. **Incoming call.** Mid-ride receive a call, decline or answer, return. *Same as 13; the trainer keeps its resistance.*
15. **Rotate.** Rotate the phone on the home screen, in a workout and in a game. *Layout adapts, ride is not interrupted or reset.*
16. **Bluetooth off and on mid-ride.** Switch Bluetooth off for 20 s, on again. *A "device dropped" banner, the ride keeps recording, the trainer reconnects (or Retry does).*
17. **Back button.** On a sheet, in a game, in a ride. *Sheet/game closes first; in a ride two presses go to the background and never exit; on the home screen two presses exit.*
18. **Pause releases the screen.** Pause the ride, wait for the screen timeout. *Screen turns off normally.*

## Data, files, share
19. **FIT export.** Finish a short ride → Save FIT. *Message with `Download/Spindro/...fit`; the file is in Files → Downloads → Spindro.*
20. **Share / Open with.** Share and "Open with" the FIT. *System sheet appears; Garmin Connect or Files receives a valid file.*
21. **Garmin bridge.** Turn it on. *Asks for the Bluetooth (advertise) permission; the watch finds "Spindro" and shows watts.*
22. **Reminders.** Plans → turn reminders on. *Asks for notification permission only now (Android 13+); a test reminder arrives.* Also: never asked before this.
23. **Share from YouTube.** Share a YouTube link to Spindro. *Opens "Ride on a video" with that video.*
24. **Open links.** Tap Strava / Garmin import / report links. *Open in the browser, not inside the app.*

## Games and controllers
25. **Each game one minute at default quality.** Breakaway, Horde Run, Strike, Gruppetto, Mattoni, Planata (and the others in the menu). *Loads, playable, smooth enough, sound works, no black screen; pedal power moves the game.*
26. **Zwift Click / controller keys.** Pair the controller. *+ and − change gear, A/B navigate menus, keys work in a game too.*
27. **Video ride.** Start a YouTube ride. *The video plays (no "error 153"/embedding message), + and − still work.*

## Top five risks (check these first)
1. YouTube player inside the WebView (referrer/origin `https://localhost`): error 153 or blank player.
2. Background and return mid-ride (no foreground service): JS pause, gaps, lost Bluetooth on aggressive battery managers.
3. Themed/adaptive icon and splash (generated, never seen on a device).
4. Bluetooth permission flow on Android 12+ and 11 (merged manifest could not be built here).
5. Update over the previous APK (backup rules/manifest changed: data must survive).
