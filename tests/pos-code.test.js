/**
 * Local test harness for the Apps Script POS (Day 2).
 *
 * Executes appscript-pos/Code.gs and appscript-pos/Tests.gs inside a Node
 * vm context with small mocks of the Apps Script services they use
 * (SpreadsheetApp, PropertiesService, LockService, Utilities, HtmlService),
 * then runs the in-sheet self-test plus extra contract checks.
 *
 * Run from the repository root:
 *
 *     node tests/pos-code.test.js
 *
 * Exit code 0 means every check passed. This does not replace the live
 * self-test runPosSelfTest() in the Apps Script editor (see
 * appscript-pos/README.md); it verifies the same logic offline so defects
 * are caught before deploying.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Minimal Google Sheets / Apps Script mocks
// ---------------------------------------------------------------------------

class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  cellAt(r, c) {
    const row = this.sheet.rows[this.row - 1 + r];
    if (!row) return '';
    const value = row[this.col - 1 + c];
    return value === undefined || value === null ? '' : value;
  }

  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.cellAt(r, c));
      out.push(line);
    }
    return out;
  }

  getValue() {
    return this.cellAt(0, 0);
  }

  setValues(values) {
    values.forEach((line, r) => {
      line.forEach((value, c) => {
        const rr = this.row - 1 + r;
        const cc = this.col - 1 + c;
        while (this.sheet.rows.length <= rr) this.sheet.rows.push([]);
        while (this.sheet.rows[rr].length <= cc) this.sheet.rows[rr].push('');
        this.sheet.rows[rr][cc] = value;
      });
    });
    return this;
  }

  setFontWeight() { return this; }
  setNumberFormat() { return this; }

  createTextFinder(text) {
    const cells = this.getValues();
    const expected = String(text);
    const api = {
      matchEntireCell() { return api; },
      useRegularExpression() { return api; },
      findNext() {
        for (let r = 0; r < cells.length; r++) {
          for (let c = 0; c < cells[r].length; c++) {
            if (String(cells[r][c]) === expected) return { found: true };
          }
        }
        return null;
      }
    };
    return api;
  }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
  }

  getLastRow() {
    let last = 0;
    this.rows.forEach((row, index) => {
      if (row.some((value) => value !== '' && value !== null && value !== undefined)) {
        last = index + 1;
      }
    });
    return last;
  }

  getMaxRows() { return Math.max(this.rows.length, 1000); }
  getRange(row, col, numRows, numCols) { return new MockRange(this, row, col, numRows, numCols); }
  appendRow(values) { this.rows.push(values.slice()); }
  deleteRow(index) { this.rows.splice(index - 1, 1); }
  setFrozenRows() {}
}

class MockSpreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) {
    const sheet = new MockSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

function buildContext() {
  const spreadsheet = new MockSpreadsheet();
  const properties = new Map();

  const scriptProperties = {
    getProperty: (key) => (properties.has(key) ? properties.get(key) : null),
    setProperty: (key, value) => { properties.set(key, String(value)); },
    deleteProperty: (key) => { properties.delete(key); },
    getKeys: () => Array.from(properties.keys())
  };

  const context = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      openById: () => spreadsheet
    },
    PropertiesService: { getScriptProperties: () => scriptProperties },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} })
    },
    Utilities: { getUuid: () => randomUUID() },
    HtmlService: {
      createHtmlOutputFromFile: (name) => ({
        name,
        setTitle() { return this; },
        addMetaTag() { return this; }
      }),
      XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' }
    },
    Logger: { log: (message) => console.log(message) }
  };

  return { context, spreadsheet, properties };
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const checks = [];
function check(name, condition) {
  checks.push({ name, passed: !!condition });
}

function readScript(file) {
  return fs.readFileSync(path.join(ROOT, 'appscript-pos', file), 'utf8');
}

const { context, spreadsheet } = buildContext();
const source = readScript('Code.gs') + '\n' + readScript('Tests.gs');
vm.createContext(context);
vm.runInContext(source, context, { filename: 'appscript-pos/*.gs' });

// 1. The in-sheet self-test from Tests.gs.
let selfTest = null;
try {
  selfTest = vm.runInContext('runPosSelfTest()', context);
  check('runPosSelfTest() passed', selfTest && selfTest.passed === true);
  (selfTest ? selfTest.checks : []).forEach((item) => {
    checks.push({ name: 'self-test: ' + item.name, passed: item.passed });
  });
} catch (error) {
  check('runPosSelfTest() passed (' + error.message + ')', false);
}

// 2. Extra contract checks that the self-test does not cover.
const extras = vm.runInContext(`(function () {
  const results = [];
  function record(name, condition) { results.push({ name: name, passed: !!condition }); }
  const sheet = ensureTransactionsSheet_();
  const tokens = [];
  function token(prefix) {
    const value = prefix + Utilities.getUuid().replace(/-/g, '');
    tokens.push(value);
    return value;
  }

  // Web app entry point serves the POS page.
  const page = doGet();
  record('doGet serves the index page', !!page && page.name === 'index');

  // Formula injection is neutralized and empty currency defaults to USD.
  const formulaToken = token('extra_formula_');
  const formulaSale = saveTransaction({
    submissionId: formulaToken,
    productId: 'SKU-F',
    productName: '=EVIL() + 1',
    quantity: '1',
    unitPrice: '0.01',
    currency: '',
    paymentMethod: 'cash',
    notes: '=SUM(A1:A9)'
  });
  record('formula-shaped input is accepted after neutralizing',
    formulaSale.status === 'saved');
  const formulaRow = sheet.getRange(sheet.getLastRow(), 1, 1, 11).getValues()[0];
  record('product_name cannot become a formula',
    String(formulaRow[3]).charAt(0) === "'" && String(formulaRow[3]).indexOf('=EVIL') !== -1);
  record('notes cannot become a formula', String(formulaRow[10]).charAt(0) === "'");
  record('empty currency falls back to ' + POS.defaultCurrency, formulaRow[7] === 'USD');

  // Newlines are collapsed so one sale stays one row and CSV stays clean.
  const newlineToken = token('extra_newline_');
  saveTransaction({
    submissionId: newlineToken,
    productId: 'SKU-N',
    productName: 'Line1\\r\\nLine2',
    quantity: '3',
    unitPrice: '1.00',
    currency: 'USD',
    paymentMethod: 'cash',
    notes: 'first\\nsecond'
  });
  const newlineRow = sheet.getRange(sheet.getLastRow(), 1, 1, 11).getValues()[0];
  record('product_name is a single line',
    newlineRow[3] === 'Line1 Line2' && /[\\r\\n]/.test(String(newlineRow[3])) === false);
  record('notes are a single line', newlineRow[10] === 'first second');

  // Fractional quantities and over-precise money are rejected.
  const fraction = saveTransaction({
    submissionId: token('extra_fraction_'),
    productId: 'SKU-Q', productName: 'Fraction', quantity: '2.5',
    unitPrice: '1.00', currency: 'USD', paymentMethod: 'cash'
  });
  record('fractional quantity rejected',
    fraction.status === 'rejected' &&
    /whole number/.test(fraction.errors.join(' ')));

  const overprecise = saveTransaction({
    submissionId: token('extra_price_'),
    productId: 'SKU-P', productName: 'Overprecise', quantity: '1',
    unitPrice: '12.345', currency: 'USD', paymentMethod: 'cash'
  });
  record('unit_price with three decimals rejected',
    overprecise.status === 'rejected' &&
    /two decimal places/.test(overprecise.errors.join(' ')));

  // Two rapid sales must receive different transaction ids.
  const before = sheet.getLastRow();
  const first = saveTransaction({
    submissionId: token('extra_rapid_'),
    productId: 'SKU-1', productName: 'Rapid One', quantity: '1',
    unitPrice: '5.00', currency: 'USD', paymentMethod: 'cash'
  });
  const second = saveTransaction({
    submissionId: token('extra_rapid_'),
    productId: 'SKU-2', productName: 'Rapid Two', quantity: '1',
    unitPrice: '5.00', currency: 'USD', paymentMethod: 'card'
  });
  record('rapid sales both saved', first.status === 'saved' && second.status === 'saved');
  record('rapid sales receive different transaction ids',
    first.transactionId !== second.transactionId);
  record('rapid sales append exactly two rows', sheet.getLastRow() === before + 2);

  // A broken header row must fail loudly without writing a row.
  const expected = POS.headers.slice();
  sheet.getRange(1, 1, 1, 11).setValues([['wrong_header'].concat(expected.slice(1))]);
  const beforeBroken = sheet.getLastRow();
  const broken = saveTransaction({
    submissionId: token('extra_header_'),
    productId: 'SKU-H', productName: 'Header Test', quantity: '1',
    unitPrice: '1.00', currency: 'USD', paymentMethod: 'cash'
  });
  record('header mismatch reported as configuration problem',
    broken.status === 'error' && broken.message.indexOf('Configuration problem') === 0);
  record('header mismatch writes no row', sheet.getLastRow() === beforeBroken);
  sheet.getRange(1, 1, 1, 11).setValues([expected]);
  const afterRestore = saveTransaction({
    submissionId: token('extra_header_'),
    productId: 'SKU-H', productName: 'Header Restored', quantity: '1',
    unitPrice: '1.00', currency: 'USD', paymentMethod: 'cash'
  });
  record('saving works again after headers are restored', afterRestore.status === 'saved');

  tokens.forEach(function (value) { forgetSubmission_(value); });
  return results;
})()`, context);

extras.forEach((item) => checks.push({ name: 'extra: ' + item.name, passed: item.passed }));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const failed = checks.filter((item) => !item.passed);
checks.forEach((item) => {
  console.log((item.passed ? 'PASS' : 'FAIL') + '  ' + item.name);
});
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' checks passed');

if (spreadsheet.getSheetByName('Transactions') === null) {
  console.error('Transactions sheet was never created');
}

process.exit(failed.length === 0 ? 0 : 1);
