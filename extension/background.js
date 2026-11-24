// Spindro Remote: service worker. Receives commands from the bridge (content script on the Spindro page) and acts on the TARGET tab.
import { COMMANDS, VERSION, VIDEO_COMMANDS, PAGE_COMMANDS, cleanArgs, err, ok } from './protocol.js';
import { selectAdapter, originPattern, isWebUrl } from './lib/select.js';

const CORE = ['adapters/core.js'];
const ALL_ADAPTERS = ['adapters/core.js', 'adapters/generic.js', 'adapters/youtube.js', 'adapters/netflix.js'];
const KEYS = { // strong mode: trusted keys the sites' own players understand
  playPause: { key: ' ', code: 'Space', vk: 32, text: ' ' }, seekBack: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 }, seekFwd: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  volumeUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 }, volumeDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 }, mute: { key: 'm', code: 'KeyM', vk: 77, text: 'm' },
  fullscreen: { key: 'f', code: 'KeyF', vk: 70, text: 'f' },
};

// ---------- state that must survive the service worker being killed ----------
const sget = async (k, d) => (await chrome.storage.session.get(k))[k] ?? d;
let chain = Promise.resolve();
const serial = (fn) => (chain = chain.then(fn, fn));
const touch = (tabId) => serial(async () => { const mru = await sget('mru', []); await chrome.storage.session.set({ mru: [tabId, ...mru.filter((x) => x !== tabId)].slice(0, 30) }); });
chrome.tabs.onActivated.addListener(({ tabId }) => touch(tabId));
chrome.windows.onFocusChanged.addListener(async (wid) => {
  if (wid === chrome.windows.WINDOW_ID_NONE) return;
  const [t] = await chrome.tabs.query({ active: true, windowId: wid }).catch(() => []); if (t) touch(t.id);
});
chrome.tabs.onRemoved.addListener((tabId) => serial(async () => {
  await chrome.storage.session.set({ mru: (await sget('mru', [])).filter((x) => x !== tabId) });
  const sp = await sget('spindro', {}); if (tabId in sp) { delete sp[tabId]; await chrome.storage.session.set({ spindro: sp }); }
}));
chrome.debugger?.onDetach?.addListener((src) => attached.delete(src.tabId));

const isSpindroHost = (url) => { try { return new URL(url).hostname === 'spindro.fit'; } catch { return false; } };
const originOf = (url) => { try { return new URL(url).origin; } catch { return null; } };
async function spindroTabIds() {
  const sp = await sget('spindro', {}); const out = [];
  for (const [id, origin] of Object.entries(sp)) { const t = await chrome.tabs.get(+id).catch(() => null); if (t && originOf(t.url) === origin) out.push(+id); }
  const web = await chrome.tabs.query({ url: 'https://spindro.fit/*' }).catch(() => []);
  for (const t of web) if (!out.includes(t.id)) out.push(t.id);
  return out;
}
const isSpindro = (tab, ids) => ids.includes(tab.id) || isSpindroHost(tab.url || '');

async function normalWindow(windowId) { const w = await chrome.windows.get(windowId).catch(() => null); return w && w.type === 'normal' ? w : null; }

/** Target = pinned tab, else the most recently active non-Spindro tab of a normal window. */
async function findTarget() {
  const ids = await spindroTabIds();
  const { pinnedTabId } = await chrome.storage.local.get('pinnedTabId');
  if (pinnedTabId != null) {
    const t = await chrome.tabs.get(pinnedTabId).catch(() => null);
    if (t && !isSpindro(t, ids) && isWebUrl(t.url || '')) return t;
    await chrome.storage.local.remove('pinnedTabId');
  }
  for (const id of await sget('mru', [])) {
    const t = await chrome.tabs.get(id).catch(() => null);
    if (t && !isSpindro(t, ids) && isWebUrl(t.url || '') && await normalWindow(t.windowId)) return t; // internal pages are never the target
  }
  const all = (await chrome.tabs.query({})).filter((t) => !isSpindro(t, ids) && isWebUrl(t.url || ''));
  all.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  for (const t of all) if (await normalWindow(t.windowId)) return t;
  return null;
}

async function isStrong() {
  const { strong } = await chrome.storage.local.get('strong');
  return !!strong && await chrome.permissions.contains({ permissions: ['debugger'] }).catch(() => false);
}
async function adapterFor(tab) { const { devAdapterOverride } = await chrome.storage.local.get('devAdapterOverride'); return selectAdapter(tab.url || '', devAdapterOverride || {}); }

