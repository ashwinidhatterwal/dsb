/* =========================================================
   Dhatterwal Suhag Bhandar — shared cart store
   Now that products have their own pages, the cart needs to survive
   real page navigation (not just stay in a JS variable), so it's kept
   in localStorage. Falls back to an in-tab-only variable if storage
   is unavailable for any reason, so the site still works either way.
   ========================================================= */
const CART_STORAGE_KEY = 'dsb_cart_v1';

const CartStore = (function(){
  let memoryFallback = {};
  let usingFallback = false;

  function readAll(){
    if (usingFallback) return memoryFallback;
    try{
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch(e){
      usingFallback = true;
      return memoryFallback;
    }
  }

  function writeAll(cart){
    if (usingFallback){ memoryFallback = cart; return; }
    try{
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch(e){
      usingFallback = true;
      memoryFallback = cart;
    }
  }

  return {
    getAll(){ return readAll(); },
    qtyFor(id){ return readAll()[id]?.qty || 0; },
    add(product, delta){
      const cart = readAll();
      const nextQty = (cart[product.id]?.qty || 0) + delta;
      if (nextQty <= 0) delete cart[product.id];
      else cart[product.id] = { product, qty: nextQty };
      writeAll(cart);
      return nextQty;
    },
    clear(){ writeAll({}); },
    count(){ return Object.values(readAll()).reduce((s,c) => s + c.qty, 0); },
    total(){ return Object.values(readAll()).reduce((s,c) => s + c.qty * c.product.price, 0); },

    // Refreshes every cart line against the latest catalog (current price,
    // image, stock) instead of trusting the snapshot taken when it was
    // added — a cart can sit in localStorage for weeks, and prices or stock
    // can change in that time. Drops anything that's been deleted from the
    // catalog entirely, and clamps quantity down if tracked stock has since
    // fallen below what's in the cart. Does nothing if no catalog is passed
    // (e.g. on pages that never loaded product data) — never treats "no
    // catalog" as "no products exist".
    syncWithCatalog(catalog){
      if (!catalog || !catalog.length) return { removed: [] };
      const cart = readAll();
      const removed = [];
      let changed = false;
      Object.keys(cart).forEach(id => {
        const fresh = catalog.find(p => p.id === id);
        if (!fresh){
          removed.push(cart[id].product.name);
          delete cart[id];
          changed = true;
          return;
        }
        cart[id].product = fresh;
        if (fresh.stockQty !== null && cart[id].qty > fresh.stockQty){
          if (fresh.stockQty <= 0){
            removed.push(fresh.name);
            delete cart[id];
          } else {
            cart[id].qty = fresh.stockQty;
          }
        }
        changed = true;
      });
      if (changed) writeAll(cart);
      return { removed };
    }
  };
})();
