/* =========================================================
   Dhatterwal Suhag Bhandar — product detail page logic
   ========================================================= */
let CURRENT_PRODUCT = null;
let selectedRating = 5;

function getProductIdFromUrl(){
  return new URLSearchParams(location.search).get('id') || '';
}

// renderStars() lives in utils.js now — shared with product cards.

function renderProductSkeleton(){
  $('#pdRoot').innerHTML = `
    <div class="pd-wrap">
      <div class="skeleton skel-line short" style="width:35%; height:11px;"></div>
      <div class="skeleton skel-img" style="border-radius:14px; margin:12px 0 16px;"></div>
      <div class="skeleton skel-line" style="width:75%; height:16px; margin:0 0 10px;"></div>
      <div class="skeleton skel-line" style="width:35%; height:22px; margin:0 0 16px;"></div>
      <div class="skeleton skel-line" style="margin:0 0 6px;"></div>
      <div class="skeleton skel-line short"></div>
    </div>`;
}

async function init(){
  const root = $('#pdRoot');
  const id = getProductIdFromUrl().trim();
  renderProductSkeleton();

  if (!id){
    root.innerHTML = `
      <div class="empty-state" style="padding:60px 16px;">
        This product link is incomplete.<br>
        <a href="index.html" class="ghost-btn" style="display:inline-block; margin-top:12px; text-decoration:none;">← Back to shop</a>
      </div>`;
    return;
  }

  try{
    // Ratings are optional decoration; they must never prevent the actual
    // product from loading if an older cached shared script is present.
    const reviewsPromise = (typeof loadReviewSummaries === 'function')
      ? loadReviewSummaries().catch(() => ({}))
      : Promise.resolve({});

    await loadAllProducts();
    const product = ALL_PRODUCTS.find(p => String(p.id).trim() === id);
    if (!product){
      document.querySelector('meta[name="robots"]')?.setAttribute('content','noindex, follow');
      root.innerHTML = `
        <div class="empty-state" style="padding:60px 16px;">
          Couldn't find that product.<br>
          <a href="index.html" class="ghost-btn" style="display:inline-block; margin-top:12px; text-decoration:none;">← Back to shop</a>
        </div>`;
      return;
    }

    CURRENT_PRODUCT = product;
    renderProduct(product);
    renderRelated(product);
    loadReviews(product.id);
    reviewsPromise.then(() => {
      if (CURRENT_PRODUCT && CURRENT_PRODUCT.id === product.id) renderRelated(product);
    });
  } catch(err){
    console.error('Product page failed to initialise', err);
    root.innerHTML = `
      <div class="empty-state" style="padding:60px 16px;">
        Couldn't load this product right now.<br>
        <button type="button" class="ghost-btn" id="pdRetryBtn" style="margin-top:12px;">Try again</button>
        <a href="index.html" class="ghost-btn" style="display:inline-block; margin-top:12px; text-decoration:none;">← Back to shop</a>
      </div>`;
    $('#pdRetryBtn')?.addEventListener('click', init, { once:true });
  }
}

