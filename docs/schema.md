# S.A.L.S.A. Data Contract

This document defines the shared field names, formats, validation rules, and
Google Sheets layout used by the POS, extraction script, workers, and reports.
The contract is intentionally provider-neutral so local processing can be
tested without live Google data.

## Google Sheets tabs

| Tab | Purpose |
| --- | --- |
| `Transactions` | Canonical append-only sales records entered by the POS |
| `Reference` | Optional product, tax, and configuration values |
| `ProcessingLog` | Optional operational record of extraction and processing runs |

Only `Transactions` is required for the first implementation. The first row
of each tab is reserved for the column headers below.

## Transactions columns

The column order is stable and must not be changed without updating every
consumer.

| Column | Field | Type | Required | Rules |
| --- | --- | --- | --- | --- |
| A | `transaction_id` | string | Yes | Stable idempotency key; globally unique, non-empty |
| B | `transaction_timestamp` | ISO 8601 datetime | Yes | UTC with `Z`, for example `2026-10-13T00:42:46Z` |
| C | `product_id` | string | Yes | Non-empty product or SKU identifier |
| D | `product_name` | string | Yes | Display name; trimmed and non-empty |
| E | `quantity` | integer | Yes | Positive whole number |
| F | `unit_price` | decimal | Yes | Non-negative amount in the configured currency |
| G | `subtotal` | decimal | Yes | `quantity * unit_price`, rounded to 2 decimals |
| H | `currency` | string | Yes | Three-letter ISO 4217 code; default `USD` |
| I | `payment_method` | string | Yes | Controlled value such as `cash`, `card`, or `other` |
| J | `operator_id` | string | No | POS operator identifier; never store a password or token |
| K | `notes` | string | No | Optional non-sensitive note |

Money values use a period as the decimal separator and exactly two decimal
places when written to CSV or reports. The initial deployment supports one
currency per run; mixed currencies must be rejected or separated before
totals are calculated.

## Validation and idempotency

- `transaction_id` is the idempotency key. It must be generated before the
  row is written and must not be reused for a different sale.
- A worker must reject rows missing required fields, with invalid dates,
  non-positive quantities, negative prices, invalid currency codes, or
  inconsistent subtotals.
- Duplicate `transaction_id` values are data-quality errors. A rerun of the
  same input must not count a transaction twice.
- Timestamps are stored and exchanged in UTC ISO 8601 format. Reports may
  display a configured local timezone, but source data remains UTC.
- Text fields are trimmed. Newlines and spreadsheet formulas must not be
  introduced into exported CSV fields.

## Report metrics

The reporting module must calculate, at minimum:

- transaction count: count of unique valid `transaction_id` values;
- gross sales: sum of valid `subtotal` values;
- units sold: sum of valid `quantity` values;
- daily totals: gross sales and transaction count grouped by UTC date;
- data-quality counts: invalid rows, duplicate rows, and excluded rows.

Invalid and duplicate rows must be reported separately from valid totals.
They must never be silently included or discarded.

## Example record

```text
transaction_id,transaction_timestamp,product_id,product_name,quantity,unit_price,subtotal,currency,payment_method,operator_id,notes
txn_20261013T004246Z_01,2026-10-13T00:42:46Z,SKU-001,Example Product,2,12.50,25.00,USD,card,operator-01,
```

