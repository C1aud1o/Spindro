// Beta web: /app/ (stabile) e /beta/ condividono l'origine, quindi anche il localStorage.
// Qui window.localStorage diventa una vista sulle chiavi con prefisso "beta:": un bug della beta non tocca i dati veri.
// Il vero Storage resta raggiungibile come window.__spindroStable, SOLO per l'azione "Copia i miei dati dall'app stabile".
(function () {
  var P = 'beta:';
  var real;
  try { real = window.localStorage; real.length; } catch (e) { return; } // storage bloccato: niente da isolare
  var mine = function () { var ks = []; for (var i = 0; i < real.length; i++) { var k = real.key(i); if (k && k.indexOf(P) === 0) ks.push(k.slice(P.length)); } return ks; };
  var api = {
    getItem: function (k) { return real.getItem(P + k); },
    setItem: function (k, v) { real.setItem(P + k, v); },
    removeItem: function (k) { real.removeItem(P + k); },
    clear: function () { mine().forEach(function (k) { real.removeItem(P + k); }); },
    key: function (i) { var ks = mine(); return i >= 0 && i < ks.length ? ks[i] : null; }
  };
  var proxy = new Proxy(api, {
    get: function (t, p) {
      if (p === 'length') return mine().length;
      if (p === Symbol.toStringTag) return 'Storage';
      if (typeof p === 'string' && Object.prototype.hasOwnProperty.call(t, p)) return t[p];
      if (typeof p === 'string') { var v = real.getItem(P + p); return v === null ? undefined : v; }
      return undefined;
    },
    set: function (t, p, v) { if (typeof p === 'string') real.setItem(P + p, String(v)); return true; },
    deleteProperty: function (t, p) { if (typeof p === 'string') real.removeItem(P + p); return true; },
    has: function (t, p) { return typeof p === 'string' && (p in t || real.getItem(P + p) !== null); },
    ownKeys: function () { return mine(); },
    getOwnPropertyDescriptor: function (t, p) { return typeof p === 'string' && real.getItem(P + p) !== null ? { value: real.getItem(P + p), writable: true, enumerable: true, configurable: true } : undefined; }
  });
  Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return proxy; } });
  Object.defineProperty(window, '__spindroStable', { value: { storage: real, prefix: P }, configurable: true });
})();
