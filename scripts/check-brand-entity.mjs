import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = file => fs.readFile(new URL('../' + file, import.meta.url), 'utf8');
const home = await read('index.html');
const about = await read('about.html');
const contact = await read('contact.html');
const catalog = await read('catalog.html');
const catalogJs = await read('catalog.js');
const seo = await read('seo.js');
const staticProducts = await read('.github/scripts/static-products.mjs');

for (const [name, html] of [['home', home], ['about', about], ['contact', contact]]) {
  assert(html.includes('https://suhagbhandar.in/#store'), `${name} must reference the canonical store @id`);
}
assert(home.includes('"@type": ["OnlineStore", "Store"]'), 'home must identify DSB as both online and physical store');
assert(home.includes('"alternateName": ["Suhag Bhandar", "DSB"]'), 'home must declare the DSB aliases');
assert(home.includes('"@id": "https://suhagbhandar.in/#website"'), 'home must declare one canonical WebSite entity');
assert(home.includes('"alternateName": "Suhag Bhandar"'), 'WebSite must provide the preferred alternative site name');
assert(home.includes('https://suhagbhandar.in/icon-512.png'), 'brand schema must expose a crawlable 512px logo');
assert(about.includes('suhagbhandar.in is our official website and online storefront.'), 'About page must state the official domain in visible copy');
assert(about.includes('broader than bridal or suhag products'), 'About page must disambiguate the catalogue from bridal-only assumptions');
assert(catalog.includes('id="catalogPageLd"'), 'catalogue must have a static CollectionPage node');
assert(seo.includes("'@id': site + '/#store'"), 'Product offers must reference the same canonical seller @id');
assert(staticProducts.includes('id="catalogItemListLd"'), 'published catalogue must include a server-rendered ItemList');
assert(!staticProducts.includes("item:{'@type':'Product'"), 'catalogue summary ItemList must not embed incomplete Product nodes');
assert(!catalogJs.includes("'item': {\n          '@type': 'Product'"), 'live catalogue ItemList must not embed incomplete Product nodes');
assert(staticProducts.includes('og:site_name'), 'generated SEO pages must preserve the canonical site name');

// Syntax check the browser SEO helper after identity changes.
new vm.Script(seo, { filename: 'seo.js' });
console.log('PASS: canonical DSB brand/entity identity is consistent across homepage, About, Contact, catalogue and product offers.');
