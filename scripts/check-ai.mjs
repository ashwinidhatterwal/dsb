import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const backend = fs.readFileSync(new URL('../src/backend/ai-product.gs', import.meta.url), 'utf8');
const auth = fs.readFileSync(new URL('../src/backend/admin-auth.gs', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../admin-ai.js', import.meta.url), 'utf8');
const buildOrder = JSON.parse(fs.readFileSync(new URL('../src/build-order.json', import.meta.url), 'utf8'));

assert(backend.includes("secret_('AI_API_KEY'"), 'AI_API_KEY must be server-side configurable');
assert(backend.includes("secret_('AI_BASE_URL'"), 'AI_BASE_URL must be configurable');
assert(backend.includes("secret_('AI_MODEL'"), 'AI_MODEL must be configurable');
assert(backend.includes("secret_('AI_API_TYPE'"), 'AI_API_TYPE must be configurable');
assert(backend.includes("secret_('AI_IMAGE_DETAIL'"), 'AI image detail must be configurable');
assert(backend.includes("secret_('AI_MAX_OUTPUT_TOKENS'"), 'AI output token cap must be configurable');
assert(backend.includes('callAiResponses_') && backend.includes('callAiChatCompletions_'), 'Responses and chat adapters must exist');
assert(backend.includes('429') && backend.includes('503') && backend.includes('Utilities.sleep'), 'Transient retry handling missing');
assert(backend.includes('CacheService.getScriptCache') && backend.includes("'unsupported'"), 'Schema capability cache missing');
assert(auth.includes("action === 'aiProductDraft'"), 'Admin AI dispatch missing');
assert(auth.includes("'aiProductDraft'"), 'AI permission missing');
assert(buildOrder.backend.includes('src/backend/ai-product.gs'), 'AI backend missing from build order');
assert(admin.includes('aiOptimizedImageUrl'), 'AI image optimization missing');
assert(admin.includes('w_1280,c_limit'), 'Cloudinary AI resize missing');
assert(admin.includes('timeoutMs:75000') || admin.includes('timeoutMs: 75000'), 'Optimized client timeout missing');

// Syntax-check browser and Apps Script sources without executing external APIs.
new vm.Script(backend, { filename: 'ai-product.gs' });
new vm.Script(admin, { filename: 'admin-ai.js' });

const context = vm.createContext({});
vm.runInContext(backend + '\nglobalThis.__endpoint = aiEndpoint_; globalThis.__strip = stripJsonFence_;', context);
assert.equal(context.__endpoint('https://api.example.com/v1', 'responses'), 'https://api.example.com/v1/responses');
assert.equal(context.__endpoint('https://api.example.com/v1', 'chat_completions'), 'https://api.example.com/v1/chat/completions');
assert.equal(context.__endpoint('https://api.example.com/v1/chat/completions', 'chat_completions'), 'https://api.example.com/v1/chat/completions');
assert.equal(context.__strip('```json\n{"ok":true}\n```'), '{"ok":true}');

console.log('AI product generation checks passed.');
