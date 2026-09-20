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

  document.addEventListener('invalid', event => {
    animate(event.target, [{translate: '-3px 0'}, {translate: '3px 0'}, {translate: '0 0'}]);
  }, true);

  // A single, fixed decorative layer: no moving page regions or layout writes.
  let burst, burstTimer;
  function clearBurst() {
    clearTimeout(burstTimer);
    burst?.remove();
    burst = null;
  }
  motion.addEventListener('change', () => { if (motion.matches) clearBurst(); });
  window.DSBFeedback = {
    celebrate(anchor) {
      clearBurst();
      if (motion.matches) return;
      const cart = document.getElementById('cartTrigger');
      animate(cart, [{rotate:'0deg'}, {rotate:'-10deg'}, {rotate:'8deg'}, {rotate:'-3deg'}, {rotate:'0deg'}], 440);
      const rect = (anchor || cart)?.getBoundingClientRect();
      if (!rect || !rect.width || rect.bottom < 0 || rect.top > innerHeight) return;
      burst = document.createElement('div');
      burst.className = 'cart-pop';
      burst.setAttribute('aria-hidden', 'true');
      burst.style.left = Math.max(36, Math.min(innerWidth - 36, rect.right - 18)) + 'px';
      burst.style.top = Math.max(36, Math.min(innerHeight - 36, rect.top)) + 'px';
      burst.innerHTML = '<span class="cart-pop-check">✓</span>' +
        Array.from({length: 6}, (_, i) => '<i style="--angle:' + (i * 60) + 'deg"></i>').join('');
      document.body.appendChild(burst);
      burstTimer = setTimeout(clearBurst, 650);
    }
  };
})();
