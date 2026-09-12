/* =========================================================
   Dhatterwal Suhag Bhandar — shared product data loading
   ========================================================= */
let ALL_PRODUCTS = [];
// { [productId]: { avg: number, count: number } } — built once from every
// review in the sheet so product cards can show a star rating + review
// count without a separate fetch per card.
let REVIEW_SUMMARY = {};

function normalizeRows(rows){
  return (rows || [])
    .filter(r => r && (r.id || r.ID))
    .map(r => {
      const rawQty = r.stockqty ?? r.stockQty ?? r.StockQty ?? r.stock_qty;
      const hasQty = rawQty !== undefined && rawQty !== null && String(rawQty).trim() !== '';
      const mainImage = String(r.image ?? r.Image ?? '').trim() || `https://placehold.co/400x400/C81163/FFF6E9?text=${encodeURIComponent((r.name||'Item').slice(0,14))}`;
      const extraImages = String(r.images ?? r.Images ?? '')
        .split(',').map(s => s.trim()).filter(Boolean);
      return {
        id: String(r.id ?? r.ID ?? '').trim(),
        name: String(r.name ?? r.Name ?? '').trim(),
        sizes: [...new Set(String(r.sizes ?? r.Sizes ?? '').split(/[,\n]/).map(x=>x.trim()).filter(Boolean))],
        sizePrices: (()=>{try{const raw=r.sizeprices ?? r.sizePrices ?? r.SizePrices ?? '';const obj=raw&&typeof raw==='object'?raw:JSON.parse(String(raw||'{}'));const out={};Object.entries(obj||{}).forEach(([k,v])=>{const n=Number(v);if(k&&Number.isFinite(n)&&n>0)out[String(k).trim()]=n;});return out;}catch(_){return {};}})(),
        nameHindi: String(r.namehindi ?? r.nameHindi ?? '').trim(),
        category: String(r.category ?? r.Category ?? 'Other').trim() || 'Other',
        subcategory: String(r.subcategory ?? r.Subcategory ?? 'General').trim() || 'General',
        price: Number(r.price ?? r.Price ?? 0),
        mrp: Number(r.mrp ?? r.MRP ?? r.price ?? 0) || Number(r.price ?? 0),
        image: mainImage,
        // Full photo set for the product-page gallery, main image first,
        // never duplicated if it was also pasted into the extra list.
        gallery: [mainImage, ...extraImages.filter(u => u !== mainImage)],
        description: String(r.description ?? r.Description ?? '').trim(),
        stock: String(r.stock ?? r.Stock ?? 'in stock').trim().toLowerCase(),
        // null means "not tracked" — this product behaves exactly like before,
        // using only the plain in-stock/out-of-stock text above.
        stockQty: hasQty ? Number(rawQty) : null,
        tags: String(r.tags ?? r.Tags ?? '').trim()
      };
    });
}

// A product is unavailable if it's explicitly marked out of stock, OR if its
// tracked quantity has hit zero.
function isOutOfStock(p){
  if (p.stock === 'out of stock' || !Number.isFinite(p.price) || p.price <= 0) return true;
  if (p.stockQty !== null && p.stockQty <= 0) return true;
  return false;
}

// Shows a friendly "Only X left" nudge once a tracked product gets low —
// never shown for products that aren't quantity-tracked at all.
function lowStockLabel(p){
  if (p.stockQty === null) return '';
  if (p.stockQty <= 0) return '';
  if (p.stockQty <= 5) return `Only ${p.stockQty} left`;
  return '';
}

