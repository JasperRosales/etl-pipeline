/**
 * S.A.L.S.A. POS - Google Apps Script server code (Day 2).
 *
 * Implements the POS entry flow defined in docs/schema.md:
 *   - validates required fields and numeric values before saving;
 *   - appends exactly one row per accepted sale to the Transactions tab;
 *   - generates a unique transaction_id and a UTC ISO 8601 timestamp;
 *   - returns structured, safe success/error feedback to index.html;
 *   - prevents accidental duplicate submissions with a one-time token,
 *     a script lock, and a uniqueness check against the sheet.
 *
 * Companion files: index.html (POS UI), Tests.gs (in-sheet self-test),
 * README.md (deployment and permissions).
 */

const POS = {
  sheetName: 'Transactions',
  headers: [
    'transaction_id',
    'transaction_timestamp',
    'product_id',
    'product_name',
    'quantity',
    'unit_price',
    'subtotal',
    'currency',
    'payment_method',
    'operator_id',
    'notes'
  ],
  defaultCurrency: 'USD',
  paymentMethods: ['cash', 'card', 'other'],
  currencyPattern: /^[A-Za-z]{3}$/,
  submissionTtlDays: 7,
  lockWaitMs: 10000,
  limits: { productId: 64, productName: 120, operatorId: 64, notes: 500 }
};

/**
 * Web app entry point. Serves the POS page. The extraction endpoint for
 * PowerShell (Day 3) is added separately and must not change this default.
 *
 * @return {HtmlOutput} the POS interface
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('S.A.L.S.A. POS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Saves one sale from the POS UI.
 *
 * Never throws: every outcome is returned as a structured result so the UI
 * can show safe feedback without leaking internal error details.
 *
 * Result shape:
 *   { ok, status: 'saved'|'duplicate'|'rejected'|'error',
 *     message, errors[], transactionId, transactionTimestamp }
 *
 * @param {Object} payload form values plus a one-time submissionId token
 * @return {Object} structured result
 */
