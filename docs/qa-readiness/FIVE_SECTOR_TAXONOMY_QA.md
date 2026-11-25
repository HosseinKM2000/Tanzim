# Five-Sector Taxonomy QA

Date: 2026-11-25

Branch: `feat/canonical-taxonomy-all-sectors-v1`

Dataset: `scb-2026-11-20-v2-proposed-qa`

Status: **PASS for isolated development QA; MANUAL PENDING for browser visual journeys**

This fixture is intentionally restricted to a disposable local PostgreSQL database. It does not
approve or publish the 337 proposed categories, migrate an existing store, change entitlements,
or modify the production/default taxonomy. The official `scb-2026-11-14-v1` source remains
unchanged.

## Runtime boundary

| Item | Value | Result |
|---|---|---|
| Frontend | `http://localhost:5173/login` | PASS: Vite responds and its served client targets port 8021 |
| API | `http://127.0.0.1:8021/api` | PASS: health reports PostgreSQL connected and schema `20261120_0023` |
| Database | `tanzim_qa_taxonomy_v2` on loopback port 55432 | PASS: dedicated container and Volume |
| Private media | `.qa-taxonomy-runtime/media-qa-taxonomy-v2` | PASS: QA-only root |
| Reference media | `.qa-taxonomy-runtime/reference-qa-taxonomy-v2` | PASS: separate QA-only root |
| Snapshot | `.qa-taxonomy-runtime/tanzim_qa_taxonomy_v2_20261125.dump` | PASS: custom-format dump and readable restore list |
| Proposed taxonomy gate | QA-only override + explicit flag | PASS; startup fails closed outside QA/test |

## Accounts and seeded data

All accounts use independent random passwords stored only in the gitignored private handoff file.
Every account is an Owner on a separate VIP test store.

| Sector | Username | Categories | Products | Counterparties | Invoices | Barcodes | Login |
|---|---|---:|---:|---:|---:|---:|---|
| 01 — قطعات، لوازم و تجهیزات خودرو | `qa-gate7-tax-auto-owner` | 25 | 48 | 10 | 20 | 48 | PASS |
| 11 — پوشاک، کیف، کفش و محصولات چرمی | `qa-gate7-tax-apparel-owner` | 15 | 48 | 10 | 20 | 48 | PASS |
| 07 — موبایل و لوازم جانبی | `qa-gate7-tax-electronics-owner` | 17 | 48 | 10 | 20 | 48 | PASS |
| 14 — مواد غذایی و محصولات سوپرمارکتی | `qa-gate7-tax-food-owner` | 17 | 48 | 10 | 20 | 48 | PASS |
| 02 — ابزارآلات و تجهیزات صنعتی | `qa-gate7-tax-tools-owner` | 22 | 48 | 10 | 20 | 48 | PASS |
| **Total** | **5 users / 5 stores** | **96 store categories** | **240** | **50** | **100** | **240** | **5/5 PASS** |

Each store contains zero, low and normal inventory; varied purchase/sale prices; three labels;
synthetic images; 36 Tanzim-issued and 12 manufacturer/manual barcodes; five suppliers and five
customers; and ten purchase plus ten sale invoices. Invoice lines use distinct products and every
movement ends at the product's seeded current quantity.

## Executed verification

| Check | Result | Evidence |
|---|---|---|
| Migration from empty PostgreSQL | PASS | Alembic reached `20261120_0023` |
| v1 reference reset boundary | PASS | only fresh QA reference rows removed; no adopted store existed |
| First five-sector seed | PASS | 5 stores, 5 users, 240 products, 50 counterparties, 100 invoices, 240 barcodes |
| Second seed / idempotency | PASS | identical counts; no duplicate |
| QA auditor | PASS | ownership, tenant, industry, barcode, invoice and movement invariants |
| Real API login | PASS | all five account logins and `/auth/me` succeeded |
| Industry/category projection | PASS | each store returned only its official sector and expected category count |
| Product and invoice projection | PASS | each store returned 48 products and 20 invoices |
| Cross-store read | PASS | automotive token reading an apparel product returned 404 |
| Permanent QA admin login | PASS | configured system administrator authenticated on this isolated database |
| Frontend-to-API CORS | PASS | exact `http://localhost:5173` origin accepted; no wildcard |
| Category Picker / create / search / reload visual journey | MANUAL PENDING | browser automation was not used; API and focused regression cover contracts |

## Test suites

| Suite | Result |
|---|---|
| Focused taxonomy, QA seeder and barcode lifecycle | 19 PASS |
| Frontend unit/component | 94 files / 425 PASS |
| Backend fast/API | 133 PASS |
| PostgreSQL integration on isolated `tanzim_test` | 27 PASS |
| Typecheck | PASS |
| Production build | PASS, 2,911 modules |
| Lint | PASS |

The build retained the existing non-blocking Browserslist-age and large-chunk warnings. No test
was skipped, removed or weakened for this change.

The detailed login URL, usernames and copyable passwords are in:
`docs/qa-readiness/.qa-accounts-login.local.md` (gitignored, local only).

## Remaining boundaries

- Sectors 02–24 remain `proposed`; only the existing 25 automotive categories are approved.
- Product-owner review is still required for ambiguous titles and cross-sector overlaps recorded
  in `docs/taxonomy/TAXONOMY_COVERAGE_AUDIT.md`.
- Visual keyboard/mobile behavior, Category Picker presentation and scanner interaction remain
  manual checks. API success is not reported as visual UI evidence.
- No merge, push, deploy, production mutation, old-store migration, historical barcode rewrite,
  entitlement bypass or public feature activation was performed.
