// Which site adapter handles a page. Pure: tested in tests/ext/unit.spec.mjs.
// devOverride (chrome.storage.local "devAdapterOverride", host -> adapter) is honoured ONLY for local hosts,
// so the tests can use fake players served from 127.0.0.1; it never changes behaviour on real sites.
export const ADAPTERS = ['generic', 'youtube', 'netflix'];
const LOCAL = /^(localhost|127\.0\.0\.1)$/;

export function selectAdapter(url, devOverride = {}) {
  let u; try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (LOCAL.test(u.hostname)) {
    const o = devOverride?.[u.host] ?? devOverride?.[u.hostname];
    if (ADAPTERS.includes(o)) return o;
  }
  const h = u.hostname.toLowerCase();
  if (h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtube-nocookie.com' || h.endsWith('.youtube-nocookie.com')) return 'youtube';
  if (h === 'netflix.com' || h.endsWith('.netflix.com')) return 'netflix';
  return 'generic';
}

/** Match pattern for the permission check of a page (ports are not part of match patterns). */
export function originPattern(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.hostname}/*`; } catch { return null; }
}
export const isWebUrl = (url) => { try { const p = new URL(url).protocol; return p === 'http:' || p === 'https:'; } catch { return false; } };
