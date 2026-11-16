# Android app

The Android app is the same web app packaged with [Capacitor](https://capacitorjs.com), plus two things
a browser cannot do:

1. **Native Bluetooth**: the Android WebView has no Web Bluetooth, so `js/native.js` installs an equivalent
   `navigator.bluetooth` on top of the `@capacitor-community/bluetooth-le` plugin. Trainer, Zwift controllers,
   heart-rate strap and power meter use the same code as the web app.
2. **Garmin bridge** (`android/.../GarminBridgePlugin.java`): the phone presents itself as a standard Bluetooth
   *Cycling Power* sensor (power + cadence + wheel revolutions) and *Speed & Cadence* sensor. The Garmin (Fenix, Edge,
   Forerunner…) pairs it like a normal power meter and records the activity, which then syncs to Garmin Connect by itself.

## Installing
- On the phone open **https://spindro.fun/app/spindro.apk** (or the **app-android** release of the GitHub repository)
  and download the file.
- Android asks you to allow installing from that source (browser or file manager): allow it.
- Every new build installs over the previous one (same signing key).

## Using the Garmin bridge
1. In the app: Settings → **Garmin** → turn on *Send power, cadence and speed to your Garmin*.
   On first use Android asks for the Bluetooth permission.
2. On the Garmin: *Sensors & Accessories* → *Add new* → **Power** (and **Speed/Cadence** if you want distance and speed too).
   Pick **Spindro**.
3. Start an **Indoor bike** activity on the Garmin. Keep the app open during the workout.

What is sent: the watts shown in the app (trainer or external power meter), the cadence (measured or estimated) and the
speed (virtual in gear mode, otherwise the trainer's).

## Watts from a power meter
The Garmin does not send watts: it receives them from sensors. To use the watts of your pedals or crankset
(Garmin Rally/Vector, Favero, etc.), connect the **power meter** in Settings: the app uses its watts and cadence
instead of the trainer's (this works in the web app too). Heart rate comes from the watch with *Broadcast heart rate* →
*Connect heart-rate monitor*.

## Strava in the app
Inside the app the page address is `https://localhost`. With the Strava bridge, add `https://localhost` to
`ALLOWED_ORIGINS`; in personal mode the Authorization Callback Domain must be `localhost`.

## Building
```sh
npm ci
npm run build:web && npx cap sync android
cd android && ./gradlew assembleFossDebug   # needs the Android SDK (ANDROID_HOME) and JDK 21
# -> app/build/outputs/apk/foss/debug/app-foss-debug.apk
```
On GitHub the workflow `.github/workflows/android.yml` does this on every push and publishes the APK in the release.

Note: without the `ANDROID_*` Secrets the workflow builds a debug APK; with the Secrets it builds the signed release APK and AAB.
The private key is never stored in the repository.
