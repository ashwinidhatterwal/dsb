/* AI product draft generation. Bundled into code.gs by scripts/build.mjs.
 * Provider/model selection is controlled by Apps Script Script Properties.
 * Secrets stay server-side and are never sent to the browser.
 *
 * Preferred properties:
 *   AI_API_KEY   - provider API key
 *   AI_BASE_URL  - e.g. https://api.openai.com/v1 or another OpenAI-compatible base
 *   AI_MODEL     - provider model id
 *   AI_API_TYPE  - responses | chat_completions
 *
 * Backward compatibility: OPENAI_API_KEY and OPENAI_MODEL are still accepted.
 */
function generateAiProductDraft_(body, actor) {
  const startedAt = Date.now();
  const config = aiProviderConfig_();
  const requestedReasoningEffort = sanitizeAiReasoningEffort_(body && body.reasoningEffort);
  if (requestedReasoningEffort) config.reasoningEffort = requestedReasoningEffort;
  rateLimit_('ai-product:' + String(actor && actor.name || 'admin'), 30, 3600);

  const imageUrl = String(body.imageUrl || '').trim();
  const referenceUrls = sanitizeAiReferenceUrls_(body.referenceUrls || []);
  const notes = String(body.notes || '').trim().slice(0, 3500);
  const existing = sanitizeAiExisting_(body.existing || {});
  if (!imageUrl && !referenceUrls.length && !notes && !Object.keys(existing).length) {
    throw new Error('Add a product photo, AI-only reference photo, notes, or some existing product details first.');
  }
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw new Error('The product image must be an HTTPS URL.');

  const prompt = aiProductPrompt_(notes, existing, referenceUrls.length);
  const imageUrls = [];
  if (imageUrl) imageUrls.push(imageUrl);
  referenceUrls.forEach(function(url) { imageUrls.push(url); });

  const result = config.apiType === 'chat_completions'
    ? callAiChatCompletions_(config, prompt, imageUrls)
    : callAiResponses_(config, prompt, imageUrls);

  const parsed = aiParseStructuredOutput_(result.outputText);

  const draft = cleanAiDraft_(parsed.draft || {});
  if (!Object.keys(draft).length) throw new Error('AI could not confidently fill any supported product fields. Add a little more information and try again.');
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.map(x => String(x || '').trim()).filter(Boolean).slice(0, 8) : [];

  return {
    success: true,
    draft: draft,
    warnings: warnings,
    model: config.model,
    provider: config.providerLabel,
    apiType: config.apiType,
    reasoningEffort: config.reasoningEffort || '',
    elapsedMs: Math.max(0, Date.now() - startedAt)
  };
}

function sanitizeAiReasoningEffort_(value) {
  const effort = String(value || '').trim().toLowerCase();
  return /^(low|medium|high)$/.test(effort) ? effort : '';
}

