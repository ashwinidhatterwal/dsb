/* =========================================================
   Dhatterwal Suhag Bhandar — storefront (index) logic
   Shared config/cart/product/rendering code lives in:
   config.js, utils.js, cart.js, products-data.js, render-helpers.js, cart-ui.js
   ========================================================= */
let CATEGORIES = {}; // { category: Set(subcategories) }
let activeCategory = 'All';
let activeSubcategory = 'All';
let searchQuery = '';
let sortMode = 'featured';
let inStockOnly = false;

/* ---------------- Data loading ---------------- */
function renderSkeletonGrid(container, count){
  container.innerHTML = Array.from({ length: count || 8 }).map(() => `
    <div class="card skeleton-card">
      <div class="skeleton skel-img"></div>
      <div class="body">
        <div class="skeleton skel-line"></div>
        <div class="skeleton skel-line short"></div>
      </div>
    </div>
  `).join('');
}

async function loadProductsForShop(){
  // Products drive the whole page and shouldn't wait on reviews; review
  // summaries are fetched in parallel and just re-drawn in once they land.
  const reviewsPromise = loadReviewSummaries();
  try { await loadAllProducts(); }
  catch (err) {
    $('#productGrid').innerHTML = '<div class="empty-state"><p>Could not load the catalogue. Please try again.</p><button type="button" class="ghost-btn" id="catalogRetry">Try again</button></div>';
    $('#resultCount').textContent = '';
    $('#catalogRetry').addEventListener('click',loadProductsForShop,{once:true});
    return;
  }
  buildCategoryMap();
  applyCategoryFromUrl();
  renderCategoryRail();
  renderGrid();
  renderHomeCarousels();
  reviewsPromise.then(() => {
    updateVisibleRatings();
    const rail=$('#popularPicksRail');
    if(rail && !rail.dataset.engaged && rail.scrollLeft===0)renderCarousel('popularPicksSection','popularPicksRail',popularProducts(10));
  });
  if($('#searchOverlay')?.classList.contains('open'))renderSearchResults();
  initScrollReveal();
}

/* ---------------- Homepage identity: Popular Picks + New Arrivals ---------------- */
// "Popular" ranks by review volume × average rating (real signal, once
// reviews exist). Until then it quietly falls back to the biggest discounts,
// so the rail is never empty on a brand-new store.
function popularProducts(limit){
  const available=ALL_PRODUCTS.filter(p=>!isOutOfStock(p));
  const score=p=>{const r=reviewSummaryFor(p.id);return r?.count?r.avg*Math.log1p(r.count):0;};
  return available.slice().sort((a,b)=>score(b)-score(a)||discountPct(b)-discountPct(a)).slice(0,limit);
}

function newArrivalProducts(limit){
  return ALL_PRODUCTS.filter(p => !isOutOfStock(p)).slice(-limit).reverse();
}

function renderHomeCarousels(){
  renderCarousel('popularPicksSection', 'popularPicksRail', popularProducts(10));
  renderCarousel('newArrivalsSection', 'newArrivalsRail', newArrivalProducts(10));
}

