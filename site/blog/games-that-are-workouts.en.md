---
title: Games that are workouts
description: Spindro's six games follow a few design rules so that playing is training: sessions in percent of FTP, three levels, something to do every few seconds. And an invitation to build one.
date: 2026-11-15
image: game-racer
---
Most cycling games treat your watts as a speedometer. Push harder, go faster. That is a fine start, but it makes for a poor workout: you sprint until you are tired, then you stop, and the game has taught you nothing about pacing.

We took the opposite approach. In Spindro a game is a workout first, and the game is how the workout is told.

## One session, one shape

Every game session has a length you pick at the start: 5, 10 or 20 minutes. Inside it, intensity follows a curve: an easy start of about a minute, waves of effort and recovery, a harder finish, and a cooldown before the summary. We never ask for more than 90 seconds above threshold without at least 40 seconds of recovery.

All of it is expressed in **percent of your FTP**. Recovery is around 50 to 65%, steady riding 75 to 90%, an effort 95 to 110%, and a sprint 130% or more for a few seconds. That makes the same game fair for someone with an FTP of 120 W and for someone with 320 W. When no trainer is connected, a demo rider simulates 0.8 of FTP with a few surges, so you can look around.

![Breakaway, the stage-race game: a climb goal at 90% of FTP while the pack rides alongside.](shot:game-racer)

## Three levels, and a difficulty that adapts

Easy, normal and hard shift the percentages by about 10% either way. On top of that the game adapts a little: after two failed efforts in a row the demands drop by 5%, and after three successful ones they rise by 5%, within a limit of 15% either way. The point is to keep you in the zone where the effort is hard but not hopeless.

## Something to do every few seconds

A workout that is only a number on screen is boring. The rules are strict about it:

- The first thing to do appears within eight seconds of starting.
- There is never more than five seconds without an event that asks or rewards something.
- There is always a visible goal with a bar or a counter, like "wave 3 of 8" or "400 metres to go".
- Every action gets an answer within 100 milliseconds: a sound, particles, a number that climbs.
- At the end you get one to three stars with clear criteria, a personal best, and a hint about the next star.

## Playing from the bike

You should be able to play without touching the screen. Watts and cadence do most of the work. The + and − keys of a controller do one thing per game, spelled out on the menu. If you stop pedalling, the game pauses rather than punishing you, and nobody is penalised for pushing harder than asked.

Every game shares the same menu and the same results screen, so what you learn in one carries to the next.

![The shared menu: length, level and a start that works by key, touch or pedalling.](shot:gamemenu)

## The six games

Breakaway is a timed stage with a breakaway, a sprint and a climb that loads your trainer. Horde Run holds a road against waves of zombies. Pedal Strike is a runner shooter whose shields break only at the right watts. Slipstream asks you to bridge to attacking riders and tow them. Updraft is a plane whose altitude is your power. Feed Zone bounces a bottle off the soigneurs, with cadence setting its speed.

## How a game is checked

Our rules say a game is not finished because it looks good. It has to be checked with a bot at four power levels, 0.6, 0.8, 1.0 and 1.2 times FTP, over a five-minute session at normal level, recording the stars earned, the time to the first event, the longest gap with no event and the events per minute. The expected result is one star at 0.6 times FTP and three at 1.2 times. The rules also ask for frame strips of real play, looked at by a person, to catch visual defects: objects popping in near the camera, models passing through each other, flicker.

All of this uses simulated trainers. We cannot tell you how a game runs on your phone, and the visuals depend on its graphics.

## Build one

The games are small JavaScript modules on a shared kit that provides the menu, results, HUD, cyclist, environment and quality settings. If you have an idea for a game that works as a workout, the [Build a game page](/developers/) says what the kit gives you and how to add a game. We would like to see yours.
