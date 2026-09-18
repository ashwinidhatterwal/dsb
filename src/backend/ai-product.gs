/* AI product draft generation. Bundled into code.gs by scripts/build.mjs.
 * OPENAI_API_KEY stays in Apps Script Script Properties and is never sent to
 * the browser. OPENAI_MODEL may optionally override the default model.
 */
function generateAiProductDraft_(body, actor) {
  const apiKey = secret_('OPENAI_API_KEY', '');
  if (!apiKey) throw new Error('AI autofill is not configured. Add OPENAI_API_KEY in Apps Script > Project settings > Script properties.');

  rateLimit_('ai-product:' + String(actor && actor.name || 'admin'), 30, 3600);

  const imageUrl = String(body.imageUrl || '').trim();
  const referenceUrls = sanitizeAiReferenceUrls_(body.referenceUrls || []);
  const notes = String(body.notes || '').trim().slice(0, 3500);
  const existing = sanitizeAiExisting_(body.existing || {});
  if (!imageUrl && !referenceUrls.length && !notes && !Object.keys(existing).length) {
    throw new Error('Add a product photo, AI-only reference photo, notes, or some existing product details first.');
  }
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw new Error('The product image must be an HTTPS URL.');

  const model = String(secret_('OPENAI_MODEL', 'gpt-5.6-luna')).trim() || 'gpt-5.6-luna';
  const content = [{
    type: 'input_text',
    text: aiProductPrompt_(notes, existing, referenceUrls.length)
  }];
  if (imageUrl) content.push({
    type: 'input_image',
    detail: 'auto',
    image_url: imageUrl
  });
  referenceUrls.forEach(function(url) {
    content.push({
      type: 'input_image',
      detail: 'auto',
      image_url: url
    });
  });

  const payload = {
    model: model,
    store: false,
    max_output_tokens: 2200,
    input: [{
      role: 'user',
      content: content
    }],
    text: {
      format: {
        type: 'json_schema',
        name: 'dsb_product_draft',
        strict: true,
        schema: aiProductSchema_()
      }
    }
  };

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const raw = response.getContentText();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    throw new Error('OpenAI returned an unreadable response.');
  }
  if (status < 200 || status >= 300) {
    const message = data && data.error && data.error.message ? String(data.error.message) : 'OpenAI request failed.';
    throw new Error('AI generation failed: ' + message.slice(0, 300));
  }

  const outputText = extractOpenAiOutputText_(data);
  if (!outputText) throw new Error('AI generation returned no product draft.');

  let parsed;
  try {
    parsed = JSON.parse(outputText);
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
    model: model
  };
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
