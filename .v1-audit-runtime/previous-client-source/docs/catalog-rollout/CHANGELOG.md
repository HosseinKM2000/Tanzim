# Catalog safe rollout changelog

## GATE 4 — 2026-11-18

### Offline families and verified reference-image cache

- Added default-off, Store/account/industry-partitioned offline family metadata,
  persistent download journals, an isolated content-addressed OPFS repository and
  a shared bounded image loader (four total/two bulk by default).
- Added authenticated exact-release family manifests and release/family-scoped asset
  authorization, atomic local release activation, incremental reuse, pinned-family
  protection, budgeted unpinned LRU cleanup, and Settings/offline Catalog surfaces.
- Preserved ProductForm/outbox adoption, Inventory media, Sync, backup, service-worker,
  PostgreSQL, and Gate 1–3 contracts. Alembic remains `20261118_0021`; operational
  Dexie remains v14 and the additive Catalog database is independently versioned v1.
- Production-preview E2E verified download, reload, offline search metadata, and OPFS
  image display on desktop and Pixel 7 emulation. Synthetic Chromium measurements
  and the 50k metadata warning are recorded in the Gate report.
- Closing verification passed 425 frontend, 113 fast backend, 26 isolated PostgreSQL,
  and 144 production-preview E2E tests; the established eight external-prerequisite
  E2E tests were skipped and no test failed. Typecheck, build, and lint passed.
- Development Gate: **GO — DEVELOPMENT ONLY**. Production remains
  **NO-GO / NOT ASSESSED**; no merge, push, deploy, or later Gate was performed.

See `04_OFFLINE_CATALOG_AND_IMAGES.md` for policy, contracts, measurements,
verification, rollback, and residual risks.

## GATE 3 — 2026-11-18

### Families, reference media and safe publication

- Added default-off reference-media infrastructure with additive Alembic
  `20261118_0021`, industry-scoped families, validated content-addressed WebP
  variants, immutable deterministic releases and an atomic current pointer.
- Kept reference bytes private and authenticated; customer scope derives from
  active Store membership. Added reference-first UI rendering with legacy
  fallback and no Inventory, Sync, outbox, OPFS, service-worker or Store-backup
  contract change.
- Publication scale held at three SQL queries through 50k products/75k family
  relations; the 50k manifest was 28,843,021 bytes, 25.50 s and ~170 MiB peak
  traced memory, recorded as an operational rollout budget risk.
- Verification: 418 frontend, 113 fast backend, 26 PostgreSQL and 140 hosted
  E2E tests passed; eight established external-prerequisite E2E tests skipped;
  typecheck, production build, lint and local migration to 0021 passed.
- Development Gate: **GO — DEVELOPMENT ONLY**. Production release remains
  **NO-GO / NOT ASSESSED**; no merge, push or deployment was performed.

See `03_REFERENCE_MEDIA_PUBLICATION.md` for the model, access, recovery,
benchmark, rollback and residual-risk evidence.

## GATE 2 — 2026-11-18

### Scalable browsing

- Added a default-off, independently reversible cursor reader and an additive
  authenticated page endpoint; the legacy list remains unchanged.
- Added HMAC query-bound keyset cursors, stable boundary ordering, compatible
  Persian search variants and the `20261118_0020` traversal index.
- Added cancellable/debounced infinite queries, responsive row virtualization,
  lazy image decode and a fixed fallback that does not touch private media,
  Sync, outbox, OPFS, service-worker or backup contracts.
- Local PostgreSQL first-page evidence at 1k/5k/10k/50k was
  5.980/3.741/3.976/3.821 ms; the 50k plan used the cursor scope index.
- Verification: 418 frontend, 110 fast backend and 25 PostgreSQL tests passed;
  production build/typecheck/lint passed; production-preview E2E finished with
  134 passed, 8 established external-prerequisite skips and 0 failed.
- Development Gate: **GO — DEVELOPMENT ONLY**. Production release remains
  **NO-GO / NOT ASSESSED**; no merge, push or deployment was performed.

## GATE 1 — 2026-11-18

### Adoption decoupling

- Added default-off `CATALOG_ON_DEMAND_ADOPTION_ENABLED`.
- Flag on stops industry selection and Catalog publish/update/restore from
  creating missing Store Inventory rows while preserving existing linked rows.
- Added an authenticated read-only flag status, same-industry Catalog browser,
  and explicit adoption through the existing local-first product form/outbox.
