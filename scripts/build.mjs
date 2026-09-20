import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'src/build-order.json'), 'utf8'));
const check = process.argv.includes('--check');

async function readSources(files) {
  if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length) throw new Error('Invalid build order');
  const parts = [];
  for (const file of files) {
    const resolved = path.resolve(root, file);
    if (!resolved.startsWith(path.join(root, 'src') + path.sep)) throw new Error(`Invalid source: ${file}`);
    parts.push(await fs.readFile(resolved, 'utf8'));
  }
  return parts;
}

async function writeOrVerify(output, content, label) {
  const target = path.join(root, output);
  if (check) {
    if (await fs.readFile(target, 'utf8') !== content) throw new Error(`${output} differs from its source. Run node scripts/build.mjs and commit the result.`);
  } else {
    await fs.writeFile(target, content);
  }
  console.log(`${check ? 'Verified' : 'Built'} ${output} from ${label}.`);
}

const backendParts = await readSources(manifest.backend);
const backend = backendParts.join('\n');
new vm.Script(backend, { filename: 'code.gs' });
await writeOrVerify('code.gs', backend, `${manifest.backend.length} source files`);

const styleParts = await readSources(manifest.styles);
await writeOrVerify('style.css', styleParts.join(''), `${manifest.styles.length} source files`);

const chatParts = await readSources(manifest.adminChat);
const adminChat = `/* Generated from src/admin-ai/*.js. Edit source fragments, not this file. */\n(() => {\n  'use strict';\n${chatParts.map(part => part.split('\n').map(line => line ? '  ' + line : '').join('\n')).join('\n')}\n})();\n`;
new vm.Script(adminChat, { filename: 'admin-chat.js' });
await writeOrVerify('admin-chat.js', adminChat, `${manifest.adminChat.length} source fragments`);
