import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const read = file => fs.readFile(new URL('../' + file, import.meta.url), 'utf8');
const [admin, analyticsCss, surface, html] = await Promise.all([
  read('admin.js'), read('admin-analytics.css'), read('admin-surface.css'), read('admin.html')
]);
const switchTab = admin.slice(admin.indexOf('function switchTab(name)'), admin.indexOf("document.addEventListener('DOMContentLoaded'"));
assert(switchTab.includes('scrollTo') && switchTab.includes('top: 0'), 'Switching admin sections should return to the top');
assert(admin.includes('class="product-icon-action"') && admin.includes('>✎</button>') && admin.includes("? '↶' : '▣'"), 'Product Edit/Archive actions should be icon-only');
assert(surface.includes('.product-icon-action'), 'Icon-only product actions need dedicated accessible touch sizing');
assert(analyticsCss.includes('padding-bottom:calc(120px + env(safe-area-inset-bottom))'), 'Analytics must clear the fixed mobile bottom navigation');
assert(html.includes('20260921analyticsfix1'), 'Admin asset cache version must be bumped for UI fixes');
console.log('PASS: analytics mobile clearance, icon product actions, and restored section scroll-to-top.');
