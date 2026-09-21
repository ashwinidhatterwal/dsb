import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const backend = fs.readFileSync('src/backend/ai-config.gs', 'utf8') + '\n' + fs.readFileSync('src/backend/ai-product.gs', 'utf8');
const auth = fs.readFileSync('src/backend/admin-auth.gs', 'utf8');
const html = fs.readFileSync('admin.html', 'utf8');
const client = fs.readFileSync('admin-ai.js', 'utf8');
const autofill = fs.readFileSync('admin-autofill.js', 'utf8');
const buildOrder = JSON.parse(fs.readFileSync('src/build-order.json', 'utf8'));

assert(buildOrder.backend.includes('src/backend/ai-product.gs'), 'AI backend source missing from build order');
assert(auth.includes("action === 'aiProductDraft'"), 'AI action is not dispatched');
assert(auth.includes("'aiProductDraft'"), 'AI permission is missing');
assert(html.includes('id="aiFillOpenBtn"') && html.includes('admin-ai.js'), 'AI admin UI is not wired');
assert(html.includes('id="aiRefUploadBtn"') && html.includes('id="aiReferencePreview"'), 'AI-only reference photo UI is missing');
assert(client.includes("action: 'aiProductDraft'"), 'AI client does not call backend action');
assert(client.includes('referenceUrls') && client.includes('aiReferenceUrls'), 'AI client does not send additional reference photos');
assert(client.includes('window.DSBAutofill.applyToForm') && client.includes('window.DSBAutofill.canonicalize'), 'AI draft does not apply through the shared autofill library');
assert(autofill.includes('applyToForm') && autofill.includes('tryParseInput'), 'Autofill parse/apply API is missing');
assert(!backend.includes('sk-'), 'Potential API key literal found in AI backend');
assert(backend.includes("secret_('AI_API_KEY'"), 'Generic AI API key is not read from Script Properties');
assert(backend.includes("secret_('AI_BASE_URL'"), 'AI base URL is not configurable');
assert(backend.includes("secret_('AI_MODEL'"), 'AI model is not configurable');
assert(backend.includes("secret_('AI_API_TYPE'"), 'AI API type is not configurable');
assert(backend.includes('callAiResponses_') && backend.includes('callAiChatCompletions_'), 'Both supported API adapters are required');
assert(backend.includes("store: false"), 'Responses request should explicitly disable storage');
assert(backend.includes('sanitizeAiReferenceUrls_'), 'AI backend reference photo sanitizer is missing');

const context = { console };
vm.createContext(context);
vm.runInContext(backend, context, { filename: 'ai-product.gs' });
const schema = context.aiProductSchema_();
assert.equal(schema.type, 'object');
assert.equal(schema.additionalProperties, false);
assert(schema.required.includes('draft') && schema.required.includes('warnings'));
assert(schema.properties.draft.required.includes('price'));
assert.deepEqual(Array.from(schema.properties.draft.properties.sizes.type), ['array', 'null']);

const cleaned = context.cleanAiDraft_({
  name: '  Brass Kada  ', price: 240, stockqty: 3.9, hasSizes: true,
  sizes: ['2.4', '2.6', '2.4'], tags: ['brass', ' kada '], stock: 'in stock', extra: 'ignore'
});
assert.equal(cleaned.name, 'Brass Kada');
assert.equal(cleaned.price, 240);
assert.equal(cleaned.stockqty, 3);
assert.equal(cleaned.hasSizes, true);
assert.deepEqual(Array.from(cleaned.sizes), ['2.4', '2.6']);
assert.equal(cleaned.extra, undefined);

const refs = Array.from(context.sanitizeAiReferenceUrls_(['http://bad', 'https://a.example/1.jpg', 'https://a.example/1.jpg', 'https://b.example/2.jpg']));
assert.deepEqual(refs, ['https://a.example/1.jpg', 'https://b.example/2.jpg']);
assert(context.aiProductPrompt_('note', { price: 240 }, 2).includes('Reference photos: 2.'));


assert.equal(context.aiEndpoint_('https://api.example.com/v1', 'responses'), 'https://api.example.com/v1/responses');
assert.equal(context.aiEndpoint_('https://api.example.com/v1', 'chat_completions'), 'https://api.example.com/v1/chat/completions');
assert.equal(context.aiEndpoint_('https://api.example.com/v1/chat/completions', 'chat_completions'), 'https://api.example.com/v1/chat/completions');
assert.equal(context.stripJsonFence_('```json\n{"ok":true}\n```'), '{"ok":true}');


