import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'src/build-order.json'), 'utf8'));
const check = process.argv.includes('--check');
for (const [key, output, separator] of [['backend', 'code.gs', '\n'], ['styles', 'style.css', '']]) {
  const files = manifest[key];
  if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length) {
    throw new Error(`Invalid ${key} build order`);
  }
  const parts = [];
  for (const file of files) {
    const resolved = path.resolve(root, file);
    if (!resolved.startsWith(path.join(root, 'src') + path.sep)) throw new Error(`Invalid source: ${file}`);
    parts.push(await fs.readFile(resolved, 'utf8'));
  }
  const content = parts.join(separator);
  if (key === 'backend') new vm.Script(content, { filename: output });
  const target = path.join(root, output);
  if (check) {
    if (await fs.readFile(target, 'utf8') !== content) {
      throw new Error(`${output} differs from its source. Run node scripts/build.mjs and commit the result.`);
    }
  } else {
    await fs.writeFile(target, content);
  }
  console.log(`${check ? 'Verified' : 'Built'} ${output} from ${files.length} source files.`);
}
