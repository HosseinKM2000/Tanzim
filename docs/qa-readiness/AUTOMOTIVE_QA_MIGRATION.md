# Automotive QA setup (resumed handoff)

Date: 2026-11-20

Branch: `feat/automotive-qa-full-data`

Baseline: `feat/canonical-taxonomy-seed-v1@c6a937d` (`draft@88b9a19` + 5 commits)

Environment boundary: isolated local QA only. No merge, push, deploy, production database write, feature-flag default change, or mutation of the existing development Store (`tanzim`).

## Isolation

| Item | Value |
|---|---|
| QA database | `tanzim_qa_automotive` (loopback PostgreSQL 18.6, container `tanzim-postgres-1`) |
| Schema | `20261120_0023` (Alembic head and `DATABASE_SCHEMA_VERSION` aligned) |
| QA API | `http://127.0.0.1:8010/api` |
| QA private media | `.qa-automotive-runtime/qa-private-media` (gitignored) |
| QA reference media | `.qa-automotive-runtime/qa-reference-media` (gitignored) |
| Development database | `tanzim` left untouched at `20261119_0022` |
| Development API | `http://localhost:8000/api` unchanged |

`.qa-automotive-runtime/` is now gitignored so QA dumps, media and logs can never be committed by accident.

## Seeder profile

`backend/app/qa/cli.py` accepts `--profile automotive`. `backend/app/qa/seeder.py` keeps every existing profile byte-compatible and only widens the `auto` Store when the profile requests at least 100 products (`rich_automotive`):

- 25 immutable canonical system categories from sector `01` («قطعات، لوازم و تجهیزات خودرو»).
- 125 products whose display names come from the canonical category examples.
- Barcode variation: every fourth product receives a preserved manual `manufacturer` code (`QAUTO…`); the rest receive Tanzim internal codes (`TZ1-01-xx-…`) from stable sector/category identity.
- 25 synthetic product images (`MediaAsset`, 1×1 WebP) attached through the durable media storage adapter.
- 10 counterparties (5 suppliers, 5 customers), 20 posted invoices (purchase/sale alternation, 3 coherent lines each) with matching inventory movements and 20 `StoreActivity` records.
- Deterministic identities (`uuid5`, stable catalog names) and a transactional seed, so a repeated run does not duplicate records.

## Actual data after completion

Seeded set plus the separately created official-API smoke product:

| Entity | Count |
|---|---:|
| Stores / users | 1 / 1 (`qa-gate7-auto-owner`, VIP, owner, solo) |
| Categories | 25 (`origin=system`, codes `01..25`) |
| Products | 126 (125 seeded + «محصول آزمون API خودرو») |
| Barcodes | 126 (95 `tanzim`, 31 `manufacturer`) |
| Counterparties | 10 |
| Invoices / lines | 20 / 60 (all `posted`) |
| Inventory movements | 60 |
| Media assets | 25 |
| Store activity | 20 |

The extra product is the deliberate API smoke test; it owns category `25`, one internal barcode and is not a seeder duplication. The seeder was not re-run against this database because the auditor already passes and fresh-database idempotency is covered by `test_automotive_profile_is_comprehensive_idempotent_and_auditable`.

## Snapshot

`tanzim_qa_automotive_snapshot_20261120` (physical template copy) and `.qa-automotive-runtime/snapshot-20261120/`:

- `db/tanzim_qa_automotive.dump` — `pg_dump` custom format, 223,950 bytes, SHA-256 `ee5cd031c0d9a988c3db56fdaee71e56beaa28d3daae050324e0eb7a6d85ccb2`.
- `qa-private-media/` — identical SHA-256 to the live QA media root.
- `qa-reference-media/` — empty (no reference media is published for this Store).
- `manifest.json` — counts, hashes and verification evidence.

Restore was verified end to end: the dump was restored into the disposable database `tanzim_qa_automotive_restorecheck`, which reproduced schema `20261120_0023`, identical table counts and identical ordered row checksums for products, invoice lines, movements, barcodes and activity; the disposable database was then dropped. The original QA database and snapshot were not modified.

Restore commands (isolated target only):

```powershell
docker compose exec -T postgres psql -U tanzim_app -d postgres -c "CREATE DATABASE tanzim_qa_automotive_restorecheck OWNER tanzim_app;"
docker compose exec -T postgres pg_restore -U tanzim_app -d tanzim_qa_automotive_restorecheck --exit-on-error /path/inside/container/tanzim_qa_automotive.dump
```

## Frontend connection

The existing Vite session is already connected to the QA API through the gitignored `.env.development.local` (`VITE_API_URL=http://127.0.0.1:8010/api`). The committed default in `.env` remains `http://localhost:8000/api`, so the override is explicit and reversible.

```powershell
# QA backend (run from backend/, never as backend.app.main)
$env:ENVIRONMENT='qa'
$env:DATABASE_URL='postgresql+psycopg://tanzim_app:<LOCAL_PASSWORD>@127.0.0.1:5432/tanzim_qa_automotive'
$env:MEDIA_STORAGE_DIR='D:\work\offical-projects\Tanzim\.qa-automotive-runtime\qa-private-media'
$env:REFERENCE_ASSET_STORAGE_DIR='D:\work\offical-projects\Tanzim\.qa-automotive-runtime\qa-reference-media'
$env:QA_DATABASE_ALLOWLIST='tanzim_qa_automotive'
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8010

# QA frontend (repo root; reads .env.development.local)
npm.cmd run dev
```

To leave QA mode, remove or change `.env.development.local` and restart Vite.

Seeding is guarded by the existing fail-closed safety check:

```powershell
cd backend
..\.venv\Scripts\python.exe -m app.qa.cli seed --profile automotive --dry-run --confirm qa:tanzim_qa_automotive
..\.venv\Scripts\python.exe -m app.qa.cli audit --confirm qa:tanzim_qa_automotive
```

## Verification evidence

- API (`8010`): login succeeded, `/auth/me` returned Store 1, plan `vip`, owner, `sector 01` taxonomy Store; `/categories` returned exactly 25 system categories; `/products` total 126; `/invoices` 20 posted with 60 lines; `/counterparties` 10; `/dashboard` coherent (120 visible products, 17 out of stock, 1 low stock); media detail returned `200 image/webp` with ETag equal to the stored SHA-256.
- Official auditor: `PASS` (`QA_INVARIANTS`: ownership, tenant, industry, barcode, invoice and movement checks).
- Add-product form in the QA frontend exposes all 25 canonical categories in the category picker.
- Backend tests: 122 passed (SQLite suite, including the new automotive profile test). Focused QA readiness tests: 6 passed. Typecheck: passed.

## Remaining manual checks

- Physical barcode scanning/printing and camera behaviour (hardware).
- Visual walkthrough of every module with long Persian content on a real mobile device.
- PWA install/update against the QA API.
- The QA API process currently running on port `8010` was started with `backend.app.main:app`; the documented command above uses `app.main:app` from `backend/`. Restart it with the documented command when the current session can be closed.

## Safety notes

- Original development Store, `tanzim` database and port `8000` service were not modified.
- No schema migration was added by this task; only the stale `DATABASE_SCHEMA_VERSION` constant was aligned with the existing `20261120_0023` head.
- No production flag defaults, permissions or authorization checks were changed.
