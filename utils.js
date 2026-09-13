/* =========================================================
   Dhatterwal Suhag Bhandar — shared helpers
   ========================================================= */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const currencyNumberFormat = new Intl.NumberFormat('en-IN');
function money(n){
  const num = Number(n) || 0;
  return '₹' + currencyNumberFormat.format(num);
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
function preferredProductPath(id){
  if(window.DSB_PAGE_LANGUAGE==='hi'&&window.DSB_HINDI_PRODUCTS?.has(String(id)))return 'hi/'+DSB_SEO.productPath(id);
  if(window.DSB_PUBLISHED_PRODUCTS?.has(String(id))){const hex=Array.from(new TextEncoder().encode(String(id)),b=>b.toString(16).padStart(2,'0')).join('');return `products/p-${hex}.html`;}
  return `product.html?id=${encodeURIComponent(id)}`;
}
function productUrl(p){
  const base = (typeof CONFIG !== 'undefined' && CONFIG.SITE_URL) ? CONFIG.SITE_URL : location.origin;
  return `${base}/${preferredProductPath(p.id)}`;
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
let revealObserver;
const observedReveals=new WeakSet();
function initScrollReveal(root){
  const items=$$('.reveal:not(.in-view)',root||document);
  if(!items.length)return;
  if(!('IntersectionObserver' in window) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){items.forEach(el=>el.classList.add('in-view'));return;}
  if(!revealObserver)revealObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('in-view');revealObserver.unobserve(entry.target);}});
  },{rootMargin:'0px 0px -60px 0px',threshold:.1});
  items.forEach(el=>{if(!observedReveals.has(el)){observedReveals.add(el);revealObserver.observe(el);}});
}


async function requestJson(url, options = {}, timeoutMs = 15000){
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(),timeoutMs);
  try {
    const res = await fetch(url,{cache:'no-store',...options,signal:controller.signal});
    if (!res.ok) throw new Error('The shop could not be reached. Please try again.');
    const data = await res.json();
    return data;
  } catch(err) {
    if (err.name === 'AbortError') throw new Error('The request timed out. Please try again.');
    throw err;
  } finally { clearTimeout(timer); }
}
function newCheckoutId(){
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64; bytes[8]=(bytes[8]&63)|128;
  const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function productImageUrl(src,width){
  try {
    const url = new URL(src,location.href);
    const assetPath=url.pathname.split('/image/upload/')[1];
    const first=assetPath?.split('/')[0] || '';
    const alreadyTransformed=/^(?:[a-z]{1,4}_|\$)/.test(first) && !/^v\d+$/.test(first);
    if (url.hostname === 'res.cloudinary.com' && assetPath && !alreadyTransformed) {
      url.pathname = url.pathname.replace('/image/upload/',`/image/upload/f_auto,q_auto,c_limit,w_${width}/`);
      return url.href;
    }
  } catch (_) {}
  return src;
}
const dialogStack = [];
function openDialogFocus(root,onClose){
  document.querySelector('.install-banner')?.classList.remove('show');
  if (!root || dialogStack.some(x=>x.root===root)) return;
  root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true'); root.tabIndex=-1;
  const entry={root,onClose,previous:document.activeElement,siblings:[]};
  for(let node=root;node&&node!==document.body;node=node.parentElement){
    if(!node.parentElement) break;
    Array.from(node.parentElement.children).forEach(sibling=>{
      if(sibling===node || /^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName)) return;
      entry.siblings.push([sibling,sibling.inert]); sibling.inert=true;
    });
  }
  dialogStack.push(entry);
  (root.querySelector('button:not([disabled]),input,select,textarea,a[href]') || root).focus();
}
function closeDialogFocus(root){
  const index=dialogStack.findIndex(x=>x.root===root); if(index<0) return;
  // Close any nested dialog first so its saved inert state cannot leak.
  while(dialogStack.length>index){
    const entry=dialogStack.pop(); entry.siblings.forEach(([el,state])=>el.inert=state);
    entry.root.removeAttribute('aria-modal');
    if(entry.previous && entry.previous.isConnected) entry.previous.focus();
  }
}
document.addEventListener('keydown',e=>{
  const entry=dialogStack[dialogStack.length-1]; if(!entry) return;
  if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); entry.onClose(); return; }
  if(e.key!=='Tab') return;
  const focusable=Array.from(entry.root.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(el=>el.getClientRects().length && !el.closest('[inert]'));
  const first=focusable[0],last=focusable[focusable.length-1];
  if(!first){e.preventDefault();entry.root.focus();}
  else if(e.shiftKey && (document.activeElement===first || !entry.root.contains(document.activeElement))){e.preventDefault();last.focus();}
  else if(!e.shiftKey && (document.activeElement===last || !entry.root.contains(document.activeElement))){e.preventDefault();first.focus();}
},true);
