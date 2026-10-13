/**
 * S.A.L.S.A. POS self-test (Day 2).
 *
 * Run runPosSelfTest() from the Apps Script editor after deploying the web
 * app. It exercises the real save path against the Transactions tab:
 *
 *   1. verifies the tab headers match docs/schema.md;
 *   2. refuses a missing submission token and an invalid sale (no row);
 *   3. saves one valid sale and reads the row back column by column;
 *   4. replays the same token and proves no second row is written;
 *   5. refuses reusing the token for a different sale;
 *   6. removes the temporary self-test row and the stored token.
 *
 * The test appends exactly one temporary row and always deletes it in a
 * finally block. Result summary is written to the execution log; a failed
 * test throws so the editor shows "Execution failed".
 *
 * @return {Object} { passed, total, failed, checks[] }
 */
function runPosSelfTest() {
  const checks = [];
  const submissionId = 'selftest_' + Utilities.getUuid().replace(/-/g, '');
  let sheet = null;
  let savedId = null;
  let testRowIndex = null;

  try {
    sheet = ensureTransactionsSheet_();

    const headers = sheet.getRange(1, 1, 1, POS.headers.length).getValues()[0];
    record_(checks, 'Transactions headers match docs/schema.md',
      POS.headers.every(function (header, index) {
        return String(headers[index]).trim() === header;
      }));

    const before = sheet.getLastRow();

    // 1. A missing submission token is refused and writes nothing.
    const noToken = saveTransaction({
      productId: 'SKU-TEST', productName: 'No Token Sale',
      quantity: '1', unitPrice: '1.00', currency: 'USD', paymentMethod: 'cash'
    });
    record_(checks, 'missing submission token refused', noToken.status === 'rejected');
    record_(checks, 'missing token writes no row', sheet.getLastRow() === before);

    // 2. An invalid sale is rejected with useful messages and writes nothing.
    const invalid = saveTransaction({
      submissionId: submissionId + '_invalid',
      productId: '', productName: '   ',
      quantity: '0', unitPrice: '-1.50',
      currency: 'US', paymentMethod: 'bitcoin'
    });
    record_(checks, 'invalid sale rejected with field messages',
      invalid.status === 'rejected' && invalid.errors.length >= 5);
    record_(checks, 'invalid sale writes no row', sheet.getLastRow() === before);

    // 3. A valid sale writes exactly one well-formed row.
    const payload = {
      submissionId: submissionId,
      productId: 'SKU-TEST',
      productName: 'POS Self Test Product',
      quantity: '2',
      unitPrice: '12.50',
      currency: 'USD',
      paymentMethod: 'card',
      operatorId: 'self-test',
      notes: 'Day 2 POS self test'
    };
    const saved = saveTransaction(payload);
    record_(checks, 'valid sale accepted', saved.status === 'saved' && !!saved.transactionId);
    record_(checks, 'transaction_id has format txn_<yyyyMMddTHHmmssZ>_<4 digits>',
      /^txn_\d{8}T\d{6}Z_\d{4}$/.test(saved.transactionId || ''));
    record_(checks, 'transaction_timestamp is UTC ISO 8601',
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(saved.transactionTimestamp || ''));
    record_(checks, 'exactly one row appended', sheet.getLastRow() === before + 1);

    if (saved.status === 'saved') {
      savedId = saved.transactionId;
      testRowIndex = sheet.getLastRow();
      const row = sheet.getRange(testRowIndex, 1, 1, POS.headers.length).getValues()[0];
      record_(checks, 'row transaction_id matches response', String(row[0]) === savedId);
      record_(checks, 'row transaction_timestamp matches response',
        String(row[1]) === saved.transactionTimestamp);
      record_(checks, 'row product_id and product_name stored',
        row[2] === 'SKU-TEST' && row[3] === 'POS Self Test Product');
      record_(checks, 'row quantity stored as number', row[4] === 2);
      record_(checks, 'row unit_price stored as number', row[5] === 12.5);
      record_(checks, 'row subtotal is quantity * unit_price', row[6] === 25);
      record_(checks, 'row currency stored uppercase', row[7] === 'USD');
      record_(checks, 'row payment_method stored controlled value', row[8] === 'card');
      record_(checks, 'row operator_id and notes stored',
        row[9] === 'self-test' && row[10] === 'Day 2 POS self test');
    }

    // 4. Resubmitting the same token (double click / retry) adds no row.
    const replay = saveTransaction(payload);
    record_(checks, 'duplicate submission detected',
      replay.status === 'duplicate' && replay.transactionId === savedId);
    record_(checks, 'duplicate writes no extra row', sheet.getLastRow() === before + 1);

    // 5. Reusing the token for a different sale is refused.
    const tampered = Object.assign({}, payload, { quantity: '3' });
    const refused = saveTransaction(tampered);
    record_(checks, 'token reuse for a different sale refused', refused.status === 'rejected');
    record_(checks, 'refused replay writes no row', sheet.getLastRow() === before + 1);
  } finally {
    // 6. Clean up the temporary row and the stored token.
    try {
      if (sheet && testRowIndex && savedId) {
        const current = String(sheet.getRange(testRowIndex, 1, 1, 1).getValue());
        if (current === savedId) sheet.deleteRow(testRowIndex);
      }
    } catch (cleanupError) {
      console.error('Self-test row cleanup failed: ' + cleanupError);
    }
    try {
      forgetSubmission_(submissionId);
    } catch (tokenError) {
      console.error('Self-test token cleanup failed: ' + tokenError);
    }
  }

  const failed = checks.filter(function (check) { return !check.passed; });
  const summary = {
    passed: failed.length === 0,
    total: checks.length,
    failed: failed.length,
    checks: checks
  };
  console.log('POS self-test: ' + summary.passed + ' (' + (summary.total - summary.failed) +
    '/' + summary.total + ' checks passed)');
  checks.forEach(function (check) {
    console.log((check.passed ? 'PASS: ' : 'FAIL: ') + check.name);
  });

  if (!summary.passed) {
    throw new Error('POS self-test failed: ' +
      failed.map(function (check) { return check.name; }).join('; '));
  }
  return summary;
}

/**
 * Records one assertion result.
 *
 * @param {Object[]} checks collected results
 * @param {string} name human-readable check name
 * @param {boolean} condition true when the check passes
 */
function record_(checks, name, condition) {
  checks.push({ name: name, passed: !!condition });
}