- Added client/server duplicate convergence to the stable Inventory ID,
  Store-row serialization, inactive-reference rejection and preserved conflict
  recovery evidence.
- Added no migration, Dexie version, dependency, media-storage or backup-format
  change.

### Verification summary

- Full regression: PASS (418 frontend, 109 backend, typecheck, production
  build, lint).
- PostgreSQL: PASS (24 tests), with 1k/5k/10k scale results of 11/9/9 SQL
  statements, zero Inventory rows, and 37.73/24.11/26.50 ms.
- Hosted Playwright at two workers: PASS (132 passed, 8 established skips,
  0 failed), including flag-on/off adoption on desktop and mobile.
- Development Gate: **GO — DEVELOPMENT ONLY**.
- Production Release Gate: **NO-GO / NOT ASSESSED**; no merge, push, deploy or
  later gate.

See `01_ADOPTION_DECOUPLING.md` for dependency map, scenario matrix, rollback
and complete evidence.

## GATE 0 — 2026-11-17

### Files changed

- `docs/catalog-rollout/00_BASELINE.md`
- `docs/catalog-rollout/CHANGELOG.md`

### Runtime, schema and compatibility

- Runtime code changed: no.
- PostgreSQL migration added or executed: no.
- Dexie schema changed: no.
- Sync/outbox/media behavior changed: no.
- OPFS files changed or deleted: no.
- Dependencies installed or updated: no.
- Production/staging deployment changed: no.
- Feature flag added: no; existing default-off environment-gate pattern was documented.

### Verification summary

- `npm.cmd run test:regression`: PASS (414 frontend tests, 104 backend tests, typecheck, build and lint).
- `npm.cmd run test:backend:postgres:local`: PASS (22 tests).
- Direct unhosted E2E: invalid environment baseline, 128 connection-refused failures and 8 skips.
- Hosted production-preview E2E: FAIL (119 passed, 9 failed, 8 skipped).
- Gate decision: **NO-GO**; no later Gate started.

See `00_BASELINE.md` for commands, failure classification, database aggregate snapshot, backup/restore checklist, residual risks and prerequisites for a future GO decision.

## GATE 0-R — 2026-11-17

### Recovery work

- Reproduced and classified all nine original hosted E2E failures.
- Corrected deterministic selectors, stale time fixtures, queue-policy assertion,
  entitlement-verification race, and explicit invoice-mode selection in tests.
- Changed no Catalog runtime, schema, Sync, outbox, OPFS, dependency, or deployment behavior.
- Ran an isolated paired PostgreSQL/media dump and restore rehearsal successfully.
- Captured local synthetic Catalog baselines at 1k, 5k, 10k and 50k rows.
- Removed all synthetic rehearsal databases and temporary media/dump artifacts.

### Verification summary

- `npm.cmd run test:regression`: PASS (414 frontend, 104 backend, typecheck, build, lint).
- `npm.cmd run test:backend:postgres:local`: PASS (22 tests).
- Focused corrected E2E scenarios: PASS, including 8/8 repeated parallel counterparties runs.
- Final standard hosted E2E: FAIL (126 passed, 2 browser-process closures, 8 skipped).
- Gate decision: **NO-GO**; Gate 1 was not started.

See `00R_BASELINE_RECOVERY.md` for the complete evidence and blockers.

## GATE 0-S — 2026-11-17

### Stabilization work

- Set the evidence-backed Playwright development default to two workers while
  retaining an explicit positive-integer `E2E_WORKERS` override.
- Fixed entitlement external-store revision consumption and removed a redundant
  online transition that could reopen the verification gate.
- Made gated navigation, counterparty, invoice and scanner behavior consume the
  live verified access snapshot.
- Stabilized invoice history persistence/type selection and the theme preset
  measurement without adding retries, timeouts or skips.
- Added unit/component regression coverage for sync verification and entitlement
  re-rendering.

### Verification summary

- `npm.cmd run test:regression`: PASS (416 frontend, 104 backend, test
  typecheck, production build, lint).
- `npm.cmd run test:backend:postgres:local`: PASS (22 tests).
- Final hosted E2E: PASS (128 passed, 8 documented external-prerequisite skips,
  0 failed); at least three complete successful runs were recorded.
- Development Gate: **GO — DEVELOPMENT ONLY**.
- Production Release Gate: **NO-GO / NOT ASSESSED**; Gate 1 was not started.

See `00S_E2E_STABILIZATION.md` for worker pressure evidence, root-cause analysis,
full run history, skip prerequisites and remaining production blockers.
