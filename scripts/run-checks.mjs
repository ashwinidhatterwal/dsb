import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const checks = fs.readdirSync(new URL('.', import.meta.url)).filter(name => /^check.*\.mjs$/.test(name)).sort();
for (const args of [['scripts/build.mjs','--check'], ...checks.map(name => ['scripts/'+name])]) {
  const result = spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${args[0]} stopped by ${result.signal}`);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`PASS: build consistency and all ${checks.length} regression programs.`);
