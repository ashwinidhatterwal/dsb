/* products responsibilities. Bundled into code.gs by scripts/build.mjs. */
function getAllProducts(includeCost) {
  // Admin data contains costPrice and must never be cached under the public key.
  if (!includeCost) {
    const cached = cacheGetChunkedJson_(CATALOG_CACHE_KEY);
    if (Array.isArray(cached)) return cached;
  }
  const rows = rowsAsObjects_(getSheet_(PRODUCTS_SHEET));
  if (includeCost) return rows;
  const publicRows = rows.filter(r => !isArchived_(r)).map(r => {
    const copy = {};
    ['id', 'name', 'namehindi', 'category', 'subcategory', 'price', 'mrp', 'image', 'images', 'description', 'stock', 'stockqty', 'tags', 'brand', 'material', 'packsize', 'specifications', 'gtin', 'descriptionhindi', 'instagramurl', 'sizeprices', 'sizes'].forEach(key => {
      if (r[key] !== undefined) copy[key] = r[key];
    });
    return copy;
  });
  cachePutJson_(CATALOG_CACHE_KEY, publicRows, CATALOG_CACHE_TTL);
  return publicRows;
}
function addProduct(p, requestId) {
  return withWriteLock_(function () {
    validateProductFields_(p, true);
    const retired = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('DeletedProductIds');
    if (p.id && retired && findRow_(retired, 'id', String(p.id).trim())) throw new Error('This product ID was retired. Choose a new ID.');
    if (p.sizes !== undefined) ensureColumn_(getSheet_(PRODUCTS_SHEET), 'sizes');
    ['brand', 'material', 'packsize', 'specifications', 'gtin', 'descriptionhindi', 'instagramurl', 'sizeprices'].forEach(k => {
      if (p[k] !== undefined) ensureColumn_(getSheet_(PRODUCTS_SHEET), k);
    });
    const sheet = getSheet_(PRODUCTS_SHEET),
      heads = headers_(sheet);
    let reservation = null;
    if (requestId) {
      if (!validRequestId_(requestId)) throw new Error('Invalid save request. Refresh the admin page.');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let requests = ss.getSheetByName('AdminProductRequests');
      if (!requests) {
        requests = ss.insertSheet('AdminProductRequests');
        requests.appendRow(['id', 'productid', 'fingerprint']);
        try {
          requests.hideSheet();
        } catch (_) {}
      }
      const fingerprint = hashText_(JSON.stringify(p)),
        row = findRow_(requests, 'id', requestId);
      if (row) {
        const values = requests.getRange(row, 1, 1, 3).getValues()[0];
        if (values[2] !== fingerprint) throw new Error('This save attempt belongs to different product details.');
        reservation = {
          requests,
          id: String(values[1]),
          existing: true
        };
      } else {
        let candidate = String(p.id || '').trim() || nextId_(sheet, 'DSB');
        if (!p.id) {
          while (findRow_(requests, 'productid', candidate) || retired && findRow_(retired, 'id', candidate)) {
            const n = Number(candidate.replace(/^DSB-?/, '')) + 1;
            candidate = 'DSB-' + String(n).padStart(4, '0');
          }
        }
        if (findRow_(sheet, 'id', candidate) || findRow_(requests, 'productid', candidate)) throw new Error('That product ID is already used or reserved.');
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(candidate)) throw new Error('Use letters, numbers, hyphens or underscores for product IDs.');
        requests.appendRow([requestId, candidate, fingerprint]);
        SpreadsheetApp.flush();
        reservation = {
          requests,
          id: candidate
        };
      }
      if (reservation.existing && findRow_(sheet, 'id', reservation.id)) return {
        success: true,
        id: reservation.id,
        replayed: true
      };
    }
    let id = reservation ? reservation.id : String(p.id || '').trim() || nextId_(sheet, 'DSB');
    if (!p.id && !reservation && retired) {
      while (findRow_(retired, 'id', id)) {
        const n = Number(id.replace(/^DSB-?/, '')) + 1;
        id = 'DSB-' + String(n).padStart(4, '0');
      }
    }
    if (retired && findRow_(retired, 'id', id)) throw new Error('This product ID was retired. Choose a new ID.');
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('Use letters, numbers, hyphens or underscores for product IDs.');
    if (findRow_(sheet, 'id', id)) throw new Error('That product ID already exists.');
    sheet.appendRow(heads.map(h => sheetText_(h === 'id' ? id : p[h] !== undefined ? p[h] : '')));
    invalidatePublicCaches_();
    return {
      success: true,
      id: id
    };
  });
}
function updateProduct(p) {
  return withWriteLock_(function () {
    validateProductFields_(p, false);
    if (p.sizes !== undefined) ensureColumn_(getSheet_(PRODUCTS_SHEET), 'sizes');
    ['brand', 'material', 'packsize', 'specifications', 'gtin', 'descriptionhindi', 'instagramurl', 'sizeprices'].forEach(k => {
      if (p[k] !== undefined) ensureColumn_(getSheet_(PRODUCTS_SHEET), k);
    });
    const sheet = getSheet_(PRODUCTS_SHEET),
      heads = headers_(sheet);
    const row = findRow_(sheet, 'id', String(p.id || '').trim());
    if (!row) throw new Error('Product not found.');
    if (p.expected_revision) {
      const current = {};
      sheet.getRange(row, 1, 1, heads.length).getValues()[0].forEach((v, i) => current[heads[i]] = v);
      if (productRevision_(current) !== p.expected_revision) throw new Error('Product changed since editing began. Refresh and reopen it before saving.');
    }
    ['stockqty', 'stock'].forEach(key => {
      const expected = p['expected_' + key];
      if (expected === undefined) {
        if (p[key] !== undefined) throw new Error('Refresh the admin page before editing stock.');
        return;
      }
      if (String(p[key] == null ? '' : p[key]) === String(expected)) {
        delete p[key];
        return;
      }
      const col = heads.indexOf(key);
      if (col >= 0 && String(sheet.getRange(row, col + 1).getValue()) !== String(expected)) throw new Error('Stock changed since this form was opened. Reload products before editing stock.');
    });
    // Write only explicitly edited fields; do not rewrite unrelated formulas.
    const edits = heads.map((h, i) => ({
      col: i + 1,
      value: sheetText_(p[h]),
      edited: h !== 'id' && p[h] !== undefined
    })).filter(x => x.edited);
    for (let i = 0; i < edits.length;) {
      let j = i + 1;
      while (j < edits.length && edits[j].col === edits[j - 1].col + 1) j++;
      sheet.getRange(row, edits[i].col, 1, j - i).setValues([edits.slice(i, j).map(x => x.value)]);
      i = j;
    }
    invalidatePublicCaches_();
    return {
      success: true
    };
  });
}
function deleteProduct(id, expectedRevision) {
  id = String(id || '').trim();
  return withWriteLock_(function () {
    const sheet = getSheet_(PRODUCTS_SHEET),
      row = findRow_(sheet, 'id', String(id || '').trim());
    if (!row) throw new Error('Product not found. Refresh the archive.');
    const heads = headers_(sheet),
      product = {};
    sheet.getRange(row, 1, 1, heads.length).getValues()[0].forEach((v, i) => product[heads[i]] = v);
    if (!isArchived_(product)) throw new Error('Archive this product before deleting it.');
    if (!expectedRevision || productRevision_(product) !== expectedRevision) throw new Error('Product changed. Refresh the archive before deleting.');
    // Reserve only the ID so historical orders cannot affect a new product with the same ID.
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let reserved = ss.getSheetByName('DeletedProductIds');
    if (!reserved) {
      reserved = ss.insertSheet('DeletedProductIds');
      reserved.appendRow(['id']);
    }
    if (!findRow_(reserved, 'id', String(id))) reserved.appendRow([sheetText_(String(id))]);
    sheet.deleteRow(row);
    invalidatePublicCaches_();
    return {
      success: true
    };
  });
}
function validateProductFields_(p, adding) {
  ['brand', 'material', 'packsize', 'specifications', 'gtin', 'descriptionhindi', 'instagramurl', 'sizeprices'].forEach(k => {
    if (p[k] !== undefined) {
      p[k] = String(p[k]).trim();
      if (p[k].length > 2000) throw new Error(k + ' is too long.');
    }
  });
  if (p.instagramurl && !/^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?(?:[?#].*)?$/i.test(p.instagramurl)) throw new Error('Instagram URL must be a public Reel or Post link.');
  if (p.gtin && !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(p.gtin)) throw new Error('GTIN must be 8, 12, 13 or 14 digits. Leave it blank if unknown.');
  if (p.sizeprices) {
    const sizes = parseSizes_(p.sizes || '');
    p.sizeprices.split(',').forEach(entry => {
      const pair = entry.trim().split('=');
      if (pair.length !== 2 || !sizes.includes(pair[0].trim()) || !Number.isFinite(Number(pair[1])) || Number(pair[1]) <= 0 || Number(pair[1]) > 10000000) throw new Error('Size prices must use available sizes and positive prices up to 10000000: 32B=299.');
    });
  }
  if (p.sizes !== undefined) {
    const raw = String(p.sizes),
      sizes = parseSizes_(raw);
    if (raw.length > 1000 || sizes.length > 30 || sizes.some(x => x.length > 40 || /[|<>\x00-\x1f]/.test(x))) throw new Error('Use up to 30 sizes, each at most 40 characters, without | or angle brackets.');
    p.sizes = sizes.join(', ');
  }
  if (adding && !String(p.name || '').trim()) throw new Error('Product name is required.');
  if (adding || p.price !== undefined) {
    const n = Number(p.price);
    if (String(p.price == null ? '' : p.price).trim() === '' || !Number.isFinite(n) || n <= 0 || n > 10000000) throw new Error('Price must be a positive number.');
  }
  ['costprice', 'mrp', 'stockqty'].forEach(key => {
    if (p[key] === undefined || p[key] === '') return;
    const n = Number(p[key]);
    if (!Number.isFinite(n) || n < 0 || key === 'stockqty' && !Number.isInteger(n)) throw new Error('Invalid ' + key + '.');
  });
}
function isArchived_(p) {
  return String(p.archived || '').toLowerCase() === 'yes';
}
function productRevision_(p) {
  return hashText_(JSON.stringify(['id', 'name', 'namehindi', 'category', 'subcategory', 'price', 'mrp', 'costprice', 'image', 'images', 'description', 'stock', 'stockqty', 'tags', 'brand', 'material', 'packsize', 'specifications', 'gtin', 'descriptionhindi', 'instagramurl', 'sizeprices', 'sizes', 'archived'].map(k => String(p[k] ?? ''))));
}
function adminProductsPage_(options) {
  const all = getAllProducts(true),
    q = String(options.query || '').trim().toLowerCase().slice(0, 120),
    category = String(options.category || ''),
    stock = String(options.stock || 'all');
  let list = all.filter(p => isArchived_(p) === (options.archived === true) && (!category || p.category === category) && (!q || [p.id, p.name, p.namehindi, p.category, p.subcategory, p.tags].join(' ').toLowerCase().includes(q)));
  list = list.filter(p => {
    const tracked = p.stockqty !== '' && p.stockqty !== undefined && p.stockqty !== null,
      out = p.stock === 'out of stock' || tracked && Number(p.stockqty) <= 0;
    return stock === 'all' || (stock === 'out' ? out : stock === 'low' ? tracked && Number(p.stockqty) > 0 && Number(p.stockqty) <= 5 : !out);
  });
  const sort = options.sort || 'id-asc';
  const idCollator = new Intl.Collator('en', {
    numeric: true,
    sensitivity: 'base'
  });
  const compareId = (a, b) => idCollator.compare(String(a.id || ''), String(b.id || '')) || String(a.id || '').localeCompare(String(b.id || ''), 'en');
  list.sort((a, b) => sort === 'id-asc' ? compareId(a, b) : sort === 'id-desc' ? compareId(b, a) : (options.sort === 'price-asc' ? Number(a.price) - Number(b.price) : options.sort === 'price-desc' ? Number(b.price) - Number(a.price) : String(a.name || '').localeCompare(String(b.name || ''))) || compareId(a, b));
  const total = list.length,
    page = Math.min(Math.max(0, Math.floor(Number(options.page) || 0)), Math.max(0, Math.ceil(total / 40) - 1));
  return {
    products: list.slice(page * 40, (page + 1) * 40).map(p => ({
      ...p,
      _revision: productRevision_(p)
    })),
    page,
    total,
    allCount: all.filter(p => isArchived_(p) === (options.archived === true)).length,
    categories: [...new Set(all.filter(p => isArchived_(p) === (options.archived === true)).map(p => p.category).filter(Boolean))].sort()
  };
}
function archiveProduct_(body) {
  return withWriteLock_(function () {
    const sheet = getSheet_(PRODUCTS_SHEET);
    ensureColumn_(sheet, 'archived');
    const heads = headers_(sheet),
      row = findRow_(sheet, 'id', String(body.id || ''));
    if (!row) throw new Error('Product not found.');
    const p = {};
    sheet.getRange(row, 1, 1, heads.length).getValues()[0].forEach((v, i) => p[heads[i]] = v);
    const desired = body.archived === true;
    if (isArchived_(p) === desired) return {
      success: true,
      id: body.id
    };
    if (!body.expected_revision || productRevision_(p) !== body.expected_revision) throw new Error('Product changed. Refresh before archiving or restoring.');
    sheet.getRange(row, heads.indexOf('archived') + 1).setValue(desired ? 'yes' : '');
    invalidatePublicCaches_();
    return {
      success: true,
      id: body.id
    };
  });
}
