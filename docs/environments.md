# Environments: beta and production

Everything is hosted on GitHub (Actions, Pages, Releases). Nothing else.

| | Production | Beta |
|---|---|---|
| Branch | `main` | `beta` |
| Site | https://spindro.fun | none |
| Web app | https://spindro.fun/app/ | https://spindro.fun/beta/ (`noindex`, `Disallow` in robots.txt) |
| Android APK | https://spindro.fun/app/spindro.apk (release `app-android`) | https://spindro.fun/beta/spindro-beta.apk (prerelease `app-android-beta`) |
| Android app | "Spindro", `com.spindro.app` | "Spindro Beta", `com.spindro.app.beta` (installs next to the stable app) |

## Flow

1. Work on a feature branch and open a pull request into `beta` (tests run on pull requests).
2. Merge into `beta`. The *Pages* workflow redeploys `/beta/` (started from `main` by `pages-beta.yml`, because the `github-pages` environment only accepts the default branch) and the *Android* workflow publishes the beta APK.
3. Test on a real phone with the beta app (the **BETA** badge is next to the logo and in Settings).
4. Promote: run the **Promote beta to production** workflow (Actions tab → Run workflow). It fast-forwards `main` to `beta`
   and starts the Android and Pages workflows. It fails if `main` has commits that `beta` lacks: merge `main` into `beta` first.

Manual promotion (needed when the change touches files under `.github/workflows/`, which a workflow cannot push):

```sh
git fetch origin
git push origin origin/beta:main     # fails unless it is a fast-forward: that is the point
```

## One deployment, both environments

`pages.yml` checks out `main` and `beta` side by side, builds each from its own code and publishes one Pages artifact
(`/` + `/app/` from main, `/beta/` from beta). If `beta` does not exist, only production is published.

## How beta stays separate from production

- **Web storage.** `/app/` and `/beta/` share the origin `spindro.fun`, so beta replaces `window.localStorage` with a view on
  keys prefixed `beta:` (`scripts/beta-storage-shim.js`, inlined first in `index.html` by `scripts/copy-web.mjs`). Beta can never
  read or overwrite the stable data. Settings has **Copy my data from the stable app** (stable → beta only, never the reverse).
- **Caches.** The beta service worker uses cache names starting with `beta-spindro-` and has scope `/beta/`; each worker only
  deletes caches with its own prefix.
- **Android.** `CHANNEL=beta` gives the app id suffix `.beta`, version suffix `-beta` and the label "Spindro Beta". Capacitor's
  `appId` stays `com.spindro.app`; the FileProvider and the Garmin bridge use `${applicationId}` / `getPackageName()`.
- **Build channel.** `scripts/copy-web.mjs` writes `js/build.js` with `BUILD` and `CHANNEL` (`prod` or `beta`, from the `CHANNEL` env var).
  `WEB_DEPLOY=1` (used by Pages) also copies `sw.js` and, for beta, adds the shim and the `noindex` meta tag.
