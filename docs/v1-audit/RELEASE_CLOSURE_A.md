# V1 Release Closure A — Account Recovery, Legal UX & QA Compatibility

Date: 2026-11-19

Baseline: `test-v1-commercial-readiness-audit@3508180`

Development branch: `feat/v1-release-closure-a`

Schema head: `20261119_0022`

No merge, push, deployment, production mutation, feature-flag activation or binding legal publication was performed.

## Implemented boundaries

### Account recovery

- Added public `POST /api/auth/recovery/request` with the same `202` body for every accepted identifier.
- The service deliberately performs no User lookup because neither stored mobile nor optional email has verified ownership. It issues no OTP, reset link or credential.
- Identifier and direct peer source are canonicalized and HMAC-SHA256 hashed before persistence; raw identifiers, tokens and secrets are not stored or logged.
- PostgreSQL advisory transaction locks serialize concurrent requests. Central settings enforce 5 requests per identifier and 20 per source in 15 minutes; limited attempts are audited and return `429` with `Retry-After`.
- Migration `20261119_0022` adds only `password_recovery_events` and its rate-query indexes.
- The accessible recovery UI explains that no verified delivery channel is active. Existing passwords and sessions are never changed by a request.

Remaining dependency: product/security must approve an ownership-verifying provider and recovery identity contract. Only then may Tanzim add expiring single-use reset credentials, resend/verification throttles, atomic consumption and the established session-revocation policy. Expiry/replay/reset/lost-delivery/cross-account credential tests therefore remain BLOCKED rather than simulated.

### Legal onboarding

- Added public, keyboard/mobile usable `/legal/terms` and `/legal/privacy` status routes.
- Registration links reach both pages, and the old sentence that implied acceptance merely by signup was removed.
- Pages explicitly state that approved binding copy is absent. No invented clauses, policy version or consent timestamp were added.

Remaining dependency: named product/legal owners must supply approved copy, effective version/date, consent requirement and update-notification/withdrawal rules. Versioned consent remains BLOCKED until that approval exists.

### QA CORS & compatibility

- Cloned the synthetic Gate 6 restored database to `tanzim_qa_closure_a_compat` and used the preserved reference-media fixture.
- The disposable backend allowed only `http://127.0.0.1:4184`; credentials remained enabled and no wildcard origin was used.
- The extracted previous client read the published Catalog and protected image: desktop PASS, mobile emulation PASS.
- No production CORS default or deployment configuration changed.

### PWA update journey

The existing two-build browser test was rerun without redesign. Desktop and mobile both confirmed update notification, failed-asset non-promotion, deferred activation while a write lock is held, safe retry, old-tab continuity, and preservation of IndexedDB/OPFS/outbox bytes: 2 PASS.

## Verification evidence

| Gate | Result |
|---|---|
| Focused recovery/request diagnostics | 5 PASS |
| Frontend unit/component | 94 files / 425 PASS |
| Backend fast/API | 120 PASS |
| PostgreSQL migration/integration | 27 PASS |
| Typecheck | PASS |
| Build | PASS, 2,911 modules |
| Lint | PASS |
| Hosted E2E | 146 PASS / 10 prerequisite skips |
| Disposable live Authentication/Media/PWA/Sync | 10 PASS |
| Previous-client desktop/mobile | 2 PASS |
| PWA two-build desktop/mobile | 2 PASS |

The first live-fixture attempt produced 6 failures because the disposable database lacked the standard plan seed and system-admin bootstrap. Evidence showed Owner login succeeded but `/plans/current` failed and Admin was absent. After running the existing `seed_default_plans` and `ensure_system_admin` bootstrap, the unchanged 10 assertions passed. This was an environment-fixture correction, not a weakened test.

Build warnings remain non-blocking: Browserslist data age and the existing large `bwip-js` chunk.

## Remaining P1 blockers

1. Verified recovery provider and complete reset credential lifecycle.
2. Approved Terms/Privacy copy and consent/update contract.
3. Paid checkout, or an explicit non-paid V1 commercial scope.
4. Server restore commercial contract.
5. Used-Store industry migration if that capability is promised.
6. Production topology, backup/restore, monitoring and rollback ownership.
7. Physical mobile/scanner/printer/readability evidence.
8. Real catalog image rights and publication approval.

## Decision

- Development: **GO** for continued isolated development and QA on this branch.
- Field validation: **BLOCKED** on physical devices, approved legal/provider inputs and target operations.
- Commercial V1: **NO-GO**. Closure A reduces risk but does not authorize release, pilot, merge, push, deployment or production activation.
