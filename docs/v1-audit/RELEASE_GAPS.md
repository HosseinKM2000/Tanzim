# Verified V1 release gaps

No reproducible P0 defect was found in this audit. That means **no P0 is currently evidenced**, not that production risk is zero. Production remains NO-GO because several P1 acceptance boundaries are absent or externally blocked.

## P1 — fix or close before commercial V1

| ID | Evidence | User impact | Minimal fix | Required acceptance tests | V1 mandatory? | Recommendation |
|---|---|---|---|---|---|---|
| GAP-P1-01 | `backend/app/routers/auth.py:55-212` exposes signup/login/me/profile/password/industry/logout but no recovery route | Owner who forgets credentials can permanently lose operational access | Product-approved recovery identity; expiring single-use tokens/OTP; enumeration/rate-limit/audit controls | request/resend/expiry/reuse/lockout/account-enumeration/session invalidation | yes | FIX BEFORE V1 |
| GAP-P1-02 | `src/features/auth/components/Register.tsx:45` asserts acceptance while `src/features/auth/components/AuthPageShell.tsx:72-75` renders plain text only | User cannot review binding terms/privacy; consent is not versioned | Publish legal pages/links and decide whether explicit versioned consent is required | link reachability, offline behavior, version change, accessibility | yes | FIX BEFORE V1 |
| GAP-P1-03 | `backend/app/routers/plans.py:23-27` always returns `checkout_available=False` / `PAYMENT_PROVIDER_NOT_CONFIGURED` | No paid conversion, renewal, refund or reconciliation | Keep public paid launch disabled or implement reviewed provider boundary from immutable offer snapshot | callback signature, idempotency, amount/currency, retry, refund, reconciliation, expiry | yes for paid launch | FIX BEFORE PAID V1 |
| GAP-P1-04 | `backend/app/routers/backup.py:33-47` intentionally returns 501 for server restore | Browser/device loss cannot be recovered through product server restore | Either contractually scope V1 to local backups with prominent warnings and operator restore, or implement versioned server backup/restore | paired DB/media restore, tenant isolation, authority exclusion, interruption, audit | yes | PRODUCT DECISION then FIX |
| GAP-P1-05 | `backend/app/services/taxonomy_service.py:62-99,159` inventories legacy evidence and blocks used Store adoption | Existing merchants cannot safely change industry | Approve migration contract covering invoices, stock, categories, barcodes, catalog links, offline commands and rollback; keep current guard | dry-run, concurrent writes, rollback, old client, every evidence class | if change is promised | SHIP BLOCKED PATH; DO NOT BYPASS |
| GAP-P1-06 | `docs/catalog-rollout/06_PRODUCTION_READINESS_CLOSURE.md` records target topology/ops as BLOCKED | Restore, TLS, persistent media, monitoring and incident response are unproven | Assign owners and execute target-like checklist with retained evidence | deploy-free preflight, paired restore, monitoring alerts, rollback rehearsal | yes | FIX BEFORE V1 |
| GAP-P1-07 | `docs/catalog-rollout/05_FIELD_VALIDATION_AND_RELEASE_READINESS.md` and Gate 6 leave physical mobile/scanner/printer checks blocked | Core barcode/PWA behavior may fail on target hardware | Run the operator matrix on low-end Android, mid-range Android and iPhone plus supported printer/scanner | install/offline/update/storage/permission/print/scan/readability | yes for barcode claim | FIX BEFORE V1 |
| GAP-P1-08 | `backend/app/models.py:600-654` requires rights metadata/approval, while Gate 5/6 has no real licensed asset evidence | Reference images cannot be lawfully published | Name rights owner and attach source, license, restrictions and approval evidence per asset/release | unauthorized publish denial; revocation/rollback; audit trail | yes for catalog images | FIX BEFORE PUBLICATION |

## P2 — important, may be deferred only with explicit scope

| ID | Evidence / impact | Minimal fix and acceptance | Recommendation |
|---|---|---|---|
| GAP-P2-01 | OTP/mobile verification is absent; signup stores an unverified number (`Register.tsx:55-58`, no OTP routes). Recovery/security promises must not imply verification. | Decide whether V1 needs verified mobile. If yes, implement separately from password recovery and test resend/expiry/rate-limit. | PRODUCT DECISION |
| GAP-P2-02 | Account deletion is absent from auth routes/models. | Define retention, invoice/legal preservation and delayed deletion; add owner-only reauthentication tests. | FIX or disclose before V1 |
| GAP-P2-03 | Full WCAG/keyboard/screen-reader evidence is absent; static review found `transition-all` at `src/features/app/layout/nav-menu.tsx:24-32` and focus dependence at `quick-access-page.tsx:48`. | Run axe/manual NVDA/VoiceOver/keyboard/200% zoom; replace broad transitions and confirm focus replacement. | FIX/VERIFY |
| GAP-P2-04 | PDF is Chromium-rasterized and not tagged/selectable; other engines/native share/print unverified. | State V1 boundary or implement accessible document output; field-test Persian multi-page/cancelled invoices. | DEFER only if disclosed |
| GAP-P2-05 | No explicit multi-store workspace selector; active membership is server-derived. | Keep one-store-per-account V1 scope explicit or add server-bound selection without trusting client store IDs. | PRODUCT DECISION |
| GAP-P2-06 | Catalog flags remain off in `backend/app/config.py:52-72`. | Enable only after field/license/operations gates; keep independent rollback flags. | SHIP core without catalog, or close blockers |

## P3 — polish / optional

- True `.xlsx` export and tagged/selectable PDF rather than compatibility `.xls`/browser-raster output.
- URL persistence for all filter/view state and broader reduced-motion refinement.
- Invitation-based personnel onboarding; current owner-created credential workflow remains usable but less ergonomic.
- Variants, proforma, partial returns, tax reporting and realized-profit presentation are new-feature requests, not defects in the current contract. Recommend **DEFER** unless commercial scope explicitly requires them.

## Reproducible NO-GO scenarios

1. Forgotten-password: register, log out, lose password; there is no route or UI to recover access (`GAP-P1-01`).
2. Paid conversion: request any plan offer; response explicitly reports payment provider not configured (`GAP-P1-03`).
3. Server restore: call `POST /api/backup/restore` as authorized owner; response is intentional HTTP 501 (`GAP-P1-04`).
4. Used-store industry change: add historical inventory/invoice/barcode evidence then adopt another sector; service returns `LEGACY_STORE_REVIEW_REQUIRED` and must continue doing so until contract approval (`GAP-P1-05`).

Decision: **NO-GO for public commercial V1**. A closed internal QA candidate remains appropriate; an unpaid/limited pilot still needs separate authorization and the relevant P1 boundaries explicitly scoped.
