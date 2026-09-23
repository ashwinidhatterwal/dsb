/* Review moderation stays in admin; customer review reads use the public API. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  let loading = false;
  async function load() {
    if (loading || !API_URL || !ADMIN_PROFILE) return;
    loading = true;
    const box = byId('adminReviewsList'), message = byId('adminReviewsStatus');
    message.textContent = 'Loading reviews…';
    try {
      const rows = await adminRead('adminReviews');
      if (!Array.isArray(rows)) throw new Error('Invalid review response.');
      box.innerHTML = rows.length ? rows.map(row => {
        const id = escapeHtml(row.id), status = escapeHtml(row.status);
        const date = new Date(row.date);
        const label = isNaN(date) ? '' : date.toLocaleDateString('en-IN');
        const owner = ADMIN_PROFILE.role === 'admin';
        return `<article class="admin-review-card" data-review-id="${id}" data-review-status="${status}">
          <h3>${escapeHtml(row.name)} <span aria-label="${Number(row.rating)} out of 5 stars">${'★'.repeat(Math.min(5,Math.max(0,Number(row.rating)||0)))}</span></h3>
          <div class="admin-review-meta">${escapeHtml(row.productId)} · ${escapeHtml(label)} · ${status}${row.verified ? ' · Verified purchase' : ' · Unverified'}</div>
          <p>${escapeHtml(row.comment)}</p>${owner ? `<div class="admin-review-actions">
            ${row.status !== 'Approved' ? '<button type="button" data-moderate="Approved">Approve</button>' : ''}
            ${row.status !== 'Hidden' ? '<button type="button" data-moderate="Hidden">Hide</button>' : ''}
          </div>` : ''}</article>`;
      }).join('') : '<p class="hint">No reviews yet.</p>';
      message.textContent = rows.filter(row => row.status === 'Pending').length + ' awaiting review · showing up to 100 recent entries';
    } catch (err) { message.textContent = 'Could not load reviews: ' + err.message; }
    finally { loading = false; }
  }
  async function moderate(button) {
    const card = button.closest('[data-review-id]');
    if (!card || ADMIN_PROFILE?.role !== 'admin') return;
    const buttons = card.querySelectorAll('button');
    buttons.forEach(item => item.disabled = true);
    try {
      const response = await adminFetch(API_URL, {
        method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify({ action:'moderateReview', key:ADMIN_KEY, reviewId:card.dataset.reviewId,
          status:button.dataset.moderate, expectedStatus:card.dataset.reviewStatus })
      });
      const result = await response.json();
      if (result.error || result.success !== true) throw new Error(result.error || 'Could not update review.');
      await load();
      byId('adminReviewsRefresh')?.focus();
    } catch (err) {
      byId('adminReviewsStatus').textContent = 'Moderation failed: ' + err.message;
      buttons.forEach(item => item.disabled = false);
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    byId('adminReviewsRefresh')?.addEventListener('click', load);
    byId('adminReviewsList')?.addEventListener('click', event => {
      const button = event.target.closest('button[data-moderate]');
      if (button) moderate(button);
    });
  });
  window.DSBAdminReviews = Object.freeze({load});
})();
