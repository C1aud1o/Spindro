---
title: Free app for a smart trainer, without a subscription
description: What Spindro lets you do for free with a smart trainer (ERG, virtual gears, workouts, games, history, FIT export), what it cannot do, and how it compares to a Zwift subscription. Browser and Android, no account.
date: 2026-11-18
order: 3
kind: guide
image: home
---
If you own a smart trainer and you are looking for a free app to use it with, no subscription and no account, this is what Spindro does and where it stops. It connects to your trainer over Bluetooth, controls the resistance and records the ride. It runs in the browser (Chrome or Edge) and as an Android app, and it costs nothing: no monthly fee, no ads, no in-app purchases. The source code is open on GitHub under the AGPL-3.0 licence.

People often search for a "Zwift alternative, free". Be clear about what that means here: Spindro does the trainer half of the job. It does not have a virtual world full of other riders.

![The home screen: a free ride in ERG with a 130 W target.](shot:home)

## What you get for free

- **ERG mode.** The trainer holds the power you set, and a − and + change it. It is the default on the home screen. [How ERG works](/blog/free-erg-workouts-in-the-browser/).
- **Virtual gears.** 24 ratios on a controllable trainer, with optional auto-shift, [explained here](/blog/virtual-gears-and-erg/).
- **Structured workouts and plans.** 34 workouts from 24 to 90 minutes and four multi-week plans, all in percent of your FTP. A ramp test estimates your FTP if you do not know it. You can build your own workouts, import `.zwo` files and export `.zwo` or a Garmin workout file.
- **Six games that are workouts.** Each one is a 5, 10 or 20 minute session, driven by your real watts. [How they are designed](/blog/games-that-are-workouts/).
- **Routes and video.** Load a GPX and the slope follows the course, or ride along with a YouTube video at your speed.
- **History and records.** Stored on your device. You can export a `.fit` file, make a share image, or upload to Strava if you choose to link it.
- **Your devices.** One "Add device" button pairs a trainer, a heart rate strap, a power meter, a cadence sensor or a Zwift Click, Play or Ride controller.
- **Five languages:** English, Italian, French, Spanish, German.

Nothing here is a trial. There is no premium tier hidden behind a button.

## What it does not do

- **No online world and no multiplayer.** You cannot ride with other people in a shared space.
- **No iPhone or iPad app.** Safari has no Web Bluetooth, so the web app cannot find your trainer there. See [the iPhone note](/blog/which-smart-trainers-work-with-spindro/#iphone-and-ipad).
- **Google Play is not live yet.** On Android you install the APK from our site, or use the web app.
- **Almost no trainer has been verified.** We tested one trainer on real hardware, the Van Rysel D100. Others should work through standard protocols but are marked as such, not as "verified". The [compatibility page](/compatibility/) says which is which.
- **Some trainers send no cadence.** The D100 is one: the app estimates cadence from flywheel speed and you can calibrate it in Settings.
- **Garmin Connect has no public upload.** Export the `.fit` and import it on the Garmin website, or let the Android app broadcast to your watch as a Bluetooth sensor (not yet tested by us on a real watch).

## What you need

An Android phone with Chrome or the app, or a PC, Mac, Linux or ChromeOS computer with Chrome or Edge and Bluetooth. A trainer accepts one Bluetooth connection at a time, so close any other training app before you connect. Open the app, tap **Connect your trainer**, pick it from the list, and start a ride.

## Questions

### Is Spindro really free?

Yes. There is no subscription, no advertising and no in-app purchase, and the code is open source.

### Do I need an account?

No. Rides, records and settings stay on your device. You can export a backup to move them.

### Is it a free Zwift alternative?

For the trainer side, yes: ERG, virtual gears, workouts and games. It has no online virtual world and no multiplayer.

### Does it work on iPhone?

Not in Safari. A browser that adds Web Bluetooth, such as Bluefy, should work, but we have not tested it.
