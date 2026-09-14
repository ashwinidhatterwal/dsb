/* promos responsibilities. Bundled into code.gs by scripts/build.mjs. */
function getActivePromos() {
  const cached = cacheGetJson_(PROMOS_CACHE_KEY);
  if (Array.isArray(cached)) return cached;
  let sheet;
  try {
    sheet = getSheet_(PROMOS_SHEET);
  } catch (err) {
    return [];
  }
  const rows = rowsAsObjects_(sheet);
  const promos = rows.filter(r => String(r.active).trim().toLowerCase() === 'yes' && (r.maxuses === '' || r.maxuses == null || Number(r.uses || 0) < Number(r.maxuses))).map(r => ({
    code: String(r.code || '').trim(),
    type: String(r.type || '').trim().toLowerCase(),
    value: Number(r.value) || 0
  })).filter(r => r.code);
  cachePutJson_(PROMOS_CACHE_KEY, promos, PROMOS_CACHE_TTL);
  return promos;
}
function ensurePromoCustomersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PROMO_CUSTOMERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PROMO_CUSTOMERS_SHEET);
    sheet.getRange(1, 1, 1, 3).setValues([['code', 'phonehash', 'date']]);
    try {
      sheet.hideSheet();
    } catch (err) {}
  }
  return sheet;
}
function getPromoByCode_(code) {
  let sheet;
  try {
    sheet = getSheet_(PROMOS_SHEET);
  } catch (err) {
    return null;
  }
  const rows = rowsAsObjects_(sheet);
  return rows.find(r => String(r.code || '').trim().toLowerCase() === String(code || '').trim().toLowerCase() && String(r.active).trim().toLowerCase() === 'yes') || null;
}
function validatePromoFast_(code, phone) {
  const promo = getPromoByCode_(code);
  if (!promo) return {
    ok: false
  };
  const maxUses = promo.maxuses === '' || promo.maxuses === undefined || promo.maxuses === null ? null : Math.max(0, Math.floor(safeNumber_(promo.maxuses, 0)));
  const onePerCustomer = String(promo.onepercustomer || '').trim().toLowerCase() === 'yes';
  const usageCol = 'uses';
  const usedCount = Math.max(0, Math.floor(safeNumber_(promo[usageCol], 0)));
  if (maxUses !== null && usedCount >= maxUses) return {
    ok: false
  };
  if (onePerCustomer && phone) {
    const sheet = ensurePromoCustomersSheet_();
    const needle = String(code).trim().toLowerCase() + '|' + hashText_(phone);
    const hit = sheet.createTextFinder(needle).matchEntireCell(true).findNext();
    if (hit) return {
      ok: false
    };
  }
  const type = String(promo.type || '').trim().toLowerCase();
  const value = Number(promo.value);
  if (!['percent', 'flat', 'fixed'].includes(type) || !Number.isFinite(value) || value < 0 || type === 'percent' && value > 100) return {
    ok: false
  };
  return {
    ok: true,
    discountFor(subtotal) {
      return type === 'percent' ? subtotal * (value / 100) : value;
    }
  };
}
function promoPlan_(code, phone) {
  if (!code) return null;
  const sheet = getSheet_(PROMOS_SHEET),
    heads = headers_(sheet);
  let col = heads.indexOf('uses');
  if (col < 0) {
    col = heads.length;
    sheet.getRange(1, col + 1).setValue('uses');
  }
  const data = sheet.getDataRange().getValues(),
    codeCol = heads.indexOf('code');
  const i = data.findIndex((r, i) => i > 0 && String(r[codeCol]).trim().toUpperCase() === code);
  if (i < 1) throw new Error('Promo not found.');
  return {
    code: code,
    usesAfter: Math.max(0, Number(data[i][col]) || 0) + 1,
    phoneHash: hashText_(phone),
    onePerCustomer: String(data[i][heads.indexOf('onepercustomer')] || '').toLowerCase() === 'yes'
  };
}
function applyPromoPlan_(plan) {
  if (!plan) return;
  const sheet = getSheet_(PROMOS_SHEET),
    heads = headers_(sheet),
    data = sheet.getDataRange().getValues();
  const i = data.findIndex((r, i) => i > 0 && String(r[heads.indexOf('code')]).trim().toUpperCase() === plan.code);
  if (i < 1) throw new Error('Promo recovery requires the original promo row.');
  sheet.getRange(i + 1, heads.indexOf('uses') + 1).setValue(plan.usesAfter);
  if (plan.onePerCustomer) {
    const usage = ensurePromoCustomersSheet_(),
      needle = plan.code.toLowerCase() + '|' + plan.phoneHash;
    if (!usage.createTextFinder(needle).matchEntireCell(true).findNext()) usage.appendRow([needle, plan.phoneHash, new Date()]);
  }
}
