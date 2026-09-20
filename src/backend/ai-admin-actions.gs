/* Admin AI modules. Source files are bundled into code.gs by scripts/build.mjs. */

function sanitizeAiAdminChatResult_(parsed, context, actor) {
  const reply = String(parsed && parsed.reply || '').trim().slice(0, 7000) || 'I could not produce a useful reply. Please rephrase the request.';
  const raw = parsed && parsed.action && typeof parsed.action === 'object' ? parsed.action : {};
  const type = ['update_product', 'add_product', 'update_order_status', 'archive_product'].indexOf(String(raw.type || '')) !== -1 ? String(raw.type) : 'none';
  if (type === 'none' || actor.role === 'viewer') return { reply: reply, proposal: null };

  if (type === 'update_product') {
    const id = String(raw.targetId || '').trim();
    const all = getAllProducts(true);
    const product = all.find(function(p) { return String(p.id || '') === id && !isArchived_(p); });
    if (!product || !context.target || context.target.ids.length !== 1 || context.target.ids[0] !== id) return { reply: reply + '\n\nI did not attach the edit because the target product could not be verified.', proposal: null };
    const patch = sanitizeAiAdminProductPatch_(raw.patch || {});
    delete patch.id;
    if (patch.stockqty !== undefined && patch.stock === undefined) patch.stock = Number(patch.stockqty) <= 0 ? 'out of stock' : 'in stock';
    if (!Object.keys(patch).length) return { reply: reply, proposal: null };
    return {
      reply: reply,
      proposal: {
        type: type,
        title: String(raw.title || 'Update ' + id).slice(0, 120),
        description: String(raw.description || 'Review these product changes before applying.').slice(0, 500),
        targetId: id,
        patch: patch,
        current: aiAdminProductView_(product),
        expectedRevision: productRevision_(product),
        expectedStock: product.stock === undefined ? '' : product.stock,
        expectedStockqty: product.stockqty === undefined ? '' : product.stockqty
      }
    };
  }

  if (type === 'add_product') {
    const patch = sanitizeAiAdminProductPatch_(raw.patch || {});
    delete patch.id;
    if (patch.stockqty !== undefined && patch.stock === undefined) patch.stock = Number(patch.stockqty) <= 0 ? 'out of stock' : 'in stock';
    if (!String(patch.name || '').trim() || !(Number(patch.price) > 0)) {
      return { reply: reply + '\n\nI did not attach a create action because a new product needs at least a confirmed name and positive price.', proposal: null };
    }
    return {
      reply: reply,
      proposal: {
        type: type,
        title: String(raw.title || 'Create product').slice(0, 120),
        description: String(raw.description || 'Review this new product before adding it.').slice(0, 500),
        targetId: '',
        patch: patch
      }
    };
  }

  if (type === 'update_order_status') {
    const id = String(raw.targetId || '').trim();
    const status = String(raw.status || '').trim();
    const order = rowsAsObjects_(getSheet_(ORDERS_SHEET)).find(function(o) { return String(o.orderid || '') === id; });
    if (!order || ALLOWED_ORDER_STATUSES.indexOf(status) < 0 || String(order.status || 'Pending') === status) return { reply: reply, proposal: null };
    return {
      reply: reply,
      proposal: {
        type: type,
        title: String(raw.title || 'Change order status').slice(0, 120),
        description: String(raw.description || ('Change ' + id + ' from ' + (order.status || 'Pending') + ' to ' + status + '.')).slice(0, 500),
        targetId: id,
        status: status,
        currentStatus: String(order.status || 'Pending')
      }
    };
  }

  if (type === 'archive_product') {
    const id = String(raw.targetId || '').trim();
    const product = getAllProducts(true).find(function(p) { return String(p.id || '') === id; });
    if (!product || !context.target || context.target.ids.length !== 1 || context.target.ids[0] !== id) return { reply: reply + '\nPlease identify one product by ID before changing its archive status.', proposal: null };
    const archived = raw.archived === true;
    if (isArchived_(product) === archived) return { reply: reply, proposal: null };
    return {
      reply: reply,
      proposal: {
        type: type,
        title: String(raw.title || (archived ? 'Archive product' : 'Restore product')).slice(0, 120),
        description: String(raw.description || ((archived ? 'Archive ' : 'Restore ') + id + '.')).slice(0, 500),
        targetId: id,
        archived: archived,
        expectedRevision: productRevision_(product)
      }
    };
  }

  return { reply: reply, proposal: null };
}

