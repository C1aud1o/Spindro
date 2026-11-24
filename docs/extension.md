# Spindro Remote (browser extension)

Spindro Remote lets a **Zwift Click** that is connected to Spindro control **another browser tab** (YouTube, Netflix, any HTML5 video page) while the trainer keeps running in ERG. Desktop Chrome / Edge only. No extra hardware, no install besides the extension.

Source: [`extension/`](../extension) · tests: [`tests/ext/`](../tests/ext) · zip: `npm run ext:zip` → `dist/spindro-remote.zip`.

## What it does

The Spindro page (spindro.fit, or localhost for development) talks to the extension through a small versioned `window.postMessage` protocol (v1). The extension acts on the **target tab**: the most recently active tab (in a normal window) that is not Spindro, or the tab you pinned in the popup.

| Command | What it does |
|---|---|
| `playPause`, `seekBack`, `seekFwd` (±10 s, `args.seconds`), `volumeUp`, `volumeDown`, `mute` | Controls the largest visible/playing `<video>` (same-origin iframes included); YouTube and Netflix through their own player API |
| `next`, `prev`, `skip` | Clicks the site's next / previous / "skip intro, recap, ad" button when there is one |
| `fullscreen` | Toggles fullscreen (see "Fullscreen" below) |
| `scrollUp`, `scrollDown` | Scrolls the page |
| `focusNext`, `focusPrev`, `focusUp/Down/Left/Right`, `activate` | "TV remote" navigation: moves a visible lime focus ring between links, buttons and fields, `activate` clicks it |
| `back` | Browser back in the target tab |
| `nextTab`, `prevTab` | Switches to the next / previous tab of the target's window (Spindro tabs are skipped) |
| `focusSpindro`, `focusTarget` | Brings the Spindro tab / the target tab to the front |

