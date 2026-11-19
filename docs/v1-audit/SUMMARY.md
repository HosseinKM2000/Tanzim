# V1 commercial readiness summary

Audit baseline: Gate 7 QA branch commit `9a2c458`, itself descended from `draft@88b9a19`. Work is isolated on `test-v1-commercial-readiness-audit`. No merge, push, deploy, production write, destructive migration or production flag activation is authorized or performed.

## Current product truth

- 76 source-verified capability records: 56 WORKING, 8 PARTIAL, 2 BLOCKED, 8 NOT_IMPLEMENTED and 2 NOT_VERIFIED.
- 88 executable acceptance cases classify 70 PASS and 18 BLOCKED. Closure A passed the fresh previous-client desktop/mobile check with an exact QA origin and disposable database clone.
- Core inventory, atomic invoices, Store/person authorization, durable sync/recovery, local backup, PWA update safety and guarded catalog infrastructure are implemented with meaningful automated evidence.
- Missing features are not represented as defects where they were never contracted: variants, proforma, partial returns/tax, invitations and similar requests remain explicit product decisions.

## QA data

- The existing deterministic Gate 7 seeder was extended rather than replaced.
- Comprehensive coverage now has 5 Stores / 6 users / 84 products / 8 counterparties / 8 invoices / 84 barcodes: empty Free, automotive Free, apparel Pro, distribution VIP Team and historical Pro.
- Invoice snapshots now have corresponding Store/product-consistent stock movements; the auditor checks movement delta integrity in addition to ownership, tenant, category, barcode and invoice invariants.
- Negative/fault fixtures remain separate from the valid comprehensive seed.
- A real PostgreSQL run exposed and fixed a legacy-fixture convergence defect: categories now reconcile by the database-unique Store/code identity. Two consecutive comprehensive seeds and the invariant audit passed without deleting existing data.

## Taxonomy blocker

- For a fresh/unused Store, isolated QA can set `TAXONOMY_ADOPTION_ENABLED=true`; the existing UI consumes backend state, removes the blanket warning and enables valid adoption without bypassing owner/version/category checks.
- Production default remains OFF.
- A used Store remains blocked by `LEGACY_STORE_REVIEW_REQUIRED`. The required migration contract is documented in `QA_BLOCKERS.md`; no bypass was added.

## Release gaps

- P0: 0 evidenced.
- P1: 8 — recovery provider/reset completion and approved legal consent remain partial; paid checkout, server restore contract, used-Store migration decision, production operations, physical barcode/mobile evidence and image rights remain blocked.
- P2: 6 — OTP decision, deletion, accessibility, PDF/cross-engine, multi-store scope and catalog activation boundary.
- P3: 4 grouped optional/polish areas.

## Decision

- Development QA: GO for continued isolated development. Closure A regression, live prerequisites, previous-client compatibility and two-build PWA activation are green; this is not a production authorization.
- Field QA: BLOCKED; no physical device/peripheral evidence is available.
- Commercial V1: NO-GO. The smallest critical path is: recovery + legal contract; commercial scope/payment decision; physical device/barcode pass; image-rights decision; target backup/restore/monitoring/rollback ownership; then a release-candidate regression rerun.