async function status() {
  const t = await findTarget(); const adapter = t ? await adapterFor(t) : null;
  let host = null; try { host = t ? new URL(t.url).host : null; } catch { /* */ }
  return ok({ target: t ? { tabId: t.id, title: t.title || '', host, adapter } : null, spindroTabs: (await spindroTabIds()).length, strong: await isStrong() });
}

// ---------- running page code ----------
const fromThrow = (e) => {
  const m = String(e?.message || e);
  if (/cannot access|permission|host permission|extensions gallery/i.test(m)) return err('permission-missing', m);
  return err('internal', m);
};
const pageErr = (r) => err(r.code || 'internal', r.message || 'Page command failed');

async function inject(target, files, world) { await chrome.scripting.executeScript({ target, files, world }); }
async function execIn(target, world, adapter, cmd, args) {
  const [r] = await chrome.scripting.executeScript({ target, world, func: (a, c, g) => globalThis.__spindroRemote.run(a, c, g), args: [adapter, cmd, args] });
  return r?.result || { ok: false, code: 'internal', message: 'No result from the page' };
}

/** Runs a video command: generic = best frame (probe all frames, run in the winner); YouTube / Netflix = top frame, MAIN world. */
async function runVideo(tab, adapter, cmd, args) {
  if (adapter === 'generic') {
    await inject({ tabId: tab.id, allFrames: true }, ALL_ADAPTERS, 'ISOLATED');
    const probes = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => globalThis.__spindroRemote?.probe?.() || 0 });
    let best = null;
    for (const p of probes) if (p.result > 0 && (!best || p.result > best.result)) best = p;
    if (!best) return { ok: false, code: 'no-player', message: 'No video found on the page' };
    return execIn({ tabId: tab.id, frameIds: [best.frameId] }, 'ISOLATED', 'generic', cmd, args);
  }
  await inject({ tabId: tab.id }, ALL_ADAPTERS, 'MAIN');
  return execIn({ tabId: tab.id }, 'MAIN', adapter, cmd, args);
}

// ---------- strong mode: chrome.debugger (optional permission), trusted input ----------
const attached = new Set(); const detachTimers = new Map();
async function withDebugger(tabId, fn) {
  if (!attached.has(tabId)) { await chrome.debugger.attach({ tabId }, '1.3'); attached.add(tabId); }
  clearTimeout(detachTimers.get(tabId));
  try { return await fn((m, p) => chrome.debugger.sendCommand({ tabId }, m, p)); }
  finally {
    // the "is debugging this browser" banner stays while attached: let go soon after the last command
    detachTimers.set(tabId, setTimeout(() => { attached.delete(tabId); chrome.debugger.detach({ tabId }).catch(() => {}); }, 2500));
  }
}
async function trustedKey(tabId, k) {
  await withDebugger(tabId, async (send) => {
    const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
    await send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text ? { text: k.text } : {}) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  });
}
async function strongFullscreen(tab, adapter) {
  if (adapter !== 'generic') { await trustedKey(tab.id, KEYS.fullscreen); return ok({ mode: 'strong-key' }); }
  const r = await withDebugger(tab.id, (send) => send('Runtime.evaluate', {
    userGesture: true, awaitPromise: true, returnByValue: true,
    expression: `(async()=>{ if(document.fullscreenElement){await document.exitFullscreen();return 'exit'}
      const vs=[...document.querySelectorAll('video')].sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight);
      const el=vs[0]; if(!el) return 'none'; await (el.parentElement&&el.parentElement!==document.body?el.parentElement:el).requestFullscreen(); return 'enter'})()`,
  }));
  if (r.exceptionDetails || r.result?.value === 'none') return err('no-player', 'No video to put in fullscreen');
  return ok({ mode: 'strong-document', result: r.result?.value });
}

// ---------- fullscreen without strong mode ----------
async function windowFullscreen(tab, adapter) {
  const w = await chrome.windows.get(tab.windowId);
  if (w.state === 'fullscreen') {
    const { prevWindowState } = await chrome.storage.session.get('prevWindowState');
    await chrome.windows.update(w.id, { state: prevWindowState && prevWindowState !== 'fullscreen' ? prevWindowState : 'normal' });
    return { mode: 'window', fullscreen: false };
  }
  await chrome.storage.session.set({ prevWindowState: w.state });
  await chrome.windows.update(w.id, { state: 'fullscreen' });
  if (adapter === 'youtube') await runVideo(tab, adapter, 'theatre', {}).catch(() => {}); // theatre mode: bigger player
  return { mode: 'window', fullscreen: true };
}
async function fullscreen(tab, adapter) {
  if (await isStrong()) { try { return await strongFullscreen(tab, adapter); } catch (e) { /* fall through to the normal way */ } }
  const page = await runVideo(tab, adapter, 'fullscreen', {}).catch(() => null);
  if (page?.ok && page.data?.changed) return ok({ mode: 'document', fullscreen: page.data.fullscreen });
  return ok(await windowFullscreen(tab, adapter));
}

