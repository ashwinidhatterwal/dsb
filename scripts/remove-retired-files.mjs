// Run after extracting this complete source over an older checkout, before git add.
// Only retired source/docs/tests listed by this release are removed. No store data is touched.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const retired=JSON.parse(fs.readFileSync(path.join(root,'scripts/retired-customer-files.json'),'utf8'));
let removed=0;
for(const relative of retired){
  const file=path.resolve(root,relative);
  if(!file.startsWith(root) || path.isAbsolute(relative))throw new Error('Invalid retired source path');
  if(!fs.existsSync(file))continue;
  const stat=fs.lstatSync(file);
  if(!stat.isFile() && !stat.isSymbolicLink())throw new Error('Expected a retired source file: '+relative);
  fs.unlinkSync(file);removed++;console.log('Removed '+relative);
}
console.log(`Ready: ${removed} retired source files removed. Use git add -A to record deletions.`);
