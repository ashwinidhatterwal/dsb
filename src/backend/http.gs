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
  if (action === 'orders') {
    return jsonResponse({
      error: 'admin reads require POST'
    });
  }
  if (action === 'trackOrder') {
    return jsonResponse(trackOrder(e.parameter.orderId, e.parameter.phone));
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
  try {
    if (!e || !e.postData || e.postData.contents.length > 24000) return jsonResponse({
      success: false,
      code: 'validation_failed',
      error: 'Request is too large.'
    });
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'quoteOrder') return jsonResponse(quoteOrder(body.order || {}));
    if (body.action === 'orderResult') return jsonResponse(orderResult(body.requestId, body.phone));

    // Public actions — no admin key needed, customers use these from the site.
    if (body.action === 'addReview') {
      return jsonResponse(addReview(body.review || {}));
    }
    if (body.action === 'addOrder') {
      return jsonResponse(addOrder(body.order || {}));
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