function sanitizeAiAdminProductPatch_(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return {};
  const out = {};
  const textFields = ['name', 'namehindi', 'category', 'subcategory', 'image', 'images', 'description', 'stock', 'tags', 'brand', 'material', 'packsize', 'specifications', 'gtin', 'descriptionhindi', 'sizeprices', 'sizes'];
  const numberFields = ['price', 'mrp', 'costprice', 'stockqty'];
  textFields.forEach(function(key) {
    if (patch[key] === undefined || patch[key] === null) return;
    const value = String(patch[key]).trim();
    const max = key === 'description' || key === 'descriptionhindi' || key === 'specifications' ? 2000 : key === 'images' ? 5000 : 1000;
    if (value.length <= max) out[key] = value;
  });
  numberFields.forEach(function(key) {
    if (patch[key] === undefined || patch[key] === null || typeof patch[key] === 'boolean' || String(patch[key]).trim() === '') return;
    const value = Number(patch[key]);
    if (!Number.isFinite(value) || value < 0) return;
    out[key] = key === 'stockqty' ? Math.floor(value) : value;
  });
  if (out.stock) {
    const normalizedStock = out.stock.toLowerCase();
    if (['in stock', 'out of stock'].indexOf(normalizedStock) === -1) delete out.stock;
    else out.stock = normalizedStock;
  }
  return out;
}

function resolveAiAdminTarget_(message, history, products) {
  const text = String(message || '').toLowerCase();
  const ids = text.match(/\bdsb-[a-z0-9._-]+\b/g) || [];
  if (ids.length) return { products: products.filter(function(p) { return ids.indexOf(String(p.id).toLowerCase()) !== -1; }), reason: 'current ID' };
  function words(value) {
    return String(value || '').toLowerCase().replace(/nail\s*(cutter|clippers)/g, 'nail clipper').split(/[^a-z0-9\u0900-\u097f]+/).filter(Boolean).map(function(t) { return t.length > 4 ? t.replace(/s$/, '') : t; });
  }
  const ignored = words('find search show me the a an and or for of in on to from with please can you could would i want need my this that it these those same previous product products item listing details detail all every missing possible information field fill complete populate enrich generate add improve rewrite enhance professional richer better description english hindi translate translation seo copy name title tag specification price mrp cost stock quantity set change update make keep only do its is are be by at into rupee rs archive restore unarchive active').reduce(function(o, w) { o[w] = true; return o; }, {});
  const terms = words(text).filter(function(t) { return !ignored[t] && !/^\d+$/.test(t); });
  const active = products.filter(function(p) { return !isArchived_(p); });
  if (terms.length) {
    const matches = active.filter(function(p) {
      const hay = words([p.name, p.namehindi, p.brand, p.category, p.subcategory, p.tags].join(' '));
      return terms.every(function(t) { return hay.indexOf(t) !== -1; });
    });
    return { products: matches, reason: matches.length ? 'current name' : 'unmatched current name' };
  }
  if (/\b(it|this|that|same|previous|fill|complete|enrich|improve|rewrite|translate)\b/i.test(text)) {
    // Inspect only the most recent identifying turn; do not jump backwards over
    // a new, unmatched user target to an older assistant suggestion.
    for (let i = (history || []).length - 1; i >= 0; i--) {
      const turn = history[i];
      const result = resolveAiAdminTarget_(turn.text, [], products);
      if (result.products.length || turn.role === 'user') return { products: result.products, reason: 'explicit follow-up' };
    }
  }
  return { products: [], reason: 'no target' };
}

