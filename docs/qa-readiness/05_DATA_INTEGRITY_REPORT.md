# Gate 7-PREP — Data integrity report

## Auditor contract

`python -m app.qa.cli audit` independently checks the `qa-gate7` namespace. It does not trust counts alone. It verifies:

- exactly one owner store and one active owner membership per seeded owner;
- owner/store industry consistency;
- category and inventory store identity (no cross-tenant category reference);
- barcode uniqueness and reservation linkage;
- invoice/store linkage and line arithmetic;
- aggregate counts for users, stores, products, counterparties, invoices and barcodes.

Database constraints additionally enforce unique store/catalog inventory identity, store-scoped barcode reservations, invoice operation identity, positive invoice quantities, non-negative values and cross-store composite foreign keys.

## Automated evidence

The dedicated QA tests cover guard rejection, dry-run counts, transaction-backed seed, repeated idempotent seed, independent audit, rollback after a synthetic partial failure and three-store isolation.

Fresh local PostgreSQL evidence on 2026-11-19:

- target: dedicated loopback database `tanzim_qa_gate7`;
- schema: Alembic `20261118_0021`;
- pre-seed namespace counts: all zero;
- comprehensive dry-run: 3 stores, 4 users, 72 products, 6 counterparties, 6 invoices, 72 barcodes;
- first seed and immediate second seed: identical counts;
- independent auditor: `PASS`, no ownership, tenant, industry, barcode or invoice finding;
- real API login: `qa-gate7-auto-owner` resolved Store 2 on Free plan and returned seeded products, 2 invoices and 2 counterparties;
- an initial PostgreSQL seed exposed a missing client-generated invoice ID; the transaction rolled back to zero namespace rows before the deterministic-ID fix and successful rerun.

Media SHA-256, catalog release pointer and published-manifest checks remain covered by Gate 6 evidence. The core Gate 7 seed intentionally creates no fake publication license and no dangling media reference.

## Known limits

- The auditor does not claim physical media bytes exist when the seed stores no media reference.
- Negative corrupt-image/outbox scenarios are test fixtures, not part of the valid seed dataset.
- Safe cleanup is achieved by disposing the dedicated target, not by adding an unrestricted application-table delete command.
