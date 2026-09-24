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

const customers = read('src/backend/customers.gs');
const cartCore = read('cart-ui-core.js');
assert(!customers.includes('customer.saved.delete') && !customers.includes('DELETE_SAVED_DETAILS'), 'Obsolete saved-details deletion endpoint returned');
assert(!cartCore.includes('goToTrackOrder') && !cartCore.includes('trackOrderUrl'), 'Unused cart tracking redirect helpers returned');
assert(fs.existsSync('CHANGELOG.md'), 'Consolidated changelog is missing');
for (const oldDoc of ['AUDIT-COMPLETION.md','PHASE-2-3-RELEASE.md','RELIABILITY-RELEASE.md','STAGE-3-RELEASE.md']) assert(!fs.existsSync(oldDoc), `Superseded release note still present: ${oldDoc}`);
assert(buildOrder.styles.includes('src/styles/theme-motion-and-overlays.css') && buildOrder.styles.includes('src/styles/order-lifecycle.css'), 'Semantic CSS module names missing from build order');
assert(maintenance.includes('Admin actions use short text labels by default'), 'Maintenance guidance should match labelled admin UI');
assert(!maintenance.includes('Symbol-first admin actions use'), 'Stale symbol-first guidance remains');
for (const [name, files] of Object.entries(buildOrder)) {
  assert.equal(files.length, new Set(files).size, `${name} build order contains duplicates`);
}
console.log('PASS: conservative cleanup, documentation and build-order checks.');
