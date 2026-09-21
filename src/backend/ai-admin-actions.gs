/* Sanitize AI replies into reviewable admin proposals. */

function sanitizeAiAdminChatResult_(parsed, context, actor) {
  const reply = String(parsed && parsed.reply || '').trim().slice(0, 7000) || 'I could not produce a useful reply. Please rephrase the request.';
  const raw = parsed && parsed.action && typeof parsed.action === 'object' ? parsed.action : {};
  const allowed = ['update_product','batch_update_products','add_product','update_order_status','archive_product'];
  const type = allowed.indexOf(String(raw.type || '')) !== -1 ? String(raw.type) : 'none';
  if (type === 'none' || !actor || actor.role === 'viewer') return { reply:reply, proposal:null };
  context = context || {};
  const permittedProducts = context.permittedProductIds || {};

  if (type === 'update_product') {
    const id = String(raw.targetId || '').trim();
    const product = getAllProducts(true).find(function(p){ return String(p.id || '') === id && !isArchived_(p); });
    if (!product || !permittedProducts[id]) return { reply:reply + '\n\nI did not attach the edit because that product was not verified through the catalog tools.', proposal:null };
    const patch = sanitizeAiAdminProductPatch_(raw.patch || {});
    delete patch.id;
    if (patch.stockqty !== undefined && patch.stock === undefined) patch.stock = Number(patch.stockqty) <= 0 ? 'out of stock' : 'in stock';
    if (!Object.keys(patch).length) return { reply:reply, proposal:null };
    return { reply:reply, proposal:{ type:type,title:String(raw.title || 'Update ' + id).slice(0,120),description:String(raw.description || 'Review these product changes before applying.').slice(0,500),targetId:id,patch:patch,current:aiAdminProductView_(product),expectedRevision:productRevision_(product),expectedStock:product.stock === undefined ? '' : product.stock,expectedStockqty:product.stockqty === undefined ? '' : product.stockqty } };
  }

  if (type === 'batch_update_products') {
    const incoming = Array.isArray(raw.items) ? raw.items.slice(0, AI_ADMIN_TOOL_LIMITS_.visionProducts) : [];
    const all = getAllProducts(true);
    const items = incoming.map(function(item){
      const id = String(item && item.targetId || '').trim();
      if (!id || !permittedProducts[id]) return null;
      const product = all.find(function(p){ return String(p.id || '') === id && !isArchived_(p); });
      if (!product) return null;
      const patch = sanitizeAiAdminProductPatch_(item.patch || {});
      delete patch.id;
      if (!Object.keys(patch).length) return null;
      return { targetId:id,title:String(item.title || product.name || id).slice(0,120),patch:patch,current:aiAdminProductView_(product),expectedRevision:productRevision_(product) };
    }).filter(Boolean);
    if (!items.length) return { reply:reply, proposal:null };
    return { reply:reply, proposal:{ type:type,title:String(raw.title || 'Catalog updates').slice(0,120),description:String(raw.description || 'Review each proposed product change before applying.').slice(0,500),items:items,remainingCount:Math.max(0, Number(raw.remainingCount) || 0) } };
  }

  if (type === 'add_product') {
    const patch = sanitizeAiAdminProductPatch_(raw.patch || {});
    delete patch.id;
    if (patch.stockqty !== undefined && patch.stock === undefined) patch.stock = Number(patch.stockqty) <= 0 ? 'out of stock' : 'in stock';
    return { reply:reply, proposal:{ type:type,title:String(raw.title || 'Create product').slice(0,120),description:String(raw.description || 'Review this new product before adding it.').slice(0,500),targetId:'',patch:patch } };
  }

  if (type === 'update_order_status') {
    const id = String(raw.targetId || '').trim(), status = String(raw.status || '').trim();
    if (!context.permittedOrderIds || !context.permittedOrderIds[id]) return { reply:reply, proposal:null };
    const order = rowsAsObjects_(getSheet_(ORDERS_SHEET)).find(function(o){ return String(o.orderid || '') === id; });
    if (!order || ALLOWED_ORDER_STATUSES.indexOf(status) < 0 || String(order.status || 'Pending') === status) return { reply:reply, proposal:null };
    return { reply:reply, proposal:{ type:type,title:String(raw.title || 'Change order status').slice(0,120),description:String(raw.description || ('Change ' + id + ' from ' + (order.status || 'Pending') + ' to ' + status + '.')).slice(0,500),targetId:id,status:status,currentStatus:String(order.status || 'Pending') } };
  }

  if (type === 'archive_product') {
    const id = String(raw.targetId || '').trim();
    if (!permittedProducts[id]) return { reply:reply + '\nPlease identify the product through the catalog first.', proposal:null };
    const product = getAllProducts(true).find(function(p){ return String(p.id || '') === id; });
    if (!product) return { reply:reply, proposal:null };
    const archived = raw.archived === true;
    if (isArchived_(product) === archived) return { reply:reply, proposal:null };
    return { reply:reply, proposal:{ type:type,title:String(raw.title || (archived ? 'Archive product' : 'Restore product')).slice(0,120),description:String(raw.description || ((archived ? 'Archive ' : 'Restore ') + id + '.')).slice(0,500),targetId:id,archived:archived,expectedRevision:productRevision_(product) } };
  }
  return { reply:reply, proposal:null };
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
