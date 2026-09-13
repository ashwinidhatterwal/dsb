import fs from 'node:fs/promises';
import path from 'node:path';
import {generateStaticProducts} from './static-products.mjs';
// Publish storefront assets only. Backend source, guides, templates and tests
// must not be served as website downloads.
const destination = path.resolve('_site');
await fs.rm(destination,{recursive:true,force:true});
await fs.mkdir(destination,{recursive:true});
for(const entry of await fs.readdir('.', {withFileTypes:true})){
  if(!entry.isFile()) continue;
  if(entry.name.startsWith('.') || entry.name === 'sample-products.json' || (entry.name.endsWith('.txt') && entry.name!=='robots.txt')) continue;
  if(entry.name !== 'CNAME' && !/\.(?:html|css|js|png|ico|json|txt|xml|svg|webp|jpg|jpeg)$/i.test(entry.name)) continue;
  await fs.copyFile(entry.name,path.join(destination,entry.name));
}
await fs.writeFile(path.join(destination,'.nojekyll'),'');
console.log('Prepared public storefront files.');

const config=await fs.readFile('config.js','utf8');
const api=config.match(/SHEET_API_URL:\s*['"]([^'"]+)/)?.[1];
const site=config.match(/SITE_URL:\s*['"]([^'"]+)/)?.[1]?.replace(/\/$/,'');
if(!api || !site)throw new Error('Missing build configuration');
const rows=JSON.parse(await fs.readFile('.catalog-build.json','utf8'));
const meta=JSON.parse(await fs.readFile('.catalog-build-meta.json','utf8'));
if(meta.api!==api || !Number.isFinite(meta.generatedAt) || Date.now()-meta.generatedAt>86400000)throw new Error('Build snapshot expired or does not match this API');
await fs.writeFile(path.join(destination,'catalog-snapshot.json'),JSON.stringify({...meta,rows}));
const count=await generateStaticProducts(destination,rows,await fs.readFile('product.html','utf8'),site);
await fs.appendFile(path.join(destination,'config.js'),'\nwindow.DSB_PUBLISHED_PRODUCTS=new Set('+JSON.stringify(rows.map(p=>String(p.id))).replaceAll('<','\\u003c')+');\n');
console.log(`Generated ${count} static product pages.`);

await fs.appendFile(path.join(destination,'config.js'),'\nwindow.DSB_HINDI_PRODUCTS=new Set('+JSON.stringify(rows.filter(p=>p.namehindi&&p.descriptionhindi).map(p=>String(p.id))).replaceAll('<','\\u003c')+');\n');