function renderProduct(p){
  const disc = discountPct(p);
  const outOfStock = isOutOfStock(p);
  const low = lowStockLabel(p);
  $('#pdRoot').innerHTML = `
    <div class="pd-wrap">
      <div class="pd-breadcrumb">
        <a href="index.html">Shop</a> /
        <a href="index.html?category=${encodeURIComponent(p.category)}">${escapeHtml(p.category)}</a> /
        <a href="index.html?category=${encodeURIComponent(p.category)}&subcategory=${encodeURIComponent(p.subcategory)}">${escapeHtml(p.subcategory)}</a>
      </div>
      <div class="pd-gallery">
        ${disc ? `<span class="discount">${disc}% OFF</span>` : ''}
        <div class="pd-gallery-track" id="pdGalleryTrack">
          ${p.gallery.map((src, i) => `<div class="pd-slide"><img src="${escapeHtml(productImageUrl(src,1200))}" alt="${escapeHtml(customerProductName(p))}" decoding="async" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}></div>`).join('')}
        </div>
        ${p.gallery.length > 1 ? `
        <div class="pd-dots" id="pdDots">
          ${p.gallery.map((_, i) => `<span class="pd-dot ${i===0?'active':''}"></span>`).join('')}
        </div>` : ''}
      </div>
      <h1 class="pd-title">${escapeHtml(customerProductName(p))}</h1>
      ${customerProductSecondaryName(p) ? `<div class="pd-title-hindi">${escapeHtml(customerProductSecondaryName(p))}</div>` : ''}
      <div class="pd-prices">
        <span class="price">${money(p.price)}</span>
        ${p.mrp > p.price ? `<span class="mrp">${money(p.mrp)}</span>` : ''}
        ${disc ? `<span class="discount" style="position:static; display:inline-block;">${disc}% OFF</span>` : ''}
      </div>
      <div class="pd-stock ${outOfStock ? 'out' : 'in'}">${outOfStock ? 'Out of stock' : (low || 'In stock')}</div>
      <div class="pd-links">
        <button type="button" class="pd-link-btn" id="pdShareBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/></svg>
          Share
        </button>
        ${needsSizeGuide(p) ? `
        <button type="button" class="pd-link-btn" id="pdSizeGuideBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 6v3M11 6v5M15 6v3M19 6v5"/></svg>
          Size guide
        </button>` : ''}
      </div>
      <p class="pd-desc">${escapeHtml(p.description || 'No description added yet.')}</p>
      <div class="pd-id">Product ID: ${escapeHtml(p.id)}</div>
      <div class="pd-actions" id="pdActions"></div>
    </div>
    <div class="related-section" id="relatedSection" style="display:none;">
      <div class="section-title"><h2>You may also like</h2></div>
      <div class="related-rail" id="relatedRail"></div>
    </div>
    <div class="reviews-section">
      <div class="section-title"><h2>Ratings & feedback</h2></div>
      <div id="reviewSummary" class="review-summary"></div>
      <div class="review-form">
        <h3>Leave your feedback</h3>
        <div class="field">
          <label>Your rating</label>
          <div class="star-input" id="starInput"></div>
        </div>
        <div class="field">
          <label for="revName">Your name</label>
          <input type="text" id="revName" placeholder="Your name">
        </div>
        <div class="field">
          <label for="revComment">Your feedback</label>
          <textarea id="revComment" placeholder="How was the product?"></textarea>
        </div>
        <button class="primary-btn" id="submitReviewBtn" style="width:100%;">Submit feedback</button>
        <div class="checkout-honeypot" aria-hidden="true"><label>Website<input id="reviewWebsite" tabindex="-1" autocomplete="off"></label></div><div class="statusline" id="reviewStatus"></div>
      </div>
      <div id="reviewList"></div>
    </div>
  `;
  bindGallerySwipe();
  renderPdActions(p);
  renderStarInput();
  $('#submitReviewBtn').addEventListener('click', submitReview);
  $('#pdShareBtn').addEventListener('click', () => shareProduct(p));
  const sizeBtn = $('#pdSizeGuideBtn');
  if (sizeBtn) sizeBtn.addEventListener('click', openSizeGuide);
  updateSeoTags(p);
  updateStructuredData(p, []);
}

/* ---------------- Size guide ---------------- */
// Shown for categories/tags that are actually sized (lingerie, clothing).
// A general Indian sizing reference — not per-product measurements — so
// it's clearly opt-in via category/tag rather than guessed for every item.
function needsSizeGuide(p){
  const cat = (p.category || '').toLowerCase();
  const sub = (p.subcategory || '').toLowerCase();
  const tags = (p.tags || '').toLowerCase();
  return cat.includes('lingerie') || cat.includes('cloth') || cat.includes('wear') ||
         sub.includes('bra') || sub.includes('legging') ||
         tags.includes('size-guide') || tags.includes('sizeguide') || tags.includes('sized');
}

