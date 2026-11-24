// Spindro Remote: protocol v1 between the Spindro page and the extension (window.postMessage, same window).
// Shared by the service worker and the popup. The content script (bridge.js) is a classic script and repeats the
// few constants it needs; tests/ext checks both sides.
export const NS = 'spindro-remote';
export const VERSION = 1;
export const COMMANDS = [
  'playPause', 'seekBack', 'seekFwd', 'volumeUp', 'volumeDown', 'mute', 'next', 'prev', 'skip', 'fullscreen',
  'scrollUp', 'scrollDown', 'focusNext', 'focusPrev', 'focusUp', 'focusDown', 'focusLeft', 'focusRight', 'activate',
  'back', 'nextTab', 'prevTab', 'focusSpindro', 'focusTarget',
];
export const ERRORS = ['no-target', 'permission-missing', 'unsupported-page', 'no-player', 'not-supported', 'bad-command', 'strong-required', 'internal'];
// Commands that run in the page of the target tab, and which of them need a video player
export const VIDEO_COMMANDS = ['playPause', 'seekBack', 'seekFwd', 'volumeUp', 'volumeDown', 'mute', 'next', 'prev', 'skip'];
export const PAGE_COMMANDS = ['scrollUp', 'scrollDown', 'focusNext', 'focusPrev', 'focusUp', 'focusDown', 'focusLeft', 'focusRight', 'activate'];
export const TAB_COMMANDS = ['back', 'nextTab', 'prevTab', 'focusSpindro', 'focusTarget'];

export const isPlainObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype;

/** Validates the args of a command. Returns the cleaned args or null if they are not acceptable. */
export function cleanArgs(cmd, args) {
  if (args === undefined || args === null) return {};
  if (!isPlainObject(args)) return null;
  let size = 0; try { size = JSON.stringify(args).length; } catch { return null; }
  if (size > 256) return null;
  const out = {};
  if ('seconds' in args) {
    const s = args.seconds;
    if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0 || s > 600) return null;
    out.seconds = s;
  }
  for (const k of Object.keys(args)) if (k !== 'seconds') return null;
  return out;
}

export const err = (code, message, detail) => ({ ok: false, error: { code, message, ...(detail ? { detail } : {}) } });
export const ok = (data) => ({ ok: true, ...(data !== undefined ? { data } : {}) });
