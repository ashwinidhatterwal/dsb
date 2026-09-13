import fs from 'node:fs/promises';
import path from 'node:path';
import seo from '../../seo.js';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'config.js');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');

function configValue(source, key) {
  const match = source.match(new RegExp(`${key}\\s*:\\s*['\"]([^'\"]+)['\"]`));
  return match ? match[1].trim() : '';
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function uniqueProductIds(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.products) ? payload.products : null);
  if (!rows) throw new Error('Products API returned an unexpected response shape. Sitemap was not changed.');

  return [...new Set(rows
    .map(row => String(row?.id ?? row?.ID ?? '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'DSB-Sitemap-Updater/1.0' },
      signal: controller.signal,
      redirect: 'follow'
    });
    if (!response.ok) throw new Error(`Products API returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function entry(loc, changefreq, priority, images=[]) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(loc)}</loc>`,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : '',
    priority ? `    <priority>${priority}</priority>` : '',
    ...images.map(src=>'    <image:image><image:loc>'+xmlEscape(src)+'</image:loc></image:image>'),
    '  </url>'
  ].filter(Boolean).join('\n');
}

async function main() {
  const config = await fs.readFile(CONFIG_PATH, 'utf8');
  const apiBase = configValue(config, 'SHEET_API_URL');
  const siteBase = configValue(config, 'SITE_URL').replace(/\/+$/, '');

  if (!/^https:\/\//i.test(siteBase)) throw new Error('SITE_URL must be an https:// URL. Sitemap was not changed.');
  if (!/^https:\/\//i.test(apiBase)) throw new Error('SHEET_API_URL is missing or invalid. Sitemap was not changed.');

  const apiUrl = new URL(apiBase);
  apiUrl.searchParams.set('action', 'products');
  let payload,generatedAt=Date.now();
  try{payload=await fetchJson(apiUrl);}
  catch(error){
    try{
      const meta=JSON.parse(await fs.readFile('.catalog-build-meta.json','utf8'));
      if(meta.api!==apiBase || !Number.isFinite(meta.generatedAt) || Date.now()-meta.generatedAt>86400000 || meta.generatedAt>Date.now()+60000)throw error;
      payload=JSON.parse(await fs.readFile('.catalog-build.json','utf8'));generatedAt=meta.generatedAt;
      console.warn('Live catalogue unavailable; preserving the validated snapshot from '+new Date(generatedAt).toISOString());
    }catch(_){throw error;}
  }
  const productIds = uniqueProductIds(payload);

  // A zero-product response can be legitimate, but it can also mean a broken
  // sheet/API. Refuse to wipe an existing product sitemap accidentally if the
  // current sitemap already contains product URLs.
  if (productIds.length === 0) {
    let old = '';
    try { old = await fs.readFile(SITEMAP_PATH, 'utf8'); } catch {}
    if (old.includes('/product.html?id=') || old.includes('/products/p-')) {
      throw new Error('Products API returned zero products; refusing to remove existing product URLs automatically.');
    }
  }

  const allowed=['id','name','namehindi','category','subcategory','price','mrp','image','images','description','stock','stockqty','tags','variantgroup','variantlabel','bundlecontents','sizeprices','brand','material','packsize','specifications','gtin','variantsize','variantcolor','descriptionhindi','sizes'];
  const rows=(Array.isArray(payload)?payload:payload.products).map(row=>Object.fromEntries(allowed.filter(k=>row[k]!==undefined).map(k=>[k,row[k]])));
  await fs.writeFile('.catalog-build.json',JSON.stringify(rows),'utf8');
  await fs.writeFile('.catalog-build-meta.json',JSON.stringify({api:apiBase,generatedAt}),'utf8');

  const staticEntries = [
    entry(`${siteBase}/`, 'daily', '1.0'),
    entry(`${siteBase}/catalog.html`, 'daily', '0.9'),
    entry(`${siteBase}/about.html`, 'monthly', '0.5'),
    entry(`${siteBase}/contact.html`, 'monthly', '0.6'),
    entry(`${siteBase}/privacy.html`, 'yearly', '0.2'),
    entry(`${siteBase}/returns.html`, 'yearly', '0.3')
  ];

  const rowsById=new Map(rows.map(p=>[String(p.id),p]));
  const productEntries = productIds.map(id =>
    // URLSearchParams gives the same safe ID encoding used by the storefront.
    entry(`${siteBase}/products/p-${Buffer.from(String(id)).toString('hex')}.html`, 'weekly', '0.8', [...new Set([rowsById.get(id)?.image,...String(rowsById.get(id)?.images||'').split(',')].map(u=>String(u||'').trim()).filter(u=>/^https:\/\//.test(u)))])
  );

  const output = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...staticEntries,
    ...productEntries,
    ...[...new Set(rows.map(p=>p.category||'Other'))].map(c=>entry(siteBase+'/'+seo.categoryPath(c),'weekly','0.7')),
    entry(siteBase+'/hi/','weekly','0.7'),
    ...rows.filter(p=>p.namehindi&&p.descriptionhindi).map(p=>entry(siteBase+'/hi/'+seo.productPath(p.id),'weekly','0.6')),
    '</urlset>',
    ''
  ].join('\n');

  const previous = await fs.readFile(SITEMAP_PATH, 'utf8').catch(() => '');
  if (previous === output) {
    console.log(`Sitemap already current (${productIds.length} products).`);
    return;
  }

  await fs.writeFile(SITEMAP_PATH, output, 'utf8');
  console.log(`Updated sitemap.xml with ${productIds.length} product URLs.`);
}

main().catch(err => {
  console.error(`Sitemap update failed safely: ${err.message}`);
  process.exitCode = 1;
});
