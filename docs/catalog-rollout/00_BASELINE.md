# GATE 0 — Catalog rollout baseline and safety evidence

**Status: NO-GO**
**Captured:** 2026-11-17, Asia/Tehran
**Branch:** `feat/catalog-safe-rollout`
**Baseline commit:** `9e521a64807191b4a82475ae6a13b1a8e1f77189`

No Catalog behavior, database schema, Sync behavior, OPFS data, deployment setting, or production resource was changed during this gate.

## Gate decision

Gate 0 is not cleared. The unit/component/backend/PostgreSQL/build/lint baseline is green, but the correctly hosted production-preview E2E run has nine failures. Target deployment evidence, a fresh paired database/media restore rehearsal, the requested scale fixtures, and target-device measurements are also incomplete. Per the execution contract, work must not proceed into automatic-provisioning changes while this gate is `NO-GO`.

## Repository and environment

| Item | Observed value |
|---|---|
| Branch | `feat/catalog-safe-rollout` |
| Git state before work | clean |
| Node | `v24.12.0` |
| npm | `10.8.1` (`npm.cmd`; local PowerShell policy rejects unsigned `npm.ps1`) |
| Python | `3.13.13` |
| PostgreSQL | `18.6` on localhost |
| FastAPI | `0.141.1` |
| SQLAlchemy | `2.0.52` |
| Alembic | `1.19.1` |
| Pydantic | `2.13.4` |
| Pytest | `9.1.1` |
| Frontend package version | `0.12.0` (`package.json:4`) |

The project uses React/TypeScript/Vite/Dexie/OPFS in the client and FastAPI/SQLAlchemy/Alembic/PostgreSQL in the server. This matches the architecture audit.

## Code reality versus audit

| Audit statement | Current code evidence | Result |
|---|---|---|
| Catalog list has no pagination | `backend/app/routers/catalog_products.py:22-36`; `backend/app/repositories/catalog_products.py:11-46` returns a full list | Confirmed |
| Catalog UI loads the full grid eagerly | `src/features/setting/components/catalogs/index.tsx:158-223` maps all rows and uses direct `<img>` | Confirmed |
| Catalog fan-out creates Inventory rows | `backend/app/services/catalog_provisioning_service.py:44-126`; `backend/app/services/catalog_product_service.py:45-109` | Confirmed |
| Catalog has no family/label relation | `backend/app/models.py:392-490`; labels join `InventoryItem`, not `CatalogProduct` | Confirmed |
| Inventory XLSX import is separate | `src/features/app/inventory/services/excel-import.service.ts:43-132` calls `inventoryService.createMany` | Confirmed |
| private image lifecycle is Store-bound | `backend/app/routers/media.py:72-170`; `backend/app/models.py:493-517` | Confirmed |
| private OPFS namespace is `inventory-images` | `src/shared/lib/infrastructure/media/image.repository.ts:1-14` | Confirmed |
| binary media transfer is outside operational outbox | `media-transfer.service.ts:37-190`; `sync-service.ts:193-220` | Confirmed |
| Service Worker excludes API/uploads | `public/sw.js:138-155` | Confirmed |
| production proxy/media durability is unknown | only PostgreSQL is declared in `docker-compose.yml:3-23`; application/proxy deployment is absent | Not verified |

## Existing feature-gate mechanism

The only repository-level environment gate found is `TAXONOMY_ADOPTION_ENABLED`, parsed by `_environment_flag` in `backend/app/config.py:25-29,54` and defaulted off in `.env.example:12`. No general Catalog flag service and none of `catalog_cursor_read_v2`, `catalog_on_demand_adoption`, `catalog_reference_media_v1`, or `catalog_offline_families_v1` exists.

Later gates should extend this simple default-off configuration pattern. Gate 0 adds no flag because no behavior is introduced.

## Read-only local database snapshot

The snapshot query asserted PostgreSQL and host `localhost`/`127.0.0.1` before reading aggregate counts. It printed no row content, customer identity, token, credential, or connection string.

| Aggregate | Count |
|---|---:|
| Stores | 1 |
| Catalog rows, total | 18 |
| Shared active Catalog rows | 3 |
| Inventory rows, total | 18 |
| Catalog-backed Inventory rows | 3 |
| Distinct Catalog links in Inventory | 18 |
| Categories | 3 |
| Labels | 4 |
| Sync changes | 67 |
| Sync operations | 69 |

This is a local development snapshot only. Browser outbox/cursors are partitioned client data and were not represented by this PostgreSQL query. No production or staging snapshot was accessed.

## Baseline test evidence

### Regression command

Command:

```powershell
npm.cmd run test:regression
```

Result: **PASS**, exit 0.

- Vitest: 90 files, 414 tests passed.
- TypeScript test typecheck: passed.
- Backend non-PostgreSQL: 104 tests passed.
- Production build: passed, 2,888 modules transformed, build time reported as 9.76 s.
- ESLint: passed.
- Non-blocking warnings: Browserslist data is six months old; several minified chunks exceed 500 kB. No dependency was updated during Gate 0.

### PostgreSQL integration command

Command:

```powershell
npm.cmd run test:backend:postgres:local
```

The runner enforces a local PostgreSQL host and `development`/`test`, then targets `tanzim_test` (`backend/run_local_postgres_tests.py:13-35`).

Result: **PASS**, 22 tests passed, exit 0.

### E2E command and root-cause correction

The first direct command was invalid as a baseline:

```powershell
npm.cmd run test:e2e
```