function aiAdminLocalReport_(message) {
  const text = String(message || '');
  const audit = /\b(audit|catalog health|catalog quality|listing gaps)\b/i.test(text);
  const restock = /\b(restock|restocking|low stock)\b/i.test(text);
  if ((!audit && !restock) || /\b(set|change|update|edit|archive|restore|delete)\b/i.test(text)) return '';
  const products = getAllProducts(true).filter(function(p) { return !isArchived_(p); });
  const hasNumber = function(v) { return v !== null && v !== undefined && String(v).trim() !== '' && Number.isFinite(Number(v)); };
  const label = function(p) { return p.id + ' — ' + p.name; };
  if (restock) {
    const low = products.filter(function(p) { return String(p.stock).toLowerCase() === 'out of stock' || (hasNumber(p.stockqty) && Number(p.stockqty) <= 5); }).sort(function(a, b) { return (Number(a.stockqty) || 0) - (Number(b.stockqty) || 0); });
    const unknown = products.filter(function(p) { return !hasNumber(p.stockqty); }).length;
    return 'Restock check: ' + low.length + ' active products are out of stock or have 5 or fewer units.\n' + low.slice(0, 30).map(function(p) { return label(p) + ' — ' + (hasNumber(p.stockqty) ? p.stockqty + ' units' : 'quantity untracked') + (p.stock ? ', ' + p.stock : ''); }).join('\n') + (low.length > 30 ? '\nShowing first 30.' : '') + '\n' + unknown + ' products have no tracked quantity. Reorder quantities need supplier lead time and sales demand; I have not guessed them.';
  }
  const names = {};
  products.forEach(function(p) { const key = String(p.name || '').trim().toLowerCase().replace(/\s+/g, ' '); if (key) (names[key] || (names[key] = [])).push(p.id); });
  const issues = products.map(function(p) {
    const gaps = [];
    ['image', 'description', 'descriptionhindi', 'category'].forEach(function(key) { if (!String(p[key] || '').trim()) gaps.push('missing ' + ({descriptionhindi:'Hindi description'}[key] || key)); });
    if (!hasNumber(p.price) || Number(p.price) <= 0) gaps.push('invalid selling price');
    if (hasNumber(p.mrp) && Number(p.mrp) > 0 && Number(p.mrp) < Number(p.price)) gaps.push('MRP below selling price');
    if (hasNumber(p.costprice) && Number(p.costprice) > Number(p.price)) gaps.push('cost above selling price');
    if (!hasNumber(p.stockqty)) gaps.push('quantity untracked');
    else if (Number(p.stockqty) < 0 || !Number.isInteger(Number(p.stockqty))) gaps.push('invalid stock quantity');
    else if ((Number(p.stockqty) === 0 && String(p.stock).toLowerCase() === 'in stock') || (Number(p.stockqty) > 0 && String(p.stock).toLowerCase() === 'out of stock')) gaps.push('stock status disagrees with quantity');
    const key = String(p.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (names[key] && names[key].length > 1) gaps.push('possible duplicate name: ' + names[key].join(', '));
    return { p: p, gaps: gaps };
  }).filter(function(row) { return row.gaps.length; }).sort(function(a, b) { return b.gaps.length - a.gaps.length; });
  return 'Catalog audit: ' + products.length + ' active products checked; ' + issues.length + ' need review.\n' + issues.slice(0, 25).map(function(row) { return label(row.p) + ': ' + row.gaps.join('; '); }).join('\n') + (issues.length > 25 ? '\nShowing the 25 listings with most issues.' : '') + '\nTo improve a listing, ask “Enrich details for DSB-…” or “Translate description for DSB-… into Hindi”. Possible duplicates need manual review. No changes were made.';
}
