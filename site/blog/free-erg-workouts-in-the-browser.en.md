---
title: Free ERG workouts in the browser
description: Ride ERG-mode workouts for free in Chrome or Edge, or on Android, with a smart trainer. What ERG mode is, how to start in a minute, which trainers work, and why iPhone does not.
date: 2026-11-18
order: 6
kind: guide
image: ride
---
You can ride ERG workouts for free in your browser. Open Spindro in Chrome or Edge, connect a smart trainer over Bluetooth, and the trainer holds the power the workout asks for. No account, no subscription, nothing to install, although there is also an Android app.

![The ride screen in ERG: 139 W against a 140 W target.](shot:ride)

## What ERG mode is

In ERG mode the trainer holds a power. You ask for 150 W and the brake adjusts so that, whatever you do with your legs, you produce about 150 W: pedal faster and the resistance drops, pedal slower and it rises. That is why a workout in ERG feels steady, and why intervals are easy to follow: the trainer sets the effort, you just keep pedalling.

It is the default mode in Spindro. The home screen shows a target in watts, a − and a + (5 W each) and a Start button. The first target is 60% of your FTP, or the last value you used.

## Start in a minute

1. Open [the web app](/app/) in Chrome or Edge on Android, Windows, macOS, Linux or ChromeOS. Bluetooth must be on.
2. Close any other training app that uses the trainer. It accepts one connection at a time.
3. Wake the trainer by pedalling, and tap **Connect your trainer**. Pick it from the browser's list.
4. Set a target or tap **Choose a workout**, then Start.

If you want to feel that control works before you ride, **Test resistance** raises and lowers the resistance for about ten seconds, then restores the previous mode.

## The workouts

There are 34 structured workouts from 24 to 90 minutes and four multi-week plans. Everything is in percent of your FTP, so it scales to you. If you do not know your FTP, a ramp test estimates it: you start easy, add 20 W every minute, and the app calculates your FTP as 75% of your best minute. You can also build your own workouts in a block editor, import `.zwo` files, and export `.zwo` or a Garmin workout file. During a workout, + and − change the intensity by 5%. There are also [six games that are workouts](/blog/games-that-are-workouts/).

![A workout in progress with the step profile and the next step.](shot:workout)

## Which trainers work

ERG needs a trainer you can control. Spindro uses FTMS, the standard Bluetooth protocol, and also supports Tacx FE-C over Bluetooth and Wahoo's older protocol. We have tested **one** trainer on real hardware, the Van Rysel D100. Others should work but are marked "not yet verified": see [which trainers work with Spindro](/blog/which-smart-trainers-work-with-spindro/). A power meter or a speed and cadence sensor alone can only be read: Spindro shows the watts but cannot change the resistance.

Some trainers fix the resistance for the requested power at the speed of the moment, so the app sends the target again about every two seconds, which keeps the watts on target. The details are in [how virtual gears and ERG work](/blog/virtual-gears-and-erg/).

## Browser and device limits

- **Works:** Chrome or Edge on Android, Windows, macOS, Linux, ChromeOS, and the Android app.
- **Does not work:** Safari and Firefox, because they do not implement Web Bluetooth. iPhone and iPad have no Web Bluetooth in any browser; the Bluefy browser adds it and should work, but we have not tried it.
- The page must be served over HTTPS, as it is at spindro.fit.

## Questions

### Is ERG mode free in Spindro?

Yes, along with everything else. There is no paid tier.

### Do I need to install anything?

No. The web app runs in Chrome or Edge, and can be installed from the browser menu. An Android app is also available.

### Why does my trainer not respond to the target?

Another app may be holding the connection. Close it and reconnect. If the connection works but nothing changes, the trainer may only offer read-only power; use Test resistance, and tell us.
