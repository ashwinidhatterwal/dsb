/* =========================================================
   Dhatterwal Suhag Bhandar — shared cart store
   Now that products have their own pages, the cart needs to survive
   real page navigation (not just stay in a JS variable), so it's kept
   in localStorage. Falls back to an in-tab-only variable if storage
   is unavailable for any reason, so the site still works either way.
   ========================================================= */
const CART_STORAGE_KEY = 'dsb_cart_v1';
let cartChangeQueued=false;
function notifyCartChanged(){
  if(cartChangeQueued)return;
  cartChangeQueued=true;
  queueMicrotask(()=>{cartChangeQueued=false;document.dispatchEvent(new CustomEvent('dsb:cartchange'));});
}


function sizeCartKey(id,size){ return size ? String(id)+'::size:'+encodeURIComponent(size) : String(id); }
function productPriceForSize(product,size){const n=Number(product?.sizePrices?.[size]);return size&&Number.isFinite(n)&&n>0?n:Number(product?.price);}
function sizedCartProduct(product,size){
  return size ? {...product,productId:product.productId || product.id,id:sizeCartKey(product.productId || product.id,size),size,price:productPriceForSize(product,size)} : product;
}
const CartStore = (function(){
  let memoryFallback = {};
  let usingFallback = false;
  let consumedFallback=[];

  let repaired=false;
  function sanitize(value){
    if(!value || typeof value!=='object' || Array.isArray(value)){repaired=true;return {};}
    const valid={};
    Object.entries(value).forEach(([key,line])=>{
      if(key==='__dsbApplied')return;
      const p=line?.product;
      if(!p || typeof p.id!=='string' || key!==p.id || !Number.isInteger(line.qty) || line.qty<1 || line.qty>999 || !Number.isFinite(p.price) || p.price<=0){repaired=true;return;}
      valid[key]=line;
    });
    return valid;
  }
  function readAll(){
    if (usingFallback) return memoryFallback;
    try{
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if(!raw)return {};
      const parsed=JSON.parse(raw),clean=sanitize(parsed);
      const expectedKeys=parsed && typeof parsed==='object' ? Object.keys(parsed).filter(k=>k!=='__dsbApplied').length : -1;
      if(expectedKeys!==Object.keys(clean).length || !parsed || Array.isArray(parsed)){
        try{localStorage.setItem(CART_STORAGE_KEY,JSON.stringify({...clean,__dsbApplied:appliedOrders()}));}catch(_){}
      }
      return clean;
    } catch(e){
      repaired=true;
      try{localStorage.setItem(CART_STORAGE_KEY,JSON.stringify(memoryFallback));}catch(_){}
      return memoryFallback;
    }
  }

  function appliedOrders(){
    if(usingFallback)return consumedFallback;
    try {const value=JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '{}').__dsbApplied;return Array.isArray(value)?value:[];} catch(_){return [];}
  }
  function writeAll(cart,applied=appliedOrders()){
    notifyCartChanged();
    if (usingFallback){ memoryFallback = cart;consumedFallback=applied; return; }
    try{
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({...cart,__dsbApplied:applied.slice(-100)}));
    } catch(e){
      usingFallback = true;
      memoryFallback = cart;consumedFallback=applied;
    }
  }

  function locked(fn){return typeof navigator!=='undefined' && navigator.locks?.request ? navigator.locks.request('dsb-cart-write',fn) : fn();}
  return {
    takeRepairNotice(){const value=repaired;repaired=false;return value;},
    addSafe(product,delta){return locked(()=>this.add(product,delta));},
    clearSafe(){return locked(()=>this.clear());},
    syncSafe(catalog){return locked(()=>this.syncWithCatalog(catalog));},
    consumeSafe(items,orderId){return locked(()=>{
      const applied=appliedOrders();if(orderId && applied.includes(orderId))return;
      const cart=readAll();items.forEach(item=>{const key=sizeCartKey(item.id,item.size),entry=cart[key];if(!entry)return;entry.qty-=Math.min(entry.qty,item.qty);if(!entry.qty)delete cart[key];});
      writeAll(cart,orderId?[...applied,orderId]:applied);
    });},
    getAll(){ return readAll(); },
    qtyFor(id){ return readAll()[id]?.qty || 0; },
    qtyForProduct(id){return Object.values(readAll()).filter(x=>(x.product.productId || x.product.id)===id).reduce((sum,x)=>sum+x.qty,0);},
    add(product, delta){
      const cart = readAll();
      if(!Number.isInteger(delta) || !Number.isFinite(product.price) || product.price<=0) return cart[product.id]?.qty || 0;
      if(delta>0){
        if(product.sizes?.length && !product.sizes.includes(product.size)) return cart[product.id]?.qty || 0;
        const baseId=product.productId || product.id;
        const used=Object.values(cart).filter(x=>(x.product.productId || x.product.id)===baseId).reduce((n,x)=>n+x.qty,0);
        if(product.stock==='out of stock' || (product.stockQty!=null && used+delta>product.stockQty)) return cart[product.id]?.qty || 0;
      }
      const nextQty = Math.min(999,(cart[product.id]?.qty || 0) + delta);
      if (nextQty <= 0) delete cart[product.id];
      else cart[product.id] = { product, qty: nextQty };
      writeAll(cart);
      return nextQty;
    },
    clear(){ writeAll({}); },
    count(){ return Object.values(readAll()).reduce((s,c) => s + c.qty, 0); },
    total(){ return Math.round(Object.values(readAll()).reduce((s,c) => s + Math.round(c.qty * c.product.price * 100), 0))/100; },

    // Refreshes every cart line against the latest catalog (current price,
    // image, stock) instead of trusting the snapshot taken when it was
    // added — a cart can sit in localStorage for weeks, and prices or stock
    // can change in that time. Drops anything that's been deleted from the
    // catalog entirely, and clamps quantity down if tracked stock has since
    // fallen below what's in the cart. Does nothing if no catalog is passed
    // (e.g. on pages that never loaded product data) — never treats "no
    // catalog" as "no products exist".
    syncWithCatalog(catalog){
      if (!catalog || !catalog.length) return { removed: [], adjusted: [] };
      const cart = readAll();
      const removed = [], adjusted = [];
      let changed = false;
      const used = {};
      Object.keys(cart).forEach(id => {
        const old=cart[id].product, baseId=old.productId || old.id;
        const fresh=catalog.find(p=>p.id===baseId);
        const oldQty=cart[id].qty, oldPrice=old.price;
        if(!fresh || !Number.isFinite(fresh.price) || fresh.price<=0 || fresh.stock==='out of stock' || ((fresh.sizes || []).length ? !fresh.sizes.includes(old.size) : !!old.size)){
          removed.push(old.name + (old.size ? ' ('+old.size+')' : ''));delete cart[id];changed=true;return;
        }
        cart[id].product=sizedCartProduct(fresh,old.size || '');
        if(fresh.stockQty!=null){
          const available=Math.max(0,fresh.stockQty-(used[baseId] || 0));
          cart[id].qty=Math.min(cart[id].qty,available);
          if(!cart[id].qty){removed.push(old.name);delete cart[id];changed=true;return;}
        }
        const freshLinePrice=productPriceForSize(fresh,old.size || '');
        if(oldQty!==cart[id].qty || oldPrice!==freshLinePrice) adjusted.push({name:old.name,size:old.size || '',oldQty,qty:cart[id].qty,oldPrice,price:freshLinePrice});
        used[baseId]=(used[baseId] || 0)+cart[id].qty;changed=true;
      });
      if (changed) writeAll(cart);
      return { removed, adjusted };
    }
  };
})();
