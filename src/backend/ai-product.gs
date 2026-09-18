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
  const config = aiProviderConfig_();
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

  let parsed;
  try {
    parsed = JSON.parse(result.outputText);
  } catch (_) {
    throw new Error('AI generation returned invalid structured data.');
  }

  const draft = cleanAiDraft_(parsed.draft || {});
  if (!Object.keys(draft).length) throw new Error('AI could not confidently fill any supported product fields. Add a little more information and try again.');
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.map(x => String(x || '').trim()).filter(Boolean).slice(0, 8) : [];

  return {
    success: true,
    draft: draft,
    warnings: warnings,
    model: config.model,
    provider: config.providerLabel,
    apiType: config.apiType
  };
}

function aiProviderConfig_() {
  const apiKey = String(secret_('AI_API_KEY', secret_('OPENAI_API_KEY', '')) || '').trim();
  if (!apiKey) throw new Error('AI autofill is not configured. Add AI_API_KEY (or OPENAI_API_KEY) in Apps Script > Project settings > Script properties.');

  let baseUrl = String(secret_('AI_BASE_URL', 'https://api.openai.com/v1') || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('AI_BASE_URL must be an HTTPS URL.');

  const model = String(secret_('AI_MODEL', secret_('OPENAI_MODEL', 'gpt-5.6-luna')) || '').trim();
  if (!model) throw new Error('AI_MODEL is empty. Set a model id in Apps Script Script Properties.');

  let apiType = String(secret_('AI_API_TYPE', 'responses') || '').trim().toLowerCase().replace(/[ -]+/g, '_');
  if (apiType === 'chat' || apiType === 'chat_completion' || apiType === 'chatcompletion' || apiType === 'chat_completions') apiType = 'chat_completions';
  if (apiType === 'response' || apiType === 'responses') apiType = 'responses';
  if (apiType !== 'responses' && apiType !== 'chat_completions') throw new Error('AI_API_TYPE must be "responses" or "chat_completions".');

  const endpoint = aiEndpoint_(baseUrl, apiType);
  const providerLabel = aiProviderLabel_(baseUrl);
  return { apiKey: apiKey, baseUrl: baseUrl, endpoint: endpoint, model: model, apiType: apiType, providerLabel: providerLabel };
}

function aiEndpoint_(baseUrl, apiType) {
  const lower = baseUrl.toLowerCase();
  if (/\/(responses|chat\/completions)$/.test(lower)) return baseUrl;
  return baseUrl + (apiType === 'chat_completions' ? '/chat/completions' : '/responses');
}

function aiProviderLabel_(baseUrl) {
  try {
    return String(baseUrl).replace(/^https?:\/\//i, '').split('/')[0].slice(0, 100);
  } catch (_) {
    return 'configured provider';
  }
}

function aiRequestHeaders_(config) {
  return { Authorization: 'Bearer ' + config.apiKey };
}

function callAiResponses_(config, prompt, imageUrls) {
  const content = [{ type: 'input_text', text: prompt }];
  imageUrls.forEach(function(url) {
    content.push({ type: 'input_image', detail: 'auto', image_url: url });
  });
  const payload = {
    model: config.model,
    store: false,
    max_output_tokens: 2200,
    input: [{ role: 'user', content: content }],
    text: {
      format: {
        type: 'json_schema',
        name: 'dsb_product_draft',
        strict: true,
        schema: aiProductSchema_()
      }
    }
  };
  const data = aiFetchJson_(config, payload);
  const outputText = extractOpenAiOutputText_(data);
  if (!outputText) throw new Error('AI generation returned no product draft.');
  return { outputText: outputText };
}

function callAiChatCompletions_(config, prompt, imageUrls) {
  const content = [{ type: 'text', text: prompt + '\n\nReturn only valid JSON matching the requested product-draft schema; do not wrap it in markdown.' }];
  imageUrls.forEach(function(url) {
    content.push({ type: 'image_url', image_url: { url: url, detail: 'auto' } });
  });
  const payload = {
    model: config.model,
    messages: [{ role: 'user', content: content }],
    max_tokens: 2200,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'dsb_product_draft',
        strict: true,
        schema: aiProductSchema_()
      }
    }
  };

  let data;
  try {
    data = aiFetchJson_(config, payload);
  } catch (err) {
    // Some OpenAI-compatible providers/models support vision but not json_schema.
    // Retry once with prompt-enforced JSON so changing models usually needs only
    // Script Property edits rather than code changes.
    const message = String(err && err.message || '');
    if (!/response_format|json_schema|schema|unsupported|unknown parameter|invalid parameter/i.test(message)) throw err;
    delete payload.response_format;
    data = aiFetchJson_(config, payload);
  }

  const outputText = extractChatCompletionText_(data);
  if (!outputText) throw new Error('AI generation returned no product draft.');
  return { outputText: stripJsonFence_(outputText) };
}

function aiFetchJson_(config, payload) {
  const response = UrlFetchApp.fetch(config.endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: aiRequestHeaders_(config),
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const raw = response.getContentText();
  let data;
  try { data = JSON.parse(raw); }
  catch (_) { throw new Error('AI provider returned an unreadable response.'); }
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
  return '';
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
    'Create a professional product draft for Dhatterwal Suhag Bhandar (DSB), an Indian ecommerce shop.',
    'Use all supplied images for visually observable details. When multiple images are provided, treat the first image as the main product photo and any remaining images as supplemental reference photos that help identify the same product from other angles, labels, packaging, or close-up details.',
    'Use the supplied notes/existing fields as authoritative facts.',
    'Do not invent commercial facts. Price, MRP, cost price, stock quantity, GTIN, exact sizes, material, pack quantity, or brand must be null unless provided in the notes/existing fields or clearly printed on the product/packaging.',
    'You may infer a sensible product name, category, subcategory, visual colours/design, English description, Hindi name/description, specifications, tags, and whether size selection is needed only when supported by the supplied facts/image.',
    'Descriptions must be concise, attractive, factual, and suitable for a real product page. Avoid exaggerated claims, health claims, guarantees, or invented features.',
    'Hindi should be natural retail Hindi, not a word-for-word machine translation.',
    'For bangles/chudi/kada sizes, preserve values exactly (for example 2.4, 2.6, 2.8).',
    'For sizeprices, return a compact string like "2.4=240, 2.6=240" only when different or explicit size prices are supplied.',
    'If a field is uncertain, return null rather than guessing. Put useful uncertainty notes in warnings.',
    referenceCount ? 'Supplemental reference photos: ' + referenceCount + '.' : 'Supplemental reference photos: none.',
    notes ? 'User notes:\n' + notes : 'User notes: none.',
    Object.keys(existing).length ? 'Existing product fields (preserve these facts unless the notes explicitly correct them):\n' + JSON.stringify(existing) : 'Existing product fields: none.'
  ].join('\n\n');
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
