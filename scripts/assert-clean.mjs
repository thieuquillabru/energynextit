/**
 * Guard: `src/` must contain only TypeScript.
 *
 * A stray emitted .js next to a .tsx wins module resolution in Vite (js before
 * ts), which silently ships an old bundle. Fail the build if that happens.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src');
const offenders = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|jsx|map)$/.test(entry.name)) offenders.push(path.relative(process.cwd(), full));
  }
})(root);

if (offenders.length) {
  console.error('Found compiled JavaScript inside src/ — it would shadow the TypeScript sources:');
  for (const f of offenders) console.error(`  ${f}`);
  console.error('Delete these files (tsc must run with --noEmit).');
  process.exit(1);
}
