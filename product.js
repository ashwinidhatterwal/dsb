/* =========================================================
   Dhatterwal Suhag Bhandar — product detail page logic
   ========================================================= */
let CURRENT_PRODUCT = null;
let selectedRating = 5;
let selectedSize = new URLSearchParams(location.search).get('size') || '';
let CURRENT_REVIEWS=[];
let galleryResizeObserver=null;

function getProductIdFromUrl(){
  return document.documentElement.dataset.productId || new URLSearchParams(location.search).get('id') || '';
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
  if(!root.querySelector('[data-prerendered]'))renderProductSkeleton();

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
      if (CURRENT_PRODUCT && CURRENT_PRODUCT.id === product.id) updateVisibleRatings();
    });
  } catch(err){
    console.error('Product page failed to initialise', err);
    if(root.querySelector('[data-prerendered]')){
      const status=root.querySelector('[role="status"]');
      if(status){status.textContent='Live availability is temporarily unavailable. Please retry before ordering.';if(!root.querySelector('#pdRetryBtn')){const button=document.createElement('button');button.id='pdRetryBtn';button.className='ghost-btn';button.textContent='Try again';button.onclick=init;status.after(button);}}
      return;
    }
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
          ${p.gallery.map((_, i) => `<button type="button" class="pd-dot ${i===0?'active':''}" data-slide="${i}" aria-label="Photo ${i+1} of ${p.gallery.length}" aria-pressed="${i===0}"></button>`).join('')}
        </div>` : ''}
      </div>
      <div class="pd-info">
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
      <p class="pd-desc">${escapeHtml((window.DSB_PAGE_LANGUAGE==='hi'?p.descriptionhindi:p.description) || 'Contact the shop for product details before ordering.')}</p>
      <dl class="product-specs">${DSB_SEO.details(p).map(([k,v])=>`<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>
      <div class="pd-id">Product ID: ${escapeHtml(p.id)}</div>
      ${p.sizes?.length ? `<fieldset class="product-sizes"><legend>Choose size</legend><div class="size-options">${p.sizes.map(size=>`<button type="button" class="size-option" data-size="${escapeHtml(size)}" aria-pressed="${selectedSize===size}">${escapeHtml(size)}</button>`).join('')}</div><p class="hint" id="sizeHelp">Select a size before adding to cart.</p></fieldset>` : ''}
      <div class="pd-actions" id="pdActions"></div>
      <div class="pd-delivery" id="pdDelivery"><p>Delivery charges are shown before you confirm your order.</p><a href="contact.html">Ask about delivery to your area</a> · <a href="returns.html">Returns &amp; exchanges</a></div>
      </div>
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
  updateSizeOptions(p);
  renderPdActions(p);
  renderStarInput();
  $('#submitReviewBtn').addEventListener('click', submitReview);
  $('#pdShareBtn').addEventListener('click', async () => shareProduct(p));
  const sizeBtn = $('#pdSizeGuideBtn');
  if (sizeBtn) sizeBtn.addEventListener('click', openSizeGuide);
  updateSeoTags(p);
  updateStructuredData(p, []);
  fetchCheckoutConfigIfNeeded().then(cfg=>{
    const el=$('#pdDelivery');if(!cfg || !el)return;
    const line=document.createElement('p');line.textContent=`Delivery: ${money(cfg.deliveryCharge)} below ${money(cfg.deliveryFreeAbove)} after discounts; free at or above that amount. Cash on Delivery: ${money(cfg.codCharge)} extra.`;
    el.querySelector('p').replaceWith(line);
  });
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
      gallery.style.minHeight='0';
    };
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
  };

  const updateActive = () => {
    const width = track.clientWidth;
    if (!width) return;
    activeIndex = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / width)));
    dots.forEach((d,i)=>{d.classList.toggle('active',i===activeIndex);d.setAttribute('aria-pressed',String(i===activeIndex));});
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
  galleryResizeObserver?.disconnect();
  if('ResizeObserver' in window){galleryResizeObserver=new ResizeObserver(()=>setGalleryHeight(activeIndex));galleryResizeObserver.observe(track);}
  track.tabIndex=0;track.setAttribute('aria-label','Product photos. Use left and right arrow keys.');
  const goTo=i=>track.scrollTo({left:Math.max(0,Math.min(slides.length-1,i))*track.clientWidth,behavior:prefersReducedMotion()?'instant':'smooth'});
  dots.forEach((dot,i)=>dot.addEventListener('click',()=>goTo(i)));
  track.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();goTo(activeIndex+(e.key==='ArrowRight'?1:-1));}});

}

