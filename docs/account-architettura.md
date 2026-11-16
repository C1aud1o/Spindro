# Accounts, sync and leaderboards: architecture (E2)

*Status: design + rules + tests. **Web login, profile, consents and sync (E3/E4) are integrated** (`js/account/`, switched off while `FIREBASE_CONFIG` in `js/config.js` is `null`). Leaderboards and monthly challenges (E5) are integrated (§16). Native Android login is still to do.*

References: legal drafts in `docs/legal/` (privacy sections 4 and 5, account deletion).

Files of this phase:

| File | What it contains |
|---|---|
| `firebase/firestore.rules` | security rules |
| `firebase/firestore.indexes.json` | indexes (one composite index for per-country leaderboards) and exclusions |
| `firebase/test/rules.test.js` | 24 rules tests with the emulator |
| `firebase.json`, `.firebaserc` | Firebase project configuration (placeholder project id) |
| `functions/` | Cloud Functions in TypeScript (v2, `europe-west1`) |
| `.github/workflows/rules.yml` | CI: rules tests (with Java) and functions tests |

---

## 1. Principles

1. **The app without an account is complete.** The account adds backup, sync, leaderboards and challenges. No existing feature depends on login.
2. **Local data stays the source for the interface.** `localStorage` is still what the app reads. The cloud is a synchronised copy. No login = nothing changes.
3. **Never lose data.** Sync merges (by id), it does not replace. A deletion arrives from another device only as an explicit "tombstone" (`deleted: true`), never because a record is missing.
4. **Offline first.** You can ride without a network. Writes are queued and sent when the connection returns.
5. **Heart rate is health data.** On the server only with explicit, separate consent, checked by the rules, deleted when consent is withdrawn.
6. **Leaderboards are written only by the server.** The client cannot write or delete a leaderboard row.
7. **Predictable costs.** Few reads per app launch, paged lists, no real-time listeners.

---

## 2. When the app shows the login

The login appears **only if there is a Firebase configuration**. The configuration exists only in the `play` build and on the official website. The `foss` build contains neither the configuration nor the Firebase SDK.

| Build | Firebase configuration | Firebase SDK | Login |
|---|---|---|---|
| Official web (Pages/Hosting) | yes, written by the publish workflow | yes, in `vendor/firebase/` | yes |
| Android `play` | yes, from the `play` source set | yes, from the `play` source set | yes |
| Android `foss` | no | no | **never** |
| Fork / local development | no (unless you create it) | no | no |

**How it is done (to implement in E3):**

- The repository has `js/firebase-config.js` with `export const FIREBASE_CONFIG = null;`. This file goes into `www/` for everyone.
- **Official web:** the publish workflow overwrites `www/js/firebase-config.js` with the real configuration (repository variable `FIREBASE_WEB_CONFIG`: public values, not secrets) and copies the SDK into `www/vendor/firebase/`.
- **Android:** `www/` is shared by the two flavors (`cap sync` copies it to `app/src/main/assets/public`). The `play` flavor adds its own source set `android/app/src/play/assets/public/` with its own `js/firebase-config.js` and `vendor/firebase/`. For assets, Gradle gives the flavor precedence over `main`: in the `play` APK the real configuration wins, in the `foss` APK it stays `null` and the SDK folder does not exist.
- **At runtime:** `accountsAvailable = FIREBASE_CONFIG != null`. The SDK is loaded with a dynamic `import()` **only** in that case. Without a configuration the app touches nothing, not even the network.
- The native parts (Google Sign-In with Credential Manager and App Check with Play Integrity, see section 9) live in `android/app/src/play/java/…` with `playImplementation` dependencies, as already foreseen by the comment in `android/app/build.gradle`.

---

## 3. Firestore data model

Database `(default)`, Standard edition, location **`eur3`** (EU multi-region, Belgium + Netherlands). The functions are in `europe-west1`, which is part of `eur3`.

```
users/{uid}                                   profile                         owner r/w
  ├─ rides/{rideId}                           rides                           owner r/w
  ├─ workouts/{workoutId}                     custom workouts                 owner r/w
  ├─ settings/prefs                           settings (known keys)           owner r/w
  ├─ settings/games                           records, progress, ghosts       owner r/w
  ├─ settings/hr                              maximum heart rate              owner r/w + consent
  ├─ challenges/{YYYY-MM}                     progress in the monthly challenges   owner r, server w
  ├─ medals/{medalId}                         medals                          owner r, server w
  └─ server/state, server/runs                anti-abuse state                owner r, server w
boards/{boardId}                              leaderboard metadata            public r, server w
  └─ periods/{'all' | 'YYYY-Www'}
       └─ entries/{uid}                       one row per user                public r (paged), server w
challenges/{YYYY-MM}                          definition of the monthly challenges   public r, server w
```

