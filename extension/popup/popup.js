// Spindro Remote popup. No inline script (extension CSP). Talks to the service worker for status; permissions and storage directly.
const $ = (id) => document.getElementById(id);
const msg = (k, subs) => chrome.i18n.getMessage(k, subs) || k;
document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = msg(el.dataset.i18n); });
const show = (id, text) => { const el = $(id); el.textContent = text || ''; el.hidden = !text; };

const manifestHosts = chrome.runtime.getManifest().host_permissions || [];
let target = null;

async function refresh() {
  const r = await chrome.runtime.sendMessage({ kind: 'status' });
  const d = r?.data || {};
  target = d.target || null;
  $('conn').textContent = d.spindroTabs ? msg('connOn', [String(d.spindroTabs)]) : msg('connOff');
  $('conn').classList.toggle('on', !!d.spindroTabs);
  $('connHint').hidden = !!d.spindroTabs;
  $('target').textContent = target ? `${target.title || target.host} (${target.host})` : msg('targetNone');
  $('target').classList.toggle('on', !!target);
  const { pinnedTabId } = await chrome.storage.local.get('pinnedTabId');
  const pinned = target && pinnedTabId === target.tabId;
  $('pin').hidden = !target || pinned; $('unpin').hidden = !pinned;
  show('targetMsg', pinned ? msg('pinnedNote') : '');
  $('strong').checked = !!d.strong;
  await renderSites();
}

async function renderSites() {
  const all = await chrome.permissions.getAll();
  const fixed = new Set(manifestHosts);
  const extra = (all.origins || []).filter((o) => !fixed.has(o));
  $('builtin').innerHTML = '';
  for (const h of ['spindro.fit', 'youtube.com', 'netflix.com']) { const li = document.createElement('li'); li.className = 'fixed'; li.textContent = h; $('builtin').append(li); }
  $('sites').innerHTML = '';
  for (const o of extra) {
    const li = document.createElement('li'); const s = document.createElement('span'); s.textContent = o.replace(/\/\*$/, '').replace(/^\*:\/\//, '');
    const b = document.createElement('button'); b.type = 'button'; b.textContent = msg('removeBtn');
    b.addEventListener('click', async () => { await chrome.permissions.remove({ origins: [o] }); refresh(); });
    li.append(s, b); $('sites').append(li);
  }
  $('sitesNone').hidden = extra.length > 0;
  const web = !!target && !!target.host;
  $('addSite').disabled = !target || !web;
}

$('pin').addEventListener('click', async () => { if (target) { await chrome.storage.local.set({ pinnedTabId: target.tabId }); refresh(); } });
$('unpin').addEventListener('click', async () => { await chrome.storage.local.remove('pinnedTabId'); refresh(); });

$('addSite').addEventListener('click', async () => {
  if (!target) return;
  const tab = await chrome.tabs.get(target.tabId).catch(() => null);
  if (!tab || !/^https?:/.test(tab.url || '')) { show('addMsg', msg('addBad')); return; }
  const u = new URL(tab.url);
  const pattern = `${u.protocol}//${u.hostname}/*`;
  // must run straight from the click: the permission prompt needs the user gesture
  const granted = await chrome.permissions.request({ origins: [pattern] }).catch(() => false);
  show('addMsg', granted ? msg('addOk', [u.hostname]) : msg('addDenied'));
  refresh();
});

$('strong').addEventListener('change', async () => {
  const want = $('strong').checked;
  if (want) {
    const granted = await chrome.permissions.request({ permissions: ['debugger'] }).catch(() => false);
    await chrome.storage.local.set({ strong: granted });
    show('strongMsg', granted ? msg('strongOnNote') : msg('strongDenied'));
  } else {
    await chrome.storage.local.set({ strong: false });
    await chrome.permissions.remove({ permissions: ['debugger'] }).catch(() => {});
    show('strongMsg', '');
  }
  refresh();
});

refresh();
