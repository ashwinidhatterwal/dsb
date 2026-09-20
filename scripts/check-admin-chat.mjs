import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const backend = fs.readFileSync('src/backend/ai-admin-chat.gs', 'utf8');
const auth = fs.readFileSync('src/backend/admin-auth.gs', 'utf8');
const html = fs.readFileSync('admin.html', 'utf8');
const client = fs.readFileSync('admin-chat.js', 'utf8');
const order = JSON.parse(fs.readFileSync('src/build-order.json', 'utf8'));

assert(order.backend.includes('src/backend/ai-admin-chat.gs'), 'Admin AI backend missing from build order');
assert(auth.includes("action === 'aiAdminChat'"), 'Admin AI chat action is not dispatched');
assert(auth.includes("'aiAdminChat'"), 'Admin AI chat permission missing');
assert(html.includes('id="adminAiOpen"') && html.includes('id="adminAiDrawer"') && html.includes('admin-chat.js'), 'Admin AI chat UI is not wired');
assert(client.includes('sessionStorage') && client.includes('dsb_admin_ai_chat_v1'), 'Session chat memory is missing');
assert(client.includes("action: 'aiAdminChat'"), 'Admin AI client does not call chat backend');
assert(client.includes('Confirm apply') && client.includes('applyProposal'), 'Confirmation-first action apply flow is missing');
assert(client.includes("action: 'update'") && client.includes("action: 'add'") && client.includes("action: 'updateOrderStatus'") && client.includes("action: 'archiveProduct'"), 'Expected admin action adapters are missing');
assert(!backend.includes('deleteProduct(') && !backend.includes('verifyPayment_('), 'AI chat must not directly perform destructive/payment actions');

const context = { console };
vm.createContext(context);
vm.runInContext(backend, context, { filename: 'ai-admin-chat.gs' });
const history = Array.from(context.sanitizeAiAdminHistory_([{role:'user',text:' hello '},{role:'assistant',text:' ok '},{role:'system',text:'no'}]));
assert.equal(history.length, 3);
assert.equal(history[0].text, 'hello');
assert.equal(history[2].role, 'user');
const patch = context.sanitizeAiAdminProductPatch_({name:' Test ',price:'220',stockqty:3.9,stock:'IN STOCK',evil:'x'});
assert.equal(patch.name, 'Test');
assert.equal(patch.price, 220);
assert.equal(patch.stockqty, 3);
assert.equal(patch.stock, 'in stock');
assert.equal(patch.evil, undefined);
console.log('Admin AI chat checks passed.');
