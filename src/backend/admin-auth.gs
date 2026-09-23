/* admin-auth responsibilities. Bundled into code.gs by scripts/build.mjs. */
function authenticateAdmin_(key) {
  const owner = secret_('ADMIN_KEY', ADMIN_KEY);
  const candidate = typeof key === 'string' ? key : '';
  if (owner && candidate === owner) return {
    name: 'Owner',
    role: 'admin'
  };
  let staff = [];
  try {
    staff = JSON.parse(PropertiesService.getScriptProperties().getProperty('ADMIN_STAFF_JSON') || '[]');
  } catch (_) {
    throw new Error('Staff configuration is invalid.');
  }
  const match = Array.isArray(staff) && staff.find(x => x.enabled !== false && typeof x.key === 'string' && x.key.length >= 24 && x.key === candidate && ['admin', 'editor', 'viewer'].includes(x.role));
  if (!match) {
    // Cache-based global limit is best effort: Apps Script provides no trusted
    // client IP. Never record candidate credentials in logs or Properties.
    rateLimit_('admin-login-failures', 90, 3600);
    if (candidate) rateLimit_('admin-login-key:' + hashText_(candidate), 8, 3600);
    throw new Error('unauthorized');
  }
  return {
    name: String(match.name || 'Staff').slice(0, 60),
    role: match.role
  };
}
function assertAdminPermission_(actor, action) {
  const reads = ['adminSession', 'adminProducts', 'adminProductsPage', 'adminOrders', 'adminDashboard', 'adminAnalytics', 'adminReviews', 'adminOperations', 'aiAdminChat', 'aiModels'];
  const edits = ['add', 'update', 'archiveProduct', 'updateOrderStatus', 'resolveOrderRequest', 'saveShipment', 'aiProductDraft'];
  if (actor.role === 'admin' || reads.includes(action) || actor.role === 'editor' && (edits.includes(action) || action === 'imageUploadAuthorization')) return;
  throw new Error('Your staff role does not allow this action.');
}
function dispatchAdmin_(body, actor) {
  const action = String(body.action || '');
  assertAdminPermission_(actor, action);
  if (action === 'adminSession') return {
    // Existing admin (v24) remains usable while the new website publishes.
    version: Number(body.options && body.options.requiredVersion) === 26 ? 26 : Number(body.options && body.options.requiredVersion) === 25 ? 25 : 24,
    signedUploads: !!secret_('CLOUDINARY_API_SECRET', '') || !!secret_('CLOUDINARY_API_KEY', ''),
    name: actor.name,
    role: actor.role
  };
  if (action === 'adminProducts') {
    const products = getAllProducts(true);
    return body.options && body.options.linkPicker ? products.filter(p => !isArchived_(p)).map(p => ({id:p.id, name:p.name})) : products;
  }
  if (action === 'adminProductsPage') return adminProductsPage_(body.options || {});
  if (action === 'adminOrders') return getAllOrders(body.options);
  if (action === 'adminDashboard') return getDashboardData();
  if (action === 'adminAnalytics') return getAnalyticsReport_(body.options || {});
  if (action === 'adminOperations') return adminOperations_();
  if (action === 'saveShipment') return saveShipment_(body);
  if (action === 'adminReviews') return adminReviews_();
  if (action === 'moderateReview') return moderateReview_(body, actor);
  if (action === 'imageUploadAuthorization') {
    if (actor.role === 'viewer') throw new Error('Your staff role does not allow uploads.');
    return imageUploadAuthorization_(actor);
  }
  if (action === 'resetAnalytics') return resetAnalytics_(actor);
  if (action === 'aiModels') return aiModelsGet_();
  if (action === 'aiConfigGet') return aiConfigGet_();
  if (action === 'aiConfigSaveConnection') return aiConfigSaveConnection_(body);
  if (action === 'aiConfigDeleteConnection') return aiConfigDeleteConnection_(body);
  if (action === 'aiConfigTestConnection') return aiConfigTestConnection_(body);
  if (action === 'aiProductDraft') return generateAiProductDraft_(body, actor);
  if (action === 'aiAdminChat') return generateAiAdminChat_(body, actor);
  if (action === 'add') return addProduct(body.product || {}, body.requestId);
  if (action === 'update') {
    if (!body.product?.expected_revision && body.clientVersion >= 7) throw new Error('Refresh and reopen the product before saving.');
    return updateProduct(body.product || {});
  }
  if (action === 'delete' || action === 'deleteArchivedProduct') return deleteProduct(body.id, body.expected_revision);
  if (action === 'archiveProduct') return archiveProduct_(body);
  if (action === 'updateOrderStatus') return updateOrderStatus(body.orderId, body.status);
  if (action === 'resolveOrderRequest') return resolveOrderRequest_(body, actor);
  if (action === 'verifyPayment') return verifyPayment_(body, actor);
  throw new Error('unknown action');
}

function imageUploadAuthorization_(actor) {
  if (!actor || actor.role === 'viewer') throw new Error('Only product editors can upload photos.');
  rateLimit_('image-upload-signatures', 60, 3600);
  const apiKey = secret_('CLOUDINARY_API_KEY', '');
  const secret = secret_('CLOUDINARY_API_SECRET', '');
  if (!!apiKey !== !!secret) throw new Error('Cloudinary signed upload configuration is incomplete.');
  if (!apiKey) return { mode: 'unsigned' }; // Existing deployments keep working until upgraded.
  const cloudName = secret_('CLOUDINARY_CLOUD_NAME', 'malfl6xv');
  const preset = secret_('CLOUDINARY_SIGNED_UPLOAD_PRESET', '');
  if (!preset || !/^[a-z0-9_-]+$/i.test(cloudName)) throw new Error('Configure a signed Cloudinary upload preset and cloud name.');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const input = 'timestamp=' + timestamp + '&upload_preset=' + preset + secret;
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, input);
  const signature = bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  return { mode: 'signed', cloudName: cloudName, uploadPreset: preset, apiKey: apiKey, timestamp: timestamp, signature: signature };
}
