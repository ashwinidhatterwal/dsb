/* =========================================================
   Dhatterwal Suhag Bhandar — shared product card rendering
   Tapping the image/name navigates to that product's own page;
   the Add/stepper/Buy Now controls act on the cart without navigating.
   ========================================================= */
function discountPct(p){
  if (!p.mrp || p.mrp <= p.price) return 0;
  return Math.round(((p.mrp - p.price) / p.mrp) * 100);
}

function cardActionsHtml(p){
  if (isOutOfStock(p)){
    return `<button class="addbtn" disabled style="opacity:.5; cursor:not-allowed;">Out of stock</button>`;
  }
  const qty = CartStore.qtyFor(p.id);
  const maxReached = p.stockQty !== null && qty >= p.stockQty;
  return qty > 0
    ? `<div class="stepper" data-id="${escapeHtml(p.id)}">
         <button data-act="dec" aria-label="Decrease quantity">−</button><span>${qty}</span><button data-act="inc" aria-label="Increase quantity" ${maxReached ? 'disabled' : ''}>+</button>
       </div>
       <button class="buynowbtn" data-act="buynow" data-id="${escapeHtml(p.id)}">Buy Now</button>`
    : `<button class="addbtn" data-act="add" data-id="${escapeHtml(p.id)}">+ Add</button>
       <button class="buynowbtn" data-act="buynow" data-id="${escapeHtml(p.id)}">Buy Now</button>`;
}

// Star rating + review count row shown on every card. Reads from the
// REVIEW_SUMMARY map built once by loadReviewSummaries() — never fetches
// per card, so scrolling a big grid stays cheap.
function cardRatingHtml(p){
  const sum = (typeof reviewSummaryFor === 'function') ? reviewSummaryFor(p.id) : null;
  if (!sum || !sum.count) return '';
  return `<div class="card-rating">${renderStars(sum.avg)}<span class="rating-count">(${sum.count})</span></div>`;
}

function cardHtml(p){
  const disc = discountPct(p);
  const href = `product.html?id=${encodeURIComponent(p.id)}`;
  const low = lowStockLabel(p);
  return `
  <div class="card" data-id="${escapeHtml(p.id)}">
    <a class="imgwrap" href="${href}">
      ${disc ? `<span class="discount">${disc}% OFF</span>` : ''}
      <span class="subtag">${escapeHtml(p.subcategory)}</span>
      <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" decoding="async">
    </a>
    <button type="button" class="card-share" data-share="${escapeHtml(p.id)}" aria-label="Share ${escapeHtml(p.name)}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/></svg>
    </button>
    <div class="body">
      <a class="name" href="${href}">${escapeHtml(p.name)}</a>
      ${p.nameHindi ? `<div class="name-hindi">${escapeHtml(p.nameHindi)}</div>` : ''}
      ${cardRatingHtml(p)}
      <div class="prices">
        <span class="price">${money(p.price)}</span>
        ${p.mrp > p.price ? `<span class="mrp">${money(p.mrp)}</span>` : ''}
      </div>
      ${low ? `<div class="low-stock">${escapeHtml(low)}</div>` : ''}
      <div class="card-actions">${cardActionsHtml(p)}</div>
    </div>
  </div>`;
}

function bindCardEvents(cards, list){
  cards.forEach(card => {
    const id = card.dataset.id;
    const product = list.find(p => p.id === id);
    if (!product) return;
    bindCardActionEvents(card, product, list);
    const shareBtn = $('.card-share', card);
    if (shareBtn) shareBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      shareProduct(product);
    });
  });
}

// Only wires up the small actions area (button/stepper) — the image, name,
// and price never get touched again after the card is first drawn.
function bindCardActionEvents(card, product, list){
  const actionsWrap = $('.card-actions', card);
  if (!actionsWrap) return;
  const addBtn = $('.addbtn:not([disabled])', actionsWrap);
  if (addBtn) addBtn.addEventListener('click', () => handleCardAdd(product, 1, card, list));
  const stepper = $('.stepper', actionsWrap);
  if (stepper){
    const incBtn = $('[data-act="inc"]', stepper);
    if (incBtn && !incBtn.disabled) incBtn.addEventListener('click', () => handleCardAdd(product, 1, card, list));
    $('[data-act="dec"]', stepper).addEventListener('click', () => handleCardAdd(product, -1, card, list));
  }
  const buyBtn = $('.buynowbtn', actionsWrap);
  if (buyBtn) buyBtn.addEventListener('click', () => {
    if (product.stockQty !== null && CartStore.qtyFor(product.id) >= product.stockQty){
      showToast(`Only ${product.stockQty} in stock`);
      return;
    }
    CartStore.add(product, 1);
    updateCardActionsUI(card, product, list);
    playAddFlourish($('img', card), { openCartAfter: true });
  });
}

function handleCardAdd(product, delta, card, list){
  if (delta > 0 && product.stockQty !== null && CartStore.qtyFor(product.id) >= product.stockQty){
    showToast(`Only ${product.stockQty} in stock`);
    return;
  }
  CartStore.add(product, delta);
  updateCardActionsUI(card, product, list);
  if (delta > 0){
    showToast(`${product.name} added to cart`);
    playAddFlourish($('img', card));
  } else {
    updateCartBadge();
  }
}

// Swaps only the actions subtree (button <-> stepper) — no image reload,
// no full-card re-render, so repeated taps stay instant and flicker-free.
function updateCardActionsUI(card, product, list){
  const actionsWrap = $('.card-actions', card);
  if (!actionsWrap) return;
  actionsWrap.innerHTML = cardActionsHtml(product);
  bindCardActionEvents(card, product, list);
}