function aiProviderConfig_() {
  const apiKey = String(secret_('AI_API_KEY', secret_('OPENAI_API_KEY', '')) || '').trim();
  if (!apiKey) throw new Error('AI autofill is not configured. Add AI_API_KEY (or OPENAI_API_KEY) in Apps Script > Project settings > Script properties.');

  const baseUrl = String(secret_('AI_BASE_URL', 'https://api.openai.com/v1') || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('AI_BASE_URL must be an HTTPS URL.');

  const model = String(secret_('AI_MODEL', secret_('OPENAI_MODEL', 'gpt-5.6-luna')) || '').trim();
  if (!model) throw new Error('AI_MODEL is empty. Set a model id in Apps Script Script Properties.');

  let apiType = String(secret_('AI_API_TYPE', 'responses') || '').trim().toLowerCase().replace(/[ -]+/g, '_');
  if (['chat', 'chat_completion', 'chatcompletion', 'chat_completions'].includes(apiType)) apiType = 'chat_completions';
  if (['response', 'responses'].includes(apiType)) apiType = 'responses';
  if (!['responses', 'chat_completions'].includes(apiType)) throw new Error('AI_API_TYPE must be "responses" or "chat_completions".');

  const detailRaw = String(secret_('AI_IMAGE_DETAIL', 'low') || 'low').trim().toLowerCase();
  const imageDetail = /^(low|high|auto)$/.test(detailRaw) ? detailRaw : 'low';
  const tokenRaw = Number(secret_('AI_MAX_OUTPUT_TOKENS', '5000'));
  const maxOutputTokens = Number.isFinite(tokenRaw) ? Math.max(700, Math.min(5000, Math.floor(tokenRaw))) : 5000;
  const endpoint = aiEndpoint_(baseUrl, apiType);
  const isGemini = aiIsGeminiBaseUrl_(baseUrl);
  const reasoningRaw = String(secret_('AI_REASONING_EFFORT', isGemini ? 'low' : '') || '').trim().toLowerCase();
  const reasoningEffort = /^(none|minimal|low|medium|high)$/.test(reasoningRaw) ? reasoningRaw : '';
  return {
    apiKey: apiKey,
    baseUrl: baseUrl,
    endpoint: endpoint,
    model: model,
    apiType: apiType,
    providerLabel: aiProviderLabel_(baseUrl),
    imageDetail: imageDetail,
    maxOutputTokens: maxOutputTokens,
    isGemini: isGemini,
    reasoningEffort: reasoningEffort
  };
}

function aiEndpoint_(baseUrl, apiType) {
  if (/\/(responses|chat\/completions)$/i.test(baseUrl)) return baseUrl;
  return baseUrl + (apiType === 'chat_completions' ? '/chat/completions' : '/responses');
}

function aiIsGeminiBaseUrl_(baseUrl) {
  return /(^|\.)generativelanguage\.googleapis\.com$/i.test(aiProviderLabel_(baseUrl));
}

function aiProviderLabel_(baseUrl) {
  try { return String(baseUrl).replace(/^https?:\/\//i, '').split('/')[0].slice(0, 100); }
  catch (_) { return 'configured provider'; }
}

function aiRequestHeaders_(config) {
  return { Authorization: 'Bearer ' + config.apiKey };
}

function callAiResponses_(config, prompt, imageUrls) {
  const content = [{ type: 'input_text', text: prompt }];
  imageUrls.forEach(function(url) {
    content.push({ type: 'input_image', detail: config.imageDetail, image_url: url });
  });
  const payload = {
    model: config.model,
    store: false,
    max_output_tokens: config.maxOutputTokens,
    input: [{ role: 'user', content: content }],
    text: { format: { type: 'json_schema', name: 'dsb_product_draft', strict: true, schema: aiProductSchema_() } }
  };
  const data = aiFetchJson_(config, payload);
  const outputText = extractOpenAiOutputText_(data);
  if (!outputText) throw new Error('AI generation returned no product draft.');
  return { outputText: outputText };
}

function callAiChatCompletions_(config, prompt, imageUrls) {
  const content = [{ type: 'text', text: prompt + '\n\nReturn exactly one JSON object with keys "draft" and "warnings". No markdown or commentary.' }];
  imageUrls.forEach(function(url) {
    // Gemini's OpenAI-compatible vision examples use inline data URLs. Convert
    // the already-compressed AI-only Cloudinary derivative server-side so the
    // provider receives the documented image transport. Other providers keep
    // normal HTTPS image URLs and may use the optional detail hint.
    const imageUrl = config.isGemini ? aiGeminiInlineImageUrl_(url) : url;
    const image = { url: imageUrl };
    if (!config.isGemini && config.imageDetail) image.detail = config.imageDetail;
    content.push({ type: 'image_url', image_url: image });
  });

  const payload = {
    model: config.model,
    messages: [{ role: 'user', content: content }],
    max_tokens: config.maxOutputTokens
  };

  // Gemini's OpenAI-compatible endpoint supports JSON Schema structured
  // output. Prefer it there because it prevents malformed/truncated envelopes.
  // Other compatible providers stay on the smaller json_object mode.
  const schemaMode = config.isGemini ? 'json-schema' : 'json-object';
  if (config.isGemini) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'dsb_product_draft',
        strict: true,
        schema: aiProductSchema_()
      }
    };
    if (config.reasoningEffort) payload.reasoning_effort = config.reasoningEffort;
  } else {
    payload.response_format = { type: 'json_object' };
  }

  const cache = CacheService.getScriptCache();
  const key = aiCapabilityKey_(config, schemaMode);
  const structuredUnsupported = cache.get(key) === 'unsupported';
  if (structuredUnsupported) delete payload.response_format;

  let data;
  try {
    data = aiFetchJson_(config, payload);
  } catch (err) {
    const message = String(err && err.message || '');
    const structuredProblem = /response_format|json_object|json_schema|schema|unsupported|unknown parameter|invalid parameter/i.test(message);
    const geminiBadRequest = config.isGemini && /HTTP\s*400|INVALID_ARGUMENT|bad request/i.test(message);
    if (structuredUnsupported || (!structuredProblem && !geminiBadRequest)) throw err;

    // Compatibility fallback: retry once with the smallest documented Gemini/OpenAI
    // payload. This avoids trapping users on a model-specific 400 while keeping the
    // normal path fast. Prompt instructions still require JSON and cleanAiDraft_
    // remains the authoritative server-side validator.
    cache.put(key, 'unsupported', 21600);
    delete payload.response_format;
    if (config.isGemini) delete payload.reasoning_effort;
    data = aiFetchJson_(config, payload);
  }

  const finishReason = aiChatFinishReason_(data);
  const outputText = extractChatCompletionText_(data);
  if (!outputText) throw new Error('AI generation returned no product draft.');
  if (/length|max_tokens|max_output_tokens/i.test(finishReason)) {
    throw new Error('AI response was cut off before the product draft finished. Increase AI_MAX_OUTPUT_TOKENS (up to 5000) or use shorter notes.');
  }
  return { outputText: outputText };
}

