# V1 release checklist

Statuses are evidence-bound: PASS is local/disposable evidence at this commit, BLOCKED requires external/product work, and NO-GO prevents commercial release. This checklist does not authorize merge, push, deployment, flag activation or pilot.

## Account and onboarding

- [x] Signup transaction creates user, Store, owner membership and session atomically.
- [x] Login/logout/session revocation and password change have automated coverage.
- [ ] **P1:** password recovery contract and implementation.
- [ ] Decide and implement OTP/mobile verification if required by V1 promise.
- [ ] **P1:** publish reachable terms/privacy and decide versioned consent.
- [ ] Define account deletion/retention/export contract.
- [x] Fresh-Store taxonomy adoption works only behind isolated QA flag.
- [x] Used-Store taxonomy change remains safely blocked.
- [ ] Approve and test used-Store migration contract if V1 advertises change.

## Inventory, barcode and sales

- [x] Product/category/label CRUD, capacity, duplicate and cross-Store guards covered.
- [x] Solo offline and Team online-authoritative paths covered.
- [x] Bulk edit/delete, XLSX import and image lifecycle covered in automation.
- [x] Barcode reservation, lifecycle, software encode/render/decode covered.
- [ ] **P1:** physical camera/HID scanner/printer/readability matrix.
- [x] Purchase/sale/cancel atomicity, totals, stock effects and idempotency covered.
- [x] Invoice history and permission redaction covered.
- [ ] Validate Persian PDF/print/share on physical target devices.
- [ ] Explicitly defer or implement proforma/returns/tax/payment scope.

## Offline, sync, backup and PWA

- [x] Actor+Store partitioning and acceptance-time authorization covered.
- [x] Lost response, conflict, rejection and non-retrying recovery evidence covered.
- [x] Local backup envelope, authority exclusion, checkpoint and interruption covered.
- [ ] **P1:** decide server-restore vs local-backup-only commercial contract.
- [x] PWA install/update safety has real Chromium two-build evidence.
- [ ] Physical Android/iPhone install/offline/update/storage-pressure/process-kill run.
- [ ] Real-backend concurrent large catalog download + stock sync performance run on target resources.

## Teams and subscriptions

- [x] Personnel/role mutation remains owner-only and online-only.
- [x] Unknown permissions deny and personnel entitlement lease expires.
- [x] Free/Pro/VIP capability/capacity enforcement is centralized.
- [ ] Approve final prices, terms, tier allocations, expiry/grace and retention.
- [ ] **P1 for paid launch:** provider checkout/callback/idempotency/refund/reconciliation.
- [ ] Decide whether owner-created personnel credentials are acceptable without invitations.

## Catalog and media

- [x] Adoption, cursor browsing, release manifest/hash, rollback and old-client automation exists.
- [x] Offline family cache is account/Store scoped and interruption-tested in browser automation.
- [x] All four production catalog flags remain OFF by default.
- [ ] **P1:** attach real image source/license/restriction/approver evidence.
- [ ] Complete field/mobile storage-pressure and incremental-update run.
- [ ] Obtain separate authorization before any production flag activation/publication.

## UI, accessibility and browser support

- [x] Desktop/mobile Chromium responsive RTL and theme automation exists.
- [ ] Full keyboard focus/dialog/navigation audit.
- [ ] NVDA/VoiceOver and validation/toast/live-region audit.
- [ ] 200% zoom, forced colors, reduced motion and contrast audit.
- [ ] WebKit/iPhone and supported Android browser matrix.
- [ ] Replace broad `transition-all` and confirm every `outline-none` has visible focus replacement.

## Operations and legal

- [ ] **P1:** production TLS/proxy/CORS/persistent private+reference media verified.
- [ ] **P1:** coordinated PostgreSQL/media backup restore rehearsed on target-like infrastructure.
- [ ] **P1:** monitoring, alerting, disk/capacity, incident and rollback owners assigned.
- [ ] CI/release artifact identity and immutable old-asset retention confirmed.
- [ ] Support escalation and safe diagnostics handling owned operationally.
- [ ] Legal/privacy/terms/image-rights approvals recorded by named owners.

## Automated release gates

- [x] Frontend unit/component regression: 94 files / 425 tests passed.
- [x] Backend fast/API regression: 117 tests passed.
- [x] PostgreSQL integration and Alembic head: 26 tests passed.
- [x] Typecheck passed.
- [x] Production build passed (2,903 modules; non-blocking Browserslist/chunk-size warnings recorded).
- [x] Lint passed.
- [x] Hosted E2E: 144 passed / 10 prerequisite skips; disposable live prerequisites: 8 passed.
- [ ] Previous-client live prerequisite: **BLOCKED** (2 desktop/mobile cases) because preserved Gate 6 API CORS excludes disposable audit origins; no guard was bypassed.
- [x] QA seeder focused regression: 4 tests passed after extension.
- [x] Comprehensive PostgreSQL seed executed twice and invariant audit passed without reset/deletion.

## Decision

- Internal development/QA audit: **CONDITIONAL**; regression is green, previous-client live evidence remains environment-blocked.
- Field validation: **BLOCKED** on physical devices/peripherals.
- Commercial V1: **NO-GO** until all mandatory P1 items above are closed or explicitly removed from the marketed contract by authorized product/legal owners.
