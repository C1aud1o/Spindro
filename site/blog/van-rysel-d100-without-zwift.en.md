---
title: Using the Van Rysel D100 (Decathlon) without Zwift
description: A free app for the Van Rysel D100 smart trainer: connect it over Bluetooth, ride in ERG or with virtual gears, calibrate cadence, and what we tested on the real trainer. No Zwift, no subscription.
date: 2026-11-18
order: 4
kind: guide
image: devices
---
The Van Rysel D100 is the smart trainer sold by Decathlon, and a lot of people who own one want an app for it that does not need Zwift or a subscription. Spindro is a free, open-source app for exactly this trainer: it is the one we tested on real hardware. This page says what we checked, how to connect it, and the one thing the D100 does differently.

![The Devices sheet with a Van Rysel D100 connected.](shot:devices)

## What we tested

We rode a real D100 with Spindro and checked the connection, virtual gears, ERG and slope mode. They worked. That is the full extent of our claim: one trainer, one person's setup. If yours behaves differently, tell us.

The D100 speaks FTMS, the standard Bluetooth protocol for fitness machines, so there is nothing special to install and no account to create.

## Connect it in four steps

1. Close any other app that uses the trainer (Decathlon's own app, Zwift, another browser tab). A trainer talks to one app at a time.
2. Wake the trainer by pedalling a few turns, so its light is on.
3. Open [the web app](/app/) in Chrome or Edge, or the Android app, and tap **Connect your trainer**. Android asks once for the "Nearby devices" permission.
4. Pick the entry whose name contains Van Rysel or D100. Live watts appear at once.

If the list is empty, keep the phone within two metres and check that nothing else is connected to the trainer. Known devices reconnect by themselves where the platform allows it.

## The D100 does not send cadence

Unlike many trainers, the D100 does not report cadence. Spindro estimates it from the speed of the flywheel, using a factor that comes from D100 data. That factor depends on the chainring and sprocket, so it is worth calibrating once: in **Settings**, the calibration holds a light resistance while you pedal in time with a beep, and takes a measurement. If you have a cadence sensor, or a power meter that reports cadence, the real value is used and no estimate is needed.

## Why the app repeats the power target

The D100 seems to fix its resistance for the requested power at the speed of the moment. If you accelerate, the resistance stays where it was until it receives a new command. So in ERG the app sends the target again about every two seconds, even when it has not changed. The result is that the watts stay close to the target as your cadence moves. The technical detail is in [our article on ERG and virtual gears](/blog/virtual-gears-and-erg/).

## Choose a mode

- **ERG:** the trainer holds the watts you set. Best for workouts. [More on ERG in the browser](/blog/free-erg-workouts-in-the-browser/).
- **Virtual gears:** 24 ratios you shift yourself.
- **Slope:** the trainer imitates a gradient, for routes.

## A Zwift Click with your D100

The Zwift Click we tested came with a D100. We used its + and − keys on real hardware: in ERG they change the target by 5 W, in gears mode they shift. We have not confirmed the other keys. [Using a Click without Zwift](/blog/zwift-click-without-zwift/).

## Limits

We tested one D100. We did not test every firmware version, and we cannot promise that the app behaves identically on all of them. Spindro is not affiliated with Decathlon or Van Rysel, and has no online world: there is no multiplayer. For other trainers see [which trainers work with Spindro](/blog/which-smart-trainers-work-with-spindro/) and the [compatibility page](/compatibility/).

## Questions

### Does the Van Rysel D100 work without Zwift?

Yes. It is a standard FTMS trainer, and Spindro controls it directly over Bluetooth. We tested connection, virtual gears, ERG and slope on a real D100.

### Why is my cadence wrong or missing?

The D100 does not send cadence. Spindro estimates it from flywheel speed; calibrate it in Settings, or connect a cadence sensor.

### Can I use it on an iPhone?

Not in Safari, which has no Web Bluetooth. Use an Android phone or a computer with Chrome or Edge.
