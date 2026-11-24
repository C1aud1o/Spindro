window.__msgs = []; const pending = new Map(); let n = 0; let helloWaiter = null;
window.addEventListener('message', (e) => {
  const d = e.data; if (e.source !== window || !d || d.ns !== 'spindro-remote' || d.from !== 'ext') return;
  window.__msgs.push(d);
  if (d.type === 'hello' && helloWaiter) { helloWaiter(d); helloWaiter = null; }
  if (d.type === 'result' && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
});
window.__hello = () => new Promise((res) => { helloWaiter = res; window.postMessage({ ns: 'spindro-remote', v: 1, from: 'app', type: 'hello' }, location.origin); });
window.__send = (type, body, timeout = 8000) => new Promise((res, rej) => {
  const id = `t${++n}`; pending.set(id, res);
  window.postMessage({ ns: 'spindro-remote', v: 1, from: 'app', type, id, ...body }, location.origin);
  setTimeout(() => { if (pending.delete(id)) rej(new Error(`no result for ${type} ${JSON.stringify(body)}`)); }, timeout);
});
// raw post for validation tests
window.__raw = (msg, origin = location.origin) => window.postMessage(msg, origin);
