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

const CATALOG_SESSION_KEY = 'dsb_catalog_v2';
let catalogRequest = null;
async function loadAllProducts(options = {}){
  if (catalogRequest) return catalogRequest;
  catalogRequest = (async () => {
    const api = CONFIG.SHEET_API_URL;
    if (!options.force && api) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(CATALOG_SESSION_KEY) || 'null');
        if (cached && cached.api === api && Date.now() - cached.time < 60000 && Array.isArray(cached.rows)) {
          ALL_PRODUCTS = normalizeRows(cached.rows); return ALL_PRODUCTS;
        }
      } catch (_) {}
    }
    // Sample data is available ONLY when deliberately configured for local demo mode.
    const payload = await requestJson(api ? api + '?action=products' : CONFIG.FALLBACK_FILE);
    const rows = Array.isArray(payload) ? payload : payload && payload.products;
    if (!Array.isArray(rows)) throw new Error('Could not load the catalogue. Please try again.');
    ALL_PRODUCTS = normalizeRows(rows);
    if (api) { try { sessionStorage.setItem(CATALOG_SESSION_KEY,JSON.stringify({api:api,time:Date.now(),rows:rows})); } catch (_) {} }
    return ALL_PRODUCTS;
  })();
  try { return await catalogRequest; } finally { catalogRequest = null; }
}

// One request for every review in the sheet, reduced down to a per-product
// average + count. Never blocks the product grid — call it alongside
// loadAllProducts() and just re-render once it resolves.
async function loadReviewSummaries(){
  if (!CONFIG.SHEET_API_URL) return REVIEW_SUMMARY;
  try{
    const payload = await requestJson(`${CONFIG.SHEET_API_URL}?action=reviews&summary=1`);

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
