/* reviews responsibilities. Bundled into code.gs by scripts/build.mjs. */
function getCachedReviews_() {
  const cached = cacheGetChunkedJson_(REVIEWS_CACHE_KEY);
  if (Array.isArray(cached)) return cached;
  const rows = rowsAsObjects_(getSheet_(REVIEWS_SHEET));
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  cachePutJson_(REVIEWS_CACHE_KEY, rows, REVIEWS_CACHE_TTL);
  return rows;
}
function publicReview_(r) {
  return {
    id: r.id,
    productid: r.productid,
    name: r.name,
    rating: r.rating,
    comment: r.comment,
    date: r.date,
    verified: String(r.verified || '').toLowerCase() === 'yes' || r.verified === true
  };
}
function getReviews(productId) {
  const rows = getCachedReviews_();
  const selected = productId ? rows.filter(r => String(r.productid) === String(productId)) : rows;
  return selected.map(publicReview_);
}
function getReviewSummaries() {
  const cached = cacheGetJson_(REVIEW_SUMMARY_CACHE_KEY);
  if (cached) return cached;
  const rows = getCachedReviews_();
  const totals = {};
  rows.forEach(r => {
    const pid = String(r.productid || '').trim();
    if (!pid) return;
    const rating = Math.min(5, Math.max(1, safeNumber_(r.rating, 0)));
    if (!totals[pid]) totals[pid] = {
      avg: 0,
      count: 0,
      sum: 0
    };
    totals[pid].sum += rating;
    totals[pid].count += 1;
  });
  const summary = {};
  Object.keys(totals).forEach(pid => {
    summary[pid] = {
      avg: totals[pid].count ? totals[pid].sum / totals[pid].count : 0,
      count: totals[pid].count
    };
  });
  cachePutJson_(REVIEW_SUMMARY_CACHE_KEY, summary, REVIEW_SUMMARY_CACHE_TTL);
  return summary;
}
function reviewPurchaseVerification_(productId, orderId, phone) {
  const oid = String(orderId || '').trim();
  const rawPhone = String(phone || '').trim();
  if (!oid && !rawPhone) return { verified: false, ref: '' };
  if (!oid || !rawPhone) throw new Error('Enter both order number and phone number to verify the purchase, or leave both blank.');
  const tracked = trackOrder(oid, rawPhone);
  if (!tracked || !tracked.success) throw new Error('Could not verify that order. Check the order number and phone, or submit without verification.');
  if (COMPLETED_STATUSES.indexOf(String(tracked.status || '')) < 0) throw new Error('A review can be marked Verified purchase after the order is delivered.');
  const bought = getOrderItemQuantities_(oid).some(item => String(item.id) === String(productId) && safeNumber_(item.qty, 0) > 0);
  if (!bought) throw new Error('That order does not contain this product.');
  return { verified: true, ref: hashText_(oid + '|' + productId) };
}
function addReview(r) {
  return withWriteLock_(function () {
    const productId = String(r.productId || r.productid || '').trim();
    const name = String(r.name || '').trim(),
      comment = String(r.comment || '').trim(),
      rating = Number(r.rating);
    if (r.website || !name || name.length > 60 || comment.length < 2 || comment.length > 600 || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Please enter a name, a rating from 1 to 5 and feedback of 2–600 characters.');
    if (!findRow_(getSheet_(PRODUCTS_SHEET), 'id', productId)) throw new Error('Product not found.');
    const purchase = reviewPurchaseVerification_(productId, r.orderId, r.phone);
    const identity = hashText_(productId + '|' + name.toLowerCase() + '|' + comment.toLowerCase());
    rateLimit_('review-duplicate:' + identity, 1, 86400);
    rateLimit_('review-client:' + String(r.clientId || identity).slice(0, 80), 3, 3600);
    rateLimit_('reviews-global', 60, 3600);
    const existing = getCachedReviews_();
    if (purchase.verified && existing.some(row => String(row.verificationref || '') === purchase.ref)) throw new Error('This purchase has already been reviewed.');
    const sheet = getSheet_(REVIEWS_SHEET);
    ensureColumn_(sheet, 'verified');
    ensureColumn_(sheet, 'verificationRef');
    const heads = headers_(sheet);
    const record = {
      id: 'REV-' + Utilities.getUuid().slice(0, 8),
      productid: productId,
      name: name,
      rating: rating,
      comment: comment,
      date: new Date(),
      verified: purchase.verified ? 'Yes' : '',
      verificationref: purchase.ref
    };
    sheet.appendRow(heads.map(h => sheetText_(record[h] !== undefined ? record[h] : '')));
    cacheRemove_(REVIEW_SUMMARY_CACHE_KEY);
    cacheRemove_(REVIEWS_CACHE_KEY);
    return {
      success: true,
      id: record.id,
      verified: purchase.verified
    };
  });
}

