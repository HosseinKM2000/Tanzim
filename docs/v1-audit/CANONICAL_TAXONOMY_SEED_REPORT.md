# Canonical Taxonomy Seed V1

Date: 2026-11-20

Baseline: `feat/v1-release-closure-a@d9c9e34`

Development branch: `feat/canonical-taxonomy-seed-v1`

Environment boundary: development/isolated QA only. No production database, Store, feature flag, merge, push, or deployment was changed.

## Source and approval boundary

- Authoritative source: `backend/app/reference_data/tanzim_sector_categories_v1.json` (`scb-2026-11-14-v1`).
- Canonical JSON identity: SHA-256 `0d17e1d33d5370c52abd2191e03dbcc2b9bf9efa9fa952a2a77375e3c239c2cc` (independent of whitespace/key ordering).
- The source contains 24 sectors and 281 parent categories.
- Approved: 25 Automotive parents in sector `01` only.
- Proposed/DRAFT: 256 parents in sectors `02..24`; they remain excluded from customer adoption APIs and are not activated for Stores.
- Sector labels are source-approved; that does not approve proposed categories for customer use.

## Implementation

- Added an idempotent, deterministic canonical seeder that validates declared version/counts and fails closed on identity/content conflicts.
- Alembic `20261120_0023` records taxonomy version, source hash, sector count, and approved/proposed counts without rewriting existing taxonomy or Store data.
- The existing `qa-gate7-auto` Store now maps to «قطعات، لوازم و تجهیزات خودرو», receives exactly the 25 immutable system parents, and generates Tanzim internal barcodes from stable sector/category codes.
- Other QA Stores retain their existing synthetic industries/categories. Existing Store industries and historical invoices/products are not migrated or rewritten.
- External/manual barcodes remain byte-for-byte unchanged; existing recategorization and retired-code contracts are reused.

## Isolated database evidence

| Check | Result |
|---|---|
| Initial canonical seed | PASS: 24 sectors / 281 parents / 25 approved / 256 proposed |
| Second seed | PASS: no duplicate sector/category/seed identity row |
| QA Automotive Store | PASS: sector `01`, taxonomy `scb-2026-11-14-v1` |
| Automotive Store categories | PASS: exactly codes `01..25`, `origin=system`, immutable |
| QA Automotive products | PASS: 18 products linked to canonical categories |
| Internal barcode generation | PASS: 18 active `source=tanzim` barcodes; category namespace retained |
| Missing category after adoption | PASS: rejected by existing API contract |
| Manual barcode preservation | PASS: exact whitespace/leading content retained by lifecycle test |
| Recategorization | PASS: internal code replaced/retired; external code preserved |
| Cross-Store / offline-sync behavior | PASS through existing taxonomy lifecycle and full regressions |

The API/UI data path returns all 25 Automotive parents and the existing category picker consumes that path. Automated backend and frontend suites pass; a retained hosted-browser screenshot/manual observation was not produced in this task, so visual confirmation is **BLOCKED/manual**, not claimed as field evidence.

## Other sectors

Sectors `02..24` and their 256 proposed categories remain stored as reference DRAFT data only. The server continues filtering customer-visible reference categories by `approval_status=approved`; no proposal was promoted merely to meet a count.

## Verification

- Focused taxonomy + QA seeder: 7 PASS.
- Backend regression: 121 PASS.
- PostgreSQL/Alembic regression: 27 PASS; HEAD `20261120_0023`.
- Frontend unit/component: 94 files / 425 PASS.
- Typecheck: PASS.
- Production build: PASS, 2,911 modules; existing Browserslist/chunk-size warnings only.
- Lint: PASS.

## Remaining blockers

- Human/browser visual confirmation of all 25 choices in the deployed QA UI.
- Final approval of all 256 proposed parents before any non-Automotive automatic activation.
- Physical barcode print/scan/readability evidence remains outside this implementation run.

Development result: **GO** for isolated QA use of the Automotive Store. Production/public activation: **NO-GO** without the separate approvals and field evidence above.