function openSizeGuide(){
  let overlay = $('#sizeGuideOverlay');
  if (!overlay){
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'sizeGuideOverlay';
    overlay.setAttribute('aria-label','Size guide');
    overlay.innerHTML = `
      <div class="sheet">
        <button class="closebtn" id="sizeGuideClose" aria-label="Close">✕</button>
        <h2>Size guide</h2>
        <p class="hint" style="margin:0 0 12px;">General reference — fit can vary slightly by style, so check the product description for anything specific.</p>
        <table class="size-table">
          <thead><tr><th>Size</th><th>Bust (in)</th><th>Waist (in)</th><th>Hip (in)</th></tr></thead>
          <tbody>
            <tr><td>S</td><td>32–34</td><td>26–28</td><td>34–36</td></tr>
            <tr><td>M</td><td>34–36</td><td>28–30</td><td>36–38</td></tr>
            <tr><td>L</td><td>36–38</td><td>30–32</td><td>38–40</td></tr>
            <tr><td>XL</td><td>38–40</td><td>32–34</td><td>40–42</td></tr>
            <tr><td>XXL</td><td>40–42</td><td>34–36</td><td>42–44</td></tr>
          </tbody>
        </table>
        <p class="hint" style="margin-top:10px;">Still unsure? Message us on WhatsApp with your usual size and we'll help you pick.</p>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSizeGuide(); });
    $('#sizeGuideClose', overlay).addEventListener('click', closeSizeGuide);
  }
  overlay.classList.add('open');
  openDialogFocus(overlay,closeSizeGuide);
}
function closeSizeGuide(){
  const overlay = $('#sizeGuideOverlay');
  if (overlay) {overlay.classList.remove('open');closeDialogFocus(overlay);}
}

function bindGallerySwipe(){
  const track = $('#pdGalleryTrack');
  const gallery = track?.closest('.pd-gallery');
  const slides = track ? Array.from(track.querySelectorAll('.pd-slide')) : [];
  const dots = $$('.pd-dot');
  if (!track || !gallery || !slides.length) return;

  let activeIndex = 0;

  const setGalleryHeight = (index = activeIndex) => {
    const slide = slides[index];
    const img = slide?.querySelector('img');
    if (!slide || !img) return;
    const apply = () => {
      const width = track.clientWidth || gallery.clientWidth;
      if (!width || !img.naturalWidth || !img.naturalHeight) return;
      gallery.style.height = `${Math.round(width * (img.naturalHeight / img.naturalWidth))}px`;
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
  };

  const updateActive = () => {
    const width = track.clientWidth;
    if (!width) return;
    activeIndex = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / width)));
    dots.forEach((d, i) => d.classList.toggle('active', i === activeIndex));
    setGalleryHeight(activeIndex);
  };

  setGalleryHeight(0);
  slides.forEach((slide, i) => {
    const img = slide.querySelector('img');
    if (img) img.addEventListener('load', () => { if (i === activeIndex) setGalleryHeight(i); });
  });

  if (slides.length > 1) {
    let raf = 0;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateActive);
    }, { passive: true });
  }
  window.addEventListener('resize', () => setGalleryHeight(activeIndex), { passive: true });
}

/* ---------------- SEO: per-product tags + structured data ---------------- */
function updateSeoTags(p){
  const url = `${CONFIG.SITE_URL}/product.html?id=${encodeURIComponent(p.id)}`;
  const imageUrl = (() => { try { return new URL(p.image, CONFIG.SITE_URL + '/').href; } catch (_) { return p.image; } })();
  const title = `${p.name} — ${CONFIG.SHOP_NAME}`;
  const desc = (p.description && p.description.trim())
    ? p.description.trim().slice(0, 155)
    : `Buy ${p.name} from ${CONFIG.SHOP_NAME} in Goluwala, Rajasthan — order on WhatsApp.`;

  document.title = title;
  const setMeta = (id, attr, value) => { const el = document.getElementById(id); if (el) el.setAttribute(attr, value); };
  const descTag = document.querySelector('meta[name="description"]');
  if (descTag) descTag.setAttribute('content', desc);
  const robotsTag = document.querySelector('meta[name="robots"]');
  if (robotsTag) robotsTag.setAttribute('content', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');

  setMeta('canonicalLink', 'href', url);
  setMeta('ogTitle', 'content', title);
  setMeta('ogDescription', 'content', desc);
  setMeta('ogUrl', 'content', url);
  setMeta('ogImage', 'content', imageUrl);
  setMeta('twitterTitle', 'content', title);
  setMeta('twitterDescription', 'content', desc);
  setMeta('twitterImage', 'content', imageUrl);
}

// Injects Product + BreadcrumbList JSON-LD, adding AggregateRating once real
// reviews exist (never fabricated — omitted entirely until there's at least
// one genuine review, since Google disallows rating markup with no basis).
function updateStructuredData(p, reviews){
  const url = `${CONFIG.SITE_URL}/product.html?id=${encodeURIComponent(p.id)}`;
  const images = (p.gallery && p.gallery.length ? p.gallery : [p.image]).map(src => {
    try { return new URL(src, CONFIG.SITE_URL + '/').href; } catch (_) { return src; }
  });
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    'name': p.name,
    'image': images,
    'description': p.description || `${p.name} — available at ${CONFIG.SHOP_NAME}`,
    'sku': p.id,
    'category': `${p.category} > ${p.subcategory}`,
    'url': url,
    'offers': {
      '@type': 'Offer',
      'url': url,
      'priceCurrency': 'INR',
      'price': Number(p.price).toFixed(2),
      'availability': isOutOfStock(p) ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      'itemCondition': 'https://schema.org/NewCondition',
      'seller': {
        '@type': 'Organization',
        'name': CONFIG.SHOP_NAME,
        'url': CONFIG.SITE_URL
      }
    }
  };
  if (reviews && reviews.length){
    const avg = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length;
    productLd.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': avg.toFixed(1),
      'reviewCount': reviews.length
    };
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Shop', 'item': `${CONFIG.SITE_URL}/index.html` },
      { '@type': 'ListItem', 'position': 2, 'name': p.category, 'item': `${CONFIG.SITE_URL}/index.html?category=${encodeURIComponent(p.category)}` },
      { '@type': 'ListItem', 'position': 3, 'name': p.subcategory, 'item': `${CONFIG.SITE_URL}/index.html?category=${encodeURIComponent(p.category)}&subcategory=${encodeURIComponent(p.subcategory)}` },
      { '@type': 'ListItem', 'position': 4, 'name': p.name, 'item': url }
    ]
  };

  setJsonLd('productJsonLd', productLd);
  setJsonLd('breadcrumbJsonLd', breadcrumbLd);
}

function setJsonLd(id, data){
  let el = document.getElementById(id);
  if (!el){
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function renderPdActions(p){
  const qty = CartStore.qtyFor(p.id);
  const outOfStock = isOutOfStock(p);
  const maxReached = p.stockQty !== null && qty >= p.stockQty;
  if (outOfStock){
    $('#pdActions').innerHTML = `<button class="ghost-btn" disabled style="flex:1;">Currently unavailable</button>`;
    return;
  }
  $('#pdActions').innerHTML = qty > 0
    ? `<div class="stepper" id="pdStepper" style="height:44px;"><button data-act="dec">−</button><span>${qty}</span><button data-act="inc" ${maxReached ? 'disabled' : ''}>+</button></div>
       <button class="primary-btn" id="pdGoCart" style="flex:1;">View cart</button>`
    : `<button class="ghost-btn" id="pdAdd" style="flex:1;">Add to cart</button>
       <button class="primary-btn" id="pdBuyNow" style="flex:1;">Buy Now</button>`;
  const stepper = $('#pdStepper');
  if (stepper){
    const incBtn = $('[data-act="inc"]', stepper);
    if (incBtn && !incBtn.disabled) incBtn.addEventListener('click', () => { CartStore.add(p, 1); updateCartBadge(); renderPdActions(p); });
    $('[data-act="dec"]', stepper).addEventListener('click', () => { CartStore.add(p, -1); updateCartBadge(); renderPdActions(p); });
  }
  const addBtn = $('#pdAdd');
  if (addBtn) addBtn.addEventListener('click', () => {
    CartStore.add(p, 1); renderPdActions(p);
    showToast(`${p.name} added to cart`);
    playAddFlourish($('.pd-slide img'));
  });
  const buyBtn = $('#pdBuyNow');
  if (buyBtn) buyBtn.addEventListener('click', () => {
    CartStore.add(p, 1); renderPdActions(p);
    playAddFlourish($('.pd-slide img'), { openCartAfter: true });
  });
  const goCart = $('#pdGoCart');
  if (goCart) goCart.addEventListener('click', openCart);
}

// Called by cart-ui.js whenever the cart changes from the drawer,
// so this page's own add/stepper controls stay in sync.
function refreshCurrentProductCard(){
  if (CURRENT_PRODUCT) renderPdActions(CURRENT_PRODUCT);
}

/* ---------------- Related products ---------------- */
function renderRelated(p){
  let related = ALL_PRODUCTS.filter(x => x.id !== p.id && x.category === p.category);
  if (related.length < 4){
    const extra = ALL_PRODUCTS.filter(x => x.id !== p.id && !related.includes(x)).slice(0, 8 - related.length);
    related = related.concat(extra);
  }
  related = related.slice(0, 8);
  if (!related.length) return;
  $('#relatedSection').style.display = 'block';
  const rail = $('#relatedRail');
  rail.innerHTML = related.map(cardHtml).join('');
  bindCardEvents($$('.card', rail), related);
}

/* ---------------- Reviews ---------------- */
function renderStarInput(){
  const box = $('#starInput');
  const draw = () => {
    box.innerHTML = [1,2,3,4,5].map(v =>
      `<button type="button" class="star-btn ${v <= selectedRating ? 'filled' : ''}" data-v="${v}" aria-label="${v} stars" aria-pressed="${v===selectedRating}">★</button>`
    ).join('');
    $$('.star-btn', box).forEach(btn => btn.addEventListener('click', () => {
      selectedRating = Number(btn.dataset.v);
      draw();
    }));
  };
  draw();
}

async function loadReviews(productId){
  const summaryEl = $('#reviewSummary');
  const listEl = $('#reviewList');
  if (!CONFIG.SHEET_API_URL){
    summaryEl.innerHTML = `<p class="hint">Reviews will appear here once the Google Sheet is connected.</p>`;
    listEl.innerHTML = '';
    return;
  }
  try{
    const res = await fetch(`${CONFIG.SHEET_API_URL}?action=reviews&productId=${encodeURIComponent(productId)}`, { cache: 'no-store' });
    const reviews = await res.json();
    if (reviews.error) throw new Error(reviews.error);
    renderReviews(reviews);
  } catch(err){
    summaryEl.innerHTML = `<p class="hint">Couldn't load reviews right now.</p>`;
    listEl.innerHTML = '';
  }
}

