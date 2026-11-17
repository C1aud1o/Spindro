# Spindro: rules for anyone (human or AI) working in this repository

Spindro is a free, open-source indoor cycling app: a static web app (`index.html`, ES modules in `js/`, no bundler),
an Android shell (Capacitor, `android/`) and a showcase site (`site/`, built by `node site/build.mjs`).

## Branches and environments
- `main` is **production**: https://spindro.fit (site) and https://spindro.fit/app/ (app), APK release `app-android`.
- `beta` is **beta**: https://spindro.fit/beta/ (app only), APK prerelease `app-android-beta` ("Spindro Beta", installs next to the stable app).
- Work on a feature branch, merge into `beta`, test on real devices, then promote `beta` to `main`. Never push untested work straight to `main`.

## Commits
- Author: `C1aud1o <11772220+C1aud1o@users.noreply.github.com>` (set `git config user.name` / `user.email` before committing).
- Messages in English, imperative, one clear subject line.
- AI-assisted commits end with exactly one trailer line: `Co-Authored-By: Claude <noreply@anthropic.com>`. Do not add session links or any other URL.
- No secrets, keys or personal data in the repository, ever. Signing keys live only in GitHub Secrets.

## Before pushing
```sh
npm ci
npm test                                   # Playwright, simulated trainer (CI uses Node 22)
node tests/trainers/run.mjs                # trainer protocols
node tests/controllers/zwift-controllers.test.cjs
node site/build.mjs                        # if you touched site/ or docs/legal/
```
Every file listed in `ASSETS` in `sw.js` must exist; bump the cache name when shipped files change.

## Product rules
- User-facing text goes through `js/i18n.js` and must exist in all five `locales/*.json`.
- Games follow `docs/games/DESIGN-RULES.md` (session = workout in % of FTP, always something to do, verified with bots and frame strips).
- Never claim a device is "verified" unless it was tested on real hardware (`site/data/compatibility.json`).
- Assets must have a clear licence (CC0/MIT/OFL or generated for the project) and be credited in `README.md` and `docs/legal/licenses.*.md`.
