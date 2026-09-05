/* =========================================================
   Dhatterwal Suhag Bhandar — shared helpers
   ========================================================= */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function money(n){
  const num = Number(n) || 0;
  return '₹' + num.toLocaleString('en-IN');
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function formatDateTime(value){
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value || '');
  return d.toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

let toastTimer;
function showToast(msg){
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// Points the floating WhatsApp button at the shop's number from config.js,
// so it only ever needs to be set in one place.
function initWhatsAppFloat(){
  const el = $('#waFloat');
  if (el && typeof CONFIG !== 'undefined') el.href = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}`;
}

/* ---------------- Star rating (shared by cards + product page) ---------------- */
function renderStars(rating, size){
  const r = Math.round(Number(rating) || 0);
  const cls = size === 'lg' ? 'stars stars-lg' : 'stars';
  let out = `<span class="${cls}">`;
  for (let i = 1; i <= 5; i++){
    out += `<span class="${i <= r ? 'star filled' : 'star'}">★</span>`;
  }
  out += '</span>';
  return out;
}

/* ---------------- Product sharing (Web Share API, with fallbacks) ---------------- */
function productUrl(p){
  const base = (typeof CONFIG !== 'undefined' && CONFIG.SITE_URL) ? CONFIG.SITE_URL : location.origin;
  return `${base}/product.html?id=${encodeURIComponent(p.id)}`;
}

async function shareProduct(p){
  const url = productUrl(p);
  const shopName = (typeof CONFIG !== 'undefined' && CONFIG.SHOP_NAME) || 'our shop';
  const text = `${p.name} — ${money(p.price)} at ${shopName}`;
  if (navigator.share){
    try{ await navigator.share({ title: p.name, text, url }); }
    catch(err){ /* user cancelled the native share sheet — nothing to do */ }
    return;
  }
  try{
    await navigator.clipboard.writeText(url);
    showToast('Link copied — share it anywhere!');
  } catch(err){
    // Clipboard unavailable — fall back to opening a WhatsApp share intent directly.
    window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank', 'noopener');
  }
}

/* ---------------- Scroll-reveal ----------------
   Adds .in-view to any .reveal element once it scrolls near the viewport.
   Safe no-op wherever IntersectionObserver isn't available. */
function initScrollReveal(root){
  const items = $$('.reveal', root || document);
  if (!items.length) return;
  if (!('IntersectionObserver' in window)){
    items.forEach(el => el.classList.add('in-view'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting){
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -60px 0px', threshold: 0.1 });
  items.forEach(el => observer.observe(el));
}