Errors come back to Spindro as `{ code, message }`: `no-target`, `permission-missing` (with `detail.origin`), `unsupported-page` (chrome:// pages, the Web Store, extension pages), `no-player`, `not-supported`, `bad-command`, `strong-required`, `internal`.

## Install by hand (until it is in a store)

1. Download `spindro-remote.zip` from the Spindro release page (assets of `app-android` / `app-android-beta`) and unzip it, or use the `extension/` folder of the repository.
2. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder (a `.zip` can also be dragged onto the page on recent versions; if your browser refuses, unzip it).
4. Open Spindro (spindro.fit/app), connect trainer and Click, switch the Click to **Remote** mode.
5. Open a video in another tab. Press play/pause on the Click.

Chrome shows a "disable developer mode extensions" notice at start-up for unpacked extensions: that is Chrome's standard behaviour.

## Permissions and why

| Permission | Why |
|---|---|
| `tabs` | Know which tab was active last (the target), its URL and title, switch tabs, browser back |
| `scripting` | Run the page-side code (play, seek, focus ring…) in the target tab |
| `storage` | Remember the pinned tab, the settings and the list of recently active tabs (session storage) |
| host `spindro.fit`, `localhost`, `127.0.0.1` | The bridge content script that talks to the Spindro page (localhost/127.0.0.1 are for development and tests) |
| host `*.youtube.com`, `*.netflix.com` | Control those players without asking again |
| optional hosts `https://*/*`, `http://*/*` | **Any other site is off until you allow it** from the popup ("Allow the controlled tab's site"). Without it Spindro gets `permission-missing`. You can remove a site again in the popup |
| optional `debugger` | Only for the opt-in **strong mode** (below) |

There are no `<all_urls>` host permissions granted at install, no remote code (Manifest V3, everything is in the package), no analytics, no network requests at all.

## Privacy

Spindro Remote **collects nothing**. It makes no network request, has no server, and does not read or store page content, history or your videos. It keeps locally, in your browser, only: the pinned tab id, the strong-mode switch, and (in session storage, cleared when the browser closes) the ids of recently active tabs. Page code runs only in the target tab, only when you press a Click button, and only on sites you allowed.

## Fullscreen: what really works

The Fullscreen API requires a real user gesture in the page, and key events created by a script are untrusted. So from a script a site's fullscreen can usually **not** be entered. Without strong mode `fullscreen` does:

1. if the page is in document fullscreen: leave it (allowed without a gesture);
2. else click the site's own fullscreen button (YouTube, Netflix) and see if it worked (it normally does not without a gesture);
3. else put the **browser window** in fullscreen (`chrome.windows` state, restored on the second press) and, on YouTube, switch the player to theatre mode.

The video then fills the screen with the browser's own fullscreen, which is what "TV mode" needs. Verified in headless Chromium with a fake page: the window path works both ways; the document path does not enter fullscreen without a gesture (as expected).

### Strong mode (opt-in)

In the popup you can switch on **strong mode**. It asks Chrome for the optional `debugger` permission and then uses `chrome.debugger` to send *trusted* key presses (`f`, space, arrows, `m`) and a user-gesture `requestFullscreen`. While it works, Chrome shows its banner **"Spindro Remote started debugging this browser"**: that is how Chrome signals the debugger API and it cannot be hidden. The extension detaches about 2.5 s after the last command. It is also used as a fallback when a site's player object is not found. Default: off.

## Site adapters

* **Generic HTML5** (`adapters/generic.js`): picks the largest visible video (playing counts double), including videos in same-origin iframes (every frame is probed, the winner runs the command). Next / previous / skip look for buttons with multilingual labels (EN/IT/FR/ES/DE).
* **YouTube** (`adapters/youtube.js`, page world): `#movie_player` API (`seekTo`, `setVolume`, `mute`, `nextVideo`, …), skip-ad buttons `.ytp-skip-ad-button` and friends, theatre button `.ytp-size-button`.
* **Netflix** (`adapters/netflix.js`, page world): **never writes `video.currentTime`** — doing so breaks Netflix playback. Seeking, play/pause and volume go through Netflix's own player object (`netflix.appContext.state.playerApp.getAPI().videoPlayer…`, times in milliseconds). If that object is not there, the adapter clicks the on-screen buttons (`data-uia` control buttons); if that fails too it answers `no-player`, it does not touch the `<video>`. In strong mode a trusted keyboard shortcut is the last fallback.

Adapter choice is by hostname (`lib/select.js`). For tests only, `chrome.storage.local.devAdapterOverride` can map a **localhost / 127.0.0.1** host to an adapter, so fake player pages can be tested; it is ignored for any real site.

## What is verified and what is not

Verified (automated, `npm test` runs `tests/ext`, Chromium + unpacked extension, headless "new" mode):

* handshake, protocol validation (foreign origin / frame, wrong `ns`, `v`, `from`, unknown command, bad args all ignored or refused), target tracking and pinning, Spindro tab never the target;
* every command on a local HTML5 video page (also in an iframe), on a YouTube-like and a Netflix-like **fake** page, `no-player`, `permission-missing`, `unsupported-page`;
* focus navigation (linear + spatial), the ring, activate, scroll, tab and back commands;
* window fullscreen toggle; strong mode paths (trusted keys arrive with `isTrusted === true`, `requestFullscreen` with gesture, auto-detach) using a copy of the extension that is granted `debugger` at install time.

**NOT verified:**

* **Real YouTube.** The selectors and the `movie_player` methods are written from the public IFrame API and memory of the page; not exercised on youtube.com.
* **Real Netflix.** Needs a login and a subscription and could not be tested. The player-object path, the `data-uia` selectors and the skip buttons are **unverified**. If Netflix changes them the adapter answers `no-player` / `not-supported`.
* The real permission prompts (add a site, strong mode) and Chrome's debugging banner: headless Chromium cannot show prompts, the tests grant the permissions at install time instead.
* A real Zwift Click; and Edge / Firefox (Chrome-family only; Firefox is not a target).

## Known limits

* Browser tabs only: no native apps, no other browsers' windows, no `chrome://` pages, the Chrome Web Store, or other extensions' pages.
* **DRM players** (Netflix, Prime, Disney+…) and sites with strict iframes/shadow DOM can limit what a script can reach; cross-origin iframes need the site permission of the frame's origin.
* Real document fullscreen needs strong mode or a click by you; otherwise the browser window goes fullscreen.
* Skip buttons, next/previous and the focus order depend on each site's markup; sites change it.
* Chrome may stop the extension's service worker at any time; the state it needs is in `chrome.storage`.
* Developer-mode extensions are flagged by Chrome at start-up.

## Credits

All code was written for this project; no code from other extensions was copied or read. The protocol idea and the spatial-focus algorithm follow the in-app Click navigation (`js/clicknav.js`). Icons are generated from `icons/icon.svg` (`scripts/ext-icons.mjs`). Spindro Remote is licensed like the rest of the repository (AGPL-3.0-only).
