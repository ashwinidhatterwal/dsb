import fs from 'node:fs';
function read(file){ return fs.readFileSync(file,'utf8'); }
const html=read('admin.html');
const ws=read('admin-workspace.js');
const admin=read('admin.js');
const auth=read('src/backend/admin-auth.gs');
const css=read('admin-surface.css');
const code=read('code.gs');
const fail=(m)=>{ throw new Error(m); };
if(!html.includes('admin-surface.css?v=20260920adminpass1')) fail('admin surface stylesheet not loaded');
if(!css.includes('--admin-canvas') || !css.includes('--admin-shadow')) fail('surface contrast/elevation tokens missing');
if(!css.includes('.order-card') || !css.includes('.archive-card') || !css.includes('.dash-panel')) fail('surface pass does not cover major admin tiles');
if(!html.includes('aria-label="Archived products"') || !html.includes('aria-label="Sign out"')) fail('symbol top actions need accessible names');
if(!ws.includes("adminWrite('deleteArchivedProduct'")) fail('archive delete is not using explicit action');
if(ws.includes('Type ${product.id} to confirm')) fail('fragile typed-ID deletion prompt still present');
if(!auth.includes("action === 'delete' || action === 'deleteArchivedProduct'")) fail('backend does not route explicit archived delete action');
if(!code.includes("action === 'delete' || action === 'deleteArchivedProduct'")) fail('generated code.gs missing archived delete action');
if(!ws.includes("showToast('Product deleted')")) fail('delete success feedback missing');
if(!ws.includes("showToast(err.message || 'Delete failed')")) fail('delete error feedback missing');
if(!admin.includes("'Close order details' : 'View order details'")) fail('order detail icon lacks accessible label');
console.log('Admin surface/action regression passed.');

// Regression: frontend admin API version must match backend session version.
{
  const front = admin.match(/profile\.version !== (\d+)/);
  const back = auth.match(/version:\s*(\d+)/);
  if (!front || !back || front[1] !== back[1]) fail('admin API version mismatch');
}
console.log('Admin API version sync regression passed.');
