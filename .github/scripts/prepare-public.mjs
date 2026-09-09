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
  if(entry.name === '.catalog-build.json' || entry.name === 'sample-products.json' || (entry.name.endsWith('.txt') && entry.name!=='robots.txt')) continue;
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
const count=await generateStaticProducts(destination,rows,await fs.readFile('product.html','utf8'),site);
console.log(`Generated ${count} static product pages.`);