All documents written by the client have `updatedAt` = **`serverTimestamp()`**: the rules check `updatedAt == request.time`. This serves two purposes: incremental sync ("give me only what changed since…") and no invented dates.

### 3.1 Profile · `users/{uid}`

| Field | Type | Notes |
|---|---|---|
| `displayName` | string 2–24 | nickname, visible in leaderboards. Letters (accented too), digits, space, `. _ -`; must start with a letter or digit |
| `country` | string `^[A-Z]{2}$` or `null` | ISO 3166-1, optional. `null` = does not appear in per-country leaderboards |
| `locale` | `it`, `en-GB`… or `null` | preferred language (for future emails) |
| `ageOk` | `true` | declaration "I am at least 14 years old" (Italian minimum age for online services) |
| `consents.terms` | `{v, at}` | version of the Terms accepted, date |
| `consents.privacy` | `{v, at}` | version of the Privacy Notice read, date |
| `consents.hrCloud` | `{v, at, granted}` | **optional**, separate consent for heart rate in the cloud |
| `createdAt`, `updatedAt` | timestamp | `createdAt` never changes |
| `schema` | `1` | model version |

Rules on consents: a new or changed consent must have `at == request.time` (no backdating). `v` is the version of the text, for example the date `2026-11` written at the top of the draft in `docs/legal/`. When the Terms change substantially, the app compares `consents.terms.v` with the current version and asks again.

The profile **does not contain the email**: it is already in Firebase Auth, so it cannot end up in a read by mistake.

### 3.2 Rides · `users/{uid}/rides/{rideId}`

`rideId = String(t)`, where `t` is the start of the ride in milliseconds. It is the same key the local history merge already uses when restoring from a backup (`js/app.js`, `backupIn`: `Map` by `h.t`). Two devices starting a ride in the same millisecond is not a real case.

| Field | From local `rideHistory` | Notes / limits in the rules |
|---|---|---|
| `t` | `t` | int ms, from 2010 to tomorrow; must equal the id |
| `dur` | `dur` | 60 s – 24 h |
| `km` | `km` | 0–1500, average ≤ 80 km/h |
| `avgW`, `np`, `maxW` | same | ≤ 1500, 1500, 3000 |
| `kj` | `kj` | ≤ 30,000 |
| `best` | `best` (`{5, 60, 300, 1200}`) | ≤ 3000 / 2500 / 1500 / 1000 W |
| `series` | `series` (array of ints, one average every 10 s, max 720) | **compressed**: little-endian `Uint16` in base64, max 1920 characters (~1.9 KB instead of ~6 KB as an array) |
| `seriesV` | — | version of the `series` format (1) |
| `src` | — | `app` (recorded now) or `import` (from backup/old history): imported rides do not count for challenges |
| `hr` | `avgHr`, `maxHr` | **only with consent**: `{avgHr, maxHr, series?, seriesV?}`. Heart rate outside `hr` is forbidden |
| `deleted` | — | tombstone, for when the app has "delete ride" |
| `updatedAt` | — | `serverTimestamp()` |

The local history keeps at most 200 rides (and strips the series from the oldest if space runs out). **The cloud keeps them all**: in the future they can be loaded in pages ("show older rides").

### 3.3 Custom workouts · `users/{uid}/workouts/{workoutId}`

The id is the local one (`my-…` from the editor, `zwo-…` from an import). Fields as in `customWorkouts`: `name` (≤ 80), `tag`, `desc`, `steps` (≤ 400 steps), `blocks` (≤ 200, from the editor), `custom`, plus `deleted` and `updatedAt`. The built-in workouts (`js/workouts.js`) are not saved.

### 3.4 Settings · `users/{uid}/settings/{prefs|games|hr}`

Three documents with the same shape `{values: {key: value}, stamps: {key: ms}, updatedAt}`. The values are the `localStorage` strings, so the conversion is trivial (the same approach as the file backup).

