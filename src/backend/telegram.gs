/* telegram responsibilities. Bundled into code.gs by scripts/build.mjs. */
function notifyTelegramOrder_(record) {
  // Synchronous transport, called by the background worker or manual test only.
  const token = String(secret_('TELEGRAM_BOT_TOKEN', TELEGRAM_BOT_TOKEN)).trim();
  const chatId = String(secret_('TELEGRAM_CHAT_ID', TELEGRAM_CHAT_ID)).trim();
  if (!token || !chatId) {
    console.warn('Telegram notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is blank.');
    return {
      ok: false,
      skipped: true,
      error: 'Telegram is not configured'
    };
  }
  try {
    const lines = ['🛍️ *New Order*', '━━━━━━━━━━━━━━━━', '🧾 Order: `' + escapeTelegramMarkdown_(record.orderid) + '`', '👤 Name: ' + escapeTelegramMarkdown_(record.customername), '📱 Phone: ' + escapeTelegramMarkdown_(record.phone), '📍 Address: ' + escapeTelegramMarkdown_(record.address), '💳 Payment: ' + escapeTelegramMarkdown_(record.paymentmethod), '🛒 Items: ' + escapeTelegramMarkdown_(record.items)];
    const total = Number(record.total) || 0;
    const discount = Number(record.discount) || 0;
    const delivery = Number(record.deliverycharge) || 0;
    const cod = Number(record.codcharge) || 0;
    // Reconstruct from recorded amounts, never today's product prices/fee policy.
    const subtotal = roundMoney_(total + discount - delivery - cod);
    lines.push('━━━━━━━━━━━━━━━━', '*Price breakdown*');
    lines.push('Subtotal: ₹' + subtotal.toFixed(2));
    lines.push('Discount' + (record.promocode ? ' (' + escapeTelegramMarkdown_(record.promocode) + ')' : '') + ': −₹' + discount.toFixed(2));
    lines.push('Delivery: ₹' + delivery.toFixed(2));
    lines.push('COD fee: ₹' + cod.toFixed(2));
    lines.push('💰 *Total: ₹' + total.toFixed(2) + '*');
    lines.push('━━━━━━━━━━━━━━━━');
    const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'Markdown'
      }),
      muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    const raw = response.getContentText();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (ignore) {}
    if (status >= 200 && status < 300 && (!data || data.ok !== false)) {
      console.log('Telegram notification sent successfully for order ' + record.orderid + '.');
      return {
        ok: true
      };
    }

    // Keep diagnostics useful without printing the bot token.
    console.error('Telegram notification failed for order ' + record.orderid + '. HTTP ' + status + '. Response: ' + raw.slice(0, 1000));
    return {
      ok: false,
      error: data && data.description ? data.description : 'HTTP ' + status
    };
  } catch (err) {
    console.error('Telegram notification exception for order ' + String(record && record.orderid || 'unknown') + ': ' + (err && err.stack ? err.stack : err));
    return {
      ok: false,
      error: String(err)
    };
  }
}
function escapeTelegramMarkdown_(value) {
  return String(value == null ? '' : value).replace(/([_`*\\])/g, '\\$1');
}
function testTelegramNotification() {
  return notifyTelegramOrder_({
    orderid: 'TEST-' + new Date().getTime(),
    customername: 'Telegram Test',
    phone: '0000000000',
    address: 'Apps Script connectivity test',
    paymentmethod: 'Test',
    items: 'Test notification',
    promocode: '',
    discount: 0,
    total: 0
  });
}
function setupTelegramBackground() {
  const sheet = transactionSheet_();
  sheet.getRange(1, 5, 1, 3).setValues([['telegramStatus', 'telegramRetryAt', 'telegramAttempts']]);
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'processTelegramQueue')) {
    ScriptApp.newTrigger('processTelegramQueue').timeBased().everyMinutes(1).create();
  }
  console.log('Background Telegram delivery enabled. Deploy this code to the existing web app.');
}
function processTelegramQueue() {
  // Separate from the inventory script lock: Telegram cannot block checkout.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(1)) return;
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(JOURNAL_SHEET);
    if (!sheet || sheet.getLastRow() < 2) return;
    const started = Date.now();
    PropertiesService.getScriptProperties().setProperty('TELEGRAM_LAST_RUN', String(started));
    const last = sheet.getLastRow();
    const hits = sheet.getRange(2, 5, last - 1, 1).createTextFinder('Pending').matchEntireCell(true).findAll();
    let sent = 0;
    for (const hit of hits) {
      if (sent >= 5 || Date.now() - started > 45000) break;
      const row = hit.getRow(),
        state = sheet.getRange(row, 5, 1, 3).getValues()[0];
      if (Number(state[1]) > Date.now()) continue;
      const transaction = readTransaction_(sheet, row);
      if (transaction.status === 'Pending') continue;
      const data = transaction.data;
      if (transaction.status !== 'Committed' || data.kind !== 'order' || !data.notifyAsync) {
        sheet.getRange(row, 5).setValue('Skipped');
        continue;
      }
      const attempts = (Number(state[2]) || 0) + 1;
      // Persist a retry deadline before transport, including hard execution failures.
      sheet.getRange(row, 5, 1, 3).setValues([['Pending', Date.now() + Math.min(3600000, 60000 * Math.pow(2, Math.min(attempts - 1, 6))), attempts]]);
      SpreadsheetApp.flush();
      const result = notifyTelegramOrder_(data.record);
      if (result && result.ok) {
        sheet.getRange(row, 5, 1, 3).setValues([['Sent', 0, attempts]]);
        PropertiesService.getScriptProperties().setProperty('TELEGRAM_LAST_SUCCESS', String(Date.now()));
        SpreadsheetApp.flush();
      }
      sent++;
    }
    const props = PropertiesService.getScriptProperties();
    const cursor = Math.max(2, Number(props.getProperty('TELEGRAM_MIGRATE_ROW')) || 2);
    const stop = Math.min(last, cursor + 49);
    for (let row = cursor; row <= stop && Date.now() - started < 45000; row++) {
      if (!sheet.getRange(row, 5).getValue()) {
        const t = readTransaction_(sheet, row);
        sheet.getRange(row, 5).setValue(t.data.kind === 'order' && t.data.notifyAsync && t.status !== 'RolledBack' ? 'Pending' : 'Skipped');
      }
      props.setProperty('TELEGRAM_MIGRATE_ROW', String(row + 1));
    }
  } finally {
    lock.releaseLock();
  }
}
function getTelegramHealth_() {
  const props = PropertiesService.getScriptProperties();
  const result = {
    lastRun: Number(props.getProperty('TELEGRAM_LAST_RUN')) || 0,
    lastSuccess: Number(props.getProperty('TELEGRAM_LAST_SUCCESS')) || 0,
    pending: 0
  };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(JOURNAL_SHEET);
  if (sheet && sheet.getLastRow() > 1 && sheet.getLastColumn() >= 5) result.pending = sheet.getRange(2, 5, sheet.getLastRow() - 1, 1).createTextFinder('Pending').matchEntireCell(true).findAll().length;
  return result;
}
