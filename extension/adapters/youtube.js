// YouTube adapter (runs in the page's MAIN world): uses the player's own API (#movie_player), falls back to the <video>.
(() => {
  const R = globalThis.__spindroRemote; if (!R || R.adapters.youtube) return;
  const H = R.h; const G = R.adapters.generic;
  const player = () => { const p = document.getElementById('movie_player'); return p && typeof p.getPlayerState === 'function' ? p : null; };
  const SKIP = ['.ytp-skip-ad-button', '.ytp-ad-skip-button-modern', '.ytp-ad-skip-button', '.ytp-ad-skip-button-container button', 'button.ytp-ad-skip-button-modern'];
  R.adapters.youtube = {
    playPause: () => { const p = player(); if (!p) return G.playPause(); if (p.getPlayerState() === 1) p.pauseVideo(); else p.playVideo(); return { playing: p.getPlayerState() !== 1 }; },
    seekBack: ({ seconds = 10 } = {}) => { const p = player(); if (!p) return G.seekBack({ seconds }); const t = Math.max(0, p.getCurrentTime() - seconds); p.seekTo(t, true); return { time: t }; },
    seekFwd: ({ seconds = 10 } = {}) => { const p = player(); if (!p) return G.seekFwd({ seconds }); const t = p.getCurrentTime() + seconds; p.seekTo(t, true); return { time: t }; },
    volumeUp: () => { const p = player(); if (!p) return G.volumeUp(); if (p.isMuted()) p.unMute(); p.setVolume(Math.min(100, p.getVolume() + 10)); return { volume: p.getVolume() / 100 }; },
    volumeDown: () => { const p = player(); if (!p) return G.volumeDown(); p.setVolume(Math.max(0, p.getVolume() - 10)); return { volume: p.getVolume() / 100 }; },
    mute: () => { const p = player(); if (!p) return G.mute(); if (p.isMuted()) p.unMute(); else p.mute(); return { muted: p.isMuted() }; },
    next: () => { const p = player(); if (p && p.nextVideo) { p.nextVideo(); return { clicked: true }; } const b = H.clickFirst(['.ytp-next-button']); if (!b) H.fail('not-supported', 'No next video'); return { clicked: true }; },
    prev: () => { const p = player(); if (p && p.previousVideo) { p.previousVideo(); return { clicked: true }; } const b = H.clickFirst(['.ytp-prev-button']); if (!b) H.fail('not-supported', 'No previous video'); return { clicked: true }; },
    skip: () => { const b = H.clickFirst(SKIP) || H.clickMatching(H.SKIP_RE); if (!b) H.fail('not-supported', 'No skip button (ad / intro) visible'); return { clicked: true }; },
    fullscreen: () => { R.fullscreenButtons = ['.ytp-fullscreen-button']; return G.fullscreen(); },
    // theatre mode ("wide" player) is allowed from a script, unlike real fullscreen
    theatre: () => { const b = H.clickFirst(['.ytp-size-button']); return { clicked: !!b }; },
  };
})();
