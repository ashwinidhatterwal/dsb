/* Compact Admin AI session helpers and safe data views. */

var AI_ADMIN_CONTEXT_LIMITS_ = { historyTurns: 8, historyChars: 1200, descriptionChars: 900 };

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

function aiAdminProductView_(p) {
  const max = AI_ADMIN_CONTEXT_LIMITS_.descriptionChars;
  return {
    id:String(p.id || ''), name:String(p.name || ''), namehindi:String(p.namehindi || ''),
    category:String(p.category || ''), subcategory:String(p.subcategory || ''),
    price:safeNumber_(p.price, 0), mrp:safeNumber_(p.mrp, 0),
    costprice:p.costprice === '' || p.costprice === null || p.costprice === undefined ? '' : safeNumber_(p.costprice, 0),
    stock:String(p.stock || ''), stockqty:p.stockqty === '' || p.stockqty === null || p.stockqty === undefined ? '' : safeNumber_(p.stockqty, 0),
    brand:String(p.brand || ''), material:String(p.material || ''), packsize:String(p.packsize || ''), sizes:String(p.sizes || ''), tags:String(p.tags || ''),
    description:String(p.description || '').slice(0,max), descriptionhindi:String(p.descriptionhindi || '').slice(0,max), specifications:String(p.specifications || '').slice(0,max),
    gtin:String(p.gtin || ''), hasImage:!!String(p.image || '').trim()
  };
}

function aiAdminOrderView_(o) {
  return {
    orderid:String(o.orderid || ''), date:String(o.date || ''), customername:String(o.customername || ''),
    phone:(function(v){ v=String(v || '').replace(/\D/g,''); return v ? ('••••••' + v.slice(-4)) : ''; })(o.phone),
    status:String(o.status || 'Pending'), paymentmethod:String(o.paymentmethod || ''), paymentstatus:String(o.paymentstatus || 'Unverified'), total:safeNumber_(o.total,0)
  };
}
