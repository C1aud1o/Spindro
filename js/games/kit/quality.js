// Qualità grafica a 3 livelli. In automatico si misura il frame rate dei primi secondi di gioco
// e si scende di livello se il telefono fatica. Si può fissare in Impostazioni.
// Bagliore (bloom): soglia ALTA e forza BASSA su ogni livello. Solo il livello alto lo accende; gli altri portano gli stessi valori,
// così un bagliore acceso a mano (o un livello futuro) resta opaco e non diventa un alone al neon. Le luci vere (lampioni, vampate)
// sfiorano la soglia; personaggi, raccolti e superfici illuminate non la raggiungono mai (sotto 1.0 nello spazio lineare).
const BLOOM_SOFT = { bloomThreshold: 2.2, bloomStrength: 0.1, bloomRadius: 0.12 };
export const LEVELS = {
  high: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, bloom: true, ...BLOOM_SOFT, density: 1, crowd: 1 },
  medium: { pixelRatio: 1.0, shadows: true, shadowMap: 512, bloom: false, ...BLOOM_SOFT, density: 0.7, crowd: 0.6 },
  low: { pixelRatio: 0.75, shadows: false, shadowMap: 256, bloom: false, ...BLOOM_SOFT, density: 0.4, crowd: 0.3 },
};
const ORDER = ['high', 'medium', 'low'];

export const qualitySetting = {
  get value() { try { return localStorage.getItem('gameQuality') || 'auto'; } catch { return 'auto'; } },
  set value(v) { try { localStorage.setItem('gameQuality', v); } catch { /* niente storage */ } },
};
const remembered = () => { try { return localStorage.getItem('gameQualityAuto'); } catch { return null; } };
const remember = (v) => { try { localStorage.setItem('gameQualityAuto', v); } catch { /* niente storage */ } try { window.dispatchEvent(new Event('spindro:quality')); } catch { /* niente finestra */ } }; // js/glass.js: "low" accende i pannelli pieni (Riduci la trasparenza, automatico)

export class Quality {
  constructor() {
    const v = qualitySetting.value;
    this.auto = v === 'auto';
    // in automatico si riparte dall'ultimo livello che ha retto (al primo avvio: alto)
    this.level = this.auto ? (LEVELS[remembered()] ? remembered() : 'high') : (LEVELS[v] ? v : 'high');
    this.listeners = [];
    this.samples = []; this.warm = 0; this.decided = !this.auto;
  }
  get cfg() { return LEVELS[this.level]; }
  onChange(fn) { this.listeners.push(fn); }
  set(level) {
    if (!LEVELS[level] || level === this.level) return;
    this.level = level;
    this.listeners.forEach((fn) => fn(this.cfg, level));
  }
  // chiamata a ogni fotogramma con il tempo reale trascorso (s)
  sample(realDt) {
    if (this.decided) return;
    this.warm += realDt;
    if (this.warm < 1.2) return; // compilazione shader e primi caricamenti non contano
    this.samples.push(realDt);
    const total = this.samples.reduce((a, b) => a + b, 0);
    if (total < 2.5) return;
    const fps = this.samples.length / total;
    this.lastFps = fps;
    const i = ORDER.indexOf(this.level);
    if (fps < 28 && i < 2) this.set(ORDER[Math.min(2, i + 2)]);
    else if (fps < 48 && i < 2) this.set(ORDER[i + 1]);
    else { this.decided = true; remember(this.level); return; }
    // nuovo livello: si misura di nuovo
    this.samples = []; this.warm = 0.6;
    if (this.level === 'low') { this.decided = true; remember('low'); }
  }
}
