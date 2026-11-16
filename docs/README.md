# Spindro documentation

Contributor-facing documents. User-facing help lives in the app and on the site. File names with Italian words are kept
on purpose, because source-code comments refer to them.

## Project and release
- [environments.md](environments.md) — production and beta: branches, URLs, how beta stays separate, how to promote.
- [android-and-install.md](android-and-install.md) — the Android shell, permissions, building both channels, installing as an app.
- [account-architettura.md](account-architettura.md) — optional account: Firestore model, sync, leaderboards, anti-cheat, costs, open questions.
- [compliance-report.md](compliance-report.md) — licence and legal compliance review.
- [legal/](legal/) — Terms, Privacy Notice, account deletion, trademarks and third-party licences (Italian and English).

## Hardware
- [connecting-devices.md](connecting-devices.md) — how Spindro connects trainers, controllers, heart-rate straps and sensors; what works where; troubleshooting.
- [zwift-controller.md](zwift-controller.md) — Zwift Click, Play and Ride: protocol, roles, what is verified and what is not.
- [click-navigazione.md](click-navigazione.md) — navigating the app with a controller: roles, legend bar, key check.

## Training
- [piani.md](piani.md) — the training plans: principles, sources, how progress and reminders work.

## Games
- [games/DESIGN-RULES.md](games/DESIGN-RULES.md) — design rules every game must follow, and how to verify them.
- [games/API.md](games/API.md) — the interface a game implements.
- [games/CREATE-A-GAME.md](games/CREATE-A-GAME.md) — build a new game in 15 minutes.
- [giochi-design.md](giochi-design.md) — pointer to `games/DESIGN-RULES.md` (kept for old references).
- [giochi-stile.md](giochi-stile.md) — the shared 3D style: palette, light, camera, HUD, text kit, performance budget, per-game visual notes.
- [breakaway.md](breakaway.md) — Breakaway: stage structure, rivals scaled to FTP, tuning and tests.
- [horde-run.md](horde-run.md) — Horde Run: workout shape, controls, portals, tuning.
- [slipstream.md](slipstream.md) — Slipstream: bridging, slipstream group, tuning.
- [giochi-shots/](giochi-shots/) — reference screenshots and frame strips.

## Quality assurance
- [qa/phone-checklist.md](qa/phone-checklist.md) — checks to run on a real phone and trainer before promoting `beta` to `main`.
- [qa/q1-app.md](qa/q1-app.md) — QA round 1: the whole app except the 3D games and device connection.
- [qa/q2-games.md](qa/q2-games.md) — QA round 2: the six 3D games.

## Language
- [i18n-glossary.md](i18n-glossary.md) — how to translate, how to add a language, and the agreed word for each concept in each language.

## Design
- [design/](design/) — design notes and screenshots (site launch checklist, home and connection mock-ups).
- [legal/future/](legal/future/) — drafts of the legal texts for the version with accounts.
