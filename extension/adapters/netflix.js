// Netflix adapter (runs in the page's MAIN world).
// NEVER write video.currentTime on Netflix: it makes the player fail (error "M7375"-like). All seeking goes through Netflix's own
// player object (netflix.appContext.state.playerApp.getAPI().videoPlayer, times in ms). If that object is missing we click the
// on-screen control buttons (data-uia). If neither exists we return a clear "no-player" error, never a guess on the <video>.
// The selectors and the API are written from memory of the public page and are UNVERIFIED on the real site (needs a login).
(() => {
  const R = globalThis.__spindroRemote; if (!R || R.adapters.netflix) return;
  const H = R.h; const G = R.adapters.generic;
  const api = () => {
    try {
      const vp = globalThis.netflix.appContext.state.playerApp.getAPI().videoPlayer;
      const ids = vp.getAllPlayerSessionIds(); if (!ids || !ids.length) return null;
      return vp.getVideoPlayerBySessionId(ids[ids.length - 1]) || null;
    } catch { return null; }
  };
  const UIA = (n) => [`[data-uia="${n}"]`];
  const btn = (names) => H.clickFirst(names.flatMap(UIA));
  const noPlayer = () => H.fail('no-player', 'Netflix player not found (open a title and let it start)');
  R.adapters.netflix = {
    playPause: () => {
      const p = api();
      if (p) { if (p.isPaused()) p.play(); else p.pause(); return { playing: !p.isPaused() }; }
      if (!btn(['control-play-pause-pause', 'control-play-pause-play'])) noPlayer();
      return { clicked: true };
    },
    seekBack: ({ seconds = 10 } = {}) => { const p = api(); if (p) { const t = Math.max(0, p.getCurrentTime() - seconds * 1000); p.seek(t); return { time: t / 1000 }; } if (!btn(['control-back10'])) noPlayer(); return { clicked: true }; },
    seekFwd: ({ seconds = 10 } = {}) => { const p = api(); if (p) { const t = p.getCurrentTime() + seconds * 1000; p.seek(t); return { time: t / 1000 }; } if (!btn(['control-forward10'])) noPlayer(); return { clicked: true }; },
    volumeUp: () => { const p = api(); if (!p) noPlayer(); if (p.getMuted?.()) p.setMuted(false); p.setVolume(Math.min(1, +(p.getVolume() + 0.1).toFixed(2))); return { volume: p.getVolume() }; },
    volumeDown: () => { const p = api(); if (!p) noPlayer(); p.setVolume(Math.max(0, +(p.getVolume() - 0.1).toFixed(2))); return { volume: p.getVolume() }; },
    mute: () => { const p = api(); if (p) { p.setMuted(!p.getMuted()); return { muted: p.getMuted() }; } if (!btn(['control-volume-high', 'control-volume-low', 'control-volume-muted'])) noPlayer(); return { clicked: true }; },
    next: () => { if (!btn(['next-episode-seek-button', 'control-next-episode'])) H.fail(api() ? 'not-supported' : 'no-player', 'No next-episode button'); return { clicked: true }; },
    prev: () => H.fail('not-supported', 'Netflix has no previous-episode button in the player'),
    skip: () => { if (!btn(['player-skip-intro', 'player-skip-recap', 'player-skip-credits']) && !H.clickMatching(H.SKIP_RE)) H.fail('not-supported', 'No skip button (intro / recap) visible'); return { clicked: true }; },
    fullscreen: () => { R.fullscreenButtons = ['[data-uia="control-fullscreen-enter"]', '[data-uia="control-fullscreen-exit"]']; return G.fullscreen(); },
    theatre: () => ({ clicked: false }),
  };
})();