It produced 128 failures and 8 skips because `playwright.config.ts:3-21` defines `baseURL` but no `webServer`; the script assumes an already running server. All sampled failures were `ERR_CONNECTION_REFUSED` on `127.0.0.1:5173`. This run is classified as an environment/setup failure, not a product regression.

The valid production-preview run used the already successful build:

```powershell
npm.cmd run preview -- --host 127.0.0.1 --port 4173
$env:E2E_BASE_URL='http://127.0.0.1:4173'
$env:E2E_NO_VIDEO='1'
npm.cmd run test:e2e
```

Result: **FAIL**, exit 1: 119 passed, 9 failed, 8 skipped in 2.4 minutes.

| Failure group | Projects | Evidence/status |
|---|---|---|
| Dashboard scroll restoration | desktop + mobile | repeatable timeout waiting for the main Dashboard navigation link after navigating through a hidden-products section |
| Invoice dashboard coverage values | desktop + mobile | expected exact `۰ تومان` not found in the seven-day section |
| PWA offline cold-page mutation evidence | mobile | expected product DELETE outbox record was absent |
| PWA cold page | desktop | browser context closed during parallel run; classification unresolved |
| Invoice editor | desktop | browser context closed; classification unresolved |
| Entitlement management | mobile | browser context ended; classification unresolved |
| Navigation/sidebar | mobile | browser context closed; classification unresolved |

The repeatable/behavioral failures predate any product change on this branch. The four browser-context failures require isolated reruns before they can be classified. No E2E test or application code was changed to hide the failures.

## Backup and restore safety runbook

The coordinated backup unit is **PostgreSQL plus the complete durable media root**. A database dump alone is not a restorable product state.

1. Resolve and record candidate commit/build ID, Alembic revision, database name, absolute `MEDIA_STORAGE_DIR`, file owner and free space. Never print credentials.
2. Stop or quiesce writes using an approved maintenance window. Do not mix schema-incompatible workers.
3. Run `pg_dump --format=custom` to a timestamped, access-controlled path.
4. Copy the complete durable media root while writes are quiesced. Preserve relative paths and permissions.
5. Produce a manifest of relative media path, byte size and SHA-256. Do not include passwords, tokens, memberships, roles or subscription authority in application backup artifacts.
6. Restore the dump to a **new, separately named, disposable database** using `pg_restore --exit-on-error --no-owner`. Never restore over the source as a drill.
7. Restore media to a separate temporary root and configure only isolated rehearsal workers to use it.
8. Verify Alembic head, aggregate row counts, Inventory→MediaAsset associations, sampled relative paths, sizes and hashes, authenticated protected reads and Store isolation.
9. Run smoke tests against synthetic accounts. Record any mismatch and keep rollout stopped.
10. Remove rehearsal-only resources only after exact target paths are reviewed. Retain evidence according to the approved retention policy.

The latest repository evidence of a paired local drill is `docs/v1/release-hardening.md:25-38` and `docs/v1/progress.md:518`: a disposable PostgreSQL/media restore matched counts and a synthetic media file hash, then rehearsal resources were removed. It did not validate production. A fresh drill was **not rerun in this Gate** because the E2E baseline already forces `NO-GO`; target-like backup ownership, off-site retention and RPO/RTO remain unresolved.

## Scale and performance baseline

Requested 1k/5k/10k/50k Catalog fixtures were not generated. No production-like dataset, image corpus, target device, staging server, bandwidth telemetry or approved image publishing rights are available in this environment. Inventing latency or throughput numbers would violate the execution contract.

The following remain unmeasured:

- Catalog metadata response bytes and P50/P95;
- search P95 and query plan at scale;
- image requests per viewport and warm-cache bytes;
- family transfer size, median/p95 image size and family overlap;
- UI long tasks, memory and IndexedDB query time;
- Sync completion during bulk media work;
- server CPU, RAM, bandwidth, disk I/O and proxy cache behavior.

## Deployment evidence

| Item | Status |
|---|---|
| Durable media requirement in application config | Confirmed: `backend/app/config.py:55-75` |
| Media volume in repository compose | Not found; compose declares PostgreSQL volume only |
| Reverse proxy/static file offload | Not verified |
| TLS, HTTP/2/3, Brotli/Gzip | Not verified |
| Production disk/bandwidth/permissions | Not verified |
| Reference-image publishing rights | Not decided |
| Target iOS/Android device validation | Not run |

## Unresolved risks

1. Nine current E2E failures prevent a clean baseline.
2. Four parallel browser-context failures need isolated rerun and classification.
3. No fresh target-like PostgreSQL+media restore drill exists for this rollout.
4. Scale fixtures and measurements are missing.
5. Production media volume, proxy, capacity and operators are unverified.
6. Reference-content access/publication policy is unresolved.

## Rollback / forward-fix

Gate 0 changes documentation only. Rollback is removal/revert of the two Gate 0 documents; no database, browser schema, file storage or runtime behavior is affected. There is no operational forward-fix requirement at this stage.

## Required work before GO

1. Re-run the nine failed E2E cases serially against production preview and classify deterministic failures versus parallel resource failures.
2. Fix or formally disposition every deterministic baseline failure on a separate focused branch with regression evidence.
3. Execute a fresh paired PostgreSQL/media restore rehearsal in disposable infrastructure.
4. Create synthetic scale fixtures without touching development/customer data and capture the defined metrics.
5. Record target deployment and access-policy decisions.

**Explicit gate status: NO-GO. Do not begin GATE 1 behavior changes.**
