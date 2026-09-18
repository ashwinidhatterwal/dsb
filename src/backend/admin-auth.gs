/* admin-auth responsibilities. Bundled into code.gs by scripts/build.mjs. */
function authenticateAdmin_(key) {
  const owner = secret_('ADMIN_KEY', ADMIN_KEY);
  if (owner && owner !== 'change-this-secret-key' && key === owner) return {
    name: 'Owner',
    role: 'admin'
  };
  let staff = [];
  try {
    staff = JSON.parse(PropertiesService.getScriptProperties().getProperty('ADMIN_STAFF_JSON') || '[]');
  } catch (_) {
    throw new Error('Staff configuration is invalid.');
  }
  const match = Array.isArray(staff) && staff.find(x => x.enabled !== false && typeof x.key === 'string' && x.key.length >= 24 && x.key === key && ['admin', 'editor', 'viewer'].includes(x.role));
  if (!match) throw new Error('unauthorized');
  return {
    name: String(match.name || 'Staff').slice(0, 60),
    role: match.role
  };
}
function assertAdminPermission_(actor, action) {
  const reads = ['adminSession', 'adminProducts', 'adminProductsPage', 'adminOrders', 'adminDashboard'];
  const edits = ['add', 'update', 'archiveProduct', 'updateOrderStatus', 'aiProductDraft'];
  if (actor.role === 'admin' || reads.includes(action) || actor.role === 'editor' && edits.includes(action)) return;
  throw new Error('Your staff role does not allow this action.');
}
function dispatchAdmin_(body, actor) {
  const action = String(body.action || '');
  assertAdminPermission_(actor, action);
  if (action === 'adminSession') return {
    version: 11,
    name: actor.name,
    role: actor.role
  };
  if (action === 'adminProducts') return getAllProducts(true);
  if (action === 'adminProductsPage') return adminProductsPage_(body.options || {});
  if (action === 'adminOrders') return getAllOrders(body.options);
  if (action === 'adminDashboard') return getDashboardData();
  if (action === 'aiProductDraft') return generateAiProductDraft_(body, actor);
  if (action === 'add') return addProduct(body.product || {}, body.requestId);
  if (action === 'update') {
    if (!body.product?.expected_revision && body.clientVersion >= 7) throw new Error('Refresh and reopen the product before saving.');
    return updateProduct(body.product || {});
  }
  if (action === 'delete') return deleteProduct(body.id, body.expected_revision);
  if (action === 'archiveProduct') return archiveProduct_(body);
  if (action === 'updateOrderStatus') return updateOrderStatus(body.orderId, body.status);
  if (action === 'verifyPayment') return verifyPayment_(body, actor);
  throw new Error('unknown action');
}