const CATALOG_SESSION_KEY = 'dsb_catalog_v3';
let catalogRequest=null, catalogLiveRequest=null;
let CATALOG_META={source:'loading',time:0};
const CATALOG_MAX_AGE=24*60*60*1000;
function applyCatalogRows(rows,source,time){
  const products=normalizeRows(rows),changed=JSON.stringify(products)!==JSON.stringify(ALL_PRODUCTS);
  const hadProducts=ALL_PRODUCTS.length>0;
  ALL_PRODUCTS=products;CATALOG_META={source,time};
  if(hadProducts && changed)document.dispatchEvent(new CustomEvent('dsb:catalogchange'));
  document.dispatchEvent(new CustomEvent('dsb:catalogstatus'));
  return ALL_PRODUCTS;
}
async function refreshLiveCatalog(){
  if(catalogLiveRequest)return catalogLiveRequest;
  catalogLiveRequest=(async()=>{
    const api=CONFIG.SHEET_API_URL;
    const payload=await requestJson(api?api+'?action=products':CONFIG.FALLBACK_FILE);
    const rows=Array.isArray(payload)?payload:payload?.products;
    if(!Array.isArray(rows))throw new Error('Could not load the catalogue. Please try again.');
    const time=Date.now();
    try{sessionStorage.setItem(CATALOG_SESSION_KEY,JSON.stringify({api,time,rows}));}catch(_){}
    return applyCatalogRows(rows,'live',time);
  })();
  try{return await catalogLiveRequest;}finally{catalogLiveRequest=null;}
}
async function loadAllProducts(options={}){
  if(options.force)return refreshLiveCatalog();
  if(catalogRequest)return catalogRequest;
  catalogRequest=(async()=>{
    try{
      const cached=JSON.parse(sessionStorage.getItem(CATALOG_SESSION_KEY)||'null');
      if(cached?.api===CONFIG.SHEET_API_URL && Array.isArray(cached.rows) && Date.now()-cached.time<CATALOG_MAX_AGE){
        const fresh=Date.now()-cached.time<60000;
        applyCatalogRows(cached.rows,fresh?'live':'cached',cached.time);
        if(!fresh)setTimeout(()=>refreshLiveCatalog().catch(()=>{}),0);
        return ALL_PRODUCTS;
      }
    }catch(_){}
    const live=refreshLiveCatalog();
    const snapshot=requestJson('catalog-snapshot.json',{cache:'no-cache'},5000).then(data=>{
      if(!Array.isArray(data.rows) || data.api!==CONFIG.SHEET_API_URL || !Number.isFinite(data.generatedAt) || Date.now()-data.generatedAt>CATALOG_MAX_AGE || data.generatedAt>Date.now()+60000)throw new Error('Catalogue snapshot expired.');
      if(CATALOG_META.source==='live')return ALL_PRODUCTS;
      return applyCatalogRows(data.rows,'snapshot',data.generatedAt);
    });
    return Promise.any([live,snapshot]);
  })();
  try{return await catalogRequest;}finally{catalogRequest=null;}
}
const publicDataRequests=new Map();
async function cachedPublicJson(key,url,ttl=180000,force=false){
  const storageKey='dsb_public_'+key,api=CONFIG.SHEET_API_URL;
  if(!force){try{const c=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(c?.api===api && Date.now()-c.time<ttl)return c.data;}catch(_){}}
  if(publicDataRequests.has(key))return publicDataRequests.get(key);
  const request=requestJson(url).then(data=>{
    if(data?.error)throw new Error(data.error);
    try{sessionStorage.setItem(storageKey,JSON.stringify({api,time:Date.now(),data}));}catch(_){}
    return data;
  });
  publicDataRequests.set(key,request);
  try{return await request;}finally{publicDataRequests.delete(key);}
}
function invalidateReviewCache(productId){
  for(const key of ['review-summary','reviews-'+productId]){try{sessionStorage.removeItem('dsb_public_'+key);}catch(_){}}
}
// One request for every review in the sheet, reduced down to a per-product
// average + count. Never blocks the product grid — call it alongside
// loadAllProducts() and just re-render once it resolves.
async function loadReviewSummaries(){
  if (!CONFIG.SHEET_API_URL) return REVIEW_SUMMARY;
  try{
    const payload = await cachedPublicJson('review-summary',`${CONFIG.SHEET_API_URL}?action=reviews&summary=1`);

    // The current Apps Script endpoint already returns the compact
    // { productId: { avg, count } } map. Use it directly instead of
    // rebuilding it in the browser. Keep array support for older deployments.
    if (payload && !Array.isArray(payload) && typeof payload === 'object') {
      REVIEW_SUMMARY = payload;
      return REVIEW_SUMMARY;
    }

    if (!Array.isArray(payload)) return REVIEW_SUMMARY;
    const totals = {};
    payload.forEach(r => {
      const pid = String(r.productid ?? r.productId ?? '').trim();
      if (!pid) return;
      if (!totals[pid]) totals[pid] = { sum: 0, count: 0 };
      totals[pid].sum += Number(r.rating) || 0;
      totals[pid].count += 1;
    });
    const summary = {};
    Object.keys(totals).forEach(pid => {
      summary[pid] = { avg: totals[pid].sum / totals[pid].count, count: totals[pid].count };
    });
    REVIEW_SUMMARY = summary;
  } catch(err){
    console.error('Failed to load review summaries', err);
  }
  return REVIEW_SUMMARY;
}

function reviewSummaryFor(id){
  return REVIEW_SUMMARY[id] || null;
}
