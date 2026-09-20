import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFile(path.join(root, file), 'utf8');
const storage = new Map();
const context = vm.createContext({
  console,
  localStorage: { getItem:k => storage.get(k) || null, setItem:(k,v) => storage.set(k,v) },
  window: { DSB_SEO: { pricing:p => ({min:Number(p.price)}), details:p => p.material ? [['Material',p.material]] : [] } },
  isOutOfStock:p => p.stock === 'out of stock'
});
vm.runInContext(await read('storefront-commerce.js'), context);
context.window.DSBCommerce.rememberViewed({id:'A'});
context.window.DSBCommerce.rememberViewed({id:'B'});
assert.deepEqual(Array.from(context.window.DSBCommerce.readRecentIds()), ['B','A']);
const products = [
  {id:'A',category:'Bangles',subcategory:'Glass',tags:'bridal red',price:200,stock:'in stock'},
  {id:'B',category:'Bangles',subcategory:'Glass',tags:'red party',price:210,stock:'in stock'},
  {id:'C',category:'Bangles',subcategory:'Metal',tags:'gold',price:700,stock:'in stock'},
  {id:'D',category:'Beauty',subcategory:'Lipstick',tags:'red',price:220,stock:'in stock'}
];
assert.equal(context.window.DSBCommerce.similarProducts(products[0], products, 3)[0].id, 'B');
assert.deepEqual(Array.from(context.window.DSBCommerce.recentProducts(products,'B',8)).map(x=>x.id), ['A']);
assert(context.window.DSBCommerce.detailRows({...products[0],sizes:['2.4','2.6'],material:'Glass'}).some(([k])=>k==='Available sizes'));
const home = await read('index.html');
assert(home.includes('id="subcategorySelect"'));
assert(home.includes('id="priceFilter"'));
assert(home.includes('id="recentlyViewedSection"'));
assert(home.includes('storefront-analytics.js'));
const product = await read('product.js');
assert(product.includes('DSBCommerce.similarProducts'));
assert(product.includes('DSBCommerce.assuranceHtml'));
assert(product.includes('DSBAnalytics?.productView'));
const app = await read('app.js');
assert(app.includes("priceFilter === 'under-100'"));
assert(app.includes("price: priceFilter === 'all' ? '' : priceFilter"));
const checkout = await read('cart-ui-checkout.js');
assert(checkout.includes("'begin_checkout'"));
assert(checkout.includes("'order_completed'"));
console.log('PASS: Level 1 filters, recent products, similarity, assurance information and analytics hooks.');
