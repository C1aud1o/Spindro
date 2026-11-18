---
title: Using a Zwift Click (or Play, Ride) without Zwift
description: How to use a Zwift Click, Play or Ride as a free shifter and remote for your smart trainer without the Zwift app: what works, what we tested on a real Click, how to check the keys, and the limits.
date: 2026-11-18
order: 5
kind: guide
image: keycheck
---
A Zwift Click is a small Bluetooth controller with + and − keys. You can use it without Zwift, as a shifter and remote for Spindro, a free and open-source indoor cycling app. It works without a Zwift account, without the Zwift app and without any connection to Zwift's servers. The same goes, in theory, for the Zwift Play and Zwift Ride. This page says what we have really tested, which is less than the whole controller.

![The key check: it shows which key the app receives from a Zwift Click.](shot:keycheck)

## What we tested on real hardware

Only the **+ and − keys of one Click v2** have been used on a real device, a Click that came with a Van Rysel D100. They work. The arrow keys and the A, B, Y and Z keys are mapped from open-source tables and are not confirmed. The Zwift Play and the Zwift Ride were written from open-source projects and tested only against simulated devices.

So: use the + and − keys with confidence, treat everything else as "should work, please check".

## What the keys do

- In **virtual gears** mode, + shifts up and − shifts down.
- In **ERG** mode, + and − change the power target by 5 W.
- During a **workout**, they raise or lower the intensity by 5%.
- **In menus**, the arrows move around, and A selects and B goes back, so you do not have to touch the phone on the handlebars. Those keys are among the unconfirmed ones.
- Pressing + and − together opens the controller menu.

## Connect it

Use the same **Add device** button as for the trainer. One button connects every model: Spindro looks for a Bluetooth device named Zwift or one that offers the Zwift controller service. Press a key once so the app can tell which model it is.

A trainer that also exposes the Zwift service, such as the D100, is treated as a trainer and never as a controller. The Click is a separate device.

## The key check

Because most keys are unconfirmed, Spindro includes a **key check**. Open **Devices** and tap **Check your controller**, or find it in the controller menu. Press any key and it lights up on screen, so you can see what the app receives. You can map a key to a role (+, −, up, down, select, back, none) and the app produces a short report you can send us. That is how an unconfirmed key becomes a confirmed one.

## Limits and what could go wrong

- **Encrypted firmware.** Some firmware versions of the Play and Ride encrypt the key messages. We did not implement the encrypted exchange, so on those the keys may do nothing. Use the on-screen buttons if that happens.
- **Left and right Play.** The two Play controllers send the same fields, so the app cannot tell them apart and gives both the same roles.
- **Click v1.** We have not tested it.
- **Android app and two controllers at once** were not tried on real hardware.
- **Zwift owns its names.** Zwift, Click, Play and Ride are trademarks of their owners. Spindro is not affiliated with Zwift, uses no Zwift code, and talks only to the controller over Bluetooth.

Support for these controllers comes from open-source work on the Bluetooth protocol, used so that hardware you own works with a free app.

## Questions

### Can I use a Zwift Click without Zwift?

Yes, in Spindro. It does not need a Zwift account or the Zwift app. We tested the + and − keys of a Click v2 on a real device.

### Does a Zwift Play or Zwift Ride work?

They are implemented but only tested against simulated devices. Some firmware encrypts the buttons, which Spindro does not support.

### Which keys are confirmed?

Only + and − on a Click v2. Use the key check in the app to see what the other keys send.