function saveTransaction(payload) {
  const source = payload || {};
  const submissionId = normalizeSubmissionId_(source.submissionId);
  if (!submissionId) {
    return buildResult_('rejected', 'Missing submission token. Reload the POS page and try again.',
      ['Missing submission token. Reload the POS page and try again.']);
  }

  try {
    const validation = validateSale_(source);
    if (!validation.ok) {
      return buildResult_('rejected', 'The sale was not saved. Fix the highlighted fields and try again.',
        validation.errors);
    }
    const recordJson = JSON.stringify(validation.record);

    // Fast path: this token was already saved (double click, retry).
    const previous = getSubmissionRecord_(submissionId);
    if (previous) {
      return replayResult_(previous, recordJson);
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(POS.lockWaitMs);
    try {
      // Re-check under the lock so two concurrent saves cannot both append.
      const stillPending = getSubmissionRecord_(submissionId);
      if (stillPending) {
        return replayResult_(stillPending, recordJson);
      }

      let sheet;
      try {
        sheet = ensureTransactionsSheet_();
      } catch (configError) {
        console.error('POS configuration problem: ' + configError);
        return buildResult_('error', 'Configuration problem: ' + configError.message, []);
      }

      const transactionId = generateTransactionId_(sheet);
      const timestamp = isoTimestampNow_();
      const rec = validation.record;
      sheet.appendRow([
        transactionId,
        timestamp,
        rec.productId,
        rec.productName,
        rec.quantity,
        rec.unitPrice,
        rec.subtotal,
        rec.currency,
        rec.paymentMethod,
        rec.operatorId,
        rec.notes
      ]);

      try {
        rememberSubmission_(submissionId, {
          transactionId: transactionId,
          transactionTimestamp: timestamp,
          savedAt: Date.now(),
          fingerprint: recordJson
        });
      } catch (storeError) {
        // The row is already written; log the storage failure instead of
        // failing a sale that succeeded.
        console.error('Could not store submission token ' + submissionId + ': ' + storeError);
      }

      return buildResult_('saved', 'Sale saved as ' + transactionId + '.', [], transactionId, timestamp);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error('POS save failed: ' + error);
    if (String(error && error.message).indexOf('lock') !== -1) {
      return buildResult_('error',
        'The POS is busy with another save. Wait a moment and try again.', []);
    }
    const reference = Utilities.getUuid().slice(0, 8);
    return buildResult_('error',
      'The sale could not be saved (reference ' + reference + '). It was not written twice; ' +
      'please try again or check the Apps Script execution logs.', []);
  }
}

/**
 * Validates and normalizes a payload against the docs/schema.md contract.
 *
 * @param {Object} source raw payload from the UI
 * @return {Object} { ok, errors[], record{} } with record set when ok
 */
function validateSale_(source) {
  const errors = [];

  const productId = normalizeText_(source.productId);
  const productName = normalizeText_(source.productName);
  if (!productId) errors.push('product_id is required.');
  else if (productId.length > POS.limits.productId) {
    errors.push('product_id must be ' + POS.limits.productId + ' characters or fewer.');
  }
  if (!productName) errors.push('product_name is required.');
  else if (productName.length > POS.limits.productName) {
    errors.push('product_name must be ' + POS.limits.productName + ' characters or fewer.');
  }

  const quantity = parseQuantity_(source.quantity);
  if (!quantity.ok) errors.push('quantity ' + quantity.reason + '.');

  const unitPrice = parseUnitPrice_(source.unitPrice);
  if (!unitPrice.ok) errors.push('unit_price ' + unitPrice.reason + '.');

  let currency = normalizeText_(source.currency).toUpperCase();
  if (!currency) currency = POS.defaultCurrency;
  if (!POS.currencyPattern.test(currency)) {
    errors.push('currency must be a three-letter ISO 4217 code, for example ' + POS.defaultCurrency + '.');
  }

  const paymentMethod = normalizeText_(source.paymentMethod).toLowerCase();
  if (!paymentMethod) errors.push('payment_method is required.');
  else if (POS.paymentMethods.indexOf(paymentMethod) === -1) {
    errors.push('payment_method must be one of: ' + POS.paymentMethods.join(', ') + '.');
  }

  const operatorId = normalizeText_(source.operatorId);
  if (operatorId.length > POS.limits.operatorId) {
    errors.push('operator_id must be ' + POS.limits.operatorId + ' characters or fewer.');
  }
  const notes = normalizeText_(source.notes);
  if (notes.length > POS.limits.notes) {
    errors.push('notes must be ' + POS.limits.notes + ' characters or fewer.');
  }

  if (errors.length > 0) {
    return { ok: false, errors: errors, record: null };
  }
  return {
    ok: true,
    errors: [],
    record: {
      productId: productId,
      productName: productName,
      quantity: quantity.value,
      unitPrice: unitPrice.value,
      subtotal: Math.round(quantity.value * unitPrice.value * 100) / 100,
      currency: currency,
      paymentMethod: paymentMethod,
      operatorId: operatorId,
      notes: notes
    }
  };
}

/** @return {{ok: boolean, reason: string, value: number}} */
function parseQuantity_(value) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (!text) return { ok: false, reason: 'is required', value: null };
  if (!/^\+?\d+$/.test(text)) {
    return { ok: false, reason: 'must be a whole number greater than zero', value: null };
  }
  const number = parseInt(text, 10);
  if (number < 1) return { ok: false, reason: 'must be greater than zero', value: null };
  return { ok: true, reason: '', value: number };
}

/** @return {{ok: boolean, reason: string, value: number}} */
function parseUnitPrice_(value) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  if (!text) return { ok: false, reason: 'is required', value: null };
  if (/^-\d/.test(text)) return { ok: false, reason: 'cannot be negative', value: null };
  if (/^\d+\.\d{3,}$/.test(text)) {
    return { ok: false, reason: 'must have at most two decimal places', value: null };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return {
      ok: false,
      reason: 'must be a number with up to two decimal places, for example 12.50',
      value: null
    };
  }
  const number = Number(text);
  if (!isFinite(number)) return { ok: false, reason: 'must be a valid number', value: null };
  return { ok: true, reason: '', value: number };
}

/**
 * Normalizes a free-text cell value: single line, trimmed, and guarded
 * against spreadsheet/CSV formula injection (=, +, -, @ prefixes).
 *
 * @param {*} value raw value
 * @return {string} safe text
 */
function normalizeText_(value) {
  if (value === null || value === undefined) return '';
  let text = String(value).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return text;
}

/**
 * Returns the result for a submission token that was already processed.
 *
 * @param {Object} previous stored record for the token
 * @param {string} recordJson fingerprint of the current validated payload
 * @return {Object} structured result
 */
function replayResult_(previous, recordJson) {
  if (previous.fingerprint && previous.fingerprint !== recordJson) {
    return buildResult_('rejected',
      'This submission token was already used for a different sale. Reload the POS page and enter the sale again.',
      ['The submission token was reused for a different sale.']);
  }
  return buildResult_('duplicate',
    'This sale was already recorded as ' + previous.transactionId + '.',
    [], previous.transactionId, previous.transactionTimestamp);
}

/**
 * @param {string} status saved|duplicate|rejected|error
 * @param {string} message user-facing message (never contains internals)
 * @param {string[]} errors validation messages
 * @param {string=} transactionId
 * @param {string=} transactionTimestamp
 * @return {Object} structured result
 */
function buildResult_(status, message, errors, transactionId, transactionTimestamp) {
  return {
    ok: status === 'saved' || status === 'duplicate',
    status: status,
    message: message,
    errors: errors || [],
    transactionId: transactionId || null,
    transactionTimestamp: transactionTimestamp || null
  };
}