function renderCarousel(sectionId, railId, list){
  const section = document.getElementById(sectionId);
  const rail = document.getElementById(railId);
  if (!section || !rail) return;
  if (!list.length){
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  rail.innerHTML = list.map(cardHtml).join('');
  bindCardEvents($$('.card', rail), list);
}

function applyCategoryFromUrl(){
  const params = new URLSearchParams(location.search);
  activeCategory='All';activeSubcategory='All';
  sortMode=['newest','price-asc','price-desc'].includes(params.get('sort'))?params.get('sort'):'featured';
  inStockOnly=params.get('stock')==='1';
  $('#sortSelect').value=sortMode;$('#inStockOnly').checked=inStockOnly;
  const cat = params.get('category');
  if (cat && CATEGORIES[cat]){
    activeCategory = cat;
    const sub = params.get('subcategory');
    if (sub && CATEGORIES[cat].has(sub)) activeSubcategory = sub;
  }
}

function buildCategoryMap(){
  CATEGORIES = {};
  ALL_PRODUCTS.forEach(p => {
    if (!CATEGORIES[p.category]) CATEGORIES[p.category] = new Set();
    CATEGORIES[p.category].add(p.subcategory);
  });
}

/* ---------------- Rendering: category rail ---------------- */
function renderCategoryRail(){
  const rail = $('#catRail');
  const cats = ['All', ...Object.keys(CATEGORIES).sort()];
  rail.innerHTML = cats.map(c =>
    `<button class="chip ${c===activeCategory?'active':''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join('');
  $$('.chip', rail).forEach(btn => btn.addEventListener('click', () => {
    activeCategory = btn.dataset.cat;
    activeSubcategory = 'All';
    renderCategoryRail();
    renderSubchipRow();
    renderGrid();
    // Keep the shopper's scroll position stable when switching categories.
    // The previous auto-scroll made category browsing feel broken on mobile.
  }));
  renderSubchipRow();
}

function renderSubchipRow(){
  const row = $('#subchipRow');
  if (activeCategory === 'All' || !CATEGORIES[activeCategory]){
    row.innerHTML = '';
    row.style.display = 'none';
    return;
  }
  row.style.display = 'flex';
  const subs = ['All', ...Array.from(CATEGORIES[activeCategory]).sort()];
  row.innerHTML = subs.map(s =>
    `<button class="subchip ${s===activeSubcategory?'active':''}" data-sub="${escapeHtml(s)}">${escapeHtml(s)}</button>`
  ).join('');
  $$('.subchip', row).forEach(btn => btn.addEventListener('click', () => {
    activeSubcategory = btn.dataset.sub;
    renderSubchipRow();
    renderGrid();
  }));
}

/* ---------------- Infinite scroll pager ----------------
   Renders products in batches instead of all at once, so a catalogue of
   hundreds of items stays smooth. Loads the next batch automatically when
   the sentinel element scrolls near the bottom of the viewport. */
const PAGE_SIZE = 24;

function createPager(container, sentinelEl){
  let list = [];
  let renderedCount = 0;

  function renderNextBatch(){
    const next = list.slice(renderedCount, renderedCount + PAGE_SIZE);
    if (!next.length){
      if (sentinelEl) sentinelEl.style.display = 'none';
      return;
    }
    const template = document.createElement('template');
    template.innerHTML = next.map((p,i)=>cardHtml(p,{eager:container.id==='productGrid' && renderedCount===0 && i<2})).join('');
    const cards = Array.from(template.content.children);
    container.appendChild(template.content);
    bindCardEvents(cards, list);
    renderedCount += next.length;
    if (sentinelEl) sentinelEl.style.display = renderedCount >= list.length ? 'none' : 'block';
  }

  function reset(newList, emptyMessage,preserve=false){
    const target=preserve?Math.max(PAGE_SIZE,renderedCount):PAGE_SIZE;
    list = newList;
    renderedCount = 0;
    container.innerHTML = '';
    if (!list.length){
      container.innerHTML = `<div class="empty-state">${emptyMessage || 'No products found here yet.<br>Try another category or search term.'}</div>`;
      if (sentinelEl) sentinelEl.style.display = 'none';
      return;
    }
    do{renderNextBatch();}while(renderedCount<Math.min(target,list.length));
  }

  if (sentinelEl && 'IntersectionObserver' in window){
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) renderNextBatch(); });
    }, { rootMargin: '600px 0px' });
    observer.observe(sentinelEl);
  }

  return { reset };
}

let gridPager, searchPager;

/* ---------------- Rendering: product grid ---------------- */
function filteredProducts(){
  return ALL_PRODUCTS.filter(p => {
    if (activeCategory !== 'All' && p.category !== activeCategory) return false;
    if (activeSubcategory !== 'All' && p.subcategory !== activeSubcategory) return false;
    if (inStockOnly && isOutOfStock(p)) return false;
    return true;
  });
}

// "Featured" keeps the sheet's natural order untouched. "Newest" reverses
// it, since new rows are added at the bottom of the sheet. Price sorts are
// a plain numeric sort — none of this mutates ALL_PRODUCTS itself.
function sortProducts(list){
  if (sortMode === 'newest') return list.slice().reverse();
  if (sortMode === 'price-asc') return list.slice().sort((a, b) => a.price - b.price);
  if (sortMode === 'price-desc') return list.slice().sort((a, b) => b.price - a.price);
  return list;
}

function renderGrid(preserve=false){
  saveBrowseUrl();
  const list = sortProducts(filteredProducts());
  $('#resultCount').textContent = `${list.length} item${list.length===1?'':'s'}`;
  gridPager.reset(list,undefined,preserve);
}

/* ---------------- Search overlay ---------------- */
function openSearch(){
  $('#searchOverlay').classList.add('open');
  $('#searchInput2').value = searchQuery;
  openDialogFocus($('#searchOverlay'),closeSearch);
  $('#searchInput2').focus();
  renderSearchResults();
}
function closeSearch(){ $('#searchOverlay').classList.remove('open'); closeDialogFocus($('#searchOverlay')); }
function renderSearchResults(){
  const q = searchQuery.trim().toLowerCase();
  if (!q){
    $('#searchSentinel').style.display = 'none';
    $('#searchResults').innerHTML = `<div class="empty-state">Start typing to search products…</div>`;
    return;
  }
  const list = ALL_PRODUCTS.filter(p =>
    `${p.name} ${p.nameHindi || ''} ${p.category} ${p.subcategory} ${p.tags}`.toLowerCase().includes(q) &&
    (!inStockOnly || !isOutOfStock(p))
  );
  searchPager.reset(list, `No results for "${escapeHtml(searchQuery)}"`);
}

/* ---------------- Wire up static UI ---------------- */
function initUI(){
  gridPager = createPager($('#productGrid'), $('#gridSentinel'));
  searchPager = createPager($('#searchResults'), $('#searchSentinel'));
  renderSkeletonGrid($('#productGrid'), 8);

  // Scroll events can fire dozens of times per frame on mobile. Queue the
  // visual navbar update once per animation frame without changing the effect.
  let stickyTicking = false;
  window.addEventListener('scroll', () => {
    if (stickyTicking) return;
    stickyTicking = true;
    requestAnimationFrame(() => {
      $('#stickyBar').classList.toggle('solid', window.scrollY > 8);
      stickyTicking = false;
    });
  }, { passive: true });

  $('#searchTrigger').addEventListener('click', openSearch);
  $('#searchOverlayClose').addEventListener('click', closeSearch);
  let searchTimer;
  $('#searchInput2').addEventListener('input', (e) => { searchQuery = e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(renderSearchResults,120); });
  if(new URLSearchParams(location.search).get('search')==='1')openSearch();

  $('#cartTrigger').addEventListener('click', openCart);
  $('#cartOverlay').addEventListener('click', (e) => { if (e.target.id === 'cartOverlay') closeCart(); });

  $('#sortSelect').addEventListener('change', (e) => { sortMode = e.target.value; renderGrid(); });
  $('#inStockOnly').addEventListener('change', (e) => { inStockOnly = e.target.checked; renderGrid(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape'){ closeCart(); closeSearch(); }
  });

  document.querySelectorAll('.carousel-section .related-rail').forEach(rail=>{
    rail.addEventListener('pointerdown',()=>{rail.dataset.engaged='1';},{passive:true});
    rail.addEventListener('keydown',event=>{
      rail.dataset.engaged='1';
      if(event.target===rail && ['ArrowLeft','ArrowRight'].includes(event.key)){
        event.preventDefault();rail.scrollBy({left:(event.key==='ArrowRight'?1:-1)*rail.clientWidth*.8,behavior:prefersReducedMotion()?'instant':'smooth'});
      }
    });
  });
  updateCartBadge();
}

document.addEventListener('dsb:languagechange', () => { renderCategoryRail(); renderSubchipRow(); renderGrid(); if ($('#searchOverlay')?.classList.contains('open')) renderSearchResults(); renderHomeCarousels(); });

document.addEventListener('DOMContentLoaded', () => {
  initUI();
  initWhatsAppFloat();
  loadProductsForShop();
});

function saveBrowseUrl(){
  const url=new URL(location.href);
  for(const [key,value] of Object.entries({category:activeCategory==='All'?'':activeCategory,subcategory:activeSubcategory==='All'?'':activeSubcategory,sort:sortMode==='featured'?'':sortMode,stock:inStockOnly?'1':''})){
    if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);
  }
  history.replaceState(null,'',url);
}
window.addEventListener('popstate',()=>{if(!gridPager)return;applyCategoryFromUrl();renderCategoryRail();renderGrid();});

function updateCatalogNotice(){
  const el=$('#catalogNotice');if(!el)return;
  el.hidden=CATALOG_META.source==='live' || CATALOG_META.source==='loading';
  el.textContent='Showing saved products. Current prices and stock are checked when you order.';
}
document.addEventListener('dsb:catalogstatus',updateCatalogNotice);
document.addEventListener('dsb:catalogchange',()=>{
  if(!gridPager)return;
  const anchor=Array.from(document.querySelectorAll('#productGrid .card')).find(c=>c.getBoundingClientRect().bottom>80);
  const id=anchor?.dataset.id,top=anchor?.getBoundingClientRect().top;
  buildCategoryMap();if(activeCategory!=='All' && !CATEGORIES[activeCategory]){activeCategory='All';activeSubcategory='All';}
  renderCategoryRail();renderGrid(true);renderHomeCarousels();initScrollReveal();
  if($('#searchOverlay')?.classList.contains('open'))renderSearchResults();
  if(id && !document.body.classList.contains('modal-open'))requestAnimationFrame(()=>{
    const next=Array.from(document.querySelectorAll('#productGrid .card')).find(c=>c.dataset.id===id);
    if(next)window.scrollBy({top:next.getBoundingClientRect().top-top,behavior:'instant'});
  });
});