| Document | Keys | Why separate |
|---|---|---|
| `prefs` | closed list in the rules: `ftp`, `mass`, `weekGoal`, `autoShift`, `autoCad`, `routeRealism`, `usePm`, `coachOn`, `musicOn`, `audioMode`, `gameMuted`, `gameGlow`, `clickMap`, `videoRef`, `lang`, `units` | the closed list prevents sensitive data from slipping in by mistake |
| `games` | game records (`*Best`, `racer3dBest{n}`), `rfProgress`, `racer3dStage`, route ghosts `ghost:*` (max 150 keys) | merged with different rules (the best wins, section 4) |
| `hr` | only `hrMax` | the maximum heart rate is heart-rate data: it needs consent like `rides.hr` |

**Never synchronised:** `stravaConfig` (Strava token), `ride-freedom-session` (ride in progress), `devMode`, `garminOn` (depends on the phone), the internal sync keys.

### 3.5 Leaderboards · `boards/{boardId}/periods/{periodId}/entries/{uid}`

- `boardId`: the game key as in `games` of `js/app.js` (`horde`, `shooter`, `gruppetto`, `mattoni`, `planata`); for Breakaway 3D one leaderboard per stage: `racer-s0`, `racer-s1`…
- `periodId`: `all` (all-time) or the ISO week in UTC, for example `2026-W45`. The week changes on Monday at 00:00 UTC (in Italy at 1 or 2 in the morning).
- One row per user and period (id = `uid`), with their **best** result.

| Field | Notes |
|---|---|
| `uid` | needed for deletion (collection group query) |
| `name` | copy of `displayName` at submission time |
| `country` | copy of `country` (or `null`) |
| `score` | points, or time in seconds (one decimal) for races |
| `sortKey` | `score`, or `-time` for races: this way sorting is **always** by `sortKey` descending and a single index is enough |
| `stage` | races only |
| `at` | moment of the record |

Planned queries:

| View | Query | Index |
|---|---|---|
| Week / all-time | `orderBy('sortKey','desc').limit(50)` | automatic |
| By country | `where('country','==','IT').orderBy('sortKey','desc').limit(50)` | composite `country ↑, sortKey ↓` (in `firestore.indexes.json`) |
| My row | `get(entries/{uid})` | — |
| My position | `where('sortKey','>', mine).count()` | automatic (aggregation: 1 read per 1000 rows counted) |

There is no need for a document per country: the filter on the same collection is enough and keeps the data in one place. If the name changes, the rows are updated at the next submission (see open questions).

`boards/{boardId}` holds the metadata (title, `lowerIsBetter`) and is created by hand or with an admin script.

### 3.6 Monthly challenges

- `challenges/{YYYY-MM}`: `{items: [{id: 'km300', metric: 'km', target: 300}, {id: 'rides10', metric: 'rides', target: 10}]}`. Metrics: `km`, `minutes`, `rides`, `kj`. Written from the console or a script, public read.
- `users/{uid}/challenges/{YYYY-MM}`: `{km, minutes, rides, kj, counted: {rideId: true}}`, computed **by the server** (`onRideCreated`) on every new ride.
- `users/{uid}/medals/{YYYY-MM}-{id}`: written by the server when a goal is exceeded.

Only rides of the current month count, saved within 2 days of its end, not imported (`src != 'import'`). Medals are personal (there is no public leaderboard of challenges): the reward for cheating is zero.

---

## 4. Sync with local data

