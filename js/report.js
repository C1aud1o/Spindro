// Reports ("Report a problem", "Report your trainer", "Report this device"). With an address in js/config.js (REPORT_EMAIL) the app opens
// the person's own mail program with the message ready: they only write what happened, nobody needs a GitHub account, and their reply
// address comes with the e-mail. Without an address (forks) it is a pre-filled GitHub issue with the template
// .github/ISSUE_TEMPLATE/trainer_compatibility.yml. No server either way. The details are only: the Bluetooth name of the device
// (e.g. "Tacx Flux"), its services, the protocol, the control features, the platform, the app version and the last connection steps.
export const REPO = 'C1aud1o/Spindro';
export const TEMPLATE = 'trainer_compatibility.yml';

// Le opzioni del campo "platform" nel template devono coincidere esattamente con queste.
export function platformOption({ native, android }) {
  if (native) return 'Android app';
  return android ? 'Web app (Chrome or another Chromium browser on Android)' : 'Web app (Chrome on desktop)';
}

/** The details the app adds by itself (device, protocol, platform, version). Never anything the person did not see on their own screen. */
export function reportLines({ name = '', services = [], protocol = '', features = null, native = false, version = '', lang = '', extra = [] } = {}) {
  const yn = (v) => (v ? 'yes' : 'no');
  const lines = [];
  lines.push(`BLE name: ${name || 'not connected'}`);
  lines.push(`BLE services: ${services.length ? services.join(', ') : 'unknown'}`);
  lines.push(`Protocol used: ${protocol || 'unknown'}`);
  if (features) lines.push(`ERG (target power) available: ${yn(features.power)}`, `Gradient (simulation) available: ${yn(features.simulation)}`, `Resistance control available: ${yn(features.resistance)}`);
  lines.push(`Platform: ${native ? 'Android app' : 'Web'}`, `App version: ${version}`);
  if (lang) lines.push(`Language: ${lang}`);
  return [...lines, ...extra.filter(Boolean)];
}
const titleOf = (kind, name) => (kind === 'device' ? `[Device] ${name || 'Unknown device'}` : kind === 'problem' ? '[Problem] Report from Spindro' : `[Trainer] ${name || 'My trainer'}`);

/** A ready e-mail: the person writes what happened at the top, the details are below a line. Returns { url, text }: `url` is the mailto: link,
 *  `text` the same message as plain text (for "Copy the report" when no mail program opens). Some mail programs refuse very long links:
 *  lines are dropped from the END of the automatic part (the least important last) until the link fits. */
export function buildMail({ to, subject, intro = 'Write here what happened:', autoLabel = 'Details added by the app', lines = [], max = 1900 }) {
  const head = `${intro}\n\n\n\n--- ${autoLabel} ---\n`;
  const make = (ls, cut) => `${head}${ls.join('\n')}${cut ? '\n…' : ''}`;
  const link = (body) => `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const ls = [...lines]; let body = make(ls, false);
  while (link(body).length > max && ls.length > 3) { ls.pop(); body = make(ls, true); }
  return { url: link(body), text: `To: ${to}\nSubject: ${subject}\n\n${make(lines, false)}` };
}

/** Where a report goes. With `email` (js/config.js REPORT_EMAIL): an e-mail in the person's own mail program. Without: a pre-filled GitHub issue. */
export function buildReportUrl({ name = '', services = [], protocol = '', features = null, kind = 'trainer', native = false, android = false, version = '', lang = '', email = '', intro, autoLabel, extra = [] } = {}) {
  const lines = reportLines({ name, services, protocol, features, native, version, lang, extra: email ? extra : [] });
  if (email) return buildMail({ to: email, subject: titleOf(kind, name), intro, autoLabel, lines }).url;
  const q = new URLSearchParams({
    template: TEMPLATE,
    title: titleOf(kind, name),
    model: name,
    platform: platformOption({ native, android }),
    details: [...lines, '', 'What works and what does not:', ''].join('\n'),
  });
  return `https://github.com/${REPO}/issues/new?${q.toString().replace(/\+/g, '%20')}`;
}
