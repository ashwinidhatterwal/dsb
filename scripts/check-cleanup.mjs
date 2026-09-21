import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = file => fs.readFileSync(file, 'utf8');
const cache = read('src/backend/cache.gs');
const checkout = read('src/backend/checkout.gs');
const bundle = read('code.gs');
const maintenance = read('MAINTENANCE.md');
const buildOrder = JSON.parse(read('src/build-order.json'));

assert(!cache.includes('invalidateDashboardCache_'), 'Unused dashboard-only cache helper returned');
assert(!checkout.includes('newOrderId_'), 'Unused legacy order ID helper returned');
assert(!bundle.includes('function invalidateDashboardCache_'), 'Generated backend still contains removed cache helper');
assert(!bundle.includes('function newOrderId_'), 'Generated backend still contains removed order ID helper');
assert(maintenance.includes('Admin actions use short text labels by default'), 'Maintenance guidance should match labelled admin UI');
assert(!maintenance.includes('Symbol-first admin actions use'), 'Stale symbol-first guidance remains');
for (const [name, files] of Object.entries(buildOrder)) {
  assert.equal(files.length, new Set(files).size, `${name} build order contains duplicates`);
}
console.log('PASS: conservative cleanup, documentation and build-order checks.');
