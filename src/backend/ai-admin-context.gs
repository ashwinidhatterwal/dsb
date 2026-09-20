/* Admin AI intent routing, compact session memory and task-scoped context. */

var AI_ADMIN_CONTEXT_LIMITS_ = {
  historyTurns: 8,
  historyChars: 1200,
  productMatches: 8,
  orderMatches: 8,
  stockRows: 16,
  recentOrders: 6,
  topProducts: 6,
  descriptionChars: 900
};

function sanitizeAiAdminHistory_(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-AI_ADMIN_CONTEXT_LIMITS_.historyTurns).map(function(item) {
    const role = item && item.role === 'assistant' ? 'assistant' : 'user';
    const text = String(item && item.text || '').trim().slice(0, AI_ADMIN_CONTEXT_LIMITS_.historyChars);
    return text ? { role: role, text: text, images: role === 'user' ? sanitizeAiAdminImageUrls_(item.images) : [] } : null;
  }).filter(Boolean);
}

function sanitizeAiAdminSessionState_(state) {
  state = state && typeof state === 'object' ? state : {};
  const out = {
    activeTab: String(state.activeTab || '').slice(0, 40),
    editingProductId: String(state.editingProductId || '').slice(0, 80),
    mode: String(state.mode || '').slice(0, 30),
    proposalType: String(state.proposalType || '').slice(0, 50)
  };
  if (Array.isArray(state.dirtyFields)) out.dirtyFields = state.dirtyFields.map(String).slice(0, 24);
  return out;
}

function classifyAiAdminIntent_(message, body, sessionState) {
  const text = String(message || '').toLowerCase();
  if (/\b(add|create|list|upload)\b[\s\S]{0,45}\b(new product|a product|this product|product|item|listing)\b/i.test(text)) return 'product_create';
  if (/\b(order|orders|customer|delivery|shipment|shipped|packed|pending order|fulfilled|cancelled)\b/i.test(text)) return 'orders';
  if (/\b(restock|restocking|low stock|out of stock|inventory|stock level|stock report)\b/i.test(text)) return 'inventory';
  if (/\b(today|dashboard|sales|revenue|profit|performance|summary|analytics|top products?|best selling|month)\b/i.test(text)) return 'analytics';
  if (/\b(instagram|caption|social|seo|meta description|tags?|copy)\b/i.test(text)) return 'content';
  if (/\b(product|listing|description|hindi|translate|enrich|details?|fields?|price|mrp|stock|archive|restore|DSB-)\b/i.test(text)) return 'product_edit';
  if (sessionState && sessionState.editingProductId) return 'product_edit';
  return 'general';
}

function aiAdminSearchTerms_(message) {
  return String(message || '').toLowerCase().split(/[^a-z0-9\u0900-\u097f._-]+/i)
    .map(function(x) { return x.trim(); })
    .filter(function(x) { return x.length >= 2; })
    .slice(0, 16);
}

function aiAdminProductScore_(p, terms) {
  const hay = [p.id, p.name, p.namehindi, p.category, p.subcategory, p.tags, p.brand, p.material].join(' ').toLowerCase();
  let score = 0;
  terms.forEach(function(term) {
    if (hay.indexOf(term) !== -1) score += term.length >= 5 ? 3 : 1;
    if (String(p.id || '').toLowerCase() === term) score += 20;
  });
  return score;
}

function aiAdminOrderScore_(o, terms) {
  const hay = [o.orderid, o.customername, o.phone, o.status, o.paymentstatus].join(' ').toLowerCase();
  let score = 0;
  terms.forEach(function(term) {
    if (hay.indexOf(term) !== -1) score += term.length >= 5 ? 3 : 1;
    if (String(o.orderid || '').toLowerCase() === term) score += 20;
  });
  return score;
}

