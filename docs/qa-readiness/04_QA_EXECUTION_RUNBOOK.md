# Gate 7-PREP — QA execution runbook

## Preconditions

1. Use a disposable local PostgreSQL database whose name contains `qa` or `test`; apply Alembic through `20261118_0021`.
2. Create two distinct absolute directories whose final directory names contain `qa` or `test`, one for private media and one for reference media.
3. Use only synthetic credentials. Do not copy a production `.env`, database dump, token or media mount.
4. Confirm that the API URL is loopback and no client/sync process points at production.

Example PowerShell setup (replace the password and database URL locally; never commit them):

```powershell
$env:ENVIRONMENT='qa'
$env:DATABASE_URL='postgresql+psycopg://qa_user:LOCAL_PASSWORD@127.0.0.1/tanzim_qa_gate7'
$env:MEDIA_STORAGE_DIR="$env:TEMP\tanzim-gate7-qa-private"
$env:REFERENCE_ASSET_STORAGE_DIR="$env:TEMP\tanzim-gate7-qa-reference"
$env:QA_DATABASE_ALLOWLIST='tanzim_qa_gate7'
$env:QA_SEED_PASSWORD='replace-with-a-test-only-password'
```

Dry-run and seed:

```powershell
.venv\Scripts\python.exe -m app.qa.cli seed --profile comprehensive --dry-run --confirm qa:tanzim_qa_gate7
.venv\Scripts\python.exe -m app.qa.cli seed --profile comprehensive --confirm qa:tanzim_qa_gate7
.venv\Scripts\python.exe -m app.qa.cli seed --profile comprehensive --confirm qa:tanzim_qa_gate7
.venv\Scripts\python.exe -m app.qa.cli audit --confirm qa:tanzim_qa_gate7
```

The second real seed proves idempotency when counts remain identical. A password shorter than 16 characters, a non-loopback PostgreSQL host, an unallowlisted target, a database without a QA/test marker, an unsafe environment, ambiguous media roots or incorrect confirmation all stop before database access.

## QA feature configuration

For an isolated catalog/taxonomy session only:

```powershell
$env:TAXONOMY_ADOPTION_ENABLED='true'
$env:CATALOG_ON_DEMAND_ADOPTION_ENABLED='true'
$env:CATALOG_CURSOR_READ_V2_ENABLED='true'
$env:CATALOG_REFERENCE_MEDIA_V1_ENABLED='true'
$env:CATALOG_OFFLINE_FAMILIES_V1_ENABLED='true'
```

Never persist these values into production configuration. Use a fresh browser profile. Verify Build ID, schema, API URL and flag state before login.

## Restore and rollback

- Take a coordinated PostgreSQL + private media + reference media snapshot before manual QA.
- Restore to a second disposable database and distinct second pair of media roots.
- Run the auditor against the restored target before opening the client.
- Rollback means discarding the isolated runtime and restoring its coordinated snapshot; it never means downgrading a production schema or deleting unknown records.
- The Gate 7 CLI intentionally has no broad cleanup command. Dispose the dedicated database/media roots through the operator’s isolated-environment lifecycle after confirming the resolved paths. It never deletes customer-scoped rows.

## Verification commands

```powershell
npm.cmd run test:regression
npm.cmd run test:backend:postgres:local
npx.cmd playwright test --workers=1
```

Physical device, scanner and printer validation must follow the separate checklist and is not inferred from Playwright.
