/* reviews responsibilities. Bundled into code.gs by scripts/build.mjs. */
function getCachedReviews_() {
  const cached = cacheGetChunkedJson_(REVIEWS_CACHE_KEY);
  if (Array.isArray(cached)) return cached;
  const rows = rowsAsObjects_(getSheet_(REVIEWS_SHEET));
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  cachePutJson_(REVIEWS_CACHE_KEY, rows, REVIEWS_CACHE_TTL);
  return rows;
}
function getReviews(productId) {
  const rows = getCachedReviews_();
  if (!productId) return rows;
  return rows.filter(r => String(r.productid) === String(productId));
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
function addReview(r) {
  return withWriteLock_(function () {
    const productId = String(r.productId || r.productid || '').trim();
    const name = String(r.name || '').trim(),
      comment = String(r.comment || '').trim(),
      rating = Number(r.rating);
    if (r.website || !name || name.length > 60 || comment.length < 2 || comment.length > 600 || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Please enter a name, a rating from 1 to 5 and feedback of 2–600 characters.');
    if (!findRow_(getSheet_(PRODUCTS_SHEET), 'id', productId)) throw new Error('Product not found.');
    const identity = hashText_(productId + '|' + name.toLowerCase() + '|' + comment.toLowerCase());
    rateLimit_('review-duplicate:' + identity, 1, 86400);
    rateLimit_('review-client:' + String(r.clientId || identity).slice(0, 80), 3, 3600);
    rateLimit_('reviews-global', 60, 3600);
    const sheet = getSheet_(REVIEWS_SHEET),
      heads = headers_(sheet);
    const record = {
      id: 'REV-' + Utilities.getUuid().slice(0, 8),
      productid: productId,
      name: name,
      rating: rating,
      comment: comment,
      date: new Date()
    };
    sheet.appendRow(heads.map(h => sheetText_(record[h] !== undefined ? record[h] : '')));
    cacheRemove_(REVIEW_SUMMARY_CACHE_KEY);
    cacheRemove_(REVIEWS_CACHE_KEY);
    return {
      success: true,
      id: record.id
    };
  });
}
