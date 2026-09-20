/* =========================================================
   Dhatterwal Suhag Bhandar — shared product card rendering
   Tapping the image/name navigates to that product's own page;
   the Add/stepper/Buy Now controls act on the cart without navigating.
   ========================================================= */

function customerProductName(p) {
  return window.DSB_I18N && DSB_I18N.isHindi() && p.nameHindi ? p.nameHindi : p.name;
}
function customerProductSecondaryName(p) {
  if (!p.nameHindi) return '';
  return window.DSB_I18N && DSB_I18N.isHindi() ? p.name : p.nameHindi;
}
function discountPct(p, price = DSB_SEO.pricing(p).min) {
  if (!p.mrp || p.mrp <= price) return 0;
  return Math.round((p.mrp - price) / p.mrp * 100);
}
function homeCartIcon() {
  return `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L20.5 8H6.1"/><path d="M16.5 3.5v5M14 6h5"/></svg>`;
}
function cardActionsHtml(p, options = {}) {
  const compactHome = !!options.homeCard;
  if (isOutOfStock(p)) {
    return compactHome
      ? `<span class="home-cart-btn unavailable" aria-label="Out of stock" title="Out of stock">${homeCartIcon()}</span>`
      : `<button class="addbtn" disabled style="opacity:.5; cursor:not-allowed;">Out of stock</button>`;
  }
  if (compactHome) {
    const inCart = CartStore.qtyForProduct(p.id) > 0;
    return `<button type="button" class="home-cart-btn${inCart ? ' in-cart' : ''}" data-act="quickadd" data-id="${escapeHtml(p.id)}" aria-label="Add ${escapeHtml(p.name)} to cart" title="Add to cart">${homeCartIcon()}</button>`;
  }
  const buyButton = `<button type="button" class="buynowbtn" data-act="buynow" data-id="${escapeHtml(p.id)}" aria-label="Buy Now" title="Buy Now"><svg class="quick-buy-icon" aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l2 14H4L6 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/><path d="M9 14h6m-2-2 2 2-2 2"/></svg><span>Buy Now</span></button>`;
  if (p.sizes?.length) return `<a class="addbtn size-select-link" href="${typeof preferredProductPath === 'function' ? preferredProductPath(p.id) : `product.html?id=${encodeURIComponent(p.id)}`}">Choose size</a>`;
  const qty = CartStore.qtyFor(p.id);
  const maxReached = p.stockQty !== null && qty >= p.stockQty;
  return qty > 0 ? `<div class="stepper" data-id="${escapeHtml(p.id)}">
         <button data-act="dec" aria-label="Decrease quantity">−</button><span>${qty}</span><button data-act="inc" aria-label="Increase quantity" ${maxReached ? 'disabled' : ''}>+</button>
       </div>
       ${buyButton}` : `<button class="addbtn" data-act="add" data-id="${escapeHtml(p.id)}">+ Add</button>
       ${buyButton}`;
}