assert(client.includes('aiOptimizedImageUrl') && client.includes('w_1280,c_limit'), 'AI image optimization is missing');
assert(client.includes('startProgress') && client.includes('elapsed'), 'Live AI elapsed-time progress is missing');
assert(client.includes('timeoutMs: 120000'), 'AI client timeout should be bounded');
assert(backend.includes("secret_('AI_IMAGE_DETAIL'"), 'AI image detail is not configurable');
assert(backend.includes("secret_('AI_MAX_OUTPUT_TOKENS'"), 'AI output token cap is not configurable');
assert(backend.includes('Math.min(5000'), 'AI output token ceiling should allow up to 5000 tokens'); // 5000-token ceiling
assert(backend.includes("payload.response_format = { type: 'json_object' }"), 'Non-Gemini chat-completions should retain compact JSON object mode');
assert(!backend.includes('max_tokens: 2200'), 'Old oversized chat token budget remains');

assert(backend.includes('aiGeminiInlineImageUrl_'), 'Gemini image URLs are not converted to inline data URLs');
const imageContext = { console, Utilities: { base64Encode: bytes => Buffer.from(bytes).toString('base64') }, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getBlob: () => ({ getBytes: () => [1,2,3], getContentType: () => 'image/jpeg' }) }) } };
vm.createContext(imageContext);
vm.runInContext(backend, imageContext, { filename: 'ai-product-image-test.gs' });
assert.equal(imageContext.aiGeminiInlineImageUrl_('data:image/png;base64,AA=='), 'data:image/png;base64,AA==');
assert.equal(imageContext.aiGeminiInlineImageUrl_('https://example.com/x.jpg'), 'data:image/jpeg;base64,AQID');



assert.equal(context.aiIsGeminiBaseUrl_('https://generativelanguage.googleapis.com/v1beta/openai'), true);
assert.equal(context.aiIsGeminiBaseUrl_('https://api.openai.com/v1'), false);
assert.equal(context.aiParseStructuredOutput_('{"draft":{"name":"A"},"warnings":[]}').draft.name, 'A');
assert.equal(context.aiParseStructuredOutput_('```json\n{"draft":{"name":"B"},"warnings":[]}\n```').draft.name, 'B');
assert.equal(context.aiParseStructuredOutput_('Here is the result:\n{"draft":{"name":"C"},"warnings":[]}\nDone.').draft.name, 'C');
assert.equal(context.aiParseStructuredOutput_('"{\\"draft\\":{\\"name\\":\\"D\\"},\\"warnings\\":[]}"').draft.name, 'D');
assert.equal(context.aiExtractBalancedJsonObject_('x {"a":"} still string","b":{"c":1}} y'), '{"a":"} still string","b":{"c":1}}');
assert(backend.includes("type: 'json_schema'") && backend.includes('config.isGemini'), 'Gemini should prefer JSON Schema structured output');
assert(backend.includes('reasoning_effort'), 'Gemini low reasoning-effort optimization is missing');


assert(html.includes('id="aiFillModel"') && html.includes('id="aiFillEffort"'), 'Product AI model/effort dropdowns are missing');
assert(client.includes('selectedReasoningEffort') && client.includes('reasoningEffort'), 'AI client does not send per-request reasoning effort');
assert.equal(context.sanitizeAiReasoningEffort_('LOW'), 'low');
assert.equal(context.sanitizeAiReasoningEffort_('medium'), 'medium');
assert.equal(context.sanitizeAiReasoningEffort_('high'), 'high');
assert.equal(context.sanitizeAiReasoningEffort_('extreme'), '');
assert(client.includes('selectedAiModelConfigId') && client.includes('modelConfigId'), 'AI client does not send the selected model configuration');
assert(backend.includes('aiConfiguredProvider_') && backend.includes('AI_CONNECTIONS_JSON_V1'), 'Multi-connection AI routing is missing');
assert(backend.includes('AI_CONN_KEY_'), 'AI connection keys must be stored separately from metadata');
assert(backend.includes('supportedEfforts'), 'Per-model effort capabilities are missing');
assert(backend.includes('compatibilityBadRequest'), 'Provider compatibility fallback is missing');

console.log('AI product autofill checks passed.');

assert(backend.includes("if (!config.isGemini && config.imageDetail) image.detail = config.imageDetail"), 'Gemini image payload must omit unsupported detail hint');
assert(backend.includes('compatibilityBadRequest'), 'HTTP 400 compatibility fallback is missing');

for (const value of [null, undefined, '', '  ', false]) {
  const unknown = context.cleanAiDraft_({price:value,mrp:value,costprice:value,stockqty:value});
  for (const key of ['price','mrp','costprice','stockqty']) assert.equal(unknown[key], undefined, `${key} must remain unknown`);
}
assert.equal(context.cleanAiDraft_({costprice:0}).costprice, 0);
console.log('Unknown numeric values remain unknown.');
