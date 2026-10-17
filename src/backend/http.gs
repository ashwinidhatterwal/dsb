/* http responsibilities. Bundled into code.gs by scripts/build.mjs. */
function doGet(e) {
  const action = (e.parameter.action || 'products').toString();
  if (action === 'products') {
    // Public product data only. Admin product reads use POST so the admin key
    // never rides in a GET URL.
    return jsonResponse(getAllProducts(false));
  }
  if (action === 'reviews') {
    if (e.parameter.summary === '1') return jsonResponse(getReviewSummaries());
    return jsonResponse(getReviews(e.parameter.productId));
  }
  if (action === 'promos') {
    return jsonResponse(getActivePromos());
  }
  if (action === 'checkoutConfig') {
    return jsonResponse(getCheckoutConfig_());
  }
  if (action === 'deliveryEstimate') {
    return jsonResponse(getDeliveryEstimate_(e.parameter.pinCode));
  }
  if (action === 'orders') {
    return jsonResponse({
      error: 'admin reads require POST'
    });
  }
  if (action === 'dashboard') {
    return jsonResponse({
      error: 'admin reads require POST'
    });
  }
  return jsonResponse({
    error: 'unknown action'
  });
}
function doPost(e) {
  const started=Date.now(); let action=''; DSB_REQUEST_LOCK_WAIT_MS_=0; DSB_AI_BUDGET_=null;
  try { const raw=e && e.postData && e.postData.contents || '{}'; if(raw.length<=24000)action=JSON.parse(raw).action; } catch (_) {}
  const result=doPostCore_(e);
  try {recordOperationalTiming_(action,Date.now()-started,JSON.parse(result.getContent()));} catch (_) {}
  return result;
}
function doPostCore_(e) {
  try {
    if (!e || !e.postData || e.postData.contents.length > 24000) return jsonResponse({
      success: false,
      code: 'validation_failed',
      error: 'Request is too large.'
    });
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'quoteOrder') return jsonResponse(quoteOrder(body.order || {}));
    if (body.action === 'orderResult') return jsonResponse(orderResult(body.requestId, body.phone));
    if (body.action === 'analyticsBatch') return jsonResponse(recordAnalyticsBatch_(body));

    // Public actions — no admin key needed, customers use these from the site.
    if (body.action === 'addReview') {
      return jsonResponse(addReview(body.review || {}));
    }
    if (body.action === 'addOrder') {
      return jsonResponse(addOrder(body.order || {}));
    }
    if (body.action === 'trackOrder') {
      return jsonResponse(trackOrder(body.orderId, body.phone));
    }
    if (body.action === 'submitOrderRequest') {
      return jsonResponse(submitOrderRequest_(body.request || {}));
    }

    // Everything below is an admin-only action.
    const actor = authenticateAdmin_(body.key);
    return jsonResponse(dispatchAdmin_(body, actor));
  } catch (err) {
    return jsonResponse({
      error: String(err)
    });
  }
}
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