/**
 * Opens the spreadsheet (script property SPREADSHEET_ID, or the bound
 * spreadsheet) and returns the Transactions sheet, creating headers when
 * needed and verifying the contract otherwise.
 *
 * @return {Sheet} the Transactions sheet
 */
function ensureTransactionsSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(POS.sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(POS.sheetName);

  if (sheet.getLastRow() === 0) {
    writeHeaders_(sheet);
    return sheet;
  }

  const current = sheet.getRange(1, 1, 1, POS.headers.length).getValues()[0]
    .map(function (value) { return String(value).trim(); });
  const matches = POS.headers.every(function (header, index) {
    return current[index] === header;
  });
  if (!matches) {
    throw new Error(
      'the "' + POS.sheetName + '" tab headers do not match docs/schema.md. Expected: ' +
      POS.headers.join(', ') + ' - found: ' + current.join(', '));
  }
  return sheet;
}

/** @return {Spreadsheet} spreadsheet from SPREADSHEET_ID or the bound one */
function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const bound = SpreadsheetApp.getActiveSpreadsheet();
  if (!bound) {
    throw new Error(
      'no spreadsheet is configured. Run this script from a container-bound project ' +
      '(Extensions > Apps Script inside the spreadsheet) or set the SPREADSHEET_ID script property.');
  }
  return bound;
}

/** Writes the schema header row, formatting, and a frozen first row. */
function writeHeaders_(sheet) {
  sheet.getRange(1, 1, 1, POS.headers.length).setValues([POS.headers]);
  sheet.getRange(1, 1, 1, POS.headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange(1, 6, sheet.getMaxRows(), 2).setNumberFormat('0.00');
}

/**
 * Builds a unique transaction_id: txn_<yyyyMMddTHHmmssZ>_<4 digits>.
 * Uniqueness is verified against column A before the row is written.
 *
 * @param {Sheet} sheet Transactions sheet
 * @return {string} unique transaction id
 */
function generateTransactionId_(sheet) {
  const stamp = isoCompact_(new Date());
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const candidate = 'txn_' + stamp + '_' + suffix;
    if (!transactionIdExists_(sheet, candidate)) return candidate;
  }
  throw new Error('could not generate a unique transaction_id after 5 attempts.');
}

/** @return {boolean} true when the id already exists in column A */
function transactionIdExists_(sheet, transactionId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return false;
  return sheet.getRange(1, 1, lastRow, 1)
    .createTextFinder(transactionId)
    .matchEntireCell(true)
    .useRegularExpression(false)
    .findNext() !== null;
}

/** @return {string} UTC ISO 8601 without milliseconds, e.g. 2026-10-13T00:42:46Z */
function isoTimestampNow_() {
  return toIsoUtc_(new Date());
}

/** @param {Date} date the moment to format @return {string} ISO 8601 UTC */
function toIsoUtc_(date) {
  function pad(number) { return (number < 10 ? '0' : '') + number; }
  return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate()) +
    'T' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds()) + 'Z';
}

/** @param {Date} date the moment to format @return {string} e.g. 20261013T004246Z */
function isoCompact_(date) {
  function pad(number) { return (number < 10 ? '0' : '') + number; }
  return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) +
    'T' + pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + 'Z';
}

/** @param {*} value raw token @return {string} validated token or '' */
function normalizeSubmissionId_(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(text) ? text : '';
}

/** @return {string} property key for a submission token */
function submissionKey_(submissionId) {
  return 'sub_' + submissionId;
}

/**
 * Reads a stored submission record (idempotency memory).
 *
 * @param {string} submissionId one-time token
 * @return {Object|null} record or null when unknown
 */
function getSubmissionRecord_(submissionId) {
  const raw = PropertiesService.getScriptProperties().getProperty(submissionKey_(submissionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (parseError) {
    return null;
  }
}

/**
 * Stores a submission record and prunes expired ones (7-day TTL).
 *
 * @param {string} submissionId one-time token
 * @param {Object} record saved transaction details
 */
function rememberSubmission_(submissionId, record) {
  const props = PropertiesService.getScriptProperties();
  pruneSubmissions_(props);
  props.setProperty(submissionKey_(submissionId), JSON.stringify(record));
}

/** @param {string} submissionId token to forget (used by self-test cleanup) */
function forgetSubmission_(submissionId) {
  PropertiesService.getScriptProperties().deleteProperty(submissionKey_(submissionId));
}

/** Removes submission records older than POS.submissionTtlDays. */
function pruneSubmissions_(props) {
  const cutoff = Date.now() - POS.submissionTtlDays * 24 * 60 * 60 * 1000;
  props.getKeys()
    .filter(function (key) { return key.indexOf('sub_') === 0; })
    .forEach(function (key) {
      try {
        const record = JSON.parse(props.getProperty(key) || '');
        if (!record.savedAt || record.savedAt < cutoff) props.deleteProperty(key);
      } catch (parseError) {
        props.deleteProperty(key);
      }
    });
}
