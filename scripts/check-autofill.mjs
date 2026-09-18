import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = new URL('../admin-autofill.js', import.meta.url);
let source = fs.readFileSync(sourcePath, 'utf8');
source = source.replace(/\}\)\(\);\s*$/, 'globalThis.__parseInput = parseInput;})();');

const context = { document: { addEventListener() {} }, console };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'admin-autofill.js' });

const sample = `Fill this product form like this:

Form field\tValue to enter
Name\tPastel Beadwork Brass Chudi Set
Name in Hindi\tपेस्टल बीडवर्क ब्रास चूड़ी सेट
Category\tJewellery
Subcategory\tBangles / Chudi Set
Price (₹)\t240
MRP (₹)\tEnter actual MRP if different
Cost price (₹)\tEnter actual cost price
Description\tElegant brass chudi set with delicate pastel beadwork in pink, mint green and white tones.
Slug\tpastel-beadwork-brass-chudi-set
Stock quantity\tEnter actual stock
This product requires size selection\t✓ Yes
Available sizes\t2.4, 2.6, 2.8
Brand\tDSB
Material\tBrass
Pack / quantity\t1 Chudi Set
Product specifications\tBrand: DSB; Material: Brass; Colour: Pastel Pink, Mint Green & White; Sizes: 2.4, 2.6, 2.8; Price: ₹240
Size URL / brochure\tLeave blank
Hindi product description\tखूबसूरत पेस्टल रंगों वाला यह ब्रास चूड़ी सेट बेहद आकर्षक है।
Tags\tbrass chudi set, pastel bangles, DSB bangles

Suggested SEO/Product title
DSB Pastel Beadwork Brass Chudi Set`;

const data = context.__parseInput(sample);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(data.name === 'Pastel Beadwork Brass Chudi Set', 'table name not parsed');
assert(data.namehindi === 'पेस्टल बीडवर्क ब्रास चूड़ी सेट', 'Hindi name not parsed');
assert(data.price === 240, 'price not parsed');
assert(data.hasSizes === true, 'size selection flag not parsed');
assert(JSON.stringify(data.sizes) === JSON.stringify(['2.4', '2.6', '2.8']), 'sizes not parsed');
assert(data.material === 'Brass', 'material not parsed');
assert(data.packsize === '1 Chudi Set', 'pack quantity not parsed');
assert(!('mrp' in data), 'MRP placeholder must be ignored');
assert(!('costprice' in data), 'cost placeholder must be ignored');
assert(!('stockqty' in data), 'stock placeholder must be ignored');
assert(!('slug' in data), 'unsupported slug must be ignored');

const colonData = context.__parseInput('Name: Glass Kada\nPrice: ₹160\nSizes: 2.4, 2.6\nMaterial: Glass');
assert(colonData.name === 'Glass Kada' && colonData.price === 160, 'colon format regressed');

const jsonData = context.__parseInput('{"name":"Brass Kada","price":240,"sizes":["2.4","2.6"]}');
assert(jsonData.name === 'Brass Kada' && jsonData.price === 240, 'JSON format regressed');

console.log('Autofill parser checks passed.');
