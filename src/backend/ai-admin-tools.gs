/* Generic, read-first tools used by DSB Admin AI. The model chooses a tool;
 * Apps Script only validates and executes bounded backend operations. */

var AI_ADMIN_TOOL_LIMITS_ = { products: 50, productDetails: 12, visionProducts: 8, enrichProducts: 2, orders: 30, toolSteps: 3 };

function aiAdminTagList_(value) {
  return String(value || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean);
}

function aiAdminNormalizeName_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function aiAdminNameTokens_(value) {
  return aiAdminNormalizeName_(value).split(' ').filter(function(x) { return x.length > 1; });
}

function aiAdminNameSimilarity_(a, b) {
  const aa = aiAdminNameTokens_(a), bb = aiAdminNameTokens_(b);
  if (!aa.length || !bb.length) return 0;
  const seen = {};
  aa.forEach(function(x) { seen[x] = 1; });
  let inter = 0;
  bb.forEach(function(x) { if (seen[x]) inter++; });
  const union = aa.length + bb.length - inter;
  return union ? inter / union : 0;
}

function aiAdminToolProductRow_(p, includeDescriptions, includeImages) {
  const out = aiAdminProductView_(p);
  if (!includeDescriptions) {
    delete out.description;
    delete out.descriptionhindi;
    delete out.specifications;
  }
  if (includeImages) {
    out.image = String(p.image || '').trim();
    out.images = String(p.images || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean).slice(0, 5);
  }
  out.archived = isArchived_(p);
  out.tagCount = aiAdminTagList_(p.tags).length;
  return out;
}


function aiAdminCatalogSummary_(rows) {
  const issues = {
    missingImage: [], missingDescription: [], missingHindiDescription: [], missingCategory: [],
    missingSubcategory: [], missingMaterial: [], missingBrand: [], lowTags: [], outOfStock: [], lowStock: []
  };
  const nameGroups = {};
  rows.forEach(function(p) {
    const id = String(p.id || '');
    if (!String(p.image || '').trim()) issues.missingImage.push(id);
    if (!String(p.description || '').trim()) issues.missingDescription.push(id);
    if (!String(p.descriptionhindi || '').trim()) issues.missingHindiDescription.push(id);
    if (!String(p.category || '').trim()) issues.missingCategory.push(id);
    if (!String(p.subcategory || '').trim()) issues.missingSubcategory.push(id);
    if (!String(p.material || '').trim()) issues.missingMaterial.push(id);
    if (!String(p.brand || '').trim()) issues.missingBrand.push(id);
    if (aiAdminTagList_(p.tags).length <= 2) issues.lowTags.push(id);
    const qty = Number(p.stockqty);
    const stock = String(p.stock || '').trim().toLowerCase();
    if (stock === 'out of stock' || stock === 'out-of-stock' || stock === 'outofstock' || (Number.isFinite(qty) && qty <= 0)) issues.outOfStock.push(id);
    else if (Number.isFinite(qty) && qty > 0 && qty <= 3) issues.lowStock.push(id);
    const key = aiAdminNormalizeName_(p.name);
    if (key) (nameGroups[key] || (nameGroups[key] = [])).push(id);
  });
  const exactDuplicateNames = Object.keys(nameGroups).map(function(name) { return { name:name, ids:nameGroups[name] }; }).filter(function(g) { return g.ids.length > 1; }).slice(0, 20);
  const compact = {};
  Object.keys(issues).forEach(function(key) { compact[key] = { count:issues[key].length, sampleIds:issues[key].slice(0, 12) }; });
  return { totalProducts:rows.length, issues:compact, exactDuplicateNames:exactDuplicateNames };
}

