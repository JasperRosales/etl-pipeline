# S.A.L.S.A. ETL Pipeline

S.A.L.S.A. is a locally running sales-data pipeline. Google Sheets is the
source of truth, Google Apps Script provides the POS, PowerShell extracts and
processes records, and local reports are generated for operators.

## Prerequisites

- Windows 10 or later with Windows PowerShell 5.1 or PowerShell 7;
- a Google account with access to the project spreadsheet;
- Google Apps Script enabled for the POS deployment;
- permission to create or update a Windows Task Scheduler task;
- optional SMTP or Google Apps Script email configuration for notifications.

No credentials belong in this repository. Copy
`config/config.example.json` to a local `config/config.json`, replace the
placeholders, and keep the local file untracked.

## Data flow

1. The Apps Script POS validates a sale and appends one row to the
   `Transactions` tab.
2. The PowerShell extraction script retrieves the requested reporting period
   and writes a local working file.
3. Validation and sales workers reject malformed or duplicate records and
   produce a machine-readable processing summary.
4. The reporting module writes CSV and human-readable output under `reports/`.
5. The orchestrator records the run under `logs/` and sends a configured
   success or failure notification.

The complete field contract is documented in
[`docs/schema.md`](docs/schema.md). The planned repository layout is described
in [`docs/architecture.md`](docs/architecture.md).

