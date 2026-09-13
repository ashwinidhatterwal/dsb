/* Search-friendly live catalogue. Uses the same source as the storefront. */
(function(){
  function absoluteImage(src){ try { return new URL(src, CONFIG.SITE_URL + '/').href; } catch (_) { return src; } }
  function productHref(p){ return preferredProductPath(p.id); }
  function productUrl(p){ return `${CONFIG.SITE_URL}/${preferredProductPath(p.id)}`; }

  function injectItemList(products){
    const old = document.getElementById('catalogItemListLd');
    if (old) old.remove();
    const el = document.createElement('script');
    el.id = 'catalogItemListLd';
    el.type = 'application/ld+json';
    el.textContent = JSON.stringify({
      '@context':'https://schema.org',
      '@type':'ItemList',
      'name':'Dhatterwal Suhag Bhandar product catalogue',
      'numberOfItems': products.length,
      'itemListElement': products.map((p, i) => ({
        '@type':'ListItem',
        'position': i + 1,
        'url': productUrl(p),
        'item': {
          '@type':'Product',
          'name': p.name,
          'image': absoluteImage(p.image),
          'sku': p.id,
          'url': productUrl(p)
        }
      }))
    });
    document.head.appendChild(el);
  }

  function render(products){
    const root = document.getElementById('catalogRoot');
    if (!products.length){
      root.className = 'catalog-status';
      root.innerHTML = 'No products are available right now. <a href="index.html">Return to the shop</a>.';
      return;
    }
    const groups = new Map();
    products.forEach(p => {
      const cat = p.category || 'Other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(p);
    });
    root.className = '';
    root.innerHTML = Array.from(groups.entries()).map(([cat, items]) => `
      <section>
        <h2 class="catalog-category"><a href="${DSB_SEO.categoryPath(cat)}">${escapeHtml(cat)}</a></h2>
        <div class="catalog-list">
          ${items.map(p => `<a class="catalog-item" href="${productHref(p)}">
            <strong>${escapeHtml(p.name)}</strong>
            <span>${escapeHtml(p.subcategory || '')} · ${money(p.price)} · ${isOutOfStock(p) ? 'Out of stock' : 'In stock'}</span>
          </a>`).join('')}
        </div>
      </section>`).join('');
    injectItemList(products);
  }

  document.addEventListener('dsb:catalogchange',()=>render(ALL_PRODUCTS));
  document.addEventListener('DOMContentLoaded', async () => {
    try { render(await loadAllProducts()); }
    catch (err) {
      console.error('Catalogue load failed', err);
      const root=document.getElementById('catalogRoot');
      if(root.querySelector('a.catalog-item'))root.insertAdjacentHTML('afterbegin','<p class="catalog-status" role="status">Showing saved products. Current availability is checked before ordering.</p>');
      else root.innerHTML='Could not load the catalogue right now. <a href="index.html">Return to the shop</a>';
    }
  });
})();