/* ---------------- SEO: per-product tags + structured data ---------------- */
function updateSeoTags(p){
  document.getElementById('staticProductLd')?.remove();
  const url = productUrl(p);
  const imageUrl = (() => { try { return new URL(p.image, CONFIG.SITE_URL + '/').href; } catch (_) { return p.image; } })();
  const title = `${window.DSB_PAGE_LANGUAGE==='hi'?(p.nameHindi||p.name):DSB_SEO.name(p)} — ${CONFIG.SHOP_NAME}`;
  const productDescription=window.DSB_PAGE_LANGUAGE==='hi'?(p.descriptionhindi||p.description):DSB_SEO.description(p);
  const desc = (productDescription && productDescription.trim())
    ? productDescription.trim().slice(0, 170)
    : `Buy ${p.name} from ${CONFIG.SHOP_NAME} in Goluwala, Rajasthan — order online.`;

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
  document.getElementById('staticProductLd')?.remove();
  const url = productUrl(p);
  const images = (p.gallery && p.gallery.length ? p.gallery : [p.image]).map(src => {
    try { return new URL(src, CONFIG.SITE_URL + '/').href; } catch (_) { return src; }
  });
  const productLd=DSB_SEO.graph(p,ALL_PRODUCTS,CONFIG.SITE_URL,window.DSB_PAGE_LANGUAGE||'en');
  const ratedProduct=productLd['@graph']?productLd['@graph'][0]:productLd;
  if (reviews && reviews.length){
    const avg = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length;
    ratedProduct.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': avg.toFixed(1),
      'reviewCount': reviews.length
    };
  }

  const breadcrumbLd=DSB_SEO.breadcrumbs(p,CONFIG.SITE_URL);
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
  const priced=sizedCartProduct(p,selectedSize);
  const prices=$('#pdRoot .pd-prices');if(prices)prices.innerHTML=`<span class="price">${money(priced.price)}</span>${p.mrp>priced.price?`<span class="mrp">${money(p.mrp)}</span>`:''}`;
  let merchandising=$('#variantMerchandising');
  if(!merchandising){merchandising=document.createElement('div');merchandising.id='variantMerchandising';$('#pdActions').before(merchandising);}
  const siblings=p.variantgroup?ALL_PRODUCTS.filter(x=>x.variantgroup===p.variantgroup):[];
  const merchandisingHtml=(siblings.length?`<fieldset class="product-sizes"><legend>Size / colour</legend><div class="size-options">${siblings.map(x=>`<a class="size-option" href="${preferredProductPath(x.id)}" ${x.id===p.id?'aria-current="page"':''}>${escapeHtml(x.variantlabel)} · ${money(x.price)}${isOutOfStock(x)?' · Unavailable':''}</a>`).join('')}</div></fieldset>`:'')+(p.bundlecontents?`<div class="product-sizes"><strong>Combo includes</strong><p>${escapeHtml(p.bundlecontents)}</p></div>`:'');
  if(merchandising.dataset.html!==merchandisingHtml){merchandising.innerHTML=merchandisingHtml;merchandising.dataset.html=merchandisingHtml;}

  if(isOutOfStock(p)){$('#pdActions').innerHTML='<button class="ghost-btn" disabled style="flex:1;">Currently unavailable</button>';return;}
  if(p.sizes?.length && !p.sizes.includes(selectedSize)){
    $('#pdActions').innerHTML='<button class="ghost-btn" disabled style="flex:1;">Choose a size first</button>';return;
  }
  const variant=sizedCartProduct(p,p.sizes?.includes(selectedSize) ? selectedSize : '');
  const qty = CartStore.qtyFor(variant.id);
  const outOfStock = isOutOfStock(p);
  const maxReached = p.stockQty !== null && CartStore.qtyForProduct(p.id) >= p.stockQty;
  if (outOfStock){
    $('#pdActions').innerHTML = `<button class="ghost-btn" disabled style="flex:1;">Currently unavailable</button>`;
    return;
  }
  $('#pdActions').innerHTML = qty > 0
    ? `<div class="stepper" id="pdStepper" style="height:44px;"><button type="button" data-act="dec" aria-label="Decrease quantity">−</button><span>${qty}</span><button type="button" data-act="inc" aria-label="Increase quantity" ${maxReached ? 'disabled' : ''}>+</button></div>
       <button class="primary-btn" id="pdGoCart" style="flex:1;">View cart</button>`
    : `<button class="ghost-btn" id="pdAdd" ${maxReached ? 'disabled' : ''} style="flex:1;">Add to cart</button>
       <button class="primary-btn" id="pdBuyNow" ${maxReached ? 'disabled' : ''} style="flex:1;">Buy Now</button>`;
  const stepper = $('#pdStepper');
  if (stepper){
    const incBtn = $('[data-act="inc"]', stepper);
    if (incBtn && !incBtn.disabled) incBtn.addEventListener('click', async () => { await CartStore.addSafe(variant, 1); updateCartBadge(); renderPdActions(p); });
    $('[data-act="dec"]', stepper).addEventListener('click', async () => { await CartStore.addSafe(variant, -1); updateCartBadge(); renderPdActions(p); });
  }
  const addBtn = $('#pdAdd');
  if (addBtn) addBtn.addEventListener('click', async () => {
    await CartStore.addSafe(variant, 1); renderPdActions(p);
    showToast(`${p.name} added to cart`);
    playAddFlourish($('.pd-slide img'));
  });
  const buyBtn = $('#pdBuyNow');
  if (buyBtn) buyBtn.addEventListener('click', async () => {
    await CartStore.addSafe(variant, 1); renderPdActions(p);
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
  let related = ALL_PRODUCTS.filter(x => x.id !== p.id && !isOutOfStock(x) && (!p.variantgroup || x.variantgroup!==p.variantgroup) && x.category === p.category);
  if (related.length < 4){
    const extra = ALL_PRODUCTS.filter(x => x.id !== p.id && !isOutOfStock(x) && (!p.variantgroup || x.variantgroup!==p.variantgroup) && !related.includes(x)).slice(0, 8 - related.length);
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
    $$('.star-btn', box).forEach(btn => btn.addEventListener('click', async () => {
      selectedRating = Number(btn.dataset.v);
      draw();
    }));
  };
  draw();
}

async function loadReviews(productId,force=false){
  const summaryEl = $('#reviewSummary');
  const listEl = $('#reviewList');
  if (!CONFIG.SHEET_API_URL){
    summaryEl.innerHTML = `<p class="hint">Reviews will appear here once the Google Sheet is connected.</p>`;
    listEl.innerHTML = '';
    return;
  }
  try{
    const reviews = await cachedPublicJson('reviews-'+productId,`${CONFIG.SHEET_API_URL}?action=reviews&productId=${encodeURIComponent(productId)}`,180000,force);
    if (!Array.isArray(reviews)) throw new Error('Invalid review response');
    if(CURRENT_PRODUCT?.id!==productId)return;
    CURRENT_REVIEWS=reviews;
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
    const data = await requestJson(CONFIG.SHEET_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'addReview',
        review: { productId: CURRENT_PRODUCT.id, name, rating: selectedRating, comment,clientId:reviewClientId(),website:$('#reviewWebsite')?.value || '' }
      })
    });
    if (data.error) throw new Error(data.error);
    status_(statusEl, 'Thanks for your feedback!', true);
    $('#revName').value = '';
    $('#revComment').value = '';
    selectedRating = 5;
    renderStarInput();
    invalidateReviewCache(CURRENT_PRODUCT.id);
    loadReviews(CURRENT_PRODUCT.id,true);
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

