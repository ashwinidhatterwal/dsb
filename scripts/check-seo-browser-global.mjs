import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seoSource = await fs.readFile(path.join(root, 'seo.js'), 'utf8');
const commerceSource = await fs.readFile(path.join(root, 'storefront-commerce.js'), 'utf8');
const storage = new Map();
const context = vm.createContext({
  console, URL, TextEncoder,
  localStorage: { getItem:k=>storage.get(k)||null, setItem:(k,v)=>storage.set(k,v) },
  window: {}, isOutOfStock:()=>false
});
vm.runInContext(seoSource, context, {filename:'seo.js'});
assert.equal(typeof context.window.DSB_SEO?.details, 'function', 'DSB_SEO must be available through window in a real classic-script environment');
vm.runInContext(commerceSource, context, {filename:'storefront-commerce.js'});
const p={id:'DSB-0297',category:'Jewellery',subcategory:'Mangalsutra',brand:'DSB',material:'Gold Tone Alloy',packsize:'1 Mangalsutra',specifications:'Twin-heart pendant',price:69};
const rows=Array.from(context.window.DSBCommerce.detailRows(p), r=>Array.from(r));
for (const label of ['Brand','Material','Pack / quantity','Specifications']) assert(rows.some(([k])=>k===label), `${label} missing from browser-like product detail rows`);
console.log('PASS: browser global exposes DSB_SEO and storefront product details include structured fields.');
