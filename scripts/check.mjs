import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { generateStaticProducts } from '../.github/scripts/static-products.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFile(path.join(root, file), 'utf8');
const htmlFiles = (await fs.readdir(root)).filter(file => file.endsWith('.html'));
for (const htmlFile of htmlFiles) {
  const html = await read(htmlFile);
  const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
  for (const ref of refs) {
    if (/^(?:https?:|mailto:|tel:|#|data:|upi:)/i.test(ref)) continue;
    const local = ref.split(/[?#]/, 1)[0].replace(/^\.\//, '');
    if (!local || local.endsWith('/')) continue;
    await fs.access(path.join(root, local)).catch(() => { throw new Error(`${htmlFile} references missing local asset: ${local}`); });
  }
}
for (const file of (await fs.readdir(root)).filter(f => f.endsWith('.js') || f === 'code.gs')) {
  new vm.Script(await read(file), { filename: file });
}
const storage = new Map();
const context = vm.createContext({
  console, URL, URLSearchParams, TextEncoder, location: { search: '' },
  window: { addEventListener() {} },
  document: { addEventListener() {}, dispatchEvent() {} },
  navigator: {}, queueMicrotask() {}, CustomEvent: function () {},
  localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
  escapeHtml: String, money: n => '₹' + n, productImageUrl: s => s,
  preferredProductPath: () => '', lowStockLabel: () => '', isOutOfStock: () => false
});
for (const file of ['seo.js', 'cart.js', 'render-helpers.js', 'app.js']) vm.runInContext(await read(file), context);
context.fixture = { id: 'P', name: 'Example', price: 250, mrp: 350, sizes: ['S', 'M'], sizeprices: 'S=299,M=329', stock: 'in stock', stockQty: 2 };
const run = code => vm.runInContext(code, context);
assert(run('cardHtml(fixture)').includes('15% OFF'));
assert(run('cardHtml(fixture)').includes('From ₹299'));
assert.equal(run('sizedCartProduct(fixture,"M").price'), 329);
assert.equal(run('sortMode="price-asc"; sortProducts([fixture,{id:"Q",price:280}])[0].id'), 'Q');
assert.equal(await run('CartStore.tryAddSafe(sizedCartProduct(fixture,"S"),1)'), true);
assert.equal(await run('CartStore.tryAddSafe(sizedCartProduct(fixture,"M"),1)'), true);
assert.equal(await run('CartStore.tryAddSafe(sizedCartProduct(fixture,"M"),1)'), false);
assert.equal(run('CartStore.total()'), 628);

const backend = vm.createContext({ console });
vm.runInContext(await read('code.gs'), backend);
const data = [['id','name','price','sizes','sizeprices','stockqty','stock'], ['P','Example',250,'S,M','S=299,M=329',2,'in stock']];
const result = backend.buildValidatedOrderItems_([{id:'P',size:'S',qty:1},{id:'P',size:'M',qty:1}],data);
assert(result.ok);
assert.equal(result.subtotal,628);
assert.equal(backend.buildValidatedOrderItems_([{id:'P',size:'L',qty:1}],data).ok,false);
assert.equal(backend.buildValidatedOrderItems_([{id:'P',size:'S',qty:2},{id:'P',size:'M',qty:1}],data).ok,false);

const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'dsb-check-'));
try {
  for (const file of ['index.html','catalog.html']) await fs.copyFile(path.join(root,file),path.join(destination,file));
  await generateStaticProducts(destination,[{...context.fixture,sizes:'S,M',category:'Bangles'}],await read('product.html'),'https://suhagbhandar.in');
  assert((await fs.readFile(path.join(destination,'catalog.html'),'utf8')).includes('From ₹299.00'));
  const home=await fs.readFile(path.join(destination,'index.html'),'utf8');
  assert(home.includes('id="catRail"'));
  assert(!home.includes('class="seo-category-links"'));
} finally {
  await fs.rm(destination, { recursive: true });
}
console.log('PASS: syntax, pricing, discount, sorting, cart limits, checkout size/stock validation and static publishing.');