document.addEventListener('dsb:languagechange',()=>{
  const p=CURRENT_PRODUCT;if(!p)return;
  $('#pdRoot .pd-title').textContent=customerProductName(p);
  document.querySelectorAll('.pd-slide img').forEach(img=>img.alt=customerProductName(p));
  const secondary=$('#pdRoot .pd-title-hindi');if(secondary)secondary.textContent=customerProductSecondaryName(p);
  document.querySelectorAll('.card[data-id]').forEach(card=>{
    const product=PRODUCT_BY_ID.get(card.dataset.id);if(!product)return;
    card.querySelector('.name').textContent=customerProductName(product);
    const sub=card.querySelector('.name-hindi');if(sub)sub.textContent=customerProductSecondaryName(product);
  });
});
document.addEventListener('dsb:catalogchange',()=>{
  if(!CURRENT_PRODUCT)return;
  const updated=PRODUCT_BY_ID.get(CURRENT_PRODUCT.id);
  if(!updated){CURRENT_PRODUCT={...CURRENT_PRODUCT,stock:'out of stock'};renderPdActions(CURRENT_PRODUCT);return;}
  CURRENT_PRODUCT=updated;updateSizeOptions(updated);renderPdActions(updated);
  const title=$('#pdRoot .pd-title');if(title)title.textContent=customerProductName(updated);
  const stock=$('#pdRoot .pd-stock');if(stock){stock.textContent=isOutOfStock(updated)?'Out of stock':(lowStockLabel(updated)||'In stock');stock.className='pd-stock '+(isOutOfStock(updated)?'out':'in');}
  updateSeoTags(updated);updateStructuredData(updated,CURRENT_REVIEWS);
});

document.addEventListener('DOMContentLoaded', () => {
  $('#searchTrigger').addEventListener('click', async () => { location.href = 'index.html?search=1'; });
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

function updateSizeOptions(p){
  let field=$('#pdRoot .product-sizes');
  if(!p.sizes?.length){selectedSize='';field?.remove();return;}
  if(!p.sizes.includes(selectedSize))selectedSize='';
  if(!field){field=document.createElement('fieldset');field.className='product-sizes';$('#pdActions').before(field);}
  field.innerHTML=`<legend>Choose size</legend><div class="size-options">${p.sizes.map(size=>`<button type="button" class="size-option" data-size="${escapeHtml(size)}" aria-pressed="${selectedSize===size}">${escapeHtml(size)}</button>`).join('')}</div><p class="hint" id="sizeHelp">Select a size before adding to cart.</p>`;
  field.querySelectorAll('.size-option').forEach(btn=>btn.addEventListener('click',()=>{selectedSize=btn.dataset.size;field.querySelectorAll('.size-option').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.size===selectedSize)));renderPdActions(CURRENT_PRODUCT||p);}));
}
