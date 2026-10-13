# S.A.L.S.A. POS — Google Apps Script module

Day 2 deliverable: a web-app POS that validates a sale and writes exactly one
clean, uniquely identifiable row to the `Transactions` tab of Google Sheets.
The field contract it enforces is [`docs/schema.md`](../docs/schema.md).

## Files

| File | Purpose |
| --- | --- |
| `Code.gs` | Server code: `doGet` (serves the page), `saveTransaction` (validate → lock → append), sheet bootstrap, unique ID generation, duplicate-token memory |
| `index.html` | POS interface: client-side validation, safe success/error feedback, one-time submission tokens |
| `Tests.gs` | `runPosSelfTest()` — in-sheet self-test that appends and then removes one temporary row |
| `README.md` | This deployment and troubleshooting guide |

Offline verification of the same logic (no Google account needed):

```powershell
node tests/pos-code.test.js
```

## One-time setup

1. Open (or create) the project spreadsheet that will hold the data.
2. In the spreadsheet choose **Extensions ▸ Apps Script**. This binds the
   script to the spreadsheet, which is the simplest configuration.
3. Create a script file named `Code` and paste in the contents of `Code.gs`;
   create a file named `index` (HTML) and paste in `index.html`; optionally
   create `Tests` and paste in `Tests.gs`.
4. *(Standalone option)* If you instead start from
   [script.google.com](https://script.google.com), open **Project Settings ▸
   Script properties** and add `SPREADSHEET_ID` with the target spreadsheet's
   ID (the long value in the sheet URL between `/d/` and `/edit`).
   `Code.gs` uses the bound spreadsheet when the property is absent.

## Permissions

On first run the editor asks you to authorize the script. Review and accept:

- **Spreadsheet access** — create/read/update the `Transactions` tab.
  This is the only data the script touches; it never reads other files.
- **Script lock service** — serializes concurrent saves so double clicks
  cannot produce two rows.
- The script sends no outbound network requests and stores no secrets.
  The only script property used is `SPREADSHEET_ID`.

For a personal Google account the consent screen shows *Google hasn't
verified this app* — choose **Advanced ▸ Go to … (unsafe)**; it is your own
script. In Google Workspace, have an admin approve it or run it as yourself.

## Deploy the POS

1. **Deploy ▸ New deployment ▸ Web app**.
2. **Execute as: Me** (the script writes to your sheet).
3. **Who has access**:
   - *Anyone with Google account* — typical for a small team; anyone with the
     URL who signs in can record sales.
   - *Only myself* — fastest for testing.
   - *Anyone* — only needed once Day 3 exposes the read endpoint to
     PowerShell; revisit this setting then.
4. Authorize, copy the `/exec` URL, and open it in a browser. That URL is the
   POS. Keep it handy for the `extraction.endpoint` entry in
   `config/config.json` on Day 3.

Redeploy with **Manage deployments ▸ Edit ▸ Version: New version** after
changing code; *Test deployments* does not update the live URL.

## Test a submission end to end

1. Open the web-app URL, fill a sale (for example `SKU-001`,
   `Example Product`, `2`, `12.50`, `USD`, `card`) and press **Save sale**.
2. Confirm the green banner shows a new `transaction_id` such as
   `txn_20261013T004246Z_0417`, and that one new row appears in the
   `Transactions` tab with a UTC ISO 8601 timestamp and `subtotal` `25`.
3. In the Apps Script editor run **`runPosSelfTest`**. It verifies the
   headers, the validation rejections, the ID and timestamp formats, that a
   replay of the same token adds no second row, then deletes its temporary
   row. A failed check throws `POS self-test failed: …`.
4. Repeat step 1 once more and double-click **Save sale** on purpose: exactly
   one row is written, and a second attempt reports *already recorded*.
5. Press **Clear** after each test sale and delete any rows you do not want
   to keep; the sheet is append-only production data for later days.

## Result contract returned to the UI

| `status` | `ok` | Meaning |
| --- | --- | --- |
| `saved` | `true` | Row appended; `transactionId` and `transactionTimestamp` are set |
| `duplicate` | `true` | The same submission token already exists; no new row was written |
| `rejected` | `false` | Validation failed or the token was reused for a different sale; `errors[]` lists every problem |
| `error` | `false` | Lock timeout or configuration problem; safe to retry, nothing was double-written |

Unexpected failures return a generic message with an eight-character
reference; details stay in the Apps Script execution logs
(**Executions** in the editor). Nothing ever exposes stack traces, tokens,
or spreadsheet internals to the browser.

## Validation rules enforced (mirrors `docs/schema.md`)

- Required: `product_id`, `product_name`, `quantity`, `unit_price`,
  `currency`, `payment_method`.
- `quantity`: whole number greater than zero.
- `unit_price`: non-negative number with at most two decimal places;
  `subtotal` is computed server-side as `quantity * unit_price`, rounded to
  two decimals, so the sheet can never store an inconsistent subtotal.
- `currency`: three-letter ISO 4217 code, uppercased, defaulting to `USD`.
- `payment_method`: one of `cash`, `card`, `other` (lowercased).
- Text is trimmed, forced onto a single line, and capped at the column
  limits (64/120/64/500 characters). Values starting with `=`, `+`, `-` or
  `@` are prefixed with `'` so they cannot become spreadsheet or CSV
  formulas — the apostrophe is the escape marker, not part of the data.
- `operator_id` and `notes` are optional. Never put passwords or tokens in
  them.

## Duplicate protection

1. The browser mints a one-time `submissionId` (UUID) per entry and reuses
   it for retries; any edit starts a new entry. The Save button is disabled
   while a request is in flight.
2. `saveTransaction` keeps a `sub_<token>` script property recording the
   saved `transaction_id` and a fingerprint of the payload (7-day TTL) and
   replays it as `duplicate` — even if the first response was lost in the
   network. The same token with *different* content is refused, so a
   `transaction_id` is never reused for another sale.
3. A script lock serializes concurrent saves, and every generated
   `transaction_id` is checked against column A before the row is appended.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Configuration problem: the "Transactions" tab headers do not match…` | Someone edited or reordered header row 1. Restore the eleven headers from `docs/schema.md`; nothing was written. |
| `Configuration problem: no spreadsheet is configured…` | Standalone script without `SPREADSHEET_ID`, or the bound spreadsheet was deleted. Set the script property. |
| `The POS is busy with another save` | Two saves overlapped for over 10 s (usually a stuck session). Wait and retry. |
| `The sale could not be saved (reference …)` | Check **Executions** in the Apps Script editor for the matching log line. |
| Permission or authorization prompt on every deploy | Wrong execution owner; redeploy as **Me** after revoking access under **Deploy ▸ Manage deployments**. |
| Page loads but nothing happens on save | Confirm the `index` file is named exactly `index` and `doGet` is present in `Code.gs`. |
| Rows appear without a `transaction_id` | Rows were typed directly into the sheet. The POS never writes a partial row; clean them up before Day 3 extracts data. |
