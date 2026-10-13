# S.A.L.S.A. — One-Week Development Task List

## Project Goal

Build an independently running sales-data pipeline that uses Google Sheets as its source of truth. Google Apps Script provides the POS, PowerShell retrieves and validates the data, worker scripts process it, reports are generated locally, and Windows Task Scheduler runs the workflow automatically. Notifications and logs must make failures visible.

## Agreed Technology Direction

- **POS:** Google Apps Script (HTML/CSS/JavaScript UI and Apps Script server functions)
- **Source of truth:** Google Sheets
- **Extraction and orchestration:** Windows PowerShell
- **Processing:** PowerShell worker scripts
- **Reports:** CSV and HTML/TXT reports written to a configured output directory
- **Scheduling:** Windows Task Scheduler
- **Launchers:** `.bat` files where they improve setup or manual execution
- **Notifications:** A configurable free channel, such as email through an available SMTP/App Password setup or Google Apps Script email; document setup requirements
- **Persistence:** Google Sheets remains the canonical database; local files are working data, logs, and generated reports

## One-Week Schedule

> Suggested plan: Day 1 through Day 7. Each day should end with a working, testable deliverable. Tasks are split by module, with integration reserved throughout the week rather than postponed entirely to the final day.

### Day 1 — Requirements, Data Contract, and Repository Setup
- [x] Confirm sales fields, required fields, date/time format, currency, and report metrics.
- [x] Define Google Sheets tabs and column headers.
- [x] Define a stable transaction ID or idempotency key.
- [x] Create repository folders for Apps Script, PowerShell, workers, reports, logs, tests, and documentation.
- [x] Add `.gitignore` and safe configuration examples; never commit credentials or real customer data.
- [x] Document local prerequisites and the end-to-end data flow.

**Deliverable:** Agreed schema, repository skeleton, and setup instructions.

### Day 2 — Google Apps Script POS and Google Sheets
- [x] Implement the POS entry flow in Google Apps Script.
- [x] Validate required fields and numeric values before saving.
- [x] Write transactions to the correct Google Sheets tab.
- [x] Add unique transaction identifiers and timestamps.
- [x] Add safe error feedback and prevent accidental duplicate submissions.
- [x] Test that a POS submission appears correctly in the sheet (deploy per `appscript-pos/README.md`, submit one sale, then run `runPosSelfTest`; offline logic check `node tests/pos-code.test.js` passes).

**Deliverable:** Functional Apps Script POS writing clean, uniquely identifiable rows to Google Sheets.

### Day 3 — PowerShell Extraction Module
- [ ] Choose and document the access method: preferably a narrowly scoped Apps Script web endpoint or another approved Google Sheets API approach.
- [ ] Implement PowerShell retrieval of records for the intended reporting period.
- [ ] Store extracted data in a temporary/local working format.
- [ ] Handle empty results, timeouts, malformed responses, and authentication failures.
- [ ] Keep secrets outside source control and avoid logging tokens or sensitive values.
- [ ] Add extraction logs and a standalone test command.

**Deliverable:** Repeatable extraction script that retrieves and saves data safely.

### Day 4 — Worker Processing, Validation, and Idempotency
- [ ] Implement worker entry points that can run independently from the scheduler.
- [ ] Validate schema, dates, quantities, and amounts.
- [ ] Detect duplicate transaction IDs and malformed rows.
- [ ] Define how invalid records are reported without silently corrupting totals.
- [ ] Ensure rerunning the same input does not double-count transactions.
- [ ] Produce a machine-readable processing summary and worker exit codes.

**Deliverable:** Reliable worker module with validation, duplicate protection, logs, and a testable CLI.

### Day 5 — Reporting Module
- [ ] Define report period and metrics (for example, transaction count, gross sales, units sold, and daily totals).
- [ ] Generate a human-readable HTML or TXT report and a CSV export.
- [ ] Include generation timestamp, reporting period, and data-quality counts.
- [ ] Handle no-data days and partial/invalid data clearly.
- [ ] Write reports to configurable output folders with predictable filenames.
- [ ] Verify report totals against a small known test dataset.

**Deliverable:** Reports generated consistently from processed data.

### Day 6 — Notifications and Windows Scheduling
- [ ] Implement success/failure notifications with a configurable destination.
- [ ] Include run status, reporting period, report path, and a short error summary; avoid sending secrets or full sensitive datasets.
- [ ] Create a PowerShell orchestrator that runs extraction → workers → reporting → notification in order.
- [ ] Add a `.bat` launcher for manual execution and troubleshooting.
- [ ] Create a setup script or documented `schtasks` command for Windows Task Scheduler.
- [ ] Configure a daily schedule, working directory, log path, and appropriate failure behavior.
- [ ] Test manual launch and a scheduled-style run.

**Deliverable:** One-command pipeline execution plus documented scheduled execution and notifications.

### Day 7 — End-to-End Testing, Recovery, and Documentation
- [ ] Test the full path from POS entry to sheet, extraction, workers, report, and notification.
- [ ] Test empty data, duplicate input, invalid rows, network/authentication failure, and report-write failure.
- [ ] Confirm retries/reruns do not double-count data.
- [ ] Verify logs identify the failed stage and include a run ID.
- [ ] Document first-time setup, credentials, configuration, manual run, schedule setup, and troubleshooting.
- [ ] Perform a clean-machine walkthrough using the README.
- [ ] Close issues only when acceptance criteria and test evidence are satisfied.

**Deliverable:** Working, documented pipeline that can run unattended after setup.

## Definition of Done

- [ ] POS transactions are saved to Google Sheets with unique IDs.
- [ ] PowerShell can retrieve data without manual export.
- [ ] Workers validate and process data repeatably without double-counting.
- [ ] Reports are generated in the configured output folder.
- [ ] Notifications are sent for success and failure, where configured.
- [ ] Windows Task Scheduler can run the pipeline unattended.
- [ ] Logs and exit codes make failures diagnosable.
- [ ] Setup works with free/local tooling and documented Google account requirements.
- [ ] No secrets or production customer data are committed to Git.
- [ ] All modules have standalone instructions and an end-to-end test.



The output and log directories may be created at runtime and should generally be excluded from version control if they contain generated or sensitive data.
