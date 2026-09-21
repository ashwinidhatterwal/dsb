import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = (await fs.readdir(root)).filter(x => x.endsWith('.html'));
for (const file of files) {
  const html = await fs.readFile(path.join(root,file),'utf8');
  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size, ids.length, `${file}: duplicate HTML id`);
  for (const match of html.matchAll(/<(?:script|link)[^>]+(?:src|href)=["']([^"']+)["']/g)) {
    let ref = match[1].split(/[?#]/)[0];
    if (!ref || /^(?:https?:|data:|mailto:|tel:|#)/.test(ref)) continue;
    if (ref.startsWith('/')) ref = ref.slice(1);
    try { await fs.access(path.join(root,ref)); } catch { throw new Error(`${file}: missing local asset ${ref}`); }
  }
}
for (const file of ['app.js','admin.js','product.js','admin-analytics.js']) {
  const js = await fs.readFile(path.join(root,file),'utf8');
  assert(!js.includes("behavior: 'instant'") && !js.includes("? 'instant' :"), `${file}: non-standard instant scroll behavior remains`);
}
console.log('PASS: HTML IDs/assets and standards-safe scroll behavior.');
