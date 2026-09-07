import fs from 'node:fs/promises';
import path from 'node:path';
// Publish storefront assets only. Backend source, guides, templates and tests
// must not be served as website downloads.
const destination = path.resolve('_site');
await fs.mkdir(destination,{recursive:true});
for(const entry of await fs.readdir('.', {withFileTypes:true})){
  if(!entry.isFile()) continue;
  if(entry.name === 'sample-products.json') continue;
  if(entry.name !== 'CNAME' && !/\.(?:html|css|js|png|ico|json|txt|xml|svg|webp|jpg|jpeg)$/i.test(entry.name)) continue;
  await fs.copyFile(entry.name,path.join(destination,entry.name));
}
await fs.writeFile(path.join(destination,'.nojekyll'),'');
console.log('Prepared public storefront files.');