function buildAiAdminContext_(message, intent, options) {
  options = options || {};
  const context = { intent: intent || 'general', session: sanitizeAiAdminSessionState_(options.sessionState) };
  const terms = aiAdminSearchTerms_(message);
  const needsProducts = ['product_edit', 'content', 'inventory'].indexOf(context.intent) !== -1;
  const products = needsProducts ? (options.products || getAllProducts(true)).filter(function(p) { return !isArchived_(p); }) : [];
  const target = options.target || { products: [], reason: 'not resolved' };

  if (context.intent === 'product_edit' || context.intent === 'content') {
    const matches = target.products && target.products.length ? target.products : products.map(function(p) {
      return { p: p, score: aiAdminProductScore_(p, terms) };
    }).filter(function(x) { return x.score > 0; }).sort(function(a, b) { return b.score - a.score; }).map(function(x) { return x.p; });
    context.target = { ids: (target.products || []).map(function(p) { return String(p.id || ''); }), reason: target.reason || '' };
    context.matchedProducts = matches.slice(0, AI_ADMIN_CONTEXT_LIMITS_.productMatches).map(function(p) { return context.intent === 'content' ? aiAdminContentProductView_(p) : aiAdminProductView_(p); });
    return context;
  }

  if (context.intent === 'inventory') {
    const low = products.filter(function(p) {
      return p.stockqty !== '' && p.stockqty !== null && p.stockqty !== undefined && Number(p.stockqty) >= 0 && Number(p.stockqty) <= 5;
    }).sort(function(a, b) { return Number(a.stockqty) - Number(b.stockqty); });
    const out = products.filter(function(p) {
      return String(p.stock || '').toLowerCase() === 'out of stock' || (p.stockqty !== '' && p.stockqty !== null && p.stockqty !== undefined && Number(p.stockqty) <= 0);
    });
    context.summary = { activeProducts: products.length, lowStockCount: low.length, outOfStockCount: out.length };
    context.lowStock = low.slice(0, AI_ADMIN_CONTEXT_LIMITS_.stockRows).map(aiAdminInventoryProductView_);
    context.outOfStock = out.slice(0, AI_ADMIN_CONTEXT_LIMITS_.stockRows).map(aiAdminInventoryProductView_);
    return context;
  }

  if (context.intent === 'orders') {
    const orders = rowsAsObjects_(getSheet_(ORDERS_SHEET));
    context.matchedOrders = orders.map(function(o) { return { o: o, score: aiAdminOrderScore_(o, terms) }; })
      .filter(function(x) { return x.score > 0; }).sort(function(a, b) { return b.score - a.score; })
      .slice(0, AI_ADMIN_CONTEXT_LIMITS_.orderMatches).map(function(x) { return aiAdminOrderView_(x.o); });
    if (!context.matchedOrders.length) context.recentOrders = orders.slice(-AI_ADMIN_CONTEXT_LIMITS_.recentOrders).reverse().map(aiAdminOrderView_);
    context.summary = { totalOrders: orders.length };
    return context;
  }

  if (context.intent === 'analytics') {
    const dashboard = getDashboardData();
    context.summary = {
      todayRevenue: dashboard.todayRevenue,
      todayOrders: dashboard.todayOrders,
      monthRevenue: dashboard.monthRevenue,
      monthOrders: dashboard.monthOrders,
      monthProfit: dashboard.monthProfit,
      statusCounts: dashboard.statusCounts || {}
    };
    context.recentOrders = (dashboard.recentOrders || []).slice(0, AI_ADMIN_CONTEXT_LIMITS_.recentOrders).map(aiAdminOrderView_);
    context.topProducts = (dashboard.topProducts || []).slice(0, AI_ADMIN_CONTEXT_LIMITS_.topProducts);
    return context;
  }

  return context;
}

function aiAdminProductView_(p) {
  const max = AI_ADMIN_CONTEXT_LIMITS_.descriptionChars;
  return {
    id: String(p.id || ''), name: String(p.name || ''), namehindi: String(p.namehindi || ''),
    category: String(p.category || ''), subcategory: String(p.subcategory || ''),
    price: safeNumber_(p.price, 0), mrp: safeNumber_(p.mrp, 0),
    costprice: p.costprice === '' || p.costprice === null || p.costprice === undefined ? '' : safeNumber_(p.costprice, 0),
    stock: String(p.stock || ''), stockqty: p.stockqty === '' || p.stockqty === null || p.stockqty === undefined ? '' : safeNumber_(p.stockqty, 0),
    brand: String(p.brand || ''), material: String(p.material || ''), packsize: String(p.packsize || ''), sizes: String(p.sizes || ''), tags: String(p.tags || ''),
    description: String(p.description || '').slice(0, max), descriptionhindi: String(p.descriptionhindi || '').slice(0, max), specifications: String(p.specifications || '').slice(0, max),
    gtin: String(p.gtin || ''), hasImage: !!String(p.image || '').trim()
  };
}

function aiAdminContentProductView_(p) {
  return {
    id: String(p.id || ''), name: String(p.name || ''), namehindi: String(p.namehindi || ''),
    category: String(p.category || ''), subcategory: String(p.subcategory || ''),
    price: safeNumber_(p.price, 0), mrp: safeNumber_(p.mrp, 0),
    brand: String(p.brand || ''), material: String(p.material || ''), packsize: String(p.packsize || ''),
    sizes: String(p.sizes || ''), tags: String(p.tags || ''),
    description: String(p.description || '').slice(0, AI_ADMIN_CONTEXT_LIMITS_.descriptionChars),
    descriptionhindi: String(p.descriptionhindi || '').slice(0, AI_ADMIN_CONTEXT_LIMITS_.descriptionChars),
    specifications: String(p.specifications || '').slice(0, AI_ADMIN_CONTEXT_LIMITS_.descriptionChars)
  };
}

function aiAdminInventoryProductView_(p) {
  return {
    id: String(p.id || ''), name: String(p.name || ''),
    stock: String(p.stock || ''),
    stockqty: p.stockqty === '' || p.stockqty === null || p.stockqty === undefined ? '' : safeNumber_(p.stockqty, 0)
  };
}

function aiAdminOrderView_(o) {
  return {
    orderid: String(o.orderid || ''), date: String(o.date || ''), customername: String(o.customername || ''),
    phone: (function(v) { v = String(v || '').replace(/\D/g, ''); return v ? ('••••••' + v.slice(-4)) : ''; })(o.phone),
    status: String(o.status || 'Pending'), paymentmethod: String(o.paymentmethod || ''), paymentstatus: String(o.paymentstatus || 'Unverified'), total: safeNumber_(o.total, 0)
  };
}