Today everything is in `localStorage` (see `js/app.js`: `rideHistory`, `customWorkouts`, scattered settings, the games' `*Best`, `rfProgress`, `ghost:*`). Sync (E4) adds a `js/sync.js` module loaded only if `accountsAvailable` and the user is signed in.

### 4.1 New local keys (not included in the file backup)

| Key | Content |
|---|---|
| `sync:uid` | uid of the account this device is synchronised with |
| `sync:cursor:rides`, `sync:cursor:workouts`, `sync:cursor:settings` | `updatedAt` (ms) of the last document received |
| `sync:queue` | queue of writes to send: `[{col, id}]` (the local data is re-read at send time) |
| `sync:stamps` | `{key: ms}` of the last local change of each setting |
| `sync:tomb:workouts` | ids of deleted workouts, to be sent as tombstones |

`NO_BACKUP` in `js/app.js` must be extended with `^sync:`.

### 4.2 First sign-in on a device

1. All remote rides are downloaded in pages of 100 (`orderBy('updatedAt').limit(100).startAfter(…)`), then workouts and settings.
2. **Merge by id** with the local data (table 4.4). No local data is removed.
3. What exists only locally goes into `sync:queue` and is uploaded in batches (old rides with `src: 'import'`).
4. The cursors and `sync:uid` are saved.

If `sync:uid` holds a **different** account (account switch on the same phone), the app asks: "Merge this device's data into account X?" Without a positive answer it uploads nothing.

### 4.3 Normal use

- **At launch** and when the network returns: for each collection one query `where('updatedAt','>',cursor).orderBy('updatedAt').limit(100)`. If nothing changed it costs **1 read** per query.
- **At the end of a ride**: saved locally as today, then queued and sent. Offline, the queue stays in `localStorage` and is sent at the next `online`/launch.
- **No real-time listeners** (`onSnapshot`): predictable reads and no open connections during the workout.
- Recommended SDK: `firebase/firestore/lite` (lighter, no cache and listeners we do not need, we manage the queue ourselves). If App Check with Lite did not work well, switch to the full SDK with an in-memory cache (see open questions).

### 4.4 Merge rules

| Data | Rule |
|---|---|
| Rides | union by `rideId`. Same id: the **more complete** version wins (with `series` beats without), otherwise the most recent (`updatedAt`). Tombstone `deleted: true` → removed locally. The 200 most recent stay locally, as today |
| Heart rate of a ride | if there is consent, it is uploaded in `hr`; when downloading it goes back into the local `avgHr`/`maxHr`. Without consent the ride is uploaded **without** `hr` and the local heart rate is not touched |
| Workouts | by id, the most recent `updatedAt` wins. Deletion = tombstone `deleted: true` (the document stays, so other devices receive it) |
| `settings/prefs`, `settings/hr` | key by key: the most recent stamp (`stamps`) wins. The app must record the stamp when a setting changes: a small `setPref(k, v)` instead of the scattered `localStorage.setItem` calls |
| `settings/games` | **the best wins**, not the last: `*Best` the maximum, `racer3dBest{n}` the minimum (it is a time), `rfProgress` maximum XP + union of goals, `ghost:*` the fastest ghost (shortest trace) |

---

## 5. Heart rate (GDPR art. 9)

- Consent in `users/{uid}.consents.hrCloud = {v, at, granted: true}`, asked with an option that is **off by default** and separate from accepting the Terms ("Also save heart rate in the cloud").
- The rules allow `rides.hr` and `settings/hr` **only** if the profile has `hrCloud.granted == true` (one extra profile read for those writes). Heart-rate fields outside `hr` (`avgHr`, `maxHr` at the top level) are always rejected, because the list of allowed fields is closed.
- **Withdrawal**: the user turns the option off → `granted: false`. The Cloud Function `onProfileUpdated` deletes `hr` from all rides and the `settings/hr` document. The client can do it too (the rules allow removing `hr`), but the server guarantees it.
- Heart rate never enters leaderboards or challenges.

---

## 6. Account deletion

Two routes, same result (privacy section 4.4 and `docs/legal/account-deletion.*`):

| Route | How |
|---|---|
| **In the app** | *Settings → Account → Delete account* → sign in again (Google or password) → call to the `deleteAccount` function |
| **By email** | the controller verifies the identity and deletes the user from the Firebase console (Authentication). The `onAuthUserDeleted` function cleans up the data |

What `purgeUserData(uid)` deletes (used by both):

1. `firestore.recursiveDelete(users/{uid})`: profile, rides (heart rate included), workouts, settings, challenges, medals, anti-abuse state.
2. All leaderboard rows: collection group query `entries where uid == …` (index declared in `fieldOverrides`), deleted in batches.
3. Then `deleteAccount` deletes the user from Firebase Auth.

**Why on the server and not only on the client:** the client cannot delete leaderboard rows (the rules forbid it on purpose) and a deletion cut halfway by a dropped network would leave orphan data. The function is idempotent: it can be called again.

`deleteAccount` requires a recent sign-in (less than 10 minutes) and does **not** require App Check: deleting your own account must always work. The rules still allow the owner to delete their own documents (also useful for "remove just this ride").

Data on the device is not touched (the deletion page says so); after the deletion the app asks whether to wipe the local data too.

---

## 7. Anti-cheat

| Level | What it does |
|---|---|
| **App Check** (section 9) | `submitScore` accepts only calls from our app or our site |
| **Server-only writes** | the rules forbid any client write in `boards/**`, `challenges/**`, `users/*/medals`, `users/*/challenges`, `users/*/server` |
| **Validation** (`functions/src/validate.ts`) | closed list of games and fields; score within the game's limits; maximum **rate** of points per minute; race time not shorter than the game; minimum/maximum duration |
| **Power plausibility** | `avgW ≤ curve(duration)` (about 2000 W for 5 s, 1000 W for 1 min, 500 W for 20 min, 450 W beyond one hour), `avgW ≤ maxW ≤ 3000`. The same thresholds are in the ride rules (`best`, `avgW`, km/h) |
| **Rate limits** | one score every 20 s and 100 a day per user (in `users/{uid}/server/state`), in a transaction |
| **Duplicates** | random `runId` per game: the same call repeated by the network does not count twice |
| **Account** | verified email (or Google) required. `server/state.banned = true` (set by hand) excludes from leaderboards |
| **Traces** | every rejection increments `server/state.rejected` and goes to the logs: whoever has many rejections is checked by hand |
| **What is ranked** | game scores and times, **never absolute watts** (plan section 5). Watts/kg possibly only among friends |
| **Instances** | `maxInstances: 5` per function: abuse does not blow up the bill |

Known limit: whoever modifies the app (it is open source) can invent plausible scores. App Check makes it hard to use a modified client against our servers, plausibility removes the absurd ones, the rest is handled with reports (plan section 5).

---

## 8. Costs and limits

Firestore daily free quota: 50,000 reads, 20,000 writes, 20,000 deletes, 1 GiB of data. Cloud Functions: 2 million calls a month free.

| Action | Reads | Writes |
|---|---|---|
| App launch (user with an account, nothing new) | ~4 (profile, rides, workouts, settings: 1 each) | 0 |
| End of a ride | 0 (+1 if there is heart rate: profile read in the rules) | 1 + challenge trigger (~3) |
| Leaderboard (one view) | 50 rows + 1 my row + 1 position (`count()`) | 0 |
| Score submission | ~5 (in the function) | 2–4 |
| First sign-in with 200 rides | ~200 | ~200 |

With 1,000 active users a day the launches cost ~4,000 reads: nothing. But if everyone looked at 5 leaderboards a day with no cache it would be ~260,000 reads, above the free quota (in the order of a few euros a month). The leaderboard is the item that weighs, so:

- **pages of 50**, `limit` mandatory (the rules reject lists with no limit or over 100);
- **local leaderboard cache for 5 minutes** (in `sessionStorage`), explicit "refresh";
- the position with **`count()`**, not by downloading the rows above;
- if needed: a "top 50" summary document per leaderboard, rewritten by the server at every record (1 read instead of 50). This is the next step, not needed at launch.

Sizes: a ride with a series is ~2.5 KB. 1,000 users × 300 rides ≈ 750 MB, inside the free 1 GiB quota. Old weekly leaderboards can be deleted after 12 weeks with a scheduled function (to add when needed).

Indexes: large fields that are never searched are excluded from indexing (`series`, `hr`, `best`, `steps`, `blocks`, `values`, `stamps`): less space and cheaper writes.

Budget: alert at €5/month (the budget warns, it does not block). Real brakes: `maxInstances`, rate limits, App Check.

---

## 9. App Check

| Platform | Provider | Notes |
|---|---|---|
| Android `play` | **Play Integrity** | the app is a Capacitor WebView: the token comes from the native Firebase App Check SDK (code in the `play` source set) and is passed to the JS with a `CustomProvider` |
| Web | **reCAPTCHA Enterprise** | public site key; free up to 10,000 verifications a month |
| Development | debug provider | debug tokens registered in the console, never in the code |

Rollout: first App Check is turned on in **monitoring** mode (metrics without blocking), then **enforced** on Firestore and on the functions. `submitScore` already has `enforceAppCheck: true`; `deleteAccount` does not, on purpose.

The `foss` build has no App Check and does not need it: it does not talk to Firebase.

---

## 10. Login (E3, for reference)

- **Google**: on the web `signInWithPopup`. **Decision (Q1): in the Android app the Google button is hidden** (detected with `window.Capacitor?.isNativePlatform?.()`), because Google blocks Google login in WebViews; email and password sign-in remains, with a line explaining that Google will come later. **Native Google login = future task**: Credential Manager in the `play` source set, returning an ID token; the JS will call `signInWithCredential(GoogleAuthProvider.credential(idToken))`.
- **Email and password**: JS SDK, with a verification email required before the profile is created (the rules require it).
- After the first sign-in: profile screen (nickname, optional country, "I am at least 14", I accept the Terms, I have read the Privacy Notice, and separately, off, "Also save heart rate in the cloud"). Only then is `users/{uid}` created.
- Signing out does not delete local data.

---

## 11. Cloud Functions (`functions/`)

| Function | Type | What it does |
|---|---|---|
| `submitScore` | callable, App Check required | validates, applies the limits, writes the row in `all` and in the ISO week if it improves |
| `deleteAccount` | callable | deletes all the data and the Auth user |
| `onAuthUserDeleted` | Auth (1st gen.) | clean-up when the user is deleted from the console |
| `onUserCreate` | Auth (1st gen.), optional | creates `users/{uid}/server/state` |
| `onProfileUpdated` | Firestore | deletes heart rate when consent is withdrawn |
| `onRideCreated` | Firestore | updates the monthly challenges and awards medals |

All in `europe-west1`, Node 22, 256 MiB, at most 5 instances. No secrets: the Admin SDK uses the project's service account. Auth triggers exist only in the first generation of functions; second-generation "blocking" ones would need Identity Platform.

Tests: `cd functions && npm test` (validation and ISO week, no emulator).

---

## 12. Rules tests

`cd firebase && npm ci && npm test` starts the Firestore emulator (needs **Java 11+**) and runs `test/rules.test.js` with `@firebase/rules-unit-testing`. They cover:

- access denied to other people's data (profile, rides, workouts, server documents) and to signed-out users;
- profile: invalid fields, unverified email, backdated consents, immutable `createdAt`;
- heart rate: rejected without consent or with withdrawn consent, rejected outside `hr`, accepted with consent; `settings/hr` only with consent;
- implausible rides (duration, speed, power, future, series too long, fake date, id ≠ `t`);
- leaderboards: public read only in pages, **no** client write or delete, not even of a "valid" row;
- deletion: your own data yes, other people's no, server documents no; removing heart rate from your own rides.

In CI they are run by `.github/workflows/rules.yml` on Ubuntu with Java 21.

---

## 13. Decisions taken

1. Leaderboards **only through a Cloud Function** (not rules that validate fields): the rules cannot do rate limits, ISO weeks and "keep the best" reliably.
2. One row per user and period, with `sortKey` always descending: a single composite index (by country), no duplicated documents per country.
3. Heart rate isolated in the `hr` field and in the `settings/hr` document, checked by the rules against consent; withdrawal handled by the server.
4. `rideId = String(t)`: compatible with the existing history, no migration of local data.
5. Series compressed in base64 (`Uint16`): about a third of the space of an array.
6. Settings in three documents; closed list for `prefs`; game records merged with the "best wins" criterion.
7. Cursor-based sync on `updatedAt` (incremental read), own local queue, no listeners.
8. `deleteAccount` on the server, without App Check, with a recent sign-in; clean-up also when deleting from the console.
9. Login present only if the configuration exists: `foss` contains neither configuration nor SDK (assets of the `play` flavor).
10. Rules tests in a separate package (`firebase/package.json`): `firebase-tools` is heavy and must not slow down the web app's `npm ci` and the Playwright tests.

## 14. Open questions

1. **Location of Firestore triggers with `eur3`.** The functions are in `europe-west1` (part of `eur3`). It must be confirmed at the first deploy that the `onProfileUpdated`/`onRideCreated` triggers are accepted in that region; otherwise the CLI names the right one.
2. **Score limits to tune.** `functions/src/games.ts` has wide values set by estimate. Before launching the leaderboards: collect real scores (from testers too) and tighten them.
3. **Android WebView.** Native Google Sign-In and App Check with Play Integrity need native code in the `play` flavor (a small Capacitor plugin). This is the most delicate part of E3. Alternative: ready-made plugins (e.g. `@capacitor-firebase/*`), but they would have to be kept out of the `foss` build, which is not trivial with `cap sync`.
4. **Firestore Lite + App Check.** To verify in E4; if there are problems, use the full SDK.
5. **Leaderboard name not updated** when the user changes nickname (it updates at the next record). A function could propagate it; not needed for now.
6. **Weight (`mass`)** is synchronised as a normal setting. It is not health data in the strict sense, but someone might consider it so: check with whoever reviews the privacy notice whether to treat it like heart rate.
7. **Nickname moderation**: the rules block odd characters and length, not swear words. A list of banned words in `submitScore` or a way to report is needed.
8. **Web and `authDomain`**: with the site on a domain other than `*.firebaseapp.com`, popup login works, redirect may have problems with browsers that isolate third-party cookies. If the site moves to Firebase Hosting on the same domain the problem disappears.
9. **Old weekly leaderboards**: decide how many to keep (proposal 12 weeks) and add the scheduled clean-up.
10. **Emulator in the cloud development environment**: the rules tests run; loading the Firestore triggers in the functions emulator fails only because of the environment's proxy (local calls routed outside). It does not happen in CI or locally.

## 15. How the web side is built (E3/E4) and what to try with the real project

| File | Job |
|---|---|
| `js/config.js` | `FIREBASE_CONFIG` (null = everything off), `FIREBASE_EMULATOR`, `FIREBASE_VERSION`, URLs and versions of the legal texts |
| `js/account/index.js` | entry point: without a configuration it does nothing (no element, no extra module, no network) |
| `js/account/sdk.js` | dynamic `import()` of the SDK from `gstatic.com/firebasejs/<version>/` (app, auth, firestore-lite, functions); emulators if `FIREBASE_EMULATOR` |
| `js/account/ui.js` | "Account" section in Settings: sign-in, email verification, profile and consents, sign-out, deletion |
| `js/account/sync.js` | queue, cursors, incremental pull, send; "synced / pending" status |
| `js/account/sync-core.js` | pure part: conversions and merge rules (tested in Node) |

Choices with respect to the design: Firestore **Lite** (no listeners); `sync:vals`, `sync:last`, `sync:force`, `sync:bad`, `account:session` are added to the keys of §4.1 (all outside the backup: `NO_BACKUP` covers `sync:*` and `account:session`); setting stamps are derived by **comparing** the values at every sync, so no scattered `setPref()` is needed in the code; the SDK is downloaded only if the device had already signed in or at the first tap on "Sign in" (whoever does not use the account does not contact Google).

To verify with the real Firebase project (the emulators do not prove everything): Google popup and authorised domains; verification and password-reset emails delivered (templates, sender, spam); `deleteAccount` deployed (here in the tests it is simulated) and recent sign-in; `onProfileUpdated` trigger that deletes heart rate on withdrawal; indexes; App Check in monitoring; real read costs.

## 16. Leaderboards and monthly challenges on the web side (E5)

| File | Job |
|---|---|
| `js/account/boards.js` | score submission (`submitScore`, a queue of 10 with 3 retries if the network is missing) and leaderboards with tabs Week / All-time / My country. Loaded only when accounts are available |
| `js/account/index.js` | `submitGameScore` (no-op without a linked account) and `renderBoards` (panel hidden without `FIREBASE_CONFIG`) |
| `js/challenges.js` | monthly challenges, pure module: progress from the local history, zone 2 from the power series (56-75% FTP) |
| `functions/src/challenges.ts` | the server's default challenges (km, rides): used if `challenges/{YYYY-MM}` is missing; they must match `js/challenges.js` (test) |

- **Submission**: every game calls `hooks.runStart()` at the start and `hooks.runEnd({game, stage?, score})` at the end. `app.js` measures duration and power (1 sample per second) and sends only if the trainer is connected (not in demo), the game lasts at least 20 s and the user is signed in. The `runId` avoids duplicates.
- **Reading**: 20 rows + my row + a `count()` for the position (≤ 22 reads per view), 5-minute cache in `sessionStorage`, explicit "Refresh". Without login there is only the invitation "Sign in to join the leaderboard": no network, SDK not downloaded.
- **App Check**: `FIREBASE_APPCHECK_SITE_KEY` in `js/config.js` (reCAPTCHA v3 key). Empty = off: until it is set (and App Check is enforced) submission works only with the emulators.
- **Challenges**: progress is local only (works without an account). The medal is remembered in `challengeDone` and shown at the end of a ride; with the account the server awards its own too (km and rides). Zone 2 is local only: the server does not know the FTP.
- **TODO**: tune the limits in `functions/src/games.ts` with real scores; `challengeDone` is not yet synchronised between devices; challenges of different months in `BY_MONTH` (client) and in `challenges/{YYYY-MM}` (server).
