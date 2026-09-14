/* transactions responsibilities. Bundled into code.gs by scripts/build.mjs. */
function transactionSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(JOURNAL_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(JOURNAL_SHEET);
    sheet.appendRow(['id', 'status', 'payload', 'updated']);
    try {
      sheet.hideSheet();
    } catch (err) {}
  }
  return sheet;
}
function saveTransaction_(sheet, row, id, status, data) {
  const raw = JSON.stringify(data);
  // A Sheets cell supports 50,000 characters. Fail before inventory changes.
  if (raw.length > 48000) throw new Error('This order is too large. Please place a smaller order.');
  row = row || sheet.getLastRow() + 1;
  if (data.kind === 'order' && data.notifyAsync) sheet.getRange(row, 1, 1, 7).setValues([[id, status, raw, new Date(), 'Pending', 0, 0]]);else sheet.getRange(row, 1, 1, 4).setValues([[id, status, raw, new Date()]]);
  return row;
}
function readTransaction_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, 4).getValues()[0];
  return {
    id: values[0],
    status: values[1],
    data: JSON.parse(values[2])
  };
}
function recoverTransactions_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(JOURNAL_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return;
  const pending = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).createTextFinder('Pending').matchEntireCell(true).findAll();
  pending.forEach(hit => {
    const transaction = readTransaction_(sheet, hit.getRow()),
      data = transaction.data;
    const orders = getSheet_(ORDERS_SHEET),
      row = findRow_(orders, 'orderid', data.orderId);
    let committed = !!row;
    if (data.kind === 'status') committed = !!row && String(orders.getRange(row, headers_(orders).indexOf('status') + 1).getValue()) === data.newStatus;
    finishTransaction_(sheet, hit.getRow(), data, committed);
  });
}
function finishTransaction_(sheet, row, data, committed, stockAlreadyApplied) {
  // Absolute values make recovery repeatable after a partial Sheets failure.
  if (!stockAlreadyApplied) applyStockPlan_(data.stock, committed);
  if (committed && data.kind === 'order') {
    recordOrderItemsFromValidated_(data.orderId, data.record.date, data.items);
    applyPromoPlan_(data.promo);
  }
  invalidatePublicCaches_();
  SpreadsheetApp.flush();
  sheet.getRange(row, 2).setValue(committed ? 'Committed' : 'RolledBack');
  sheet.getRange(row, 4).setValue(new Date());
  SpreadsheetApp.flush();
}
function stockPlan_(items, sheets) {
  const grouped = new Map();
  items.filter(x => x.tracked).forEach(x => {
    if (!grouped.has(x.id)) grouped.set(x.id, {
      ...x,
      qty: 0
    });
    grouped.get(x.id).qty += x.qty;
  });
  const statusCol = sheets.productHeads.indexOf('stock');
  return Array.from(grouped.values()).map(x => {
    const oldStatus = statusCol < 0 ? null : sheets.productData[x.rowIndex][statusCol];
    return {
      id: x.id,
      beforeQty: x.availableQty,
      afterQty: x.availableQty - x.qty,
      beforeStatus: oldStatus,
      afterStatus: oldStatus === null ? null : x.availableQty === x.qty ? 'out of stock' : oldStatus
    };
  });
}
function applyStockPlan_(plan, forward, sheets) {
  if (!plan || !plan.length) return;
  const sheet = sheets ? sheets.productSheet : getSheet_(PRODUCTS_SHEET),
    data = sheets ? sheets.productData : sheet.getDataRange().getValues(),
    heads = data[0].map(h => String(h).trim().toLowerCase());
  const idCol = heads.indexOf('id'),
    qtyCol = heads.indexOf('stockqty'),
    statusCol = heads.indexOf('stock');
  if (idCol < 0 || qtyCol < 0) throw new Error('Inventory columns are missing; transaction recovery is required.');
  const rows = Object.create(null);
  data.slice(1).forEach((r, i) => {
    rows[String(r[idCol])] = i + 2;
  });
  const columns = new Map();
  const add = (col, row, value) => {
    if (!columns.has(col)) columns.set(col, []);
    columns.get(col).push({
      row,
      value
    });
  };
  plan.forEach(x => {
    const row = rows[x.id];
    if (!row) throw new Error('Inventory recovery cannot find product ' + x.id + '. Restore it before retrying.');
    add(qtyCol + 1, row, forward ? x.afterQty : x.beforeQty);
    const status = forward ? x.afterStatus : x.beforeStatus;
    if (statusCol >= 0 && status !== null) add(statusCol + 1, row, status);
  });
  columns.forEach((edits, col) => {
    edits.sort((a, b) => a.row - b.row);
    for (let i = 0; i < edits.length;) {
      let j = i + 1;
      while (j < edits.length && edits[j].row === edits[j - 1].row + 1) j++;
      sheet.getRange(edits[i].row, col, j - i, 1).setValues(edits.slice(i, j).map(x => [x.value]));
      i = j;
    }
  });
}
function statusStockPlan_(orderId, oldStatus, newStatus) {
  if (oldStatus === 'Cancelled' === (newStatus === 'Cancelled')) return [];
  const items = getOrderItemQuantities_(orderId);
  if (!items.length) throw new Error('No item history found; inventory cannot be safely changed for this order.');
  const sheet = getSheet_(PRODUCTS_SHEET),
    data = sheet.getDataRange().getValues(),
    heads = data[0].map(h => String(h).trim().toLowerCase());
  const idCol = heads.indexOf('id'),
    qtyCol = heads.indexOf('stockqty'),
    statusCol = heads.indexOf('stock');
  if (qtyCol < 0) return [];
  const reactivating = oldStatus === 'Cancelled';
  return items.map(item => {
    const row = data.slice(1).find(r => String(r[idCol]) === item.id);
    if (!row) {
      if (reactivating) throw new Error('Cannot reactivate: product ' + item.id + ' was deleted.');
      return null;
    }
    if (row[qtyCol] === '' || row[qtyCol] == null) return null;
    const beforeQty = Number(row[qtyCol]),
      afterQty = beforeQty + (reactivating ? -item.qty : item.qty);
    if (!Number.isInteger(beforeQty) || beforeQty < 0 || afterQty < 0) throw new Error('Insufficient or invalid stock for ' + item.id + '.');
    return {
      id: item.id,
      beforeQty: beforeQty,
      afterQty: afterQty,
      beforeStatus: statusCol < 0 ? null : row[statusCol],
      afterStatus: statusCol < 0 ? null : afterQty ? 'in stock' : 'out of stock'
    };
  }).filter(Boolean);
}
