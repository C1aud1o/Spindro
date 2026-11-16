// `npm run dev`: static server for local development. No build step: edit a file, reload the page.
// PORT=xxxx changes the port. Prints the direct links to every game with the demo rider.
import { readFileSync } from 'node:fs';
import { startServer } from './static-server.mjs';

const { url } = await startServer(Number(process.env.PORT) || 5173, process.env.HOST || '127.0.0.1');
const ids = [...readFileSync(new URL('../js/games/registry.js', import.meta.url), 'utf8').matchAll(/defineGame\(\{ id: '(\w+)'/g)].map((m) => m[1]);
console.log(`\n  Spindro dev server: ${url}/index.html\n`);
console.log('  Open a game directly with the simulated rider (no trainer needed):');
for (const id of ids) console.log(`    ${url}/index.html?game=${id}&demo=1`);
console.log('\n  Keys in demo mode: W/S power, R/F cadence, A/D (or arrows) = − / +.  Bot check: npm run game:check -- <id>\n');