function renderReviews(reviews){
  if (CURRENT_PRODUCT) updateStructuredData(CURRENT_PRODUCT, reviews);
  const summaryEl = $('#reviewSummary');
  const listEl = $('#reviewList');
  if (!reviews.length){
    summaryEl.innerHTML = `<p class="hint">No feedback yet — be the first to review this product.</p>`;
    listEl.innerHTML = '';
    return;
  }
  const avg = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length;
  summaryEl.innerHTML = `
    <div class="review-avg">${avg.toFixed(1)}</div>
    <div>
      ${renderStars(avg, 'lg')}
      <div class="hint" style="margin:2px 0 0;">${reviews.length} review${reviews.length===1?'':'s'}</div>
    </div>
  `;
  listEl.innerHTML = reviews.map(r => `
    <div class="review-item">
      <div class="review-item-head">
        <span class="review-name">${escapeHtml(r.name || 'Anonymous')}</span>
        ${renderStars(r.rating)}
      </div>
      <div class="review-date">${formatDateTime(r.date)}</div>
      ${r.comment ? `<p class="review-comment">${escapeHtml(r.comment)}</p>` : ''}
    </div>
  `).join('');
}

async function submitReview(){
  const statusEl = $('#reviewStatus');
  const name = $('#revName').value.trim();
  const comment = $('#revComment').value.trim();
  if (!name || comment.length<2 || comment.length>600){
    status_(statusEl, 'Please enter your name and feedback of 2–600 characters.', false);
    return;
  }
  if (!CONFIG.SHEET_API_URL){
    status_(statusEl, 'Reviews need the Google Sheet connected first.', false);
    return;
  }
  const btn = $('#submitReviewBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  try{
    const res = await fetch(CONFIG.SHEET_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'addReview',
        review: { productId: CURRENT_PRODUCT.id, name, rating: selectedRating, comment,clientId:reviewClientId(),website:$('#reviewWebsite')?.value || '' }
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    status_(statusEl, 'Thanks for your feedback!', true);
    $('#revName').value = '';
    $('#revComment').value = '';
    selectedRating = 5;
    renderStarInput();
    loadReviews(CURRENT_PRODUCT.id);
  } catch(err){
    status_(statusEl, 'Could not submit feedback: ' + err.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit feedback';
  }
}

function status_(el, msg, ok){
  el.textContent = msg;
  el.className = 'statusline ' + (ok ? 'ok' : 'err');
}

document.addEventListener('dsb:languagechange', () => { if (CURRENT_PRODUCT) { renderProduct(CURRENT_PRODUCT); renderRelated(CURRENT_PRODUCT); loadReviews(CURRENT_PRODUCT.id); } });

document.addEventListener('DOMContentLoaded', () => {
  $('#searchTrigger').addEventListener('click', () => { location.href = 'index.html'; });
  $('#cartTrigger').addEventListener('click', openCart);
  $('#cartOverlay').addEventListener('click', (e) => { if (e.target.id === 'cartOverlay') closeCart(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape'){ closeCart(); closeSizeGuide(); } });

  updateCartBadge();
  initWhatsAppFloat();
  init();
});

function reviewClientId(){
  try{let id=localStorage.getItem('dsb_review_client');if(!id){id=newCheckoutId();localStorage.setItem('dsb_review_client',id);}return id;}catch(_){return 'storage-unavailable';}
}
