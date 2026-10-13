# GitHub Issues — S.A.L.S.A. Google Sheets Pipeline

Create these as seven GitHub Issues. Suggested labels: `feature`, `integration`, `testing`, `documentation`, `priority:high`. The schedule assumes a seven-day implementation window and can be adjusted to the team's availability.

---

## Issue 1 — Define the Data Contract and Set Up the Repository

**Suggested labels:** `planning`, `documentation`, `priority:high`  
**Schedule:** Day 1  
**Goal:** Establish the schema and project structure every module will follow.

### Tasks
- [/] Confirm required sales fields, formats, and report metrics.
- [/] Define Google Sheets tab names and column headers.
- [/] Specify a stable transaction ID/idempotency key.
- [/] Create folders for Apps Script, scripts, workers, reports, logs, tests, and config.
- [/] Add `.gitignore` and a safe example configuration.
- [/] Document prerequisites and the planned data flow.

### Acceptance criteria
- [/] Schema and field validation rules are documented.
- [/] All modules use the same field names and date/number conventions.
- [/] No credentials or real customer records are committed.
- [/] A new contributor can understand the repository layout.

### Dependencies
None. This should be completed first.

---

## Issue 2 — Build the Google Apps Script POS Connected to Google Sheets

**Suggested labels:** `feature`, `pos`, `priority:high`  
**Schedule:** Day 2  
**Goal:** Provide a working POS entry interface that stores transactions in Google Sheets.

### Tasks
- [ ] Implement the POS UI using Apps Script HTML service.
- [ ] Validate required fields, quantities, and amounts.
- [ ] Save accepted transactions to the designated sheet.
- [ ] Generate a unique transaction ID and creation timestamp.
- [ ] Prevent duplicate submission where practical.
- [ ] Show clear success and validation/error messages.

### Acceptance criteria
- [ ] A valid sale creates one correctly structured row.
- [ ] Invalid input is rejected with a useful message.
- [ ] Duplicate clicks or retries do not silently create duplicate transactions.
- [ ] The sheet structure matches Issue 1's data contract.
- [ ] Deployment and permissions are documented.

### Dependencies
Issue 1.

---

## Issue 3 — Implement PowerShell Data Extraction from Google Sheets

**Suggested labels:** `feature`, `powershell`, `integration`, `priority:high`  
**Schedule:** Day 3  
**Goal:** Retrieve sales data programmatically without requiring a manual CSV export.

### Tasks
- [ ] Select and document the Google Sheets access method.
- [ ] Prefer a narrowly scoped Apps Script endpoint or use the Sheets API with appropriately restricted credentials.
- [ ] Implement a PowerShell extraction script with configurable reporting dates.
- [ ] Save retrieved records in a local working format for workers.
- [ ] Handle authentication errors, network failures, empty responses, and malformed data.
- [ ] Log the run ID, record count, and status without logging secrets.

### Acceptance criteria
- [ ] PowerShell retrieves rows from the intended sheet.
- [ ] The script can be run independently for testing.
- [ ] Failure produces a non-zero exit code and actionable log entry.
- [ ] Credentials are not hard-coded or committed.
- [ ] The extraction output conforms to the agreed schema.

### Dependencies
Issue 1; Issue 2 should provide representative source data.

---

## Issue 4 — Build Independent Workers for Validation and Sales Processing

**Suggested labels:** `feature`, `workers`, `testing`, `priority:high`  
**Schedule:** Day 4  
**Goal:** Process extracted data safely and repeatably through independently executable worker scripts.

### Tasks
- [ ] Create standalone worker entry points.
- [ ] Validate required columns, dates, quantities, and monetary values.
- [ ] Detect duplicate transaction IDs and invalid records.
- [ ] Define whether invalid records are rejected, quarantined, or excluded with an explicit count.
- [ ] Calculate the required normalized records and sales summaries.
- [ ] Return structured processing summaries and meaningful exit codes.
- [ ] Ensure repeated processing does not double-count the same transactions.

### Acceptance criteria
- [ ] Workers can be invoked without Windows Task Scheduler.
- [ ] Valid records are processed correctly.
- [ ] Invalid and duplicate records are identified and counted.
- [ ] Reprocessing the same input does not inflate totals.
- [ ] Logs identify the run and processing outcome.

### Dependencies
Issues 1 and 3.