// Star rating + review count row shown on every card. Reads from the
// REVIEW_SUMMARY map built once by loadReviewSummaries() — never fetches
// per card, so scrolling a big grid stays cheap.
function cardRatingHtml(p) {
  const sum = typeof reviewSummaryFor === 'function' ? reviewSummaryFor(p.id) : null;
  if (!sum || !sum.count) return '';
  return `<div class="card-rating">${renderStars(sum.avg)}<span class="rating-count">(${sum.count})</span></div>`;
}
function cardHtml(p, options = {}) {
  const disc = discountPct(p);
  const href = `${typeof preferredProductPath === 'function' ? preferredProductPath(p.id) : `product.html?id=${encodeURIComponent(p.id)}`}`;
  const low = lowStockLabel(p);
  const prices = DSB_SEO.pricing(p);
  const hasSizePrices = prices.min !== prices.max;
  const displayedPrice = prices.min;
  return `
  <div class="card${options.homeCard ? ' home-card' : ''}" data-id="${escapeHtml(p.id)}">
    <a class="imgwrap" href="${href}">
      ${disc ? `<span class="discount">${disc}% OFF</span>` : ''}
      <span class="subtag">${escapeHtml(p.subcategory)}</span>
      <img src="${escapeHtml(productImageUrl(p.image, 400))}" srcset="${escapeHtml(productImageUrl(p.image, 200))} 200w, ${escapeHtml(productImageUrl(p.image, 400))} 400w, ${escapeHtml(productImageUrl(p.image, 600))} 600w" sizes="(max-width:600px) 46vw, 220px" alt="${escapeHtml(customerProductName(p))}" loading="${options.eager ? 'eager' : 'lazy'}" ${options.eager ? 'fetchpriority="high"' : ''} decoding="async" width="400" height="400">
    </a>
    <button type="button" class="card-share" data-share="${escapeHtml(p.id)}" aria-label="Share ${escapeHtml(p.name)}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/></svg>
    </button>
    <div class="body">
      <a class="name" href="${href}">${escapeHtml(customerProductName(p))}</a>
      ${customerProductSecondaryName(p) ? `<div class="name-hindi">${escapeHtml(customerProductSecondaryName(p))}</div>` : ''}
      <div class="card-rating-slot">${cardRatingHtml(p)}</div>
      <div class="prices">
        <span class="price">${hasSizePrices ? 'From ' : ''}${money(displayedPrice)}</span>
        ${p.mrp > displayedPrice ? `<span class="mrp">${money(p.mrp)}</span>` : ''}
      </div>
      ${low ? `<div class="low-stock">${escapeHtml(low)}</div>` : ''}
      <div class="card-actions">${cardActionsHtml(p, options)}</div>
    </div>
  </div>`;
}
function bindCardEvents(cards, list) {
  const productsById = new Map(list.map(p => [p.id, p]));
  cards.forEach(card => {
    const id = card.dataset.id;
    const product = productsById.get(id);
    if (!product) return;
    bindCardActionEvents(card, product, list);
    const shareBtn = $('.card-share', card);
    if (shareBtn) shareBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      shareProduct(product);
    });
  });
}

// Only wires up the small actions area (button/stepper) — the image, name,
// and price never get touched again after the card is first drawn.
function bindCardActionEvents(card, product, list) {
  const actionsWrap = $('.card-actions', card);
  if (!actionsWrap) return;
  const quickAddBtn = $('.home-cart-btn[data-act="quickadd"]', actionsWrap);
  if (quickAddBtn) quickAddBtn.addEventListener('click', async () => {
    if (product.sizes?.length) {
      openQuickSizePicker(product, card, list);
      return;
    }
    await handleCardAdd(product, 1, card, list);
  });
  if (product.sizes?.length) return;
  const addBtn = $('.addbtn:not([disabled])', actionsWrap);
  if (addBtn) addBtn.addEventListener('click', async () => handleCardAdd(product, 1, card, list));
  const stepper = $('.stepper', actionsWrap);
  if (stepper) {
    const incBtn = $('[data-act="inc"]', stepper);
    if (incBtn && !incBtn.disabled) incBtn.addEventListener('click', async () => handleCardAdd(product, 1, card, list));
    $('[data-act="dec"]', stepper).addEventListener('click', async () => handleCardAdd(product, -1, card, list));
  }
  const buyBtn = $('.buynowbtn', actionsWrap);
  if (buyBtn) buyBtn.addEventListener('click', async () => {
    if (product.stockQty !== null && CartStore.qtyFor(product.id) >= product.stockQty) {
      showToast(`Only ${product.stockQty} in stock`);
      return;
    }
    if (!(await CartStore.tryAddSafe(product, 1))) {
      showToast('Could not add this item. Check size and stock.');
      return;
    }
    updateCardActionsUI(card, product, list);
    playAddFlourish($('img', card), {
      openCartAfter: true
    });
  });
}

