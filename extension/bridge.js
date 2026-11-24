// Spindro Remote: content script on spindro.fit (and localhost / 127.0.0.1 for development).
// Bridges the page (window.postMessage, protocol v1) and the service worker. Classic script: it cannot import protocol.js,
// so the few constants are repeated here and checked by tests/ext/bridge.spec.mjs.
(() => {
  if (window.__spindroBridge) return;
  window.__spindroBridge = true;
  const NS = 'spindro-remote'; const V = 1;
  const COMMANDS = ['playPause', 'seekBack', 'seekFwd', 'volumeUp', 'volumeDown', 'mute', 'next', 'prev', 'skip', 'fullscreen',
    'scrollUp', 'scrollDown', 'focusNext', 'focusPrev', 'focusUp', 'focusDown', 'focusLeft', 'focusRight', 'activate',
    'back', 'nextTab', 'prevTab', 'focusSpindro', 'focusTarget'];
  const plain = (o) => o !== null && typeof o === 'object' && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype;
  const post = (msg) => window.postMessage({ ns: NS, v: V, from: 'ext', ...msg }, location.origin);
  const fail = (id, code, message) => post({ type: 'result', id, ok: false, error: { code, message } });
  const ask = (m) => chrome.runtime.sendMessage(m);

  async function hello(register) {
    try {
      const r = await ask({ kind: 'hello', register });
      post({ type: 'hello', version: r.version, commands: COMMANDS, strong: !!r.strong });
    } catch { /* extension reloaded: the page stays without a handshake */ }
  }

  window.addEventListener('message', async (e) => {
    const d = e.data;
    if (e.source !== window || e.origin !== location.origin) return;
    if (!plain(d) || d.ns !== NS || d.v !== V || d.from !== 'app') return;
    if (d.type === 'hello') { hello(true); return; }
    const id = typeof d.id === 'string' || typeof d.id === 'number' ? d.id : null;
    if (id === null) return;
    if (d.type === 'status') {
      try { const r = await ask({ kind: 'status' }); post({ type: 'result', id, ...r }); } catch (err) { fail(id, 'internal', String(err?.message || err)); }
      return;
    }
    if (d.type !== 'cmd') return;
    if (typeof d.cmd !== 'string' || !COMMANDS.includes(d.cmd)) { fail(id, 'bad-command', 'Unknown command'); return; }
    if (d.args !== undefined && !plain(d.args)) { fail(id, 'bad-command', 'Bad arguments'); return; }
    try { const r = await ask({ kind: 'cmd', cmd: d.cmd, args: d.args ?? {} }); post({ type: 'result', id, ...r }); } catch (err) { fail(id, 'internal', String(err?.message || err)); }
  });

  hello(false); // announce the extension to an app that is already listening (the app also asks with its own hello)
})();