function aiChatFinishReason_(data) {
  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
  return String(choice && (choice.finish_reason || choice.finishReason) || '');
}


function aiGeminiInlineImageUrl_(url) {
  const value = String(url || '').trim();
  if (!value) return value;
  if (/^data:image\//i.test(value)) return value;
  if (!/^https:\/\//i.test(value)) throw new Error('Gemini image input must be an HTTPS image URL.');

  let response;
  try {
    response = UrlFetchApp.fetch(value, {
      method: 'get',
      followRedirects: true,
      muteHttpExceptions: true,
      headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png,image/*' }
    });
  } catch (err) {
    throw new Error('Could not prepare the product photo for Gemini: ' + String(err && err.message || err).slice(0, 220));
  }
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('Could not fetch the product photo for Gemini (HTTP ' + status + ').');

  const blob = response.getBlob();
  const bytes = blob.getBytes();
  // Keep the Apps Script request comfortably below provider/body limits. The
  // browser already requests a compressed Cloudinary derivative, so exceeding
  // this usually indicates an unexpected host response rather than a real image.
  if (!bytes || !bytes.length) throw new Error('The product photo fetched for Gemini was empty.');
  if (bytes.length > 5 * 1024 * 1024) throw new Error('The AI product photo is still too large. Re-upload it or use a smaller image.');

  let mime = String(blob.getContentType() || '').toLowerCase();
  if (!/^image\/(?:jpeg|jpg|png|webp|gif|avif)$/.test(mime)) {
    // Cloudinary can occasionally omit the content type through a proxy. JPEG
    // is a safe fallback for transformed storefront photos used by this shop.
    mime = 'image/jpeg';
  }
  if (mime === 'image/jpg') mime = 'image/jpeg';
  return 'data:' + mime + ';base64,' + Utilities.base64Encode(bytes);
}

function aiCapabilityKey_(config, feature) {
  return 'ai-cap:' + Utilities.base64EncodeWebSafe(feature + '|' + config.endpoint + '|' + config.model).slice(0, 150);
}

function aiFetchJson_(config, payload) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: aiRequestHeaders_(config),
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  let response;
  try {
    response = UrlFetchApp.fetch(config.endpoint, options);
  } catch (err) {
    throw new Error('AI provider connection failed: ' + String(err && err.message || err).slice(0, 300));
  }
  let status = response.getResponseCode();

  // One short retry only for temporary gateway/service failures. Do not retry
  // quota, authentication, invalid model, or rate-limit errors.
  if (status === 502 || status === 503 || status === 504) {
    Utilities.sleep(300);
    response = UrlFetchApp.fetch(config.endpoint, options);
    status = response.getResponseCode();
  }

  const raw = response.getContentText();
  let data;
  try { data = JSON.parse(raw); }
  catch (_) { throw new Error('AI provider returned an unreadable response (HTTP ' + status + ').'); }
  if (status < 200 || status >= 300) {
    const message = aiProviderErrorMessage_(data) || ('HTTP ' + status);
    throw new Error('AI generation failed: ' + message.slice(0, 400));
  }
  return data;
}

function aiProviderErrorMessage_(data) {
  if (!data) return '';
  if (data.error && typeof data.error.message === 'string') return data.error.message;
  if (typeof data.message === 'string') return data.message;
  if (data.error && typeof data.error === 'string') return data.error;
  // Some compatibility gateways nest useful validation details. Surface a short,
  // sanitized representation so the admin sees the real cause instead of HTTP 400.
  try {
    const candidate = data.error || data;
    const text = JSON.stringify(candidate);
    return text && text !== '{}' ? text.slice(0, 350) : '';
  } catch (_) {
    return '';
  }
}

function extractChatCompletionText_(data) {
  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
  const content = choice && choice.message ? choice.message.content : '';
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map(function(part) {
      if (!part) return '';
      if (typeof part.text === 'string') return part.text;
      if (part.type === 'text' && typeof part.content === 'string') return part.content;
      return '';
    }).join('').trim();
  }
  return '';
}

function stripJsonFence_(text) {
  return String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}


function aiParseStructuredOutput_(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  let text = String(value || '').replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('AI generation returned empty structured data.');

  const candidates = [];
  function addCandidate(candidate) {
    candidate = String(candidate || '').trim();
    if (candidate && candidates.indexOf(candidate) === -1) candidates.push(candidate);
  }
  addCandidate(text);
  addCandidate(stripJsonFence_(text));

  // Some compatible APIs return the JSON object as a JSON-encoded string.
  try {
    const decoded = JSON.parse(text);
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) return decoded;
    if (typeof decoded === 'string') addCandidate(decoded);
  } catch (_) {}

  // Gemini and some proxies may wrap otherwise valid JSON in a short sentence.
  // Extract only a balanced top-level object; do not alter the JSON itself.
  for (let c = 0; c < candidates.length; c++) {
    const candidate = candidates[c];
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) {}
    const objectText = aiExtractBalancedJsonObject_(candidate);
    if (objectText) {
      try {
        const parsed = JSON.parse(objectText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (_) {}
    }
  }
  throw new Error('AI generation returned invalid structured data. Try again; if it repeats, set AI_MAX_OUTPUT_TOKENS up to 5000.');
}

function aiExtractBalancedJsonObject_(text) {
  const source = String(text || '');
  let start = -1, depth = 0, inString = false, escaped = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (start < 0) {
      if (ch === '{') { start = i; depth = 1; }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

function sanitizeAiReferenceUrls_(value) {
  const urls = Array.isArray(value) ? value : [];
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    const url = String(urls[i] || '').trim();
    if (!url || !/^https:\/\//i.test(url) || out.indexOf(url) !== -1) continue;
    out.push(url);
    if (out.length >= 5) break;
  }
  return out;
}

function sanitizeAiExisting_(source) {
  const allowed = ['name', 'namehindi', 'category', 'subcategory', 'price', 'mrp', 'costprice', 'description', 'stock', 'stockqty', 'brand', 'material', 'packsize', 'specifications', 'gtin', 'descriptionhindi', 'sizes', 'sizeprices', 'tags', 'hasSizes'];
  const out = {};
  allowed.forEach(key => {
    const value = source[key];
    if (value === null || value === undefined || value === '') return;
    if (Array.isArray(value)) out[key] = value.map(x => String(x).trim()).filter(Boolean).slice(0, 30);
    else if (typeof value === 'boolean' || typeof value === 'number') out[key] = value;
    else out[key] = String(value).trim().slice(0, 2000);
  });
  return out;
}

function aiProductPrompt_(notes, existing, referenceCount) {
  return [
    'Create a factual ecommerce product draft for Dhatterwal Suhag Bhandar (DSB).',
    'Images: first is main product; remaining are optional references. Infer only visually supported descriptive details.',
    'User notes and existing fields are authoritative. Never invent price/MRP/cost, stock quantity, GTIN, exact sizes, material, pack quantity, or brand unless supplied or clearly printed.',
    'You may infer name, category, subcategory, visible design/colour, concise English/Hindi descriptions, specifications, tags, and size-selection need when supported.',
    'Keep Hindi natural. Preserve bangle sizes exactly (2.4, 2.6, 2.8). sizeprices format: "2.4=240, 2.6=240" only when explicitly supplied.',
    'Return null for uncertainty. warnings must be short.',
    'Required draft keys: name,namehindi,category,subcategory,price,mrp,costprice,description,stock,stockqty,brand,material,packsize,specifications,gtin,descriptionhindi,sizes,hasSizes,sizeprices,tags.',
    'Output JSON shape: {"draft":{...all required keys...},"warnings":[]}.',
    referenceCount ? 'Reference photos: ' + referenceCount + '.' : 'Reference photos: none.',
    notes ? 'Notes: ' + notes : 'Notes: none.',
    Object.keys(existing).length ? 'Existing: ' + JSON.stringify(existing) : 'Existing: none.'
  ].join('\n');
}

function aiNullableString_() {
  return { type: ['string', 'null'] };
}
function aiNullableNumber_() {
  return { type: ['number', 'null'] };
}
function aiNullableBoolean_() {
  return { type: ['boolean', 'null'] };
}
function aiNullableStringArray_() {
  return { type: ['array', 'null'], items: { type: 'string' } };
}
function aiProductSchema_() {
  const properties = {
    name: aiNullableString_(),
    namehindi: aiNullableString_(),
    category: aiNullableString_(),
    subcategory: aiNullableString_(),
    price: aiNullableNumber_(),
    mrp: aiNullableNumber_(),
    costprice: aiNullableNumber_(),
    description: aiNullableString_(),
    stock: aiNullableString_(),
    stockqty: aiNullableNumber_(),
    brand: aiNullableString_(),
    material: aiNullableString_(),
    packsize: aiNullableString_(),
    specifications: aiNullableString_(),
    gtin: aiNullableString_(),
    descriptionhindi: aiNullableString_(),
    sizes: aiNullableStringArray_(),
    hasSizes: aiNullableBoolean_(),
    sizeprices: aiNullableString_(),
    tags: aiNullableStringArray_()
  };
  return {
    type: 'object',
    properties: {
      draft: {
        type: 'object',
        properties: properties,
        required: Object.keys(properties),
        additionalProperties: false
      },
      warnings: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['draft', 'warnings'],
    additionalProperties: false
  };
}

function extractOpenAiOutputText_(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const output = Array.isArray(data.output) ? data.output : [];
  for (let i = 0; i < output.length; i++) {
    const item = output[i];
    const content = item && Array.isArray(item.content) ? item.content : [];
    for (let j = 0; j < content.length; j++) {
      const part = content[j];
      if (part && part.type === 'output_text' && typeof part.text === 'string' && part.text.trim()) return part.text.trim();
    }
  }
  return '';
}

function cleanAiDraft_(draft) {
  const out = {};
  const stringFields = ['name', 'namehindi', 'category', 'subcategory', 'description', 'stock', 'brand', 'material', 'packsize', 'specifications', 'gtin', 'descriptionhindi', 'sizeprices'];
  stringFields.forEach(key => {
    if (typeof draft[key] !== 'string') return;
    const value = draft[key].trim();
    if (!value) return;
    out[key] = value.slice(0, key === 'description' || key === 'descriptionhindi' || key === 'specifications' ? 2000 : 1000);
  });
  ['price', 'mrp', 'costprice'].forEach(key => {
    const n = Number(draft[key]);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  });
  if (draft.stockqty !== null && draft.stockqty !== undefined && Number.isFinite(Number(draft.stockqty)) && Number(draft.stockqty) >= 0) out.stockqty = Math.floor(Number(draft.stockqty));
  if (typeof draft.hasSizes === 'boolean') out.hasSizes = draft.hasSizes;
  ['sizes', 'tags'].forEach(key => {
    if (!Array.isArray(draft[key])) return;
    const values = [...new Set(draft[key].map(x => String(x || '').trim()).filter(Boolean))].slice(0, 30);
    if (values.length) out[key] = values;
  });
  if (out.stock && !/^(in stock|out of stock)$/i.test(out.stock)) delete out.stock;
  return out;
}
