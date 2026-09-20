/* Shared presentation only: never delays navigation, requests or cart writes. */
(() => {
  'use strict';
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const running = new Map();
  function animate(element, frames, duration = 240) {
    if (!element || motion.matches || !element.animate) return;
    running.get(element)?.cancel();
    const animation = element.animate(frames, {
      duration, easing: 'cubic-bezier(.22,.72,.22,1)'
    });
    running.set(element, animation);
    const cleanup = () => {
      if (running.get(element) === animation) running.delete(element);
    };
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  }
  motion.addEventListener('change', () => {
    if (motion.matches) {
      running.forEach(animation => animation.cancel());
      running.clear();
    }
  });

  window.setButtonBusy = (button, busy) => {
    if (!button) return;
    button.disabled = busy;
    if (busy) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  };

  let toastTimer;
  window.showToast = message => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  };

  // Capture also covers controls whose own handlers stop event propagation.
  // Independent scale leaves existing transform-based positioning intact.
  document.addEventListener('click', event => {
    const control = event.target.closest?.('button, a[href], [role="button"], input[type="submit"]');
    if (!control || control.matches(':disabled, [aria-disabled="true"]') || control.closest('[inert]')) return;
    animate(control, [{scale: '.96'}, {scale: '1'}], 220);
  }, true);
  document.addEventListener('invalid', event => {
    animate(event.target, [{translate: '-3px 0'}, {translate: '3px 0'}, {translate: '0 0'}]);
  }, true);

  // Only observe content regions; no attribute polling or per-card listeners.
  // Batch synchronous renders, and animate once per region, not every child.
  const regions = '.card-actions, #pdActions, .pd-prices, #catalogRoot, #productGrid, #newArrivalsRail, #popularPicksRail, #searchResults, #pdRoot, #cartContent, #productList, #orderList, #archiveList, #trackResult, #autofillPreview';
  const pending = new Set();
  let frame = 0;
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const region = record.target.nodeType === 1 ? record.target.closest(regions) : record.target.parentElement?.closest(regions);
      if (region) pending.add(region);
    }
    if (frame || !pending.size) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      pending.forEach(region => {
        if (region.getClientRects().length) animate(region, [{opacity: .78, translate: '0 5px'}, {opacity: 1, translate: '0 0'}]);
      });
      pending.clear();
    });
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll(regions).forEach(region => observer.observe(region, {childList: true, subtree: true}));
  });
})();
