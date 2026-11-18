# GATE 0-S — E2E stabilization and safe development readiness

**Development Gate: GO — DEVELOPMENT ONLY**

**Production Release Gate: NO-GO / NOT ASSESSED**

**Captured:** 2026-11-17, Asia/Tehran

**Branch:** `feat/catalog-safe-rollout`

**Starting commit:** `73af4cffd104ef06d21373bfec54442e66bc9f98`

Gate 0-S stabilized the existing Playwright baseline. It did not start Gate 1,
add Catalog behavior, change a database or Dexie schema, change Sync/outbox/OPFS
contracts, deploy an environment, or alter the Gate 0-R recovery hashes and
benchmarks.

## Decision

The repository is ready for continued development on a separate, explicitly
authorized gate: **GO — DEVELOPMENT ONLY**. The standard local E2E target now
uses two workers and completed at least three full successful runs with no test
failure. This is not a production release decision. The externally integrated
journeys remain skipped without their explicit prerequisites, and the production
topology, target devices, publication policy and operational controls listed in
Gate 0-R remain unverified. Gate 1 must not start without a new instruction.

## Environment and worker evidence

Measurements were made on the current Windows host (16 logical CPUs, 15.4 GiB
RAM), Playwright 1.62.1 and Chromium 151. Five historically unstable scenarios
were run in both configured browser projects with `--repeat-each=2` (20 tests per
worker setting).

| Workers | Result | Duration | Peak headless processes | Peak working set | Minimum available RAM |
|---:|---:|---:|---:|---:|---:|
| 1 | 20/20 passed | 1.2 min | 5 | 710.3 MB | 4.70 GB |
| 2 | 20/20 passed | 56.1 s | 9 | 1,499.7 MB | 3.81 GB |
| 4 | 19/20 passed | — | 19 | 3,200.6 MB | 2.14 GB |
| 8 | 20/20 passed (one sample) | 47.8 s | 30 | 4,194.6 MB | 1.92 GB |

The four-worker failure was a `browser.newContext` closure. Windows Error
Reporting contained no corresponding application crash. The measurements do
not prove absolute RAM exhaustion, but they do show sharply increasing process
and memory pressure. A single eight-worker pass is not evidence that eight is a
safe default. Two workers is the fastest repeatedly stable setting supported by
the collected evidence, so `playwright.config.ts` now defaults to two and allows
a positive integer `E2E_WORKERS` override for deliberate experiments.

No retry was added, no timeout was increased, and no test was skipped to obtain
the result. The existing CI retry policy is unchanged.

## Root causes and corrections

The first complete two-worker run exposed three deterministic failures in
invoice history, mobile counterparties and mobile scanner flows. Traces showed
that entitlement requests completed and the verified snapshot was saved, while
the production-compiled React tree continued rendering the pre-verification
result. React Compiler had memoized `accessState.evaluate()` because the
external-store revision returned by the hook was not consumed.

Corrections:

- `useEntitlementAccess` now passes and returns the external-store revision, and
  gated components explicitly consume the resulting access snapshot.
- Navigation, counterparties, invoices and scanner actions deny access while
  online verification is pending; administrator bypass behavior remains scoped
  to the existing administrator rules.
- The sync listener no longer calls `markOnline()` redundantly immediately
  before `verify()`, preventing a second transient verification gate.
- Invoice history reloads after entitlement verification, its output actions
  consume the live snapshot, and the E2E fixture waits for server invoices to be
  persisted in IndexedDB before reloading.
- Invoice type is derived from the verified allowed capabilities until the user
  explicitly selects an allowed type, removing the sale/purchase initialization
  race without a state-setting effect.
- The theme size test now sets and verifies each requested display preset after
  reload and measures the explicit password-visibility control. Previously its
  init scripts accumulated in an unspecified order and a transient PWA toast's
  close button could be mistaken for the control under test.

Unit and component regressions cover the sync-listener transition and React
entitlement re-render respectively.

## Verification evidence

| Command / scope | Result |
|---|---|
| `npm.cmd run test:regression` | PASS: 92 Vitest files / 416 tests; test typecheck; 104 backend tests; production build; lint |
| `npm.cmd run test:backend:postgres:local` | PASS: 22 tests |
| Entitlement-focused E2E, both projects, workers 2 | PASS: 30/30 |
| Invoice history, both projects, repeat 5, workers 2 | PASS: 10/10 |
| Hardware scan, both projects, repeat 5, workers 2 | PASS: 10/10 |
| Theme display preset, both projects, repeat 10, workers 2 | PASS: 20/20 |
| Full hosted E2E successful run 1 | PASS: 128 passed, 8 skipped, 0 failed (3.9 min) |
| Full hosted E2E successful run 2 | PASS: 128 passed, 8 skipped, 0 failed (4.1 min) |
| Full hosted E2E successful run 3 | PASS: 128 passed, 8 skipped, 0 failed (3.6 min) |
| Final full hosted E2E after all corrections | PASS: 128 passed, 8 skipped, 0 failed (3.7 min) |

Two informative full runs did not count toward the successful-run requirement.
One found the invoice-type initialization race (127 passed, 1 failed, 8
skipped); a later extra run found the theme selector/init-script race with the
same totals. Both root causes were corrected and their scenarios passed repeated
focused runs before the final complete pass.

## Eight skips and prerequisites

Four scenarios are skipped once in each browser project, producing eight skips:

| Scenario | Required prerequisite |
|---|---|
| Authenticated browser journey | `E2E_USERNAME` and `E2E_PASSWORD` for an isolated test user |
| Live media recovery | `E2E_REAL_API_URL` pointing to a disposable live backend |
| Real two-build PWA update | `E2E_PWA_BUILD_A` and `E2E_PWA_BUILD_B` containing two prepared builds |
| Live operation resolution | `E2E_REAL_API_URL` pointing to a disposable live backend |

These are external/integration release checks, not silently passing coverage.
They must be executed with controlled disposable prerequisites before a
Production Release Gate can be considered.

## Remaining production blockers

Gate 0-R's preserved evidence still applies: durable media topology and proxy
behavior, TLS/compression/cache policy, production capacity and monitoring,
retention and RPO/RTO, reference-image publication rights, target-device
behavior, and safe large-Catalog pagination/image budgets are not verified.

**Explicit result: GO — DEVELOPMENT ONLY. Production Release Gate remains
NO-GO / NOT ASSESSED. Gate 1 was not started.**
