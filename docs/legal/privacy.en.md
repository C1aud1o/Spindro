# Spindro Privacy Policy

*Last updated: 15 November 2026*

Spindro is a free, open source app for smart trainers. It runs in the browser and as an Android app. It is maintained by the Spindro project, an open-source project maintained by volunteers.

## In short

- **Spindro has no accounts and no servers of its own.** We do not collect, receive or store any personal data.
- We count visits **anonymously**, with no cookies. In the app, **only if you say yes**; if you do not answer, or say no, the app sends nothing to the counter.
- Your rides, settings and trainer data stay **on your device**.
- The website and the app use **no cookies** and no third-party fonts or trackers.
- The only connections to other companies are listed below. Each starts from your own action, except the website's visit counter and the hosting of the files.

## What stays on your device

The app saves these on your device only, in the browser's local storage (`localStorage`) or in the Android app's own storage. We cannot see them:

- settings (language, music and sound, gear feel, device sources, game quality), your FTP, maximum heart rate, weight and weekly goal;
- ride history (including the ride samples used for charts), workouts you created, training plan progress, game records and levels;
- the names and protocol types of the Bluetooth trainers and sensors you used before, and your Zwift controller key mapping;
- if you connect Strava in "personal mode": your Strava Client ID and Client Secret and the access tokens Strava gives the app, until you disconnect or delete your data;
- your answers to the statistics question and to the safety notice;
- the last video link you used for a video ride.

The web app also keeps a copy of its own files in the browser cache (service worker) so it can work offline. It uses no cookies and no IndexedDB.

If you use the Android app, the system may include this data in your Google backup (`allowBackup` is on). That is a choice of your device, not of Spindro.

## Bluetooth and sensors

The app talks to your trainer, power meter, heart-rate strap and Zwift controllers over Bluetooth. This data is used live in the app and saved only in your ride history on your device. It is not sent to us.

The Android app asks for these permissions:

| Permission | Why |
|---|---|
| Nearby devices: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` | find and connect to your trainer, sensors and controllers. The scan is declared "never for location". |
| `BLUETOOTH_ADVERTISE` | the optional Garmin watch bridge: the phone announces itself as a standard Bluetooth cycling sensor so your watch can read speed, power and cadence. It is used only when you switch the bridge on. |
| Location (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`), **Android 11 and older only** | Android requires it for Bluetooth scanning on those versions. Spindro does not read your location. |
| `BLUETOOTH`, `BLUETOOTH_ADMIN`, Android 11 and older only | older form of the Bluetooth permissions above. |
| `INTERNET` | load the app, and the services listed below when you use them. |
| `VIBRATE` | haptic feedback. |
| `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` (added by the notifications component) | the optional daily reminder of your training plan: notifications are scheduled and shown on your phone only, nothing is sent anywhere. The system asks for notification permission only if you switch the reminder on. |

The Android app can also receive a link shared from another app (for example "Share" in YouTube) to open it as a video ride. It reads only the shared text.

## What the app and the website load from the internet

- **The app's own files**, from the same site (`spindro.fun`), which is hosted on GitHub Pages. GitHub may log standard technical data of a request, such as the IP address.
- **Fonts:** all fonts are served from the app and the site themselves. Nothing is loaded from Google Fonts or any other font service.
- **Visit counter, website:** the script from GoatCounter (`gc.zgo.at`), see below.
- **Visit counter, app:** only after you say yes, see below.
- **YouTube, Strava, GitHub:** only when you use those features, see below.
- Links to other sites (for example Garmin Connect, the support pages of watch makers, YouTube search) open in your browser only when you tap them.

## Anonymous statistics

To understand how many people use Spindro we count visits with **GoatCounter** (`goatcounter.com`), an open-source service that uses no cookies and stores nothing on your device.

- **On the website** the opened page is counted, with generic technical data: referring page, browser and system type, screen size, country. The IP address is not stored.
- **In the app** counting starts **only if you agree** when you first open it. If you do not answer, or answer "No", the app does not load the counter and sends nothing; you will not be asked again. You can change your mind at any time in Settings → Privacy. These are counted: app opened, language, trainer protocol type (for example FTMS), game opened, ride completed. Never power, heart rate, location or device names.

We cannot trace this data back to you.

## Error reports

Spindro does not send crash or error reports. If something breaks, you can report it yourself on GitHub (see below).

## Services you choose to use

These start only when you act. They have their own privacy policies.

- **YouTube.** If you start a video ride, the player and its script are loaded from YouTube (`www.youtube.com`). YouTube may set cookies and collect data, as it does for any embedded video. By using this feature you are also subject to the [YouTube Terms of Service](https://www.youtube.com/t/terms) and the [Google Privacy Policy](https://policies.google.com/privacy). Spindro does not record, download or separate the audio of YouTube videos.
- **Strava.** If you connect Strava, you use "personal mode": you create your own Strava API application and enter its credentials, and the app talks directly to Strava (`www.strava.com`). Your ride file (`.FIT`, which includes heart rate if you used a strap), the activity name and description go from your device to Strava. The access token stays on your device. Spindro's project has no server in between. You can disconnect in the app (the app also asks Strava to revoke the token) and revoke access in your Strava settings.
- **GitHub.** If you tap "Report your trainer" or "Report a problem", the app opens a pre-filled GitHub issue in your browser. It contains the trainer's Bluetooth name, services, protocol, platform, app version, browser and language. Nothing is sent until you press submit on GitHub. GitHub issues are public.

## Your rights

Because we hold no personal data about you, there is nothing for us to give, correct or delete. To remove your local data, use "Delete all my data" in Settings, clear the site data in your browser, clear the app's storage in Android settings, or uninstall the app. For data held by Google, Strava, YouTube, GitHub or GoatCounter, contact those companies. You can also complain to your data protection authority (in Italy, the Garante per la protezione dei dati personali).

## Minimum age

Spindro is not meant for children under 14.

## Security

All connections use HTTPS. The code is public, so anyone can check what the app does: https://github.com/C1aud1o/Spindro

## Changes

If this changes, for example if accounts or statistics are added, we will update this page and its date **before** the change goes live.

## Contact

Questions: open an issue at https://github.com/C1aud1o/Spindro/issues. For private matters, use GitHub's private security reporting on the same repository. Please do not post personal data in public issues.