---

## Issue 5 — Generate Sales Reports from Processed Data

**Suggested labels:** `feature`, `reporting`, `priority:medium`  
**Schedule:** Day 5  
**Goal:** Produce consistent, useful sales reports without paid reporting software.

### Tasks
- [ ] Define report period and key metrics.
- [ ] Generate CSV output for further analysis.
- [ ] Generate a readable HTML or TXT summary.
- [ ] Include reporting period, generation timestamp, transaction count, sales totals, and data-quality counts.
- [ ] Support empty-data periods and clear partial-data warnings.
- [ ] Make output location and filename configurable.
- [ ] Validate totals against a known sample dataset.

### Acceptance criteria
- [ ] Both report formats can be generated from worker output.
- [ ] Report calculations match the test data.
- [ ] Empty days do not crash the pipeline.
- [ ] Report files use predictable names and are saved to the configured folder.
- [ ] A failed report write returns a failure status.

### Dependencies
Issue 4.

---

## Issue 6 — Add Notifications and Windows Task Scheduler Automation

**Suggested labels:** `feature`, `automation`, `notifications`, `priority:high`  
**Schedule:** Day 6  
**Goal:** Run the complete pipeline unattended and alert the operator when it succeeds or fails.

### Tasks
- [ ] Implement configurable success and failure notifications.
- [ ] Include run status, reporting period, report path, and a short error summary.
- [ ] Create a PowerShell orchestrator that runs extraction, workers, reporting, and notification in order.
- [ ] Stop or branch safely when a critical stage fails.
- [ ] Add a `.bat` launcher for manual runs.
- [ ] Add a PowerShell setup script or documented `schtasks` command for a daily Windows Task Scheduler job.
- [ ] Configure working directory, schedule, logs, and failure handling.
- [ ] Document notification credentials and any provider limits.

### Acceptance criteria
- [ ] The pipeline can be started with one documented command.
- [ ] A configured scheduled task runs without interactive prompts.
- [ ] Failure in a critical stage is reflected in the final exit code and notification.
- [ ] Notifications do not expose secrets or unnecessary customer data.
- [ ] The operator can find logs and reports from a run.

### Dependencies
Issues 3, 4, and 5. Integration can begin earlier with stubs.

---

## Issue 7 — End-to-End Testing, Recovery, and Setup Documentation

**Suggested labels:** `testing`, `documentation`, `integration`, `priority:high`  
**Schedule:** Day 7  
**Goal:** Verify the complete flow and ensure another person can install, run, and troubleshoot it.

### Tasks
- [ ] Test POS → Google Sheets → PowerShell extraction → workers → reports → notifications.
- [ ] Test empty data, duplicate rows, invalid fields, authentication/network failures, and report-write failures.
- [ ] Confirm reruns do not double-count sales.
- [ ] Confirm logs include run IDs, stage names, and failure reasons.
- [ ] Write setup and configuration instructions.
- [ ] Document Apps Script deployment, Google access permissions, notification setup, manual execution, and scheduler registration.
- [ ] Add troubleshooting steps and a final acceptance checklist.
- [ ] Perform a clean setup walkthrough using only the README.

### Acceptance criteria
- [ ] The end-to-end happy path passes.
- [ ] Critical failure scenarios are tested and documented.
- [ ] Scheduled and manual execution both work.
- [ ] A fresh setup can be completed using the documentation.
- [ ] All seven issues have acceptance evidence and are closed only when done.

### Dependencies
Issues 1–6; testing should happen continuously throughout the week.

---

## Recommended Issue Order

1. Data contract and repository setup
2. Apps Script POS and Google Sheets
3. PowerShell extraction
4. Processing workers
5. Report generation
6. Notifications and scheduling
7. End-to-end tests and documentation

## GitHub Project Board Columns

- `Backlog`
- `Ready`
- `In Progress`
- `Review / Testing`
- `Done`

## Scope Guardrails

- Keep Google Sheets as the source of truth; do not add PostgreSQL unless requirements change.
- Prefer PowerShell, Apps Script, Windows Task Scheduler, and BAT launchers to avoid paid runtime dependencies.
- Do not commit credentials, tokens, or real customer data.
- Treat “independent” as independently runnable modules with documented configuration, plus an orchestrator that connects them. The complete scheduled workflow must not require someone to manually export or move data.