function quickSizePickerElement() {
  let overlay = document.getElementById('quickSizeOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'quickSizeOverlay';
  overlay.className = 'quick-size-overlay';
  overlay.innerHTML = `
    <div class="quick-size-sheet" role="dialog" aria-modal="true" aria-labelledby="quickSizeTitle">
      <div class="quick-size-head">
        <div>
          <span class="quick-size-kicker">Quick add</span>
          <strong id="quickSizeTitle"></strong>
        </div>
        <button type="button" class="quick-size-close" aria-label="Close size selector">×</button>
      </div>
      <div class="quick-size-options" role="group" aria-label="Choose size"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.closest('.quick-size-close')) closeQuickSizePicker();
  });
  return overlay;
}
function closeQuickSizePicker() {
  const overlay = document.getElementById('quickSizeOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.classList.remove('quick-size-open');
  closeDialogFocus($('.quick-size-sheet', overlay));
}
function openQuickSizePicker(product, card, list) {
  const overlay = quickSizePickerElement();
  const title = $('#quickSizeTitle', overlay);
  const options = $('.quick-size-options', overlay);
  const pricing = DSB_SEO.pricing(product);
  const variedPrices = pricing.min !== pricing.max;
  title.textContent = customerProductName(product);
  options.innerHTML = product.sizes.map(size => {
    const price = pricing.priceFor(size);
    return `<button type="button" class="quick-size-option" data-size="${escapeHtml(size)}"><span>${escapeHtml(size)}</span>${variedPrices ? `<small>${money(price)}</small>` : ''}</button>`;
  }).join('');
  options.querySelectorAll('.quick-size-option').forEach(button => {
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      const size = button.dataset.size;
      const selected = sizedCartProduct(product, size);
      if (product.stockQty !== null && CartStore.qtyForProduct(product.id) >= product.stockQty) {
        showToast(`Only ${product.stockQty} in stock`);
        closeQuickSizePicker();
        return;
      }
      button.disabled = true;
      button.classList.add('adding');
      const added = await CartStore.tryAddSafe(selected, 1);
      if (!added) {
        button.disabled = false;
        button.classList.remove('adding');
        showToast('Could not add this size. Check stock.');
        return;
      }
      closeQuickSizePicker();
      updateCardActionsUI(card, product, list);
      showToast(`${product.name} • ${size} added to cart`);
      playAddFlourish($('img', card));
    });
  });
  overlay.classList.add('open');
  document.body.classList.add('quick-size-open');
  openDialogFocus($('.quick-size-sheet', overlay), closeQuickSizePicker);
  options.querySelector('.quick-size-option')?.focus({ preventScroll:true });
}

async function handleCardAdd(product, delta, card, list) {
  if (delta > 0 && product.stockQty !== null && CartStore.qtyFor(product.id) >= product.stockQty) {
    showToast(`Only ${product.stockQty} in stock`);
    return;
  }
  if (delta > 0) {
    if (!(await CartStore.tryAddSafe(product, delta))) {
      showToast('Could not add this item. Check size and stock.');
      return;
    }
  } else await CartStore.addSafe(product, delta);
  updateCardActionsUI(card, product, list);
  if (delta > 0) {
    showToast(`${product.name} added to cart`);
    playAddFlourish($('img', card));
  } else {
    updateCartBadge();
  }
}

// Swaps only the actions subtree (button <-> stepper) — no image reload,
// no full-card re-render, so repeated taps stay instant and flicker-free.
function updateCardActionsUI(card, product, list) {
  const actionsWrap = $('.card-actions', card);
  if (!actionsWrap) return;
  const html = cardActionsHtml(product, { homeCard: card.classList.contains('home-card') });
  if (actionsWrap.dataset.cartHtml === html) return;
  actionsWrap.innerHTML = html;
  actionsWrap.dataset.cartHtml = html;
  bindCardActionEvents(card, product, list);
}
function updateVisibleRatings() {
  document.querySelectorAll('.card[data-id]').forEach(card => {
    const slot = card.querySelector('.card-rating-slot');
    if (slot) slot.innerHTML = cardRatingHtml({
      id: card.dataset.id
    });
  });
}
function updateVisibleCartActions() {
  if (typeof ALL_PRODUCTS === 'undefined') return;
  const byId = PRODUCT_BY_ID;
  document.querySelectorAll('.card[data-id]').forEach(card => {
    const p = byId.get(card.dataset.id);
    if (!p) return;
    const actions = card.querySelector('.card-actions');
    if (!actions) return;
    const html = cardActionsHtml(p, { homeCard: card.classList.contains('home-card') });
    if (actions.dataset.cartHtml === html) return;
    const focused = actions.contains(document.activeElement) ? document.activeElement.dataset.act : null;
    actions.innerHTML = html;
    actions.dataset.cartHtml = html;
    bindCardActionEvents(card, p, ALL_PRODUCTS);
    if (focused) actions.querySelector(`[data-act="${focused}"]`)?.focus({
      preventScroll: true
    });
  });
}
