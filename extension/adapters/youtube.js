// YouTube adapter (runs in the page's MAIN world): uses the player's own API (#movie_player), falls back to the <video>.
(() => {
  const R = globalThis.__spindroRemote; if (!R || R.adapters.youtube) return;
  const H = R.h; const G = R.adapters.generic;
  const player = () => { const p = document.getElementById('movie_player'); return p && typeof p.getPlayerState === 'function' ? p : null; };
  const SKIP = ['.ytp-skip-ad-button', '.ytp-ad-skip-button-modern', '.ytp-ad-skip-button', '.ytp-ad-skip-button-container button', 'button.ytp-ad-skip-button-modern'];
  R.adapters.youtube = {
    // Reports what the player really did: after the request it waits briefly for the state to change (1 = playing, 2 = paused).
    // If nothing changed (autoplay blocked, embed that cannot start) it says "requested" instead of claiming playback.
    playPause: async () => {
      const p = player(); if (!p) return G.playPause();
      const wasPlaying = p.getPlayerState() === 1;
      if (wasPlaying) p.pauseVideo(); else p.playVideo();
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const st = p.getPlayerState();
        if (wasPlaying ? st !== 1 : st === 1) return { playing: st === 1 };
      }
      return { playing: p.getPlayerState() === 1, requested: true };
    },
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
