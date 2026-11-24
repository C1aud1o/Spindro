// Spindro Remote: shared page-side helpers (classic script, injected with chrome.scripting.executeScript).
// Registers globalThis.__spindroRemote. Safe to inject more than once. No DOM access at load time (unit-tested in node).
(() => {
  const G = globalThis;
  if (G.__spindroRemote && G.__spindroRemote.v === 1) return;
  const R = G.__spindroRemote = { v: 1, adapters: {}, h: {} };
  const H = R.h;

  H.fail = (code, message) => { throw Object.assign(new Error(message), { spindro: code }); };

  // ---- visibility and video lookup ----
  H.visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0;
  };
  const inViewArea = (el) => {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  };
  /** Score of a <video>: visible area, doubled while playing. 0 = unusable (hidden or off screen). */
  H.videoScore = (v) => { if (!H.visible(v)) return 0; const a = inViewArea(v); return a ? a * (v.paused ? 1 : 2) : 0; };
  H.bestVideo = () => {
    let best = null; let bs = 0;
    for (const v of document.querySelectorAll('video')) { const s = H.videoScore(v); if (s > bs) { bs = s; best = v; } }
    return best;
  };
  R.probe = () => { const v = H.bestVideo(); return v ? H.videoScore(v) : 0; };

  // ---- buttons ----
  const textOf = (el) => `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.textContent || ''}`.replace(/\s+/g, ' ').trim();
  H.clickFirst = (selectors) => {
    for (const s of selectors) { const el = [...document.querySelectorAll(s)].find(H.visible); if (el) { el.click(); return el; } }
    return null;
  };
  H.clickMatching = (re, extra = '') => {
    const cand = [...document.querySelectorAll(`button, [role=button], a[href]${extra ? `, ${extra}` : ''}`)].filter(H.visible);
    const el = cand.find((c) => re.test(textOf(c)));
    if (el) { el.click(); return el; }
    return null;
  };
  H.SKIP_RE = /^\s*(skip|salta|passa|passer|saltar|omitir|überspringen|ueberspringen)\b/i;
  H.NEXT_RE = /\b(next|successiv[oa]|prossim[oa]|suivant|siguiente|nächste[rsn]?|naechste[rsn]?|weiter)\b/i;
  H.PREV_RE = /\b(prev(ious)?|precedente|précédent|anterior|vorherige[rsn]?|zurück)\b/i;

  // ---- generic video operations (HTML5). Netflix never uses the seeking one: see netflix.js ----
  H.needVideo = () => { const v = H.bestVideo(); if (!v) H.fail('no-player', 'No video found on the page'); return v; };
  H.setVolume = (v, d) => {
    if (d > 0 && v.muted) v.muted = false;
    v.volume = Math.min(1, Math.max(0, +(v.volume + d).toFixed(2)));
    return { volume: v.volume, muted: v.muted };
  };

  // ---- spatial pick (TV-remote navigation). Pure: works on rectangles. ----
  R.pickSpatial = (rects, cur, dir, wrap = true) => {
    const mk = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, w: r.right - r.left, h: r.bottom - r.top });
    const c = mk(cur); const horiz = dir === 'left' || dir === 'right'; const sign = dir === 'right' || dir === 'down' ? 1 : -1;
    const gap = (a0, a1, b0, b1) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
    const info = (r) => { const o = mk(r); return horiz
      ? { along: o.cx - c.cx, across: gap(c.top, c.bottom, o.top, o.bottom), cross: Math.abs(o.cy - c.cy), size: Math.min(o.w, c.w), o }
      : { along: o.cy - c.cy, across: gap(c.left, c.right, o.left, o.right), cross: Math.abs(o.cx - c.cx), size: Math.min(o.h, c.h), o }; };
    const same = (o) => o.left === c.left && o.top === c.top && o.right === c.right && o.bottom === c.bottom;
    let best = null; let bs = Infinity;
    rects.forEach((r, i) => {
      const k = info(r); if (same(k.o)) return;
      const d = k.along * sign; if (d <= Math.max(2, k.size * 0.35)) return;
      const s = d + 3 * k.across + 0.25 * k.cross; if (s < bs) { bs = s; best = i; }
    });
    if (best != null || !wrap) return best;
    rects.forEach((r, i) => {
      const k = info(r); if (same(k.o)) return;
      const edge = horiz ? k.o.cx : k.o.cy;
      const s = (sign > 0 ? edge : -edge) + 3 * k.across + 0.25 * k.cross; if (s < bs) { bs = s; best = i; }
    });
    return best;
  };

  // ---- focus navigation with a visible ring (set through the CSSOM: works under any page CSP) ----
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [role=button], [role=link], [tabindex]:not([tabindex="-1"])';
  let ringed = null; let saved = null;
  H.clearRing = () => {
    if (ringed && saved) for (const p of ['outline', 'outline-offset']) { if (saved[p][0]) ringed.style.setProperty(p, saved[p][0], saved[p][1]); else ringed.style.removeProperty(p); }
    ringed = null; saved = null;
  };
  H.setRing = (el) => {
    H.clearRing();
    saved = {}; for (const p of ['outline', 'outline-offset']) saved[p] = [el.style.getPropertyValue(p), el.style.getPropertyPriority(p)];
    el.style.setProperty('outline', '3px solid #D9FF3D', 'important');
    el.style.setProperty('outline-offset', '2px', 'important');
    ringed = el;
  };
  H.items = () => [...document.querySelectorAll(FOCUSABLE)].filter((e) => H.visible(e) && !e.closest('[inert], [aria-hidden=true]'));
  H.current = (items) => {
    if (ringed && items.includes(ringed)) return ringed;
    const a = document.activeElement; return a && items.includes(a) ? a : null;
  };
  const land = (el) => {
    H.setRing(el);
    try { el.focus({ preventScroll: true }); } catch { /* not focusable */ }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return { tag: el.tagName.toLowerCase(), text: textOf(el).slice(0, 80) };
  };
  H.focusStep = (d) => {
    const items = H.items(); if (!items.length) H.fail('not-supported', 'Nothing to focus on this page');
    const cur = H.current(items); let i;
    if (!cur) { i = d > 0 ? Math.max(0, items.findIndex((e) => inViewArea(e) > 0)) : items.length - 1; } else i = (items.indexOf(cur) + d + items.length) % items.length;
    return land(items[i]);
  };
  H.focusDir = (dir) => {
    const items = H.items(); if (!items.length) H.fail('not-supported', 'Nothing to focus on this page');
    const cur = H.current(items);
    if (!cur) return land(items.find((e) => inViewArea(e) > 0) || items[0]);
    const rects = items.map((e) => e.getBoundingClientRect());
    const i = R.pickSpatial(rects, cur.getBoundingClientRect(), dir, true);
    return land(items[i == null ? items.indexOf(cur) : i]);
  };
  H.activate = () => {
    const items = H.items(); const cur = H.current(items) || (document.activeElement !== document.body ? document.activeElement : null);
    if (!cur) H.fail('not-supported', 'No focused element: move the focus first');
    if (cur.tagName === 'INPUT' && /^(text|search|url|email|password|number|tel)$/.test(cur.type) || cur.tagName === 'TEXTAREA') { cur.focus(); return { tag: cur.tagName.toLowerCase(), focusedOnly: true }; }
    cur.click(); return { tag: cur.tagName.toLowerCase(), text: textOf(cur).slice(0, 80) };
  };
  H.scroll = (dir) => {
    const before = scrollY;
    scrollBy({ top: dir * Math.round(innerHeight * 0.8), behavior: 'instant' });
    return { scrollY: Math.round(scrollY), moved: scrollY !== before };
  };

  // ---- entry point ----
  /** Runs one command with the named adapter. Never throws: returns { ok, data } or { ok:false, code, message }. */
  R.run = async (adapter, cmd, args = {}) => {
    try {
      const page = {
        scrollUp: () => H.scroll(-1), scrollDown: () => H.scroll(1),
        focusNext: () => H.focusStep(1), focusPrev: () => H.focusStep(-1),
        focusUp: () => H.focusDir('up'), focusDown: () => H.focusDir('down'), focusLeft: () => H.focusDir('left'), focusRight: () => H.focusDir('right'),
        activate: () => H.activate(),
      };
      if (page[cmd]) return { ok: true, data: page[cmd]() };
      const a = R.adapters[adapter] || R.adapters.generic;
      const fn = a[cmd] || R.adapters.generic[cmd];
      if (!fn) H.fail('not-supported', `${cmd} is not supported on this site`);
      return { ok: true, data: (await fn(args)) ?? {} };
    } catch (e) {
      return { ok: false, code: e?.spindro || 'internal', message: String(e?.message || e) };
    }
  };
})();
