import fs from 'node:fs/promises';
import path from 'node:path';
export const productPath = id => `products/p-${Buffer.from(String(id)).toString('hex')}.html`;
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = value => JSON.stringify(value).replaceAll('<','\\u003c');
export async function generateStaticProducts(destination, rows, template, siteBase){
  if(!Array.isArray(rows))throw new Error('Invalid catalogue response');
  const products=rows.filter(p=>String(p.id || '').trim());
  if(!products.length)throw new Error('Refusing to publish an empty generated catalogue');
  await fs.mkdir(path.join(destination,'products'),{recursive:true});
  const links=[];
  for(const p of products){
    const id=String(p.id).trim(),url=`${siteBase}/${productPath(id)}`;
    const title=`${p.name || id} | Dhatterwal Suhag Bhandar`;
    const description=String(p.description || `Shop ${p.name || id} at Dhatterwal Suhag Bhandar.`).slice(0,180);
    const price=Number(p.price), validPrice=Number.isFinite(price)&&price>0;
    const image=/^https:\/\//i.test(String(p.image)) ? String(p.image) : '';
    const content=`<article class="pd-wrap" data-prerendered><h1 class="pd-title">${esc(p.name || id)}</h1>${image?`<img src="${esc(image)}" alt="${esc(p.name)}" style="max-width:100%;max-height:60vh;object-fit:contain" fetchpriority="high">`:''}<p>${esc(p.description)}</p>${validPrice?`<p class="pd-prices">₹${price.toFixed(2)}</p>`:''}<p>${esc(p.category)}</p><p>Price and availability are checked before ordering.</p><p role="status">Connecting to the shop for current availability…</p><noscript>Enable JavaScript to choose sizes and place an order.</noscript></article>`;
    const schema={'@context':'https://schema.org','@type':'Product',name:String(p.name || id),description,sku:id,url,...(image?{image:[image]}:{}),...(validPrice?{offers:{'@type':'Offer',priceCurrency:'INR',price:price.toFixed(2),url,availability:p.stock==='out of stock'||(String(p.stockqty??'')!==''&&Number(p.stockqty)<=0)?'https://schema.org/OutOfStock':'https://schema.org/InStock'}}:{})};
    let html=template.replace('<html lang="en">',()=>`<html lang="en" data-product-id="${esc(id)}">`).replace('<head>',()=>`<head>\n<base href="${esc(siteBase)}/">`);
    html=html.replace(/<title>[\s\S]*?<\/title>/,()=>`<title>${esc(title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*/,(_,prefix)=>prefix+esc(description))
      .replace(/(<link rel="canonical" id="canonicalLink" href=")[^"]*/,(_,prefix)=>prefix+esc(url))
      .replace(/(<meta[^>]*(?:property="og:title"|name="twitter:title")[^>]*content=")[^"]*/g,(_,prefix)=>prefix+esc(title))
      .replace(/(<meta[^>]*(?:property="og:description"|name="twitter:description")[^>]*content=")[^"]*/g,(_,prefix)=>prefix+esc(description))
      .replace(/(<meta[^>]*property="og:url"[^>]*content=")[^"]*/g,(_,prefix)=>prefix+esc(url));
    html=html.replace(/(<div id="pdRoot">)[\s\S]*?(<\/div>\s*<footer>)/,(_,prefix,suffix)=>prefix+content+suffix);
    if(!html.includes('data-prerendered'))throw new Error('Product template target not found');
    html=html.replace('</head>',()=>`<script type="application/ld+json" id="staticProductLd">${json(schema)}</script></head>`);
    if(image) html=html.replace(/(<meta[^>]*(?:property="og:image"|name="twitter:image")[^>]*content=")[^"]*/g,(_,prefix)=>prefix+esc(image));
    await fs.writeFile(path.join(destination,productPath(id)),html);
    links.push(`<a class="catalog-item" href="${esc(productPath(id))}"><strong>${esc(p.name || id)}</strong><span>${esc(p.category)}${validPrice?' · ₹'+price.toFixed(2):''}</span></a>`);
  }
  const catalogFile=path.join(destination,'catalog.html');
  let catalog=await fs.readFile(catalogFile,'utf8');
  catalog=catalog.replace(/(<div[^>]*id="catalogRoot"[^>]*>)[\s\S]*?(<\/div>)/,(_,prefix,suffix)=>prefix+links.join('\n')+suffix);
  await fs.writeFile(catalogFile,catalog);
  return products.length;
}
