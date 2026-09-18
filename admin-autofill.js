/* DSB product autofill
 * Accepts JSON, simple ChatGPT-style "Label: value" text, or copied
 * two-column "Form field / Value to enter" tables.
 * Parsing and form application are deliberately separate so pasted content is
 * always reviewed before it touches the product editor.
 */
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const FIELD_MAP = {
    id: 'f-id',
    name: 'f-name',
    namehindi: 'f-nameHindi',
    category: 'f-category',
    subcategory: 'f-subcategory',
    price: 'f-price',
    mrp: 'f-mrp',
    costprice: 'f-costprice',
    image: 'f-image',
    description: 'f-description',
    stockqty: 'f-stockqty',
    brand: 'f-brand',
    material: 'f-material',
    packsize: 'f-packsize',
    specifications: 'f-specifications',
    gtin: 'f-gtin',
    descriptionhindi: 'f-descriptionhindi',
    sizeprices: 'f-sizeprices',
    tags: 'f-tags',
    sizes: 'f-sizes'
  };

  const LABEL_ALIASES = new Map(Object.entries({
    'product id': 'id', 'id': 'id',
    'namehindi': 'namehindi', 'costprice': 'costprice', 'stockqty': 'stockqty', 'packsize': 'packsize',
    'descriptionhindi': 'descriptionhindi', 'sizeprices': 'sizeprices', 'hassizes': 'hasSizes',
    'name': 'name', 'product name': 'name', 'title': 'name',
    'name hindi': 'namehindi', 'hindi name': 'namehindi', 'name in hindi': 'namehindi', 'product name hindi': 'namehindi',
    'category': 'category', 'subcategory': 'subcategory', 'sub category': 'subcategory',
    'price': 'price', 'selling price': 'price', 'sale price': 'price',
    'mrp': 'mrp', 'maximum retail price': 'mrp',
    'cost': 'costprice', 'cost price': 'costprice', 'purchase price': 'costprice',
    'image': 'image', 'image url': 'image', 'photo': 'image', 'photo url': 'image',
    'description': 'description', 'english description': 'description', 'product description': 'description',
    'stock quantity': 'stockqty', 'stock qty': 'stockqty', 'quantity': 'stockqty', 'qty': 'stockqty',
    'stock': 'stock', 'availability': 'stock',
    'brand': 'brand', 'material': 'material', 'pack': 'packsize', 'pack size': 'packsize', 'pack quantity': 'packsize', 'pack / quantity': 'packsize',
    'specifications': 'specifications', 'specification': 'specifications', 'product specifications': 'specifications', 'specs': 'specifications',
    'gtin': 'gtin', 'barcode': 'gtin', 'gtin barcode': 'gtin',
    'hindi description': 'descriptionhindi', 'description hindi': 'descriptionhindi', 'hindi product description': 'descriptionhindi',
    'sizes': 'sizes', 'size': 'sizes', 'available sizes': 'sizes',
    'this product requires size selection': 'hasSizes', 'requires size selection': 'hasSizes', 'size selection required': 'hasSizes',
    'size prices': 'sizeprices', 'size price': 'sizeprices', 'price per size': 'sizeprices', 'size pricing': 'sizeprices',
    'tags': 'tags', 'keywords': 'tags'
  }));

  let parsedDraft = null;

  function cleanKey(value) {
    return String(value || '')
      .trim().toLowerCase()
      .replace(/[“”"'`*_]/g, '')
      .replace(/[_-]+/g, ' ')
      .replace(/[^a-z0-9 /]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanValue(value) {
    if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
    if (value === null || value === undefined) return '';
    return typeof value === 'string' ? value.trim() : value;
  }

  const PLACEHOLDER_PATTERNS = [
    /^leave\s+(?:it\s+)?blank$/i,
    /^blank$/i,
    /^n\/?a$/i,
    /^not\s+(?:available|provided|known)$/i,
    /^enter\s+(?:the\s+)?actual\b/i,
    /^add\s+(?:the\s+)?actual\b/i,
    /^use\s+(?:the\s+)?actual\b/i,
    /^fill\s+(?:the\s+)?actual\b/i
  ];

  function isInstructionPlaceholder(value) {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value) || typeof value === 'object') return false;
    const text = String(value).trim();
    return !text || PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text));
  }

  function normalizeBoolean(value) {
    if (typeof value === 'boolean') return value;
    const s = String(value ?? '').trim().toLowerCase();
    if (!s) return null;
    if (/^(?:✓|✔|yes|y|true|1|required|enabled|on)(?:\s+yes)?$/.test(s)) return true;
    if (/^(?:✗|✘|no|n|false|0|not required|disabled|off)(?:\s+no)?$/.test(s)) return false;
    if (/^(?:✓|✔)\s*yes$/.test(s)) return true;
    if (/^(?:✗|✘)\s*no$/.test(s)) return false;
    return null;
  }

  function normalizeMoney(value) {
    if (value === '' || value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? value : '';
    const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : '';
  }

  function normalizeList(value) {
    const items = Array.isArray(value) ? value : String(value || '').split(/[,|;/\n]+/);
    return [...new Set(items.map(item => String(item).trim()).filter(Boolean))];
  }

  function normalizeStock(value) {
    const s = String(value || '').trim().toLowerCase();
    if (!s) return '';
    if (/out\s*of\s*stock|unavailable|sold\s*out/.test(s)) return 'out of stock';
    if (/in\s*stock|available/.test(s)) return 'in stock';
    return '';
  }

  function normalizeSizePrices(value) {
    if (!value) return '';
    if (Array.isArray(value)) {
      return value.map(entry => {
        if (entry && typeof entry === 'object') {
          const size = entry.size ?? entry.name ?? entry.label;
          const price = normalizeMoney(entry.price ?? entry.value);
          return size && price !== '' ? `${String(size).trim()}=${price}` : '';
        }
        return String(entry).trim();
      }).filter(Boolean).join(', ');
    }
    if (typeof value === 'object') {
      return Object.entries(value).map(([size, price]) => {
        const n = normalizeMoney(price);
        return n === '' ? '' : `${size.trim()}=${n}`;
      }).filter(Boolean).join(', ');
    }
    return String(value).trim().replace(/\s*(?:=>|:|₹|rs\.?|inr)\s*/gi, '=').replace(/\s*=\s*/g, '=').replace(/\s*[,;]\s*/g, ', ');
  }

  function canonicalize(raw) {
    const out = {};
    for (const [rawKey, rawValue] of Object.entries(raw || {})) {
      const key = LABEL_ALIASES.get(cleanKey(rawKey)) || cleanKey(rawKey).replace(/\s+/g, '');
      const value = cleanValue(rawValue);
      if ((!value && value !== 0) || isInstructionPlaceholder(value)) continue;
      switch (key) {
        case 'price': case 'mrp': case 'costprice': case 'stockqty': {
          const n = normalizeMoney(value);
          if (n !== '') out[key] = key === 'stockqty' ? Math.max(0, Math.floor(n)) : Math.max(0, n);
          break;
        }
        case 'sizes': out.sizes = normalizeList(value); break;
        case 'hasSizes': {
          const enabled = normalizeBoolean(value);
          if (enabled !== null) out.hasSizes = enabled;
          break;
        }
        case 'tags': out.tags = normalizeList(value); break;
        case 'sizeprices': out.sizeprices = normalizeSizePrices(value); break;
        case 'stock': {
          const stock = normalizeStock(value);
          if (stock) out.stock = stock;
          break;
        }
        default:
          if (FIELD_MAP[key]) out[key] = String(value).trim();
      }
    }
    if (out.stockqty === 0) out.stock = 'out of stock';
    else if (Number.isFinite(out.stockqty) && !out.stock) out.stock = 'in stock';
    return out;
  }

  function stripCodeFence(text) {
    return String(text || '').trim()
      .replace(/^```(?:json|javascript|js|text)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  function parseJson(text) {
    const cleaned = stripCodeFence(text);
    const candidates = [cleaned];
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
    for (const candidate of candidates) {
      try {
        const value = JSON.parse(candidate);
        if (value && typeof value === 'object' && !Array.isArray(value)) return canonicalize(value.product && typeof value.product === 'object' ? value.product : value);
      } catch (_) {}
    }
    return null;
  }

  function parseLines(text) {
    const raw = {};
    let currentKey = '';
    let multiline = [];
    const flush = () => {
      if (currentKey && multiline.length) raw[currentKey] = multiline.join('\n').trim();
      currentKey = '';
      multiline = [];
    };

    const knownLabels = [...LABEL_ALIASES.keys()].sort((a, b) => b.length - a.length);
    const resolveKnownPrefix = line => {
      const normalized = line.replace(/\u00a0/g, ' ').trim();
      for (const label of knownLabels) {
        // Keep matching conservative: a copied table normally separates columns
        // with tabs or multiple spaces. A single-space fallback is allowed only
        // when the label ends in punctuation such as Price (₹).
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const pattern = new RegExp(`^(${escaped})(?:\\s*[:=]\\s*|\\t+|\\s{2,})(.+)$`, 'i');
        const match = normalized.match(pattern);
        if (match) return [match[1], match[2]];
      }
      return null;
    };

    for (let line of stripCodeFence(text).split(/\r?\n/)) {
      line = line.replace(/\u00a0/g, ' ').trim();
      if (!line) continue;
      line = line.replace(/^[-•*]\s+/, '').replace(/^\d+[.)]\s+/, '');

      // Ignore common table/headline wrappers copied with ChatGPT answers.
      const heading = cleanKey(line);
      if (!heading || heading === 'form field value to enter' || heading === 'form field' || heading === 'value to enter' ||
          heading === 'fill this product form like this' || heading === 'suggested seo product title' ||
          heading === 'attractive hindi name options' || /^you can use any one of these/.test(heading) ||
          /^if you want/.test(heading)) {
        flush();
        continue;
      }

      let match = line.match(/^([^:=\t]{1,60})\s*[:=]\s*(.*)$/);
      let pair = null;
      if (match) pair = [match[1], match[2]];
      if (!pair && line.includes('\t')) {
        const parts = line.split(/\t+/).map(part => part.trim()).filter(Boolean);
        if (parts.length >= 2) pair = [parts[0], parts.slice(1).join(' ')];
      }
      if (!pair) {
        const spaced = line.match(/^(.{1,60}?)\s{2,}(.+)$/);
        if (spaced) pair = [spaced[1], spaced[2]];
      }
      if (!pair) pair = resolveKnownPrefix(line);

      if (pair) {
        flush();
        const mapped = LABEL_ALIASES.get(cleanKey(pair[0]));
        if (!mapped) continue;
        currentKey = pair[0];
        const value = pair[1].trim();
        if (value && !isInstructionPlaceholder(value)) {
          raw[currentKey] = value;
          currentKey = '';
        } else {
          currentKey = '';
        }
      } else if (currentKey) {
        multiline.push(line);
      }
    }
    flush();
    return canonicalize(raw);
  }

  function parseInput(text) {
    if (!String(text || '').trim()) throw new Error('Paste product details first.');
    const data = parseJson(text) || parseLines(text);
    if (!data || !Object.keys(data).length) throw new Error('No supported product fields were recognized. Use JSON, “Price: 160” lines, or a copied “Form field / Value to enter” table.');
    return data;
  }

  function displayValue(key, value) {
    if (key === 'sizes' || key === 'tags') return value.join(', ');
    if (key === 'hasSizes') return value ? 'Yes' : 'No';
    if (['price', 'mrp', 'costprice'].includes(key)) return `₹${value}`;
    return String(value);
  }

  function labelFor(key) {
    return ({
      id: 'Product ID', name: 'Name', namehindi: 'Hindi name', category: 'Category', subcategory: 'Subcategory',
      price: 'Price', mrp: 'MRP', costprice: 'Cost price', image: 'Image URL', description: 'Description',
      stock: 'Stock', stockqty: 'Stock quantity', brand: 'Brand', material: 'Material', packsize: 'Pack / quantity',
      specifications: 'Specifications', gtin: 'GTIN / barcode', descriptionhindi: 'Hindi description',
      sizes: 'Sizes', sizeprices: 'Price per size', tags: 'Tags', hasSizes: 'Requires size selection'
    })[key] || key;
  }

  function renderPreview(data) {
    const preview = $('#autofillPreview');
    const rows = Object.entries(data).map(([key, value]) => `
      <div class="autofill-preview-row">
        <span>${escapeHtml(labelFor(key))}</span>
        <strong>${escapeHtml(displayValue(key, value))}</strong>
      </div>`).join('');
    preview.innerHTML = rows || '<p class="hint">Nothing recognized yet.</p>';
    $('#autofillApplyBtn').disabled = !rows;
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function applyDraft(data) {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'hasSizes') {
        const toggle = $('#f-hasSizes');
        if (toggle) {
          toggle.checked = Boolean(value);
          toggle.dispatchEvent(new Event('change', { bubbles: true }));
          $('#sizeOptionsField').hidden = !toggle.checked;
        }
        continue;
      }
      if (key === 'stock') {
        setValue('f-stock', value);
        continue;
      }
      if (key === 'sizes') {
        setValue('f-sizes', value.join(', '));
        continue;
      }
      if (key === 'tags') {
        setValue('f-tags', value.join(', '));
        continue;
      }
      const id = FIELD_MAP[key];
      if (id) setValue(id, value);
    }

    const inferredHasSizes = data.hasSizes === undefined && ((data.sizes && data.sizes.length) || data.sizeprices);
    if (inferredHasSizes) {
      const toggle = $('#f-hasSizes');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      $('#sizeOptionsField').hidden = false;
    }
    if (data.image && typeof updateImagePreview === 'function') updateImagePreview(data.image);
    closeDialog();
    if (typeof showToast === 'function') showToast(`Applied ${Object.keys(data).length} product field${Object.keys(data).length === 1 ? '' : 's'}. Review before saving.`);
  }

  function openDialog() {
    const dialog = $('#autofillDialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    setTimeout(() => $('#autofillInput')?.focus(), 0);
  }

  function closeDialog() {
    const dialog = $('#autofillDialog');
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function parseAndPreview() {
    const statusEl = $('#autofillStatus');
    try {
      parsedDraft = parseInput($('#autofillInput').value);
      renderPreview(parsedDraft);
      statusEl.textContent = `${Object.keys(parsedDraft).length} field${Object.keys(parsedDraft).length === 1 ? '' : 's'} recognized. Review below, then apply.`;
      statusEl.className = 'statusline good';
    } catch (err) {
      parsedDraft = null;
      renderPreview({});
      statusEl.textContent = err.message;
      statusEl.className = 'statusline bad';
    }
  }

  function resetDialog() {
    parsedDraft = null;
    $('#autofillInput').value = '';
    $('#autofillStatus').textContent = '';
    renderPreview({});
  }

  function openDraft(data, meta = {}) {
    parsedDraft = canonicalize(data || {});
    if (!Object.keys(parsedDraft).length) throw new Error('The generated draft did not contain any supported product fields.');
    renderPreview(parsedDraft);
    const warnings = Array.isArray(meta.warnings) ? meta.warnings.filter(Boolean) : [];
    const source = meta.source ? String(meta.source) : 'Draft';
    const model = meta.model ? ` · ${String(meta.model)}` : '';
    const warningText = warnings.length ? ` Review notes: ${warnings.join(' • ')}` : '';
    const statusEl = $('#autofillStatus');
    statusEl.textContent = `${source}${model}: ${Object.keys(parsedDraft).length} field${Object.keys(parsedDraft).length === 1 ? '' : 's'} ready for review.${warningText}`;
    statusEl.className = warnings.length ? 'statusline' : 'statusline good';
    openDialog();
  }

  if (typeof window !== 'undefined') window.DSBAutofill = Object.freeze({ openDraft });

  document.addEventListener('DOMContentLoaded', () => {
    $('#autofillOpenBtn')?.addEventListener('click', openDialog);
    $('#autofillParseBtn')?.addEventListener('click', parseAndPreview);
    $('#autofillApplyBtn')?.addEventListener('click', () => parsedDraft && applyDraft(parsedDraft));
    $('#autofillCloseBtn')?.addEventListener('click', closeDialog);
    $('#autofillResetBtn')?.addEventListener('click', resetDialog);
    $('#autofillDialog')?.addEventListener('click', event => {
      if (event.target === $('#autofillDialog')) closeDialog();
    });
  });
})();
