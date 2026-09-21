import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function assert(ok,msg){if(!ok)throw new Error(msg);}
const info=['about.html','contact.html','privacy.html','returns.html'];
for(const file of info){
  const html=read(file);
  for(const heavy of ['cart-ui-core.js','cart-ui-drawer.js','cart-ui-checkout.js','render-helpers.js','seo.js']){
    assert(!html.includes(`<script src="${heavy}`),`${file} eagerly loads ${heavy}`);
  }
  assert(html.includes('info-page.js'),`${file} missing lazy info-page bootstrap`);
}
for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.html'))){
  const html=read(file);
  const font=html.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^\"]+/)?.[0];
  if(font)assert(font.includes('display=swap'),`${file} Google Fonts can block text`);
  if(html.includes('class="glyph"'))assert(!html.includes('class="glyph" src="icon-192.png"'),`${file} uses oversized header icon`);
}
assert(!read('sw.js').includes('respondWith(fetch('),'service worker proxies normal requests');
assert(read('pwa-install.js').includes("window.addEventListener('load', registerWorker"),'service worker registration is not delayed');
const app=read('app.js');
assert(app.indexOf('await loadAllProducts();') < app.indexOf('loadReviewSummaries().then'),'home reviews compete with critical catalogue request');
const product=read('product.js');
assert(product.indexOf('await loadAllProducts();') < product.indexOf('loadReviewSummaries().then'),'product rating summary competes with critical catalogue request');
assert(read('admin-surface.css').includes('content-visibility:auto'),'admin long-list paint containment missing');
assert(read('src/styles/cards.css').includes('content-visibility:auto'),'storefront card paint containment missing');
function pageWeight(file){
  const html=read(file), seen=new Set(); let raw=0,gzip=0;
  for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){
    const rel=m[1].split(/[?#]/,1)[0].replace(/^\//,''); const p=path.join(root,rel);
    if(seen.has(p)||!fs.existsSync(p)||!fs.statSync(p).isFile())continue;
    if(!/\.(?:js|css|png|ico)$/i.test(p))continue;
    seen.add(p); const b=fs.readFileSync(p); raw+=b.length;
    if(/\.(?:js|css)$/i.test(p))gzip+=zlib.gzipSync(b,{level:9}).length;
  }
  return {raw,gzip};
}
for(const file of ['index.html','product.html','catalog.html','about.html','contact.html','privacy.html','returns.html','track-order.html','admin.html']){
  const w=pageWeight(file);
  assert(w.gzip<=90*1024,`${file} initial local JS/CSS gzip budget exceeded: ${(w.gzip/1024).toFixed(1)} KB`);
  console.log(`${file}: ${(w.raw/1024).toFixed(1)} KB local assets, ${(w.gzip/1024).toFixed(1)} KB gzipped JS/CSS`);
}
console.log('Performance guardrails passed.');
