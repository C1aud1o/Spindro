// Icone a linea (viewBox 24, tratto = currentColor): stesso stile della riga dispositivi. Si usano come <svg class="ico-line">…</svg>.
const P = {
  play: '<path d="M8 5l11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  flag: '<path d="M5 21V4M5 5h13l-3 4 3 4H5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  trainer: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 3.5v4M12 16.5v4"/>',
  workouts: '<path d="M5 20v-8M12 20V5M19 20v-5"/>',
  games: '<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 10.5v4M6 12.5h4M16 11.5h.01M18 13.5h.01"/>',
  video: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M10 9.5l4.5 2.5-4.5 2.5z"/>',
  history: '<path d="M4 17l5-5 4 3 7-8M15 7h5v5"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  home: '<path d="M4 11l8-7 8 7M6 9.5V20h12V9.5"/>',
  controller: '<circle cx="12" cy="12" r="9.5"/><path d="M12 4.5v15M5.8 12h3.9M14.3 12h3.9M16.25 10v4"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  soundOn: '<path d="M4 10v4h4l5 4V6l-5 4zM16.5 9a4 4 0 0 1 0 6"/>',
  soundOff: '<path d="M4 10v4h4l5 4V6l-5 4zM17 9.5l4 5M21 9.5l-4 5"/>',
  exit: '<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};
export const icon = (name, cls = 'ico-line') => (P[name] ? `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name]}</svg>` : '');