// ---------- tab commands ----------
async function activateTab(tab) { await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {}); await chrome.tabs.update(tab.id, { active: true }); }
async function cycleTab(dir, target, senderTab) {
  const base = target || senderTab; if (!base) return err('no-target', 'No tab to start from');
  const ids = await spindroTabIds();
  const tabs = (await chrome.tabs.query({ windowId: base.windowId })).filter((t) => !isSpindro(t, ids) || t.id === base.id).sort((a, b) => a.index - b.index);
  if (tabs.length < 2) return err('not-supported', 'No other tab in this window');
  const i = tabs.findIndex((t) => t.id === base.id);
  const next = tabs[(Math.max(0, i) + dir + tabs.length) % tabs.length];
  await activateTab(next);
  return ok({ tabId: next.id, title: next.title || '' });
}

// ---------- command dispatcher ----------
async function handle(cmd, rawArgs, senderTab) {
  if (!COMMANDS.includes(cmd)) return err('bad-command', 'Unknown command');
  const args = cleanArgs(cmd, rawArgs); if (!args) return err('bad-command', 'Bad arguments');
  try {
    if (cmd === 'focusSpindro') {
      const ids = await spindroTabIds(); const id = senderTab && ids.includes(senderTab.id) ? senderTab.id : (senderTab ? senderTab.id : ids[0]);
      const t = id != null ? await chrome.tabs.get(id).catch(() => null) : null;
      if (!t) return err('no-target', 'No Spindro tab'); await activateTab(t); return ok({ tabId: t.id });
    }
    const target = await findTarget();
    if (cmd === 'nextTab' || cmd === 'prevTab') return cycleTab(cmd === 'nextTab' ? 1 : -1, target, senderTab);
    if (!target) return err('no-target', 'No tab to control: open a video page in another tab');
    if (cmd === 'focusTarget') { await activateTab(target); return ok({ tabId: target.id }); }
    if (cmd === 'back') { try { await chrome.tabs.goBack(target.id); return ok(); } catch { return err('not-supported', 'No page to go back to'); } }

    if (!isWebUrl(target.url || '')) return err('unsupported-page', 'This page cannot be controlled (browser or extension page)', { url: (target.url || '').split(/[?#]/)[0] });
    const origin = originPattern(target.url);
    if (!(await chrome.permissions.contains({ origins: [origin] }))) return err('permission-missing', 'Spindro Remote has no access to this site yet: allow it from the extension popup', { origin: origin.replace('/*', '') });
    const adapter = await adapterFor(target);

    if (cmd === 'fullscreen') return await fullscreen(target, adapter);
    if (PAGE_COMMANDS.includes(cmd)) {
      await inject({ tabId: target.id }, CORE, 'ISOLATED');
      const r = await execIn({ tabId: target.id }, 'ISOLATED', adapter, cmd, args);
      return r.ok ? ok(r.data) : pageErr(r);
    }
    if (VIDEO_COMMANDS.includes(cmd)) {
      const r = await runVideo(target, adapter, cmd, args);
      if (r.ok) return ok(r.data);
      if ((r.code === 'no-player' || r.code === 'not-supported') && KEYS[cmd] && await isStrong()) { // strong mode: the site's own keyboard shortcut
        try { await trustedKey(target.id, KEYS[cmd]); return ok({ mode: 'strong-key' }); } catch { /* report the original error */ }
      }
      return pageErr(r);
    }
    return err('bad-command', 'Unknown command');
  } catch (e) { return fromThrow(e); }
}

// ---------- messages (bridge content script, popup) ----------
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !m || typeof m !== 'object') return false;
  const fromPage = !!sender.tab;
  (async () => {
    if (m.kind === 'hello' && fromPage) {
      if (m.register === true) await serial(async () => { const sp = await sget('spindro', {}); sp[sender.tab.id] = originOf(sender.tab.url); await chrome.storage.session.set({ spindro: sp }); });
      return { version: chrome.runtime.getManifest().version, protocol: VERSION, strong: await isStrong() };
    }
    if (m.kind === 'cmd' && fromPage) return handle(m.cmd, m.args, sender.tab);
    if (m.kind === 'status') return status();
    if (m.kind === 'strongChanged' && !fromPage) return { ok: true };
    return err('bad-command', 'Unknown message');
  })().then(reply, (e) => reply(err('internal', String(e?.message || e))));
  return true;
});
