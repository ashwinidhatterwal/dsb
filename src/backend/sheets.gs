/* sheets responsibilities. Bundled into code.gs by scripts/build.mjs. */
function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet named "' + name + '" not found');
  return sheet;
}
function headers_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim().toLowerCase());
}
function rowsAsObjects_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const heads = data[0].map(h => String(h).trim().toLowerCase());
  return data.slice(1).filter(row => String(row[0]).trim() !== '').map(row => {
    const obj = {};
    heads.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}
function nextId_(sheet, prefix) {
  const heads = headers_(sheet);
  const idCol = heads.indexOf('id') !== -1 ? heads.indexOf('id') : heads.indexOf('orderid');
  const data = sheet.getDataRange().getValues();
  const pattern = new RegExp('^' + prefix + '-(\\d+)$');
  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const match = pattern.exec(String(data[i][idCol] || ''));
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return prefix + '-' + String(maxNum + 1).padStart(4, '0');
}
function safeNumber_(value, fallback) {
  const n = Number(value);
  return isFinite(n) ? n : fallback || 0;
}
function cleanPhone_(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}
function orderSheetRow_(heads, record) {
  // Sheets interprets an apostrophe prefix as literal text, preserving leading zeros.
  return heads.map(h => h === 'phone' ? "'" + cleanPhone_(record[h]) : sheetText_(record[h] !== undefined ? record[h] : ''));
}
function hashText_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''));
  return bytes.map(b => {
    const n = b < 0 ? b + 256 : b;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}
function secret_(name, fallback) {
  return PropertiesService.getScriptProperties().getProperty(name) || fallback || '';
}
function roundMoney_(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function sheetText_(value) {
  // Prevent customer-controlled text becoming a spreadsheet formula.
  return typeof value === 'string' && /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
}
function findRowWithHeaders_(sheet, heads, column, value) {
  const col = heads.indexOf(String(column || '').trim().toLowerCase());
  if (col < 0 || sheet.getLastRow() < 2 || !value) return 0;
  const hit = sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).createTextFinder(String(value)).matchEntireCell(true).matchCase(true).findNext();
  return hit ? hit.getRow() : 0;
}
function findRow_(sheet, column, value) {
  return findRowWithHeaders_(sheet, headers_(sheet), column, value);
}
function rateLimit_(key, limit, seconds) {
  // Best-effort abuse throttling. Apps Script exposes no trustworthy client IP;
  // these controls are not identity verification or a CAPTCHA replacement.
  const cache = CacheService.getScriptCache(),
    k = 'limit:' + hashText_(key);
  const now = Date.now();
  let state;
  try {
    state = JSON.parse(cache.get(k) || 'null');
  } catch (err) {}
  if (!state || state.until <= now) state = {
    count: 0,
    until: now + seconds * 1000
  };
  if (state.count >= limit) {
    const error = new Error('Too many attempts. Please try again later or contact the shop.');
    error.dsbCode = 'rate_limited';
    throw error;
  }
  state.count++;
  cache.put(k, JSON.stringify(state), Math.min(21600, Math.max(1, Math.ceil((state.until - now) / 1000))));
}
function validRequestId_(id) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(id || ''));
}
function withWriteLock_(fn, options) {
  const lock = LockService.getScriptLock();
  const waitStarted=Date.now(), acquired=lock.tryLock(10000);
  DSB_REQUEST_LOCK_WAIT_MS_ += Date.now()-waitStarted;
  if (!acquired) return {
    success: false,
    code: 'busy',
    error: 'The shop is busy. Please retry in a moment.'
  };
  try {
    // Transaction recovery is essential before inventory/order operations, but
    // unrelated product/review/settings writes should not scan the journal.
    if (!options || options.recoverTransactions !== false) recoverTransactions_();
    return fn();
  } catch (err) {
    console.error(String(err));
    return {
      success: false,
      error: String(err.message || err),
      code: err.dsbCode || 'retry_same_request'
    };
  } finally {
    lock.releaseLock();
  }
}
function parseSizes_(value) {
  return [...new Set(String(value || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean))];
}
function ensureColumns_(sheet, names) {
  const heads = headers_(sheet);
  const existing = new Set(heads);
  const missing = [];
  (names || []).forEach(name => {
    const normalized = String(name || '').trim().toLowerCase();
    if (normalized && !existing.has(normalized)) {
      existing.add(normalized);
      missing.push(String(name).trim());
    }
  });
  if (missing.length === 1) {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue(missing[0]);
  } else if (missing.length > 1) {
    sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
  }
  return heads.concat(missing.map(name => name.toLowerCase()));
}
function ensureColumn_(sheet, name) {
  ensureColumns_(sheet, [name]);
}

// Keep checkout payloads unchanged: canonicalization is for identity comparisons only.
function canonicalPhone_(value) {
  const digits = cleanPhone_(value);
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
}
function phoneIdentityVariants_(value) {
  const raw = cleanPhone_(value), canonical = canonicalPhone_(value);
  return [...new Set(canonical.length === 10 ? [raw, canonical, '91' + canonical, '0' + canonical] : [raw])];
}
function knownCost_(value) {
  return value !== '' && value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}
function orderItemCostKnown_(item) {
  const flag = item.costKnown !== undefined ? item.costKnown : item.costknown;
  const cost = item.costPrice !== undefined ? item.costPrice : item.costprice;
  if (flag === false || String(flag).toLowerCase() === 'no') return false;
  if (flag === true || String(flag).toLowerCase() === 'yes') return knownCost_(cost);
  // Legacy zero snapshots cannot distinguish missing cost from a genuinely free item.
  return knownCost_(cost) && Number(cost) > 0;
}
