# QA data coverage

The existing Gate 7 seeder is extended, not replaced. Namespace ownership remains `qa-gate7`; safety requires an explicit QA environment, loopback database host, allowlisted database name, matching confirmation phrase, and QA-named media roots.

| Profile | Stores/users | Products | State coverage | Intended use |
|---|---:|---:|---|---|
| `smoke` | 1/1 | 8 | Free owner, categories, labels, stock boundaries, two counterparties, purchase/sale, barcodes | quick core checks |
| `comprehensive` | 5/6 | 84 | empty Free Store; automotive Free; apparel Pro; distribution VIP Team owner/operator; historical Pro; 8 invoices/counterparties; 84 barcodes | full manual/automated exploration |
| `automotive` | 1/1 | 125 | isolated VIP Automotive Store: 25 canonical sector-01 categories, internal and preserved manual barcodes, 25 synthetic images, 10 counterparties, 20 posted purchase/sale invoices with movements and 20 activity records | automotive QA walkthrough (see `AUTOMOTIVE_QA_MIGRATION.md`) |
| `stress` | 1/1 | 1k/5k/10k | isolated VIP data; opt-in only | performance/storage checks |

Comprehensive now includes coherent invoice lines and matching inventory movements. The independent auditor checks owner membership, Store/industry consistency, cross-tenant categories, barcode reservation/uniqueness, invoice arithmetic/store boundary and movement product/store/delta integrity. Seed execution is transactional and repeat-idempotent; a forced mid-profile exception rolls back.

Actual PostgreSQL evidence: the comprehensive seed ran twice against allowlisted loopback database `tanzim_qa_gate7` and both runs reported 5 Stores / 6 users / 84 inventory products / 8 counterparties / 8 invoices / 84 barcodes. The audit returned PASS. Its 156 catalog-definition count includes 72 synthetic definitions retained from the earlier three-Store fixture revision; they were deliberately not reset or deleted. The rerun reconciled the active 84-product fixture by stable Store/code identity.

Covered variation:

- Free/Pro/VIP, Solo/Team, owner/operator and an empty new Store.
- Automotive, apparel/footwear, distribution/warehouse and historical Store labels/categories.
- zero/low/normal stock, long Persian label, packaged items, hidden items and inactive private catalog definitions.
- old/recent purchase and sale invoice snapshots with line totals and movements.
- stable fake accounts, deterministic phones/barcodes and no customer data.

Separate evidence, intentionally not injected into a valid comprehensive seed:

- rejected/conflicted/unknown outbox states use browser/unit fault harnesses;
- invalid fields and duplicate operations are acceptance inputs, not persisted corrupt rows;
- catalog releases/reference media remain the isolated Gate 6 fixtures under `.gate6-runtime` and are not silently copied into PostgreSQL seed ownership;
- loading/error states use API/browser fault injection.

Remaining data gaps:

| Gap | Status | Reason / next action |
|---|---|---|
| Real licensed catalog media | BLOCKED | synthetic assets only; rights evidence absent |
| Two catalog releases in the same fresh QA seed command | PARTIAL | Gate 6 isolated fixture proves releases; integrate only after media-root ownership contract is approved |
| Cancelled invoice and expiry/grace commercial fixtures | PARTIAL | domain supported for cancellation, commercial policy not approved |
| Physical storage pressure/camera/printer data | BLOCKED | device execution required |
| Account recovery/OTP states | BLOCKED | features not implemented |

Commands are documented in `docs/qa-readiness/04_QA_EXECUTION_RUNBOOK.md`. Do not run against a non-allowlisted database or media root.
