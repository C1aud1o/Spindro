// Runs a short custom workout end to end on a fake clock: steps advance, targets reach the trainer, the end returns to free ride, no NaN anywhere.
import * as L from './lib.mjs';
const b = await L.launch();
const wk = { id: 'my-qa', name: 'QA 3 steps', tag: '0 min', desc: 'qa', custom: true, steps: [{ d: 10, p: 0.5, label: 'Warm' }, { d: 10, p: 1.0, label: 'Hard' }, { d: 10, p: 0.4, to: 0.6, label: 'Cool' }] };
const p = await L.newPage(b, { vp: 's390', lang: 'en', seed: { customWorkouts: [wk], ftp: '200' }, clock: true });
await L.connectTrainer(p);
await p.click('#openWorkouts'); await p.locator('[data-wk="my-qa"]').click();
const snap = () => p.evaluate(() => ({ step: document.getElementById('wkStep')?.textContent, left: document.getElementById('wkLeft')?.textContent, target: document.getElementById('wkTarget')?.textContent, name: document.getElementById('wkName')?.textContent, cls: document.body.className, power: document.getElementById('power').textContent, bad: /NaN|undefined|Infinity/.test(document.body.innerText) }));
const rows = [];
for (let i = 0; i < 9; i++) { await p.clock.runFor(4000); rows.push(JSON.stringify(await snap())); }
console.log(rows.join('\n'));
await p.waitForTimeout(300);
console.log('finish sheet:', await p.evaluate(() => !document.getElementById('finishSheet').hidden), '| toast:', await p.evaluate(() => document.getElementById('toast').textContent));
console.log('log:', p.qaLog.filter((l) => !/Service Worker/.test(l)));
await b.close();
