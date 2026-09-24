import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFile(path.join(root, file), 'utf8');

const seoSource = await read('seo.js');
const commerceSource = await read('storefront-commerce.js');
const productSource = await read('product.js');
const dataSource = await read('products-data.js');

const storage = new Map();
const context = vm.createContext({
  console,
  URL,
  TextEncoder,
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  },
  window: {},
  isOutOfStock: () => false
});
vm.runInContext(seoSource + '\nwindow.DSB_SEO = DSB_SEO;', context, { filename: 'seo.js' });
vm.runInContext(commerceSource, context, { filename: 'storefront-commerce.js' });

const fixture = {
  id: 'DSB-0297',
  name: 'Premrekha Twin Heart White Stone Black Bead Mangalsutra',
  category: 'Jewellery',
  subcategory: 'Mangalsutra',
  brand: 'DSB',
  material: 'Gold Tone Alloy, Black Beads & White Stones',
  packsize: '1 Mangalsutra',
  specifications: 'Twin-heart pendant with white stones',
  price: 69,
  stock: 'in stock',
  sizes: []
};
const rows = Array.from(context.window.DSBCommerce.detailRows(fixture), row => Array.from(row));
assert(rows.some(([label, value]) => label === 'Brand' && value === fixture.brand));
assert(rows.some(([label, value]) => label === 'Material' && value === fixture.material));
assert(rows.some(([label, value]) => label === 'Pack / quantity' && value === fixture.packsize));
assert(rows.some(([label, value]) => label === 'Specifications' && value === fixture.specifications));

assert(productSource.includes('function renderProductDetails(p)'), 'product details need one reusable renderer');
assert(productSource.includes('<dl class="product-specs">${productDetailRowsHtml(p)}</dl>'), 'initial render must use the shared detail renderer');
const catalogHandler = productSource.match(/document\.addEventListener\('dsb:catalogchange',[\s\S]*?document\.addEventListener\('DOMContentLoaded'/)?.[0] || '';
assert(catalogHandler.includes('renderProductDetails(updated);'), 'live catalogue refresh must rebuild structured product details');
const languageHandler = productSource.match(/document\.addEventListener\('dsb:languagechange',[\s\S]*?document\.addEventListener\('dsb:catalogchange'/)?.[0] || '';
assert(languageHandler.includes('renderProductDetails(p);'), 'language refresh must rebuild product details consistently');
assert(dataSource.includes("const CATALOG_SESSION_KEY = 'dsb_catalog_v7';"), 'catalogue cache version must invalidate older incomplete session records');
assert(!dataSource.includes("const CATALOG_SESSION_KEY = 'dsb_catalog_v6';"));

const productHtml = await read('product.html');
for (const asset of ['i18n.js', 'seo.js', 'products-data.js', 'product.js']) {
  assert(productHtml.includes(`${asset}?v=20260924details3`), `${asset} must use the product-details cache-busting release token`);
}
for (const page of ['index.html', 'catalog.html', 'about.html', 'contact.html', 'privacy.html', 'returns.html']) {
  const html = await read(page);
  if (html.includes('products-data.js')) assert(html.includes('products-data.js?v=20260924details3'), `${page} must not serve stale product catalogue code`);
}

console.log('PASS: structured product details render Brand/Material/Pack/Specifications and refresh when live catalogue data replaces cached data.');