function aiAdminQueryProducts_(args) {
  args = args && typeof args === 'object' ? args : {};
  let rows = getAllProducts(true);
  const status = String(args.status || 'active').toLowerCase();
  if (status === 'active') rows = rows.filter(function(p) { return !isArchived_(p); });
  else if (status === 'archived') rows = rows.filter(isArchived_);

  const ids = Array.isArray(args.ids) ? args.ids.map(function(x) { return String(x || '').trim().toLowerCase(); }).filter(Boolean).slice(0, 50) : [];
  if (ids.length) rows = rows.filter(function(p) { return ids.indexOf(String(p.id || '').toLowerCase()) !== -1; });

  const text = String(args.text || '').trim().toLowerCase();
  if (text) rows = rows.filter(function(p) {
    return [p.id,p.name,p.namehindi,p.category,p.subcategory,p.tags,p.brand,p.material].join(' ').toLowerCase().indexOf(text) !== -1;
  });
  ['category','subcategory','brand','material'].forEach(function(key) {
    const wanted = String(args[key] || '').trim().toLowerCase();
    if (wanted) rows = rows.filter(function(p) { return String(p[key] || '').trim().toLowerCase().indexOf(wanted) !== -1; });
  });

  const tagCount = Number(args.tagCount);
  const tagCountMin = Number(args.tagCountMin);
  const tagCountMax = Number(args.tagCountMax);
  if (Number.isFinite(tagCount)) rows = rows.filter(function(p) { return aiAdminTagList_(p.tags).length === Math.max(0, Math.floor(tagCount)); });
  if (Number.isFinite(tagCountMin)) rows = rows.filter(function(p) { return aiAdminTagList_(p.tags).length >= Math.max(0, Math.floor(tagCountMin)); });
  if (Number.isFinite(tagCountMax)) rows = rows.filter(function(p) { return aiAdminTagList_(p.tags).length <= Math.max(0, Math.floor(tagCountMax)); });

  const missing = Array.isArray(args.missingFields) ? args.missingFields.map(function(x) { return String(x || '').trim().toLowerCase(); }).filter(Boolean).slice(0, 12) : [];
  if (missing.length) rows = rows.filter(function(p) { return missing.every(function(key) { return String(p[key] === null || p[key] === undefined ? '' : p[key]).trim() === ''; }); });

  [['priceMin','price',true],['priceMax','price',false],['stockQtyMin','stockqty',true],['stockQtyMax','stockqty',false]].forEach(function(rule) {
    const n = Number(args[rule[0]]);
    if (!Number.isFinite(n)) return;
    rows = rows.filter(function(p) {
      const v = Number(p[rule[1]]);
      return Number.isFinite(v) && (rule[2] ? v >= n : v <= n);
    });
  });
  const stockStatus = String(args.stockStatus || '').trim().toLowerCase();
  if (stockStatus) rows = rows.filter(function(p) { return String(p.stock || '').trim().toLowerCase() === stockStatus; });

  if (args.summary === true) return aiAdminCatalogSummary_(rows);

  if (args.similarNames === true) {
    const source = rows.slice(0, 250);
    const pairs = [];
    for (let i = 0; i < source.length; i++) for (let j = i + 1; j < source.length; j++) {
      const score = aiAdminNameSimilarity_(source[i].name, source[j].name);
      if (score >= 0.6 || (aiAdminNormalizeName_(source[i].name) && aiAdminNormalizeName_(source[i].name) === aiAdminNormalizeName_(source[j].name))) {
        pairs.push({ score: Math.round(score * 100) / 100, products: [aiAdminToolProductRow_(source[i], false, true), aiAdminToolProductRow_(source[j], false, true)] });
      }
    }
    pairs.sort(function(a,b) { return b.score - a.score; });
    return { count: pairs.length, pairs: pairs.slice(0, 20), note: source.length < rows.length ? 'Similarity scan was capped at 250 filtered products.' : '' };
  }

  const sort = String(args.sort || 'id').toLowerCase();
  rows.sort(function(a,b) {
    if (sort === 'price') return safeNumber_(a.price, 0) - safeNumber_(b.price, 0);
    if (sort === 'stockqty') return safeNumber_(a.stockqty, 0) - safeNumber_(b.stockqty, 0);
    if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  const limit = Math.max(1, Math.min(AI_ADMIN_TOOL_LIMITS_.products, Math.floor(Number(args.limit) || 20)));
  return { count: rows.length, products: rows.slice(0, limit).map(function(p) { return aiAdminToolProductRow_(p, args.includeDescriptions === true, args.includeImages === true); }), truncated: rows.length > limit };
}

function aiAdminGetProducts_(args) {
  args = args && typeof args === 'object' ? args : {};
  const ids = Array.isArray(args.ids) ? args.ids.map(function(x) { return String(x || '').trim(); }).filter(Boolean).slice(0, AI_ADMIN_TOOL_LIMITS_.productDetails) : [];
  const map = {};
  ids.forEach(function(id) { map[id.toLowerCase()] = true; });
  const products = getAllProducts(true).filter(function(p) { return map[String(p.id || '').toLowerCase()]; });
  return { products: products.map(function(p) { return aiAdminToolProductRow_(p, true, args.includeImages !== false); }) };
}

function aiAdminAnalyzeOneProduct_(p, instruction, body, actor, onlyEmpty) {
  try {
    const gallery = String(p.images || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean).slice(0, 4);
    const existing = {
      name:p.name,namehindi:p.namehindi,category:p.category,subcategory:p.subcategory,price:p.price,mrp:p.mrp,costprice:p.costprice,
      description:p.description,stock:p.stock,stockqty:p.stockqty,brand:p.brand,material:p.material,packsize:p.packsize,
      specifications:p.specifications,gtin:p.gtin,descriptionhindi:p.descriptionhindi,sizes:p.sizes,sizeprices:p.sizeprices,tags:p.tags,
      hasSizes:!!String(p.sizes || '').trim()
    };
    const generated = generateAiProductDraft_({
      imageUrl: aiAdminOptimizedImageUrl_(String(p.image || '').trim()),
      referenceUrls: gallery.map(aiAdminOptimizedImageUrl_),
      existing: existing,
      notes: 'Admin AI analysis for ' + p.id + ' — ' + p.name + '. Instruction: ' + instruction + '\nPreserve confirmed existing facts. Use product photos as evidence. Do not infer price, MRP, cost, stock, quantity, GTIN, exact sizes, size prices, certification, or health claims unless the instruction explicitly asks to modify a known existing value. Unknown facts must be null.',
      modelConfigId: body && body.modelConfigId,
      reasoningEffort: body && body.reasoningEffort
    }, actor);
    const raw = generated && generated.draft || {};
    ['sizes','tags'].forEach(function(key) { if (Array.isArray(raw[key])) raw[key] = raw[key].join(', '); });
    const patch = sanitizeAiAdminProductPatch_(raw);
    ['price','mrp','costprice','stock','stockqty','gtin','sizes','sizeprices'].forEach(function(key) { delete patch[key]; });
    if (onlyEmpty) {
      Object.keys(patch).forEach(function(key) {
        if (String(p[key] === null || p[key] === undefined ? '' : p[key]).trim() !== '') delete patch[key];
      });
    }
    return { id:String(p.id || ''), name:String(p.name || ''), current:aiAdminProductView_(p), suggestedPatch:patch, warnings:(generated.warnings || []).slice(0,4), expectedRevision:productRevision_(p) };
  } catch (err) {
    return { id:String(p.id || ''), name:String(p.name || ''), error:String(err && err.message || err).slice(0,300) };
  }
}

function aiAdminAnalyzeProducts_(args, body, actor) {
  if (!actor || actor.role === 'viewer') return { error: 'Viewer access cannot generate catalog edits.' };
  args = args && typeof args === 'object' ? args : {};
  const instruction = String(args.instruction || '').trim().slice(0, 1600);
  if (!instruction) return { error: 'instruction is required' };
  const ids = Array.isArray(args.ids) ? args.ids.map(function(x) { return String(x || '').trim(); }).filter(Boolean).slice(0, AI_ADMIN_TOOL_LIMITS_.visionProducts) : [];
  const wanted = {};
  ids.forEach(function(id) { wanted[id.toLowerCase()] = true; });
  const products = getAllProducts(true).filter(function(p) { return wanted[String(p.id || '').toLowerCase()] && !isArchived_(p); });
  const results = products.map(function(p) { return aiAdminAnalyzeOneProduct_(p, instruction, body, actor, args.onlyEmpty === true); });
  return { analyzed: results.length, results: results };
}

function aiAdminEnrichProducts_(args, body, actor) {
  if (!actor || actor.role === 'viewer') return { error: 'Viewer access cannot generate catalog edits.' };
  args = args && typeof args === 'object' ? args : {};
  const instruction = String(args.instruction || '').trim().slice(0, 1600);
  if (!instruction) return { error: 'instruction is required' };
  const query = args.query && typeof args.query === 'object' ? Object.assign({}, args.query) : {};
  query.status = query.status || 'active';
  query.includeDescriptions = false;
  query.includeImages = false;
  query.summary = false;
  query.similarNames = false;
  const limit = Math.max(1, Math.min(AI_ADMIN_TOOL_LIMITS_.enrichProducts, Math.floor(Number(args.limit) || 1)));
  query.limit = limit;
  const matched = aiAdminQueryProducts_(query);
  const ids = matched && Array.isArray(matched.products) ? matched.products.map(function(p) { return String(p.id || ''); }).filter(Boolean).slice(0, limit) : [];
  if (!ids.length) return { matchedCount: Number(matched && matched.count) || 0, analyzed:0, results:[], remainingCount:0 };
  const wanted = {};
  ids.forEach(function(id) { wanted[id.toLowerCase()] = true; });
  const products = getAllProducts(true).filter(function(p) { return wanted[String(p.id || '').toLowerCase()] && !isArchived_(p); });
  const results = products.map(function(p) { return aiAdminAnalyzeOneProduct_(p, instruction, body, actor, args.onlyEmpty === true); });
  return {
    matchedCount: Number(matched && matched.count) || results.length,
    analyzed: results.length,
    results: results,
    remainingCount: Math.max(0, (Number(matched && matched.count) || results.length) - results.length)
  };
}

function aiAdminQueryOrders_(args) {
  args = args && typeof args === 'object' ? args : {};
  let rows = rowsAsObjects_(getSheet_(ORDERS_SHEET));
  const status = String(args.status || '').trim().toLowerCase();
  if (status) rows = rows.filter(function(o) { return String(o.status || '').trim().toLowerCase() === status; });
  const text = String(args.text || '').trim().toLowerCase();
  if (text) rows = rows.filter(function(o) { return [o.orderid,o.customername,o.phone,o.status,o.paymentmethod,o.paymentstatus].join(' ').toLowerCase().indexOf(text) !== -1; });
  const limit = Math.max(1, Math.min(AI_ADMIN_TOOL_LIMITS_.orders, Math.floor(Number(args.limit) || 12)));
  return { count: rows.length, orders: rows.slice(-limit).reverse().map(aiAdminOrderView_), truncated: rows.length > limit };
}

function aiAdminGetDashboard_() {
  const d = getDashboardData();
  return { todayRevenue:d.todayRevenue,todayOrders:d.todayOrders,monthRevenue:d.monthRevenue,monthOrders:d.monthOrders,monthProfit:d.monthProfit,statusCounts:d.statusCounts || {},topProducts:(d.topProducts || []).slice(0,8),recentOrders:(d.recentOrders || []).slice(0,8).map(aiAdminOrderView_) };
}

function executeAiAdminTool_(request, body, actor) {
  const name = String(request && request.name || '').trim();
  const args = request && request.args && typeof request.args === 'object' ? request.args : {};
  if (name === 'query_products') return aiAdminQueryProducts_(args);
  if (name === 'get_products') return aiAdminGetProducts_(args);
  if (name === 'analyze_products') return aiAdminAnalyzeProducts_(args, body, actor);
  if (name === 'enrich_products') return aiAdminEnrichProducts_(args, body, actor);
  if (name === 'query_orders') return aiAdminQueryOrders_(args);
  if (name === 'get_dashboard') return aiAdminGetDashboard_();
  return { error: 'Unknown tool: ' + name };
}

function aiAdminToolProductIds_(value, out) {
  out = out || {};
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) { value.forEach(function(x) { aiAdminToolProductIds_(x, out); }); return out; }
  if (value.id && /^DSB-/i.test(String(value.id))) out[String(value.id)] = true;
  if (value.targetId && /^DSB-/i.test(String(value.targetId))) out[String(value.targetId)] = true;
  Object.keys(value).forEach(function(key) { if (key !== 'current') aiAdminToolProductIds_(value[key], out); });
  return out;
}
