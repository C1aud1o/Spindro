---
title: Which smart trainers work with Spindro
description: The smart trainers Spindro supports by protocol (FTMS, Tacx FE-C, Wahoo legacy), which one is verified on real hardware, which are only expected to work, and why iPhone is not supported.
date: 2026-11-18
order: 7
kind: guide
image: devices
---
Spindro, the free indoor cycling app, works with smart trainers through standard Bluetooth protocols rather than a list of models. This page lists the trainers we know about, and says honestly how sure we are of each. The list below is generated from the same data as the [compatibility page](/compatibility/), so the two always agree.

:::compat-count

"Verified" means we rode that trainer for real. "Expected" means the protocol is implemented and tested against a simulated trainer, but nobody has tried this model with Spindro yet. If you try yours, [tell us](https://github.com/C1aud1o/Spindro/issues): reports are how this list grows.

![The Devices sheet with a trainer connected.](shot:devices)

## How we label a trainer

We use four words and we try not to bend them. **Verified**: tested on the real device by us. **Partly verified**: some functions were tested on the real device, the rest were not. **Expected**: the protocol is supported by the code but this model has never been tried. **Reported**: users told us it works. Today a model moves up only when someone has really ridden it, and nothing is marked verified on the strength of a datasheet.

Spindro picks the protocol on its own: FTMS first, then Tacx FE-C over Bluetooth, then Wahoo legacy, then read-only Cycling Power or Speed and Cadence. You do not choose it, and you do not need to know it, but it explains why a trainer you have never heard of can still connect.

## FTMS

FTMS is the Bluetooth standard for fitness machines, and most recent smart trainers speak it. Spindro tries it first. A trainer that advertises FTMS should connect and can be controlled in ERG, slope and resistance modes.

:::compat FTMS

## Tacx FE-C over Bluetooth

Some Tacx trainers, including models without FTMS, speak FE-C, the protocol Tacx uses, over Bluetooth. Spindro supports it as a fallback. We have only tested it against a simulated trainer, not on a real Tacx.

:::compat Tacx FE-C over BLE

## Wahoo legacy

Older Wahoo trainers, and recent ones with older firmware, use Wahoo's own control protocol. Spindro supports it as a fallback, tested only against a simulated trainer.

:::compat Wahoo legacy

## Read-only: power meters and sensors

If a device offers only Cycling Power or Speed and Cadence, Spindro can read it but cannot change the resistance. You set the resistance on the trainer itself.

:::compat Cycling Power / Speed & Cadence

## iPhone and iPad

Spindro does not work on an iPhone or iPad in any browser, today. Every iOS browser uses Apple's engine, which has no Web Bluetooth, and there is no Spindro app for iOS. A browser that adds Web Bluetooth, such as Bluefy, should work, but we have not tried it. The simple solution is an Android phone or a computer with Chrome or Edge.

## Before you connect

A trainer accepts one Bluetooth connection at a time, so close the manufacturer's app, Zwift or any other training app first. The [guide on trainers without Zwift](/blog/van-rysel-d100-without-zwift/) walks through the one trainer we tested. To use a Zwift Click as a shifter, see [using a Click without Zwift](/blog/zwift-click-without-zwift/). Everything is free; see [what the free app does and does not do](/blog/free-smart-trainer-app-no-subscription/).
