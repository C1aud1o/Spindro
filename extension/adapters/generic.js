// Generic HTML5 <video> adapter: largest visible (and playing) video of the frame it runs in.
(() => {
  const R = globalThis.__spindroRemote; if (!R || R.adapters.generic) return;
  const H = R.h;
  const seek = (v, d) => {
    if (!Number.isFinite(v.duration)) H.fail('not-supported', 'This video cannot be seeked (live stream)');
    v.currentTime = Math.min(v.duration, Math.max(0, v.currentTime + d));
    return { time: v.currentTime };
  };
  R.adapters.generic = {
    playPause: async () => { const v = H.needVideo(); if (v.paused) await v.play(); else v.pause(); return { playing: !v.paused }; },
    seekBack: ({ seconds = 10 } = {}) => seek(H.needVideo(), -seconds),
    seekFwd: ({ seconds = 10 } = {}) => seek(H.needVideo(), seconds),
    volumeUp: () => H.setVolume(H.needVideo(), 0.1),
    volumeDown: () => H.setVolume(H.needVideo(), -0.1),
    mute: () => { const v = H.needVideo(); v.muted = !v.muted; return { muted: v.muted, volume: v.volume }; },
    next: () => { const el = H.clickMatching(H.NEXT_RE, 'a[rel=next]'); if (!el) H.fail('not-supported', 'No "next" button found'); return { clicked: true }; },
    prev: () => { const el = H.clickMatching(H.PREV_RE, 'a[rel=prev]'); if (!el) H.fail('not-supported', 'No "previous" button found'); return { clicked: true }; },
    skip: () => { const el = H.clickMatching(H.SKIP_RE); if (!el) H.fail('not-supported', 'No skip button found'); return { clicked: true }; },
    // Page part of fullscreen: leave document fullscreen if active, else try the site button. The Fullscreen API needs a real
    // user gesture, so from a script this usually does NOT enter fullscreen: the service worker then falls back to the browser window.
    fullscreen: async () => {
      if (document.fullscreenElement) { await document.exitFullscreen(); return { fullscreen: false, changed: true }; }
      if (R.fullscreenButtons) { const b = H.clickFirst(R.fullscreenButtons); if (b) await new Promise((r) => setTimeout(r, 300)); }
      return { fullscreen: !!document.fullscreenElement, changed: !!document.fullscreenElement };
    },
    theatre: () => ({ clicked: false }),
  };
})();
