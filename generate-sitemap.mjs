import fs from 'node:fs/promises';
import path from 'node:path';

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

function entry(loc, changefreq, priority) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(loc)}</loc>`,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : '',
    priority ? `    <priority>${priority}</priority>` : '',
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
  const productIds = uniqueProductIds(await fetchJson(apiUrl));

  // A zero-product response can be legitimate, but it can also mean a broken
  // sheet/API. Refuse to wipe an existing product sitemap accidentally if the
  // current sitemap already contains product URLs.
  if (productIds.length === 0) {
    let old = '';
    try { old = await fs.readFile(SITEMAP_PATH, 'utf8'); } catch {}
    if (old.includes('/product.html?id=')) {
      throw new Error('Products API returned zero products; refusing to remove existing product URLs automatically.');
    }
  }

  const staticEntries = [
    entry(`${siteBase}/`, 'daily', '1.0'),
    entry(`${siteBase}/catalog.html`, 'daily', '0.9'),
    entry(`${siteBase}/about.html`, 'monthly', '0.5'),
    entry(`${siteBase}/contact.html`, 'monthly', '0.6'),
    entry(`${siteBase}/privacy.html`, 'yearly', '0.2'),
    entry(`${siteBase}/returns.html`, 'yearly', '0.3')
  ];

  const productEntries = productIds.map(id =>
    // URLSearchParams gives the same safe ID encoding used by the storefront.
    entry(`${siteBase}/product.html?id=${encodeURIComponent(id)}`, 'weekly', '0.8')
  );

  const output = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticEntries,
    ...productEntries,
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
